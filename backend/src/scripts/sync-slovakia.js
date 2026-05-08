require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchSlovakiaStations } = require('../services/scrapers/slovakia');
const prisma = require('../lib/prisma');

const CHUNK = 2000;

async function run() {
  const stations = await fetchSlovakiaStations();
  console.log(`[script] Fetched ${stations.length} Slovakia stations`);

  const stationRows = stations.map(s => ({
    externalId: s.externalId,
    name: s.name,
    brand: s.brand ?? null,
    lat: s.lat,
    lng: s.lng,
    address: s.address ?? null,
    city: s.city || '',
    country: s.country,
  }));

  for (let i = 0; i < stationRows.length; i += CHUNK) {
    await prisma.station.createMany({ data: stationRows.slice(i, i + CHUNK), skipDuplicates: true });
    console.log(`[script] Stations ${Math.min(i + CHUNK, stationRows.length)}/${stationRows.length}`);
  }

  const saved = await prisma.station.findMany({
    where: { country: 'SK' },
    select: { id: true, externalId: true },
  });
  const idMap = new Map(saved.map(s => [s.externalId, s.id]));
  console.log(`[script] ${saved.length} SK stations in DB`);

  const priceRows = [];
  for (const s of stations) {
    const stationId = idMap.get(s.externalId);
    if (!stationId) continue;
    for (const { fuelType, price } of s.prices) {
      priceRows.push({ stationId, fuelType, price });
    }
  }

  for (let i = 0; i < priceRows.length; i += CHUNK) {
    await prisma.fuelPrice.createMany({ data: priceRows.slice(i, i + CHUNK), skipDuplicates: true });
    console.log(`[script] Prices ${Math.min(i + CHUNK, priceRows.length)}/${priceRows.length}`);
  }

  console.log(`[script] Done — ${stations.length} stations, ${priceRows.length} price records`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
