// Daily price-drop digest sender — run by .github/workflows/alerts.yml at
// 05:00 UTC (after the nightly slow sync). One email per eligible user, max
// once per ~day (User.lastAlertAt guard lives in the query).
// Usage: node src/scripts/send_price_alerts.js [--dry-run]
require('dotenv').config();
const prisma = require('../lib/prisma');
const { queryDrops, buildDigests, formatDigestEmail } = require('../services/price_alerts');
const { sendPriceDropEmail, emailConfigured } = require('../services/email');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const rows = await queryDrops(prisma);
  const digests = buildDigests(rows);
  console.log(`[alerts] ${rows.length} drop rows -> ${digests.length} digest(s)`);

  if (!digests.length) return;
  if (!dryRun && !emailConfigured()) {
    console.error('[alerts] EMAIL_* not configured — cannot send');
    process.exitCode = 1;
    return;
  }

  let sent = 0;
  const sentUserIds = [];
  for (const digest of digests) {
    const { subject, html } = formatDigestEmail(digest);
    if (dryRun) {
      console.log(`[dry-run] to=${digest.email} plan=${digest.plan} stations=${digest.stations.length} capped=${digest.capped}`);
      console.log(`[dry-run] subject: ${subject}`);
      for (const s of digest.stations) {
        for (const d of s.drops) console.log(`[dry-run]   ${s.name} (${s.country}): ${d.fuelType} ${d.oldPrice} -> ${d.newPrice}`);
      }
      continue;
    }
    try {
      await sendPriceDropEmail(digest.email, { subject, html });
      sentUserIds.push(digest.userId);
      sent++;
    } catch (err) {
      // One bad mailbox must not kill the whole batch.
      console.error(`[alerts] send failed for ${digest.email}: ${err.message}`);
    }
  }

  if (sentUserIds.length) {
    await prisma.user.updateMany({ where: { id: { in: sentUserIds } }, data: { lastAlertAt: new Date() } });
  }
  console.log(`[alerts] sent ${sent}/${digests.length}${dryRun ? ' (dry-run: 0 sent by design)' : ''}`);
}

main()
  .catch(e => { console.error('[alerts] fatal:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
