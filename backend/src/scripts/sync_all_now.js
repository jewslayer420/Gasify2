// One-shot "refresh the world" runner. Drives triggerSync() for every live country
// (writes straight to the production Neon DB the website reads), captures per-country
// results, and prints a freshness table at the end so you can see exactly which
// countries pulled fresh prices and which failed.
//
// Order: fast per-station gov-API countries FIRST (France/Spain/Italy/Slovenia/…),
// then the slower Overpass national-average countries. If Overpass throttles this
// single IP partway, the high-visibility per-station countries are already done.
//
// Excluded on purpose:
//   southkorea — deliberately purged (not in DB); running re-adds removed data
//   germany    — Tankerkönig key is dead; DE is served via the EU Bulletin instead
//   norway/sweden — no public price API (scrapers return empty)
//   qld/vic    — need QLD_FUEL_API_KEY / VIC_FUEL_API_KEY (not set here)
//
// Usage: node src/scripts/sync_all_now.js [fast|slow|all]   (default: all)

const prisma = require('../lib/prisma');
const { triggerSync } = require('../services/sync');

const FAST = [
  'france', 'spain', 'italy', 'portugal', 'austria', 'slovenia', 'iceland',
  'finland', 'uk', 'luxembourg', 'chile', 'taiwan', 'mexico', 'australia',
];
const SLOW = [
  'eubulletin', 'turkey', 'brazil', 'canada', 'usa', 'southafrica', 'thailand',
  'malaysia', 'newzealand', 'northmacedonia', 'serbia', 'bosnia', 'montenegro',
  'albania', 'switzerland', 'uae', 'saudiarabia', 'kenya', 'dominican', 'uruguay',
  'qatar', 'kuwait', 'oman', 'bahrain', 'brunei', 'ecuador', 'kosovo',
  'vietnam', 'egypt', 'jordan', 'tunisia', 'morocco', 'indonesia', 'india', 'argentina',
];

const mode = (process.argv[2] || 'all').toLowerCase();
const slugs = mode === 'fast' ? FAST : mode === 'slow' ? SLOW : [...FAST, ...SLOW];

function ts() { return new Date().toISOString().slice(11, 19); }

async function main() {
  console.log(`\n[sync-all] mode=${mode} — ${slugs.length} countries — start ${new Date().toISOString()}\n`);
  const results = [];
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const t0 = Date.now();
    process.stdout.write(`[${ts()}] (${i + 1}/${slugs.length}) ${slug} … `);
    try {
      const r = await triggerSync(slug);
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`OK  fetched=${r.stationsFetched} new=${r.totalNew} updated=${r.totalUpdated} (${secs}s)`);
      results.push({ slug, ok: true, ...r, secs: Number(secs) });
    } catch (e) {
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`FAIL  ${e.message} (${secs}s)`);
      results.push({ slug, ok: false, error: e.message, secs: Number(secs) });
    }
  }

  // Summary table
  console.log('\n=== SYNC SUMMARY ===');
  console.log('country'.padEnd(16), 'status'.padEnd(7), 'fetched'.padStart(8), 'new'.padStart(7), 'updated'.padStart(8), 'secs'.padStart(6));
  for (const r of results) {
    console.log(
      r.slug.padEnd(16),
      (r.ok ? 'OK' : 'FAIL').padEnd(7),
      String(r.ok ? r.stationsFetched : '—').padStart(8),
      String(r.ok ? r.totalNew : '—').padStart(7),
      String(r.ok ? r.totalUpdated : '—').padStart(8),
      String(r.secs).padStart(6),
    );
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} succeeded.` + (failed.length ? ` Failed: ${failed.map(r => r.slug).join(', ')}` : ''));

  // Fresh per-country freshness snapshot (proves what's now current)
  const now = Date.now();
  const rows = await prisma.$queryRaw`
    SELECT s.country, COUNT(DISTINCT s.id) AS stations, MAX(fp."updatedAt") AS last_update
    FROM "Station" s LEFT JOIN "FuelPrice" fp ON fp."stationId" = s.id
    GROUP BY s.country ORDER BY last_update DESC NULLS LAST;`;
  const age = d => d ? `${((now - new Date(d).getTime()) / 3600000).toFixed(1)}h` : 'NEVER';
  console.log('\n=== POST-SYNC FRESHNESS (newest first) ===');
  for (const r of rows) {
    console.log(String(r.country).padEnd(6), String(Number(r.stations)).padStart(8), 'stations  last update', age(r.last_update), 'ago');
  }
  console.log(`\nDone ${new Date().toISOString()}`);
}

main().catch(e => { console.error('[sync-all] fatal:', e); process.exit(1); }).finally(() => prisma.$disconnect());
