// Email-code 2FA + "remember this device". Pure-ish helpers (take prisma/res/req)
// shared by the login handler (auth.js) and the 2FA routes (auth_2fa.js).
const crypto = require('crypto');
const { sendLoginCodeEmail } = require('./email');

const OTP_TTL_MS = 10 * 60 * 1000;      // code valid 10 min
const OTP_MAX_ATTEMPTS = 5;             // then the code is burned
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const TD_TTL_MS = 30 * 24 * 60 * 60 * 1000; // remember device 30 days (sliding)
const TD_COOKIE = 'gasify_td';

const tdCookieOpts = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: TD_TTL_MS,
  path: '/',
});

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const codeHashFor = (userId, code) => sha256(`${userId}:${String(code).trim()}`);
const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Mask an address for display: teo.karov@gmail.com -> t***v@gmail.com
function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return email;
  const shown = local.length <= 2 ? local[0] : `${local[0]}***${local[local.length - 1]}`;
  return `${shown}@${domain}`;
}

// Generate + store a fresh code and email it. Respects a resend cooldown unless
// forced. Returns { throttled } or { delivered, dev }.
async function sendLoginCode(prisma, user, { force = false } = {}) {
  const latest = await prisma.emailOtp.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  if (!force && latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { throttled: true, retryInMs: OTP_RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime()) };
  }
  await prisma.emailOtp.deleteMany({ where: { userId: user.id } }); // one active code per user
  const code = genCode();
  await prisma.emailOtp.create({
    data: { userId: user.id, codeHash: codeHashFor(user.id, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  const sent = await sendLoginCodeEmail(user.email, code);
  return { throttled: false, ...sent };
}

// Check a submitted code. Consumes it on success; counts attempts on failure.
async function verifyLoginCode(prisma, user, code) {
  const otp = await prisma.emailOtp.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  if (!otp) return { ok: false, reason: 'no-code' };
  if (otp.expiresAt < new Date()) {
    await prisma.emailOtp.deleteMany({ where: { userId: user.id } });
    return { ok: false, reason: 'expired' };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.emailOtp.deleteMany({ where: { userId: user.id } });
    return { ok: false, reason: 'too-many' };
  }
  const expected = Buffer.from(otp.codeHash, 'hex');
  const got = Buffer.from(codeHashFor(user.id, code), 'hex');
  const match = expected.length === got.length && crypto.timingSafeEqual(expected, got);
  if (!match) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: otp.attempts + 1 } });
    return { ok: false, reason: 'invalid' };
  }
  await prisma.emailOtp.deleteMany({ where: { userId: user.id } });
  return { ok: true };
}

// If this browser carries a valid trusted-device cookie for the user, slide its
// expiry and return true (skip the email code). Never grants access on its own —
// the caller has already checked the password.
async function consumeTrustedDevice(prisma, req, res, user) {
  const raw = req.cookies?.[TD_COOKIE];
  if (!raw) return false;
  const td = await prisma.trustedDevice.findFirst({ where: { tokenHash: sha256(raw), userId: user.id } });
  if (!td) return false;
  if (td.expiresAt < new Date()) {
    await prisma.trustedDevice.delete({ where: { id: td.id } }).catch(() => {});
    return false;
  }
  await prisma.trustedDevice.update({ where: { id: td.id }, data: { expiresAt: new Date(Date.now() + TD_TTL_MS) } });
  res.cookie(TD_COOKIE, raw, tdCookieOpts());
  return true;
}

// Mint a new trusted-device token for this browser.
async function issueTrustedDevice(prisma, res, user, userAgent) {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.trustedDevice.create({
    data: { userId: user.id, tokenHash: sha256(raw), label: (userAgent || '').slice(0, 200), expiresAt: new Date(Date.now() + TD_TTL_MS) },
  });
  res.cookie(TD_COOKIE, raw, tdCookieOpts());
}

module.exports = {
  sendLoginCode, verifyLoginCode, consumeTrustedDevice, issueTrustedDevice,
  maskEmail, TD_COOKIE,
};
