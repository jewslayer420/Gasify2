// Sync freshness monitor — run on a schedule by .github/workflows/sync-monitor.yml.
// Queries Neon for per-country price age, classifies staleness, and alerts Telegram.
// Independent of the sync jobs, so it catches a total outage, a partial failure, or a
// dead DB. Usage: node src/scripts/check_freshness.js [--dry-run]
const prisma = require('../lib/prisma');
const { computeStaleness, formatStaleMessage } = require('../services/freshness_monitor');
const { sendTelegram } = require('../services/telegram');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { dbOk, stale, error } = await computeStaleness(prisma);

  if (!dbOk) {
    const msg = `⚠️ Gasify monitor: DB unreachable — ${error}`;
    console.error(msg);
    if (!dryRun) { try { await sendTelegram(msg); } catch (e) { console.error('[monitor] send failed:', e.message); } }
    process.exitCode = 1;
    return;
  }

  if (!stale.length) {
    console.log('[monitor] OK — all countries within freshness thresholds');
    return;
  }

  const msg = formatStaleMessage(stale);
  console.warn(`[monitor] STALE: ${msg}`);
  if (dryRun) {
    console.log(`[dry-run] would send Telegram:\n${msg}`);
    return;
  }
  try {
    const sent = await sendTelegram(msg);
    if (!sent) console.warn('[monitor] Telegram not configured — alert not delivered');
  } catch (e) {
    console.error('[monitor] Telegram send failed:', e.message);
    process.exitCode = 1;
  }
}

main()
  .catch(e => { console.error('[monitor] fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
