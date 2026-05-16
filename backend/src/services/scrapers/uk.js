// UK fuel prices via fuelcosts.co.uk (re-publishes UK Fuel Finder scheme, OGL v3)
// Stations CSV: 8,153 stations with coordinates, no auth
// Price history CSV: all price changes streamed → latest price per station/fuel type
// Prices in pence/litre → converted to EUR at approximate GBP/EUR rate

const readline = require('readline');
const { Readable } = require('stream');

const STATIONS_URL = 'https://fuelcosts.co.uk/api/download/stations';
const PRICES_URL   = 'https://fuelcosts.co.uk/api/download/price-history';
const GBP_EUR      = 1.17;
const UA           = 'Mozilla/5.0 (compatible; Gasify/1.0; +https://gasify.app)';

const FUEL_MAP = {
  E10:         'e10',
  E5:          'sp98',
  B7_STANDARD: 'diesel',
  B7_PREMIUM:  'diesel_premium',
};

function penceToEur(pence) {
  const n = parseFloat(pence) / 100 * GBP_EUR;
  return isNaN(n) || n <= 0 ? 0 : +n.toFixed(3);
}

// Simple CSV row parser that handles double-quoted fields
function parseRow(line, headers) {
  const result = {};
  let field = '', inQuotes = false, col = 0;
  for (let i = 0; i <= line.length; i++) {
    const ch = i < line.length ? line[i] : ','; // sentinel comma at end
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      if (col < headers.length) result[headers[col]] = field;
      field = ''; col++;
    } else {
      field += ch;
    }
  }
  return result;
}

async function buildStationMap() {
  const res = await fetch(STATIONS_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`[uk] stations CSV → HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n');
  const headers = lines[0].trim().split(',');
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const r = parseRow(line, headers);
    if (!r.node_id || r.is_permanently_closed === 'true') continue;
    const lat = parseFloat(r.latitude);
    const lng = parseFloat(r.longitude);
    if (isNaN(lat) || isNaN(lng)) continue;
    map.set(r.node_id, {
      externalId: `GB-${r.node_id}`,
      name: r.trading_name || r.brand_name || 'Station',
      brand: r.brand_name || null,
      lat, lng,
      address: r.address_line_1 || null,
      city: r.city || r.county || '',
      country: 'GB',
    });
  }
  console.log(`[uk] ${map.size} active stations`);
  return map;
}

async function streamLatestPrices() {
  const res = await fetch(PRICES_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`[uk] prices CSV → HTTP ${res.status}`);

  // Stream line-by-line without loading full 60+ MB into memory
  const nodeStream = Readable.fromWeb(res.body);
  const rl = readline.createInterface({ input: nodeStream, crlfDelay: Infinity });

  const latest = new Map(); // `${nodeId}|${fuelType}` → { pence, ts }
  let headers = null, rows = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!headers) { headers = trimmed.split(','); continue; }
    const r = parseRow(trimmed, headers);
    rows++;
    const nodeId   = r.node_id?.trim();
    const fuelType = r.fuel_type?.trim();
    const pence    = parseFloat(r.price_pence);
    const ts       = r.recorded_at || r.source_updated_at || '';
    if (!nodeId || !fuelType || isNaN(pence) || pence <= 0) continue;
    const key = `${nodeId}|${fuelType}`;
    const existing = latest.get(key);
    // ISO 8601 timestamps sort lexicographically = chronologically
    if (!existing || ts > existing.ts) latest.set(key, { pence, ts });
  }
  if (rows % 1000 === 0 || rows < 100) {
    console.log(`[uk] ${rows} price rows → ${latest.size} unique station/fuel combos`);
  } else {
    console.log(`[uk] ${rows} price rows → ${latest.size} unique station/fuel combos`);
  }
  return latest;
}

async function fetchUKStations() {
  console.log('[uk] Downloading stations CSV…');
  const stationMap = await buildStationMap();

  console.log('[uk] Streaming price history CSV…');
  const latestPrices = await streamLatestPrices();

  const stations = [];
  for (const [nodeId, station] of stationMap) {
    const prices = [];
    for (const [apiType, dbType] of Object.entries(FUEL_MAP)) {
      const entry = latestPrices.get(`${nodeId}|${apiType}`);
      if (!entry) continue;
      const price = penceToEur(entry.pence);
      if (price > 0) prices.push({ fuelType: dbType, price });
    }
    if (!prices.length) continue;
    stations.push({ ...station, prices });
  }

  console.log(`[uk] Done — ${stations.length} stations with prices`);
  return stations;
}

module.exports = { fetchUKStations };
