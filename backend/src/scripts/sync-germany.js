require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { fetchPhase1, fetchDetailBatch } = require('../services/scrapers/germany');
const prisma = require('../lib/prisma');

const CHUNK = 2000;
const FETCH_BATCH = 500; // fetch + insert this many stations at a time

async function run() {
  // Step 0: wipe old DE data
  console.log('[script] Clearing old DE stations...');
  const oldIds = (await prisma.station.findMany({ where: { country: 'DE' }, select: { id: true } })).map(s => s.id);
  if (oldIds.length) {
    for (let i = 0; i < oldIds.length; i += CHUNK)
      await prisma.fuelPrice.deleteMany({ where: { stationId: { in: oldIds.slice(i, i + CHUNK) } } });
    for (let i = 0; i < oldIds.length; i += CHUNK)
      await prisma.station.deleteMany({ where: { id: { in: oldIds.slice(i, i + CHUNK) } } });
    console.log(`[script] Deleted ${oldIds.length} old DE stations`);
  }

  // Step 1: Phase 1 — collect all station IDs
  const idMap = await fetchPhase1();
  const entries = [...idMap.entries()];
  console.log(`[script] ${entries.length} station IDs to process`);

  let totalStations = 0;
  let totalPrices = 0;

  // Step 2: Phase 2 + insert — stream in batches so data appears progressively
  for (let i = 0; i < entries.length; i += FETCH_BATCH) {
    const slice = entries.slice(i, i + FETCH_BATCH);
    const stations = await fetchDetailBatch(slice);
    if (!stations.length) continue;

    // Insert stations
    const stationRows = stations.map(s => ({
      externalId: s.externalId, name: s.name, brand: s.brand ?? null,
      lat: s.lat, lng: s.lng, address: s.address ?? null,
      city: s.city || '', country: s.country,
    }));
    await prisma.station.createMany({ data: stationRows, skipDuplicates: true });

    // Resolve DB IDs
    const saved = await prisma.station.findMany({
      where: { externalId: { in: stationRows.map(s => s.externalId) } },
      select: { id: true, externalId: true },
    });
    const dbIdMap = new Map(saved.map(s => [s.externalId, s.id]));

    // Insert prices
    const priceRows = [];
    for (const s of stations) {
      const stationId = dbIdMap.get(s.externalId);
      if (!stationId) continue;
      for (const { fuelType, price } of s.prices)
        priceRows.push({ stationId, fuelType, price });
    }
    if (priceRows.length)
      await prisma.fuelPrice.createMany({ data: priceRows, skipDuplicates: true });

    totalStations += stations.length;
    totalPrices += priceRows.length;
    console.log(`[script] Batch ${i + FETCH_BATCH}/${entries.length} — ${totalStations} stations, ${totalPrices} prices in DB`);
  }

  console.log(`[script] Done — ${totalStations} stations, ${totalPrices} price records`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
