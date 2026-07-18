// Thailand fuel prices — OpenStreetMap stations + thai-oil-api brand prices,
// with the official Bangchak price board as fallback.
//
// Prices (primary): thai-oil-api (crawls official brand price boards — no auth)
//   GET https://api.chnwt.dev/thai-oil-api/latest
//   Returns per-brand prices in THB/L for Bangkok & vicinity
//   Brands: ptt, bcp, shell, caltex, irpc, pt, susco, pure, susco_dealers
//   ⚠️ Since ~2026-07-05 its upstream crawler is broken: the response is still
//   success-shaped but every price is an empty string. We validate the payload
//   and fall back rather than freeze.
//
// Prices (fallback): Bangchak official price API (state-linked refiner, ~2,200
//   stations; standard grades are priced near-identically across Thai brands)
//   GET https://www.bangchak.co.th/api/oilprice
//   → data.items[{ OilNameEng, PriceToday }] in THB/L, Bangkok reference.
//   Used as a national board for ALL stations when per-brand data is down.
//
// Stations: Overpass API — amenity=fuel nodes in Thailand
//   POST https://overpass-api.de/api/interpreter
//   OSM brand tags are matched to thai-oil-api brand keys.
//   Unrecognised brands default to PTT (largest network, ~1,800 stations).

const { stationsFromDb } = require('./_overpass');

const THB_EUR = 1 / 38; // 1 EUR ≈ 38 THB
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

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

// Bangchak's board → app fuel types. Higher prio wins the slot when several
// grades map to the same fuelType (Gasohol 91 is listed before 95 upstream).
const BANGCHAK_RULES = [
  { re: /gasohol\s*95/i,      fuelType: 'sp95',           prio: 2 },
  { re: /gasohol\s*91/i,      fuelType: 'sp95',           prio: 1 },
  { re: /e20/i,               fuelType: 'e20',            prio: 1 },
  { re: /e85/i,               fuelType: 'e85',            prio: 1 },
  { re: /premium\s*diesel/i,  fuelType: 'diesel_premium', prio: 1 },
  { re: /diesel\s*b20/i,      fuelType: null,             prio: 0 }, // restricted blend — skip
  { re: /diesel/i,            fuelType: 'diesel',         prio: 1 },
  { re: /98/i,                fuelType: 'sp98',           prio: 1 },
];

function pricesFromBangchak(items) {
  const best = {}; // fuelType -> { price, prio }
  for (const item of items ?? []) {
    const rule = BANGCHAK_RULES.find(r => r.re.test(item?.OilNameEng || ''));
    if (!rule || !rule.fuelType) continue;
    const price = thbToEur(item.PriceToday);
    if (!price) continue;
    if (!best[rule.fuelType] || rule.prio > best[rule.fuelType].prio) {
      best[rule.fuelType] = { price, prio: rule.prio };
    }
  }
  return Object.entries(best).map(([fuelType, { price }]) => ({ fuelType, price }));
}

async function fetchBangchakPrices() {
  try {
    const r = await fetch('https://www.bangchak.co.th/api/oilprice', {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const prices = pricesFromBangchak(json?.data?.items);
    console.log(`[thailand] Bangchak board: ${prices.map(p => `${p.fuelType}=${p.price}`).join(' ') || 'no usable prices'}`);
    return prices;
  } catch (err) {
    console.warn('[thailand] Bangchak fetch failed:', err.message);
    return [];
  }
}

async function fetchThailandStations() {
  // 1. Fetch brand prices (primary: thai-oil-api)
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
    console.warn('[thailand] thai-oil-api error:', err.message);
  }

  // Precompute prices per brand key
  const brandPriceCache = {};
  if (defaultPrices.length) {
    for (const [key, val] of Object.entries(brandData)) {
      brandPriceCache[key] = extractPrices(val);
    }
  } else {
    // thai-oil-api down or serving empty strings (its state since 2026-07-05) —
    // use Bangchak's official board as a national price set for all brands.
    console.warn('[thailand] thai-oil-api unusable — falling back to Bangchak official board');
    defaultPrices = await fetchBangchakPrices();
    if (!defaultPrices.length) {
      console.error('[thailand] no price source available (thai-oil-api empty, Bangchak failed)');
      return [];
    }
  }

  // DB rows store the same rawBrand the OSM path derives, so per-brand pricing works
  const fromDb = await stationsFromDb('TH-OSM-', r => {
    const brandKey = matchBrand(r.brand);
    return brandKey && brandPriceCache[brandKey]?.length ? brandPriceCache[brandKey] : defaultPrices;
  }, 'thailand');
  if (fromDb) return fromDb;

  // 2. Fetch stations from OSM Overpass API
  // bbox: [latMin,lngMin,latMax,lngMax] — covers Thailand
  const query = `[out:json][timeout:120];area["ISO3166-1"="TH"]->.a;(node["amenity"="fuel"](area.a);way["amenity"="fuel"](area.a););out center body;`;
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
      console.warn(`[thailand] ${mirror} failed:`, err.message);
    }
  }
  if (!elements.length) { console.error('[thailand] all Overpass mirrors failed'); return []; }

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

module.exports = { fetchThailandStations, extractPrices, pricesFromBangchak };
