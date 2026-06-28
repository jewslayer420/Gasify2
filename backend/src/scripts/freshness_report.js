// One-off freshness audit: per-country station counts and how recently their
// fuel prices were last written (FuelPrice.updatedAt). Read-only.
const prisma = require('../lib/prisma');

async function main() {
  const now = Date.now();

  // Per-country: station count, fuel-price count, newest & oldest price update.
  const rows = await prisma.$queryRaw`
    SELECT s.country,
           COUNT(DISTINCT s.id)            AS stations,
           COUNT(fp.id)                    AS prices,
           MAX(fp."updatedAt")             AS last_update,
           MIN(fp."updatedAt")             AS oldest_update
    FROM "Station" s
    LEFT JOIN "FuelPrice" fp ON fp."stationId" = s.id
    GROUP BY s.country
    ORDER BY last_update ASC NULLS FIRST;
  `;

  const fmtAge = (d) => {
    if (!d) return 'NEVER';
    const days = (now - new Date(d).getTime()) / 86400000;
    if (days < 1) return `${(days * 24).toFixed(1)}h`;
    return `${days.toFixed(1)}d`;
  };

  console.log('\n=== Per-country price freshness (FuelPrice.updatedAt) ===');
  console.log('country'.padEnd(22), 'stations'.padStart(9), 'prices'.padStart(8), 'last_update'.padStart(13), 'newest_age'.padStart(11), 'oldest_age'.padStart(11));
  let totalStations = 0, totalPrices = 0;
  for (const r of rows) {
    const st = Number(r.stations), pr = Number(r.prices);
    totalStations += st; totalPrices += pr;
    const last = r.last_update ? new Date(r.last_update).toISOString().slice(0, 10) : '—';
    console.log(
      String(r.country).padEnd(22),
      String(st).padStart(9),
      String(pr).padStart(8),
      last.padStart(13),
      fmtAge(r.last_update).padStart(11),
      fmtAge(r.oldest_update).padStart(11),
    );
  }
  console.log('-'.repeat(80));
  console.log(`TOTAL: ${rows.length} countries, ${totalStations} stations, ${totalPrices} prices`);
  console.log(`Now: ${new Date(now).toISOString()}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
