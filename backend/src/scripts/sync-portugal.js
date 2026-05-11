require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchPortugalStations } = require('../services/scrapers/portugal');
const prisma = require('../lib/prisma');
const CHUNK = 2000;
async function run() {
  const oldIds = (await prisma.station.findMany({ where: { country: 'PT' }, select: { id: true } })).map(s => s.id);
  if (oldIds.length) {
    for (let i = 0; i < oldIds.length; i += CHUNK) await prisma.fuelPrice.deleteMany({ where: { stationId: { in: oldIds.slice(i, i + CHUNK) } } });
    for (let i = 0; i < oldIds.length; i += CHUNK) await prisma.station.deleteMany({ where: { id: { in: oldIds.slice(i, i + CHUNK) } } });
    console.log(`[script] Deleted ${oldIds.length} old PT stations`);
  }
  const stations = await fetchPortugalStations();
  console.log(`[script] Fetched ${stations.length} Portugal stations`);
  let totalPrices = 0;
  for (let i = 0; i < stations.length; i += CHUNK) {
    const batch = stations.slice(i, i + CHUNK);
    const stationRows = batch.map(s => ({ externalId: s.externalId, name: s.name, brand: s.brand ?? null, lat: s.lat, lng: s.lng, address: s.address ?? null, city: s.city || '', country: s.country }));
    await prisma.station.createMany({ data: stationRows, skipDuplicates: true });
    const saved = await prisma.station.findMany({ where: { externalId: { in: stationRows.map(s => s.externalId) } }, select: { id: true, externalId: true } });
    const dbIdMap = new Map(saved.map(s => [s.externalId, s.id]));
    const priceRows = [];
    for (const s of batch) { const sid = dbIdMap.get(s.externalId); if (!sid) continue; for (const { fuelType, price } of s.prices) priceRows.push({ stationId: sid, fuelType, price }); }
    if (priceRows.length) await prisma.fuelPrice.createMany({ data: priceRows, skipDuplicates: true });
    totalPrices += priceRows.length;
    console.log(`[script] ${Math.min(i + CHUNK, stations.length)}/${stations.length} stations, ${totalPrices} prices`);
  }
  console.log(`[script] Done — ${stations.length} stations, ${totalPrices} price records`);
  await prisma.$disconnect();
}
run().catch(err => { console.error(err); process.exit(1); });
