# Gasify UI Redesign — spec (2026-07-07)

> ⚠️ **DIRECTION CHANGE 2026-07-07 (after live review):** the user saw the editorial-light
> Phase 1 live and chose **DARK**. Phase 1 was reverted (commit a932a14). The redesign
> continues as **"Refined dark" (Linear-like)**: keep the existing dark canvas and dark
> MapTiler style, apply the same discipline — one accent, crisp type scale, tabular
> numerals for prices, soft shadows over hard borders (dark-tuned), restrained motion.
> §2 (map screen flows), §3 (architecture), §4 (screens) and §5 (phases) are unchanged;
> §1's *values* are superseded (dark tokens to be defined in the Phase 2 plan), its
> *principles* stand. Theme changes must ship together with the component styling that
> assumes them — a token flip alone breaks screens (learned live).

**Goal:** the whole product (map, landing, news, credits, auth, dashboard) restyled to a
prestige-simple, editorial-light design system (Apple-like). Kill the "AI-made dark map"
look. Desktop web first; mobile edition later. Approach A approved: design-system-first,
phased rollout, each phase shippable. User will review live on the site and iterate.

## 1. Design system (approved)

CSS custom properties in `frontend/app/globals.css`; all screens consume tokens only.

- Canvas `#FAFAF8` (warm near-white); surfaces pure white, soft diffuse shadows
  (`--shadow-1/2`), **no hard borders**, radius `--r: 16px`.
- Map style: MapTiler **`dataviz-light`** (swap in `MapView.js` MAP_STYLE; keep key env).
- Type: Geist (bundled). Scale 32/24/18 headings, 15px body. **Tabular numerals for all
  prices** (`font-variant-numeric: tabular-nums`); prices are the heaviest element.
- Color: ONE accent, deep petrol-green `#0F6B4F` (primary actions + logo only). Neutral
  grays elsewhere. Price semantics only other color: desaturated green/amber/red
  (`--price-low/mid/high`) — tune from current neon (#22c55e/#f97316/#ef4444) to premium
  values (e.g. #1a9e6e / #d98a1f / #d64545).
- Motion: 200ms ease-out on panel/card enter only; nothing bounces; only the live
  location dot pulses.
- Spacing: 4px grid, 20px panel padding, generous whitespace.

## 2. Map screen (approved)

Full-bleed light map + three floating white layers:

1. **Top-center command bar** (single pill): search w/ autosuggest (MapTiler geocoding),
   fuel segmented control (Diesel · 95 · 98 · LPG…), **"Cheapest near me"** button — the
   only accent-colored element.
2. **Left panel (380px), context-sensitive** (replaces sidebar+badges+heatmap noise):
   - Zoomed out: **Country league table** — 63 countries ranked by selected-fuel price,
     flags + tabular prices, click → flyTo country. On-map badges become small
     monochrome flag chips (no counts).
   - Zoomed in: **Country lens** — country name, data source label (e.g. "EPDK,
     official"), national average, **offered fuels** (unavailable fuels grayed out in
     the segmented control), then ranked station list (sort: price ↔ distance).
   - "Saved" tab in panel header (favorites list; accounts exist).
3. **Station detail card** (floats right): hero price + 30-day sparkline, all fuels as
   chips, ★ Favorite, Directions (external maps link), "updated X ago" line.

**Cheapest-near-me flow:** click → geolocate → flyTo → rank nearest 25 → #1 gets a
crowned/gold pin + auto-opened detail card.

**Alerts:** per-saved-station toggle in dashboard (email); ships in phase 4.

## 3. Component architecture

Split the 566-line `MapView.js` monolith into `frontend/app/map/components/`:
`MapCanvas` (map + layers + pins), `CommandBar` (search/fuel/CTA), `SidePanel`
(league table ↔ country lens ↔ saved), `StationList`, `StationDetailCard`,
`CountryLeague`, `CountryLens`, plus `lib/mapData.js` for shared fetch/state helpers.
State stays in the `map/page.js` tree via props/context — no new state library.
Country metadata (fuels offered, source label) comes from a new lightweight endpoint
`GET /api/stations/country-meta` (distinct fuelTypes per country + source name from a
static map distilled from DATA_SOURCES.md), cached like /counts.

## 4. Other screens (same tokens)

- **Landing:** light hero, one-line value prop, live league-table teaser (top 10
  countries), single accent CTA → map. Replace current dark landing.
- **Auth (login/register/etc.):** centered white card, accent button, quiet errors.
- **Dashboard:** saved stations w/ sparklines + alert toggles.
- **News & Credits:** restyle to tokens (light cards).
- **Nav:** minimal light bar, logo in accent green.

## 5. Phases (each shippable)

1. Tokens in globals.css + light map style + retune price colors (site-wide base).
2. Map screen rebuild (components + command bar + league/lens panel + detail card +
   cheapest-near-me). Flagship.
3. Landing + nav.
4. Auth + dashboard (+ price-drop email alerts).
5. News + credits polish; screenshot pass.

## Non-goals (now)

Mobile edition (later phase, separate spec); per-station data upgrades; monetization
screens; theme toggle (light only); route fuel planning.
