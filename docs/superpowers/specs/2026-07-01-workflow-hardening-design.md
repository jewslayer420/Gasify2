# Sync Monitoring & Workflow Hardening — Design

**Date:** 2026-07-01
**Status:** design (pending user review)

## Problem

The scheduled fuel-price sync failed **silently for ~12 days** and nobody knew until
manually checked. Two distinct silent-failure modes exist:

1. **Total outage** — the sync stops running entirely (dead in-process cron on Render
   sleep; broken `DATABASE_URL` secret; a crashing script). This is how prices went 12
   days stale.
2. **Partial failure** — a sync run completes but some countries fail. `sync_all_now.js`
   catches per-country errors in-loop and still exits 0, so the run is **green** and no
   notification fires.

GitHub emails on hard-failed runs, but those emails were missed 12+ times, and the
existing `price_freshness.js` alert (a) only covers the ~13 manual/regulated countries
and (b) emails via `EMAIL_*`, which the sync workflows don't even set — so it's silent in
CI too.

## Goal

A **durable, independent** alert that pings a channel the owner actually watches
(Telegram) whenever prod fuel data goes stale — regardless of whether, or how, the sync
ran.

## Decisions (locked)

- **Alert channel:** Telegram (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` repo secrets).
- **Trigger:** data staleness (not "any failure") — targets the real harm and dodges
  alert fatigue from known-flaky sources.
- **Architecture:** a separate monitor workflow, independent of the sync workflows.
- **No `SyncStatus` table** — use tiered `updatedAt` thresholds instead (accepted tradeoff
  below).

## Architecture

Four small, single-purpose units + one workflow:

### 1. `backend/src/services/freshness_monitor.js` (pure computation)
`computeStaleness(prisma, now)` → `{ dbOk, stale: [{ cc, label, ageLabel, kind }] }`.
- **Auto countries** = every country with DB prices that is **not** in the manual set
  (`REGULATED_MANUAL` + South Africa). One
  `SELECT country, MAX(fp."updatedAt") ... GROUP BY country` query, split into two tiers
  **by set membership** (not a hand-typed list, so it can't drift):
  - *Volatile* — the `FAST` list in `sync_all_now.js` (per-station gov APIs: FR, ES, IT,
    PT, AT, SI, IS, FI, UK, LU, CL, TW, MX, AU): stale if newest price `> 48h` old.
  - *Weekly* — the remaining auto countries (`SLOW` list minus the manual set: EU Oil
    Bulletin CCs, turkey, northmacedonia, brazil, canada, usa, thailand, malaysia,
    newzealand, argentina): stale if `> 12d` old.
- **Manual/regulated countries:** reuse `priceFreshness()` from `price_freshness.js`
  (its `asOf` + per-country `STALE_AFTER` map), unchanged. Excluded from the auto
  `updatedAt` check, so no country is double-counted.
- **Per-country override / mute map** (`STALE_OVERRIDE`): known-perpetually-unreachable
  auto sources get a longer threshold or are muted, so they don't cry wolf. Seed it with
  **Argentina** (unreachable from GitHub runner IPs — see memory
  `reference-south-america-scrapers`). Same override idea as the manual `STALE_AFTER` map.

### 2. `backend/src/services/telegram.js` (isolated I/O)
`sendTelegram(text)` → POST `https://api.telegram.org/bot<TOKEN>/sendMessage` with
`{ chat_id, text }`. If either secret is unset: log a warning and no-op (safe to merge
before the bot exists).

### 3. `backend/src/scripts/check_freshness.js` (thin orchestrator)
- Calls `computeStaleness`.
- If `!dbOk` **or** `stale.length > 0`: format a compact message
  (`⚠️ Gasify: 3 countries stale — FR 61h, PL 14d, SA 130d`) and `sendTelegram`.
- **Exit codes:** `0` when all fresh; non-zero on DB-unreachable or Telegram send-failure
  (so the monitor run *also* goes red as a backstop signal).
- Supports `--dry-run`: compute + print the message, do not POST.

### 4. `.github/workflows/sync-monitor.yml`
- `schedule: cron '45 */6 * * *'` (every 6h at :45, offset from the sync runs) +
  `workflow_dispatch`.
- Steps: checkout → `setup-node` (node 24) → `npm ci` → `npx prisma generate` →
  `node src/scripts/check_freshness.js`.
- Env: `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- `timeout-minutes: 10`.

### 5. Node bump
`setup-node` `node-version: 20 → 24` in `sync-fast.yml`, `sync-slow.yml`, and the new
`sync-monitor.yml` (clears the forced-Node-24 deprecation warning).

## Failure modes covered

| Mode | Caught by |
|------|-----------|
| Total sync outage | Monitor: all auto countries exceed threshold within ≤48h |
| Partial sync failure | Monitor: the failed country's data ages past its threshold |
| DB unreachable | Monitor: `!dbOk` → alert + red run |
| Manual price overdue | Monitor: existing `asOf` check, now routed to Telegram |

## Accepted tradeoff

`updatedAt` reflects "last price *value* change," not "last successful sync." Chosen over
a `SyncStatus` table for simplicity (no migration, no per-sync write). Consequence:
detection is coarse — a total outage surfaces within ~48h (fast) / ~12d (weekly) rather
than immediately, and thresholds are set generously to avoid false alarms on stable small
countries. Still a night-and-day improvement over 12 silent days. If precise
sync-health tracking is later needed, add `SyncStatus` as a follow-up.

## New repo secrets (owner action)

- `TELEGRAM_BOT_TOKEN` — from BotFather.
- `TELEGRAM_CHAT_ID` — target chat/channel id.

## Verification

1. `node src/scripts/check_freshness.js --dry-run` locally against Neon — prints the stale
   list + the exact message it would send (validates detection + formatting, no bot
   needed).
2. After secrets are added: `workflow_dispatch` the monitor and confirm a Telegram message
   arrives.

## Out of scope

- Changing the sync run's own exit-code policy (the monitor is the safety net).
- Ripping out the old `runPriceFreshnessCheck()` email path — left dormant (no `EMAIL_*`
  in CI); can be removed later.
- Fixing italy's transient `fetch failed` (separate, self-clearing).
