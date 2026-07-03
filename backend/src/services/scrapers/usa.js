// USA fuel prices — U.S. EIA national weekly averages + OpenStreetMap stations
//
// Prices: EIA Open Data API v2 (api.eia.gov), petroleum/pri/gnd, weekly retail.
//   GET .../petroleum/pri/gnd/data/?api_key=KEY&frequency=weekly&data[]=value
//        &facets[duoarea][]=NUS&facets[product][]=EPMR&...&sort[0][column]=period&...desc
//   Products: EPMR Regular Gasoline → sp95, EPMP Premium → sp98, EPD2D No.2 Diesel → diesel.
//   Prices in $/GAL → converted to €/L. National average applied to all stations (Canada model).
// env: EIA_API_KEY (free, instant: https://www.eia.gov/opendata/register.php)
//
// Stations: Overpass API — amenity=fuel nodes across a US bbox grid (~100k; ids dedupe overlaps).

const { stationsFromDb } = require('./_overpass');

const GAL_TO_L = 3.78541;
const USD_EUR = 0.92; // 1 USD ≈ 0.92 EUR
const EIA_BASE = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/';
const UA = 'Gasify/1.0';
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const PRODUCT_MAP = { EPMR: 'sp95', EPMP: 'sp98', EPD2D: 'diesel' };

function usdGalToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n / GAL_TO_L * USD_EUR).toFixed(3);
  return eur > 0.2 && eur < 6 ? eur : null;
}

// Latest weekly national average per product → [{ fuelType, price }]
async function fetchNationalPrices(key) {
  const p = new URLSearchParams();
  p.set('api_key', key);
  p.set('frequency', 'weekly');
  p.append('data[]', 'value');
  p.append('facets[duoarea][]', 'NUS');
  for (const code of Object.keys(PRODUCT_MAP)) p.append('facets[product][]', code);
  p.append('sort[0][column]', 'period');
  p.append('sort[0][direction]', 'desc');
  p.set('length', '30');

  const r = await fetch(`${EIA_BASE}?${p}`, { signal: AbortSignal.timeout(40000) });
  if (!r.ok) throw new Error(`EIA ${r.status}`);
  const j = await r.json();
  const rows = j?.response?.data || [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {            // rows are newest-first; keep the first (latest) per product
    const ft = PRODUCT_MAP[row.product];
    if (!ft || seen.has(ft)) continue;
    const price = usdGalToEur(row.value);
    if (!price) continue;
    seen.add(ft);
    out.push({ fuelType: ft, price });
  }
  return out;
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
        console.warn(`[usa] ${tag} failed (attempt ${attempt + 1}): ${err.message}`);
      }
    }
  }
  return null;
}

async function fetchUSAStations() {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    console.log('[usa] skipped — EIA_API_KEY not set (register at eia.gov/opendata/register.php)');
    return [];
  }

  let priceList;
  try {
    priceList = await fetchNationalPrices(key);
  } catch (err) {
    console.error('[usa] price fetch error:', err.message);
    return [];
  }
  if (!priceList.length) { console.error('[usa] no prices parsed'); return []; }
  console.log(`[usa] national avg: ${priceList.map(p => `${p.fuelType}=€${p.price}`).join(', ')}`);

  const fromDb = await stationsFromDb('US-OSM-', () => priceList, 'usa');
  if (fromDb) return fromDb;

  // bbox grid over the US: [latMin, lngMin, latMax, lngMax]
  const bboxes = [
    [42.0, -125.0, 49.5, -110.0], // WA/OR/ID/MT west
    [37.0, -124.5, 42.0, -114.0], // N California / N Nevada
    [31.3, -122.0, 37.0, -109.0], // S California / AZ / S Nevada
    [36.5, -114.0, 45.0, -104.0], // UT/CO/WY
    [29.0, -109.0, 37.0, -100.0], // NM / W Texas
    [25.8, -106.7, 33.0,  -93.5], // Texas
    [40.0, -110.0, 49.5,  -96.0], // MT/ND/SD/NE
    [33.5, -103.0, 40.0,  -94.0], // KS/OK
    [40.0,  -97.0, 49.5,  -86.0], // MN/WI/IA
    [36.0,  -96.0, 43.0,  -86.0], // MO/IL/IN
    [41.5,  -90.0, 48.5,  -82.0], // Michigan
    [36.5,  -86.0, 42.5,  -77.0], // OH/KY/WV
    [29.0,  -94.5, 37.0,  -84.5], // LA/MS/AL/AR/TN
    [24.0,  -88.0, 31.5,  -79.5], // Florida
    [31.5,  -85.5, 37.0,  -75.0], // GA/SC/NC
    [36.0,  -83.5, 40.5,  -75.0], // VA/MD/DC/DE
    [38.5,  -81.0, 42.5,  -73.5], // PA/NJ
    [40.0,  -80.0, 45.5,  -73.0], // New York
    [41.0,  -73.7, 47.5,  -66.8], // New England
    [51.0, -170.0, 71.5, -129.0], // Alaska
    [18.8, -160.5, 22.5, -154.5], // Hawaii
  ];

  const stationMap = new Map();
  for (const [latMin, lngMin, latMax, lngMax] of bboxes) {
    // nwr = nodes + ways + relations; "out center" gives ways/relations a centroid.
    // area filter keeps the tile bounded AND clips to the US border (no Canada/Mexico bleed)
    const query = `[out:json][timeout:180];area["ISO3166-1"="US"]->.a;nwr["amenity"="fuel"](area.a)(${latMin},${lngMin},${latMax},${lngMax});out center;`;
    const json = await fetchOverpass(query);
    if (!json) { console.error(`[usa] all mirrors failed for bbox [${latMin},${lngMin}..${latMax},${lngMax}]`); continue; }
    for (const e of (json.elements || [])) {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const key = `${e.type}/${e.id}`;          // node & way ids share a namespace — key by type+id
      if (!lat || !lng || stationMap.has(key)) continue;
      const tags = e.tags || {};
      stationMap.set(key, {
        externalId: `US-OSM-${e.type}-${e.id}`,
        name: tags.name || tags.brand || tags.operator || 'Gas Station',
        brand: tags.brand || tags.operator || null,
        lat, lng,
        address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
        city: tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '',
        country: 'US',
        prices: priceList,
      });
    }
    console.log(`[usa] bbox [${latMin},${lngMin}..${latMax},${lngMax}]: ${stationMap.size} total`);
  }

  const stations = [...stationMap.values()];
  console.log(`[usa] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchUSAStations };
