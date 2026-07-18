const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const prisma = require('../lib/prisma');

router.use(requireAuth);

// GET /api/user/account — profile for the dashboard Account + Billing sections
router.get('/account', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { email: true, emailVerified: true, role: true, plan: true, createdAt: true, passwordHash: true, googleId: true, alertsEnabled: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      plan: user.plan,
      createdAt: user.createdAt,
      hasPassword: !!user.passwordHash,
      googleLinked: !!user.googleId,
      alertsEnabled: user.alertsEnabled,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load account' });
  }
});

// PATCH /api/user/alerts — { enabled }. Opt-in to the daily price-drop digest.
router.patch('/alerts', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
    await prisma.user.update({ where: { id: req.user.userId }, data: { alertsEnabled: enabled } });
    res.json({ alertsEnabled: enabled });
  } catch (err) {
    res.status(500).json({ error: 'Could not update alerts' });
  }
});

// GET /api/user/favorites
router.get('/favorites', async (req, res) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.userId },
      include: { station: { include: { prices: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(favorites.map(f => f.station));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// POST /api/user/favorites/:stationId
router.post('/favorites/:stationId', async (req, res) => {
  try {
    const favorite = await prisma.favorite.create({
      data: { userId: req.user.userId, stationId: req.params.stationId },
    });
    res.status(201).json(favorite);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already favorited' });
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// DELETE /api/user/favorites/:stationId
router.delete('/favorites/:stationId', async (req, res) => {
  try {
    await prisma.favorite.deleteMany({
      where: { userId: req.user.userId, stationId: req.params.stationId },
    });
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

// GET /api/user/locations
router.get('/locations', async (req, res) => {
  try {
    const locations = await prisma.savedLocation.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// POST /api/user/locations
router.post('/locations', async (req, res) => {
  try {
    const { label, name, lat, lng } = req.body;
    const location = await prisma.savedLocation.create({
      data: { userId: req.user.userId, label, name, lat, lng },
    });
    res.status(201).json(location);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save location' });
  }
});

// DELETE /api/user/locations/:id
router.delete('/locations/:id', async (req, res) => {
  try {
    await prisma.savedLocation.deleteMany({
      where: { id: req.params.id, userId: req.user.userId },
    });
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove location' });
  }
});

module.exports = router;
