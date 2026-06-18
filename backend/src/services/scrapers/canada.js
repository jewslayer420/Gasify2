// Canada fuel prices — OpenStreetMap stations + Ontario/StatsCan monthly gasoline prices
//
// Prices: Ontario Open Government Portal — national Canadian pump prices CSV
//   GET https://ontario.ca/v1/files/fuel-prices/canadianpumppricesall.csv
//   Columns: Date, Toronto, Ottawa, Thunder Bay, St. John's, Charlottetown,
//            Halifax, Saint John, Montreal, Winnipeg, Regina, Calgary, Vancouver, Tax Status
//   Rows with Tax Status "Total" = consumer pump price in CAD cents/L (regular gasoline)
//   Updated monthly. National average applied to all stations.
//
// Stations: Overpass API — amenity=fuel nodes in Canada
//   POST https://overpass.kumi.systems/api/interpreter
//   bbox covers populated Canada (42°N–61°N, 141°W–52°W)

const CAD_EUR = 1 / 1.52; // 1 EUR ≈ 1.52 CAD
const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// City columns in order (indices 1-12, after Date=0, before Tax Status=13)
const CITY_COLS = [
  'Toronto','Ottawa','Thunder Bay','St. John\'s','Charlottetown',
  'Halifax','Saint John','Montreal','Winnipeg','Regina','Calgary','Vancouver',
];

function cadCentsToEur(val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) return null;
  const eur = +((n / 100) * CAD_EUR).toFixed(3);
  return eur > 0.1 && eur < 6 ? eur : null;
}

function parseCSVLine(line) {
  // Handle quoted fields with commas (e.g. "St. John's, Newfoundland")
  const result = [];
  let field = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  result.push(field.trim());
  return result;
}

async function fetchCanadaPrices() {
  const r = await fetch(
    'https://ontario.ca/v1/files/fuel-prices/canadianpumppricesall.csv',
    { headers: { 'User-Agent': UA, Accept: 'text/csv,text/plain' }, signal: AbortSignal.timeout(30000) }
  );
  if (!r.ok) throw new Error(`Ontario CSV HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.trim().split('\n');

  // Iterate from end; find the most recent "Total" row
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = parseCSVLine(lines[i]);
    const taxStatus = parts[13] || '';
    if (!taxStatus.includes('Total')) continue;

    // parts[1..12] = city prices in CAD cents/L
    const cityPrices = parts.slice(1, 13).map(v => parseFloat(v)).filter(n => !isNaN(n) && n > 0);
    if (!cityPrices.length) continue;

    const avg = cityPrices.reduce((a, b) => a + b, 0) / cityPrices.length;
    const eurPrice = cadCentsToEur(avg);
    if (!eurPrice) continue;

    console.log(`[canada] gasoline national avg: ${avg.toFixed(1)}¢/L → €${eurPrice} (${cityPrices.length} cities, date: ${parts[0]})`);
    return eurPrice;
  }
  throw new Error('no Total row found in Canada CSV');
}

async function fetchCanadaStations() {
  // 1. Fetch national average gasoline price
  let gasPrice;
  try {
    gasPrice = await fetchCanadaPrices();
  } catch (err) {
    console.error('[canada] price fetch error:', err.message);
    return [];
  }

  const priceList = [{ fuelType: 'sp95', price: gasPrice }];

  // 2. Fetch stations from OSM Overpass API
  // Split Canada into province groups to avoid Overpass timeout
  const bboxes = [
    [48.2, -139.0, 60.0, -114.0], // BC
    [49.0, -120.0, 60.0, -110.0], // AB
    [49.0, -110.0, 55.0,  -95.0], // SK + MB west
    [49.0,  -99.0, 55.0,  -82.0], // MB east + ON west
    [43.5,  -84.0, 50.0,  -74.0], // ON south (Toronto/Ottawa)
    [44.0,  -80.0, 55.0,  -57.0], // QC
    [44.0,  -70.0, 48.0,  -52.0], // Atlantic provinces
  ];

  const stationMap = new Map();
  for (const [latMin, lngMin, latMax, lngMax] of bboxes) {
    const query = `[out:json][timeout:180];area["ISO3166-1"="CA"]->.a;nwr["amenity"="fuel"](area.a)(${latMin},${lngMin},${latMax},${lngMax});out center;`;
    let json = null;
    // Try each mirror until one succeeds
    for (const mirror of OVERPASS_MIRRORS) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
          headers: { Accept: '*/*', 'User-Agent': UA },
          signal: AbortSignal.timeout(120000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        json = await r.json();
        break; // success
      } catch (err) {
        console.warn(`[canada] ${mirror.includes('kumi') ? 'kumi' : 'ru'} failed [${latMin},${lngMin}..${latMax},${lngMax}]: ${err.message}`);
      }
    }
    if (!json) { console.error(`[canada] all mirrors failed for bbox [${latMin},${lngMin}..${latMax},${lngMax}]`); continue; }
    try {
      for (const e of (json.elements || [])) {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        const key = `${e.type}/${e.id}`;
        if (!lat || !lng || stationMap.has(key)) continue;
        const tags = e.tags || {};
        const name = tags.name || tags['name:en'] || tags.brand || tags.operator || 'Fuel Station';
        const brand = tags.brand || tags.operator || null;
        const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '';
        const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
        stationMap.set(key, {
          externalId: `CA-OSM-${e.type}-${e.id}`,
          name, brand, lat, lng,
          address: addrParts.length ? addrParts.join(' ') : null,
          city, country: 'CA', prices: priceList,
        });
      }
      console.log(`[canada] OSM bbox [${latMin},${lngMin}..${latMax},${lngMax}]: ${stationMap.size} total`);
    } catch (err) {
      console.error(`[canada] parse error [${latMin},${lngMin}..${latMax},${lngMax}]:`, err.message);
    }
  }

  const stations = [...stationMap.values()];
  console.log(`[canada] ${stations.length} stations total`);
  return stations;
}

module.exports = { fetchCanadaStations };
