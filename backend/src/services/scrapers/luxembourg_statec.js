// Luxembourg fuel prices — STATEC (Institut national de la statistique) official
// MAXIMUM prices ("Prix maxima de l'essence" / "du gasoil routier"), published in
// the LUSTAT database and mirrored on the data.public.lu open-data portal under a
// CC0 licence. Applied over OpenStreetMap fuel stations (the "Canada model").
//
// WHY: replaces the carbu.com scraper (a private aggregator — legal blocker) with
// Luxembourg's official open-data source. Luxembourg's Ministry of Energy + STATEC
// set the legally-binding maximum pump prices (Super 95 E10, Super 98, diesel),
// so the national value is the real ceiling price.
//
// Source: LUSTAT SDMX REST API (lustat.statec.lu).
//   * DF_E5301 "Prix maxima de l'essence"      → MOTOR_ENERGY SP95 (E10), SP98
//   * DF_E5302 "Prix maxima du gasoil routier" → MOTOR_ENERGY DIE (diesel)
//   Values are already EUR per litre (UNIT_MEASURE=EUR_LI) — no FX needed.
//   NOTE: the API throws a 500 ("languageTag1") unless an Accept-Language header is
//   sent, and rejects version "latest" — so we send Accept-Language + version 1.0
//   and request SDMX-CSV (a clean flat table). Frequency is irregular (FREQ=I): the
//   latest observation is the current ceiling price until the next change.
//   Licence: CC0 (STATEC / data.public.lu).

const { fetchRegulatedStations } = require('./_balkan_common');

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';
const SDMX_BASE = 'https://lustat.statec.lu/rest/data';
const LU_BBOX = [49.44, 5.73, 50.18, 6.53]; // [latMin, lngMin, latMax, lngMax]

const FUEL_MAP = { SP95: 'sp95', SP98: 'sp98', DIE: 'diesel' };

// Fetch one LUSTAT dataflow as SDMX-CSV, return the latest obs per MOTOR_ENERGY.
async function fetchDataflow(dataflowId) {
  const url = `${SDMX_BASE}/LU1,DSD_PRIX_ESSENCE@${dataflowId},1.0/all?lastNObservations=1`;
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/vnd.sdmx.data+csv', 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`LUSTAT ${dataflowId} HTTP ${r.status}`);
  const csv = await r.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const cols = lines[0].split(',');
  const iEnergy = cols.indexOf('MOTOR_ENERGY');
  const iVal = cols.indexOf('OBS_VALUE');
  const iUnit = cols.indexOf('UNIT_MEASURE');
  const out = [];
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const ft = FUEL_MAP[f[iEnergy]];
    const unit = f[iUnit];
    const val = parseFloat(f[iVal]);
    if (ft && unit === 'EUR_LI' && isFinite(val) && val >= 0.3 && val <= 5) {
      out.push({ fuelType: ft, price: +val.toFixed(3) });
    }
  }
  return out;
}

async function fetchPrices() {
  const prices = new Map();
  for (const df of ['DF_E5301', 'DF_E5302']) {
    try {
      for (const { fuelType, price } of await fetchDataflow(df)) {
        if (!prices.has(fuelType)) prices.set(fuelType, price);
      }
    } catch (err) {
      console.warn(`[luxembourg-statec] ${df} failed: ${err.message}`);
    }
  }
  const list = [...prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
  console.log(`[luxembourg-statec] ${list.map(p => `${p.fuelType}=${p.price}`).join(' ')} EUR/L`);
  return list;
}

async function fetchLuxembourgStations() {
  let prices;
  try { prices = await fetchPrices(); }
  catch (err) { console.error('[luxembourg-statec] price fetch error:', err.message); return []; }
  if (!prices.length) { console.warn('[luxembourg-statec] no prices, skipping stations'); return []; }
  return fetchRegulatedStations('LU', LU_BBOX, prices, 'luxembourg-statec');
}

module.exports = { fetchLuxembourgStations, fetchPrices };
