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
function fixture(userId = "owner") {
  const groups = [{ id: "g1", userId: "owner", name: "本地" }, { id: "g2", userId: "other", name: "其他人的分组" }];
  const locations = [];
  const user = { id: userId, role: "USER" };
  const db = {
    productLibrary: new Proxy({}, { get() { throw new Error("Dispatch must never read product libraries"); } }),
    shop: new Proxy({}, { get() { throw new Error("Dispatch must never access business shops"); } }),
    dispatchGroup: {
      findMany: async ({ where }) => groups.filter((g) => g.userId === where.userId),
      findFirst: async ({ where }) => groups.find((g) => g.id === where.id && g.userId === where.userId),
      create: async ({ data }) => { const g = { id: "new-group", ...data }; groups.push(g); return g; },
      updateMany: async ({ where, data }) => { const g=groups.find((g)=>g.id===where.id&&g.userId===where.userId); if(g)Object.assign(g,data); return {count:g?1:0}; },
      deleteMany: async ({ where }) => {const i=groups.findIndex(g=>g.id===where.id&&g.userId===where.userId);if(i<0||locations.some(l=>l.groupId===where.id))return{count:0};groups.splice(i,1);return{count:1};},
    },
    dispatchLocation: {
      findMany: async ({ where }) => locations.filter((item) => item.userId === where.userId && (!("groupId" in where) || item.groupId === where.groupId) && item.id !== where.id?.not),
      findUnique: async ({ where }) => locations.find((item) => item.id === where.id),
      create: async ({ data }) => { const item = { id: "loc-" + locations.length, ...data }; locations.push(item); return item; },
      update: async ({ where, data }) => Object.assign(locations.find((item) => item.id === where.id), data),
      delete: async ({ where }) => { locations.splice(locations.findIndex((item) => item.id === where.id), 1); },
    },
  };
  const scope = load("src/lib/dispatchAddressBook.ts", { "@/lib/prisma": { default: db } });
  const mocks = { "@/lib/prisma": { default: db }, "@/lib/dispatchAddressBook": scope,
    "@/lib/auth": { getAuthorizedUser: async () => user }, "@/lib/shopIdentity": load("src/lib/shopIdentity.ts"),
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } }, };
  return { groups, locations, user, scope,
    list: load("src/app/api/dispatch-locations/route.ts", mocks),
    item: load("src/app/api/dispatch-locations/[id]/route.ts", mocks),
    import: load("src/app/api/dispatch-locations/import/route.ts", mocks),
    group: load("src/app/api/dispatch-groups/route.ts", mocks),
    groupItem: load("src/app/api/dispatch-groups/[id]/route.ts", mocks), };
}
const request = (body) => ({ json: async () => body });
const context = (id) => ({ params: Promise.resolve({ id }) });
const entry = (groupId = null) => ({ groupId, name: "网点", externalId: "poi-1", address: "地址" });
test("users can create and import ungrouped locations without product-library permission", async () => {
  const f=fixture();
  assert.equal((await f.list.POST(request(entry()))).status,200);
  assert.equal(f.locations[0].groupId,null);
  assert.equal(f.locations[0].scopeKey,"ungrouped");
  const imported=await f.import.POST(request({shops:[{shopName:"导入网点",address:"地址2",poi_id:"poi-2"}]}));
  assert.equal(imported.body.created,1);
});
test("list and groups belong only to current user, all is default", async () => {
  const f=fixture();f.locations.push({id:"own",userId:"owner",groupId:null},{id:"foreign",userId:"other",groupId:null});
  const result=await f.list.GET({url:"https://test/api/dispatch-locations"});
  assert.deepEqual(result.body.shops.map(x=>x.id),["own"]);
  assert.deepEqual(result.body.groups.map(x=>x.id),["g1"]);
});
test("duplicate checks are per user and optional group", async () => {
  const f=fixture();assert.equal((await f.list.POST(request(entry()))).status,200);
  assert.equal((await f.list.POST(request(entry("g1")))).status,200);
  assert.equal((await f.list.POST(request(entry()))).status,409);
});
test("foreign group IDs cannot be used to read, create or import", async () => {
  const f=fixture();
  assert.equal((await f.list.GET({url:"https://test/api/dispatch-locations?groupId=g2"})).status,403);
  assert.equal((await f.list.POST(request(entry("g2")))).status,403);
  assert.equal((await f.import.POST(request({groupId:"g2",shops:[entry()]}))).status,403);
});
test("only the owner can modify or delete locations, even super admins cannot cross scopes", async () => {
  const f=fixture();f.user.role="SUPER_ADMIN";f.locations.push({id:"foreign",userId:"other",groupId:"g2"});
  assert.equal((await f.item.PUT(request(entry()),context("foreign"))).status,403);
  assert.equal((await f.item.DELETE({},context("foreign"))).status,403);
});
test("locations can move to own group or back to ungrouped", async () => {
  const f=fixture();await f.list.POST(request(entry()));
  assert.equal((await f.item.PUT(request(entry("g1")),context("loc-0"))).status,200);
  assert.equal(f.locations[0].scopeKey,"g1");
  assert.equal((await f.item.PUT(request(entry("g2")),context("loc-0"))).status,403);
  assert.equal((await f.item.PUT(request(entry()),context("loc-0"))).status,200);
  assert.equal(f.locations[0].scopeKey,"ungrouped");
});
test("groups support create and rename; foreign or nonempty groups cannot be deleted", async () => {
  const f=fixture();const created=await f.group.POST(request({name:" 新分组 "}));
  assert.equal(created.body.group.name,"新分组");assert.equal(created.body.group.userId,"owner");
  assert.equal((await f.groupItem.PATCH(request({name:"改名"}),context("g1"))).status,200);
  assert.equal((await f.groupItem.PATCH(request({name:"越权"}),context("g2"))).status,404);
  await f.list.POST(request(entry("g1")));
  assert.equal((await f.groupItem.DELETE({},context("g1"))).status,409);
  assert.equal((await f.groupItem.DELETE({},context("new-group"))).status,200);
});
