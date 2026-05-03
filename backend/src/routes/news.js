const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// GET /api/news — stations with price changes >3% in last 24h
router.get('/', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentHistory = await prisma.priceHistory.findMany({
      where: { recordedAt: { gte: since } },
      include: { station: true },
      orderBy: { recordedAt: 'desc' },
    });

    const changes = [];
    const seen = new Set();

    for (const record of recentHistory) {
      const key = `${record.stationId}-${record.fuelType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const previous = await prisma.priceHistory.findFirst({
        where: { stationId: record.stationId, fuelType: record.fuelType, recordedAt: { lt: record.recordedAt } },
        orderBy: { recordedAt: 'desc' },
      });

      if (!previous) continue;
      const changePct = ((record.price - previous.price) / previous.price) * 100;
      if (Math.abs(changePct) >= 3) {
        changes.push({
          station: { id: record.station.id, name: record.station.name, city: record.station.city },
          fuelType: record.fuelType,
          oldPrice: previous.price,
          newPrice: record.price,
          changePct: Math.round(changePct * 10) / 10,
          recordedAt: record.recordedAt,
        });
      }
    }

    res.json(changes.slice(0, 50));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

module.exports = router;
