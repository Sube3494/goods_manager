const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const context = { exports: {}, require: (name) => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}

async function main() {
  const rules = load("src/lib/memberDataVisibility.ts");
  const hidden = { memberDataVisibility: { hidden: true }, autoPickIntegration: { marker: "preserve" } };
  const owner = { id: "target", role: "USER" };
  const admin = { id: "admin", role: "ADMIN" };
  const superAdmin = { id: "root", role: "SUPER_ADMIN" };
  for (const viewer of [owner, admin, superAdmin]) {
    assert.equal(rules.canViewMemberData(viewer, "target", hidden), viewer !== admin);
    assert.equal(rules.canViewMemberData(viewer, "target", {}), true);
  }
  let lookups = 0;
  let permissions = hidden;
  const prisma = { user: {
    findUnique: async () => { lookups++; return { permissions }; },
    update: async ({ data }) => { permissions = data.permissions ?? permissions; return { id: "target", ...data }; },
  } };
  const server = load("src/lib/memberDataVisibilityServer.ts", {
    "@/lib/prisma": { default: prisma, __esModule: true },
    "@/lib/memberDataVisibility": rules,
  });
  assert.equal(await server.mayReadMemberData(owner, "target"), true);
  assert.equal(await server.mayReadMemberData(superAdmin, "target"), true);
  assert.equal(lookups, 0);
  assert.equal(await server.mayReadMemberData(admin, "target"), false);

  let session = admin;
  const route = load("src/app/api/admin/users/[id]/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/prisma": { default: prisma, __esModule: true },
    "@prisma/client": {},
    "@/lib/auth": { getAuthorizedAdminAny: async () => session },
    "@/lib/permissions": {
      hasAdminAccess: () => true,
      normalizePermissionMap: (value) => Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === "boolean")),
      clearUserPermissionOverrides: (value) => value,
    },
  });
  const patch = (body) => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id: "target" }) });
  assert.equal((await patch({ dataHidden: false })).status, 403);
  assert.equal(rules.isMemberDataHidden(permissions), true);
  assert.equal((await patch({ permissions: { memberDataVisibility: false } })).status, 200);
  assert.equal(rules.isMemberDataHidden(permissions), true);
  session = superAdmin;
  assert.equal((await patch({ dataHidden: "false" })).status, 400);
  assert.equal((await patch({ dataHidden: false })).status, 200);
  assert.equal(await server.mayReadMemberData(admin, "target"), true);
  assert.equal(permissions.autoPickIntegration.marker, "preserve");
  assert.equal((await patch({ dataHidden: true })).status, 200);
  assert.equal(await server.mayReadMemberData(admin, "target"), false);
  assert.equal(await server.mayReadMemberData(owner, "target"), true);
  console.log("成员数据隐藏：身份隔离、接口检查、恢复可见、防权限覆盖、保留既有配置均通过");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
