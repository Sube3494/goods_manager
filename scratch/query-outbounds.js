const { PrismaClient } = require('../prisma/generated-client');
const prisma = new PrismaClient();

async function main() {
  await prisma.userDeviceSession.upsert({
    where: { sessionId: "test-session-id" },
    update: { endedAt: null },
    create: {
      userId: "cmpwr5a3900023vop52xkgzz0",
      sessionId: "test-session-id",
      deviceType: "desktop",
      deviceLabel: "Test Browser",
      lastSeenAt: new Date(),
    }
  });
  console.log('Test session upserted successfully');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());







