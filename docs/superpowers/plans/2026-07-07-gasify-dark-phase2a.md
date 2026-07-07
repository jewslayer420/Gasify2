# Gasify Refined Dark — Phase 2a: polish pass + command bar + cheapest-near-me

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Spec: `docs/superpowers/specs/2026-07-07-map-ui-redesign-design.md` (dark direction note at top).

**Goal:** Visible prestige upgrade of the existing dark map screen — refined dark tokens shipped TOGETHER with component styling, a unified top command bar, and the one-click "Cheapest near me" flow.

**Architecture:** Stay inside `MapView.js` + `map.module.css` (component split deferred to 2b to avoid another half-state). Token changes + styling land in the same commit as the components that consume them.

## Global Constraints

- DARK stays. Map style stays `basic-v2-dark`. No page may ever mix light/dark half-states.
- Refined dark tokens (replace in `globals.css` `:root`, keeping names):
  `--bg:#0C0E13; --bg-secondary:#141720; --bg-card:#191D28; --border:rgba(232,234,240,0.07); --text:#F2F4F8; --text-muted:#8A91A6; --accent:#37D3A0; --green:#2FBF84; --orange:#E8A23D; --red:#E25A5A; --r:14px; --shadow-1:0 2px 8px rgba(0,0,0,.45),0 8px 24px rgba(0,0,0,.35); --shadow-2:0 8px 24px rgba(0,0,0,.5),0 20px 48px rgba(0,0,0,.4);`
  (keep `--blue`, `--panel-w`, `--peek-h`, `--nav-h`, `*-dim` as-is).
- Price dot/chip colors in `MapView.js` (`priceColor()`, `pointLayer`, heatmap): low `#2FBF84`, mid `#E8A23D`, high `#E25A5A`, none `#5A6072`. Chart line + tooltip: accent `#37D3A0`, dark card background.
- Tabular numerals on `.stationRowPrice`, `.detailPriceBig`, `.priceChipVal`.
- Verify each task: `npm run build` → `npx pm2 restart gasify-frontend` → HTTP 200 on `/` and `/map` → commit + push.

### Task 1: Refined dark tokens + price colors + soft depth (one commit)
- Update `globals.css` tokens (values above).
- `map.module.css`: panels (`.fuelTabs .searchForm .modeBtns .detailPanel .sidebar`) get `box-shadow: var(--shadow-1)` (KEEP their existing borders/backgrounds — dark glass `rgba(20,23,32,0.88)` + hairline `var(--border)`); bump radii to `--r`.
- `.fuelTabActive` and `.searchBtn`: background `var(--accent)`, color `#08110D`.
- Badge chips in `MapView.js`: background `#141720`, border `1.5px solid rgba(232,234,240,0.12)`, keep light text.
- Tabular numerals on the three price classes.

### Task 2: Command bar
Restructure the `.controls` row in `MapView.js` into ONE centered pill (`.commandBar`): [search input] · [fuel segmented control] · [**⛽ Cheapest near me** accent button]. CSS: `.commandBar { position:absolute; top:14px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:4px; background:rgba(20,23,32,0.92); backdrop-filter:blur(12px); border:1px solid var(--border); border-radius:999px; padding:4px; box-shadow:var(--shadow-2); z-index:1000; max-width:92vw; }` — fuel tabs inside lose their own pill background. Existing mode buttons (map/list etc.) move to a small secondary cluster top-right. Keep all existing handlers.

### Task 3: Cheapest-near-me flow
New handler `cheapestNearMe()` in `MapView.js`: `navigator.geolocation.getCurrentPosition` → set `userPos` → `map.flyTo({center:[lng,lat], zoom:12})` → fetch `/api/stations?fuel=<fuel>&lat=&lng=&near=1` (existing endpoint returns 50 nearest, price-sorted list already exists via `near` mode — reuse the existing near-me fetch path) → take the cheapest with a price → `setSelected(cheapest)` (opens detail card) + render a distinct winner Marker (accent ring: 22px dot, `border:3px solid var(--accent)`, star glyph). Errors: geolocation denied → small toast div "Location denied — allow location to find the cheapest station near you". Button shows loading dot while running.

### Task 4: Live review gate
User hard-refreshes `/map`; feedback steers 2b (league table + country lens + detail card redesign + component split).
