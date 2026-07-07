// Sync freshness monitor — run on a schedule by .github/workflows/sync-monitor.yml.
// Queries Neon for per-country price age, classifies staleness, and alerts Telegram.
// Independent of the sync jobs, so it catches a total outage, a partial failure, or a
// dead DB. Usage: node src/scripts/check_freshness.js [--dry-run]
const prisma = require('../lib/prisma');
const { computeStaleness, formatStaleMessage } = require('../services/freshness_monitor');
const { sendTelegram } = require('../services/telegram');
const { sendDiscord } = require('../services/discord');

const dryRun = process.argv.includes('--dry-run');

// Alert via whichever channels are configured (Discord webhook and/or Telegram).
async function sendAlert(msg) {
  let delivered = false;
  try { delivered = await sendDiscord(msg) || delivered; }
  catch (e) { console.error('[monitor] Discord send failed:', e.message); }
  try { delivered = await sendTelegram(msg) || delivered; }
  catch (e) { console.error('[monitor] Telegram send failed:', e.message); }
  return delivered;
}

async function main() {
  const { dbOk, stale, error } = await computeStaleness(prisma);

  if (!dbOk) {
    const msg = `⚠️ Gasify monitor: DB unreachable — ${error}`;
    console.error(msg);
    if (!dryRun) await sendAlert(msg);
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
  const sent = await sendAlert(msg);
  if (!sent) {
    console.warn('[monitor] no alert channel configured (DISCORD_WEBHOOK_URL / TELEGRAM_*) — alert not delivered');
    process.exitCode = 1;
  }
}

main()
  .catch(e => { console.error('[monitor] fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
