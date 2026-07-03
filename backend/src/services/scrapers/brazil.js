// Brazil fuel prices — ANP national weekly average (gov.br) + OpenStreetMap stations
//
// Prices: ANP "Série Histórica do Levantamento de Preços" — national weekly summary XLSX.
//   GET .../shlp/semanal/semanal-brasil-desde-2013.xlsx  (sheet "BRASIL - DESDE …")
//   Columns: DATA INICIAL, DATA FINAL, PRODUTO, …, UNIDADE DE MEDIDA, PREÇO MÉDIO REVENDA, …
//   PRODUTO: GASOLINA COMUM, GASOLINA ADITIVADA, OLEO DIESEL, OLEO DIESEL S10, GNV, GLP.
//   Latest week's national average applied to all stations (Canada model). Prices in R$/l (GNV R$/m³).
//
// Stations: Overpass API — amenity=fuel nodes across Brazil (bbox grid; ids dedupe overlaps).

const XLSX = require('xlsx');
const { stationsFromDb } = require('./_overpass');

const BRL_EUR = 1 / 6.2; // 1 EUR ≈ 6.2 BRL
const XLSX_URL = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-brasil-desde-2013.xlsx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ANP PRODUTO → internal fuelType
function mapProduto(p) {
  const s = (p || '').toUpperCase();
  if (s.includes('S10')) return 'diesel_premium';
  if (s.includes('DIESEL')) return 'diesel';
  if (s.includes('ADITIVADA')) return 'sp98';
  if (s.includes('GASOLINA')) return 'sp95';
  if (s.includes('ETANOL') || s.includes('ÁLCOOL') || s.includes('ALCOOL')) return 'e10';
  if (s.includes('GNV')) return 'cng';
  return null; // GLP (cooking gas) skipped
}

function brlToEur(val) {
  const n = parseFloat(String(val).replace(',', '.'));
  if (isNaN(n) || n <= 0) return null;
  const eur = +(n * BRL_EUR).toFixed(3);
  return eur > 0.2 && eur < 6 ? eur : null;
}

function parseDate(s) {
  // ANP formats DATA as "M/D/YY" via SheetJS raw:false
  const m = String(s).split('/');
  if (m.length !== 3) return 0;
  const [mo, d, y] = m.map(Number);
  return new Date(2000 + (y % 100), mo - 1, d).getTime();
}

// Returns [{ fuelType, price }] of the most recent week's national averages.
async function fetchNationalPrices() {
  const r = await fetch(XLSX_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`ANP XLSX ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

  // Locate the column-header row (the one listing DATA INICIAL/PRODUTO/PREÇO MÉDIO REVENDA)
  const hi = rows.findIndex(r => r.some(c => /data inicial/i.test(String(c))) && r.some(c => /produto/i.test(String(c))));
  if (hi === -1) throw new Error('ANP header row not found');
  const head = rows[hi].map(c => String(c).trim().toUpperCase());
  const cFim = head.indexOf('DATA FINAL');
  const cProd = head.indexOf('PRODUTO');
  const cPreco = head.findIndex(c => c.includes('PREÇO MÉDIO REVENDA') || c.includes('PRECO MEDIO REVENDA'));
  if (cFim === -1 || cProd === -1 || cPreco === -1) throw new Error('ANP columns not found');

  // Find the latest DATA FINAL, then collect that week's products.
  let maxT = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const t = parseDate(rows[i][cFim]);
    if (t > maxT) maxT = t;
  }
  const prices = [];
  const seen = new Set();
  for (let i = hi + 1; i < rows.length; i++) {
    if (parseDate(rows[i][cFim]) !== maxT) continue;
    const ft = mapProduto(rows[i][cProd]);
    if (!ft || seen.has(ft)) continue;
    const price = brlToEur(rows[i][cPreco]);
    if (!price) continue;
    seen.add(ft);
    prices.push({ fuelType: ft, price });
  }
  return prices;
}

async function fetchOverpass(query) {
  // Two passes over the mirrors; a 504/timeout on a busy mirror often clears on retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const mirror of OVERPASS_MIRRORS) {
      const tag = mirror.includes('kumi') ? 'kumi' : mirror.includes('-api.de') ? 'de' : 'ru';
      try {
        await new Promise(r => setTimeout(r, 2000));
        const res = await fetch(`${mirror}?` + new URLSearchParams({ data: query }), {
          headers: { Accept: '*/*', 'User-Agent': 'Gasify/1.0' },
          signal: AbortSignal.timeout(180000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn(`[brazil] ${tag} failed (attempt ${attempt + 1}): ${err.message}`);
      }
    }
  }
  return null;
}

async function fetchBrazilStations() {
  let priceList;
  try {
    priceList = await fetchNationalPrices();
  } catch (err) {
    console.error('[brazil] price fetch error:', err.message);
    return [];
  }
  if (!priceList.length) { console.error('[brazil] no prices parsed'); return []; }
  console.log(`[brazil] national avg: ${priceList.map(p => `${p.fuelType}=€${p.price}`).join(', ')}`);

  const fromDb = await stationsFromDb('BR-OSM-', () => priceList, 'brazil');
  if (fromDb) return fromDb;

  // bbox grid over populated Brazil: [latMin, lngMin, latMax, lngMax]
  const bboxes = [
    [  2.0, -74.0,  5.3, -50.0], // far north (Roraima/Amapá)
    [ -8.0, -74.0,  2.0, -58.0], // west Amazon (AM/AC/RO)
    [ -8.0, -58.0,  2.0, -44.0], // east Amazon (PA/north MA)
    [ -8.0, -44.0,  0.0, -34.5], // NE coast north (MA/CE/RN/PB/PE)
    [-18.5, -47.0, -8.0, -34.5], // NE south (BA/SE/AL/PI)
    [-19.0, -62.0, -8.0, -47.0], // centre-west (MT/GO/DF/TO)
    [-24.5, -58.5, -19.0, -47.0],// MS + west SP/MG
    [-21.0, -47.0, -14.0, -39.0],// MG/ES
    [-25.5, -47.0, -21.0, -39.5],// SP/RJ (dense)
    [-30.0, -54.5, -22.5, -47.5],// PR/SC
    [-34.0, -58.0, -28.0, -49.5],// RS
  ];

  const stationMap = new Map();
  for (const [latMin, lngMin, latMax, lngMax] of bboxes) {
    const query = `[out:json][timeout:180];area["ISO3166-1"="BR"]->.a;nwr["amenity"="fuel"](area.a)(${latMin},${lngMin},${latMax},${lngMax});out center;`;
    const json = await fetchOverpass(query);
    if (!json) { console.error(`[brazil] all mirrors failed for bbox [${latMin},${lngMin}..${latMax},${lngMax}]`); continue; }
    for (const e of (json.elements || [])) {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
      const key = `${e.type}/${e.id}`;
      if (!lat || !lng || stationMap.has(key)) continue;
      const tags = e.tags || {};
      stationMap.set(key, {
        externalId: `BR-OSM-${e.type}-${e.id}`,
        name: tags.name || tags['name:pt'] || tags.brand || tags.operator || 'Posto de Combustível',
        brand: tags.brand || tags.operator || null,
        lat, lng,
        address: [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || null,
        city: tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || '',
        country: 'BR',
        prices: priceList,
      });
    }
    console.log(`[brazil] bbox [${latMin},${lngMin}..${latMax},${lngMax}]: ${stationMap.size} total`);
  }

  const stations = [...stationMap.values()];
  console.log(`[brazil] ${stations.length} stations`);
  return stations;
}

module.exports = { fetchBrazilStations };
