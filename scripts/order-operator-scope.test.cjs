const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

function load(file, mocks) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}

function fixture(operator) {
  const calls = [];
  const prisma = { autoPickOrder: { findFirst: async ({ where }) => {
    calls.push(where);
    return where.id === "order-1" && (!where.userId || where.userId === "owner")
      ? { userId: "owner" } : null;
  } } };
  const { resolveOrderOperatorScope } = load("src/lib/orderOperatorScope.ts", { "@/lib/prisma": { default: prisma } });
  return { operator, calls, resolveOrderOperatorScope };
}

test("super admin uses the order owner's scope and retains operator identity", async () => {
  const f = fixture({ id: "admin", role: "SUPER_ADMIN", name: "管理员" });
  assert.deepEqual(await f.resolveOrderOperatorScope(f.operator, "order-1"), {
    id: "owner", role: "SUPER_ADMIN", name: "管理员",
  });
  assert.equal(f.operator.id, "admin");
});

test("regular users and member managers cannot mutate another user's order", async () => {
  for (const role of ["USER", "ADMIN", "管理员"]) {
    const f = fixture({ id: "other", role, permissions: ["members:manage"] });
    assert.equal(await f.resolveOrderOperatorScope(f.operator, "order-1"), null);
    assert.equal(f.calls[0].userId, "other");
  }
});

test("owner retains access, missing orders fail even for super admin", async () => {
  const f = fixture({ id: "owner", role: "USER" });
  assert.equal((await f.resolveOrderOperatorScope(f.operator, "order-1")).id, "owner");
  assert.equal(await f.resolveOrderOperatorScope({ id: "admin", role: "SUPER_ADMIN" }, "missing"), null);
});

test("outbound API passes owner ID to inventory writes and rejects foreign orders for regular users", async () => {
  for (const role of ["SUPER_ADMIN", "USER"]) {
    const f = fixture({ id: "admin", role });
    const writes = [];
    const route = load("src/app/api/orders/[id]/outbound/route.ts", {
      "@/lib/orderOperatorScope": f,
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/auth": { getAuthorizedUserAny: async () => f.operator },
      "@/lib/autoPickOrders": {
        createOutboundFromAutoPickOrder: async (ownerId) => {
          writes.push(ownerId);
          return { ok: true, outboundOrderId: "outbound-1" };
        },
        updateAutoPickOrderAutoOutboundState: async (ownerId) => { writes.push(ownerId); },
      },
      "@/lib/prismaSchemaCompat": {},
    });
    const response = await route.POST({ json: async () => ({}) }, { params: Promise.resolve({ id: "order-1" }) });
    assert.equal(response.status, role === "SUPER_ADMIN" ? 200 : 404);
    assert.deepEqual(writes, role === "SUPER_ADMIN" ? ["owner", "owner"] : []);
  }
});
