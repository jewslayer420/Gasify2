require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchLuxembourgStations } = require('../services/scrapers/luxembourg');
const prisma = require('../lib/prisma');

const CHUNK = 500;

async function run() {
  const existing = await prisma.station.findMany({
    where: { country: 'LU' },
    select: { id: true, externalId: true, lat: true, lng: true },
  });
  const coordsCache = new Map(existing.map(s => [s.externalId, { lat: Number(s.lat), lng: Number(s.lng) }]));
  console.log(`[script] ${coordsCache.size} cached LU station coords`);

  const oldIds = existing.map(s => s.id);
  if (oldIds.length) {
    for (let i = 0; i < oldIds.length; i += CHUNK) await prisma.fuelPrice.deleteMany({ where: { stationId: { in: oldIds.slice(i, i + CHUNK) } } });
    for (let i = 0; i < oldIds.length; i += CHUNK) await prisma.station.deleteMany({ where: { id: { in: oldIds.slice(i, i + CHUNK) } } });
    console.log(`[script] Deleted ${oldIds.length} old LU stations`);
  }

  const stations = await fetchLuxembourgStations(coordsCache);
  console.log(`[script] Fetched ${stations.length} Luxembourg stations`);
  if (!stations.length) { await prisma.$disconnect(); return; }

  let totalPrices = 0;
  for (let i = 0; i < stations.length; i += CHUNK) {
    const batch = stations.slice(i, i + CHUNK);
    const stationRows = batch.map(({ prices, ...s }) => s);
    await prisma.station.createMany({ data: stationRows });
    const saved = await prisma.station.findMany({ where: { externalId: { in: stationRows.map(s => s.externalId) } }, select: { id: true, externalId: true } });
    const dbIdMap = new Map(saved.map(s => [s.externalId, s.id]));
    const priceRows = [];
    for (const s of batch) { const sid = dbIdMap.get(s.externalId); if (!sid) continue; for (const { fuelType, price } of s.prices) priceRows.push({ stationId: sid, fuelType, price }); }
    if (priceRows.length) await prisma.fuelPrice.createMany({ data: priceRows });
    totalPrices += priceRows.length;
    console.log(`[script] ${Math.min(i + CHUNK, stations.length)}/${stations.length} stations, ${totalPrices} prices`);
  }
  console.log(`[script] Done — ${stations.length} stations, ${totalPrices} price records`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
