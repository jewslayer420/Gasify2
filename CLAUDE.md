# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**Both processes must run concurrently during development:**

```bash
node server.js   # Express API on port 3001
npm run dev      # Vite dev server on port 5173
```

Other commands:
```bash
npm run build    # Production build → dist/
npm run lint     # ESLint check
npm run preview  # Preview production build
```

There is no test suite — testing is manual.

## Git workflow

After finishing any task, automatically commit all changes and push to GitHub:

```bash
git add -A
git commit -m "descriptive message"
git push origin main
```

Remote: `https://github.com/jewslayer420/Gasify2` (branch: `main`)

## Architecture

Two-process app: an Express API (`server.js`) that proxies/normalizes European fuel price data, and a React frontend (`src/App.jsx`) that renders an interactive map with a price list panel.

### Backend (`server.js`, port 3001)

Single endpoint: `GET /api/stations?fuel=gazole&lat=46&lng=14&bbox=45,13,47,16&citySearch=1`

- Calls France (`data.economie.gouv.fr`) and Slovenia (`goriva.si`) APIs in parallel
- Applies bbox overlap check per country to skip irrelevant upstream calls
- Normalizes all stations to a common schema: `{ id, name, brand, price, fuel, lat, lng, city, country, distance, sp95, sp98, gazole, gplc, e10 }`
- Three response modes driven by query params:
  - **bbox mode**: filters to viewport bounds
  - **near-me mode**: returns 50 closest stations (distance calc required)
  - **default**: returns 100 cheapest

### Frontend (`src/App.jsx`, port 5173)

Single monolithic component (~730 lines) — all state lives in `App`, no state management library.

- Full-screen Leaflet map (`react-leaflet`) with floating panel
- **Desktop (≥768px):** panel is a sidebar (`--panel-w: 380px`)
- **Mobile (≤768px):** panel is a bottom sheet with drag handle (peek height `--peek-h: 120px`, expands to full-height)
- Location: real-time tracking, refreshes every 120 seconds
- City search: Nominatim geocoding
- Routing: Leaflet Routing Machine for turn-by-turn directions with navigation overlay

**Data flow:** user location/city search → `/api/stations` → normalized results → Leaflet markers + scrollable list

### API URL switching

The frontend auto-selects the backend based on environment:
- **Dev:** `http://localhost:3001`
- **Prod:** `VITE_API_URL` from `.env` (currently `https://gasify-api.onrender.com`)

### Price color thresholds

- Green: ≤ €1.60/L
- Orange: ≤ €1.90/L
- Red: > €1.90/L

### CSS design tokens (in `src/App.css`)

`--bg`, `--bg-secondary`, `--green`, `--orange`, `--red`, `--panel-w`, `--peek-h`, `--r` (border-radius: 12px)
