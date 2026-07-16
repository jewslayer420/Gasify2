// Provision (or elevate) an admin account. Idempotent: upserts by email, sets
// role=admin, marks the email verified, and sets the given password.
// Usage: node src/scripts/create_admin.js <email> <password>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.error('usage: node src/scripts/create_admin.js <email> <password(min 8)>');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, emailVerified: true, role: 'admin' },
    update: { passwordHash, emailVerified: true, role: 'admin' },
  });
  console.log(`admin ready: ${user.email} (role=${user.role}, verified=${user.emailVerified})`);
}

main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
