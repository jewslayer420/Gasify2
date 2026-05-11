// Albania fuel prices via al.fuelo.net — no API key needed
const PHASE1_URL = 'https://al.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering';
const PHASE2_BASE = 'https://al.fuelo.net/ajax/get_infowindow_content';
const GRID_STEP = 0.15;
const BOUNDS = { latMin: 39.6, latMax: 42.7, lngMin: 19.3, lngMax: 21.1 };

const COUNTRY_NAME_MAP = {
  albania: 'AL', shqipëria: 'AL', shqiperia: 'AL', albanien: 'AL', albanie: 'AL',
  'north macedonia': 'MK', macedonia: 'MK',
  montenegro: 'ME', 'crna gora': 'ME',
  kosovo: 'XK', kosova: 'XK', kosovë: 'XK',
  greece: 'GR', hellas: 'GR',
};

async function runConcurrent(items, fn, concurrency = 10) {
  for (let i = 0; i < items.length; i += concurrency)
    await Promise.all(items.slice(i, i + concurrency).map(fn));
}

function mapFuelType(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.includes('lpg') || n.includes('autogas') || n.includes('gpl')) return 'lpg';
  if (n.includes('cng') || n.includes('gnv') || n.includes('gas natyror')) return 'cng';
  if (n.includes('e10')) return 'e10';
  const isDiesel = n.includes('diesel') || n.includes('naftë') || n.includes('nafte') || n.includes('gazole');
  const isPremium = n.includes('premium') || n.includes('plus') || n.includes('ultimate') || n.includes('v-power');
  if (isDiesel && isPremium) return 'diesel_premium';
  if (isDiesel) return 'diesel';
  if (n.includes('98') || n.includes('100')) return 'sp98';
  if (n.includes('95') || n.includes('super') || n.includes('unleaded') || n.includes('benzinë') || n.includes('e5')) return 'sp95';
  return null;
}

function parsePrices(html) {
  const seen = new Set();
  const prices = [];
  const regex = /title="([^:]+):\s*([\d.,]+)\s*([A-Z€]+)\/l/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const ft = mapFuelType(m[1]);
    const raw = parseFloat(m[2].replace(',', '.'));
    if (!ft || isNaN(raw) || raw <= 0 || raw > 5 || seen.has(ft)) continue;
    seen.add(ft);
    prices.push({ fuelType: ft, price: +raw.toFixed(3) });
  }
  return prices;
}

async function fetchCell(latMin, latMax, lngMin, lngMax, stationIdMap) {
  const body = `lat_min=${latMin}&lat_max=${latMax}&lon_min=${lngMin}&lon_max=${lngMax}&zoom=14`;
  try {
    const res = await fetch(PHASE1_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)' },
      body, signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return;
    const data = await res.json();
    for (const s of (data.gasstations || [])) {
      const id = String(s.id ?? '');
      if (!id || stationIdMap.has(id)) continue;
      const lat = parseFloat(s.lat), lng = parseFloat(s.lon ?? s.lng);
      if (!isNaN(lat) && !isNaN(lng)) stationIdMap.set(id, { lat, lng });
    }
  } catch { /* skip */ }
}

async function fetchDetail(id, coords) {
  try {
    const res = await fetch(`${PHASE2_BASE}/${id}?lang=en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const html = data.text || '';
    if (!html) return null;
    const nameMatch = html.match(/<h4[^>]*>([^<]+)<\/h4>/);
    const addrMatch = html.match(/<h5[^>]*>([^<]+)<\/h5>/);
    const rawAddr = addrMatch ? addrMatch[1].trim() : '';
    const parts = rawAddr.split(',').map(p => p.trim());
    const detectedCountry = COUNTRY_NAME_MAP[parts[0]?.toLowerCase()] ?? 'AL';
    if (detectedCountry !== 'AL') return null;
    const prices = parsePrices(html);
    if (!prices.length) return null;
    return {
      externalId: `AL-${id}`, name: nameMatch ? nameMatch[1].trim() : `Station ${id}`,
      brand: null, lat: coords.lat, lng: coords.lng,
      address: rawAddr || null, city: parts.slice(1).join(', ').trim() || parts[0] || '',
      country: 'AL', prices,
    };
  } catch { return null; }
}

async function fetchAlbaniaStations() {
  const stationIdMap = new Map();
  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP)
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP)
      cells.push({ latMin: +lat.toFixed(2), latMax: +(lat + GRID_STEP).toFixed(2), lngMin: +lng.toFixed(2), lngMax: +(lng + GRID_STEP).toFixed(2) });
  let done = 0;
  await runConcurrent(cells, async (c) => {
    await fetchCell(c.latMin, c.latMax, c.lngMin, c.lngMax, stationIdMap);
    if (++done % 20 === 0) console.log(`[albania] Phase 1: ${done}/${cells.length} cells, ${stationIdMap.size} stations`);
  });
  console.log(`[albania] Phase 1 done — ${stationIdMap.size} unique station IDs`);
  const stations = [];
  const ids = [...stationIdMap.entries()];
  let i = 0;
  await runConcurrent(ids, async ([id, coords]) => {
    const s = await fetchDetail(id, coords);
    if (s) stations.push(s);
    if (++i % 50 === 0) console.log(`[albania] Phase 2: ${i}/${ids.length}, ${stations.length} AL stations`);
  });
  console.log(`[albania] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchAlbaniaStations };
