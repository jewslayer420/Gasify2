// One-off purge of stale fuelo.net station rows that were replaced by the
// EU Oil Bulletin cutover (14 EU countries) and the Germany → Tankerkönig swap.
//
// WHY: after deploying the new sync.js, the old per-station fuelo rows are no
// longer refreshed but still live in the DB, so the map shows duplicate pins
// (old fuelo per-station + new EUB-over-OSM-station). This deletes the stale
// rows. FuelPrice / PriceHistory / Favorite cascade-delete with the Station.
//
// SAFETY:
//   * Dry-run by default — prints counts, deletes nothing. Add --apply to delete.
//   * Targets ONLY the exact legacy prefixes below. The new rows use the "EUB-"
//     prefix (e.g. "EUB-BE-OSM-node-123") and Germany/Tankerkönig uses "DE-<id>",
//     so neither is matched here (we purge "DE-fuelo-", never bare "DE-").
//
// RUN ORDER: deploy the new sync.js FIRST, then run this. Running it before the
// old fuelo scrapers are removed from the live schedule lets the nightly cron
// re-insert the rows.
//
//   node src/scripts/purge_fuelo_eub.js          # dry run (counts only)
//   node src/scripts/purge_fuelo_eub.js --apply   # actually delete

const prisma = require('../lib/prisma');

// 14 EU Oil Bulletin countries (externalId `<CC>-<id>`) + Germany's old fuelo rows
// (externalId `DE-fuelo-<id>`; the new Tankerkönig rows are `DE-<id>` and are NOT here).
const PREFIXES = [
  'BE-', 'BG-', 'CZ-', 'EE-', 'GR-', 'HR-', 'HU-',
  'IE-', 'LT-', 'LV-', 'NL-', 'PL-', 'RO-', 'SK-',
  'DE-fuelo-',
];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`[purge] mode: ${apply ? 'APPLY (deleting)' : 'DRY RUN (counts only)'}`);

  let grandTotal = 0;
  for (const prefix of PREFIXES) {
    const count = await prisma.station.count({ where: { externalId: { startsWith: prefix } } });
    grandTotal += count;
    if (count === 0) { console.log(`  ${prefix.padEnd(10)} 0`); continue; }

    if (apply) {
      const { count: deleted } = await prisma.station.deleteMany({
        where: { externalId: { startsWith: prefix } },
      });
      console.log(`  ${prefix.padEnd(10)} deleted ${deleted} stations (+ cascaded prices/history)`);
    } else {
      console.log(`  ${prefix.padEnd(10)} ${count} stations would be deleted`);
    }
  }

  console.log(`[purge] ${apply ? 'deleted' : 'matched'} ${grandTotal} stations total across ${PREFIXES.length} prefixes`);
  if (!apply && grandTotal > 0) console.log('[purge] re-run with --apply to delete.');
}

main()
  .catch(e => { console.error('[purge] error:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
