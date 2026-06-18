# Commercial-terms outreach — draft emails

**Purpose:** the data sources below are usable, but their licences/API terms need
**written confirmation that a commercial (paid) consumer app may use + redistribute**
their fuel-price data. Send each provider the relevant draft, fill the `[bracketed]`
fields, and keep their reply on file for App Store review + your lawyer.

> Tip: keep replies (PDF/screenshot) in a `legal/` folder. A "yes, commercial use is
> permitted with attribution X" email is what you need before charging money.

**App one-liner (reuse in every email):**
> *Gasify is a consumer fuel-price comparison app/map that helps drivers find the
> cheapest nearby fuel. We are preparing a commercial (paid/monetised) release and want
> to confirm our use of your data is permitted.*

---

## 1. Chile — CNE "Bencina en Línea" (`api.cne.cl`)
**Confirm:** that a foreign commercial app may query the API and display/redistribute
the station prices. **Contact:** CNE *Oficina de Atención Ciudadana* / `consultas@cne.cl`
(or the contact form at cne.cl). *Spanish draft below.*

> **Asunto:** Consulta sobre uso comercial de la API "Bencina en Línea"
>
> Estimados,
>
> Desarrollo *Gasify*, una aplicación de comparación de precios de combustible para
> conductores. Estamos preparando un lanzamiento comercial (aplicación de pago) y
> utilizamos la API pública de "Bencina en Línea" (`api.cne.cl`) para mostrar los
> precios por estación.
>
> ¿Podrían confirmarme por escrito si los términos de uso de la API permiten el uso
> **comercial** y la **redistribución** de los datos de precios en una aplicación de
> pago? ¿Existe algún requisito de atribución, registro, límite de consultas o costo?
>
> Agradezco su orientación.
> Atentamente, [Nombre] — [correo] — [URL del sitio/app]

---

## 2. Australia — NSW FuelCheck (`api.onegov.nsw.gov.au`)
**Confirm:** that the FuelCheck API terms permit a commercial app to display +
redistribute prices (their developer terms can require an agreement for commercial use).
**Contact:** the NSW API/FuelCheck developer support (developer portal "contact us" /
`fuelcheck@customerservice.nsw.gov.au`).

> **Subject:** FuelCheck API — commercial-use confirmation request
>
> Hello,
>
> I run *Gasify*, a consumer fuel-price comparison app, and we use the FuelCheck API
> to show NSW station prices. We are preparing a **commercial (paid)** release.
>
> Could you confirm in writing whether the FuelCheck API terms permit **commercial use
> and redistribution** of the price data in a paid app? If a commercial agreement,
> attribution, registration, or fee is required, please point me to the process.
>
> Thank you,
> [Name] — [email] — [app URL]

---

## 3. Australia — VIC "Servo Saver" / Service Victoria Public API
**Confirm:** commercial reuse of the Servo Saver price data. **Contact:** Service
Victoria API support / the data-access agreement contact on their developer page.

> **Subject:** Servo Saver Public API — commercial-use confirmation
>
> Hello,
>
> *Gasify* is a consumer fuel-price comparison app that uses the Servo Saver Public API
> for Victorian station prices. We're moving to a **commercial (paid)** release.
>
> Please confirm whether your API terms allow **commercial use and redistribution** of
> the price data, and any agreement, attribution, or fee required.
>
> Regards,
> [Name] — [email] — [app URL]

---

## 4. Australia — QLD (FuelPricesQLD / Informed Sources) ⚠️ highest risk
**Why:** the QLD feed is delivered by **Informed Sources**, a commercial aggregator —
redistribution is likely **licensed/paid**, not free. **Confirm:** the licence terms +
cost for commercial redistribution. **Contact:** the QLD Government fuel-price-reporting
team and/or Informed Sources licensing (`info@informedsources.com`).

> **Subject:** QLD fuel-price data — commercial redistribution licence
>
> Hello,
>
> *Gasify* is a consumer fuel-price comparison app. We currently access the Queensland
> fuel-price feed (via the FuelPricesQLD / Informed Sources subscriber service) and are
> preparing a **commercial (paid)** release.
>
> Could you confirm the **licensing terms and any fees** for **commercial use and
> redistribution** of the Queensland price data in a paid consumer app? If a commercial
> subscription/licence is required, please send details.
>
> Thank you,
> [Name] — [email] — [app URL]

---

## 5. Finland — `polttoaine.net` (XML feed)
**Confirm:** permission to use + redistribute their feed in a commercial app (it's a
third-party site, not an official source). **Contact:** the site's contact/feedback
address (`polttoaine.net` "palaute"/contact).

> **Subject:** Commercial use of your fuel-price feed — permission request
>
> Hei,
>
> I develop *Gasify*, a consumer fuel-price comparison app, and we use your
> `polttoaine.net` price feed for Finnish stations. We are preparing a **commercial
> (paid)** release.
>
> May we use and redistribute your fuel-price data in a commercial app? Please let me
> know any conditions (attribution, fee, limits) or if this is not permitted.
>
> Kiitos,
> [Name] — [email] — [app URL]

---

## 6. Slovenia — `goriva.si`
**Confirm:** permission to use + redistribute (third-party site republishing regulated
prices). **Contact:** the goriva.si contact form / operator email.

> **Subject:** Commercial use of goriva.si data — permission request
>
> Pozdravljeni,
>
> I run *Gasify*, a consumer fuel-price comparison app that uses goriva.si data for
> Slovenian stations. We are preparing a **commercial (paid)** release.
>
> Could you confirm whether we may use and **redistribute** your price data commercially,
> and any conditions (attribution, fee)? If not permitted, please let me know.
>
> Hvala,
> [Name] — [email] — [app URL]

---

## 7. United Kingdom — `fuelcosts.co.uk` (re-publisher)
**Note:** you currently consume a **re-publisher**, not the source. The underlying
**UK fuel price data is published under the OGL/CMA scheme** (open, commercial OK with
attribution). **Best fix:** switch to the official CMA "fuel price data scheme" feeds
directly (then no permission needed — just OGL attribution). Otherwise email
fuelcosts.co.uk about their own ToS.

> **Subject:** Re-use of your fuel-price data — terms for a commercial app
>
> Hello,
>
> *Gasify* is a consumer fuel-price comparison app and we currently read fuel prices
> from fuelcosts.co.uk. We're preparing a **commercial (paid)** release.
>
> Do your terms permit commercial use/redistribution of the data you publish? (We
> understand the underlying scheme data is OGL-licensed — if you'd prefer we pull the
> official CMA scheme feeds directly, please confirm.)
>
> Thanks,
> [Name] — [email] — [app URL]

---

## 8. Denmark — ✅ RESOLVED (no email needed)
Migrated **2026-06-18** from the unofficial vendor endpoints to the **EU Weekly Oil
Bulletin** (CC BY 4.0, national-avg over OSM). No licence inquiry required.

## How to send these
I can't send them for you (no working SMTP credentials, and these are outward business
emails in your name needing your real name/email/app URL + your review). Steps:
1. Fill the `[bracketed]` fields with your name, contact email, and app/site URL.
2. Verify each provider's current contact address/form on their site (the routes above are
   starting points — gov/vendor contacts change).
3. Send from your own email, BCC yourself, and save each reply for your records.

---

## Summary checklist
| Source | Action | Risk |
|---|---|---|
| Chile (CNE) | Email (ES) | low — gov |
| AU NSW (FuelCheck) | Email | medium |
| AU VIC (Servo Saver) | Email | medium |
| **AU QLD (Informed Sources)** | Email — expect a **paid licence** | **high** |
| Finland (polttoaine.net) | Email | medium |
| Slovenia (goriva.si) | Email | medium |
| UK (fuelcosts.co.uk) | Email **or** switch to official CMA/OGL feed | low |
| ~~Denmark~~ | ✅ resolved → EU Oil Bulletin | — |
