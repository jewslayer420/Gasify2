const cron = require('node-cron');
const { fetchSloveniaStations } = require('./scrapers/slovenia');
const { fetchFranceStations } = require('./scrapers/france');
const prisma = require('../lib/prisma');

async function upsertStations(stations, label) {
  console.log(`[sync] Upserting ${stations.length} ${label} stations…`);
  let count = 0;
  for (const station of stations) {
    count++;
    if (count % 50 === 0) console.log(`[sync] ${label}: ${count}/${stations.length}`);
    const { prices, ...stationData } = station;

    const saved = await prisma.station.upsert({
      where: { externalId: stationData.externalId },
      update: { name: stationData.name, lat: stationData.lat, lng: stationData.lng, city: stationData.city },
      create: stationData,
    });

    for (const { fuelType, price } of prices) {
      const existing = await prisma.fuelPrice.findUnique({
        where: { stationId_fuelType: { stationId: saved.id, fuelType } },
      });

      await prisma.fuelPrice.upsert({
        where: { stationId_fuelType: { stationId: saved.id, fuelType } },
        update: { price },
        create: { stationId: saved.id, fuelType, price },
      });

      if (!existing || existing.price !== price) {
        await prisma.priceHistory.create({ data: { stationId: saved.id, fuelType, price } });
      }
    }
  }
}

async function syncSlovenia() {
  const stations = await fetchSloveniaStations();
  await upsertStations(stations, 'Slovenia');
}

async function syncFrance() {
  const stations = await fetchFranceStations();
  await upsertStations(stations, 'France');
}

async function syncAll() {
  console.log('[sync] Starting full sync…');
  await syncSlovenia().catch(err => console.error('[sync] Slovenia error:', err.message));
  await syncFrance().catch(err => console.error('[sync] France error:', err.message));
  console.log('[sync] Full sync complete');
}

function startSyncScheduler() {
  syncAll().catch(console.error);
  cron.schedule('0 */2 * * *', () => syncAll().catch(console.error));
}

module.exports = { syncAll, startSyncScheduler };
