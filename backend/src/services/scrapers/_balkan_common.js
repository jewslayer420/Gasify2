// Shared helpers for the regulated/official-max-price scrapers that apply a single
// national price over OSM stations (North Macedonia ERC, Luxembourg STATEC, and the
// parked Balkans MK/ME/RS/AL/BA if revisited).
//
// These markets all have government-set maximum/regulated retail prices — a
// published regulated FACT, not a copyrightable database — applied over OSM fuel
// stations (the "Canada model"). Each country module fetches its official price,
// converts to EUR, and calls fetchRegulatedStations() to attach it to OSM stations.
//
// Station externalId prefix is `REG-<CC>-OSM-...`, distinct from the old fuelo
// `<CC>-<id>` rows so the cutover purge stays clean.

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// open.er-api.com — free, no key. EUR base. Fallbacks if it's unreachable.
const FX_URL = 'https://open.er-api.com/v6/latest/EUR';
const FX_FALLBACK = { EUR: 1, MKD: 61.5, RSD: 117, ALL: 95, BAM: 1.95583 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Units of `currency` per 1 EUR (e.g. MKD per EUR). Used to convert local→EUR.
async function eurRate(currency) {
  if (currency === 'EUR') return 1;
  try {
    const r = await fetch(FX_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const rate = j.rates && j.rates[currency];
    if (isFinite(rate) && rate > 0) return rate;
    throw new Error(`${currency} rate missing`);
  } catch (err) {
    const fb = FX_FALLBACK[currency];
    console.warn(`[balkan] FX ${currency} failed (${err.message}); fallback ${fb}`);
    return fb;
  }
}

// Convert a local price to EUR/L with sanity bounds.
function toEur(localPrice, ratePerEur) {
  const n = typeof localPrice === 'number' ? localPrice : parseFloat(localPrice);
  if (!isFinite(n) || n <= 0) return null;
  const eur = +(n / ratePerEur).toFixed(3);
  return eur >= 0.3 && eur <= 5 ? eur : null;
}

// Overpass amenity=fuel for a country bbox, with the country's regulated price list.
// bbox = [latMin, lngMin, latMax, lngMax].
async function fetchRegulatedStations(cc, bbox, priceList, label) {
  const [latMin, lngMin, latMax, lngMax] = bbox;
  const query = `[out:json][timeout:180][bbox:${latMin},${lngMin},${latMax},${lngMax}];nwr["amenity"="fuel"];out center;`;
  let json = null;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      await sleep(1500);
      const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
        headers: { Accept: '*/*', 'User-Agent': UA }, signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      json = await r.json();
      break;
    } catch (err) {
      console.warn(`[${label}] overpass ${mirror.split('/')[2]} failed: ${err.message}`);
    }
  }
  if (!json) { console.error(`[${label}] all Overpass mirrors failed`); return []; }

  const out = new Map();
  for (const e of (json.elements || [])) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const key = `${e.type}/${e.id}`;
    if (!lat || !lng || out.has(key)) continue;
    const tags = e.tags || {};
    const name = tags.name || tags['name:en'] || tags.brand || tags.operator || 'Fuel Station';
    const brand = tags.brand || tags.operator || null;
    const city = tags['addr:city'] || tags['addr:town'] || tags['addr:place'] || '';
    const addrParts = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean);
    out.set(key, {
      externalId: `REG-${cc}-OSM-${e.type}-${e.id}`,
      name, brand, lat, lng,
      address: addrParts.length ? addrParts.join(' ') : null,
      city, country: cc, prices: priceList,
    });
  }
  console.log(`[${label}] ${out.size} stations`);
  return [...out.values()];
}

module.exports = { UA, eurRate, toEur, fetchRegulatedStations, sleep };
