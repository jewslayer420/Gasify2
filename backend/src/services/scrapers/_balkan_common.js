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

const { overpassFuelByCountry, osmToStation } = require('./_overpass');

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';

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

// Convert a local price to EUR/L with sanity bounds. Floor is 0.1 €/L to allow
// heavily-subsidised markets (e.g. Kuwait ~€0.29, Gulf states) while still rejecting
// near-zero parse garbage.
function toEur(localPrice, ratePerEur) {
  const n = typeof localPrice === 'number' ? localPrice : parseFloat(localPrice);
  if (!isFinite(n) || n <= 0) return null;
  const eur = +(n / ratePerEur).toFixed(3);
  return eur >= 0.1 && eur <= 5 ? eur : null;
}

// Overpass amenity=fuel for a country bbox, with the country's regulated price list.
// Stations strictly inside country `cc` (admin-boundary area, not a bbox — so border
// stations aren't mis-tagged). `bbox` is now unused (kept for the caller signature).
async function fetchRegulatedStations(cc, bbox, priceList, label) {
  const elements = await overpassFuelByCountry(cc, label);
  if (elements === null) return []; // all mirrors failed — skip, don't wipe
  const out = new Map();
  for (const e of elements) {
    const key = `${e.type}/${e.id}`;
    if (out.has(key)) continue;
    const s = osmToStation(e, cc, 'REG', priceList);
    if (s) out.set(key, s);
  }
  console.log(`[${label}] ${out.size} stations`);
  return [...out.values()];
}

module.exports = { UA, eurRate, toEur, fetchRegulatedStations, sleep };
