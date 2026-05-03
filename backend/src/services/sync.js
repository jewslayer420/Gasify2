const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { fetchSloveniaStations } = require('./scrapers/slovenia');

const prisma = new PrismaClient();

async function syncStations() {
  console.log('[sync] Starting station sync...');
  const allStations = await fetchSloveniaStations();
  console.log(`[sync] Fetched ${allStations.length} stations`);

  for (const station of allStations) {
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

      // Record history only when price changed
      if (!existing || existing.price !== price) {
        await prisma.priceHistory.create({ data: { stationId: saved.id, fuelType, price } });
      }
    }
  }

  console.log('[sync] Sync complete');
}

function startSyncScheduler() {
  syncStations().catch(console.error);
  // Re-sync every 2 hours
  cron.schedule('0 */2 * * *', () => syncStations().catch(console.error));
}

module.exports = { syncStations, startSyncScheduler };
