const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/news — stations with significant price moves in the last 24h.
// One set-based query (DISTINCT ON + LATERAL previous-price lookup) instead of
// per-pair round trips to Neon — ~64k pairs/day made the old N+1 version hang
// for 30+ minutes. Changes outside 3–25% are dropped: below is noise, above is
// almost always a source-side data correction, not a real overnight move.
// Price sanity bounds match bulkUpsertStations (0.15–3.5 EUR/L).
let newsCache = { data: null, expiresAt: 0 };

router.get('/', async (req, res) => {
  if (newsCache.data && newsCache.expiresAt > Date.now()) return res.json(newsCache.data);
  try {
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
    newsCache = { data: changes, expiresAt: Date.now() + 10 * 60 * 1000 };
    res.json(changes);
  } catch (err) {
    console.error('[news]', err.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

module.exports = router;
