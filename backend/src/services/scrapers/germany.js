// Tankerkönig (MTS-K) — official German fuel price dataset, Creative Commons CC BY 4.0
// Free API key: https://creativecommons.tankerkoenig.de/
// Set TANKERKOENIG_API_KEY in .env

const BASE = 'https://creativecommons.tankerkoenig.de/json/list.php';

const FUEL_MAP = {
  diesel: 'diesel',
  e5:     'sp95',   // Super E5 = 95-octane unleaded
  e10:    'e10',
};

// Germany bounding box; 0.5° step ≈ 55 km — 25 km radius covers the gaps
const LAT_MIN = 47.3, LAT_MAX = 55.1, LAT_STEP = 0.5;
const LNG_MIN =  5.9, LNG_MAX = 15.1, LNG_STEP = 0.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchGermanyStations() {
  const apiKey = process.env.TANKERKOENIG_API_KEY;
  if (!apiKey) {
    console.warn('[germany] TANKERKOENIG_API_KEY not set — skipping');
    return [];
  }

  const stationMap = new Map();

  const latPoints = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX + 0.001; lat += LAT_STEP) latPoints.push(+lat.toFixed(1));
  const lngPoints = [];
  for (let lng = LNG_MIN; lng <= LNG_MAX + 0.001; lng += LNG_STEP) lngPoints.push(+lng.toFixed(1));

  const total = latPoints.length * lngPoints.length;
  let done = 0;

  for (const lat of latPoints) {
    for (const lng of lngPoints) {
      try {
        const url = `${BASE}?lat=${lat}&lng=${lng}&rad=25&sort=dist&type=all&apikey=${apiKey}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Gasify/1.0 (teo.karov@gmail.com)' },
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) { await sleep(2000); continue; }
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.stations)) continue;

        for (const s of data.stations) {
          if (stationMap.has(s.id)) continue;
          const prices = [];
          for (const [key, ft] of Object.entries(FUEL_MAP)) {
            const val = s[key];
            if (typeof val === 'number' && val > 0) prices.push({ fuelType: ft, price: val });
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
      } catch { /* skip single grid point on network error */ }

      done++;
      if (done % 50 === 0) console.log(`[germany] ${done}/${total} grid points, ${stationMap.size} stations`);
      await sleep(500);
    }
  }

  console.log(`[germany] Done — ${stationMap.size} unique stations`);
  return [...stationMap.values()];
}

module.exports = { fetchGermanyStations };
