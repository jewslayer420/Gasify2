// Sign in with Google — manual OAuth 2.0 authorization-code flow (no passport).
// Needs env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and PUBLIC_ORIGIN (the
// user-facing origin the browser talks to, e.g. https://gasify.app — defaults
// to http://localhost:3000 where the Next.js proxy forwards /api/* to us).
// Google Cloud Console → Credentials → OAuth client (Web): authorized redirect
// URI must be exactly `${PUBLIC_ORIGIN}/api/auth/google/callback`.
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendLoginCode, consumeTrustedDevice } = require('../services/email2fa');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES = '7d';
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 };

const ORIGIN = (process.env.PUBLIC_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const REDIRECT_URI = `${ORIGIN}/api/auth/google/callback`;
// The state cookie must survive the cross-site redirect back from Google → lax, not strict
const STATE_COOKIE = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 };

function configured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// GET /api/auth/google — kick off the flow
router.get('/', (req, res) => {
  if (!configured()) return res.redirect(`${ORIGIN}/auth/login?error=google-not-configured`);
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('gasify_oauth_state', state, STATE_COOKIE);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback — code exchange → find-or-create user → session
router.get('/callback', async (req, res) => {
  const fail = reason => res.redirect(`${ORIGIN}/auth/login?error=${encodeURIComponent(reason)}`);
  try {
    if (!configured()) return fail('google-not-configured');
    const { code, state } = req.query;
    const expected = req.cookies?.gasify_oauth_state;
    res.clearCookie('gasify_oauth_state');
    if (!code || !state || !expected || state !== expected) return fail('google-state-mismatch');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenRes.ok) {
      console.error('[google] token exchange failed:', tokenRes.status, await tokenRes.text());
      return fail('google-exchange-failed');
    }
    const { id_token } = await tokenRes.json();
    // The id_token arrived directly from Google's token endpoint over TLS, so
    // decoding without signature verification is safe; still validate the claims.
    const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString());
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID) return fail('google-bad-audience');
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) return fail('google-bad-issuer');
    if (!claims.email || claims.email_verified !== true) return fail('google-email-unverified');

    const email = claims.email.toLowerCase();
    let user = await prisma.user.findUnique({ where: { googleId: claims.sub } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      user = byEmail
        // Same verified email → link Google to the existing account
        ? await prisma.user.update({ where: { id: byEmail.id }, data: { googleId: claims.sub, emailVerified: true } })
        : await prisma.user.create({ data: { email, googleId: claims.sub, emailVerified: true, passwordHash: null } });
    }

    // 2FA still applies to social sign-in — hand the login page an MFA token
    if (user.totpEnabled) {
      const mfaToken = jwt.sign({ userId: user.id, mfa: true }, JWT_SECRET, { expiresIn: '5m' });
      return res.redirect(`${ORIGIN}/auth/login?mfa=${encodeURIComponent(mfaToken)}&method=totp`);
    }
    if (user.emailTwoFactor && !(await consumeTrustedDevice(prisma, req, res, user))) {
      await sendLoginCode(prisma, user);
      const mfaToken = jwt.sign({ userId: user.id, mfa: true }, JWT_SECRET, { expiresIn: '10m' });
      return res.redirect(`${ORIGIN}/auth/login?mfa=${encodeURIComponent(mfaToken)}&method=email`);
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.cookie('gasify_token', token, COOKIE_OPTS);
    res.redirect(`${ORIGIN}/map`);
  } catch (err) {
    console.error('[google]', err.message);
    fail('google-signin-failed');
  }
});

module.exports = router;
