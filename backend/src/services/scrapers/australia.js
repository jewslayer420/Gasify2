// Australia fuel prices — WA FuelWatch + NSW FuelCheck (bulk) + TAS FuelCheck (grid)
//
// WA FuelWatch JSON API (public, no key):
//   GET https://www.fuelwatch.wa.gov.au/api/sites?fuelType=<code>
//
// NSW FuelCheck bulk API (public, no key needed):
//   GET https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices
//   Returns all ~3300 NSW stations + prices in one shot
//
// TAS FuelCheck — uses NSW API key with bylocation grid over Tasmania
//   Requires NSW_FUELCHECK_API_KEY registered for TAS access at api.nsw.gov.au
//   env: NSW_FUELCHECK_API_KEY

const AUD_EUR = 0.59; // 1 AUD ≈ 0.59 EUR

const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

// ── WA FuelWatch ────────────────────────────────────────────────────────────
const WA_PRODUCTS = [
  { code: 'ULP', fuelType: 'sp95' },
  { code: 'DSL', fuelType: 'diesel' },
  { code: 'BDL', fuelType: 'diesel_premium' },
  { code: 'LPG', fuelType: 'lpg' },
  { code: '98R', fuelType: 'sp98' },
];

function centsToEur(cents) {
  const n = parseFloat(cents);
  if (isNaN(n) || n <= 0) return null;
  const eur = +((n / 100) * AUD_EUR).toFixed(3);
  return eur > 0 && eur < 6 ? eur : null;
}

async function fetchWAStations() {
  const stationMap = new Map();

  for (const { code, fuelType } of WA_PRODUCTS) {
    try {
      const r = await fetch(`https://www.fuelwatch.wa.gov.au/api/sites?fuelType=${code}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) continue;
      const items = await r.json();
      if (!Array.isArray(items)) continue;

      for (const s of items) {
        if (!s.product?.priceToday || s.product?.isOutOfSupply) continue;
        const price = centsToEur(s.product.priceToday);
        if (!price) continue;
        const lat = s.address?.latitude;
        const lng = s.address?.longitude;
        if (!lat || !lng) continue;

        if (!stationMap.has(s.id)) {
          stationMap.set(s.id, {
            externalId: `AU-WA-${s.id}`,
            name: s.siteName || `Station ${s.id}`,
            brand: s.brandName || null,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            address: s.address?.line1 || null,
            city: s.address?.location || '',
            country: 'AU',
            prices: [],
          });
        }
        const station = stationMap.get(s.id);
        if (!station.prices.find(p => p.fuelType === fuelType)) {
          station.prices.push({ fuelType, price });
        }
      }
    } catch (err) {
      console.error(`[australia] WA ${code} error:`, err.message);
    }
  }

  const stations = [...stationMap.values()].filter(s => s.prices.length > 0);
  console.log(`[australia] WA: ${stations.length} stations`);
  return stations;
}

// ── NSW FuelCheck (bulk endpoint — no auth) ──────────────────────────────────
function mapNSWFuelType(code) {
  switch ((code || '').toUpperCase()) {
    case 'E10': return 'e10';
    case 'U91': return 'sp95';
    case 'P95': return 'sp95';
    case 'P98': return 'sp98';
    case 'DL':  return 'diesel';
    case 'PDL': return 'diesel_premium';
    case 'LPG': return 'lpg';
    case 'B20': return 'diesel';
    default:    return null;
  }
}

function nowTimestamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseAUSuburb(address, state) {
  if (!address) return '';
  const m = address.match(/,\s*([^,]+?)\s+(NSW|TAS|VIC|QLD|SA|WA|NT|ACT)\s+\d{4}/i);
  return m ? m[1].trim() : '';
}

async function fetchNSWStations() {
  let data;
  try {
    const r = await fetch('https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices', {
      headers: { 'Content-Type': 'application/json', requesttimestamp: nowTimestamp(), 'User-Agent': UA },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`NSW bulk API ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error('[australia] NSW bulk error:', err.message);
    return [];
  }

  // Build station lookup: code → station metadata
  const stationMeta = new Map();
  for (const s of (data.stations || [])) {
    if (!s.code || !s.location?.latitude) continue;
    stationMeta.set(s.code, s);
  }

  // Group prices by station code
  const pricesByCode = new Map();
  for (const p of (data.prices || [])) {
    const ft = mapNSWFuelType(p.fueltype);
    if (!ft) continue;
    const price = centsToEur(p.price);
    if (!price) continue;
    if (!pricesByCode.has(p.stationcode)) pricesByCode.set(p.stationcode, []);
    const list = pricesByCode.get(p.stationcode);
    if (!list.find(x => x.fuelType === ft)) list.push({ fuelType: ft, price });
  }

  const stations = [];
  for (const [code, s] of stationMeta) {
    const prices = pricesByCode.get(code);
    if (!prices || !prices.length) continue;
    stations.push({
      externalId: `AU-NSW-${code}`,
      name: s.name || `Station ${code}`,
      brand: s.brand || null,
      lat: s.location.latitude,
      lng: s.location.longitude,
      address: s.address || null,
      city: parseAUSuburb(s.address, 'NSW'),
      country: 'AU',
      prices,
    });
  }

  console.log(`[australia] NSW: ${stations.length} stations`);
  return stations;
}

// ── TAS FuelCheck (grid scan via NSW API key) ─────────────────────────────────
// Tasmania is on the NSW FuelCheck platform. The bylocation endpoint with an
// API key registered for TAS coverage returns TAS stations.
// TAS bounds: lat -43.7 to -39.5, lng 143.8 to 148.3
const TAS_BOUNDS = { latMin: -43.7, latMax: -39.5, lngMin: 143.8, lngMax: 148.3 };
const TAS_GRID_STEP = 0.8;
const TAS_RADIUS = 80;

async function fetchTASStations() {
  const apiKey = process.env.NSW_FUELCHECK_API_KEY;
  if (!apiKey) {
    console.log('[australia] TAS skipped — NSW_FUELCHECK_API_KEY not set (needs TAS access)');
    return [];
  }

  const cells = [];
  for (let lat = TAS_BOUNDS.latMin; lat < TAS_BOUNDS.latMax; lat += TAS_GRID_STEP)
    for (let lng = TAS_BOUNDS.lngMin; lng < TAS_BOUNDS.lngMax; lng += TAS_GRID_STEP)
      cells.push({ lat: +(lat + TAS_GRID_STEP / 2).toFixed(2), lng: +(lng + TAS_GRID_STEP / 2).toFixed(2) });

  const stationMap = new Map();
  const BATCH = 6;

  for (let i = 0; i < cells.length; i += BATCH) {
    await Promise.all(cells.slice(i, i + BATCH).map(async (cell) => {
      try {
        const url = `https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices/bylocation` +
          `?fueltype=DL&latitude=${cell.lat}&longitude=${cell.lng}&radius=${TAS_RADIUS}&sortby=price`;
        const r = await fetch(url, {
          headers: { apikey: apiKey, Accept: 'application/json', 'User-Agent': UA },
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) return;
        const items = await r.json();
        if (!Array.isArray(items)) return;

        for (const s of items) {
          // Only accept stations within TAS bounding box
          const lat = parseFloat(s.Lat);
          const lng = parseFloat(s.Long);
          if (lat > TAS_BOUNDS.latMax || lat < TAS_BOUNDS.latMin) continue;
          if (lng < TAS_BOUNDS.lngMin || lng > TAS_BOUNDS.lngMax) continue;
          if (!s.ServiceStationID || stationMap.has(s.ServiceStationID)) continue;

          const prices = [];
          const seen = new Set();
          for (const p of (s.Prices || [])) {
            const fuelType = mapNSWFuelType(p.FuelType);
            if (!fuelType || seen.has(fuelType)) continue;
            const price = centsToEur(p.Price);
            if (!price) continue;
            seen.add(fuelType);
            prices.push({ fuelType, price });
          }
          if (!prices.length) continue;

          stationMap.set(s.ServiceStationID, {
            externalId: `AU-TAS-${s.ServiceStationID}`,
            name: s.Name || `Station ${s.ServiceStationID}`,
            brand: s.Brand || null,
            lat,
            lng,
            address: s.Address || null,
            city: parseAUSuburb(s.Address, 'TAS'),
            country: 'AU',
            prices,
          });
        }
      } catch { /* skip failed cell */ }
    }));
  }

  const stations = [...stationMap.values()];
  console.log(`[australia] TAS: ${stations.length} stations`);
  return stations;
}

// ── Combined ─────────────────────────────────────────────────────────────────
async function fetchAustraliaStations() {
  const [wa, nsw, tas] = await Promise.all([
    fetchWAStations(),
    fetchNSWStations(),
    fetchTASStations(),
  ]);
  const all = [...wa, ...nsw, ...tas];
  console.log(`[australia] Total: ${all.length} stations (WA: ${wa.length}, NSW: ${nsw.length}, TAS: ${tas.length})`);
  return all;
}

module.exports = { fetchAustraliaStations };
