const prisma = require('../lib/prisma');

// Role check is a live DB lookup (the JWT only carries userId/email), so
// revoking admin takes effect immediately rather than at token expiry.
module.exports = async function requireAdmin(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true },
    });
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  } catch (err) {
    console.error('[requireAdmin]', err.message);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};
