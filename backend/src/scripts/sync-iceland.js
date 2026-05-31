require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchIcelandStations } = require('../services/scrapers/iceland');
const prisma = require('../lib/prisma');

const CHUNK = 500;

async function run() {
  const stations = await fetchIcelandStations();
  console.log(`[script] Fetched ${stations.length} Iceland stations`);

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
      for (let j = 0; j < priceRows.length; j += 100) {
        await prisma.$transaction(
          priceRows.slice(j, j + 100).map(p =>
            prisma.fuelPrice.upsert({
              where: { stationId_fuelType: { stationId: p.stationId, fuelType: p.fuelType } },
              update: { price: p.price },
              create: p,
            })
          )
        );
      }
    }
    totalPrices += priceRows.length;
  }

  console.log(`[script] Done — ${stations.length} stations, ${totalPrices} price records`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
