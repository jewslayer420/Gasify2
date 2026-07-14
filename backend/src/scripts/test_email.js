// Verify SMTP delivery end-to-end. Sends a real test email through the configured
// transporter and prints a clear pass/fail (auth errors are the usual failure).
// Usage: node src/scripts/test_email.js you@example.com
require('dotenv').config();
const nodemailer = require('nodemailer');

async function main() {
  const to = process.argv[2];
  if (!to) { console.error('usage: node src/scripts/test_email.js <recipient@example.com>'); process.exit(1); }

  const cfg = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
  };
  console.log(`[test-email] host=${cfg.host}:${cfg.port} user=${cfg.user || '(EMPTY)'} from=${cfg.from}`);
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('[test-email] EMAIL_USER / EMAIL_PASS are not set — add them to backend/.env first.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.verify();
    console.log('[test-email] SMTP auth OK ✔');
  } catch (err) {
    console.error('[test-email] SMTP auth FAILED:', err.message);
    console.error('  → For Gmail, EMAIL_PASS must be a 16-char App Password (not your normal password), and 2-Step Verification must be on.');
    process.exit(1);
  }

  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject: 'Gasify SMTP test',
      text: 'If you can read this, Gasify email delivery is working. You can now enable email sign-in codes.',
    });
    console.log(`[test-email] sent ✔  messageId=${info.messageId}  accepted=${JSON.stringify(info.accepted)}`);
  } catch (err) {
    console.error('[test-email] send FAILED:', err.message);
    process.exit(1);
  }
}

main();
