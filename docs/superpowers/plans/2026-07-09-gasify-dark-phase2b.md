# Gasify Refined Dark — Phase 2b: country league table + country lens + detail polish

> Spec: `docs/superpowers/specs/2026-07-07-map-ui-redesign-design.md` §2 (dark). Execute inline (superpowers:executing-plans). Verify every task with the scratchpad headless check (`node check_map.js`) per memory `feedback_no_powershell_utf8_edits` — Edit tool only, never PS regex on source.

**Goal:** Make the 63-country story a feature: zoomed out, the left panel becomes a ranked country league table; zoomed into a country, a lens header shows the national picture and which fuels exist there; the detail card gets honesty + directions.

## Task 1: Backend `GET /api/stations/country-meta?fuel=diesel`
`backend/src/routes/stations.js` (before `/:id`). Returns `[{ country, stations, median, fuels }]`:
```sql
SELECT s.country,
  COUNT(DISTINCT s.id)::int AS stations,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY fp.price)
    FILTER (WHERE fp."fuelType" = ${fuel} AND fp.price >= 0.15 AND fp.price <= 3.5) AS median,
  ARRAY_AGG(DISTINCT fp."fuelType") AS fuels
FROM "Station" s JOIN "FuelPrice" fp ON fp."stationId" = s.id
GROUP BY s.country
```
In-memory cache `Map fuel -> { data, expiresAt }` 10 min. Fuel param whitelisted against `['diesel','diesel_premium','sp95','sp98','sp100','e10','lpg','cng']` else 400. Verify: `Invoke-RestMethod 'http://localhost:3002/api/stations/country-meta?fuel=diesel'` returns ~60 rows, MD median 1.236. Add `getCountryMeta(fuel)` to `frontend/lib/api.js` (mirror existing fetchers). Commit.

## Task 2: League table (zoomed out)
`MapView.js`: state `countryMeta` (fetch on mount + when `fuel` changes); when `showCountryBadges` (zoom < 5.5) render league INSTEAD of station list in `.sidebar`: header "Cheapest countries — <fuel label>", rows = meta filtered `median != null` sorted asc: rank, flag (FLAGS), name (COUNTRY_NAMES — import the landing map or duplicate small map… reuse: move COUNTRY_NAMES from `app/page.js` into `frontend/lib/countries.js` exporting FLAGS+COUNTRY_NAMES+CENTROIDS, import from both — keeps one source of truth). Row click: `mapRef.current?.flyTo({ center: centroid, zoom: 6.6, duration: 1200 })`. Median in `.stationRowPrice` style with priceColor. CSS: reuse existing `.stationRow*` classes + a `.leagueName` if needed. Commit after headless verify (rows show countries at zoom 4.3).

## Task 3: Country lens (zoomed in)
When NOT showCountryBadges: determine `lensCountry` = most frequent `country` among `sidebarStations`; find its meta. Render above the station list: flag + name, `stations` count, national median (tabular), and offered-fuels chips. Fuel tabs: `disabled` + reduced opacity when `countryMeta` for lensCountry lacks that fuel (only when lensCountry known). CSS: `.lens { padding: 12px 14px; border-bottom: 1px solid var(--border); }`, `.lensFuels { display:flex; gap:4px; flex-wrap:wrap; }` chips styled like `.sidebarFuel`. Verify headless (fly a city — e.g. evaluate flyTo Ljubljana, expect SI lens). Commit.

## Task 4: Detail card polish
In detail panel: under the hero price add muted line `Updated <relative> ago` from `selected.updatedAt` (already selected in bbox query; fallback hide). Add Directions button next to ★: `<a href={'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng} target=_blank>` styled like `.closeBtn`. Commit.

## Task 5: Full headless verification + screenshots (zoom-out league, zoom-in lens, detail card open), fix anything seen, push. User review gate → phase 2c (component split + landing/nav restyle + saved tab).
