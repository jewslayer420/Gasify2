// New Zealand fuel prices — OpenStreetMap stations + MBIE weekly price CSV
//
// Prices: MBIE (Ministry of Business, Innovation & Employment) weekly CSV
//   GET https://www.mbie.govt.nz/assets/Data-Files/Energy/Weekly-fuel-price-monitoring/weekly-table.csv
//   Columns: Week, Date, Fuel, Variable, Value, Unit, Status
//   Relevant: Fuel={"Regular Petrol","Premium Petrol 95R","Diesel"}, Variable="Board price"
//   Unit: NZD c/L (cents per litre). Updated weekly (Wednesdays).
//
// Stations: Overpass API — amenity=fuel nodes in New Zealand
//   POST https://overpass-api.de/api/interpreter
//
// No auth required for either source.

const NZD_EUR = 1 / 1.85; // 1 EUR ≈ 1.85 NZD
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

function nzdCentsToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +((n / 100) * NZD_EUR).toFixed(3);
  return eur > 0.1 && eur < 6 ? eur : null;
}

function parseCSVLine(line) {
  // Remove surrounding quotes from each field (values don't contain commas)
  return line.replace(/"/g, '').split(',');
}

async function fetchNZPrices() {
  const r = await fetch(
    'https://www.mbie.govt.nz/assets/Data-Files/Energy/Weekly-fuel-price-monitoring/weekly-table.csv',
    { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain' }, signal: AbortSignal.timeout(60000) }
  );
  if (!r.ok) throw new Error(`MBIE CSV HTTP ${r.status}`);
  const text = await r.text();

  const lines = text.trim().split('\n');
  // Column order: Week, Date, Fuel, Variable, Value, Unit, Status (0-indexed)
  const FUEL_IDX = 2, VAR_IDX = 3, VAL_IDX = 4, STATUS_IDX = 6;

  const prices = {};
  // Iterate from the end to get the most recent values first
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = parseCSVLine(lines[i]);
    if (parts.length < 7) continue;
    const variable = parts[VAR_IDX].trim();
    if (variable !== 'Board price') continue;
    const status = parts[STATUS_IDX].trim();
    if (status !== 'Final' && status !== 'Provisional') continue;

    const fuel = parts[FUEL_IDX].trim();
    const value = parts[VAL_IDX].trim();

    if (fuel === 'Regular Petrol' && !prices.sp95) {
      prices.sp95 = nzdCentsToEur(value);
    } else if (fuel === 'Premium Petrol 95R' && !prices.sp98) {
      prices.sp98 = nzdCentsToEur(value);
    } else if (fuel === 'Diesel' && !prices.diesel) {
      prices.diesel = nzdCentsToEur(value);
    }

    if (prices.sp95 && prices.sp98 && prices.diesel) break;
  }

  return prices;
}

async function fetchNewZealandStations() {
  // 1. Fetch MBIE weekly board prices
  let priceList = [];
  try {
    const p = await fetchNZPrices();
    if (p.sp95)   priceList.push({ fuelType: 'sp95',   price: p.sp95 });
    if (p.sp98)   priceList.push({ fuelType: 'sp98',   price: p.sp98 });
    if (p.diesel) priceList.push({ fuelType: 'diesel', price: p.diesel });
    console.log(`[newzealand] prices: reg=€${p.sp95} prem=€${p.sp98} diesel=€${p.diesel}`);
  } catch (err) {
    console.error('[newzealand] price fetch error:', err.message);
    return [];
  }
  if (!priceList.length) return [];

  // 2. Fetch stations from OSM Overpass API
  // bbox: [latMin,lngMin,latMax,lngMax] — covers New Zealand (excl. Chatham Islands)
  const query = `[out:json][timeout:120];area["ISO3166-1"="NZ"]->.a;(node["amenity"="fuel"](area.a);way["amenity"="fuel"](area.a););out center body;`;
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
      console.warn(`[newzealand] ${mirror} failed:`, err.message);
    }
  }
  if (!elements.length) { console.error('[newzealand] all Overpass mirrors failed'); return []; }

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

    stations.push({
      externalId: `NZ-OSM-${e.id}`,
      name,
      brand,
      lat,
      lng,
      address: addrParts.length ? addrParts.join(' ') : null,
      city,
      country: 'NZ',
      prices: priceList,
    });
  }

  console.log(`[newzealand] ${stations.length} stations from OSM`);
  return stations;
}

module.exports = { fetchNewZealandStations };
