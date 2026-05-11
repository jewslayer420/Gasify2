// Portugal fuel prices via DGEG official API — no API key needed
// https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos
// Returns ~14,488 records (one row per fuel type per station), paginated ~55/page

const API_BASE = 'https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos';

function mapFuelType(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.includes('gpl') || n.includes('lpg')) return 'lpg';
  if (n.includes('metano') || n.includes('cng') || n.includes('gnv')) return 'cng';
  const isDiesel = n.includes('gasóleo') || n.includes('gasoleo') || n.includes('diesel');
  const isPremium = n.includes('especial') || n.includes('premium') || n.includes('plus') || n.includes('ultimate');
  if (isDiesel && isPremium) return 'diesel_premium';
  if (isDiesel) return 'diesel';
  if (n.includes('98')) return 'sp98';
  if (n.includes('95') || n.includes('gasolina')) return 'sp95';
  return null;
}

function parsePrice(str) {
  if (!str) return null;
  const n = parseFloat(str.replace(',', '.').replace(/[^\d.]/g, ''));
  return (!isNaN(n) && n > 0 && n < 10) ? +n.toFixed(3) : null;
}

async function fetchPage(page) {
  try {
    const res = await fetch(`${API_BASE}?f=json&pagina=${page}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.resultado) ? data.resultado : [];
  } catch { return []; }
}

async function fetchPortugalStations() {
  const allRecords = [];
  const CONCURRENCY = 20;
  const MAX_PAGES = 320;
  let consecutiveEmpty = 0;

  for (let base = 1; base <= MAX_PAGES; base += CONCURRENCY) {
    const pages = Array.from({ length: Math.min(CONCURRENCY, MAX_PAGES - base + 1) }, (_, i) => base + i);
    const results = await Promise.all(pages.map(p => fetchPage(p)));
    let batchEmpty = 0;
    for (const rows of results) {
      if (rows.length === 0) batchEmpty++;
      allRecords.push(...rows);
    }
    console.log(`[portugal] Pages ${pages[0]}-${pages[pages.length - 1]} done, ${allRecords.length} records total`);
    consecutiveEmpty = batchEmpty === pages.length ? consecutiveEmpty + 1 : 0;
    if (consecutiveEmpty >= 2) break;
  }

  // Group by station Id
  const stationMap = new Map();
  for (const row of allRecords) {
    const id = String(row.Id);
    if (!id || id === 'undefined') continue;
    if (!stationMap.has(id)) {
      stationMap.set(id, {
        externalId: `PT-${id}`,
        name: row.Nome || `Station ${id}`,
        brand: row.Marca || null,
        lat: row.Latitude,
        lng: row.Longitude,
        address: row.Morada || null,
        city: row.Localidade || row.Municipio || '',
        country: 'PT',
        prices: [],
      });
    }
    const ft = mapFuelType(row.Combustivel);
    const price = parsePrice(row.Preco);
    if (ft && price) {
      const s = stationMap.get(id);
      if (!s.prices.find(p => p.fuelType === ft)) s.prices.push({ fuelType: ft, price });
    }
  }

  const stations = [...stationMap.values()].filter(s =>
    s.lat && s.lng && !isNaN(s.lat) && !isNaN(s.lng) && s.prices.length > 0
  );
  console.log(`[portugal] Done — ${stations.length} stations with prices`);
  return stations;
}

module.exports = { fetchPortugalStations };
