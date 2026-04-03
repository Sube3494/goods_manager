const { PrismaClient } = require("../../prisma/generated-client");

const prisma = new PrismaClient();

function migratePermissionMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { next: raw, changed: false };
  }

  const current = { ...raw };
  const hadLegacy = Object.prototype.hasOwnProperty.call(current, "brush_plan:manage");
  const hadUnified = !!current["brush:manage"];

  if (!hadLegacy) {
    return { next: current, changed: false };
  }

  if (current["brush_plan:manage"]) {
    current["brush:manage"] = true;
  } else if (!hadUnified) {
    current["brush:manage"] = false;
  }

  delete current["brush_plan:manage"];
  return { next: current, changed: true };
}

async function migrateCollection(modelName, rows) {
  let changed = 0;

  for (const row of rows) {
    const { next, changed: hasChanged } = migratePermissionMap(row.permissions);
    if (!hasChanged) continue;

    await prisma[modelName].update({
      where: { id: row.id },
      data: { permissions: next },
    });

    changed += 1;
  }

  return changed;
}

async function main() {
  const [roleProfiles, users, whitelists, invitations] = await Promise.all([
    prisma.roleProfile.findMany({ select: { id: true, permissions: true } }),
    prisma.user.findMany({ select: { id: true, permissions: true } }),
    prisma.emailWhitelist.findMany({ select: { id: true, permissions: true } }),
    prisma.invitation.findMany({ select: { id: true, permissions: true } }),
  ]);

  const [roleProfileCount, userCount, whitelistCount, invitationCount] = await Promise.all([
    migrateCollection("roleProfile", roleProfiles),
    migrateCollection("user", users),
    migrateCollection("emailWhitelist", whitelists),
    migrateCollection("invitation", invitations),
  ]);

  console.log(
    JSON.stringify(
      {
        migrated: {
          roleProfiles: roleProfileCount,
          users: userCount,
          whitelists: whitelistCount,
          invitations: invitationCount,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
