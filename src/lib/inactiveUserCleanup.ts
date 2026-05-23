import prisma from "@/lib/prisma";

const DEFAULT_INACTIVE_DISABLE_DAYS = 7;

function getInactiveDisableDays() {
  const raw = Number(process.env.INACTIVE_USER_DISABLE_DAYS || DEFAULT_INACTIVE_DISABLE_DAYS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_INACTIVE_DISABLE_DAYS;
}

function getInactiveCutoffDate(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function disableInactiveUsers() {
  const days = getInactiveDisableDays();
  const cutoff = getInactiveCutoffDate(days);

  const candidates = await prisma.user.findMany({
    where: {
      role: {
        not: "SUPER_ADMIN",
      },
      status: "ACTIVE",
      OR: [
        {
          lastActiveAt: {
            lte: cutoff,
          },
        },
        {
          lastActiveAt: null,
          createdAt: {
            lte: cutoff,
          },
        },
      ],
    },
    select: {
      id: true,
      email: true,
    },
    take: 500,
  });

  if (candidates.length === 0) {
    return {
      disabledCount: 0,
      days,
    };
  }

  const userIds = candidates.map((user) => user.id);

  await prisma.$transaction([
    prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data: {
        status: "DISABLED",
      },
    }),
    prisma.userDeviceSession.updateMany({
      where: {
        userId: {
          in: userIds,
        },
        endedAt: null,
      },
      data: {
        endedAt: new Date(),
      },
    }),
  ]);

  console.log("[inactive-user-cleanup] disabled users", {
    disabledCount: candidates.length,
    days,
    emails: candidates.map((user) => user.email),
  });

  return {
    disabledCount: candidates.length,
    days,
  };
}
