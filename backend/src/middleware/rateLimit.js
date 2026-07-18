// Sliding-window in-memory rate limiter. Single-process state is fine here:
// the API runs as one instance (PM2 fork locally, one Render dyno in prod).
// makeLimiter is exported for tests with an injectable clock.

function makeLimiter({ windowMs, max, keyFn, message = 'Too many attempts — try again later', now = Date.now }) {
  const hits = new Map(); // key -> [timestamps]
  let lastSweep = now();

  return function rateLimit(req, res, next) {
    const t = now();
    // Bound memory: periodically drop buckets whose newest hit left the window.
    if (t - lastSweep > windowMs) {
      lastSweep = t;
      for (const [k, arr] of hits) {
        if (!arr.length || t - arr[arr.length - 1] >= windowMs) hits.delete(k);
      }
    }
    const key = keyFn(req);
    const arr = (hits.get(key) ?? []).filter(ts => t - ts < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      res.set('Retry-After', String(Math.ceil((windowMs - (t - arr[0])) / 1000)));
      return res.status(429).json({ error: message });
    }
    arr.push(t);
    hits.set(key, arr);
    next();
  };
}

const emailOf = req => String(req.body?.email ?? '').toLowerCase().trim();

// Password guessing on one account from one address: 10 tries / 15 min.
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: req => `${req.ip}|${emailOf(req)}`,
  message: 'Too many sign-in attempts — try again in a few minutes',
});

// Email-spraying from one address across many accounts: 30 tries / 15 min.
const loginIpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: req => req.ip,
  message: 'Too many sign-in attempts — try again in a few minutes',
});

// Outbound-email flows (reset / verification resend): 5 sends / 15 min —
// stops mail-bombing a victim's inbox through our sender.
const emailFlowLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyFn: req => `${req.ip}|${emailOf(req)}`,
  message: 'Too many requests — try again in a few minutes',
});

module.exports = { makeLimiter, loginLimiter, loginIpLimiter, emailFlowLimiter };
