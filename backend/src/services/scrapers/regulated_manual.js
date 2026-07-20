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
    asOf: '2026-07', source: 'UAE Fuel Price Committee (monthly, official)',
    prices: { sp95: 3.29, sp98: 3.40, diesel: 3.60 }, // AED/L (Special 95, Super 98)
  },
  {
    cc: 'SA', label: 'saudi', currency: 'SAR', bbox: [16.0, 34.5, 32.5, 55.7],
    asOf: '2026-06', source: 'Saudi Aramco retail fuel prices (official, fixed)',
    prices: { sp95: 2.33, diesel: 1.79 }, // SAR/L (Gasoline 95; 91 octane omitted)
  },
  {
    cc: 'KE', label: 'kenya', currency: 'KES', bbox: [-4.7, 33.9, 5.5, 41.9],
    asOf: '2026-06-15', source: 'EPRA monthly maximum pump prices (Nairobi reference; cycle to 14 Jul)',
    prices: { sp95: 214.03, diesel: 222.86 }, // KES/L (Super Petrol, Diesel)
  },
  {
    cc: 'DO', label: 'dominican', currency: 'DOP', bbox: [17.5, -72.0, 20.0, -68.3],
    asOf: '2026-07', source: 'MICM weekly official prices (published per gallon; frozen since Mar)',
    prices: { sp98: 341.10 / GAL, sp95: 310.50 / GAL, diesel: 262.80 / GAL }, // RD$/L
  },
  {
    cc: 'UY', label: 'uruguay', currency: 'UYU', bbox: [-35.1, -58.6, -30.0, -53.0],
    asOf: '2026-07', source: 'ANCAP (state oil co.) national prices. NOTE: official open-data API (catalogodatos.gub.uy, JSON/CSV) exists but lags ~7 months + has a TLS-CA quirk — automate later.',
    prices: { sp95: 88.67, sp98: 91.19, diesel: 58.68 }, // UYU/L (Súper 95, Premium 97, Gasoil 50S)
  },
  {
    cc: 'QA', label: 'qatar', currency: 'QAR', bbox: [24.4, 50.7, 26.2, 51.7],
    asOf: '2026-07', source: 'QatarEnergy monthly official prices',
    prices: { sp95: 2.10, diesel: 2.05 }, // QAR/L (Super 95; Premium 91 omitted)
  },
  {
    cc: 'KW', label: 'kuwait', currency: 'KWD', bbox: [28.5, 46.5, 30.1, 48.5],
    asOf: '2026-06', source: 'KPC/MEW fixed prices (subsidised, stable)',
    prices: { sp95: 0.105, diesel: 0.115 }, // KWD/L (Premium 95; Ultra 98 quarterly, omitted)
  },
  {
    cc: 'OM', label: 'oman', currency: 'OMR', bbox: [16.6, 51.9, 26.5, 59.9],
    asOf: '2026-07', source: 'Oman monthly fuel price cap (official)',
    prices: { sp95: 0.215, diesel: 0.245 }, // OMR/L (M95)
  },
  {
    cc: 'BH', label: 'bahrain', currency: 'BHD', bbox: [25.5, 50.3, 26.4, 50.8],
    asOf: '2026-07-02', source: 'Bahrain Fuel Pricing and Monitoring Committee (revised monthly since 2026)',
    prices: { sp95: 0.247, sp98: 0.362, diesel: 0.229 }, // BHD/L (Mumtaz 95, Super 98, Jayyid 91 omitted)
  },
  {
    cc: 'BN', label: 'brunei', currency: 'BND', bbox: [4.0, 114.0, 5.1, 115.4],
    asOf: '2026-06', source: 'Brunei subsidised price scheme (fixed >20yrs)',
    prices: { sp95: 0.51, sp98: 0.53, diesel: 0.31 }, // BND/L (Super 92, Premium 97; Regular 85 omitted)
  },
  {
    cc: 'EC', label: 'ecuador', currency: 'USD', bbox: [-5.0, -81.1, 1.5, -75.2],
    asOf: '2026-07-12', source: 'Ecuador price-band scheme (per US gallon; band period to 11 Aug). Súper is deregulated (varies by station — suggested value).',
    prices: { sp95: 3.265 / GAL, sp98: 5.61 / GAL, diesel: 3.204 / GAL }, // USD/L (Extra/Ecopaís, Súper, Diésel)
  },
  {
    cc: 'VN', label: 'vietnam', currency: 'VND', bbox: [8.4, 102.1, 23.4, 109.5],
    asOf: '2026-07-02', source: 'Vietnam MOIT/MOF joint retail price decisions (adjusted ~weekly, Thursdays)',
    prices: { sp95: 20415, diesel: 21176 }, // VND/L (E10 RON95-III, diesel 0.05S)
  },
  {
    cc: 'EG', label: 'egypt', currency: 'EGP', bbox: [22.0, 24.7, 31.7, 36.9],
    asOf: '2026-07', source: 'Egypt Ministry of Petroleum fuel pricing committee (quarterly; current since 2026-03-10)',
    prices: { sp95: 22.25, sp98: 24, diesel: 20.5 }, // EGP/L (92-octane standard, 95-octane premium)
  },
  {
    cc: 'JO', label: 'jordan', currency: 'JOD', bbox: [29.1, 34.9, 33.4, 39.3],
    asOf: '2026-07', source: 'Jordan Fuel Pricing Committee monthly prices (July frozen at June rates)',
    prices: { sp95: 1.310, diesel: 0.850 }, // JOD/L (Octane 95; Octane 90 omitted)
  },
  {
    cc: 'TN', label: 'tunisia', currency: 'TND', bbox: [30.2, 7.5, 37.6, 11.6],
    asOf: '2026-05', source: 'Tunisia Ministère de l\'Énergie state-set prices (adjusted irregularly)',
    prices: { sp95: 2.53, diesel: 2.21 }, // TND/L (sans plomb, gasoil)
  },
  {
    cc: 'MA', label: 'morocco', currency: 'MAD', bbox: [27.6, -13.2, 35.95, -0.9],
    asOf: '2026-07-01', source: 'Morocco national AVERAGE pump price (market — liberalized since 2015; single published fact, updated biweekly)',
    prices: { sp95: 13.84, diesel: 12.61 }, // MAD/L (essence super, gasoil)
  },
  {
    cc: 'ID', label: 'indonesia', currency: 'IDR', bbox: [-11.0, 95.0, 6.1, 141.0],
    asOf: '2026-07-01', source: 'Pertamina official published prices, DKI Jakarta reference (monthly)',
    prices: { sp95: 17000, sp98: 19300, diesel: 19700 }, // IDR/L (Pertamax Green 95, Pertamax Turbo, Dexlite)
  },
  {
    cc: 'BD', label: 'bangladesh', currency: 'BDT', bbox: [20.5, 88.0, 26.7, 92.7],
    asOf: '2026-07-01', source: 'Bangladesh BPC automatic pricing mechanism (monthly; July unchanged per EMRD)',
    prices: { sp95: 140, sp98: 145, diesel: 115 }, // BDT/L (petrol, octane, diesel)
  },
  {
    cc: 'LK', label: 'srilanka', currency: 'LKR', bbox: [5.9, 79.6, 9.9, 81.9],
    asOf: '2026-07-01', source: 'Sri Lanka CPC monthly price revisions (petrol 92, auto diesel)',
    prices: { sp95: 414, diesel: 382 }, // LKR/L
  },
  {
    cc: 'NP', label: 'nepal', currency: 'NPR', bbox: [26.3, 80.0, 30.5, 88.2],
    asOf: '2026-07', source: 'Nepal Oil Corporation retail prices, Kathmandu reference (~fortnightly)',
    prices: { sp95: 217, diesel: 225 }, // NPR/L
  },
  {
    cc: 'CR', label: 'costarica', currency: 'CRC', bbox: [8.0, -85.9, 11.2, -82.5],
    asOf: '2026-07-14', source: 'Costa Rica ARESEP regulated prices (uniform at all stations)',
    prices: { sp95: 756, diesel: 683 }, // CRC/L (gasolina súper, diésel)
  },
  {
    cc: 'PA', label: 'panama', currency: 'USD', bbox: [7.2, -83.1, 9.7, -77.1],
    asOf: '2026-06-26', source: 'Panama Secretaría Nacional de Energía biweekly max prices',
    prices: { sp95: 1.178, diesel: 1.104 }, // USD/L (95 octanos, diésel)
  },
  {
    cc: 'AZ', label: 'azerbaijan', currency: 'AZN', bbox: [38.4, 44.7, 41.9, 50.4],
    asOf: '2026-07', source: 'Azerbaijan Tariff Council fixed prices (since 2026-01-01)',
    prices: { sp95: 1.15, sp98: 1.60, diesel: 1.10 }, // AZN/L (AI-92, AI-95)
  },
  {
    cc: 'DZ', label: 'algeria', currency: 'DZD', bbox: [19.0, -8.7, 37.1, 12.0],
    asOf: '2026-07', source: 'Algeria ARH state-fixed prices (since 2026-01-01; heavily subsidised)',
    prices: { sp95: 47, diesel: 31 }, // DZD/L (essence, gasoil; GPL 12 DZD ≈ €0.08 is below the toEur floor — omitted)
  },
  {
    cc: 'MD', label: 'moldova', currency: 'MDL', bbox: [45.4, 26.6, 48.5, 30.2],
    asOf: '2026-07-03', source: 'Moldova ANRE daily maximum prices (benzina 95, motorina)',
    prices: { sp95: 27.82, diesel: 24.79 }, // MDL/L
  },
  {
    cc: 'IL', label: 'israel', currency: 'ILS', bbox: [29.4, 34.2, 33.4, 35.9],
    asOf: '2026-07-01', source: 'Israel Ministry of Energy monthly regulated max price, 95 octane self-service incl. VAT (diesel is unregulated — omitted)',
    prices: { sp95: 7.48 }, // ILS/L
  },
  {
    cc: 'PK', label: 'pakistan', currency: 'PKR', bbox: [23.6, 60.8, 37.1, 77.8],
    asOf: '2026-07-04', source: 'Pakistan OGRA-notified prices (fortnightly, uniform nationwide)',
    prices: { sp95: 297.53, diesel: 309.50 }, // PKR/L (petrol, HSD)
  },
  {
    cc: 'JP', label: 'japan', currency: 'JPY', bbox: [24.0, 122.9, 45.6, 146.0],
    asOf: '2026-06-29', source: 'Japan METI weekly national average retail prices (official statistic; market — not regulated)',
    prices: { sp95: 169.8, diesel: 152.74 }, // JPY/L (regular, keiyu)
  },
  {
    cc: 'IN', label: 'india', currency: 'INR', bbox: [6.5, 68.1, 35.7, 97.4],
    asOf: '2026-07-05', source: 'India OMC (IOCL/BPCL/HPCL) published prices, Delhi reference (revised daily; varies by state VAT)',
    prices: { sp95: 102.12, diesel: 95.20 }, // INR/L (petrol, diesel — Delhi)
  },
  {
    cc: 'XK', label: 'kosovo', currency: 'EUR', bbox: [41.8, 20.0, 43.3, 21.8],
    asOf: '2026-07-05', source: 'Kosovo MINT ministerial decisions — maximum derivative prices (published every few days)',
    prices: { sp95: 1.36, diesel: 1.41, lpg: 0.64 }, // EUR/L (benzina, nafta, gas)
  },
  // ── Ex-fuelo.net European countries, migrated to clean sources 2026-06-18 ──
  {
    cc: 'RS', label: 'serbia', currency: 'RSD', bbox: [42.2, 18.8, 46.2, 23.1],
    asOf: '2026-07-03', source: 'Serbia Ministry of Internal & Foreign Trade weekly max prices (Fridays)',
    prices: { sp95: 193, sp98: 220, diesel: 217 }, // RSD/L (BMB95, BMB100, evro dizel)
  },
  {
    cc: 'ME', label: 'montenegro', currency: 'EUR', bbox: [41.8, 18.4, 43.6, 20.4],
    asOf: '2026-06-30', source: 'Montenegro Ministry of Energy weekly decree max prices',
    prices: { sp95: 1.59, sp98: 1.63, diesel: 1.55 }, // EUR/L (Eurosuper 95/98, Eurodizel)
  },
  {
    cc: 'AL', label: 'albania', currency: 'ALL', bbox: [39.6, 19.2, 42.7, 21.1],
    asOf: '2026-07-12', source: 'Albania Bordi i Transparencës max retail prices (17 Jun decision still in force, re-verified 12 Jul)',
    prices: { sp95: 166, diesel: 176 }, // ALL/L (benzin, nafta)
  },
  {
    cc: 'CH', label: 'switzerland', currency: 'CHF', bbox: [45.8, 5.9, 47.8, 10.5],
    asOf: '2026-06-24', source: 'Switzerland national AVERAGE retail price (TCS; market — NOT regulated; single published fact)',
    prices: { sp95: 1.81, sp98: 1.92, diesel: 1.98 }, // CHF/L
  },
  {
    cc: 'BA', label: 'bosnia', currency: 'BAM', bbox: [42.5, 15.7, 45.3, 19.7],
    asOf: '2026-07-13', source: 'Bosnia & Herzegovina national AVERAGE retail price (market — NOT a unified regulated price; published fact)',
    prices: { sp95: 2.76, diesel: 2.80 }, // BAM/L
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
  fetchKosovoStations: byCc.XK,
  fetchVietnamStations: byCc.VN,
  fetchEgyptStations: byCc.EG,
  fetchJordanStations: byCc.JO,
  fetchTunisiaStations: byCc.TN,
  fetchMoroccoStations: byCc.MA,
  fetchIndonesiaStations: byCc.ID,
  fetchIndiaStations: byCc.IN,
  fetchMoldovaStations: byCc.MD,
  fetchIsraelStations: byCc.IL,
  fetchPakistanStations: byCc.PK,
  fetchJapanStations: byCc.JP,
  fetchBangladeshStations: byCc.BD,
  fetchSriLankaStations: byCc.LK,
  fetchNepalStations: byCc.NP,
  fetchCostaRicaStations: byCc.CR,
  fetchPanamaStations: byCc.PA,
  fetchAzerbaijanStations: byCc.AZ,
  fetchAlgeriaStations: byCc.DZ,
  fetchSerbiaStations: byCc.RS,
  fetchMontenegroStations: byCc.ME,
  fetchAlbaniaStations: byCc.AL,
  fetchSwitzerlandStations: byCc.CH,
  fetchBosniaStations: byCc.BA,
  REGULATED_MANUAL: COUNTRIES,
};
