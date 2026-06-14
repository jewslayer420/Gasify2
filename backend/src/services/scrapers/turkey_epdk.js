// Turkey fuel prices — EPDK (Enerji Piyasası Düzenleme Kurumu, the official energy
// market regulator) "Bayi Satış Fiyatı Bülteni" national dealer-price bulletin,
// applied over OpenStreetMap fuel stations (the "Canada model").
//
// WHY: replaces the tr.fuelo.net scraper (a private aggregator — legal blocker)
// with Turkey's official regulator data.
//
// Source: EPDK API gateway (apigateway.epdk.gov.tr).
//   * petrolBayiSatisFiyatBulten      → Benzin 95 / Motorin (diesel), national, TRY/litre
//   * lpgBayiSatisFiyatBultenGunluk   → Otogaz LPG, national, TRY/litre
//   Both are GET requests carrying a JSON body { "raporTarihi": "dd.MM.yyyy" }.
//   (WSO2/Apinizer gateway — GET-with-body, which Node's fetch() forbids, so we use
//   the raw https module.) The gateway throttles bursts (HTTP 429); we make few
//   calls per run and sleep between them.
//
// Prices are TRY/L → converted to EUR/L (the app normalises everything to EUR) using
// the ECB euro reference rate (eurofxref-daily.xml, free, no key), with a constant
// fallback if ECB is unreachable.
//
// Granularity tradeoff: every Turkish station shows the same national EPDK price.
// A per-province upgrade exists via the SOAP service
// (lisansws.epdk.gov.tr/services/bildirimPetrolAkaryakitFiyatlari, "illere göre",
// sorguNo=71) — tracked in docs/DATA_SOURCES.md.

const https = require('https');

const UA = 'Gasify/1.0 (fuel price aggregator; contact teo.karov@gmail.com)';

const EPDK_HOST = 'apigateway.epdk.gov.tr';
const PETROL_PATH = '/petrolBayiSatisFiyatBulten';
const LPG_PATH = '/lpgBayiSatisFiyatBultenGunluk';

const ECB_FX_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const TRY_PER_EUR_FALLBACK = 47; // updated ~2026; only used if ECB fetch fails

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// Turkey bounding box (matches the legacy scraper).
const TR_BBOX = [35.8, 25.9, 42.2, 44.9]; // [latMin, lngMin, latMax, lngMax]

const sleep = ms => new Promise(r => setTimeout(r, ms));

function ddMMyyyy(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}.${m}.${date.getUTCFullYear()}`;
}

// GET-with-body against the EPDK gateway (raw https — fetch() refuses GET bodies).
function epdkGet(path, raporTarihi) {
  return new Promise(resolve => {
    const body = JSON.stringify({ raporTarihi });
    const req = https.request(
      {
        method: 'GET', host: EPDK_HOST, path,
        headers: {
          'User-Agent': UA, 'Content-Type': 'application/json',
          Accept: 'application/json', 'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, json: null }); }
        });
      }
    );
    req.on('error', () => resolve({ status: 0, json: null }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: 0, json: null }); });
    req.write(body);
    req.end();
  });
}

// Latest TRY per 1 EUR from the ECB daily reference rates (no key). Fallback constant.
async function fetchTryPerEur() {
  try {
    const r = await fetch(ECB_FX_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const m = xml.match(/currency=['"]TRY['"]\s+rate=['"]([\d.]+)['"]/i);
    const rate = m ? parseFloat(m[1]) : NaN;
    if (isFinite(rate) && rate > 5 && rate < 200) {
      console.log(`[turkey-epdk] ECB rate: 1 EUR = ${rate} TRY`);
      return rate;
    }
    throw new Error('TRY rate not found/insane');
  } catch (err) {
    console.warn(`[turkey-epdk] ECB FX failed (${err.message}); using fallback ${TRY_PER_EUR_FALLBACK}`);
    return TRY_PER_EUR_FALLBACK;
  }
}

// Map an EPDK "Yakıt" label to our fuelType, for retail automotive fuels only.
function mapFuel(yakit) {
  const n = (yakit || '').toLocaleLowerCase('tr');
  if (n.includes('benzin') && n.includes('95')) return 'sp95';
  if (n.includes('motorin')) return 'diesel';
  // Vehicle LPG is "Otogaz" (sold by litre). NOT "Dökme LPG"/"Tüplü LPG"
  // (bulk/cylinder LPG sold by kilogram/adet), which also contain "LPG".
  if (n.includes('otogaz')) return 'lpg';
  return null; // ignore Fuel Oil, Kalorifer Yakıtı, Gazyağı (kerosene), Dökme/Tüplü LPG, etc.
}

// Pull the latest available bulletin: try today, walk back up to `maxBack` days.
async function fetchLatestPrices() {
  const tryPerEur = await fetchTryPerEur();
  const toEur = try_ => {
    const eur = +(try_ / tryPerEur).toFixed(3);
    return eur >= 0.3 && eur <= 5 ? eur : null;
  };

  const prices = new Map(); // fuelType -> EUR/L
  let usedDate = null;
  const maxBack = 10;

  // Petrol bulletin (benzin 95 + motorin)
  for (let back = 0; back <= maxBack && !usedDate; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const dateStr = ddMMyyyy(d);
    await sleep(1200); // be gentle with the gateway throttle
    const { status, json } = await epdkGet(PETROL_PATH, dateStr);
    if (status === 200 && json && Array.isArray(json.data) && json.data.length) {
      for (const row of json.data) {
        const ft = mapFuel(row['Yakıt']);
        if (ft && (row['Ölçü Birimi'] || '').toLowerCase().includes('litre')) {
          const eur = toEur(row.Fiyat);
          if (eur && !prices.has(ft)) prices.set(ft, eur);
        }
      }
      if (prices.size) usedDate = (json.data[0] && json.data[0].Tarih) || dateStr;
    } else if (status === 429) {
      await sleep(3000); back--; // throttled — wait and retry same date
    }
  }

  if (!usedDate) { console.error('[turkey-epdk] no petrol bulletin found in last 10 days'); return { prices: [], date: null }; }

  // LPG bulletin (otogaz) — best-effort, same date window
  for (let back = 0; back <= maxBack; back++) {
    const d = new Date(Date.now() - back * 86400000);
    await sleep(1200);
    const { status, json } = await epdkGet(LPG_PATH, ddMMyyyy(d));
    if (status === 200 && json && Array.isArray(json.data) && json.data.length) {
      for (const row of json.data) {
        const ft = mapFuel(row['Yakıt']);
        if (ft === 'lpg' && (row['Ölçü Birimi'] || '').toLowerCase().includes('litre')) {
          const eur = toEur(row.Fiyat); if (eur && !prices.has('lpg')) prices.set('lpg', eur);
        }
      }
      if (prices.has('lpg')) break;
    } else if (status === 429) { await sleep(3000); back--; }
  }

  const list = [...prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
  console.log(`[turkey-epdk] bulletin ${usedDate}: ${list.map(p => `${p.fuelType}=${p.price}`).join(' ')} EUR/L`);
  return { prices: list, date: usedDate };
}

// Fetch amenity=fuel nodes/ways for Turkey via Overpass (mirror fallback).
async function fetchStations(priceList) {
  const [latMin, lngMin, latMax, lngMax] = TR_BBOX;
  const query = `[out:json][timeout:180][bbox:${latMin},${lngMin},${latMax},${lngMax}];nwr["amenity"="fuel"];out center;`;
  let json = null;
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      await sleep(1500);
      const r = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
        headers: { Accept: '*/*', 'User-Agent': UA }, signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      json = await r.json();
      break;
    } catch (err) {
      console.warn(`[turkey-epdk] overpass ${mirror.split('/')[2]} failed: ${err.message}`);
    }
  }
  if (!json) { console.error('[turkey-epdk] all Overpass mirrors failed'); return []; }

  const out = new Map();
  for (const e of (json.elements || [])) {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const key = `${e.type}/${e.id}`;
    if (!lat || !lng || out.has(key)) continue;
    const tags = e.tags || {};
    const name = tags.name || tags['name:en'] || tags.brand || tags.operator || 'Akaryakıt İstasyonu';
    const brand = tags.brand || tags.operator || null;
    const city = tags['addr:province'] || tags['addr:city'] || tags['addr:district'] || '';
    const addrParts = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean);
    out.set(key, {
      externalId: `EPDK-TR-OSM-${e.type}-${e.id}`,
      name, brand, lat, lng,
      address: addrParts.length ? addrParts.join(' ') : null,
      city, country: 'TR', prices: priceList,
    });
  }
  console.log(`[turkey-epdk] ${out.size} stations`);
  return [...out.values()];
}

async function fetchTurkeyStations() {
  const { prices } = await fetchLatestPrices();
  if (!prices.length) { console.warn('[turkey-epdk] no prices, skipping stations'); return []; }
  return fetchStations(prices);
}

module.exports = { fetchTurkeyStations, fetchLatestPrices };
