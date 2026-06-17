// On-demand manual-price freshness check.
//   node src/scripts/check_stale_prices.js          # log + email overdue prices
//   node src/scripts/check_stale_prices.js --list    # print the full freshness table
require('dotenv').config();
const { priceFreshness, runPriceFreshnessCheck } = require('../services/price_freshness');

(async () => {
  if (process.argv.includes('--list')) {
    const rows = priceFreshness().sort((a, b) => b.ageDays - a.ageDays);
    for (const r of rows) {
      console.log(`${r.stale ? '⚠️ ' : '   '}${r.cc.padEnd(3)} ${r.label.padEnd(13)} ${String(r.ageDays).padStart(3)}d / ${r.staleAfterDays}d  (${r.asOf})`);
    }
  }
  const res = await runPriceFreshnessCheck();
  console.log(`done: ${res.stale.length} stale of ${res.total}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
