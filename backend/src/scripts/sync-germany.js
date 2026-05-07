require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchGermanyStations } = require('../services/scrapers/germany');
const prisma = require('../lib/prisma');

async function run() {
  const stations = await fetchGermanyStations();
  console.log(`[script] Fetched ${stations.length} Germany stations — upserting…`);

  let count = 0;
  for (const station of stations) {
    count++;
    if (count % 100 === 0) console.log(`[script] ${count}/${stations.length}`);
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

  console.log(`[script] Done — ${stations.length} Germany stations saved`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
