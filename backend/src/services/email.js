const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendPriceStaleAlert };
