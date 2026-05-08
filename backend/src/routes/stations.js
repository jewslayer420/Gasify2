const express = require('express');
const router = express.Router();
const { geocodeCity } = require('../utils/geo');
const prisma = require('../lib/prisma');

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
      const z = zoom ? parseInt(zoom) : 14;
      const take = z <= 8 ? 500 : z <= 10 ? 800 : z <= 12 ? 1200 : 2000;
      stations = await prisma.station.findMany({
        where: {
          lat: { gte: minLat, lte: maxLat },
          lng: { gte: minLng, lte: maxLng },
          prices: { some: { fuelType: fuel, price: { gt: 0 } } },
        },
        include: { prices: true },
        take,
      });
    } else if (near === '1' && userLat && userLng) {
      stations = await prisma.$queryRaw`
        SELECT s.*,
          (SELECT p.price FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} LIMIT 1) as price,
          (SELECT p."updatedAt" FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} LIMIT 1) as "priceUpdatedAt",
          SQRT(POW((s.lat - ${userLat}) * 111.32, 2) + POW((s.lng - ${userLng}) * 111.32 * COS(RADIANS(${userLat})), 2)) as distance
        FROM "Station" s
        WHERE EXISTS (SELECT 1 FROM "FuelPrice" p WHERE p."stationId" = s.id AND p."fuelType" = ${fuel} AND p.price > 0)
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

function normalizeStation(station, fuel, userLat, userLng) {
  const allPrices = {};
  station.prices?.forEach(p => { allPrices[p.fuelType] = p.price; });

  let distance = null;
  if (userLat && userLng) {
    const dx = (station.lat - userLat) * 111.32;
    const dy = (station.lng - userLng) * 111.32 * Math.cos((userLat * Math.PI) / 180);
    distance = Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
  }

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
