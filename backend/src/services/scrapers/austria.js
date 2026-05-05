const BASE = 'https://api.e-control.at/sprit/1.0/search/gas-stations/by-address';

const FUEL_MAP = {
  DIE: 'diesel',
  SUP: 'sp95',
  GAS: 'lpg',
};

// Austria bounding box — 0.3° grid ≈ 33km spacing, ~240 points × 3 fuels = ~720 requests
const LAT_MIN = 46.4, LAT_MAX = 49.0, LAT_STEP = 0.3;
const LNG_MIN =  9.5, LNG_MAX = 17.5, LNG_STEP = 0.3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchGrid(lat, lng, fuelType, stationMap) {
  const url = `${BASE}?latitude=${lat}&longitude=${lng}&fuelType=${fuelType}&includeClosed=false`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Gasify/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return;
    const stations = await res.json();
    if (!Array.isArray(stations)) return;

    for (const s of stations) {
      if (!s.location?.latitude || !s.location?.longitude) continue;

      if (!stationMap.has(s.id)) {
        stationMap.set(s.id, {
          externalId: `AT-${s.id}`,
          name: s.name,
          brand: s.name,
          lat: s.location.latitude,
          lng: s.location.longitude,
          address: s.location.address || null,
          city: s.location.city || '',
          country: 'AT',
          prices: {},
        });
      }

      for (const p of s.prices || []) {
        const ft = FUEL_MAP[p.fuelType];
        if (ft && p.amount > 0) {
          stationMap.get(s.id).prices[ft] = p.amount;
        }
      }
    }
  } catch {
    // network error on single grid point — skip silently
  }
}

async function fetchAustriaStations() {
  const stationMap = new Map();

  const latPoints = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX + 0.001; lat += LAT_STEP) latPoints.push(+lat.toFixed(1));

  const lngPoints = [];
  for (let lng = LNG_MIN; lng <= LNG_MAX + 0.001; lng += LNG_STEP) lngPoints.push(+lng.toFixed(1));

  const fuelTypes = Object.keys(FUEL_MAP);
  const total = latPoints.length * lngPoints.length * fuelTypes.length;
  let done = 0;

  for (const lat of latPoints) {
    for (const lng of lngPoints) {
      for (const ft of fuelTypes) {
        await fetchGrid(lat, lng, ft, stationMap);
        done++;
        if (done % 100 === 0) console.log(`[austria] ${done}/${total} grid requests done, ${stationMap.size} unique stations`);
        await sleep(50);
      }
    }
  }

  console.log(`[austria] Done — ${stationMap.size} unique stations`);

  return [...stationMap.values()]
    .filter(s => Object.keys(s.prices).length > 0)
    .map(s => ({
      ...s,
      prices: Object.entries(s.prices).map(([fuelType, price]) => ({ fuelType, price })),
    }));
}

module.exports = { fetchAustriaStations };
