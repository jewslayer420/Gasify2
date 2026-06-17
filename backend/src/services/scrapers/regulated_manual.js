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
  {
    cc: 'UY', label: 'uruguay', currency: 'UYU', bbox: [-35.1, -58.6, -30.0, -53.0],
    asOf: '2026-06', source: 'ANCAP (state oil co.) national prices. NOTE: official open-data API (catalogodatos.gub.uy, JSON/CSV) exists but lags ~7 months + has a TLS-CA quirk — automate later.',
    prices: { sp95: 93.36, sp98: 96.00, diesel: 61.76 }, // UYU/L (Súper 95, Premium 97, Gasoil 50S)
  },
  {
    cc: 'QA', label: 'qatar', currency: 'QAR', bbox: [24.4, 50.7, 26.2, 51.7],
    asOf: '2026-06', source: 'QatarEnergy monthly official prices',
    prices: { sp95: 2.10, diesel: 2.05 }, // QAR/L (Super 95; Premium 91 omitted)
  },
  {
    cc: 'KW', label: 'kuwait', currency: 'KWD', bbox: [28.5, 46.5, 30.1, 48.5],
    asOf: '2026-06', source: 'KPC/MEW fixed prices (subsidised, stable)',
    prices: { sp95: 0.105, diesel: 0.115 }, // KWD/L (Premium 95; Ultra 98 quarterly, omitted)
  },
  {
    cc: 'OM', label: 'oman', currency: 'OMR', bbox: [16.6, 51.9, 26.5, 59.9],
    asOf: '2026-06', source: 'Oman monthly fuel price cap (official)',
    prices: { sp95: 0.240, diesel: 0.260 }, // OMR/L (M95)
  },
  {
    cc: 'BH', label: 'bahrain', currency: 'BHD', bbox: [25.5, 50.3, 26.4, 50.8],
    asOf: '2026-06', source: 'Bahrain official fuel prices (NOGA)',
    prices: { sp95: 0.269, sp98: 0.362, diesel: 0.229 }, // BHD/L (Mumtaz 95, Super 98, Jayyid 91 omitted)
  },
  {
    cc: 'BN', label: 'brunei', currency: 'BND', bbox: [4.0, 114.0, 5.1, 115.4],
    asOf: '2026-06', source: 'Brunei subsidised price scheme (fixed >20yrs)',
    prices: { sp95: 0.51, sp98: 0.53, diesel: 0.31 }, // BND/L (Super 92, Premium 97; Regular 85 omitted)
  },
  {
    cc: 'EC', label: 'ecuador', currency: 'USD', bbox: [-5.0, -81.1, 1.5, -75.2],
    asOf: '2026-06', source: 'Ecuador price-band scheme (per US gallon). Súper is deregulated (varies by station — suggested value).',
    prices: { sp95: 3.312 / GAL, sp98: 5.65 / GAL, diesel: 3.251 / GAL }, // USD/L (Extra/Ecopaís, Súper, Diésel)
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
  fetchUruguayStations: byCc.UY,
  fetchQatarStations: byCc.QA,
  fetchKuwaitStations: byCc.KW,
  fetchOmanStations: byCc.OM,
  fetchBahrainStations: byCc.BH,
  fetchBruneiStations: byCc.BN,
  fetchEcuadorStations: byCc.EC,
  REGULATED_MANUAL: COUNTRIES,
};
