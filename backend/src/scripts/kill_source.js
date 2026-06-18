// Kill-switch CLI for commercial-terms-risk sources (see services/killswitch.js).
//   node src/scripts/kill_source.js                # status (rows + sync-disabled)
//   node src/scripts/kill_source.js <slug>         # purge that source's rows NOW
//   slugs: chile finland slovenia uk vic qld nsw
require('dotenv').config();
const { killStatus, killSource } = require('../services/killswitch');

(async () => {
  const slug = process.argv[2];
  if (!slug) {
    const rows = await killStatus();
    console.log('Killable sources (DISABLED_SCRAPERS =', JSON.stringify(process.env.DISABLED_SCRAPERS || ''), '):');
    for (const r of rows) console.log(`  ${r.slug.padEnd(9)} ${String(r.rows).padStart(6)} rows  ${r.syncDisabled ? '[sync OFF]' : '[sync ON]'}  ${r.label}`);
    console.log('\nTo kill: node src/scripts/kill_source.js <slug>');
  } else {
    const res = await killSource(slug);
    console.log(JSON.stringify(res, null, 2));
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
