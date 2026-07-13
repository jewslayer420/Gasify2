// Create/delete a throwaway verified user for local auth testing.
// Usage: node src/scripts/test_user.js create|delete
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const EMAIL = '2fa-test@gasify.local';
const PASSWORD = 'test-password-123';

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'create') {
    const passwordHash = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: EMAIL },
      create: { email: EMAIL, passwordHash, emailVerified: true },
      update: { passwordHash, emailVerified: true, totpEnabled: false, totpSecret: null, backupCodes: [] },
    });
    console.log(`created ${EMAIL} / ${PASSWORD}`);
  } else if (cmd === 'delete') {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    console.log(`deleted ${EMAIL}`);
  } else {
    console.error('usage: test_user.js create|delete');
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
