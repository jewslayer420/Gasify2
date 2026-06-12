# Data Sources & Licensing Inventory

**Purpose:** a single source of truth for every external data source the app uses,
its licence/legal basis, whether commercial use is permitted, and the attribution
that must be displayed. Use this for App Store review notes and as a hand-off to an
IP lawyer before monetising.

> ⚠️ **Not legal advice.** This is an engineering inventory of what the code calls and
> the publicly stated terms of each source. Licences and terms change — verify each
> "⚠️ verify" item directly with the provider before charging money. Last audited:
> **2026-06-12**.

## Risk legend

| Tier | Meaning |
|------|---------|
| 🟢 **OK** | Open/government licence that permits commercial use with attribution. |
| 🟡 **Comply** | Usable, but has concrete obligations (attribution, "no endorsement", registration, rate limits) that must be met. |
| 🔴 **Blocker** | Scrapes a private aggregator or uses a borrowed/demo key — high takedown/ToS risk; resolve before monetising. |

---

## 1. Shared infrastructure (applies app-wide)

| Component | Provider / Endpoint | Licence / Terms | Commercial? | Required attribution | Tier |
|-----------|--------------------|-----------------|-------------|----------------------|------|
| Basemap tiles & style | CARTO `basemaps.cartocdn.com` (Dark Matter GL) | CARTO ToS; built on OpenStreetMap data (**ODbL**) | Free CDN **not** licensed for unbounded commercial traffic — needs a CARTO plan or another vendor at scale | "© OpenStreetMap contributors" + "© CARTO" (now re-enabled in `MapView.js`) | 🟡 Comply |
| Geocoding (city search, reverse) | `nominatim.openstreetmap.org` (`geo.js`, `slovenia.js`, `denmark.js`) | **OSM Nominatim Usage Policy** — ≤1 req/s, **no bulk/heavy/commercial use** on the public server | ❌ on public instance | "© OpenStreetMap contributors" | 🔴 Blocker (bulk/commercial) |
| Station POIs (location pins) | Overpass API (`overpass-api.de`, `overpass.kumi.systems`, `overpass.openstreetmap.ru`) — Brazil, Canada, Malaysia, NZ, S.Africa, S.Korea, Thailand, USA | Data is OSM **ODbL** (share-alike + attribution); public Overpass servers are **not for heavy/commercial load** | ❌ on public instances | "© OpenStreetMap contributors" | 🔴 Blocker (bulk/commercial) |
| Routing / directions | _none currently wired in `MapView.js`_ | — | — | If you add OSRM demo / Mapbox / etc., re-check terms (OSRM demo server is non-production) | — |
| Fonts | Geist / Geist Mono (`frontend/app/fonts`) | Geist is **OFL/Vercel licence** — verify it permits app bundling | ✅ (typically) | per font licence | 🟡 Comply |

**Why the OSM public servers are a blocker:** Nominatim and the public Overpass mirrors
explicitly forbid bulk and commercial use. A paid app hammering them will be IP-banned and
is out of policy. Move to a self-hosted or paid geocoder/Overpass (e.g. self-host Nominatim,
or use a commercial provider) before scaling. The **ODbL data itself is fine commercially**
with attribution + share-alike — the issue is the *free shared servers*.

---

## 2. Country data sources

### 🟢 Government / open-licence sources (commercial OK, attribution required)

| Country | Source | Licence / basis | Notes |
|---------|--------|-----------------|-------|
| France | `data.economie.gouv.fr` — prix-des-carburants flux instantané | **Licence Ouverte / Etalab 2.0** | Commercial OK; attribute "Ministère de l'Économie" + no-endorsement. |
| Italy | MIMIT open data (station registry + daily prices) | Italian open-data (**IODL/CC-BY**, ⚠️ verify) | Attribution to MIMIT. |
| Spain | Ministerio gov API (~11,400 stations) | Spanish gov open data | Attribution. |
| Portugal | DGEG official API `precoscombustiveis.dgeg.gov.pt` | Portuguese gov open data ⚠️ verify | Attribution to DGEG. |
| Argentina | `datos.energia.gob.ar` — Secretaría de Energía | Argentine open data ⚠️ verify | Attribution. |
| United States | EIA Open Data API v2 (`api.eia.gov`, **free key**) | **US Government public domain** | Citation requested; key registration permits commercial use. |
| Canada | Ontario Open Government CSV + StatsCan | **Open Government Licence – Canada** | Attribution; national avg applied to OSM stations. |
| Brazil | ANP "Série Histórica" XLSX (`gov.br`) | Brazilian gov open data ⚠️ verify | Attribution to ANP. |
| Malaysia | `data.gov.my` fuel-price catalogue | **CC BY 4.0** (data.gov.my default) ⚠️ verify | Attribution. |
| New Zealand | MBIE weekly fuel CSV | NZ gov (**CC BY 4.0** default) ⚠️ verify | Attribution to MBIE. |
| Mexico | CRE XML feeds (`publicacionexterna.azurewebsites.net`) | Mexican gov open data ⚠️ verify | Attribution to CRE. |
| Taiwan | CPC Corporation Open Data API | Taiwan gov open data ⚠️ verify | Attribution to CPC. |
| South Africa | DMRE regulated national price (manually maintained) + OSM stations | Price is a **published fact** (not copyrightable); stations ODbL | Update monthly; cite DMRE. |
| UK | `fuelcosts.co.uk` re-publishing UK Fuel Finder scheme | Underlying scheme is **OGL v3** (commercial OK + attribution) | ⚠️ You consume the **re-publisher**, not the source — check fuelcosts.co.uk's own ToS, or pull the scheme data directly. |

### 🟡 Vendor / official APIs with registration or specific terms (verify commercial use)

| Country | Source | Terms | Action |
|---------|--------|-------|--------|
| Germany | **Tankerkönig** `creativecommons.tankerkoenig.de` (MTS-K) | Data **CC BY 4.0** (attribution mandatory); **API terms lean non-commercial** | Confirm commercial permission with Tankerkönig; display "Tankerkönig (MTS-K), CC BY 4.0". Prefer this over the fuelo.net German source. |
| Chile | CNE "Bencina en Línea" API (`api.cne.cl`, account login) | Free registration; ⚠️ verify commercial redistribution allowed | Confirm ToS for a paid app. |
| Australia (NSW + TAS) | FuelCheck `api.onegov.nsw.gov.au` (+ registered key for TAS) | NSW API terms; commercial use may need agreement | Verify key terms cover paid distribution. |
| Australia (VIC) | Service Victoria "Servo Saver" Public API | API terms; consumer-id auth | Verify commercial terms. |
| Australia (QLD) | **FuelPricesQLD / Informed Sources** (subscriber token) | **Commercial aggregator** — redistribution likely restricted | ⚠️ Treat as near-blocker; confirm licence permits resale. |
| Finland | `polttoaine.net/api` XML feed | Third-party site; ⚠️ verify ToS for redistribution | Check terms / seek permission. |
| Iceland | **Gasvaktin** (open-source, GitHub JSON) | Check repo licence (likely permissive) ⚠️ verify | Attribute Gasvaktin per repo licence. |
| Slovenia | `goriva.si` API | Third-party site republishing regulated prices; ⚠️ verify ToS | Check terms / seek permission. |
| Denmark | Shell geoapp + Q8/F24 + Circle K endpoints | Unofficial vendor endpoints; ⚠️ verify | High-ish risk; confirm or replace. |

### 🔴 Blockers — private aggregator scraping & borrowed keys (resolve before monetising)

| Country / scope | Source | Problem |
|-----------------|--------|---------|
| **Albania, Belgium, Bosnia, Bulgaria, Croatia, Czechia, Germany(dup), Greece, Hungary, Ireland, Latvia, Lithuania, Montenegro, Netherlands, North Macedonia (+Kosovo), Poland, Romania, Serbia, Slovakia, Switzerland, Turkey** (~21) | **`*.fuelo.net`** | Scraping a **private commercial aggregator's compiled database**. Exposes EU **database/sui-generis rights** + ToS breach + realistic takedown. ~Half of country coverage. |
| Luxembourg | `carbu.com` (HTML scrape) | Private commercial site; scraping + redistribution likely violates ToS. |
| South Korea | Opinet — **uses a publicly-indexed demo API key** (`F231013281`) | Using someone else's demo key in a paid product = ToS violation, can be revoked. Register your own. |
| Peru | Osinergmin Facilito | reCAPTCHA-gated; parked. (See memory `reference-peru-facilito`.) |

### ⚪ No source yet (returns empty — no legal issue)

| Country | Reason |
|---------|--------|
| Norway | Konkurransetilsynet 2020 order forbids the major chains from publishing prices online. |
| Sweden | No public Swedish price API/aggregator found. |

---

## 3. Attribution to display in-app

Apple and the underlying licences both expect visible credit. Add a **"Data sources & credits"**
screen (Settings/About) listing at minimum:

- **Map:** "© OpenStreetMap contributors" • "© CARTO"
- **Per active country:** the source name from §2 (e.g. "France: Ministère de l'Économie — Licence Ouverte (Etalab)"; "Germany: Tankerkönig (MTS-K), CC BY 4.0").
- Government "no official endorsement" disclaimers where required (France Etalab, EIA, etc.).

The map's on-map attribution control was re-enabled in `frontend/app/map/MapView.js` (OSM + CARTO).
A per-source credits screen is still **TODO** — recommended next step, and it can be data-driven
from this file.

---

## 4. Pre-monetisation checklist

1. **Resolve the fuelo.net dependency (~21 countries)** — replace with genuine open-gov sources, license the data, or ship without those countries at launch.
2. **Replace borrowed/demo keys** (South Korea Opinet; audit all hardcoded keys) with your own commercially-permitted keys.
3. **Move geocoding + Overpass off the free OSM public servers** (self-host or paid) before scaling.
4. **Confirm 🟡 vendor terms** allow commercial redistribution (Tankerkönig, Chile CNE, AU NSW/VIC/QLD, Finland, Slovenia, Denmark, UK re-publisher).
5. **Add the in-app credits screen** (this file → data-driven) and government no-endorsement notices.
6. **App Store**: privacy policy URL, App Privacy labels (precise location + account data), in-app account deletion, IAP-vs-external payment decision, Sign in with Apple if adding third-party login.
