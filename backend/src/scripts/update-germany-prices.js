require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const prisma = require('../lib/prisma');

const API_BASE = 'https://creativecommons.tankerkoenig.de/json/prices.php';
const API_KEY = process.env.TANKERKOENIG_API_KEY || '00000000-0000-0000-0000-000000000002';
const BATCH = 10;
const CONCURRENCY = 20;

const FUEL_MAP = { diesel: 'diesel', e5: 'sp95', e10: 'e10' };

async function fetchPrices(ids) {
  try {
    const url = `${API_BASE}?ids=${ids.join(',')}&apikey=${API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return {};
    const data = await res.json();
    return data.prices || {};
  } catch { return {}; }
}

async function run() {
  const stations = await prisma.station.findMany({
    where: { country: 'DE' },
    select: { id: true, externalId: true },
  });
  console.log(`[update-de] ${stations.length} DE stations to update`);

  const uuidToDbId = new Map(stations.map(s => [s.externalId.replace('DE-', ''), s.id]));
  const uuids = [...uuidToDbId.keys()];

  let updated = 0, batches = 0;
  const totalBatches = Math.ceil(uuids.length / BATCH);

  for (let i = 0; i < uuids.length; i += BATCH * CONCURRENCY) {
    const chunk = uuids.slice(i, i + BATCH * CONCURRENCY);
    const subBatches = [];
    for (let j = 0; j < chunk.length; j += BATCH) subBatches.push(chunk.slice(j, j + BATCH));

    await Promise.all(subBatches.map(async (batch) => {
      const prices = await fetchPrices(batch);
      const updates = [];
      for (const [uuid, p] of Object.entries(prices)) {
        const dbId = uuidToDbId.get(uuid);
        if (!dbId || !p || p.status !== 'open') continue;
        for (const [tk, ft] of Object.entries(FUEL_MAP)) {
          const price = p[tk];
          if (!price || price <= 0) continue;
          updates.push({ stationId: dbId, fuelType: ft, price });
        }
      }
      for (let k = 0; k < updates.length; k += 100) {
        await prisma.$transaction(
          updates.slice(k, k + 100).map(u =>
            prisma.fuelPrice.upsert({
              where: { stationId_fuelType: { stationId: u.stationId, fuelType: u.fuelType } },
              update: { price: u.price },
              create: { stationId: u.stationId, fuelType: u.fuelType, price: u.price },
            })
          )
        );
      }
      updated += updates.length;
      batches++;
    }));

    if (batches % 50 === 0) console.log(`[update-de] ${batches}/${totalBatches} batches, ${updated} prices updated`);
  }

  console.log(`[update-de] Done — ${updated} prices updated`);
  await prisma.$disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
