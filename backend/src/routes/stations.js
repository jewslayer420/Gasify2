const express = require('express');
const zlib = require('zlib');
const router = express.Router();
const { geocodeCity } = require('../utils/geo');
const prisma = require('../lib/prisma');

// In-memory GeoJSON cache — keyed by fuel type. Stores the *gzipped* buffer
// (~10-15MB each) rather than the raw ~60MB string, so all fuels cached cost
// tens of MB instead of hundreds. Expires after 10 minutes.
const geojsonCache = new Map();   // fuel -> { gz: Buffer, count, expiresAt }
const geojsonInflight = new Map(); // fuel -> Promise<Buffer>  (dedupe same-fuel builds)
let geojsonBuildGate = Promise.resolve(); // serialize ALL builds so two fuels can't build at once

// GET /api/stations/geocode?city=Koper  — must be before /:id
router.get('/geocode', async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return res.status(400).json({ error: 'city required' });
    const result = await geocodeCity(city);
    if (!result) return res.status(404).json({ error: 'City not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Geocode failed' });
  }
});

// GET /api/stations/counts  — total station count per country (no fuel filter)
router.get('/counts', async (req, res) => {
  try {
    const rows = await prisma.station.groupBy({
      by: ['country'],
      _count: { id: true },
    });
    const result = {};
    for (const row of rows) result[row.country] = row._count.id;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/stations/country-meta?fuel=diesel — per-country league/lens data:
// station count, median price for the fuel (sanity-bounded), offered fuel types.
const VALID_FUELS = ['diesel', 'diesel_premium', 'sp95', 'sp98', 'sp100', 'e10', 'lpg', 'cng'];
const countryMetaCache = new Map(); // fuel -> { data, expiresAt }
router.get('/country-meta', async (req, res) => {
  const fuel = req.query.fuel || 'diesel';
  if (!VALID_FUELS.includes(fuel)) return res.status(400).json({ error: 'Unknown fuel' });
  const cached = countryMetaCache.get(fuel);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);
  try {
    const rows = await prisma.$queryRaw`
      SELECT s.country,
        COUNT(DISTINCT s.id)::int AS stations,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY fp.price)
          FILTER (WHERE fp."fuelType" = ${fuel} AND fp.price >= 0.15 AND fp.price <= 3.5) AS median,
        ARRAY_AGG(DISTINCT fp."fuelType") AS fuels
      FROM "Station" s JOIN "FuelPrice" fp ON fp."stationId" = s.id
      GROUP BY s.country`;
    const data = rows.map(r => ({
      country: r.country,
      stations: r.stations,
      median: r.median == null ? null : Math.round(Number(r.median) * 1000) / 1000,
      fuels: r.fuels,
    }));
    countryMetaCache.set(fuel, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json(data);
  } catch (err) {
    console.error('[country-meta]', err.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/stations/overview?fuel=diesel — world density grid for the map's
// low-zoom heatmap: one point per 0.3° cell with w = station count. Replaces
// shipping all ~400k stations to the client (11MB gz) with ~a few hundred KB.
const overviewCache = new Map(); // fuel -> { data, expiresAt }
router.get('/overview', async (req, res) => {
  const fuel = req.query.fuel || 'diesel';
  if (!VALID_FUELS.includes(fuel)) return res.status(400).json({ error: 'Unknown fuel' });
  const cached = overviewCache.get(fuel);
  if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);
  try {
    const rows = await prisma.$queryRaw`
      SELECT ROUND((s.lat / 0.3)::numeric) * 0.3 AS glat,
             ROUND((s.lng / 0.3)::numeric) * 0.3 AS glng,
             COUNT(*)::int AS w
      FROM "Station" s
      JOIN "FuelPrice" fp ON fp."stationId" = s.id AND fp."fuelType" = ${fuel}
        AND fp.price >= 0.15 AND fp.price <= 3.5
      GROUP BY 1, 2`;
    const data = {
      type: 'FeatureCollection',
      features: rows.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [+Number(r.glng).toFixed(2), +Number(r.glat).toFixed(2)] },
        properties: { w: r.w },
      })),
    };
    overviewCache.set(fuel, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json(data);
  } catch (err) {
    console.error('[overview]', err.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/stations/sync-health — public read-only sync freshness per country.
// Consumed by the cloud sync-sentinel routine (which has no DB access) and safe
// to expose: country codes, timestamps and thresholds only — no user data.
let syncHealthCache = null; // { data, expiresAt }
router.get('/sync-health', async (req, res) => {
  if (syncHealthCache && syncHealthCache.expiresAt > Date.now()) return res.json(syncHealthCache.data);
  try {
    const { computeStaleness, thresholdHoursFor } = require('../services/freshness_monitor');
    const { priceFreshness } = require('../services/price_freshness');
    const [{ stale, dbOk, error }, rows, syncRows] = await Promise.all([
      computeStaleness(prisma),
      prisma.$queryRaw`
        SELECT s.country, COUNT(DISTINCT s.id)::int AS stations, MAX(fp."updatedAt") AS "freshestPrice"
        FROM "Station" s LEFT JOIN "FuelPrice" fp ON fp."stationId" = s.id
        GROUP BY s.country ORDER BY s.country`,
      prisma.countrySyncStatus.findMany(),
    ]);
    if (!dbOk) return res.status(500).json({ error });
    const syncByCc = Object.fromEntries(syncRows.map(s => [s.country, s]));
    const manualByCc = Object.fromEntries(priceFreshness().map(m => [m.cc, m]));
    const data = {
      generatedAt: new Date().toISOString(),
      healthy: stale.length === 0,
      stale,
      countries: rows.map(r => ({
        country: r.country,
        stations: r.stations,
        freshestPrice: r.freshestPrice,
        lastSyncAt: syncByCc[r.country]?.lastSyncAt ?? null,
        fetched: syncByCc[r.country]?.fetched ?? null,
        thresholdHours: thresholdHoursFor(r.country),
        manual: manualByCc[r.country]
          ? { asOf: manualByCc[r.country].asOf, ageDays: manualByCc[r.country].ageDays, staleAfterDays: manualByCc[r.country].staleAfterDays }
          : null,
      })),
    };
    syncHealthCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
    res.json(data);
  } catch (err) {
    console.error('[sync-health]', err.message);
    res.status(500).json({ error: 'Failed' });
  }
});

const GEOJSON_CHUNK = 20000; // rows per DB page — bounds peak memory

// Build the whole-world GeoJSON for a fuel type without ever holding the full
// payload in memory. Rows are pulled in keyset-paginated chunks and piped
// straight into a gzip stream; only one chunk (~4MB) plus the growing gzipped
// output (~12MB) is resident at once. At 327k stations this peaks ~150MB RSS
// instead of the 561MB the old all-at-once build hit (which OOM-killed 512MB).
async function buildGeojsonGz(fuel) {
  const gzip = zlib.createGzip();
  const out = [];
  gzip.on('data', (d) => out.push(d));
  const finished = new Promise((resolve, reject) => {
    gzip.on('end', resolve);
    gzip.on('error', reject);
  });

  gzip.write('{"type":"FeatureCollection","features":[');
  let first = true;
  let cursor = '';
  let total = 0;
  for (;;) {
    // Keyset pagination on the Station PK (cuid text) — stable, index-friendly.
    const rows = await prisma.$queryRaw`
      SELECT s.id, s.lat, s.lng, s.name, s.city, s.country, fp.price
      FROM "Station" s
      INNER JOIN "FuelPrice" fp ON fp."stationId" = s.id AND fp."fuelType" = ${fuel}
        AND fp.price >= 0.15 AND fp.price <= 3.5  -- sanity bounds; junk survives stale deployers
      WHERE s.id > ${cursor}
      ORDER BY s.id ASC
      LIMIT ${GEOJSON_CHUNK}
    `;
    if (rows.length === 0) break;
    let buf = '';
    for (const s of rows) {
      buf += (first ? '' : ',') + JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [+Number(s.lng).toFixed(5), +Number(s.lat).toFixed(5)] },
        properties: { id: s.id, name: s.name, city: s.city, country: s.country, price: Number(s.price) },
      });
      first = false;
    }
    gzip.write(buf);
    cursor = rows[rows.length - 1].id;
    total += rows.length;
    if (rows.length < GEOJSON_CHUNK) break;
  }
  gzip.write(']}');
  gzip.end();
  await finished;

  const gz = Buffer.concat(out);
  geojsonCache.set(fuel, { gz, count: total, expiresAt: Date.now() + 10 * 60 * 1000 });
  console.log(`[geojson] cached ${fuel}: ${total} stations, gz ${(gz.length / 1048576).toFixed(1)}MB`);
  return gz;
}

// Dedupe + serialize builds. Same-fuel requests share one in-flight build;
// across fuels, builds run strictly one at a time (chained on geojsonBuildGate)
// so concurrent map loads of different fuels can't stack two 300k scans and
// blow past 512MB. Each waiter re-checks the cache in case it was just built.
function getGeojsonGz(fuel) {
  if (geojsonInflight.has(fuel)) return geojsonInflight.get(fuel);
  const p = geojsonBuildGate.then(() => {
    const cached = geojsonCache.get(fuel);
    if (cached && cached.expiresAt > Date.now()) return cached.gz;
    return buildGeojsonGz(fuel);
  }).finally(() => geojsonInflight.delete(fuel));
  geojsonInflight.set(fuel, p);
  geojsonBuildGate = p.catch(() => {}); // next build waits for this one; swallow errors in the chain
  return p;
}

// GET /api/stations/geojson?fuel=diesel&bust=1  — bust=1 forces cache rebuild
router.get('/geojson', async (req, res) => {
  const { fuel = 'diesel', bust } = req.query;
  const cached = geojsonCache.get(fuel);
  // Always gzipped — set Content-Encoding so the compression middleware skips it.
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Cache-Control', 'no-store');
  if (cached && cached.expiresAt > Date.now() && bust !== '1') {
    return res.end(cached.gz);
  }
  // bust=1 must actually force a rebuild: getGeojsonGz re-checks the cache
  // internally (for waiters), so a still-fresh entry has to be evicted first.
  if (bust === '1') geojsonCache.delete(fuel);
  try {
    const gz = await getGeojsonGz(fuel);
    res.end(gz);
  } catch (err) {
    console.error('[geojson] build failed:', err.message);
    res.removeHeader('Content-Encoding');
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/stations?fuel=diesel&lat=&lng=&bbox=minLat,minLng,maxLat,maxLng&near=1&city=Koper
router.get('/', async (req, res) => {
  try {
    const { fuel = 'diesel', lat, lng, bbox, near, city, zoom } = req.query;

    let userLat = lat ? parseFloat(lat) : null;
    let userLng = lng ? parseFloat(lng) : null;
    let stations;

    if (city) {
      const coords = await geocodeCity(city);
      if (!coords) return res.json([]);

      // Use Nominatim's bounding box if available, otherwise build one (±0.15° ≈ 15 km)
      let minLat, minLng, maxLat, maxLng;
      if (coords.boundingBox) {
        [minLat, maxLat, minLng, maxLng] = coords.boundingBox;
        // Clamp very large bounding boxes (country-level) to a city-sized area
        const latSpan = maxLat - minLat;
        const lngSpan = maxLng - minLng;
        if (latSpan > 0.6 || lngSpan > 0.9) {
          minLat = coords.lat - 0.15; maxLat = coords.lat + 0.15;
          minLng = coords.lng - 0.22; maxLng = coords.lng + 0.22;
        }
      } else {
        minLat = coords.lat - 0.15; maxLat = coords.lat + 0.15;
        minLng = coords.lng - 0.22; maxLng = coords.lng + 0.22;
      }

      stations = await prisma.station.findMany({
        where: {
          lat: { gte: minLat, lte: maxLat },
          lng: { gte: minLng, lte: maxLng },
          prices: { some: { fuelType: fuel, price: { gt: 0 } } },
        },
        include: { prices: true },
      });

      userLat = coords.lat;
      userLng = coords.lng;

      const result = stations
        .map(s => normalizeStation(s, fuel, userLat, userLng))
        .sort((a, b) => (a.price ?? 9) - (b.price ?? 9));
      return res.json(result);
    }

    if (bbox) {
      const [minLat, minLng, maxLat, maxLng] = bbox.split(',').map(Number);
      // Take tiers align with the client's zoomBand(): z≤7 feeds only the
      // sidebar (points invisible); z≤9 is the dot-field handover band where
      // spatial coverage matters most; z>9 viewports are small.
      const z = zoom ? parseInt(zoom) : 14;
      const take = z <= 7 ? 800 : z <= 9 ? 5000 : 2500;

      // Price-sorted so "cheapest in view" is correct at every zoom (findMany's
      // arbitrary take order surfaced random stations at low zoom). DB only —
      // the old live-Tankerkönig fill-in was decommissioned (dead key).
      const rows = await prisma.$queryRaw`
        SELECT s.id, s.name, s.brand, s.lat, s.lng, s.city, s.country,
               fp.price, fp."updatedAt" AS "priceUpdatedAt"
        FROM "Station" s
        JOIN "FuelPrice" fp ON fp."stationId" = s.id AND fp."fuelType" = ${fuel}
          AND fp.price >= 0.15 AND fp.price <= 3.5
        WHERE s.lat BETWEEN ${minLat} AND ${maxLat}
          AND s.lng BETWEEN ${minLng} AND ${maxLng}
        ORDER BY fp.price ASC
        LIMIT ${take}`;
      return res.json(rows.map(normalizeRaw));
    } else if (req.query.country) {
      // Country focus: cheapest 100 nationwide (viewport-independent).
      const cc = String(req.query.country).toUpperCase().slice(0, 2);
      const rows = await prisma.$queryRaw`
        SELECT s.id, s.name, s.brand, s.lat, s.lng, s.city, s.country,
               fp.price, fp."updatedAt" AS "priceUpdatedAt"
        FROM "Station" s
        JOIN "FuelPrice" fp ON fp."stationId" = s.id AND fp."fuelType" = ${fuel}
          AND fp.price >= 0.15 AND fp.price <= 3.5
        WHERE s.country = ${cc}
        ORDER BY fp.price ASC
        LIMIT 100`;
      return res.json(rows.map(normalizeRaw));
    } else if (near === '1' && userLat && userLng) {
      stations = await prisma.$queryRaw`
        SELECT s.*,
          (SELECT p.price FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} LIMIT 1) as price,
          (SELECT p."updatedAt" FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} LIMIT 1) as "priceUpdatedAt",
          SQRT(POW((s.lat - ${userLat}) * 111.32, 2) + POW((s.lng - ${userLng}) * 111.32 * COS(RADIANS(${userLat})), 2)) as distance
        FROM "Station" s
        WHERE EXISTS (SELECT 1 FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} AND p.price >= 0.15 AND p.price <= 3.5)
        ORDER BY distance ASC
        LIMIT 50
      `;
      return res.json(stations.map(normalizeRaw));
    } else {
      const prices = await prisma.fuelPrice.findMany({
        where: { fuelType: fuel, price: { gt: 0 } },
        orderBy: { price: 'asc' },
        take: 100,
        include: { station: { include: { prices: true } } },
      });
      stations = prices.map(p => p.station);
    }

    const result = stations.map(s => normalizeStation(s, fuel, userLat, userLng));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// GET /api/stations/:id
router.get('/:id', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { id: req.params.id },
      include: { prices: true },
    });
    if (!station) return res.status(404).json({ error: 'Not found' });
    res.json(normalizeStation(station, null, null, null));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch station' });
  }
});

// GET /api/stations/:id/history/:fuelType
router.get('/:id/history/:fuelType', async (req, res) => {
  try {
    const history = await prisma.priceHistory.findMany({
      where: { stationId: req.params.id, fuelType: req.params.fuelType },
      orderBy: { recordedAt: 'asc' },
      take: 30,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

function calcDistance(lat, lng, userLat, userLng) {
  const dx = (lat - userLat) * 111.32;
  const dy = (lng - userLng) * 111.32 * Math.cos((userLat * Math.PI) / 180);
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
}

function normalizeStation(station, fuel, userLat, userLng) {
  const allPrices = {};
  station.prices?.forEach(p => { allPrices[p.fuelType] = p.price; });

  const distance = (userLat && userLng) ? calcDistance(station.lat, station.lng, userLat, userLng) : null;

  return {
    id: station.id,
    name: station.name,
    brand: station.brand,
    lat: station.lat,
    lng: station.lng,
    city: station.city,
    country: station.country,
    price: fuel ? allPrices[fuel] ?? null : null,
    distance,
    allPrices,
    updatedAt: station.updatedAt,
  };
}

function normalizeRaw(s) {
  return {
    id: s.id,
    name: s.name,
    brand: s.brand,
    lat: parseFloat(s.lat),
    lng: parseFloat(s.lng),
    city: s.city,
    country: s.country,
    price: s.price ? parseFloat(s.price) : null,
    distance: s.distance ? Math.round(parseFloat(s.distance) * 10) / 10 : null,
    allPrices: {},
    updatedAt: s.priceUpdatedAt,
  };
}

module.exports = router;
