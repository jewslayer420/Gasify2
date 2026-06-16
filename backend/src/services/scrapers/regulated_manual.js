// Manually-maintained regulated national fuel prices over OSM stations.
//
// These countries set a single, nationally-uniform retail price by government /
// state-oil regulator (a published regulated FACT, not a copyrightable database),
// but publish it only via monthly/weekly announcements with no clean machine API.
// Rather than scrape fragile news/PDF sources, we keep the current official price as
// a constant here (the same approach already used for South Africa) and apply it
// over OSM fuel stations (the "Canada model"). Prices change slowly (monthly /
// quarterly), so a periodic manual refresh is low-effort.
//
// 🔁 TO UPDATE: edit `prices` (LOCAL currency per LITRE) + `asOf` when the regulator
//    revises. Local→EUR uses the live ECB-style rate (open.er-api.com) at sync time.
//    Cite the official source in `source`.
//
// externalId prefix: `REG-<CC>-OSM-...` (shared with the other regulated scrapers).

const { eurRate, toEur, fetchRegulatedStations } = require('./_balkan_common');

const GAL = 3.78541; // US gallon → litre (Dominican Republic publishes per gallon)

// bbox = [latMin, lngMin, latMax, lngMax]
const COUNTRIES = [
  {
    cc: 'AE', label: 'uae', currency: 'AED', bbox: [22.5, 51.5, 26.5, 56.5],
    asOf: '2026-06', source: 'UAE Fuel Price Committee (monthly, official)',
    prices: { sp95: 3.83, sp98: 3.95, diesel: 4.33 }, // AED/L (Special 95, Super 98)
  },
  {
    cc: 'SA', label: 'saudi', currency: 'SAR', bbox: [16.0, 34.5, 32.5, 55.7],
    asOf: '2026-06', source: 'Saudi Aramco retail fuel prices (official, fixed)',
    prices: { sp95: 2.33, diesel: 1.79 }, // SAR/L (Gasoline 95; 91 octane omitted)
  },
  {
    cc: 'KE', label: 'kenya', currency: 'KES', bbox: [-4.7, 33.9, 5.5, 41.9],
    asOf: '2026-06', source: 'EPRA monthly maximum pump prices (Nairobi reference)',
    prices: { sp95: 214.03, diesel: 222.86 }, // KES/L (Super Petrol, Diesel)
  },
  {
    cc: 'DO', label: 'dominican', currency: 'DOP', bbox: [17.5, -72.0, 20.0, -68.3],
    asOf: '2026-06', source: 'MICM weekly official prices (published per gallon)',
    prices: { sp98: 341.10 / GAL, sp95: 310.50 / GAL, diesel: 262.80 / GAL }, // RD$/L
  },
];

async function fetchCountry(cfg) {
  const rate = await eurRate(cfg.currency);
  const list = [];
  for (const [fuelType, local] of Object.entries(cfg.prices)) {
    const eur = toEur(local, rate);
    if (eur) list.push({ fuelType, price: eur });
  }
  console.log(`[${cfg.label}] ${list.map(p => `${p.fuelType}=${p.price}`).join(' ')} EUR/L (rate ${rate} ${cfg.currency}/EUR, prices ${cfg.asOf})`);
  if (!list.length) return [];
  return fetchRegulatedStations(cfg.cc, cfg.bbox, list, cfg.label);
}

const byCc = Object.fromEntries(COUNTRIES.map(c => [c.cc, () => fetchCountry(c)]));

module.exports = {
  fetchUAEStations: byCc.AE,
  fetchSaudiArabiaStations: byCc.SA,
  fetchKenyaStations: byCc.KE,
  fetchDominicanStations: byCc.DO,
  REGULATED_MANUAL: COUNTRIES,
};
