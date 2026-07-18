const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// SMTP is only usable once a user + app password are set (host alone isn't enough).
function emailConfigured() {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

// Email-code 2FA. When SMTP isn't configured, real production fails loudly (so a
// misconfigured deploy doesn't silently write OTPs to logs), but a dev box can
// opt into a console fallback with EMAIL_DEV_CODE_LOG=true (or any non-production
// NODE_ENV) so the flow is testable without a mail server.
async function sendLoginCodeEmail(email, code) {
  if (!emailConfigured()) {
    const devFallback = process.env.EMAIL_DEV_CODE_LOG === 'true' || process.env.NODE_ENV !== 'production';
    if (!devFallback) throw new Error('email transport not configured');
    console.warn(`[email-2fa] DEV (no SMTP creds): sign-in code for ${email} is ${code}`);
    return { delivered: false, dev: true };
  }
  await transporter.sendMail({
    from: `"Gasify" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject: `${code} is your Gasify sign-in code`,
    html: `
      <h2>Your sign-in code</h2>
      <p>Enter this code to finish signing in to Gasify:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p>
      <p style="color:#888;font-size:12px">This code expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>
    `,
  });
  return { delivered: true, dev: false };
}

async function sendVerificationEmail(email, token) {
  await transporter.sendMail({
    from: `"Gasify" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your Gasify account',
    html: `
      <h2>Welcome to Gasify!</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${FRONTEND_URL}/auth/verify?token=${token}" style="background:#22c55e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
        Verify Email
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">Link expires in 24 hours.</p>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  await transporter.sendMail({
    from: `"Gasify" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset your Gasify password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <a href="${FRONTEND_URL}/auth/reset-password?token=${token}" style="background:#3b82f6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
        Reset Password
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px">Link expires in 1 hour.</p>
    `,
  });
}

// Admin alert: manual-constant fuel prices that are overdue for a refresh.
async function sendPriceStaleAlert(to, staleList) {
  const rows = staleList.map(s =>
    `<tr><td style="padding:4px 10px"><b>${s.cc}</b> ${s.label}</td>` +
    `<td style="padding:4px 10px">${s.ageDays}d old (cadence ${s.staleAfterDays}d)</td>` +
    `<td style="padding:4px 10px">${s.source}</td></tr>`
  ).join('');
  await transporter.sendMail({
    from: `"Gasify" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to,
    subject: `Gasify: ${staleList.length} manual fuel price(s) need a refresh`,
    html: `
      <h2>Manual fuel prices overdue for refresh</h2>
      <p>These hand-maintained regulated prices (in <code>regulated_manual.js</code> / <code>southafrica.js</code>)
      are past their refresh cadence. Update the price + <code>asOf</code> from each official source:</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><th align="left" style="padding:4px 10px">Country</th><th align="left" style="padding:4px 10px">Age</th><th align="left" style="padding:4px 10px">Official source</th></tr>
        ${rows}
      </table>`,
  });
}

// Price-drop digest for a user's favorited stations. Caller supplies the
// pre-rendered subject/html (formatDigestEmail in price_alerts.js).
async function sendPriceDropEmail(to, { subject, html }) {
  await transporter.sendMail({
    from: `"Gasify" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendPriceStaleAlert, sendLoginCodeEmail, sendPriceDropEmail, emailConfigured };
