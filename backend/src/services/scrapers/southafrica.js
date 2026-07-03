// South Africa fuel prices — government-regulated national price + OpenStreetMap stations
//
// SA fuel is price-regulated: the Dept. of Mineral & Petroleum Resources (DMPR) sets the
// pump price monthly (first Wednesday), uniform per zone — there is no per-station variation.
// We apply the current national price to all OSM stations (Canada model).
//
// Prices below are the current regulated levels (R/litre) — UPDATE MONTHLY from
//   https://www.dmre.gov.za/energy-resources/energy-sources/pretoleum/fuel-prices
// Source for current values: DMPR / globalpetrolprices (2026-06-01).
// (v1 uses single national petrol/diesel values; 93/95 and inland/coastal zones could be split later.)
//
// Stations: Overpass API — amenity=fuel nodes in South Africa.

const { stationsFromDb } = require('./_overpass');

const ZAR_EUR = 1 / 20.5; // 1 EUR ≈ 20.5 ZAR
const UA = 'Gasify/1.0';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Current regulated prices in ZAR/litre (update monthly)
const PRICES_ZAR = [
  { fuelType: 'sp95',   zar: 27.63 }, // petrol
  { fuelType: 'diesel', zar: 30.64 }, // diesel 50ppm
];

// Manual-price freshness metadata (consumed by price_freshness.js). Bump `asOf`
// whenever PRICES_ZAR is updated.
const PRICE_META = { cc: 'ZA', label: 'southafrica', asOf: '2026-06', source: 'DMPR monthly — dmre.gov.za/.../fuel-prices' };

function zarToEur(zar) {
  const eur = +(zar * ZAR_EUR).toFixed(3);
  return eur > 0.2 && eur < 6 ? eur : null;
}

async function fetchOverpass(query) {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      const tag = mirror.includes('kumi') ? 'kumi' : mirror.includes('-api.de') ? 'de' : 'ru';
      try {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
          headers: { Accept: '*/*', 'User-Agent': UA },
          signal: AbortSignal.timeout(180000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn(`[southafrica] ${tag} failed (attempt ${attempt + 1}): ${err.message}`);
      }
    }
  }
  return null;
}

async function fetchSouthAfricaStations() {
  const priceList = PRICES_ZAR
    .map(p => ({ fuelType: p.fuelType, price: zarToEur(p.zar) }))
    .filter(p => p.price);
  if (!priceList.length) { console.error('[southafrica] no valid prices'); return []; }
  console.log(`[southafrica] regulated avg: ${priceList.map(p => `${p.fuelType}=€${p.price}`).join(', ')}`);

  const fromDb = await stationsFromDb('ZA-OSM-', () => priceList, 'southafrica');
  if (fromDb) return fromDb;

  // Two bboxes across SA (north incl. Gauteng, south incl. coast); ids dedupe overlaps.
  const bboxes = [
    [-30.0, 16.0, -22.0, 33.0], // north
    [-35.0, 16.0, -30.0, 33.5], // south / coast
  ];

  const stationMap = new Map();
  for (const [latMin, lngMin, latMax, lngMax] of bboxes) {
    const query = `[out:json][timeout:180];area["ISO3166-1"="ZA"]->.a;nwr["amenity"="fuel"](area.a)(${latMin},${lngMin},${latMax},${lngMax});out center;`;
    const json = await fetchOverpass(query);
    if (!json) { console.error(`[southafrica] all mirrors failed for bbox [${latMin},${lngMin}..${latMax},${lngMax}]`); continue; }
    for (const e of (json.elements || [])) {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const key = `${e.type}/${e.id}`;
      if (!lat || !lng || stationMap.has(key)) continue;
      const tags = e.tags || {};
      stationMap.set(key, {
        externalId: `ZA-OSM-${e.type}-${e.id}`,
        name: tags.name || tags.brand || tags.operator || 'Filling Station',
        brand: tags.brand || tags.operator || null,
        lat, lng,
        address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
        city: tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '',
        country: 'ZA',
        prices: priceList,
      });
    }
    console.log(`[southafrica] bbox [${latMin},${lngMin}..${latMax},${lngMax}]: ${stationMap.size} total`);
  }

  const stations = [...stationMap.values()];
  console.log(`[southafrica] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchSouthAfricaStations, PRICE_META };
