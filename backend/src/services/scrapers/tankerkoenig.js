// Germany fuel prices via Tankerkönig (official MTS-K data) — CC BY 4.0, no registration
// Grid-scans DE with 50km radius cells; deduplicates by station UUID

const API_BASE = 'https://creativecommons.tankerkoenig.de/json/list.php';
const API_KEY = process.env.TANKERKOENIG_API_KEY || '00000000-0000-0000-0000-000000000002';
const RADIUS = 15; // km — small enough that even dense cities stay under the 350-station API cap
const GRID_STEP = 0.18; // degrees (~20km) — slight overlap with 15km radius circles
const BOUNDS = { latMin: 47.2, latMax: 55.1, lngMin: 5.9, lngMax: 15.2 };
const CONCURRENCY = 12;

async function fetchCell(lat, lng, stationMap) {
  const url = `${API_BASE}?lat=${lat}&lng=${lng}&rad=${RADIUS}&sort=dist&type=all&apikey=${API_KEY}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Gasify/1.0)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    for (const s of (data.stations || [])) {
      if (!s.id || stationMap.has(s.id)) continue;
      const prices = [];
      for (const [key, ft] of [['diesel', 'diesel'], ['e5', 'sp95'], ['e10', 'e10']]) {
        const p = s[key];
        if (p && typeof p === 'number' && p > 0) prices.push({ fuelType: ft, price: +p.toFixed(3) });
      }
      if (!prices.length) continue;
      stationMap.set(s.id, {
        externalId: `DE-${s.id}`,
        name: s.name || s.brand || `Station ${s.id}`,
        brand: s.brand || null,
        lat: s.lat,
        lng: s.lng,
        address: [s.street, s.houseNumber].filter(Boolean).join(' ') || null,
        city: s.place || '',
        country: 'DE',
        prices,
      });
    }
  } catch { /* skip cell */ }
}

async function fetchGermanyStations() {
  const stationMap = new Map();
  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP)
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP)
      cells.push({ lat: +(lat + GRID_STEP / 2).toFixed(3), lng: +(lng + GRID_STEP / 2).toFixed(3) });

  let done = 0;
  for (let i = 0; i < cells.length; i += CONCURRENCY) {
    await Promise.all(cells.slice(i, i + CONCURRENCY).map(c => fetchCell(c.lat, c.lng, stationMap)));
    done += Math.min(CONCURRENCY, cells.length - i);
    if (done % 24 === 0) console.log(`[tankerkoenig] ${done}/${cells.length} cells, ${stationMap.size} stations`);
  }
  const stations = [...stationMap.values()];
  console.log(`[tankerkoenig] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchGermanyStations };
