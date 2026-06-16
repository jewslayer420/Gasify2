// EU national fuel prices — European Commission Weekly Oil Bulletin (DG Energy)
// + OpenStreetMap station locations (the "Canada model": one official national
// price applied to every OSM fuel station in the country).
//
// WHY: replaces the fuelo.net scrapers (a private aggregator — legal blocker)
// for EU member states with a clean, commercially-reusable official source.
//
// Prices: "Price Developments 2005 onwards" historical workbook (updated weekly,
//   stable document URL). Sheet "Prices with taxes" — consumer prices incl. all
//   duties/taxes. Columns are named per country/product, e.g.
//   "BG_price_with_tax_euro95". Non-eurozone countries also carry a
//   "<CC>_exchange_rate" column, so we map columns BY HEADER NAME, never by
//   fixed offset. Values are EUR per 1000 L  →  €/L = value / 1000.
//   Latest week = the first data row (rows are newest-first).
//   Licence: CC BY 4.0 (European Commission). Attribute "European Commission,
//   Weekly Oil Bulletin". https://energy.ec.europa.eu/.../weekly-oil-bulletin_en
//
// Stations: Overpass API — amenity=fuel nodes per country (one bbox each).
//
// Granularity tradeoff: every station in a country shows the same national
// price. Per-station upgrades (TR/RO/GR official sources) are tracked separately
// in docs/DATA_SOURCES.md.

const XLSX = require('xlsx');

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';

// Stable historical workbook (same document, refreshed weekly by DG Energy).
const BULLETIN_URL =
  'https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en';

const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// EU fuelo.net countries to replace. `cc` is both the Oil Bulletin column code
// and our station country code (2-letter ISO; Greece is "GR" in both).
// bbox = [latMin, lngMin, latMax, lngMax].
const BULLETIN_COUNTRIES = [
  { cc: 'BE', bbox: [49.4,  2.5, 51.6,  6.5] },
  { cc: 'BG', bbox: [41.2, 22.3, 44.3, 28.7] },
  // Cyprus — new coverage (not a fuelo replacement). National price over OSM; the
  // bulletin price is the Republic of Cyprus value. Per-station upgrade available via
  // the MCIT observatory eForm (eforms.eservices.cyprus.gov.cy) — see DATA_SOURCES.md.
  { cc: 'CY', bbox: [34.55, 32.27, 35.75, 34.60] },
  { cc: 'CZ', bbox: [48.5, 12.0, 51.2, 18.9] },
  { cc: 'EE', bbox: [57.5, 21.7, 59.8, 28.3] },
  { cc: 'GR', bbox: [34.7, 19.3, 41.8, 28.4] },
  { cc: 'HR', bbox: [42.3, 13.4, 46.6, 19.5] },
  { cc: 'HU', bbox: [45.7, 16.0, 48.7, 22.95] },
  { cc: 'IE', bbox: [51.3, -10.7, 55.5, -5.9] },
  { cc: 'LT', bbox: [53.8, 20.9, 56.5, 27.0] },
  { cc: 'LV', bbox: [55.6, 20.9, 58.1, 28.3] },
  { cc: 'NL', bbox: [50.7,  3.3, 53.7,  7.3] },
  { cc: 'PL', bbox: [48.9, 14.0, 55.0, 24.2] },
  { cc: 'RO', bbox: [43.5, 20.2, 48.3, 29.8] },
  { cc: 'SK', bbox: [47.7, 16.8, 49.7, 22.6] },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function eurPerLitre(per1000L) {
  const n = typeof per1000L === 'number' ? per1000L : parseFloat(per1000L);
  if (!isFinite(n) || n <= 0) return null;
  const eur = +(n / 1000).toFixed(3);
  return eur >= 0.4 && eur <= 4 ? eur : null; // sanity bounds for €/L
}

// Download + parse the bulletin → { CC: { sp95, diesel, lpg }, ... } in €/L.
async function fetchBulletinPrices() {
  const r = await fetch(BULLETIN_URL, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*' },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Oil Bulletin HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets['Prices with taxes'];
  if (!sheet) throw new Error('sheet "Prices with taxes" not found');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // Map every column by its header name.
  const hdr = rows[0] || [];
  const colOf = {};
  hdr.forEach((h, c) => { if (typeof h === 'string') colOf[h.trim()] = c; });

  // Latest week = first row whose first cell is an Excel date serial.
  const latest = rows.find(r => typeof r[0] === 'number');
  if (!latest) throw new Error('no data row found');
  const weekSerial = latest[0];
  const weekDate = new Date(Date.UTC(1899, 11, 30) + weekSerial * 86400000).toISOString().slice(0, 10);

  const prices = {};
  for (const { cc } of BULLETIN_COUNTRIES) {
    const sp95 = eurPerLitre(latest[colOf[`${cc}_price_with_tax_euro95`]]);
    const diesel = eurPerLitre(latest[colOf[`${cc}_price_with_tax_diesel`]]);
    const lpg = eurPerLitre(latest[colOf[`${cc}_price_with_tax_LPG`]]);
    const list = [];
    if (sp95) list.push({ fuelType: 'sp95', price: sp95 });
    if (diesel) list.push({ fuelType: 'diesel', price: diesel });
    if (lpg) list.push({ fuelType: 'lpg', price: lpg });
    prices[cc] = list;
  }
  console.log(`[eu-bulletin] week ${weekDate}: prices for ${Object.values(prices).filter(l => l.length).length}/${BULLETIN_COUNTRIES.length} countries`);
  return prices;
}

// Fetch amenity=fuel nodes for one country bbox via Overpass (mirror fallback).
async function fetchCountryStations(cc, bbox, priceList) {
  const [latMin, lngMin, latMax, lngMax] = bbox;
  const query = `[out:json][timeout:180][bbox:${latMin},${lngMin},${latMax},${lngMax}];nwr["amenity"="fuel"];out center;`;
  let json = null;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      await sleep(1500);
      const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
        headers: { Accept: '*/*', 'User-Agent': UA },
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      json = await r.json();
      break;
    } catch (err) {
      console.warn(`[eu-bulletin] ${cc} overpass ${mirror.split('/')[2]} failed: ${err.message}`);
    }
  }
  if (!json) { console.error(`[eu-bulletin] ${cc}: all Overpass mirrors failed`); return []; }

  const out = new Map();
  for (const e of (json.elements || [])) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const key = `${e.type}/${e.id}`;
    if (!lat || !lng || out.has(key)) continue;
    const tags = e.tags || {};
    const name = tags.name || tags['name:en'] || tags.brand || tags.operator || 'Fuel Station';
    const brand = tags.brand || tags.operator || null;
    const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '';
    const addrParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    out.set(key, {
      externalId: `EUB-${cc}-OSM-${e.type}-${e.id}`,
      name, brand, lat, lng,
      address: addrParts.length ? addrParts.join(' ') : null,
      city, country: cc, prices: priceList,
    });
  }
  console.log(`[eu-bulletin] ${cc}: ${out.size} stations`);
  return [...out.values()];
}

async function fetchEUBulletinStations() {
  let prices;
  try {
    prices = await fetchBulletinPrices();
  } catch (err) {
    console.error('[eu-bulletin] price fetch error:', err.message);
    return [];
  }

  const all = [];
  for (const { cc, bbox } of BULLETIN_COUNTRIES) {
    const priceList = prices[cc];
    if (!priceList || !priceList.length) {
      console.warn(`[eu-bulletin] ${cc}: no bulletin price, skipping stations`);
      continue;
    }
    try {
      const stations = await fetchCountryStations(cc, bbox, priceList);
      all.push(...stations);
    } catch (err) {
      console.error(`[eu-bulletin] ${cc} station error:`, err.message);
    }
  }
  console.log(`[eu-bulletin] ${all.length} stations total across ${BULLETIN_COUNTRIES.length} countries`);
  return all;
}

module.exports = { fetchEUBulletinStations, fetchBulletinPrices, BULLETIN_COUNTRIES };
