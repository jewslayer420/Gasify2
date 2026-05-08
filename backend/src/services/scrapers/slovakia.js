// Slovakia fuel prices via fuelo.net public AJAX endpoints — no API key needed
// Phase 1: grid POST to get station IDs + coords
// Phase 2: GET per station for prices (HTML in JSON envelope)
// Slovakia uses EUR — no currency conversion needed

const PHASE1_URL = 'https://sk.fuelo.net/ajax/get_gasstations_within_bounds_mysql_clustering';
const PHASE2_BASE = 'https://sk.fuelo.net/ajax/get_infowindow_content';
const GRID_STEP = 0.3;
const BOUNDS = { latMin: 47.73, latMax: 49.61, lngMin: 16.83, lngMax: 22.57 };


async function runConcurrent(items, fn, concurrency = 10) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

function mapFuelType(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.includes('lpg') || n.includes('autogas') || n.includes('autoplyn')) return 'lpg';
  if (n.includes('cng') || n.includes('gnv')) return 'cng';
  if (n.includes('e10')) return 'e10';
  const isDiesel = n.includes('diesel') || n.includes('nafta') || n.includes('gazole');
  const isPremium = n.includes('premium') || n.includes('verva') || n.includes('plus') || n.includes('ultimate') || n.includes('v-power');
  if (isDiesel && isPremium) return 'diesel_premium';
  if (isDiesel) return 'diesel';
  if (n.includes('98') || n.includes('100') || n.includes('102')) return 'sp98';
  if (n.includes('95') || n.includes('unleaded') || n.includes('natural') || n.includes('benzin') || n.includes('super') || n.includes('e5')) return 'sp95';
  return null;
}

function parsePrices(html) {
  const prices = [];
  const regex = /title="([^:]+):\s*([\d.,]+)\s*([A-Z]+)\/l/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const ft = mapFuelType(m[1]);
    const raw = parseFloat(m[2].replace(',', '.'));
    if (!ft || isNaN(raw) || raw <= 0) continue;
    const cur = m[3].toUpperCase();
    const price = cur === 'CZK' ? +(raw / 25).toFixed(3)
                : cur === 'HUF' ? +(raw / 400).toFixed(3)
                : +raw.toFixed(3);
    if (price > 0) prices.push({ fuelType: ft, price });
  }
  return prices;
}

async function fetchCell(latMin, latMax, lngMin, lngMax, stationIdMap) {
  const body = `lat_min=${latMin}&lat_max=${latMax}&lon_min=${lngMin}&lon_max=${lngMax}&zoom=14`;
  try {
    const res = await fetch(PHASE1_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)',
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return;
    const data = await res.json();
    for (const s of (data.gasstations || [])) {
      const id = String(s.id ?? '');
      if (!id || stationIdMap.has(id)) continue;
      const lat = parseFloat(s.lat);
      const lng = parseFloat(s.lon ?? s.lng);
      if (!isNaN(lat) && !isNaN(lng)) stationIdMap.set(id, { lat, lng });
    }
  } catch { /* skip cell */ }
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

    const prices = parsePrices(html);
    if (!prices.length) return null;

    return {
      externalId: `SK-${id}`,
      name: nameMatch ? nameMatch[1].trim() : `Station ${id}`,
      brand: null,
      lat: coords.lat, lng: coords.lng,
      address: rawAddr || null,
      city: rawAddr ? (rawAddr.split(',')[0] || '').trim() : '',
      country: 'SK',
      prices,
    };
  } catch { return null; }
}

async function fetchSlovakiaStations() {
  const stationIdMap = new Map();

  // Phase 1: collect station IDs via grid
  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP) {
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP) {
      cells.push({
        latMin: +lat.toFixed(2), latMax: +(lat + GRID_STEP).toFixed(2),
        lngMin: +lng.toFixed(2), lngMax: +(lng + GRID_STEP).toFixed(2),
      });
    }
  }

  let done = 0;
  await runConcurrent(cells, async (c) => {
    await fetchCell(c.latMin, c.latMax, c.lngMin, c.lngMax, stationIdMap);
    done++;
    if (done % 20 === 0) console.log(`[slovakia] Phase 1: ${done}/${cells.length} cells, ${stationIdMap.size} stations`);
  });
  console.log(`[slovakia] Phase 1 done — ${stationIdMap.size} unique station IDs`);

  // Phase 2: fetch prices for each station
  const stations = [];
  const ids = [...stationIdMap.entries()];
  let i = 0;
  await runConcurrent(ids, async ([id, coords]) => {
    const s = await fetchDetail(id, coords);
    if (s) stations.push(s);
    i++;
    if (i % 100 === 0) console.log(`[slovakia] Phase 2: ${i}/${ids.length}, ${stations.length} with prices`);
  });

  console.log(`[slovakia] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchSlovakiaStations };
