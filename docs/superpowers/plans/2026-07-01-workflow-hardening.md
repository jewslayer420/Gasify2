# Sync Monitoring & Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent GitHub Actions workflow that alerts to Telegram whenever prod fuel-price data goes stale, so a sync outage or partial failure can never again go unnoticed for days.

**Architecture:** A standalone `sync-monitor.yml` (every 6h, decoupled from the sync jobs) runs `check_freshness.js`, which queries Neon for per-country price age, classifies staleness with tiered thresholds (volatile 48h / weekly 12d) plus the existing manual-price `asOf` check, and posts a Telegram message on staleness or DB-down. Pure logic lives in a separately unit-tested module.

**Tech Stack:** Node 24 (built-in `node --test` runner, `fetch`), Prisma 5 (`$queryRaw`), Telegram Bot API, GitHub Actions.

## Global Constraints

- **Node version:** all workflows use `actions/setup-node@v4` with `node-version: 24` (copied verbatim).
- **No new npm dependencies.** Use Node's built-in `node:test`, `node:assert/strict`, and global `fetch`.
- **Testing:** pure logic gets real unit tests via `node --test`; I/O + workflow pieces are verified manually (`--dry-run`, `workflow_dispatch`). Broader app testing remains manual per CLAUDE.md.
- **DB identifiers:** `Station.country` holds ISO-2 codes (e.g. `FR`). Manual-country codes come from `REGULATED_MANUAL[].cc` + South Africa (`PRICE_META.cc` in `southafrica.js`).
- **Secrets (owner adds later):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Code must no-op safely when they are unset.
- **Commit style:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch is `main`.

---

## File Structure

- Create `backend/src/services/freshness_monitor.js` — pure classification (`thresholdHoursFor`, `classifyStale`, `formatStaleMessage`) + impure `computeStaleness(prisma, now)`.
- Create `backend/src/services/freshness_monitor.test.js` — `node:test` unit tests for the pure functions.
- Create `backend/src/services/telegram.js` — `sendTelegram(text)`.
- Create `backend/src/services/telegram.test.js` — `node:test` for the unconfigured no-op branch.
- Create `backend/src/scripts/check_freshness.js` — orchestrator with `--dry-run`.
- Create `.github/workflows/sync-monitor.yml` — the scheduled monitor.
- Modify `.github/workflows/sync-fast.yml` and `sync-slow.yml` — `node-version: 20 → 24`.

---

## Task 1: Freshness classification module

**Files:**
- Create: `backend/src/services/freshness_monitor.js`
- Test: `backend/src/services/freshness_monitor.test.js`

**Interfaces:**
- Consumes: `priceFreshness(now)` from `./price_freshness` → `[{ cc, label, asOf, ageDays, staleAfterDays, stale }]`.
- Produces:
  - `thresholdHoursFor(cc)` → `number | null` (hours; `null` = muted).
  - `classifyStale({ autoRows, manual, now })` → `[{ cc, kind, ageH?, ageDays?, label? }]` where `autoRows` = `[{ country, last }]` (`last` = Date|string|null), `manual` = `priceFreshness()` output.
  - `formatStaleMessage(stale)` → `string`.
  - `computeStaleness(prisma, now?)` → `Promise<{ dbOk, stale, error? }>`.
  - Exported constants: `VOLATILE_CC` (Set), `VOLATILE_HOURS` (48), `WEEKLY_HOURS` (288), `STALE_OVERRIDE` (`{ AR: null }`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/freshness_monitor.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  thresholdHoursFor, classifyStale, formatStaleMessage,
  VOLATILE_HOURS, WEEKLY_HOURS,
} = require('./freshness_monitor');

test('thresholdHoursFor: volatile country uses 48h', () => {
  assert.equal(thresholdHoursFor('FR'), VOLATILE_HOURS);
});

test('thresholdHoursFor: weekly (non-volatile, non-muted) uses 288h', () => {
  assert.equal(thresholdHoursFor('PL'), WEEKLY_HOURS);
});

test('thresholdHoursFor: muted override returns null', () => {
  assert.equal(thresholdHoursFor('AR'), null);
});

test('classifyStale: fresh volatile country is not stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: new Date(now - 10 * 3600000) }]; // 10h old
  assert.deepEqual(classifyStale({ autoRows, manual: [], now }), []);
});

test('classifyStale: stale volatile country flagged with hours', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: new Date(now - 60 * 3600000) }]; // 60h > 48h
  const out = classifyStale({ autoRows, manual: [], now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'FR');
  assert.equal(out[0].kind, 'auto');
  assert.equal(Math.round(out[0].ageH), 60);
});

test('classifyStale: muted country (AR) never flagged even when very old', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'AR', last: new Date(now - 1000 * 3600000) }];
  assert.deepEqual(classifyStale({ autoRows, manual: [], now }), []);
});

test('classifyStale: null last (never synced) counts as stale', () => {
  const now = Date.UTC(2026, 0, 10);
  const autoRows = [{ country: 'FR', last: null }];
  const out = classifyStale({ autoRows, manual: [], now });
  assert.equal(out.length, 1);
  assert.equal(out[0].cc, 'FR');
});

test('classifyStale: manual country excluded from auto, taken from manual list', () => {
  const now = Date.UTC(2026, 0, 10);
  // SA is manual — even though it appears in autoRows it must be skipped there
  const autoRows = [{ country: 'SA', last: new Date(now - 1000 * 3600000) }];
  const manual = [{ cc: 'SA', label: 'Saudi Arabia', ageDays: 130, stale: true }];
  const out = classifyStale({ autoRows, manual, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'manual');
  assert.equal(out[0].ageDays, 130);
});

test('formatStaleMessage: compact one-line summary', () => {
  const msg = formatStaleMessage([
    { cc: 'FR', kind: 'auto', ageH: 61 },
    { cc: 'SA', kind: 'manual', ageDays: 130, label: 'Saudi Arabia' },
  ]);
  assert.match(msg, /Gasify/);
  assert.match(msg, /FR 61h/);
  assert.match(msg, /SA 130d/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/freshness_monitor.test.js`
Expected: FAIL — `Cannot find module './freshness_monitor'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/freshness_monitor.js`:

```js
// Cross-country price-staleness classifier for the sync monitor.
// Auto countries are judged by newest FuelPrice.updatedAt (tiered threshold);
// manual/regulated countries are judged by their asOf date (price_freshness.js).
const { priceFreshness } = require('./price_freshness');

const VOLATILE_HOURS = 48;    // per-station gov APIs — prices move constantly
const WEEKLY_HOURS = 288;     // 12d — national-avg / weekly sources

// ISO-2 codes of the FAST (per-station) countries. UK stations are stored as 'GB'.
const VOLATILE_CC = new Set([
  'FR', 'ES', 'IT', 'PT', 'AT', 'SI', 'IS', 'FI', 'GB', 'LU', 'CL', 'TW', 'MX', 'AU',
]);

// Per-country overrides. null = muted (never alert). Argentina is unreachable from
// GitHub runner IPs, so it would otherwise cry wolf forever.
const STALE_OVERRIDE = { AR: null };

function thresholdHoursFor(cc) {
  if (Object.prototype.hasOwnProperty.call(STALE_OVERRIDE, cc)) return STALE_OVERRIDE[cc];
  return VOLATILE_CC.has(cc) ? VOLATILE_HOURS : WEEKLY_HOURS;
}

// Pure: given auto DB rows + manual freshness list, return the stale entries.
function classifyStale({ autoRows, manual, now = Date.now() }) {
  const manualCCs = new Set(manual.map(m => m.cc));
  const stale = [];

  for (const r of autoRows) {
    const cc = r.country;
    if (manualCCs.has(cc)) continue;            // manual handled below
    const thr = thresholdHoursFor(cc);
    if (thr === null) continue;                 // muted
    const ageH = r.last == null ? Infinity : (now - new Date(r.last).getTime()) / 3600000;
    if (ageH > thr) stale.push({ cc, kind: 'auto', ageH, thr });
  }

  for (const m of manual) {
    if (m.stale) stale.push({ cc: m.cc, kind: 'manual', ageDays: m.ageDays, label: m.label });
  }

  return stale;
}

function formatStaleMessage(stale) {
  const parts = stale.map(s =>
    s.kind === 'auto'
      ? `${s.cc} ${s.ageH === Infinity ? 'never' : Math.round(s.ageH) + 'h'}`
      : `${s.cc} ${s.ageDays}d`
  );
  return `⚠️ Gasify: ${stale.length} countr${stale.length === 1 ? 'y' : 'ies'} stale — ${parts.join(', ')}`;
}

// Impure: query Neon, combine with manual freshness, classify.
async function computeStaleness(prisma, now = Date.now()) {
  let autoRows;
  try {
    autoRows = await prisma.$queryRaw`
      SELECT s.country AS country, MAX(fp."updatedAt") AS last
      FROM "Station" s JOIN "FuelPrice" fp ON fp."stationId" = s.id
      GROUP BY s.country`;
  } catch (e) {
    return { dbOk: false, stale: [], error: e.message };
  }
  const manual = priceFreshness(now);
  return { dbOk: true, stale: classifyStale({ autoRows, manual, now }) };
}

module.exports = {
  thresholdHoursFor, classifyStale, formatStaleMessage, computeStaleness,
  VOLATILE_CC, VOLATILE_HOURS, WEEKLY_HOURS, STALE_OVERRIDE,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/services/freshness_monitor.test.js`
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/freshness_monitor.js backend/src/services/freshness_monitor.test.js
git commit -m "Add freshness classification module for sync monitor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Telegram sender

**Files:**
- Create: `backend/src/services/telegram.js`
- Test: `backend/src/services/telegram.test.js`

**Interfaces:**
- Produces: `sendTelegram(text)` → `Promise<boolean>` (`true` if sent, `false` if unconfigured; throws on HTTP error).

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/telegram.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('sendTelegram: returns false and does not call fetch when unconfigured', async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  let called = false;
  const realFetch = global.fetch;
  global.fetch = async () => { called = true; return { ok: true }; };
  try {
    const { sendTelegram } = require('./telegram');
    const result = await sendTelegram('hello');
    assert.equal(result, false);
    assert.equal(called, false);
  } finally {
    global.fetch = realFetch;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/services/telegram.test.js`
Expected: FAIL — `Cannot find module './telegram'`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/telegram.js`:

```js
// Minimal Telegram Bot API sender. No-ops (returns false) if secrets are unset,
// so it is safe to ship before the bot exists.
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set — skipping send');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}: ${await res.text()}`);
  return true;
}

module.exports = { sendTelegram };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/services/telegram.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/telegram.js backend/src/services/telegram.test.js
git commit -m "Add Telegram sender (no-op when unconfigured)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Monitor orchestrator script

**Files:**
- Create: `backend/src/scripts/check_freshness.js`

**Interfaces:**
- Consumes: `computeStaleness`, `formatStaleMessage` from `../services/freshness_monitor`; `sendTelegram` from `../services/telegram`; `prisma` from `../lib/prisma`.
- Produces: CLI entry point. Flags: `--dry-run` (print, don't send). Exit codes: `0` = monitor ran OK (fresh, or stale-and-notified); `1` = DB unreachable or Telegram send threw.

- [ ] **Step 1: Write the implementation**

Create `backend/src/scripts/check_freshness.js`:

```js
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
```

- [ ] **Step 2: Verify country classification against real DB codes**

Run: `cd backend && node -e "require('./src/lib/prisma').\$queryRaw\`SELECT DISTINCT country FROM \"Station\" ORDER BY country\`.then(r=>{console.log(r.map(x=>x.country).join(' '));process.exit(0)})"`
Expected: a space-separated list of ISO codes. Confirm every FAST country appears as expected (esp. `GB` for the UK, `AU` for Australia). If a volatile country uses a different code, update `VOLATILE_CC` in `freshness_monitor.js` and re-run Task 1's tests.

- [ ] **Step 3: Dry-run against Neon**

Run: `cd backend && node src/scripts/check_freshness.js --dry-run`
Expected: prints either `[monitor] OK — all countries within freshness thresholds` or `[dry-run] would send Telegram: ⚠️ Gasify: N countries stale — …`. No error, no actual send (secrets unset ⇒ would no-op anyway). Sanity-check the flagged countries are plausibly stale.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/check_freshness.js
git commit -m "Add check_freshness monitor script (--dry-run supported)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Monitor workflow + Node 24 bump

**Files:**
- Create: `.github/workflows/sync-monitor.yml`
- Modify: `.github/workflows/sync-fast.yml` (setup-node `node-version: 20` → `24`)
- Modify: `.github/workflows/sync-slow.yml` (setup-node `node-version: 20` → `24`)

**Interfaces:**
- Consumes: `backend/src/scripts/check_freshness.js`; secrets `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

- [ ] **Step 1: Create the monitor workflow**

Create `.github/workflows/sync-monitor.yml`:

```yaml
name: Sync monitor (freshness alert)

# Independent of the sync jobs: queries Neon for per-country price age and alerts
# Telegram if anything is stale or the DB is unreachable. Catches a total sync
# outage, a partial failure, or a dead DB — none of which the sync runs surface on
# their own. Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID as repo secrets to enable
# delivery; without them the run still succeeds and just logs.

on:
  schedule:
    - cron: '45 */6 * * *'   # every 6h at :45, between the sync runs
  workflow_dispatch: {}

concurrency:
  group: sync-monitor
  cancel-in-progress: false

jobs:
  monitor:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: backend
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
      TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npx prisma generate
      - run: node src/scripts/check_freshness.js
```

- [ ] **Step 2: Bump Node in sync-fast.yml**

In `.github/workflows/sync-fast.yml`, change:
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
```
to:
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 24
```

- [ ] **Step 3: Bump Node in sync-slow.yml**

Make the identical `node-version: 20` → `24` change in `.github/workflows/sync-slow.yml`.

- [ ] **Step 4: Validate the workflow files (dependency-free)**

Run: `cd "$(git rev-parse --show-toplevel)" && grep -c 'node-version: 24' .github/workflows/sync-fast.yml .github/workflows/sync-slow.yml .github/workflows/sync-monitor.yml && grep -E "cron:|check_freshness" .github/workflows/sync-monitor.yml`
Expected: each of the three files reports `:1` for `node-version: 24`, and the monitor file shows its `cron:` schedule and the `check_freshness` run line. (GitHub also validates the YAML on push in Step 5 — a malformed workflow shows as invalid in the Actions tab.)

- [ ] **Step 5: Commit + push**

```bash
git add .github/workflows/sync-monitor.yml .github/workflows/sync-fast.yml .github/workflows/sync-slow.yml
git commit -m "Add sync-monitor workflow + bump workflows to Node 24

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Live verification (after owner adds secrets)**

Once `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set as repo secrets:
Run: `gh workflow run sync-monitor.yml && sleep 20 && gh run list --workflow=sync-monitor.yml --limit 1`
Expected: run completes `success`; if any country is stale, a Telegram message arrives in the target chat. (Before secrets exist, the run still succeeds and logs `Telegram not configured`.)

---

## Post-implementation follow-ups (out of scope here)

- Owner: create the Telegram bot (BotFather) + capture chat id, add the two secrets.
- Optional: remove the now-redundant email path in `runPriceFreshnessCheck()` once Telegram is confirmed working.
