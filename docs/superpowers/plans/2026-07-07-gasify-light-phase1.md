# Gasify Light — Phase 1 (Tokens + Light Map) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the visible foundation of the editorial-light redesign: design tokens in `globals.css`, MapTiler `dataviz-light` basemap, and premium price colors — so the user can judge the new look live at `localhost:3000/map`.

**Architecture:** Pure CSS-token + constant changes; no component restructuring (that is Phase 2). Frontend has **no test framework** — verification is `npm run build` + served-bundle checks + PM2 restart + HTTP checks, per repo convention (CLAUDE.md).

**Tech Stack:** Next.js (app router, CSS modules), MapLibre via react-map-gl, MapTiler (key in `frontend/.env.local`), PM2 prod serve on :3000.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-map-ui-redesign-design.md` §1.
- Canvas `#FAFAF8`; surfaces `#FFFFFF`; radius token `--r: 16px`; shadows not borders.
- Accent: `#0F6B4F`, used ONLY for primary actions/logo.
- Price colors: low `#1a9e6e`, mid `#d98a1f`, high `#d64545` (replace neon #22c55e/#f97316/#ef4444 everywhere they appear).
- Map style id: `dataviz-light` (was `basic-v2-dark`); CARTO dark fallback stays for keyless dev.
- Prices use `font-variant-numeric: tabular-nums`.
- After any frontend change: `npm run build` then `npx pm2 restart gasify-frontend` (no hot reload).
- Commit after each task and push (`git push origin main`).

---

### Task 1: Design tokens in globals.css

**Files:**
- Modify: `frontend/app/globals.css` (token block at top; read the file first — it currently defines dark-theme variables like `--bg`, `--bg-card`, `--border`, `--text`, `--text-muted`, `--green`, `--orange`, `--red`, `--nav-h`, `--r` consumed by all `*.module.css` files)

**Interfaces:**
- Produces: CSS custom properties consumed by every module stylesheet. Keep the EXISTING variable names (so all screens flip at once) and add new aliases: `--surface`, `--ink`, `--accent`, `--price-low`, `--price-mid`, `--price-high`, `--shadow-1`, `--shadow-2`.

- [ ] **Step 1: Read `frontend/app/globals.css`** and note every variable defined in `:root` and any `body { background/color }` rules.

- [ ] **Step 2: Rewrite the `:root` block** mapping old names to light values so existing consumers flip automatically, e.g.:

```css
:root {
  /* Gasify Light — spec 2026-07-07 §1 */
  --bg: #FAFAF8;            /* canvas */
  --bg-secondary: #F1F1EE;
  --bg-card: #FFFFFF;       /* surfaces */
  --surface: #FFFFFF;
  --ink: #17201C;
  --text: #17201C;
  --text-muted: #6B7671;
  --border: rgba(23, 32, 28, 0.08);   /* hairline only where a border exists today */
  --accent: #0F6B4F;
  --green: #1a9e6e;  --price-low: #1a9e6e;
  --orange: #d98a1f; --price-mid: #d98a1f;
  --red: #d64545;    --price-high: #d64545;
  --shadow-1: 0 1px 3px rgba(23,32,28,.06), 0 4px 16px rgba(23,32,28,.08);
  --shadow-2: 0 4px 12px rgba(23,32,28,.10), 0 12px 32px rgba(23,32,28,.12);
  --r: 16px;
  --nav-h: /* keep existing value unchanged */;
}
body { background: var(--bg); color: var(--text); }
```

Also add a global price-numeral rule: `.tabular, [class*="price" i] { font-variant-numeric: tabular-nums; }` — plus set `font-variant-numeric: tabular-nums` directly in the price classes you touch in Task 2.

- [ ] **Step 3: Build and serve**

Run (from `frontend/`): `npm run build` then `npx pm2 restart gasify-frontend`
Expected: build succeeds; `Invoke-WebRequest http://localhost:3000 -UseBasicParsing` → HTTP 200.

- [ ] **Step 4: Verify tokens live**

Run: `(Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing).Content -match 'FAFAF8'` on the served CSS (or grep `.next/static/css/*.css` for `#FAFAF8` and `#0F6B4F`).
Expected: True.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css
git commit -m "Gasify Light phase 1: light design tokens in globals.css"
git push origin main
```

### Task 2: Light basemap + premium price colors in the map screen

**Files:**
- Modify: `frontend/app/map/MapView.js` (MAP_STYLE constant; `priceColor()` at ~line 31; heatmap layer colors if they hardcode the neon values; badge/marker inline styles using `#22c55e` / `#1a1d2b` — switch badge chip to white surface + ink text)
- Modify: `frontend/app/map/map.module.css` (panel/detail backgrounds and shadows: replace hard borders with `box-shadow: var(--shadow-1)`; ensure `.stationRowPrice`, `.detailPriceBig`, `.priceChipVal` get `font-variant-numeric: tabular-nums`)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `MAP_STYLE` uses `https://api.maptiler.com/maps/dataviz-light/style.json?key=…`; `priceColor(p)` returns `#1a9e6e` / `#d98a1f` / `#d64545` / neutral `#9AA39E` for null.

- [ ] **Step 1: Validate the style id before wiring** (fail fast if the id is wrong):

Run: `Invoke-WebRequest "https://api.maptiler.com/maps/dataviz-light/style.json?key=<key from frontend/.env.local>" -UseBasicParsing | Select-Object StatusCode`
Expected: 200. (If 404, use `streets-v2-light` and note the substitution in the commit message.)

- [ ] **Step 2: Edit `MapView.js`:**

```js
const MAP_STYLE = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function priceColor(p) {
  if (!p) return '#9AA39E';
  if (p <= 1.60) return '#1a9e6e';
  if (p <= 1.90) return '#d98a1f';
  return '#d64545';
}
```

Then grep MapView.js for remaining `#22c55e`, `#f97316`, `#ef4444`, `#1a1d2b` and update: country badge chip → `background:'#FFFFFF'`, `border: 1.5px solid rgba(23,32,28,0.10)`, `color:'#17201C'`, `boxShadow:'0 2px 8px rgba(23,32,28,0.15)'`; heatmap gradient stops → use the three new price colors.

- [ ] **Step 3: Sweep the map stylesheet** — in `map.module.css` replace `border: 1px solid var(--border)` on floating panels with `border: none; box-shadow: var(--shadow-1);` and add `font-variant-numeric: tabular-nums;` to `.stationRowPrice`, `.detailPriceBig`, `.priceChipVal`.

- [ ] **Step 4: Build, serve, verify**

Run: `npm run build`; `npx pm2 restart gasify-frontend`; then check `dataviz-light` present in `.next/static/chunks` (Select-String) and `http://localhost:3000/map` → 200.
Expected: both true.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/map/MapView.js frontend/app/map/map.module.css
git commit -m "Gasify Light phase 1: dataviz-light basemap + premium price colors"
git push origin main
```

### Task 3: User review gate (live)

- [ ] Tell the user: hard-refresh `localhost:3000/map` and the landing page; collect reactions (map style, price colors, panel feel). Their feedback steers Phase 2 (map screen rebuild plan) — do NOT start Phase 2 without it.
