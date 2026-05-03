const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const requireAuth = require('../middleware/requireAuth');

const prisma = new PrismaClient();

router.use(requireAuth);

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
