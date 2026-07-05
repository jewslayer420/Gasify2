// Manual-price freshness monitor.
//
// The `regulated_manual.js` countries (UAE, Saudi, Kenya, Dominican Rep., Uruguay,
// Qatar, Kuwait, Oman, Bahrain, Brunei, Ecuador) + South Africa carry hand-maintained
// official regulated prices — they have no clean API to auto-pull from. This module
// flags when a country's price (its `asOf`) is older than the country's expected
// refresh cadence, logs it, and emails an admin alert so the constant gets refreshed
// before it drifts. It does NOT change prices — a human updates the constant + `asOf`.

const { REGULATED_MANUAL } = require('./scrapers/regulated_manual');
const { PRICE_META: SA_META } = require('./scrapers/southafrica');
const { sendPriceStaleAlert } = require('./email');

// Days before a manual price is considered stale, by country. Default 45.
// Faster-moving markets get shorter windows; fixed/subsidised ones get long ones.
const STALE_AFTER = {
  default: 45, DO: 21, EC: 40, KE: 40, UY: 45, KW: 150, SA: 120, BN: 365,
  RS: 21, ME: 21, AL: 21, CH: 30, BA: 30, // ex-fuelo European: RS/ME/AL weekly, CH/BA market
  XK: 21, // Kosovo MINT publishes every few days; prices drift slowly
  VN: 21, // Vietnam MOIT adjusts ~weekly
  EG: 120, MA: 30, TN: 90, // Egypt quarterly; Morocco biweekly market avg; Tunisia irregular
  MD: 21, PK: 21, JP: 30, // Moldova ANRE daily; Pakistan OGRA fortnightly; Japan METI weekly avg
};

function asOfMs(asOf) {
  const [y, m, d] = String(asOf).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

// All hand-maintained manual prices (regulated_manual + South Africa).
function manualEntries() {
  return [
    ...REGULATED_MANUAL.map(c => ({ cc: c.cc, label: c.label, asOf: c.asOf, source: c.source })),
    SA_META,
  ];
}

// Compute freshness for every manual price; `stale` flag = overdue for refresh.
function priceFreshness(now = Date.now()) {
  return manualEntries().map(c => {
    const ageDays = Math.floor((now - asOfMs(c.asOf)) / 86400000);
    const staleAfterDays = STALE_AFTER[c.cc] ?? STALE_AFTER.default;
    return { cc: c.cc, label: c.label, asOf: c.asOf, source: c.source, ageDays, staleAfterDays, stale: ageDays > staleAfterDays };
  });
}

function staleManualPrices(now = Date.now()) {
  return priceFreshness(now).filter(c => c.stale).sort((a, b) => b.ageDays - a.ageDays);
}

// Run the check: log a summary, and email an alert if anything is overdue.
async function runPriceFreshnessCheck() {
  const all = priceFreshness();
  const stale = all.filter(c => c.stale).sort((a, b) => b.ageDays - a.ageDays);
  if (!stale.length) {
    console.log(`[price-freshness] OK — all ${all.length} manual prices within cadence`);
    return { stale: [], total: all.length };
  }
  console.warn(`[price-freshness] ${stale.length}/${all.length} manual prices STALE:`);
  for (const s of stale) console.warn(`  ${s.cc} (${s.label}): ${s.ageDays}d old (>${s.staleAfterDays}d) — ${s.source}`);

  const to = process.env.PRICE_ALERT_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
  if (to && process.env.EMAIL_HOST) {
    try { await sendPriceStaleAlert(to, stale); console.log(`[price-freshness] alert emailed to ${to}`); }
    catch (e) { console.error('[price-freshness] email failed:', e.message); }
  } else {
    console.warn('[price-freshness] email not configured (set EMAIL_* + PRICE_ALERT_EMAIL on the host) — logged only');
  }
  return { stale, total: all.length };
}

module.exports = { priceFreshness, staleManualPrices, runPriceFreshnessCheck };
