// Two-factor authentication (TOTP, RFC 6238 — Google Authenticator / Authy /
// 1Password etc.) plus one-time backup codes. Enrollment: /setup (QR) →
// /enable (confirm a live code, receive backup codes). Login: /api/auth/login
// returns { requires2fa, mfaToken } instead of a session; /login here swaps
// mfaToken + a valid code for the real session cookie.
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const requireAuth = require('../middleware/requireAuth');
const { sendLoginCode, verifyLoginCode, issueTrustedDevice } = require('../services/email2fa');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = '7d';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 };

authenticator.options = { window: 1 }; // tolerate ±30s device clock drift

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const normalizeBackup = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

function makeBackupCodes(n = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  return Array.from({ length: n }, () => {
    let raw = '';
    for (const b of crypto.randomBytes(8)) raw += alphabet[b % alphabet.length];
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

// Shared: check a TOTP code or consume a backup code. Returns the updated
// backupCodes array when a backup code was used, else null; false when invalid.
function checkSecondFactor(user, rawCode) {
  const code = String(rawCode || '').trim();
  if (/^\d{6}$/.test(code) && user.totpSecret && authenticator.check(code, user.totpSecret)) {
    return { ok: true, remainingBackup: null };
  }
  const h = sha256(normalizeBackup(code));
  if (code.length >= 8 && user.backupCodes.includes(h)) {
    return { ok: true, remainingBackup: user.backupCodes.filter(x => x !== h) };
  }
  return { ok: false };
}

// POST /api/auth/2fa/setup — start enrollment: fresh secret + QR (auth required)
router.post('/setup', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.totpEnabled) return res.status(400).json({ error: 'Two-factor is already enabled' });

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    const otpauthUrl = authenticator.keyuri(user.email, 'Gasify', secret);
    const qr = await qrcode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    res.json({ secret, otpauthUrl, qr });
  } catch (err) {
    console.error('[2fa/setup]', err.message);
    res.status(500).json({ error: 'Could not start two-factor setup' });
  }
});

// POST /api/auth/2fa/enable — confirm a live code, activate, hand out backup codes
router.post('/enable', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user?.totpSecret) return res.status(400).json({ error: 'Run setup first' });
    if (user.totpEnabled) return res.status(400).json({ error: 'Two-factor is already enabled' });

    const code = String(req.body.code || '').trim();
    if (!authenticator.check(code, user.totpSecret)) {
      return res.status(401).json({ error: 'That code is not valid — check your authenticator app' });
    }
    const backupCodes = makeBackupCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: true, backupCodes: backupCodes.map(c => sha256(normalizeBackup(c))) },
    });
    res.json({ enabled: true, backupCodes }); // plaintext shown exactly once
  } catch (err) {
    console.error('[2fa/enable]', err.message);
    res.status(500).json({ error: 'Could not enable two-factor' });
  }
});

// POST /api/auth/2fa/disable — requires a valid TOTP or backup code
router.post('/disable', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user?.totpEnabled) return res.status(400).json({ error: 'Two-factor is not enabled' });

    const { ok } = checkSecondFactor(user, req.body.code);
    if (!ok) return res.status(401).json({ error: 'That code is not valid' });

    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, backupCodes: [] },
    });
    res.json({ enabled: false });
  } catch (err) {
    console.error('[2fa/disable]', err.message);
    res.status(500).json({ error: 'Could not disable two-factor' });
  }
});

// POST /api/auth/2fa/login — { mfaToken, code } → real session cookie
router.post('/login', async (req, res) => {
  try {
    let payload;
    try {
      payload = jwt.verify(String(req.body.mfaToken || ''), JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Sign-in expired — start again' });
    }
    if (!payload.mfa) return res.status(401).json({ error: 'Invalid sign-in token' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.totpEnabled) return res.status(400).json({ error: 'Two-factor is not enabled for this account' });

    const { ok, remainingBackup } = checkSecondFactor(user, req.body.code);
    if (!ok) return res.status(401).json({ error: 'That code is not valid' });
    if (remainingBackup) {
      await prisma.user.update({ where: { id: user.id }, data: { backupCodes: remainingBackup } });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, tv: user.tokenVersion }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('gasify_token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('[2fa/login]', err.message);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// ── Email-code 2FA ──

// POST /api/auth/2fa/email/enable — turn on email sign-in codes (auth required).
// The account email is already verified at registration, so this is immediate.
router.post('/email/enable', requireAuth, async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.userId }, data: { emailTwoFactor: true } });
    res.json({ emailTwoFactor: true });
  } catch (err) {
    console.error('[2fa/email/enable]', err.message);
    res.status(500).json({ error: 'Could not enable email codes' });
  }
});

// POST /api/auth/2fa/email/disable — turn off + forget trusted devices/codes
router.post('/email/disable', requireAuth, async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.user.userId }, data: { emailTwoFactor: false } }),
      prisma.emailOtp.deleteMany({ where: { userId: req.user.userId } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.user.userId } }),
    ]);
    res.json({ emailTwoFactor: false });
  } catch (err) {
    console.error('[2fa/email/disable]', err.message);
    res.status(500).json({ error: 'Could not disable email codes' });
  }
});

// POST /api/auth/2fa/email/resend — { mfaToken } → resend the code (rate limited)
router.post('/email/resend', async (req, res) => {
  try {
    let payload;
    try { payload = jwt.verify(String(req.body.mfaToken || ''), JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Sign-in expired — start again' }); }
    if (!payload.mfa) return res.status(401).json({ error: 'Invalid sign-in token' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.emailTwoFactor) return res.status(400).json({ error: 'Email codes are not enabled' });

    const r = await sendLoginCode(prisma, user);
    if (r.throttled) return res.status(429).json({ error: `Please wait ${Math.ceil(r.retryInMs / 1000)}s before requesting another code` });
    res.json({ sent: true, devMode: r.dev === true });
  } catch (err) {
    console.error('[2fa/email/resend]', err.message);
    res.status(500).json({ error: 'Could not resend the code' });
  }
});

// POST /api/auth/2fa/email/login — { mfaToken, code, rememberDevice } → session
router.post('/email/login', async (req, res) => {
  try {
    let payload;
    try { payload = jwt.verify(String(req.body.mfaToken || ''), JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Sign-in expired — start again' }); }
    if (!payload.mfa) return res.status(401).json({ error: 'Invalid sign-in token' });

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.emailTwoFactor) return res.status(400).json({ error: 'Email codes are not enabled' });

    const { ok, reason } = await verifyLoginCode(prisma, user, req.body.code);
    if (!ok) {
      const msg = reason === 'expired' ? 'That code has expired — request a new one'
        : reason === 'too-many' ? 'Too many attempts — request a new code'
        : 'That code is not valid';
      return res.status(401).json({ error: msg });
    }

    if (req.body.rememberDevice) await issueTrustedDevice(prisma, res, user, req.headers['user-agent']);

    const token = jwt.sign({ userId: user.id, email: user.email, tv: user.tokenVersion }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('gasify_token', token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('[2fa/email/login]', err.message);
    res.status(500).json({ error: 'Sign-in failed' });
  }
});

// GET /api/auth/2fa/status — is 2FA on for the signed-in user?
router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { totpEnabled: true, emailTwoFactor: true, backupCodes: true, googleId: true, passwordHash: true, trustedDevices: { select: { id: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      totpEnabled: user.totpEnabled,
      emailTwoFactor: user.emailTwoFactor,
      backupCodesLeft: user.backupCodes.length,
      trustedDevices: user.trustedDevices.length,
      hasPassword: !!user.passwordHash,
      googleLinked: !!user.googleId,
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load security status' });
  }
});

module.exports = router;
