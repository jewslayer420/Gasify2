// Fuelo.net — European fuel price aggregator, covers Czech Republic
// Free API key: https://fuelo.net/about/api_key_request
// Set FUELO_API_KEY in .env
// 5 000 requests/day included; prices returned in CZK → converted to EUR here

const BASE = 'https://cz.fuelo.net/api/near';

// CZK → EUR rate (update periodically; ~25 CZK = 1 EUR)
const CZK_EUR = 25.0;

// Fuelo.net fuel type name → our internal fuel type
// Their names are returned in the local language or English depending on the API key locale
const FUEL_MAP = {
  // English labels (API default)
  'natural 95':        'sp95',
  'unleaded 95':       'sp95',
  'gasoline 95':       'sp95',
  'super 95':          'sp95',
  'natural 98':        'sp98',
  'unleaded 98':       'sp98',
  'super 98':          'sp98',
  'diesel':            'diesel',
  'diesel premium':    'diesel_premium',
  'premium diesel':    'diesel_premium',
  'lpg':               'lpg',
  'autogas':           'lpg',
  'cng':               'cng',
  'e10':               'e10',
  // Czech labels
  'natural':           'sp95',
  'nafta':             'diesel',
  'nafta premium':     'diesel_premium',
  'autoplyn':          'lpg',
};

// Czech Republic bounding box; 0.4° step with 50 km radius gives full coverage
const LAT_MIN = 48.55, LAT_MAX = 51.06, LAT_STEP = 0.4;
const LNG_MIN = 12.09, LNG_MAX = 18.87, LNG_STEP = 0.4;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function mapFuelType(name) {
  if (!name) return null;
  return FUEL_MAP[name.toLowerCase().trim()] ?? null;
}

function toEur(price, currency) {
  if (!price || isNaN(price)) return null;
  if (!currency || currency.toUpperCase() === 'EUR') return +price.toFixed(3);
  if (currency.toUpperCase() === 'CZK') return +(price / CZK_EUR).toFixed(3);
  return null;
}

async function fetchGrid(lat, lng, apiKey, stationMap) {
  const url = `${BASE}?key=${apiKey}&lat=${lat}&lng=${lng}&distance=50`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Gasify/1.0 (teo.karov@gmail.com)', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;
    const data = await res.json();

    // Fuelo.net returns { status, stations: [...] } or an array directly
    const items = Array.isArray(data) ? data : (data.stations || data.data || []);

    for (const s of items) {
      const id = String(s.id ?? s.station_id ?? '');
      if (!id || stationMap.has(id)) continue;

      const lat = parseFloat(s.lat ?? s.latitude);
      const lng = parseFloat(s.lng ?? s.lon ?? s.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;

      const prices = [];
      const rawPrices = s.prices ?? s.fuel_prices ?? s.fuels ?? [];
      for (const p of rawPrices) {
        const ft = mapFuelType(p.name ?? p.fuel_type ?? p.type);
        const price = toEur(parseFloat(p.price ?? p.value ?? 0), p.currency ?? 'CZK');
        if (ft && price && price > 0) prices.push({ fuelType: ft, price });
      }
      if (!prices.length) continue;

      stationMap.set(id, {
        externalId: `CZ-${id}`,
        name: s.name || s.station_name || `Station ${id}`,
        brand: s.brand || s.company || null,
        lat, lng,
        address: s.address || s.street || null,
        city: s.city || s.municipality || '',
        country: 'CZ',
        prices,
      });
    }
  } catch { /* skip grid point */ }
}

async function fetchCzechiaStations() {
  const apiKey = process.env.FUELO_API_KEY;
  if (!apiKey) {
    console.warn('[czechia] FUELO_API_KEY not set — skipping');
    return [];
  }

  const stationMap = new Map();

  const latPoints = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX + 0.001; lat += LAT_STEP) latPoints.push(+lat.toFixed(2));
  const lngPoints = [];
  for (let lng = LNG_MIN; lng <= LNG_MAX + 0.001; lng += LNG_STEP) lngPoints.push(+lng.toFixed(2));

  const total = latPoints.length * lngPoints.length;
  let done = 0;

  for (const lat of latPoints) {
    for (const lng of lngPoints) {
      await fetchGrid(lat, lng, apiKey, stationMap);
      done++;
      if (done % 20 === 0) console.log(`[czechia] ${done}/${total} grid points, ${stationMap.size} stations`);
      await sleep(1200);
    }
  }

  console.log(`[czechia] Done — ${stationMap.size} unique stations`);
  return [...stationMap.values()];
}

module.exports = { fetchCzechiaStations };
