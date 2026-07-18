# Price-drop alerts — design

2026-07-18. First user-facing Premium hook: email users when a favorited
station's fuel price drops.

## Purpose

Users favorite stations; syncs record every price change in `PriceHistory`.
When a favorite gets cheaper, the user gets one daily digest email. Free plan
monitors up to 3 favorites, Premium monitors all — giving the pricing page's
"Price-drop alerts" line a real implementation.

## Detection semantics

A (station, fuelType) **dropped** when: the newest `PriceHistory` row inside
the last 24 h has `price` strictly lower than the newest row *older* than
24 h (the baseline). Net-drop semantics: a dip that recovers within the
window does not alert. Stations with no baseline row (newly added) never
alert. All prices EUR/L as stored.

One batched SQL query (GHA runner → Neon rule: never per-row):

- `User` (`alertsEnabled AND emailVerified AND (lastAlertAt IS NULL OR
  lastAlertAt < NOW() - interval '20 hours')`)
- × their `Favorite` rows (+ `createdAt` for the free-tier cap)
- × LATERAL newest-in-window per fuelType (`DISTINCT ON`)
- × LATERAL baseline before window
- filtered to `latest.price < baseline.price`

## Digest & gating

Pure function `buildDigests(rows)` groups rows per user, sorts each user's
favorites by `Favorite.createdAt` ascending, and for `plan = 'free'` keeps
only the first **3 distinct stations** (deterministic; matches "up to 3
favorites"). Premium/admin: no cap. Per station, list every dropped fuel:
label, old → new price, percentage.

Email via the existing nodemailer service: subject like
"⛽ 2 of your stations got cheaper", table body, link to /map, footer
"manage alerts in your dashboard". After a successful send, set
`User.lastAlertAt = NOW()` (batched update).

## Schedule

`.github/workflows/alerts.yml` — daily `0 5 * * *` UTC (after slow sync
03:30 and the 00:15 fast window; the 24 h window spans all four fast runs),
plus `workflow_dispatch`. Secrets: `DATABASE_URL` (exists) + `EMAIL_HOST /
EMAIL_PORT / EMAIL_USER / EMAIL_PASS / EMAIL_FROM` (copied from
backend/.env via `gh secret set`). Runner: `node src/scripts/send_price_alerts.js`
(`--dry-run` prints digests without sending or stamping `lastAlertAt`).

## Data model

`User.alertsEnabled Boolean @default(false)` — opt-in.
`User.lastAlertAt DateTime?` — double-send guard.
(`prisma db push`; both additive.)

## API & frontend

- `GET /api/user/account` → add `alertsEnabled`.
- `PATCH /api/user/alerts` `{ enabled: boolean }` (requireAuth).
- Dashboard, Favorites section: toggle row "Price-drop alerts" with
  plan-aware description (free: "watching your first 3 favorites — Premium
  watches all"; premium: "watching all your favorites"). Requires a verified
  email (digest query enforces it; UI hints if unverified).
- Pricing page: Free list gains "Price-drop alerts (3 favorites)";
  Premium line becomes "Unlimited price-drop alerts".

## Files

- `backend/src/services/price_alerts.js` — SQL + pure `buildDigests`,
  `formatDigestEmail` (exported for tests)
- `backend/src/services/price_alerts.test.js` — node:test on the pure parts
- `backend/src/services/email.js` — `sendPriceDropEmail(to, digest)`
- `backend/src/scripts/send_price_alerts.js` — runner (`--dry-run`)
- `.github/workflows/alerts.yml`
- `backend/prisma/schema.prisma`, `backend/src/routes/users.js`,
  `frontend/app/dashboard/page.js` (+css), `frontend/app/pricing/page.js`,
  `frontend/lib/api.js`, CLAUDE.md test list

## Verification

Unit tests green; dry-run against prod data with a temporary test user
(favorite on a station with a real recent drop) showing a correct digest;
headless dashboard toggle check; workflow YAML validated by a dispatch run
in dry-run mode before the scheduled send goes live.

## Non-goals (YAGNI)

Per-fuel alert preferences, thresholds ("only drops > X%"), push/Discord
delivery, instant (non-digest) alerts, currency-localised emails. All easy
follow-ups; none needed for v1.
