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
const { updateGermanyPrices }    = require('../scripts/update-germany-prices');
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
  // Germany: sparse diesel scan every 6h — uses tankerkoenig.de main domain (no geo-restriction)
  cron.schedule('0 2,8,14,20 * * *',   () => updateGermanyPrices().catch(e => console.error('[sync] DE price update error:', e.message)));
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
  console.log('[sync] Nightly slow sync complete');
}

function startSyncScheduler() {
  // Run all syncs once on startup (staggered to avoid hammering APIs)
  setTimeout(() => runSync('France',      fetchFranceStations),   0);
  setTimeout(() => runSync('Spain',       fetchSpainStations),    15000);
  setTimeout(() => runSync('Italy',       fetchItalyStations),    30000);
  setTimeout(() => runSync('Portugal',    fetchPortugalStations), 45000);
  setTimeout(() => runSync('Austria',     fetchAustriaStations),  60000);
  setTimeout(() => runSync('Poland',      fetchPolandStations),   75000);
  setTimeout(() => runNightlySlowSync(),                          120000); // 2 min after start

  // Schedule recurring syncs
  scheduleGovernmentAPIs();
  cron.schedule('0 2 * * *', runNightlySlowSync); // slow scrapers at 2am UTC daily
}

module.exports = { startSyncScheduler };
