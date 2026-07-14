const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/email');
const { sendLoginCode, consumeTrustedDevice, maskEmail } = require('../services/email2fa');
const prisma = require('../lib/prisma');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = '7d';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 };

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Invalid input' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const token = crypto.randomBytes(32).toString('hex');
    await prisma.verificationToken.create({
      data: { userId: user.id, token, type: 'verify_email', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    await sendVerificationEmail(email, token);
    res.status(201).json({ message: 'Check your email to verify your account' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.type !== 'verify_email' || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    // passwordHash is null for social-login-only accounts — password auth can't match
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!user.emailVerified) return res.status(403).json({ error: 'Please verify your email first' });

    // 2FA-enabled accounts get a short-lived MFA token instead of a session;
    // the matching /api/auth/2fa/* endpoint swaps it (plus a valid code) for the
    // real cookie. Authenticator app (TOTP) takes precedence over email codes.
    if (user.totpEnabled) {
      const mfaToken = jwt.sign({ userId: user.id, mfa: true }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ requires2fa: true, method: 'totp', mfaToken });
    }
    if (user.emailTwoFactor) {
      // A remembered device skips the code (the password already matched).
      if (!(await consumeTrustedDevice(prisma, req, res, user))) {
        const r = await sendLoginCode(prisma, user);
        const mfaToken = jwt.sign({ userId: user.id, mfa: true }, JWT_SECRET, { expiresIn: '10m' });
        return res.json({
          requires2fa: true, method: 'email', mfaToken,
          emailHint: maskEmail(user.email),
          devMode: r.dev === true, // dev fallback printed the code to the server log
        });
      }
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('gasify_token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('gasify_token');
  res.json({ message: 'Logged out' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.verificationToken.create({
        data: { userId: user.id, token, type: 'reset_password', expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await sendPasswordResetEmail(email, token);
    }
    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    res.status(500).json({ error: 'Request failed' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });

    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record || record.type !== 'reset_password' || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = req.cookies?.gasify_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.json({ user: null });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Reject the intermediate 2FA challenge token (mfa claim, no email) — it is
    // not a session and must never be treated as one.
    if (decoded.mfa || !decoded.email) return res.json({ user: null });
    res.json({ user: { id: decoded.userId, email: decoded.email } });
  } catch {
    res.json({ user: null });
  }
});

module.exports = router;
