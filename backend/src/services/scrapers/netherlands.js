// Netherlands fuel prices via brandstof-zoeker.nl — coordinate-based, no auth needed
// Grid-scans NL with 4 fuel types; deduplicates by station ID then combines prices.

const FUEL_TYPES = [
  { param: 'diesel',  db: 'diesel' },
  { param: 'euro95',  db: 'sp95' },
  { param: 'euro98',  db: 'sp98' },
  { param: 'lpg',     db: 'lpg' },
];
const GRID_STEP = 0.2;
const RADIUS = 0.098;
const BOUNDS = { latMin: 50.75, latMax: 53.60, lngMin: 3.35, lngMax: 7.23 };
const BASE = 'https://www.brandstof-zoeker.nl/ajax/stations/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function runConcurrent(items, fn, concurrency = 15) {
  for (let i = 0; i < items.length; i += concurrency)
    await Promise.all(items.slice(i, i + concurrency).map(fn));
}

async function fetchCell(lat, lng, fuelParam, priceMap) {
  const url = `${BASE}?pageType=geo%2FpostalCode&type=${fuelParam}&latitude=${lat}&longitude=${lng}&radius=${RADIUS}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    for (const item of data) {
      const sid = item.station?.id;
      const price = parseFloat(item.fuelPrice?.prijs);
      if (!sid || isNaN(price) || price <= 0) continue;
      if (!priceMap.has(sid)) {
        priceMap.set(sid, {
          id: sid,
          name: item.station.chain || item.station.naam || `Station ${sid}`,
          brand: item.station.chain || null,
          lat: item.station.latitude,
          lng: item.station.longitude,
          address: item.station.adres || null,
          city: item.station.plaats || item.station.naam || '',
          price,
        });
      }
    }
  } catch { /* skip */ }
}

async function fetchNLStations() {
  const cells = [];
  for (let lat = BOUNDS.latMin; lat < BOUNDS.latMax; lat += GRID_STEP)
    for (let lng = BOUNDS.lngMin; lng < BOUNDS.lngMax; lng += GRID_STEP)
      cells.push({ lat: +(lat + GRID_STEP / 2).toFixed(4), lng: +(lng + GRID_STEP / 2).toFixed(4) });

  const stationPrices = new Map(); // id → { ...stationData, prices: [{fuelType, price}] }

  for (const { param, db } of FUEL_TYPES) {
    const priceMap = new Map();
    let done = 0;
    await runConcurrent(cells, async (c) => {
      await fetchCell(c.lat, c.lng, param, priceMap);
      done++;
      if (done % 50 === 0) console.log(`[netherlands] ${param}: ${done}/${cells.length} cells, ${priceMap.size} stations`);
    });
    console.log(`[netherlands] ${param} done — ${priceMap.size} stations`);

    for (const [sid, info] of priceMap) {
      if (!stationPrices.has(sid)) {
        stationPrices.set(sid, {
          externalId: `NL-${sid}`,
          name: info.name,
          brand: info.brand,
          lat: info.lat,
          lng: info.lng,
          address: info.address,
          city: info.city,
          country: 'NL',
          prices: [],
        });
      }
      stationPrices.get(sid).prices.push({ fuelType: db, price: info.price });
    }
  }

  const stations = [...stationPrices.values()].filter(s => s.prices.length > 0);
  console.log(`[netherlands] Done — ${stations.length} stations`);
  return stations;
}

module.exports = { fetchNLStations };
