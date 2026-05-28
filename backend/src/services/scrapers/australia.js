// Australia fuel prices — WA FuelWatch + NSW FuelCheck combined
//
// WA FuelWatch JSON API (public, no key):
//   GET https://www.fuelwatch.wa.gov.au/api/sites?fuelType=<code>
//   Returns all WA stations with today's price in AUD cents/L
//
// NSW FuelCheck API (free key from api.nsw.gov.au):
//   GET https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices/bylocation
//   Grid scan over NSW — each response includes all fuel types per station
//   env: NSW_FUELCHECK_API_KEY, NSW_FUELCHECK_API_SECRET

const AUD_EUR = 0.59; // 1 AUD ≈ 0.59 EUR

const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

// ── WA FuelWatch ────────────────────────────────────────────────────────────
// Product shortNames → internal fuel type
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

// ── NSW FuelCheck ────────────────────────────────────────────────────────────
// NSW bounding box (approximate)
const NSW_BOUNDS = { latMin: -37.5, latMax: -28.0, lngMin: 141.0, lngMax: 154.0 };
const NSW_GRID_STEP = 1.2;   // degrees between grid points
const NSW_RADIUS    = 90;    // km radius per query (overlaps with neighbours)

// NSW FuelCheck fuel type codes → internal fuel type
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

// Parse suburb from NSW address string e.g. "330 Miller St, CAMMERAY NSW 2062"
function parseNSWSuburb(address) {
  if (!address) return '';
  const m = address.match(/,\s*([^,]+?)\s+NSW\s+\d{4}/i);
  return m ? m[1].trim() : '';
}

async function runConcurrentNSW(cells, fetchCell, concurrency = 8) {
  for (let i = 0; i < cells.length; i += concurrency)
    await Promise.all(cells.slice(i, i + concurrency).map(fetchCell));
}

async function fetchNSWStations() {
  const apiKey = process.env.NSW_FUELCHECK_API_KEY;
  if (!apiKey) {
    console.log('[australia] NSW skipped — NSW_FUELCHECK_API_KEY not set');
    return [];
  }

  // Build grid cells
  const cells = [];
  for (let lat = NSW_BOUNDS.latMin; lat < NSW_BOUNDS.latMax; lat += NSW_GRID_STEP)
    for (let lng = NSW_BOUNDS.lngMin; lng < NSW_BOUNDS.lngMax; lng += NSW_GRID_STEP)
      cells.push({ lat: +(lat + NSW_GRID_STEP / 2).toFixed(2), lng: +(lng + NSW_GRID_STEP / 2).toFixed(2) });

  const stationMap = new Map(); // ServiceStationID → station
  let done = 0;

  await runConcurrentNSW(cells, async (cell) => {
    try {
      const url = `https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices/bylocation` +
        `?fueltype=DL&latitude=${cell.lat}&longitude=${cell.lng}&radius=${NSW_RADIUS}&sortby=price`;
      const r = await fetch(url, {
        headers: { apikey: apiKey, Accept: 'application/json', 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) return;
      const items = await r.json();
      if (!Array.isArray(items)) return;

      for (const s of items) {
        if (!s.ServiceStationID || stationMap.has(s.ServiceStationID)) continue;
        const lat = parseFloat(s.Lat);
        const lng = parseFloat(s.Long);
        if (isNaN(lat) || isNaN(lng)) continue;

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
          externalId: `AU-NSW-${s.ServiceStationID}`,
          name: s.Name || `Station ${s.ServiceStationID}`,
          brand: s.Brand || null,
          lat,
          lng,
          address: s.Address || null,
          city: parseNSWSuburb(s.Address),
          country: 'AU',
          prices,
        });
      }
    } catch { /* skip failed cell */ }
    if (++done % 20 === 0) console.log(`[australia] NSW grid: ${done}/${cells.length} cells, ${stationMap.size} stations`);
  });

  const stations = [...stationMap.values()];
  console.log(`[australia] NSW: ${stations.length} stations`);
  return stations;
}

// ── Combined ─────────────────────────────────────────────────────────────────
async function fetchAustraliaStations() {
  const [wa, nsw] = await Promise.all([fetchWAStations(), fetchNSWStations()]);
  const all = [...wa, ...nsw];
  console.log(`[australia] Total: ${all.length} stations (WA: ${wa.length}, NSW: ${nsw.length})`);
  return all;
}

module.exports = { fetchAustraliaStations };
