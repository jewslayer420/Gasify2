# Map loading diet — design

> **Status: REVERTED 2026-07-18 (owner decision).** The grid-fed heatmap
> looked chopped/unnatural at mid zoom even after A/B tuning — a 0.3° density
> grid cannot reproduce per-station texture. MapView is back on the full
> `/geojson` download; the backend pieces (overview endpoint, sorted bbox,
> `country=` param, Station indexes) were kept. The right long-term fix is
> **vector tiles** (real per-station geometry, tiled): see Alternatives.

2026-07-18. Replace the whole-world GeoJSON download (~11 MB gz, ~60 MB
parsed, 427k features in client memory) with a tiny density overview plus
viewport-scoped detail fetches. Target: ~0.5 MB on first paint (>20× less),
no world array in the browser, less Render memory pressure.

## Architecture

Two MapLibre sources replace the single `stations` source:

1. **`overview`** (heatmap, zoom 0–13): new `GET /api/stations/overview?fuel=`
   — world density grid-aggregated in SQL: one point per 0.3° cell with
   `w` = station count (fuel-filtered, sanity-bounded). ~tens of KB–0.5 MB
   gz. Server-cached 10 min per fuel (country-meta pattern).
   `heatmap-weight` reads `w` (capped) so density matches the old
   every-station rendering.
2. **`stations`** (points, zoom ≥ 10): populated from bbox fetches.

## Detail fetching

On `moveEnd` (and fuel change): fetch `/api/stations?bbox=<viewport × 1.5
buffer>&zoom&fuel`, render rows as the `stations` source and keep them in
memory as the current detail set. Skip the fetch when the new viewport is
contained in the last-fetched buffered bbox for the same fuel
(pan-within-area is free). The server bbox path becomes one raw SQL query
`ORDER BY price ASC` with take tiers z≤8: 800, z≤10: 1500, else 2500 —
sorted results make the sidebar's "cheapest in view" correct at every zoom
(the old `findMany take` returned arbitrary rows).

## Sidebar / features off the world array

- **Sidebar**: price-sorted top 100 of the current detail set,
  viewport-filtered client-side between fetches.
- **Near me / Cheapest near me**: server `near=1` query (50 nearest with
  prices); "cheapest" = min price among those client-side.
- **Country focus**: new `country=CC` param — cheapest 100 nationwide
  (server), so focus lists no longer depend on having the world in memory.
- **City search**: unchanged (geocode → flyTo → moveEnd triggers the fetch).
- **Popup**: unchanged — full detail via `getStation(id)`.

## Indexes (schema)

`Station` gets `@@index([lat, lng])` and `@@index([country])` — every bbox /
country query is currently a 427k-row seq scan.

## Kept

`/api/stations/geojson` endpoint stays (external consumers, fallback), but
the frontend no longer calls it — Render stops paying the 150 MB build for
map loads.

## Alternatives rejected

- Vector tiles (tippecanoe/PMTiles): best at much larger scale; new build
  infra — revisit post-launch.
- Client clustering (supercluster): still requires the full download.

## Verification

Headless: map loads with heatmap at world zoom (screenshot), zoom into a
city → points + sidebar populate from a bbox response; network log shows no
`/geojson` call and payloads in the stated budget; fuel switch refetches
both sources; near-me and country focus return sensible lists.
