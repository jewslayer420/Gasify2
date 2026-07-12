// Discord webhook alerts — free alternative to Telegram (no phone verification
// or SMS fee). Create: Server Settings → Integrations → Webhooks → New Webhook,
// copy the URL into DISCORD_WEBHOOK_URL.
async function sendDiscord(message) {
  // Forgive common secret-paste mistakes: surrounding quotes/whitespace, missing scheme.
  let url = (process.env.DISCORD_WEBHOOK_URL || '').trim().replace(/^["']+|["']+$/g, '');
  if (!url) {
    console.log('[discord] DISCORD_WEBHOOK_URL not set — skipping send');
    return false;
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    new URL(url);
  } catch {
    throw new Error('DISCORD_WEBHOOK_URL is not a valid URL — re-paste the webhook URL (https://discord.com/api/webhooks/...) into the secret');
  }
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Discord HTTP ${r.status}: ${await r.text()}`);
  return true;
}

module.exports = { sendDiscord };
