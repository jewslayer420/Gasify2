require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchUKStations } = require('../services/scrapers/uk');
const prisma = require('../lib/prisma');

const CHUNK = 1000;

async function run() {
  const stations = await fetchUKStations();
  console.log(`[script] Fetched ${stations.length} UK stations`);

  let totalPrices = 0;
  for (let i = 0; i < stations.length; i += CHUNK) {
    const batch = stations.slice(i, i + CHUNK);
    const rows = batch.map(({ prices, ...s }) => s);

    await prisma.station.createMany({ data: rows, skipDuplicates: true });

    const saved = await prisma.station.findMany({
      where: { externalId: { in: rows.map(s => s.externalId) } },
      select: { id: true, externalId: true },
    });
    const idMap = new Map(saved.map(s => [s.externalId, s.id]));

    const priceRows = [];
    for (const s of batch) {
      const sid = idMap.get(s.externalId);
      if (!sid) continue;
      for (const { fuelType, price } of s.prices) priceRows.push({ stationId: sid, fuelType, price });
    }

    if (priceRows.length) {
      const stationIds = [...new Set(priceRows.map(p => p.stationId))];
      await prisma.fuelPrice.deleteMany({ where: { stationId: { in: stationIds } } });
      await prisma.fuelPrice.createMany({ data: priceRows });
    }

    totalPrices += priceRows.length;
    console.log(`[script] ${Math.min(i + CHUNK, stations.length)}/${stations.length} stations, ${totalPrices} prices`);
  }

  console.log(`[script] Done — ${stations.length} stations, ${totalPrices} price records`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
