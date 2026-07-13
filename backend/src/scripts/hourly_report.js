// Hourly Discord sync report — run every hour by .github/workflows/sync-monitor.yml.
// One message per hour: overall health (all countries vs stale list) plus which
// countries completed a sync in the past hour and how many prices actually moved.
// Replaces the old alert-only monitor run (staleness is folded into this report).
// Usage: node src/scripts/hourly_report.js [--dry-run]
const prisma = require('../lib/prisma');
const { computeStaleness, formatStaleMessage } = require('../services/freshness_monitor');
const { sendDiscord } = require('../services/discord');
const { sendTelegram } = require('../services/telegram');

const dryRun = process.argv.includes('--dry-run');

// The queries use a 75-minute window: covers GitHub cron jitter so a sync that
// ran at :29 is still counted by the report firing at :45 the same hour.

async function sendAlert(msg) {
  let delivered = false;
  try { delivered = await sendDiscord(msg) || delivered; }
  catch (e) { console.error('[report] Discord send failed:', e.message); }
  try { delivered = await sendTelegram(msg) || delivered; }
  catch (e) { console.error('[report] Telegram send failed:', e.message); }
  return delivered;
}

async function main() {
  const { dbOk, stale, error } = await computeStaleness(prisma);

  if (!dbOk) {
    const msg = `🔴 **Gasify hourly** — DB unreachable: ${error}`;
    console.error(msg);
    if (!dryRun) await sendAlert(msg);
    process.exitCode = 1;
    return;
  }

  // Syncs completed in the last hour (CountrySyncStatus is bumped per country
  // by every bulkUpsertStations run) + how many prices actually changed
  // (FuelPrice.updatedAt only moves on a price CHANGE).
  const synced = await prisma.$queryRaw`
    SELECT country, fetched FROM "CountrySyncStatus"
    WHERE "lastSyncAt" >= NOW() - interval '75 minutes'
    ORDER BY country`;
  const changedRows = await prisma.$queryRaw`
    SELECT s.country AS cc, COUNT(*)::int AS n
    FROM "FuelPrice" fp JOIN "Station" s ON s.id = fp."stationId"
    WHERE fp."updatedAt" >= NOW() - interval '75 minutes'
    GROUP BY s.country`;
  const changedByCc = new Map(changedRows.map(r => [r.cc, r.n]));
  const totalCountries = Number((await prisma.$queryRaw`
    SELECT COUNT(DISTINCT country)::int AS n FROM "Station"`)[0].n);

  const lines = [];

  // Health headline
  if (!stale.length) {
    lines.push(`🟢 **Gasify hourly** — all ${totalCountries} countries healthy`);
  } else {
    lines.push(`🔴 **Gasify hourly** — ${formatStaleMessage(stale).replace('⚠️ Gasify: ', '')}`);
    lines.push(`(${totalCountries - stale.length}/${totalCountries} countries healthy)`);
  }

  // Sync activity this hour
  if (synced.length) {
    const parts = synced.map(s => {
      const moved = changedByCc.get(s.country) ?? 0;
      return moved ? `**${s.country}** (${moved} price${moved === 1 ? '' : 's'} moved)` : s.country;
    });
    let line = `Synced this hour (${synced.length}): ${parts.join(', ')}`;
    // Discord hard-caps content at 2000 chars
    if (line.length > 1800) line = line.slice(0, 1797) + '…';
    lines.push(line);
  } else {
    lines.push('No sync runs this hour (fast sync every 6h, slow sync daily — quiet hours are normal).');
  }

  const msg = lines.join('\n');
  console.log(msg);
  if (dryRun) {
    console.log('[dry-run] not sending');
    return;
  }
  const sent = await sendAlert(msg);
  if (!sent) {
    console.warn('[report] no alert channel configured (DISCORD_WEBHOOK_URL / TELEGRAM_*) — report not delivered');
    process.exitCode = 1;
  }
}

main()
  .catch(e => { console.error('[report] fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
