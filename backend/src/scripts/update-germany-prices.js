require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const prisma = require('../lib/prisma');

// Sparse grid scan — fast price refresh for existing DE stations (all fuel types).
// Uses tankerkoenig.de (main domain) which is reachable without geo-restriction.

const API_BASE = 'https://creativecommons.tankerkoenig.de/json/list.php';
const RADIUS = 15;
const GRID_STEP = 0.36; // coarser than full sync → ~570 cells instead of 2288
const BOUNDS = { latMin: 47.2, latMax: 55.1, lngMin: 5.9, lngMax: 15.2 };
const CONCURRENCY = 8;

const FUEL_TYPES = [
  { type: 'diesel', ft: 'diesel' },
  { type: 'e5',     ft: 'sp95'   },
  { type: 'e10',    ft: 'e10'    },
];

function parseResponse(data) {
  if (!data.ok || !Array.isArray(data.stations)) return [];
  return data.stations;
}

async function updateGermanyPrices() {
  const apiKey = process.env.TANKERKOENIG_API_KEY || '00000000-0000-0000-0000-000000000002';

  const rows = await prisma.station.findMany({
    where: { country: 'DE' },
    select: { id: true, externalId: true },
  });
  if (!rows.length) { console.log('[update-de] No DE stations — run sync-germany.js first'); return; }
  const uuidToDbId = new Map(rows.map(s => [s.externalId.replace('DE-', ''), s.id]));
  console.log(`[update-de] ${rows.length} DE stations to update`);

  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP)
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP)
      cells.push({ lat: +(lat + GRID_STEP / 2).toFixed(3), lng: +(lng + GRID_STEP / 2).toFixed(3) });

  // priceMap: `${uuid}|${ft}` → price
  const priceMap = new Map();

  for (const { type, ft } of FUEL_TYPES) {
    let done = 0;
    for (let i = 0; i < cells.length; i += CONCURRENCY) {
      await Promise.all(cells.slice(i, i + CONCURRENCY).map(async (c) => {
        const url = `${API_BASE}?lat=${c.lat}&lng=${c.lng}&rad=${RADIUS}&sort=dist&type=${type}&apikey=${apiKey}`;
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
          if (!res.ok) return;
          const stations = parseResponse(await res.json());
          for (const s of stations) {
            if (!s.id || !uuidToDbId.has(s.id)) continue;
            const price = parseFloat(s.price);
            if (price > 0) priceMap.set(`${s.id}|${ft}`, +price.toFixed(3));
          }
        } catch {}
      }));
      done += Math.min(CONCURRENCY, cells.length - i);
      if (done % 40 === 0) console.log(`[update-de] ${type}: ${done}/${cells.length} cells`);
    }
    console.log(`[update-de] ${type} pass done`);
  }
  console.log(`[update-de] Scan done — ${priceMap.size} prices`);

  const updates = [];
  for (const [key, price] of priceMap) {
    const [uuid, ft] = key.split('|');
    const dbId = uuidToDbId.get(uuid);
    if (dbId) updates.push({ stationId: dbId, fuelType: ft, price });
  }

  for (let k = 0; k < updates.length; k += 100) {
    await prisma.$transaction(
      updates.slice(k, k + 100).map(u =>
        prisma.fuelPrice.upsert({
          where: { stationId_fuelType: { stationId: u.stationId, fuelType: u.fuelType } },
          update: { price: u.price },
          create: u,
        })
      )
    );
  }
  console.log(`[update-de] Done — ${updates.length} prices updated`);
}

async function run() {
  await updateGermanyPrices();
  await prisma.$disconnect();
}

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { updateGermanyPrices };
