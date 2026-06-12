const cron = require('node-cron');
const prisma = require('../lib/prisma');

const { fetchSloveniaStations }  = require('./scrapers/slovenia');
const { fetchFranceStations }    = require('./scrapers/france');
const { fetchSpainStations }     = require('./scrapers/spain');
const { fetchItalyStations }     = require('./scrapers/italy');
const { fetchPortugalStations }  = require('./scrapers/portugal');
const { fetchAustriaStations }   = require('./scrapers/austria');
const { fetchPolandStations }    = require('./scrapers/poland');
const { fetchNLStations }        = require('./scrapers/netherlands');
const { fetchGermanyStations }   = require('./scrapers/germany');
const { fetchCroatiaStations }   = require('./scrapers/croatia');
const { fetchCzechiaStations }   = require('./scrapers/czechia');
const { fetchSwitzerlandStations } = require('./scrapers/switzerland');
const { fetchSlovakiaStations }  = require('./scrapers/slovakia');
const { fetchHungaryStations }   = require('./scrapers/hungary');
const { fetchRomaniaStations }   = require('./scrapers/romania');
const { fetchSerbiaStations }    = require('./scrapers/serbia');
const { fetchBulgariaStations }  = require('./scrapers/bulgaria');
const { fetchGreeceStations }    = require('./scrapers/greece');
const { fetchBosniaStations }    = require('./scrapers/bosnia');
const { fetchMontenegroStations } = require('./scrapers/montenegro');
const { fetchNorthMacedoniaStations } = require('./scrapers/northmacedonia');
const { fetchAlbaniaStations }   = require('./scrapers/albania');
const { fetchDenmarkStations }   = require('./scrapers/denmark');
const { fetchUKStations }        = require('./scrapers/uk');
const { fetchIrelandStations }   = require('./scrapers/ireland');
const { fetchBelgiumStations }   = require('./scrapers/belgium');
const { fetchFinlandStations }   = require('./scrapers/finland');
const { fetchLatviaStations }    = require('./scrapers/latvia');
const { fetchLithuaniaStations } = require('./scrapers/lithuania');
const { fetchEstoniaStations }   = require('./scrapers/estonia');
const { fetchTurkeyStations }    = require('./scrapers/turkey');
const { fetchNorwayStations }    = require('./scrapers/norway');
const { fetchSwedenStations }    = require('./scrapers/sweden');
const { fetchLuxembourgStations } = require('./scrapers/luxembourg');
const { fetchAustraliaStations }  = require('./scrapers/australia');
const { fetchIcelandStations }    = require('./scrapers/iceland');
const { fetchQLDStations }        = require('./scrapers/australia_qld');
const { fetchVICStations }        = require('./scrapers/australia_vic');
const { fetchMexicoStations }     = require('./scrapers/mexico');
const { fetchTaiwanStations }     = require('./scrapers/taiwan');
const { fetchMalaysiaStations }   = require('./scrapers/malaysia');
const { fetchThailandStations }   = require('./scrapers/thailand');
const { fetchNewZealandStations } = require('./scrapers/newzealand');
const { fetchSouthKoreaStations } = require('./scrapers/southkorea');
const { fetchCanadaStations }     = require('./scrapers/canada');
const { fetchChileStations }      = require('./scrapers/chile');
const { fetchBrazilStations }     = require('./scrapers/brazil');
const { fetchArgentinaStations }  = require('./scrapers/argentina');
const { fetchUSAStations }        = require('./scrapers/usa');
const { fetchSouthAfricaStations } = require('./scrapers/southafrica');
const { fetchEUBulletinStations } = require('./scrapers/eu_oil_bulletin');

const CHUNK = 500;

// Bulk upsert: insert new stations, update changed prices, record history
async function bulkUpsertStations(stations, label) {
  if (!stations.length) { console.log(`[sync] ${label}: 0 stations, skipping`); return; }
  let totalNew = 0, totalUpdated = 0;

  for (let i = 0; i < stations.length; i += CHUNK) {
    const batch = stations.slice(i, i + CHUNK);
    const stationRows = batch.map(({ prices, ...s }) => s);

    await prisma.station.createMany({ data: stationRows, skipDuplicates: true });

    const saved = await prisma.station.findMany({
      where: { externalId: { in: stationRows.map(s => s.externalId) } },
      select: { id: true, externalId: true },
    });
    const idMap = new Map(saved.map(s => [s.externalId, s.id]));
    const stationIds = saved.map(s => s.id);

    const existingPrices = await prisma.fuelPrice.findMany({
      where: { stationId: { in: stationIds } },
      select: { stationId: true, fuelType: true, price: true },
    });
    const existingMap = new Map(existingPrices.map(p => [`${p.stationId}|${p.fuelType}`, p.price]));

    const toInsert = [], toUpdate = [], historyRows = [];
    for (const s of batch) {
      const stationId = idMap.get(s.externalId);
      if (!stationId) continue;
      for (const { fuelType, price } of s.prices) {
        const key = `${stationId}|${fuelType}`;
        const old = existingMap.get(key);
        if (old === undefined) {
          toInsert.push({ stationId, fuelType, price });
        } else if (old !== price) {
          toUpdate.push({ stationId, fuelType, price });
          historyRows.push({ stationId, fuelType, price });
        }
      }
    }

    if (toInsert.length) await prisma.fuelPrice.createMany({ data: toInsert });

    for (let j = 0; j < toUpdate.length; j += 100) {
      await prisma.$transaction(
        toUpdate.slice(j, j + 100).map(p =>
          prisma.fuelPrice.update({
            where: { stationId_fuelType: { stationId: p.stationId, fuelType: p.fuelType } },
            data: { price: p.price },
          })
        )
      );
    }

    if (historyRows.length) await prisma.priceHistory.createMany({ data: historyRows });

    totalNew += toInsert.length;
    totalUpdated += toUpdate.length;
    console.log(`[sync] ${label}: ${Math.min(i + CHUNK, stations.length)}/${stations.length} stations`);
  }
  console.log(`[sync] ${label} done — ${totalNew} new prices, ${totalUpdated} updated`);
}

// Build a lat/lng cache from existing DB stations to avoid re-geocoding on every run
async function buildCoordsCache(prefix) {
  const rows = await prisma.station.findMany({
    where: { externalId: { startsWith: prefix } },
    select: { externalId: true, lat: true, lng: true },
  });
  return new Map(rows.map(r => [r.externalId, { lat: r.lat, lng: r.lng }]));
}

async function runSync(label, fetchFn) {
  console.log(`[sync] Starting ${label}…`);
  try {
    const stations = await fetchFn();
    await bulkUpsertStations(stations, label);
  } catch (err) {
    console.error(`[sync] ${label} error:`, err.message);
  }
}

// ── Fast government API countries — every 6 hours ──────────────────────────
// Staggered by 10 min so they don't all hit at minute 0

function scheduleGovernmentAPIs() {
  // France: 0:00, 6:00, 12:00, 18:00
  cron.schedule('0 0,6,12,18 * * *',   () => runSync('France',   fetchFranceStations));
  // Spain: every 6h offset by 10min
  cron.schedule('10 0,6,12,18 * * *',  () => runSync('Spain',    fetchSpainStations));
  // Italy: every 6h offset by 20min
  cron.schedule('20 0,6,12,18 * * *',  () => runSync('Italy',    fetchItalyStations));
  // Portugal: every 6h offset by 30min
  cron.schedule('30 0,6,12,18 * * *',  () => runSync('Portugal', fetchPortugalStations));
  // Austria: every 6h offset by 40min
  cron.schedule('40 0,6,12,18 * * *',  () => runSync('Austria',  fetchAustriaStations));
  // Poland: every 6h offset by 50min
  cron.schedule('50 0,6,12,18 * * *',  () => runSync('Poland',   fetchPolandStations));
  // Australia: every 6h offset by 55min (WA FuelWatch + NSW FuelCheck + TAS)
  cron.schedule('55 0,6,12,18 * * *',  () => runSync('Australia', fetchAustraliaStations));
  // Iceland: every 6h (Gasvaktin updates every 15 min — no key required)
  cron.schedule('5 1,7,13,19 * * *',   () => runSync('Iceland',   fetchIcelandStations));
  // Mexico: every 4h (CRE XML updates every 4h, no auth)
  cron.schedule('15 0,4,8,12,16,20 * * *', () => runSync('Mexico', fetchMexicoStations));
  // Taiwan: daily (CPC updates prices weekly on Thursdays)
  cron.schedule('30 2 * * *', () => runSync('Taiwan', fetchTaiwanStations));
  // Malaysia: weekly (data.gov.my updates every Wednesday; OSM stations stable)
  cron.schedule('0 3 * * 3', () => runSync('Malaysia', fetchMalaysiaStations));
  // Thailand: daily (thai-oil-api prices can change daily)
  cron.schedule('0 3 * * *', () => runSync('Thailand', fetchThailandStations));
  // New Zealand: weekly (MBIE CSV updates Wednesdays)
  cron.schedule('30 3 * * 3', () => runSync('NewZealand', fetchNewZealandStations));
  // South Korea: daily (Opinet prices update daily)
  cron.schedule('15 3 * * *', () => runSync('SouthKorea', fetchSouthKoreaStations));
  // Canada: monthly (Ontario CSV updates monthly; OSM stations stable)
  cron.schedule('0 4 1 * *', () => runSync('Canada', fetchCanadaStations));
  // Chile: daily (CNE Bencina en Línea updates daily; needs CL_CNE_EMAIL/PASSWORD)
  cron.schedule('45 3 * * *', () => runSync('Chile', fetchChileStations));
  // Brazil: weekly (ANP national avg updates Fridays; OSM stations stable) — Sat 04:30
  cron.schedule('30 4 * * 6', () => runSync('Brazil', fetchBrazilStations));
  // Argentina: daily (Secretaría de Energía surtidor CSV; only reachable from some IPs)
  cron.schedule('0 4 * * *', () => runSync('Argentina', fetchArgentinaStations));
  // USA: weekly (EIA national avg updates Mondays; OSM stations stable) — Sun 05:00
  cron.schedule('0 5 * * 0', () => runSync('USA', fetchUSAStations));
  // South Africa: weekly (DMPR regulated price set monthly; OSM stable) — Sun 05:30
  cron.schedule('30 5 * * 0', () => runSync('SouthAfrica', fetchSouthAfricaStations));
}

// ── Slow fuelo.net grid scrapers — once daily ────────────────────────────────
// Run sequentially overnight to avoid Cloudflare rate limits

async function runNightlySlowSync() {
  console.log('[sync] Nightly slow sync starting…');
  await runSync('Slovenia',    fetchSloveniaStations);
  await runSync('Netherlands', fetchNLStations);         // extra NL coverage
  await runSync('Croatia',     fetchCroatiaStations);
  await runSync('Czechia',     fetchCzechiaStations);
  await runSync('Switzerland', fetchSwitzerlandStations);
  await runSync('Slovakia',    fetchSlovakiaStations);
  await runSync('Hungary',     fetchHungaryStations);
  await runSync('Romania',     fetchRomaniaStations);
  await runSync('Serbia',         fetchSerbiaStations);
  await runSync('Bulgaria',       fetchBulgariaStations);
  await runSync('Greece',         fetchGreeceStations);
  await runSync('Bosnia',         fetchBosniaStations);
  await runSync('Montenegro',     fetchMontenegroStations);
  await runSync('NorthMacedonia', fetchNorthMacedoniaStations);
  await runSync('Albania',        fetchAlbaniaStations);
  await runSync('Denmark',        fetchDenmarkStations);
  await runSync('UK',             fetchUKStations);
  await runSync('Ireland',        fetchIrelandStations);
  await runSync('Belgium',        fetchBelgiumStations);
  await runSync('Finland',        fetchFinlandStations);
  await runSync('Latvia',         fetchLatviaStations);
  await runSync('Lithuania',      fetchLithuaniaStations);
  await runSync('Estonia',        fetchEstoniaStations);
  await runSync('Turkey',         fetchTurkeyStations);
  await runSync('Germany',    fetchGermanyStations);
  await runSync('Luxembourg', fetchLuxembourgStations);
  // Norway/Sweden skipped — no public price APIs (see scrapers/*.js)
  await runSync('QLD',  fetchQLDStations);   // requires QLD_FUEL_API_KEY
  await runSync('VIC',  fetchVICStations);   // requires VIC_FUEL_API_KEY
  console.log('[sync] Nightly slow sync complete');
}

// Run every scraper once, strictly one at a time. Peak memory stays at a single
// scraper's working set (which steady-state has proven fits in 512MB), avoiding
// the boot-time concurrency spike that OOM-killed the free Render instance when
// ~25 staggered setTimeout syncs overlapped with the GeoJSON prewarm.
async function runAllSyncsOnce() {
  console.log('[sync] Boot sync starting (sequential)…');
  const seq = [
    ['France',      fetchFranceStations],
    ['Spain',       fetchSpainStations],
    ['Italy',       fetchItalyStations],
    ['Portugal',    fetchPortugalStations],
    ['Austria',     fetchAustriaStations],
    ['Poland',      fetchPolandStations],
    ['Germany',     fetchGermanyStations],
    ['Luxembourg',  fetchLuxembourgStations],
    ['Australia',   fetchAustraliaStations],
    ['Iceland',     fetchIcelandStations],
    ['Mexico',      fetchMexicoStations],
    ['Taiwan',      fetchTaiwanStations],
    ['Malaysia',    fetchMalaysiaStations],
    ['Thailand',    fetchThailandStations],
    ['NewZealand',  fetchNewZealandStations],
    ['SouthKorea',  fetchSouthKoreaStations],
    ['Canada',      fetchCanadaStations],
    ['Chile',       fetchChileStations],
    ['Brazil',      fetchBrazilStations],
    ['Argentina',   fetchArgentinaStations],
    ['USA',         fetchUSAStations],
    ['SouthAfrica', fetchSouthAfricaStations],
  ];
  for (const [label, fn] of seq) await runSync(label, fn);
  await runNightlySlowSync(); // the slow fuelo.net scrapers (already sequential)
  console.log('[sync] Boot sync complete');
}

function startSyncScheduler() {
  // Boot sync is OFF by default. The free 512MB instance OOM-killed when the old
  // staggered startup storm ran ~25 scrapers concurrently alongside the GeoJSON
  // prewarm. Cron (below) keeps data fresh on schedule, and Neon retains data
  // across restarts, so re-scraping the world on every deploy is unnecessary.
  // Set SYNC_ON_BOOT=true to opt in — it then runs strictly sequentially.
  if (process.env.SYNC_ON_BOOT === 'true') {
    setTimeout(() => runAllSyncsOnce().catch(e => console.error('[sync] boot sync error:', e.message)), 10000);
  } else {
    console.log('[sync] SYNC_ON_BOOT not set — skipping boot sync; cron will refresh on schedule');
  }

  // Schedule recurring syncs (these are spread across the day, never concurrent)
  scheduleGovernmentAPIs();
  cron.schedule('0 2 * * *', runNightlySlowSync); // slow scrapers at 2am UTC daily
}

// Map of country slugs → fetch functions for on-demand triggering
const SCRAPERS = {
  france:         fetchFranceStations,
  spain:          fetchSpainStations,
  italy:          fetchItalyStations,
  portugal:       fetchPortugalStations,
  austria:        fetchAustriaStations,
  poland:         fetchPolandStations,
  germany:        fetchGermanyStations,
  norway:         fetchNorwayStations,
  sweden:         fetchSwedenStations,
  luxembourg:     fetchLuxembourgStations,
  slovenia:       fetchSloveniaStations,
  netherlands:    fetchNLStations,
  croatia:        fetchCroatiaStations,
  czechia:        fetchCzechiaStations,
  switzerland:    fetchSwitzerlandStations,
  slovakia:       fetchSlovakiaStations,
  hungary:        fetchHungaryStations,
  romania:        fetchRomaniaStations,
  serbia:         fetchSerbiaStations,
  bulgaria:       fetchBulgariaStations,
  greece:         fetchGreeceStations,
  bosnia:         fetchBosniaStations,
  montenegro:     fetchMontenegroStations,
  northmacedonia: fetchNorthMacedoniaStations,
  albania:        fetchAlbaniaStations,
  denmark:        fetchDenmarkStations,
  uk:             fetchUKStations,
  ireland:        fetchIrelandStations,
  belgium:        fetchBelgiumStations,
  finland:        fetchFinlandStations,
  latvia:         fetchLatviaStations,
  lithuania:      fetchLithuaniaStations,
  estonia:        fetchEstoniaStations,
  turkey:         fetchTurkeyStations,
  australia:      fetchAustraliaStations,
  iceland:        fetchIcelandStations,
  qld:            fetchQLDStations,
  vic:            fetchVICStations,
  mexico:         fetchMexicoStations,
  taiwan:         fetchTaiwanStations,
  malaysia:       fetchMalaysiaStations,
  thailand:       fetchThailandStations,
  newzealand:     fetchNewZealandStations,
  southkorea:     fetchSouthKoreaStations,
  canada:         fetchCanadaStations,
  chile:          fetchChileStations,
  brazil:         fetchBrazilStations,
  argentina:      fetchArgentinaStations,
  usa:            fetchUSAStations,
  southafrica:    fetchSouthAfricaStations,
  eubulletin:     fetchEUBulletinStations, // EU national prices (Oil Bulletin) + OSM stations
};

// ── EU Oil Bulletin cutover (STAGED — not yet enabled in automatic runs) ──────
// fetchEUBulletinStations covers these EU countries with the official EU Weekly
// Oil Bulletin (CC BY 4.0) national price over OSM stations, replacing fuelo.net.
// Before enabling it on the cron/boot path, the matching fuelo.net scrapers must
// be removed from the scheduled runs AND their existing DB rows purged, or the
// live map will show duplicate pins (fuelo per-station + EUB OSM-station).
// Countries replaced: BE BG CZ EE GR HR HU IE LT LV NL PL RO SK.
// To finish the cutover: (1) drop these from scheduleGovernmentAPIs (Poland) and
// runNightlySlowSync, (2) add `cron.schedule('0 6 * * 4', () => runSync('EUBulletin',
// fetchEUBulletinStations))` (Thu, after the Wed bulletin), (3) purge old fuelo rows.

async function triggerSync(country) {
  const fetchFn = SCRAPERS[country];
  if (!fetchFn) throw new Error(`Unknown country: ${country}. Available: ${Object.keys(SCRAPERS).join(', ')}`);
  console.log(`[sync] Manual trigger: ${country}`);
  const stations = await fetchFn();
  await bulkUpsertStations(stations, country);
  return { country, stationsFetched: stations.length };
}

module.exports = { startSyncScheduler, triggerSync };
