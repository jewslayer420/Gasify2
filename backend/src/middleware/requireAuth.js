const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

module.exports = function requireAuth(req, res, next) {
  const token = req.cookies?.gasify_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Only full session tokens pass. The intermediate 2FA challenge token is
    // signed with the same secret ({ userId, mfa: true }, no email) — accepting
    // it here would let a password-only attacker skip the second factor.
    if (payload.mfa || !payload.email) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
