# Infrastructure Migration Plan — off the free OSM/CARTO servers for commercial use

> ✅ **STATUS 2026-07-05:** Pillars 1 (basemap) & 2 (geocoding) implemented on **MapTiler**
> (free tier for dev — `NEXT_PUBLIC_MAPTILER_KEY` in `frontend/.env.local`, `MAPTILER_KEY` in
> `backend/.env`; both fall back to CARTO/Nominatim when unset). **Upgrade to the Flex plan
> before commercial launch** (free tier is non-commercial) and set `MAPTILER_KEY` on Render.
> Pillar 3 (Overpass→Geofabrik) deferred — routine syncs are DB-first since 2026-07-03 and
> barely touch Overpass. The §1 geo.js countrycodes bug is fixed.

**Goal:** make the app legally monetisable by moving the three external dependencies that
forbid bulk/commercial use on their free public servers onto commercial-licensed or
self-hosted infrastructure. This is the **#1 remaining monetisation blocker** (see
`DATA_SOURCES.md §1` and `§4`).

> ⚠️ **Not legal/financial advice.** Engineering inventory + ballpark costs. **Verify each
> provider's *current* pricing and commercial terms** before committing — prices below are
> approximate and change. Written 2026-06-16.

---

## 1. What actually depends on the free servers (grounded in the code)

| Dependency | Where | Hit when | Per-user? | Urgency |
|-----------|-------|----------|-----------|---------|
| **CARTO basemap** (`basemaps.cartocdn.com` dark-matter style) | `frontend/app/map/MapView.js` (`MAP_STYLE`) | every map view + pan/zoom (vector tiles) | **Yes — heavy** | 🔴 Highest |
| **Nominatim geocoding** (`nominatim.openstreetmap.org`) | `backend/src/utils/geo.js` → `/api/stations/geocode` | city search only | Yes — light | 🟠 Medium |
| **Overpass** (`overpass-api.de` + mirrors) | the ~18 scrapers (`eu_oil_bulletin.js`, `turkey_epdk.js`, `_balkan_common.js`, `canada.js`, `usa.js`, …) | **sync jobs only** (cron/boot) | **No** — bounded batch | 🟡 Lowest |

**Key insight:** station POIs are served to users from **your own Neon DB** (`/geojson`,
browser-cached), *not* from Overpass. Overpass is only touched by periodic sync jobs, so it
scales with sync frequency, not users. That makes it the cheapest of the three to fix.

**Scale today:** 371,973 stations · 1.24M prices · 44 countries.

**Two side-findings to fix during this work:**
- `geo.js` hardcodes `countrycodes=si,at,hr,hu,fr` → **city search is silently broken for 40+
  of the 44 countries.** A commercial geocoder swap fixes this for free.
- `backend/src/routes/stations.js` has a legacy `/?bbox=` endpoint doing **live Tankerkönig
  fill-in** (`fetchTankerkoenigArea`). The current Next.js frontend doesn't use it (it loads
  `/geojson` + filters in-memory). **Decommission it** — it's a live per-request external call
  on the (currently dead) Tankerkönig key.

---

## 2. Pillar 1 — Basemap tiles (🔴 do first, biggest exposure)

The map uses **MapLibre GL** already, so swapping tile providers is mostly a **style-URL + API-key
change** — no rewrite. Options:

| Option | What | Approx cost | Effort | Notes |
|--------|------|-------------|--------|-------|
| **MapTiler** ⭐ | Hosted MapLibre styles (incl. a dark style) | Free ~100k tile loads/mo (non-commercial); paid from ~€25–€295/mo | **~1–2 h** (swap `MAP_STYLE` + key) | Fastest path. Confirm a **paid/commercial** plan for a paid app. |
| **Protomaps + PMTiles (self-host)** ⭐⭐ | One `.pmtiles` file on object storage; MapLibre reads it directly | **Near-zero ongoing** (storage + CDN). On **Cloudflare R2 = no egress fees** | ~0.5–1 day | Most cost-effective at scale. Planet ≈120 GB, or regional extract. |
| Stadia Maps | Hosted MapLibre tiles/styles | Free non-commercial; paid from ~$20+/mo | ~1–2 h | Free tier is non-commercial — needs paid plan. |
| Mapbox | Mapbox GL tiles | Pay per map load; can get pricey | ~2–4 h | GL JS licensing differs from MapLibre; re-check. |

**Recommendation:** ship on **MapTiler** now (one-line swap, fast), and evaluate **Protomaps on
Cloudflare R2** once traffic grows (flat cost, no per-load fee — ideal for a tile-heavy app).

---

## 3. Pillar 2 — Geocoding (🟠 medium; also fixes the 5-country bug)

Volume is low (city search only), so cheap/free commercial tiers likely suffice.

| Option | Approx cost | Effort | Notes |
|--------|-------------|--------|-------|
| **MapTiler Geocoding** ⭐ | bundled with the basemap plan (one vendor/key) | ~2–3 h | Simplest if MapTiler is already the tile vendor. |
| **LocationIQ** ⭐ | Free ~5k/day; paid cheap; commercial OK | ~2–3 h | Generous, cheap, commercial-friendly. |
| Geoapify | Free ~3k/day; commercial | ~2–3 h | Comparable. |
| Photon (self-host) | server cost only | ~1 day | Open-source OSM geocoder; no per-query fee. |
| Self-host Nominatim | big server (~1 TB, planet import) | days | Heavy; only if volume explodes. |

**Recommendation:** **MapTiler** (one vendor) or **LocationIQ** (cheapest). Rewrite `geo.js` to the
vendor API and **remove the `countrycodes` restriction** so search works in all 44 countries.

---

## 4. Pillar 3 — Station POIs / Overpass (🟡 lowest; sync-time only)

Not per-user, so least urgent. To be fully ODbL-compliant and off the public servers:

| Option | Approx cost | Effort | Notes |
|--------|-------------|--------|-------|
| **Geofabrik extracts + `osmium`** ⭐ | free (download per-country `.osm.pbf`) | ~1–2 days | Extract `amenity=fuel` locally during sync. No live dependency, fully compliant. Rework the shared station-fetch used by EU/TR/Balkan scrapers + ~15 others. |
| Self-host Overpass | server + ~200 GB disk | ~1–2 days | You control it; heavier to run. |
| Keep public Overpass (bounded) | free | 0 | Periodic + mirrored + delayed → low practical risk, but technically still "bulk use." Document as interim. |

**Recommendation:** medium-term, move scrapers to **Geofabrik + osmium** (one shared helper change
covers most scrapers). Short-term it's acceptable as-is given it's bounded batch usage — but it
*is* on the compliance list, so don't ship a paid app on it long-term.

---

## 5. Attribution (still required after migration)

Your station geometry is OSM-derived (ODbL), so **"© OpenStreetMap contributors" stays** regardless
of tile vendor. Add the new tile/geocoder vendor's required attribution to the existing
`AttributionControl` in `MapView.js`. (The planned in-app "Data sources & credits" screen should
list these too.)

---

## 6. Ballpark monthly cost by stage

| Stage | Basemap | Geocoding | Overpass | ~Total/mo |
|-------|---------|-----------|----------|-----------|
| Early / soft-launch | MapTiler free* or Protomaps/R2 | LocationIQ free | Geofabrik extracts | **~€0–30** |
| Growth (10–50k MAU) | MapTiler paid or Protomaps/R2 | cheap tier | extracts | **~€50–150** |
| Scale | Protomaps on R2 (flat) | commercial geocoder | self-host/extracts | scales sub-linearly |

\* free tiers are typically **non-commercial** — budget for the paid tier at launch.

---

## 7. Recommended sequence & effort

1. **Basemap → MapTiler** (style URL + key + env). ~1–2 h. *Biggest exposure, smallest change.*
2. **Geocoding → MapTiler/LocationIQ**, remove the `countrycodes` limit. ~2–4 h. *Fixes the 40-country search bug too.*
3. **Decommission** the legacy `/?bbox=` live-Tankerkönig endpoint. ~30 min.
4. **Overpass → Geofabrik + osmium** in the shared scraper helper. ~1–2 days. *Lowest urgency.*
5. Update attribution + the credits screen.

**Decisions needed from you (budget call):**
- (a) Tile vendor: **MapTiler** (fast) vs **Protomaps/R2** (cheapest at scale)?
- (b) Geocoder: bundle with MapTiler, or **LocationIQ**?
- (c) Overpass: do the Geofabrik migration now, or accept bounded public use for the soft launch?
