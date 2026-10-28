const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");
function load(path, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "module", "exports", code)((name) => {
    assert.ok(name in mocks, "Unexpected import: " + name);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
function fixture(role = "USER", grants = ["public"]) {
  const libraries = [{ id: "public", name: "普通商品库" }, { id: "secret", name: "保密商品库" }];
  const locations = [];
  const user = { id: "member", role };
  const accessible = (where, lib) => (!where.id || where.id === lib.id) && (!where.authorizedUsers || grants.includes(lib.id));
  const matches = (item, where) => (!where.libraryId || item.libraryId === where.libraryId) && item.id !== where.id?.not;
  const db = {
    // Any accidental read/write of business shops fails the test immediately.
    shop: new Proxy({}, { get() { throw new Error("Dispatch must never access shops"); } }),
    productLibrary: {
      findMany: async ({ where }) => libraries.filter((lib) => accessible(where, lib)),
      findFirst: async ({ where }) => libraries.find((lib) => accessible(where, lib)) || null,
    },
    dispatchLocation: {
      findMany: async ({ where }) => locations.filter((item) => matches(item, where)),
      findUnique: async ({ where }) => locations.find((item) => item.id === where.id),
      create: async ({ data }) => { const item = { id: "loc-" + locations.length, ...data }; locations.push(item); return item; },
      update: async ({ where, data }) => Object.assign(locations.find((item) => item.id === where.id), data),
      delete: async ({ where }) => { locations.splice(locations.findIndex((item) => item.id === where.id), 1); },
    },
  };
  const scope = load("src/lib/dispatchAddressBook.ts", { "@/lib/prisma": { default: db } });
  const mocks = {
    "@/lib/prisma": { default: db }, "@/lib/dispatchAddressBook": scope,
    "@/lib/auth": { getAuthorizedUser: async () => user },
    "@/lib/shopIdentity": load("src/lib/shopIdentity.ts"),
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
  };
  return { locations, scope, user, mocks,
    list: load("src/app/api/dispatch-locations/route.ts", mocks),
    item: load("src/app/api/dispatch-locations/[id]/route.ts", mocks),
    import: load("src/app/api/dispatch-locations/import/route.ts", mocks) };
}
const request = (body) => ({ json: async () => body });
const context = (id) => ({ params: Promise.resolve({ id }) });
const entry = (libraryId) => ({ libraryId, name: "同名网点", externalId: "poi-1", address: "同一个地址" });

test("first use is empty; unassigned public libraries are not implicitly accessible", async () => {
  const f = fixture("USER", []);
  const result = await f.list.GET({ url: "https://test/api/dispatch-locations" });
  assert.deepEqual(result.body.shops, []);
  assert.deepEqual(result.body.libraries, []);
  assert.equal(await f.scope.canAccessDispatchLibrary(f.user, "public"), false);
});
test("library list and direct reads follow explicit member grants", async () => {
  const f = fixture();
  f.locations.push({ id: "visible", libraryId: "public", userId: "creator" }, { id: "hidden", libraryId: "secret", userId: "member" });
  const result = await f.list.GET({ url: "https://test/api/dispatch-locations?libraryId=public" });
  assert.deepEqual(result.body.shops.map((item) => item.id), ["visible"]);
  assert.deepEqual(result.body.libraries.map((item) => item.id), ["public"]);
  assert.equal((await f.list.GET({ url: "https://test/api/dispatch-locations?libraryId=secret" })).status, 403);
});
test("same POI and address are independently accepted in separate libraries", async () => {
  const f = fixture("SUPER_ADMIN", []);
  assert.equal((await f.list.POST(request(entry("public")))).status, 200);
  assert.equal((await f.list.POST(request(entry("secret")))).status, 200);
  assert.equal((await f.list.POST(request(entry("public")))).status, 409);
  assert.equal(f.locations.length, 2);
});
test("shared-library members can edit and delete each other's entries", async () => {
  const f = fixture();
  f.locations.push({ id: "shared", userId: "someone-else", libraryId: "public", ...entry("public") });
  assert.equal((await f.item.PUT(request({ ...entry("public"), name: "已编辑" }), context("shared"))).status, 200);
  assert.equal(f.locations[0].name, "已编辑");
  assert.equal((await f.item.DELETE({}, context("shared"))).status, 200);
  assert.equal(f.locations.length, 0);
  assert.equal((await f.list.GET({ url: "https://test/api/dispatch-locations" })).body.shops.length, 0);
});
test("unauthorized library denies create, import, update and delete, even for the entry creator", async () => {
  const f = fixture();
  f.locations.push({ id: "hidden", userId: "member", ...entry("secret") });
  assert.equal((await f.list.POST(request(entry("secret")))).status, 403);
  assert.equal((await f.import.POST(request({ libraryId: "secret", shops: [entry("secret")] }))).status, 403);
  assert.equal((await f.item.PUT(request(entry("public")), context("hidden"))).status, 403);
  assert.equal((await f.item.DELETE({}, context("hidden"))).status, 403);
  assert.equal(f.locations.length, 1);
});
test("imports belong only to the selected authorized library", async () => {
  const f = fixture();
  const result = await f.import.POST(request({ libraryId: "public", shops: [{ shopName: "导入网点", address: "导入地址", poi_id: "poi-import" }] }));
  assert.equal(result.status, 200);
  assert.equal(result.body.created, 1);
  assert.equal(f.locations[0].libraryId, "public");
});
test("super admin can access both libraries and unknown library IDs are rejected", async () => {
  const f = fixture("SUPER_ADMIN", []);
  assert.equal((await f.scope.getDispatchLibraries(f.user)).length, 2);
  assert.equal(await f.scope.canAccessDispatchLibrary(f.user, "missing"), false);
});
