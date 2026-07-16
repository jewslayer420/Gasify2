const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');
const prisma = require('../lib/prisma');

router.use(requireAuth, requireAdmin);

// GET /api/admin/overview — headline stats for the admin panel.
// Big append-only tables (FuelPrice, PriceHistory) use planner estimates from
// pg_class instead of COUNT(*) so this stays cheap as they grow.
router.get('/overview', async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [users, verified, twoFa, admins, newUsers, stations, countries, estimates] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { OR: [{ totpEnabled: true }, { emailTwoFactor: true }] } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.station.count(),
      prisma.countrySyncStatus.count(),
      prisma.$queryRaw`SELECT relname, reltuples::bigint AS estimate FROM pg_class WHERE relname IN ('FuelPrice', 'PriceHistory')`,
    ]);
    const est = Object.fromEntries(estimates.map(r => [r.relname, Number(r.estimate)]));
    res.json({
      users: { total: users, verified, twoFa, admins, newLast7d: newUsers },
      stations,
      countries,
      prices: est.FuelPrice ?? 0,
      historyRows: est.PriceHistory ?? 0,
    });
  } catch (err) {
    console.error('[admin/overview]', err.message);
    res.status(500).json({ error: 'Could not load overview' });
  }
});

// GET /api/admin/sync — per-country sync health: station/price counts and the
// freshest price timestamp (one grouped scan), merged with CountrySyncStatus.
router.get('/sync', async (req, res) => {
  try {
    const [rows, statuses] = await Promise.all([
      prisma.$queryRaw`
        SELECT s.country,
               COUNT(DISTINCT s.id)::int   AS stations,
               COUNT(fp.id)::int           AS prices,
               MAX(fp."updatedAt")         AS "freshestPrice"
        FROM "Station" s
        LEFT JOIN "FuelPrice" fp ON fp."stationId" = s.id
        GROUP BY s.country
        ORDER BY s.country`,
      prisma.countrySyncStatus.findMany(),
    ]);
    const byCountry = Object.fromEntries(statuses.map(s => [s.country, s]));
    res.json(rows.map(r => ({
      country: r.country,
      stations: r.stations,
      prices: r.prices,
      freshestPrice: r.freshestPrice,
      lastSyncAt: byCountry[r.country]?.lastSyncAt ?? null,
      fetched: byCountry[r.country]?.fetched ?? null,
    })));
  } catch (err) {
    console.error('[admin/sync]', err.message);
    res.status(500).json({ error: 'Could not load sync status' });
  }
});

// GET /api/admin/users?q=&take=&skip= — newest first, optional email search.
router.get('/users', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const take = Math.min(parseInt(req.query.take, 10) || 50, 200);
    const skip = parseInt(req.query.skip, 10) || 0;
    const where = q ? { email: { contains: q, mode: 'insensitive' } } : {};
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true, email: true, role: true, plan: true, emailVerified: true,
          totpEnabled: true, emailTwoFactor: true, googleId: true, createdAt: true,
          _count: { select: { favorites: true, savedLocations: true } },
        },
      }),
    ]);
    res.json({
      total,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        plan: u.plan,
        emailVerified: u.emailVerified,
        twoFa: u.totpEnabled || u.emailTwoFactor,
        googleLinked: !!u.googleId,
        createdAt: u.createdAt,
        favorites: u._count.favorites,
        savedLocations: u._count.savedLocations,
      })),
    });
  } catch (err) {
    console.error('[admin/users]', err.message);
    res.status(500).json({ error: 'Could not load users' });
  }
});

// PATCH /api/admin/users/:id — { role?, plan? }. Own role is immutable so an
// admin can't lock themselves (or the last admin) out by accident.
router.patch('/users/:id', async (req, res) => {
  try {
    const { role, plan } = req.body;
    const data = {};
    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      if (req.params.id === req.user.userId) return res.status(400).json({ error: 'You cannot change your own role' });
      data.role = role;
    }
    if (plan !== undefined) {
      if (!['free', 'premium'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
      data.plan = plan;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id: true, email: true, role: true, plan: true },
    });
    res.json(user);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    console.error('[admin/users PATCH]', err.message);
    res.status(500).json({ error: 'Could not update user' });
  }
});

// DELETE /api/admin/users/:id — cascades favorites/locations/tokens via schema.
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.userId) return res.status(400).json({ error: 'You cannot delete your own account here' });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'User not found' });
    console.error('[admin/users DELETE]', err.message);
    res.status(500).json({ error: 'Could not delete user' });
  }
});

module.exports = router;
