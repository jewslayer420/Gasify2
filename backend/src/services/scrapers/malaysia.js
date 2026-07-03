// Malaysia fuel prices — OpenStreetMap stations + data.gov.my national prices
//
// Prices: data.gov.my weekly fuel price catalogue (no auth required)
//   GET https://api.data.gov.my/data-catalogue?id=fuelprice&limit=1&sort=-date
//   Returns: { ron95, ron97, diesel } in MYR/L — published every Wednesday
//   RON95 is a regulated national price (uniform across all stations)
//
// Stations: Overpass API — amenity=fuel nodes in Malaysia
//   POST https://overpass-api.de/api/interpreter
//
// No auth required for either source.

const { stationsFromDb } = require('./_overpass');

const MYR_EUR = 1 / 4.9; // 1 EUR ≈ 4.9 MYR
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

function myrToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * MYR_EUR).toFixed(3);
  return eur > 0.05 && eur < 6 ? eur : null;
}

async function fetchMalaysiaStations() {
  // 1. Fetch latest national fuel prices
  let prices = [];
  try {
    const r = await fetch(
      'https://api.data.gov.my/data-catalogue?id=fuelprice&limit=1&sort=-date',
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }
    );
    if (!r.ok) throw new Error(`data.gov.my HTTP ${r.status}`);
    const data = await r.json();
    const latest = Array.isArray(data) ? data[0] : data;
    if (!latest) throw new Error('empty price response');

    const p95  = myrToEur(latest.ron95);
    const p97  = myrToEur(latest.ron97);
    const pdsl = myrToEur(latest.diesel);
    if (p95)  prices.push({ fuelType: 'sp95',   price: p95 });
    if (p97)  prices.push({ fuelType: 'sp98',   price: p97 });
    if (pdsl) prices.push({ fuelType: 'diesel', price: pdsl });
    console.log(`[malaysia] prices: RON95=€${p95} RON97=€${p97} diesel=€${pdsl} (date: ${latest.date})`);
  } catch (err) {
    console.error('[malaysia] price fetch error:', err.message);
    return [];
  }
  if (!prices.length) return [];

  const fromDb = await stationsFromDb('MY-OSM-', () => prices, 'malaysia');
  if (fromDb) return fromDb;

  // 2. Fetch stations from OSM Overpass API (bbox: covers Peninsular + East Malaysia)
  // [latMin,lngMin,latMax,lngMax]
  const query = `[out:json][timeout:120];area["ISO3166-1"="MY"]->.a;(node["amenity"="fuel"](area.a);way["amenity"="fuel"](area.a););out center body;`;
  let elements = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
        headers: { Accept: '*/*', 'User-Agent': UA },
        signal: AbortSignal.timeout(150000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      elements = json.elements || [];
      break;
    } catch (err) {
      console.warn(`[malaysia] ${mirror} failed:`, err.message);
    }
  }
  if (!elements.length) { console.error('[malaysia] all Overpass mirrors failed'); return []; }

  const stations = [];
  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!lat || !lng) continue;
    const tags = e.tags || {};
    const name = tags.name || tags['name:en'] || tags.brand || tags.operator || 'Fuel Station';
    const brand = tags.brand || tags.operator || null;
    const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '';
    const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    const address = addrParts.length ? addrParts.join(' ') : null;

    stations.push({
      externalId: `MY-OSM-${e.id}`,
      name,
      brand,
      lat,
      lng,
      address,
      city,
      country: 'MY',
      prices,
    });
  }

  console.log(`[malaysia] ${stations.length} stations from OSM`);
  return stations;
}

module.exports = { fetchMalaysiaStations };
