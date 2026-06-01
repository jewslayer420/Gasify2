// Thailand fuel prices — OpenStreetMap stations + thai-oil-api brand prices
//
// Prices: thai-oil-api (crawls official brand price boards — no auth required)
//   GET https://api.chnwt.dev/thai-oil-api/latest
//   Returns per-brand prices in THB/L for Bangkok & vicinity
//   Brands: ptt, bcp, shell, caltex, irpc, pt, susco, pure, susco_dealers
//
// Stations: Overpass API — amenity=fuel nodes in Thailand
//   POST https://overpass-api.de/api/interpreter
//   OSM brand tags are matched to thai-oil-api brand keys.
//   Unrecognised brands default to PTT (largest network, ~1,800 stations).

const THB_EUR = 1 / 38; // 1 EUR ≈ 38 THB
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS = 'https://overpass.kumi.systems/api/interpreter';

function thbToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * THB_EUR).toFixed(3);
  return eur > 0.1 && eur < 6 ? eur : null;
}

// Map OSM brand strings → thai-oil-api brand keys (lowercase match)
const BRAND_MAP = {
  ptt:        'ptt',
  'ปตท':     'ptt',
  bangchak:   'bcp',
  bcp:        'bcp',
  'บางจาก':  'bcp',
  shell:      'shell',
  'เชลล์':   'shell',
  caltex:     'caltex',
  'คาลเท็กซ์': 'caltex',
  chevron:    'caltex',
  esso:       'caltex', // Esso Thailand rebranded to Caltex
  irpc:       'irpc',
  pt:         'pt',
  puma:       'pt',
  'พีที':    'pt',
  susco:      'susco',
  pure:       'pure',
};

function matchBrand(rawBrand) {
  if (!rawBrand) return null;
  const lower = rawBrand.toLowerCase().trim();
  if (BRAND_MAP[lower]) return BRAND_MAP[lower];
  for (const [key, val] of Object.entries(BRAND_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

// Each fuel type entry can be { name, price } or a plain number/string
function getRaw(entry) {
  if (!entry) return null;
  if (typeof entry === 'number') return entry;
  if (typeof entry === 'string') return parseFloat(entry);
  if (typeof entry === 'object') return parseFloat(entry.price ?? entry.value ?? null);
  return null;
}

// Pick the most representative fuel prices for a brand's price object
function extractPrices(brandPrices) {
  if (!brandPrices || typeof brandPrices !== 'object') return [];
  const prices = [];
  const seen = new Set();

  // Prefer gasohol_95 over gasoline_95 for sp95 (gasohol is the dominant grade)
  const sp95 = thbToEur(getRaw(brandPrices.gasohol_95));
  if (sp95 && !seen.has('sp95')) { prices.push({ fuelType: 'sp95', price: sp95 }); seen.add('sp95'); }

  // Gasohol 91 as "regular" (falls back to sp95 slot if no gasohol_95)
  const sp91 = thbToEur(getRaw(brandPrices.gasohol_91));
  if (sp91 && !seen.has('sp95')) { prices.push({ fuelType: 'sp95', price: sp91 }); seen.add('sp95'); }

  // E20
  const e20 = thbToEur(getRaw(brandPrices.gasohol_e20));
  if (e20) prices.push({ fuelType: 'e20', price: e20 });

  // E85
  const e85 = thbToEur(getRaw(brandPrices.gasohol_e85));
  if (e85) prices.push({ fuelType: 'e85', price: e85 });

  // Diesel (some brands spell it "disel")
  const diesel = thbToEur(getRaw(brandPrices.diesel ?? brandPrices.disel));
  if (diesel) prices.push({ fuelType: 'diesel', price: diesel });

  return prices;
}

async function fetchThailandStations() {
  // 1. Fetch brand prices
  let brandData = {};
  let defaultPrices = [];
  try {
    const r = await fetch('https://api.chnwt.dev/thai-oil-api/latest', {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`thai-oil-api HTTP ${r.status}`);
    const json = await r.json();
    if (json.status !== 'success' || !json.response?.stations) throw new Error('unexpected response shape');
    brandData = json.response.stations;
    defaultPrices = extractPrices(brandData.ptt);
    console.log(`[thailand] brand prices fetched (date: ${json.response.date})`);
  } catch (err) {
    console.error('[thailand] price fetch error:', err.message);
    return [];
  }
  if (!defaultPrices.length) return [];

  // Precompute prices per brand key
  const brandPriceCache = {};
  for (const [key, val] of Object.entries(brandData)) {
    brandPriceCache[key] = extractPrices(val);
  }

  // 2. Fetch stations from OSM Overpass API
  // bbox: [latMin,lngMin,latMax,lngMax] — covers Thailand
  const query = `[out:json][timeout:90][bbox:5.5,97.5,20.5,105.7];(node["amenity"="fuel"];way["amenity"="fuel"];);out center body;`;
  let elements = [];
  try {
    const r = await fetch(`${OVERPASS}?` + new URLSearchParams({ data: query }), {
      headers: { Accept: '*/*', 'User-Agent': UA },
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const json = await r.json();
    elements = json.elements || [];
  } catch (err) {
    console.error('[thailand] OSM fetch error:', err.message);
    return [];
  }

  const stations = [];
  const brandCounts = {};

  for (const e of elements) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (!lat || !lng) continue;

    const tags = e.tags || {};
    const rawBrand = tags.brand || tags.operator || tags.name || null;
    const brandKey = matchBrand(rawBrand);
    const prices = brandKey && brandPriceCache[brandKey]?.length
      ? brandPriceCache[brandKey]
      : defaultPrices;

    brandCounts[brandKey || 'unknown'] = (brandCounts[brandKey || 'unknown'] || 0) + 1;

    const name = tags.name || tags['name:en'] || rawBrand || 'Fuel Station';
    const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '';
    const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    const address = addrParts.length ? addrParts.join(' ') : null;

    stations.push({
      externalId: `TH-OSM-${e.id}`,
      name,
      brand: rawBrand || null,
      lat,
      lng,
      address,
      city,
      country: 'TH',
      prices,
    });
  }

  const top = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`[thailand] ${stations.length} stations — top brands: ${top.map(([k, v]) => `${k}:${v}`).join(', ')}`);
  return stations;
}

module.exports = { fetchThailandStations };
