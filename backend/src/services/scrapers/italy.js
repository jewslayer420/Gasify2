// Italy fuel prices via MIMIT government open data — no API key needed
// Two pipe-separated CSVs: station registry + daily prices (updated daily at 8 AM)
const REGISTRY_URL = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
const PRICES_URL   = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';

// Fuel type: Benzina→sp95, Gasolio→diesel, GPL→lpg, Metano→cng, Gasolio Speciale→diesel_premium
function mapFuelType(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase().trim();
  if (d === 'gasolio speciale' || d.includes('gasolio premium')) return 'diesel_premium';
  if (d.startsWith('gasolio')) return 'diesel';
  if (d.includes('benzina speciale') || d.includes('benzina premium')) return 'sp98';
  if (d.startsWith('benzina')) return 'sp95';
  if (d === 'gpl') return 'lpg';
  if (d === 'metano') return 'cng';
  return null;
}

async function fetchCSV(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Italy CSV ${url} → ${res.status}`);
  return res.text();
}

function parseCSV(text) {
  const lines = text.split('\n');
  // Line 0: "Estrazione del YYYY-MM-DD", Line 1: headers, Line 2+: data
  const headers = lines[1].trim().split('|');
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split('|');
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = parts[j] ?? '';
    rows.push(obj);
  }
  return rows;
}

async function fetchItalyStations() {
  console.log('[italy] Downloading CSVs…');
  const [registryText, pricesText] = await Promise.all([fetchCSV(REGISTRY_URL), fetchCSV(PRICES_URL)]);

  const registry = parseCSV(registryText);
  const prices   = parseCSV(pricesText);
  console.log(`[italy] Registry: ${registry.length} stations, Prices: ${prices.length} rows`);

  // Build station map from registry
  const stationMap = new Map();
  for (const r of registry) {
    const lat = parseFloat(r['Latitudine']);
    const lng = parseFloat(r['Longitudine']);
    if (isNaN(lat) || isNaN(lng) || !r['idImpianto']) continue;
    stationMap.set(r['idImpianto'], {
      externalId: `IT-${r['idImpianto']}`,
      name: r['Nome Impianto'] || r['Gestore'] || `Station ${r['idImpianto']}`,
      brand: r['Bandiera'] || null,
      lat, lng,
      address: r['Indirizzo'] || null,
      city: r['Comune'] || '',
      country: 'IT',
      prices: new Map(), // fuelType → lowest price
    });
  }

  // Accumulate prices — keep lowest price per station per fuel type
  for (const p of prices) {
    const station = stationMap.get(p['idImpianto']);
    if (!station) continue;
    const ft = mapFuelType(p['descCarburante']);
    if (!ft) continue;
    const price = parseFloat(p['prezzo']);
    if (isNaN(price) || price <= 0 || price > 5) continue;
    const existing = station.prices.get(ft);
    if (!existing || price < existing) station.prices.set(ft, price);
  }

  const stations = [];
  for (const s of stationMap.values()) {
    const priceArr = [...s.prices.entries()].map(([fuelType, price]) => ({ fuelType, price }));
    if (!priceArr.length) continue;
    stations.push({ ...s, prices: priceArr });
  }

  console.log(`[italy] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchItalyStations };
