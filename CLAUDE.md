# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Two apps, run locally under PM2 (not hot-reload dev servers):

- **`backend/`** — Express API + Prisma on Neon Postgres (eu-central-1). PM2 app `gasify-backend`, local port **3002** (Render prod: `gasify-api.onrender.com`). Entry: `src/server.js`.
- **`frontend/`** — Next.js (app router) with `react-map-gl/maplibre` on a MapTiler basemap. PM2 app `gasify-frontend`, port **3000**, serving a **production build** — code changes need `npm run build` then `pm2 restart gasify-frontend`; there is no hot reload.

Key backend paths: `src/services/scrapers/` (per-country price scrapers), `src/services/sync.js` (bulkUpsertStations + scheduling), `src/routes/stations.js` (API incl. gzipped `/geojson` the frontend actually uses), `src/scripts/sync_all_now.js` (fast|slow|all runner), `src/scripts/check_freshness.js` (monitor, `--dry-run`).

## Commands

```bash
# backend tests (node:test — run explicit files, `node --test src` misbehaves on Windows)
cd backend && node --test src/services/scrapers/_overpass.test.js src/services/scrapers/thailand.test.js src/services/freshness_monitor.test.js src/services/telegram.test.js src/services/price_alerts.test.js

cd frontend && npm run build   # then: npx pm2 restart gasify-frontend
npx pm2 status|logs|restart gasify-backend|gasify-frontend
```

## Data sync (GitHub Actions, not Render cron)

`.github/workflows/`: `sync-fast.yml` (per-station gov APIs, every 6h), `sync-slow.yml` (national-average countries, daily; **DB-first** — reuses station geometry from the DB, no routine Overpass; dispatch with `discovery=true` for a real Overpass geometry refresh), `sync-monitor.yml` (freshness alerting; Telegram secrets not yet configured).

Rules learned the hard way:
- **Always batch DB writes** — runners are US, Neon is EU; per-row writes are pathologically slow. Raw-SQL updates must set `"updatedAt" = NOW()` explicitly.
- Never add live Overpass calls to routine sync paths (`stationsFromDb` in `scrapers/_overpass.js` is the pattern). Mirror order: overpass-api.de first, kumi fallback, never openstreetmap.ru (dead).
- `FuelPrice.updatedAt` only moves on price *change*; `CountrySyncStatus` records sync completion for the monitor.

## Env & keys

`backend/.env`: `DATABASE_URL` (Neon), `MAPTILER_KEY`, `EIA_API_KEY`, Chile CNE creds. `frontend/.env.local`: `NEXT_PUBLIC_MAPTILER_KEY` (inlined at build time). All gitignored — as is `.claude/settings.json`.

MapTiler is on the **free (non-commercial) tier** — before launch: upgrade to Flex, set `MAPTILER_KEY` on Render. Geocoding falls back to Nominatim when the key is absent.

## Docs

`docs/INFRA_MIGRATION_PLAN.md` (licensing migration; Pillars 1–2 done, Geofabrik deferred), `docs/DATA_SOURCES.md` (per-country source & licence inventory — keep updated when touching scrapers), `regulated_manual.js` prices are hand-maintained: update constants + `asOf` monthly.

## Git workflow

After finishing any task: `git add -A && git commit -m "..." && git push origin main` (a Stop hook also auto-commits). Remote: `https://github.com/jewslayer420/Gasify2`, branch `main`.
