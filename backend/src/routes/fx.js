const express = require('express');
const router = express.Router();

// GET /api/fx — EUR-base exchange rates for the frontend currency switcher.
// Same source the scrapers already use for local→EUR conversion
// (open.er-api.com: free, no key, ~160 currencies, refreshed daily).
// Cached 12h in memory; a fetch failure serves the last good snapshot
// (stale-while-error) so the switcher degrades rather than breaks.
const FX_URL = 'https://open.er-api.com/v6/latest/EUR';
const FX_TTL = 12 * 60 * 60 * 1000;

let fxCache = null; // { rates, asOf, fetchedAt }

router.get('/', async (req, res) => {
  if (fxCache && Date.now() - fxCache.fetchedAt < FX_TTL) {
    return res.json({ base: 'EUR', asOf: fxCache.asOf, rates: fxCache.rates });
  }
  try {
    const r = await fetch(FX_URL, {
      headers: { 'User-Agent': 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j.rates || !isFinite(j.rates.USD)) throw new Error('malformed rates payload');
    fxCache = { rates: j.rates, asOf: j.time_last_update_utc ?? null, fetchedAt: Date.now() };
    res.json({ base: 'EUR', asOf: fxCache.asOf, rates: fxCache.rates });
  } catch (err) {
    console.error('[fx]', err.message);
    if (fxCache) return res.json({ base: 'EUR', asOf: fxCache.asOf, rates: fxCache.rates, stale: true });
    res.status(503).json({ error: 'FX rates unavailable' });
  }
});

module.exports = router;
