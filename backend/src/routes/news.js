const express = require('express');
const { Prisma } = require('@prisma/client');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/news — stations with significant price moves in the last 24h.
// One set-based query (DISTINCT ON + LATERAL previous-price lookup) instead of
// per-pair round trips to Neon — ~64k pairs/day made the old N+1 version hang
// for 30+ minutes. Changes outside 3–25% are dropped: below is noise, above is
// almost always a source-side data correction, not a real overnight move.
// Price sanity bounds match bulkUpsertStations (0.15–3.5 EUR/L).
//
// Optional scope filters: ?country=FR (ISO-2) and/or ?city=Paris (prefix,
// case-insensitive). Each scope is cached separately for 10 minutes.
const NEWS_TTL = 10 * 60 * 1000;
const NEWS_CACHE_MAX = 200;
const newsCache = new Map(); // "country|city" -> { data, expiresAt }

function cacheGet(map, key) {
  const hit = map.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  if (hit) map.delete(key);
  return null;
}

function cacheSet(map, key, data, ttl, max) {
  if (map.size >= max) map.delete(map.keys().next().value); // evict oldest insert
  map.set(key, { data, expiresAt: Date.now() + ttl });
}

// Escape LIKE wildcards in user input so "10%_" can't widen a prefix match.
function likePrefix(s) {
  return s.replace(/([\\%_])/g, '\\$1') + '%';
}

router.get('/', async (req, res) => {
  const country = /^[A-Za-z]{2}$/.test(req.query.country || '') ? req.query.country.toUpperCase() : null;
  const city = (req.query.city || '').trim().slice(0, 80) || null;
  const key = `${country || ''}|${(city || '').toLowerCase()}`;

  const cached = cacheGet(newsCache, key);
  if (cached) return res.json(cached);

  try {
    const countryFilter = country ? Prisma.sql`AND s.country = ${country}` : Prisma.empty;
    const cityFilter = city ? Prisma.sql`AND s.city ILIKE ${likePrefix(city)}` : Prisma.empty;
    const rows = await prisma.$queryRaw`
      SELECT cur."stationId", cur."fuelType", cur.price AS "newPrice", cur."recordedAt",
             prev.price AS "oldPrice",
             s.name, s.city, s.country,
             ROUND(((cur.price - prev.price) / prev.price * 100)::numeric, 1)::float AS "changePct"
      FROM (
        SELECT DISTINCT ON ("stationId", "fuelType") "stationId", "fuelType", price, "recordedAt"
        FROM "PriceHistory"
        WHERE "recordedAt" >= NOW() - interval '24 hours'
        ORDER BY "stationId", "fuelType", "recordedAt" DESC
      ) cur
      JOIN LATERAL (
        SELECT price FROM "PriceHistory" p
        WHERE p."stationId" = cur."stationId" AND p."fuelType" = cur."fuelType"
          AND p."recordedAt" < cur."recordedAt"
        ORDER BY p."recordedAt" DESC
        LIMIT 1
      ) prev ON TRUE
      JOIN "Station" s ON s.id = cur."stationId"
      WHERE prev.price > 0
        AND ABS(cur.price - prev.price) / prev.price BETWEEN 0.03 AND 0.25
        AND cur.price BETWEEN 0.15 AND 3.5
        AND prev.price BETWEEN 0.15 AND 3.5
        ${countryFilter}
        ${cityFilter}
      ORDER BY ABS(cur.price - prev.price) / prev.price DESC
      LIMIT 50`;

    const changes = rows.map(r => ({
      station: { id: r.stationId, name: r.name, city: r.city, country: r.country },
      fuelType: r.fuelType,
      oldPrice: r.oldPrice,
      newPrice: r.newPrice,
      changePct: r.changePct,
      recordedAt: r.recordedAt,
    }));
    cacheSet(newsCache, key, changes, NEWS_TTL, NEWS_CACHE_MAX);
    res.json(changes);
  } catch (err) {
    console.error('[news]', err.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/news/places?q=par — city typeahead for the news search bar.
// Real cities from the Station table (so a match always has stations behind
// it), biggest first. Countries are matched client-side from COUNTRY_NAMES.
const PLACES_TTL = 60 * 60 * 1000;
const PLACES_CACHE_MAX = 500;
const placesCache = new Map(); // lowercased q -> { data, expiresAt }

router.get('/places', async (req, res) => {
  const q = (req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return res.json([]);
  const key = q.toLowerCase();

  const cached = cacheGet(placesCache, key);
  if (cached) return res.json(cached);

  try {
    const rows = await prisma.$queryRaw`
      SELECT city, country, COUNT(*)::int AS stations
      FROM "Station"
      WHERE city IS NOT NULL AND city ILIKE ${likePrefix(q)}
      GROUP BY city, country
      ORDER BY stations DESC
      LIMIT 6`;
    cacheSet(placesCache, key, rows, PLACES_TTL, PLACES_CACHE_MAX);
    res.json(rows);
  } catch (err) {
    console.error('[news/places]', err.message);
    res.status(500).json({ error: 'Failed to fetch places' });
  }
});

module.exports = router;
