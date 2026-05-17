// Germany fuel prices via creativecommons.tankerkoenig.de (official MTS-K data) — CC BY 4.0
// list.php returns { ok, stations: [{id, name, brand, street, houseNumber, place, lat, lng, price, ...}] }
// Three passes per grid scan (diesel / e5 / e10).

const API_BASE = 'https://creativecommons.tankerkoenig.de/json/list.php';
const API_KEY = process.env.TANKERKOENIG_API_KEY || '00000000-0000-0000-0000-000000000002';
const RADIUS = 15;
const GRID_STEP = 0.18;
const BOUNDS = { latMin: 47.2, latMax: 55.1, lngMin: 5.9, lngMax: 15.2 };
const CONCURRENCY = 8;

const FUEL_TYPES = [
  { type: 'diesel', ft: 'diesel' },
  { type: 'e5',     ft: 'sp95'   },
  { type: 'e10',    ft: 'e10'    },
];

async function fetchCell(lat, lng, type, ft, stationMap) {
  const url = `${API_BASE}?lat=${lat}&lng=${lng}&rad=${RADIUS}&sort=dist&type=${type}&apikey=${API_KEY}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) { if (stationMap.size === 0) console.log(`[tankerkoenig] HTTP ${res.status} for first cell`); return; }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { if (stationMap.size === 0) console.log(`[tankerkoenig] JSON parse failed, response starts: ${text.slice(0, 120)}`); return; }
    if (stationMap.size === 0) console.log(`[tankerkoenig] first cell: ok=${data.ok} stations=${data.stations?.length ?? 'N/A'} msg=${data.message || data.status || ''}`);
    if (!data.ok || !Array.isArray(data.stations)) return;
    for (const s of data.stations) {
      if (!s.id) continue;
      const price = parseFloat(s.price);
      if (!price || price <= 0) continue;
      if (!stationMap.has(s.id)) {
        stationMap.set(s.id, {
          externalId: `DE-${s.id}`,
          name: (s.brand || s.name || `Station ${s.id}`).trim(),
          brand: s.brand?.trim() || null,
          lat: parseFloat(s.lat),
          lng: parseFloat(s.lng),
          address: [s.street, s.houseNumber].filter(Boolean).join(' ') || null,
          city: s.place || '',
          country: 'DE',
          prices: [],
        });
      }
      const station = stationMap.get(s.id);
      if (!station.prices.find(p => p.fuelType === ft)) {
        station.prices.push({ fuelType: ft, price: +price.toFixed(3) });
      }
    }
  } catch { /* skip cell */ }
}

async function fetchGermanyStations() {
  const stationMap = new Map();
  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP)
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP)
      cells.push({ lat: +(lat + GRID_STEP / 2).toFixed(3), lng: +(lng + GRID_STEP / 2).toFixed(3) });

  for (const { type, ft } of FUEL_TYPES) {
    let done = 0;
    for (let i = 0; i < cells.length; i += CONCURRENCY) {
      await Promise.all(cells.slice(i, i + CONCURRENCY).map(c => fetchCell(c.lat, c.lng, type, ft, stationMap)));
      done += Math.min(CONCURRENCY, cells.length - i);
      if (done % 48 === 0) console.log(`[tankerkoenig] ${type}: ${done}/${cells.length} cells, ${stationMap.size} stations`);
    }
    console.log(`[tankerkoenig] ${type} pass done — ${stationMap.size} stations`);
  }

  const stations = [...stationMap.values()].filter(s => s.prices.length > 0);
  console.log(`[tankerkoenig] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchGermanyStations };
