// Australia fuel prices
// Source 1: WA FuelWatch JSON API (public, no key) — Western Australia
//   https://www.fuelwatch.wa.gov.au/api/sites?fuelType=<code>
//   Prices in AUD cents/L, includes lat/lng
// Source 2: NSW FuelCheck API (free key from api.nsw.gov.au, env: NSW_FUELCHECK_API_KEY)
//   https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices
//   Prices in AUD cents/L, includes lat/lng

const AUD_EUR = 0.59; // 1 AUD ≈ 0.59 EUR
const UA = 'Mozilla/5.0 (compatible; Gasify/1.0)';

// WA FuelWatch product codes → internal fuel type
// Prices are in AUD cents/L (e.g. 194.9 = $1.949/L)
const WA_PRODUCTS = [
  { code: 'ULP', fuelType: 'sp95' },          // Unleaded 91 RON
  { code: 'DSL', fuelType: 'diesel' },         // Diesel
  { code: 'BDL', fuelType: 'diesel_premium' }, // Brand/Premium Diesel
  { code: 'LPG', fuelType: 'lpg' },            // LPG
  { code: '98R', fuelType: 'sp98' },           // 98 RON
];

// NSW FuelCheck fuel type codes → internal fuel type
function mapNSWFuelType(code) {
  switch (code) {
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

function centsToEur(cents) {
  if (isNaN(cents) || cents <= 0) return null;
  const eur = +((cents / 100) * AUD_EUR).toFixed(3);
  return eur > 0 && eur < 6 ? eur : null;
}

async function fetchWAStations() {
  const stationMap = new Map(); // site id → station object

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
        const cents = s.product?.priceToday;
        if (!cents || cents <= 0 || s.product?.isOutOfSupply) continue;
        const price = centsToEur(cents);
        if (!price) continue;

        const lat = s.address?.latitude;
        const lng = s.address?.longitude;
        if (!lat || !lng) continue;

        const id = s.id;
        if (!stationMap.has(id)) {
          stationMap.set(id, {
            externalId: `AU-WA-${id}`,
            name: s.siteName || `Station ${id}`,
            brand: s.brandName || null,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            address: s.address?.line1 || null,
            city: s.address?.location || '',
            country: 'AU',
            prices: [],
          });
        }
        const station = stationMap.get(id);
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

async function fetchNSWStations() {
  const apiKey = process.env.NSW_FUELCHECK_API_KEY;
  if (!apiKey) {
    console.log('[australia] NSW skipped — NSW_FUELCHECK_API_KEY not set');
    return [];
  }

  try {
    const r = await fetch('https://api.onegov.nsw.gov.au/FuelCheckApp/v1/fuel/prices', {
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json', 'User-Agent': UA },
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) {
      console.error(`[australia] NSW API error: HTTP ${r.status}`);
      return [];
    }
    const data = await r.json();

    const stationLookup = new Map();
    for (const s of (data.stations || [])) {
      const lat = s.location?.latitude ?? s.latitude;
      const lng = s.location?.longitude ?? s.longitude;
      if (!s.stationcode || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) continue;
      stationLookup.set(s.stationcode, {
        externalId: `AU-NSW-${s.stationcode}`,
        name: s.name || `Station ${s.stationcode}`,
        brand: s.brand || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        address: s.address || null,
        city: s.suburb || '',
        country: 'AU',
        prices: [],
      });
    }

    for (const p of (data.prices || [])) {
      const station = stationLookup.get(p.stationcode);
      if (!station) continue;
      const fuelType = mapNSWFuelType(p.fueltype);
      if (!fuelType) continue;
      const price = centsToEur(parseFloat(p.price));
      if (!price) continue;
      if (!station.prices.find(x => x.fuelType === fuelType)) {
        station.prices.push({ fuelType, price });
      }
    }

    const stations = [...stationLookup.values()].filter(s => s.prices.length > 0);
    console.log(`[australia] NSW: ${stations.length} stations`);
    return stations;
  } catch (err) {
    console.error('[australia] NSW error:', err.message);
    return [];
  }
}

async function fetchAustraliaStations() {
  const [wa, nsw] = await Promise.all([fetchWAStations(), fetchNSWStations()]);
  const all = [...wa, ...nsw];
  console.log(`[australia] Total: ${all.length} stations (WA: ${wa.length}, NSW: ${nsw.length})`);
  return all;
}

module.exports = { fetchAustraliaStations };
