# Data Sources & Licensing Inventory

**Purpose:** a single source of truth for every external data source the app uses,
its licence/legal basis, whether commercial use is permitted, and the attribution
that must be displayed. Use this for App Store review notes and as a hand-off to an
IP lawyer before monetising.

> ⚠️ **Not legal advice.** This is an engineering inventory of what the code calls and
> the publicly stated terms of each source. Licences and terms change — verify each
> "⚠️ verify" item directly with the provider before charging money. Last audited:
> **2026-07-01** (re-audited against runtime code; prior full audit 2026-06-14).

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
| **UAE** 🆕 | Fuel Price Committee monthly prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. AED→EUR. Update `asOf` monthly. Added 2026-06-16. |
| **Saudi Arabia** 🆕 | Aramco official fixed prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. SAR→EUR. Changes rarely. Added 2026-06-16. |
| **Kenya** 🆕 | EPRA monthly max prices, Nairobi ref (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. KES→EUR. Update monthly (EPRA revises ~14th). Added 2026-06-16. |
| **Dominican Republic** 🆕 | MICM weekly official prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. Published per **gallon** → ÷3.78541 → DOP→EUR. Update weekly-ish. Added 2026-06-16. |
| **Uruguay** 🆕 | ANCAP (state oil co.) national prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. UYU→EUR. Official open-data API exists (`catalogodatos.gub.uy`) but lags ~7 months + TLS-CA quirk → automate later. Added 2026-06-16. |
| **Qatar** 🆕 | QatarEnergy monthly prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. QAR→EUR. Update monthly. Added 2026-06-17. |
| **Kuwait** 🆕 | KPC/MEW fixed prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. KWD→EUR (subsidised, ~€0.29). Changes rarely. Added 2026-06-17. |
| **Oman** 🆕 | Monthly fuel price cap (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. OMR→EUR. Update monthly. Added 2026-06-17. |
| **Bahrain** 🆕 | NOGA official prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. BHD→EUR. Added 2026-06-17. |
| **Brunei** 🆕 | Subsidised price scheme, fixed >20yrs (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. BND→EUR (Super 92, Premium 97, diesel). Essentially static. Added 2026-06-17. |
| **Ecuador** 🆕 | Price-band scheme (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. USD, published per **gallon** → ÷3.78541. Bands adjust monthly (Extra/Ecopaís + diésel); Súper deregulated (varies). Update monthly. Added 2026-06-17. |
| **Serbia** | Ministry weekly max prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. RSD→EUR. Ex-fuelo (migrated 2026-06-18). Update weekly. |
| **Montenegro** | Ministry weekly decree max prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. EUR (no FX). Ex-fuelo (2026-06-18). Update weekly. |
| **Albania** | Bordi i Transparencës max prices (**manual constant**) + OSM | Regulated published fact; stations ODbL | `regulated_manual.js`. ALL→EUR. Ex-fuelo (2026-06-18). |
| **Switzerland** | National **market average** (**manual constant**) + OSM | Single published price *fact* (NOT regulated, NOT a DB scrape); stations ODbL | `regulated_manual.js`. CHF→EUR. Ex-fuelo (2026-06-18). ⚠️ Weakest legal basis of the set — a market avg, not an official price. Update monthly. |
| **Bosnia & Herzegovina** | National **market average** (**manual constant**) + OSM | Single published price *fact* (no unified regulated price); stations ODbL | `regulated_manual.js`. BAM→EUR. Ex-fuelo (2026-06-18). Update monthly. |

> **Still-deferred candidates (blocked from our environment):** **Costa Rica** — RECOPE official table
> (`recope.go.cr`) is **unreachable from our environment** (fetch fails even with TLS off) and the news
> prices were inconsistent; verify before adding. **Israel** — gov.il official monthly XLS (regulated 95
> octane) but **gov.il hard-blocks programmatic access (HTTP 403)**; needs a different fetch path.
| UK | `fuelcosts.co.uk` re-publishing UK Fuel Finder scheme | Underlying scheme is **OGL v3** (commercial OK + attribution) | ⚠️ You consume the **re-publisher**, not the source — check fuelcosts.co.uk's own ToS, or pull the scheme data directly. |
| **EU 14** — BE, BG, CZ, EE, GR, HR, HU, IE, LT, LV, NL, PL, RO, SK | **EU Weekly Oil Bulletin** (European Commission, DG Energy) + OSM stations | **CC BY 4.0** | National weekly pump price over OSM `amenity=fuel` stations (the "Canada model"). Attribute "European Commission, Weekly Oil Bulletin". `backend/src/services/scrapers/eu_oil_bulletin.js`. Replaced fuelo.net 2026-06-14. |
| **Cyprus** 🆕 | **EU Weekly Oil Bulletin** (same scraper, `cc: 'CY'`) + OSM stations | **CC BY 4.0** | **New country added 2026-06-16** (45th). National RoC price over OSM. **Per-station upgrade available:** the MCIT "Retail Fuel Price Observatory" eForm (`eforms.eservices.cyprus.gov.cy/MCIT/MCIT/PetroleumPrices`) returns per-station prices via an ASP.NET MVC postback (`__RequestVerificationToken` + session; fuel codes 1=U95/2=U98/3=diesel) — fragile, deferred. |
| **Malta** 🆕 | **EU Weekly Oil Bulletin** (same scraper, `cc: 'MT'`) + OSM stations | **CC BY 4.0** | **Added 2026-06-17 — completes EU-27.** National price over OSM (81 stations). |
| **Turkey** | **EPDK** (Enerji Piyasası Düzenleme Kurumu — official energy regulator) `apigateway.epdk.gov.tr` + OSM stations | Turkish public-sector regulator data ⚠️ verify reuse terms | National dealer-price bulletin (Benzin 95 / Motorin / Otogaz LPG), TRY→EUR via ECB rate, applied over OSM stations. `turkey_epdk.js`. Per-province upgrade possible via EPDK SOAP (`bildirimPetrolAkaryakitFiyatlari`, sorguNo=71). Replaced tr.fuelo.net 2026-06-14. |
| **North Macedonia** | **ERC** (Energy Regulatory Commission, `erc.org.mk`) regulated max prices + OSM stations | Regulated price = published fact ⚠️ verify reuse terms | Homepage "CeniLista" table (EUROSUPER 95/98, EURODIZEL), MKD→EUR via open.er-api.com (denar pegged ~61.5). `northmacedonia_erc.js` + `_balkan_common.js`. Replaced mk.fuelo.net 2026-06-15. |
| **Luxembourg** | **STATEC** official max prices via LUSTAT (`lustat.statec.lu`), mirrored on `data.public.lu` | **CC0** | Official "Prix maxima" (Super 95 E10 / 98 / diesel), already EUR/L — no FX. SDMX-CSV API (needs `Accept-Language` header; version 1.0). `luxembourg_statec.js`. Replaced carbu.com 2026-06-16. |

### 🟡 Vendor / official APIs with registration or specific terms (verify commercial use)

| Country | Source | Terms | Action |
|---------|--------|-------|--------|
| Germany | **Tankerkönig** `creativecommons.tankerkoenig.de` (MTS-K) — **manual-only** (`SCRAPERS['germany']`, `DE-<id>` rows); the **scheduled** German feed is the EU Oil Bulletin (`EUB-DE-`, CC BY 4.0) | Data **CC BY 4.0** (attribution mandatory); **API terms lean non-commercial** | ⚠️ Shipped pending; killable via `germany` slug. Confirm commercial permission with Tankerkönig if you re-activate the per-station scrape; display "Tankerkönig (MTS-K), CC BY 4.0". Needs a real `TANKERKOENIG_API_KEY` (the hardcoded demo-key fallback is a borrowed key + only covers a tiny test area). |
| Chile | CNE "Bencina en Línea" API (`api.cne.cl`, account login) | Free registration; ⚠️ verify commercial redistribution allowed | Confirm ToS for a paid app. |
| Australia (NSW + TAS) | FuelCheck `api.onegov.nsw.gov.au` (+ registered key for TAS) | NSW API terms; commercial use may need agreement | Verify key terms cover paid distribution. |
| Australia (VIC) | Service Victoria "Servo Saver" Public API | API terms; consumer-id auth | Verify commercial terms. |
| Australia (QLD) | **FuelPricesQLD / Informed Sources** (subscriber token) | **Commercial aggregator** — redistribution likely restricted | ⚠️ Treat as near-blocker; confirm licence permits resale. |
| Finland | `polttoaine.net/api` XML feed | Third-party site; ⚠️ verify ToS for redistribution | Check terms / seek permission. |
| Iceland | **Gasvaktin** (open-source, GitHub JSON) | Check repo licence (likely permissive) ⚠️ verify | Attribute Gasvaktin per repo licence. |
| Slovenia | `goriva.si` API | Third-party site republishing regulated prices; ⚠️ verify ToS | Check terms / seek permission. |
| ~~Denmark~~ | ~~Shell/Q8/F24/Circle K endpoints~~ → **EU Oil Bulletin** | ✅ **RESOLVED 2026-06-18:** replaced the unofficial vendor endpoints with the EU Weekly Oil Bulletin (cc `DK`, **CC BY 4.0**, national-avg over OSM). Old `DK-SHELL-/DK-Q8-/DK-CK-` rows purged. |

### 🔴 Blockers — private aggregator scraping & borrowed keys (resolve before monetising)

| Country / scope | Source | Problem |
|-----------------|--------|---------|
| ~~Albania, Bosnia, Montenegro, Serbia, Switzerland~~ (5) | ~~`*.fuelo.net`~~ → **manual constants** | ✅ **MIGRATED 2026-06-18 — fuelo.net is now fully eliminated (0 countries).** RS/ME/AL = regulated max prices (published facts); CH/BA = national market averages (single published facts, not DB scrapes). All in `regulated_manual.js` over OSM. Stale `<CC>-` rows purged. Kosovo lost its (mk.fuelo) coverage when NM migrated — separate ZRRE source needed if re-added. |
| ~~Turkey~~ | ~~`tr.fuelo.net`~~ → **EPDK** | ✅ **MIGRATED 2026-06-14** to EPDK official dealer-price bulletin (`apigateway.epdk.gov.tr/petrolBayiSatisFiyatBulten` + LPG) over OSM stations — see 🟢 table. Stale `TR-` rows purged via `purge_fuelo_eub.js --include-turkey`. |
| ~~North Macedonia~~ | ~~`mk.fuelo.net`~~ → **ERC** | ✅ **MIGRATED 2026-06-15** to the ERC regulator's official homepage price table (`erc.org.mk`, regulated max prices) over OSM stations — see 🟢 table. Stale `MK-` rows purged via `purge_fuelo_eub.js --include-macedonia`. |
| ~~Belgium, Bulgaria, Czechia, Estonia, Greece, Croatia, Hungary, Ireland, Latvia, Lithuania, Netherlands, Poland, Romania, Slovakia~~ (14) | ~~`*.fuelo.net`~~ → **EU Oil Bulletin** | ✅ **MIGRATED 2026-06-14** to EU Weekly Oil Bulletin (CC BY 4.0) over OSM stations — see 🟢 table. Stale fuelo rows purged via `backend/src/scripts/purge_fuelo_eub.js`. |
| ~~Germany~~ | ~~`de.fuelo.net`~~ → **EU Oil Bulletin** | ✅ **MIGRATED.** 2026-06-14 to Tankerkönig, but the API key is **dead/deactivated**, so on 2026-06-18 switched to the **EU Weekly Oil Bulletin** (cc `DE`, CC BY 4.0, national-avg over OSM) — clean + live without a key. Stale `DE-fuelo-` rows purged. Tankerkönig (`tankerkoenig.js`) kept for a per-station upgrade if a working key is obtained. |
| ~~Luxembourg~~ | ~~`carbu.com`~~ → **STATEC** | ✅ **MIGRATED 2026-06-16** to STATEC official max-price open data (`lustat.statec.lu`, **CC0**) over OSM stations — see 🟢 table. Stale `LU-CARBU-` rows purged via `purge_fuelo_eub.js --include-luxembourg`. |
| ~~South Korea~~ | Opinet (`opinet.co.kr`) — official KNOC source | ✅ **RESOLVED 2026-06-18: borrowed demo key removed.** Scraper is now **disabled** without a real `OPINET_API_KEY` (no borrowed-key call), and the 6,663 demo-key-sourced KR rows were purged. KR re-enables automatically once you register your own Opinet key and set `OPINET_API_KEY`. The app now uses **zero borrowed keys.** |
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

1. ✅ **DONE (2026-06-18) — fuelo.net fully eliminated.** All ~21 ex-fuelo countries migrated: 14 EU + Cyprus/Malta via Oil Bulletin; Turkey (EPDK); North Macedonia (ERC); Luxembourg (STATEC); Germany (Oil Bulletin, after the Tankerkönig key died); Serbia/Montenegro/Albania (regulated) + Switzerland/Bosnia (market averages) via `regulated_manual.js`. (Kosovo not separately sourced yet.)
2. ⚠️ **MOSTLY DONE — one dormant demo key remains.** South Korea's Opinet demo key was removed (scraper disabled + KR rows purged until you set `OPINET_API_KEY`); Luxembourg carbu.com resolved 2026-06-16 → STATEC CC0. **Caveat (found 2026-07-01):** `tankerkoenig.js` still carries a hardcoded Tankerkönig **demo-key fallback** (`00000000-…-002`). It is **not on any schedule** — the daily German feed is the EU Oil Bulletin (`EUB-DE-`, CC BY 4.0) — and only fires if `SCRAPERS['germany']` is manually triggered. Per owner decision (2026-07-01) it is **left shipped pending** under the `germany` kill-switch slug; remove the fallback (fail-clean like Korea) for a strict "zero borrowed keys" claim before charging money.
3. **Move geocoding + Overpass off the free OSM public servers** (self-host or paid) before scaling — the **#1 remaining monetisation blocker** (see `INFRA_MIGRATION_PLAN.md`).
4. **Confirm 🟡 vendor terms** allow commercial redistribution — **draft outreach emails ready in `COMMERCIAL_TERMS_OUTREACH.md`**: Chile CNE, AU NSW/VIC/QLD, Finland, Slovenia, UK re-publisher (email each). _(Denmark resolved 2026-06-18 → Oil Bulletin; Tankerkönig dropped — Germany now uses the Oil Bulletin.)_
5. **Add the in-app credits screen** (this file → data-driven) and government no-endorsement notices.
6. **App Store**: privacy policy URL, App Privacy labels (precise location + account data), in-app account deletion, IAP-vs-external payment decision, Sign in with Apple if adding third-party login.

---

## 5. fuelo.net replacement plan (researched 2026-06-12)

**Good news: every fuelo.net country has a legal official source — no scraping of a private
aggregator required anywhere.** They fall into three buckets:

- **(A) Per-station official source** — direct, like-for-like replacement (keeps per-station prices).
- **(B) National average over OSM stations** — the "Canada model" you already use; legally clean,
  but every station in a country shows the same (national) price.
- **(C) Regulated/capped price over OSM stations** — same as B, but the national price is *actually*
  the legally-binding price (these governments set/cap fuel prices), so accuracy loss is minimal.

The single biggest lever: the **EU Weekly Oil Bulletin** (European Commission, DG Energy) publishes
weekly national pump prices (Eurosuper 95, diesel, etc.) for **all EU members** under **CC BY 4.0** —
one source covers most of the EU list at once.
`https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en` · also on `data.europa.eu`.

| Country | Model | Recommended official source | Licence | Granularity | Notes / effort |
|---------|:-----:|-----------------------------|---------|-------------|----------------|
| **Germany** | A | **Tankerkönig** (already built — `tankerkoenig.js`) | CC BY 4.0 (confirm API commercial use) | per-station | Just **delete the de.fuelo.net source**; Tankerkönig already covers DE. |
| **Turkey** | A | **EPDK** XML web service — dealer sales prices by province (`bildirim.epdk.gov.tr`) | Public-sector info (verify) | per-province / per-dealer ceiling, daily | Official API exists since 2016; best replacement. Medium effort. |
| **Romania** | A→ | **Consiliul Concurenței** "Monitorul Prețurilor Carburanților" (web + iOS/Android app, updated ~2h) | Gov (verify) | per-station (major networks) | App implies an undocumented JSON API — **probe it** (like the Peru flow). EU Oil Bulletin is the B-fallback. |
| **Greece** | A→ | **Παρατηρητήριο Τιμών** / fuelprices.gr (Ministry of Development) | Public-sector info | per-station, but **PDF**-published | Data is official but in PDFs; OSS parser exists (`github.com/mavroprovato/fuelpricesgr`). Higher effort; EU Oil Bulletin is the B-fallback. |
| **Netherlands** | B | **CBS** daily pump prices (`data.overheid.nl` dataset 532/533) | CC BY 4.0 (CBS open data) | national daily avg | Clean. (ANWB has per-station but is commercial.) |
| **Belgium** | C | **FPS Economy** official max petroleum prices (daily) | Gov open | national (regulated max) | Belgium has program-contract max prices. |
| **Poland** | B | **GUS** retail averages + station locations on `dane.gov.pl`; or EU Oil Bulletin | Gov open / CC BY | national avg | EU Oil Bulletin simplest. |
| **Ireland** | B | **EU Oil Bulletin** (no national per-station scheme exists) | CC BY 4.0 | national avg | Ireland has no official per-station data. |
| **Hungary** | B | **EU Oil Bulletin** | CC BY 4.0 | national avg | No clean official per-station source. |
| **Czechia** | B | **EU Oil Bulletin** (or ČSÚ weekly) | CC BY 4.0 | national avg | |
| **Slovakia** | B | **EU Oil Bulletin** (or ŠÚSR) | CC BY 4.0 | national avg | |
| **Bulgaria** | B | **EU Oil Bulletin** | CC BY 4.0 | national avg | |
| **Latvia** | B | **EU Oil Bulletin** | CC BY 4.0 | national avg | |
| **Lithuania** | B | **EU Oil Bulletin** | CC BY 4.0 | national avg | |
| **Croatia** | C | **Vlada/MINGOR** regulated max prices (Decree every 14 days, `mzoe-gor.hr`); EU Oil Bulletin fallback | Gov open / CC BY | national (regulated max) | Prices are capped → national value is accurate. |
| **Switzerland** | B | **opendata.swiss** energiedashboard.ch energy prices | Gov open (CC BY) | national avg | Non-EU, so not in Oil Bulletin; opendata.swiss covers it. |
| **Serbia** | C | **Ministry of Internal & Foreign Trade** weekly max prices (Fridays) | Gov | national (regulated max) | Published as official announcements; aggregate to national price. |
| **Montenegro** | C | **Ministry of Economy** biweekly set prices | Gov | national (regulated) | Regulated. |
| **North Macedonia** | C | **ERC** (`erc.org.mk`) regulated max retail prices | Gov | national (regulated max) | OSS reference crawler: `github.com/hilioski/macedonian-fuel-price-crawler`. |
| **Albania** | C | **Transparency Board** price caps | Gov | national (regulated cap) | Published via official decisions. |
| **Bosnia & Herzegovina** | C/B | Federal Ministry of Trade (FBiH) avg prices / `komorabih.ba` | Gov | entity/national avg | Less unified; entity-level averages. |
| **Kosovo** (rides in mk dataset) | C | **ZRRE** / Ministry regulated prices | Gov | national (regulated) | Separate out from the mk.fuelo dataset. |

### Suggested execution order (highest leverage first)

1. ✅ **DONE (2026-06-14)** — **Built the EU-Oil-Bulletin scraper** (CC BY 4.0, `eu_oil_bulletin.js`),
   legally replacing the 14 EU fuelo countries at national-avg granularity (BE, BG, CZ, EE, GR, HR, HU,
   IE, LT, LV, NL, PL, RO, SK) over OSM stations. Wired into boot + weekly cron; the 14 fuelo scrapers
   were removed from all schedules/triggers in `sync.js`. **Post-deploy:** run `purge_fuelo_eub.js`.
2. ✅ **DONE (2026-06-14)** — **Replaced de.fuelo.net with Tankerkönig** (`sync.js` now imports
   `scrapers/tankerkoenig`). ⚠️ Set `TANKERKOENIG_API_KEY` on Render or DE coverage collapses to a test area.
3. ✅ **DONE (2026-06-14)** — **Turkey → EPDK** national dealer-price bulletin (`turkey_epdk.js`), replacing tr.fuelo.net. (Switzerland investigated same day: **no clean official absolute-price source** — only a CPI index — so parked.)
4. ⏳ **PARTIAL (2026-06-15)** — **regulated-price non-EU Balkans.** ✅ North Macedonia done (ERC homepage table, `northmacedonia_erc.js`). ⏸️ Serbia, Montenegro, Albania, Bosnia, Kosovo **parked**: they set official regulated prices but publish only via news/article streams (no stable API/table) — automatable scraping is too brittle. Revisit with a manual-constant table (like South Africa) or if a stable official source appears.
5. **Optional per-station upgrades:** Turkey (EPDK SOAP, per-province), Romania (probe the Concurenței app API), Greece (PDF parser).
6. Remove every remaining `*.fuelo.net`, `carbu.com` (LU) and the borrowed Opinet key once replacements land.

> **Tradeoff to accept:** buckets B/C show one price per country instead of per-station prices.
> For regulated markets (C) that's the real price; for non-regulated (B) it's a deliberate
> accuracy-for-legality trade until/unless an official per-station source appears. All "verify"
> licences above should still be confirmed before launch.
