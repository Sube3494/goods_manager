const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const base = path.resolve(__dirname, '..');
let session;
let batchOwner;
let productOwner;
let itemBatch = 'batch-a';
let calls = [];
let writes = 0;
let permissionChecker = user => !!user?.allowed;
const deniedWrite = () => { throw new Error('Unauthorized database access'); };
const checkItem = async ({ where }) => {
  calls.push(where);
  if (where.id !== 'item-a' || where.batchId !== itemBatch || where.batch?.userId !== batchOwner) {
    throw Object.assign(new Error('Not found'), { code: 'P2025' });
  }
  writes++;
  return { id: 'item-a' };
};
const prisma = {
  storeOpeningBatch: {
    findMany: async ({ where }) => { calls.push(where); return []; },
    findUnique: async ({ where }) => { calls.push(where); return where.userId === batchOwner ? { id: where.id, items: [] } : null; },
    findFirst: async ({ where }) => { calls.push(where); return where.userId === batchOwner ? { id: where.id } : null; },
    create: async () => { writes++; return {}; }, update: deniedWrite, delete: deniedWrite,
  },
  storeOpeningItem: { delete: checkItem, update: checkItem, create: async () => { writes++; return {}; }, createMany: async () => { writes++; return { count: 1 }; } },
  product: { findMany: async ({ where }) => where.userId === productOwner ? where.id.in.map(id => ({ id })) : [] },
};
function load(file, extras = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(base, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, console, process, window: extras.window,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } };
      if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
      if (name === '@/lib/auth') return { getAuthorizedUser: async () => session };
      if (name === '@/lib/permissions') return { hasPermission: (user, permission) => permissionChecker(user, permission) };
      if (name === '@/lib/storage') return { getStorageStrategy: async () => ({ resolveUrl: value => value }) };
      if (name === 'xlsx') return {};
      throw Error('Unexpected import: ' + name);
    },
  }, { filename: file });
  return exports;
}
const root = 'src/app/api/setup-purchases/';
const routes = [
  [load(root + 'route.ts'), ['GET', 'POST']],
  [load(root + '[id]/route.ts'), ['GET', 'PUT', 'DELETE']],
  [load(root + '[id]/items/route.ts'), ['POST']],
  [load(root + '[id]/import/route.ts'), ['POST']],
  [load(root + '[id]/items/[itemId]/route.ts'), ['DELETE', 'PATCH', 'PUT']],
];
const params = { params: Promise.resolve({ id: 'batch-a', itemId: 'item-a' }) };
const request = { json: async () => ({ productName: 'Test', quantity: 1, unitPrice: 2 }) };
async function run() {
  for (const user of [null, { id: 'account-a', allowed: false }]) {
    session = user; calls = []; writes = 0;
    for (const [route, methods] of routes) for (const method of methods) {
      assert.equal((await route[method](request, params)).status, 403);
    }
    assert.equal(calls.length, 0); assert.equal(writes, 0);
  }
  session = { id: 'account-a', allowed: true }; batchOwner = 'account-b'; writes = 0;
  assert.equal((await routes[0][0].GET()).status, 200);
  assert.equal(calls.at(-1).userId, 'account-a');
  assert.equal((await routes[1][0].GET(request, params)).status, 404);
  assert.equal((await routes[2][0].POST(request, params)).status, 404);
  assert.equal((await routes[3][0].POST(request, params)).status, 404);
  for (const method of ['DELETE', 'PATCH', 'PUT']) assert.equal((await routes[4][0][method](request, params)).status, 404);
  assert.equal(writes, 0);
  batchOwner = 'account-a'; itemBatch = 'different-batch';
  for (const method of ['DELETE', 'PATCH', 'PUT']) assert.equal((await routes[4][0][method](request, params)).status, 404);
  assert.equal(writes, 0);
  itemBatch = 'batch-a';
  for (const method of ['DELETE', 'PATCH', 'PUT']) assert.equal((await routes[4][0][method](request, params)).status, 200);
  assert.equal(writes, 3);
  assert.equal((await routes[2][0].POST(request, params)).status, 201);
  const linked = { json: async () => ({ productId: 'product-b' }) };
  productOwner = 'account-b'; const before = writes;
  assert.equal((await routes[2][0].POST(linked, params)).status, 404); assert.equal(writes, before);
  assert.equal((await routes[2][0].POST({ json: async () => [{ productId: 'product-b' }] }, params)).status, 404);
  productOwner = 'account-a'; assert.equal((await routes[2][0].POST(linked, params)).status, 201);

  const permissions = load('src/lib/permissions.ts');
  permissionChecker = permissions.hasPermission;
  const legacy = { 'setup_purchase:manage': true };
  const expanded = permissions.expandSetupPurchasePermissions(legacy);
  assert.equal(expanded['setup_purchase:location'], true);
  assert.equal(legacy['setup_purchase:location'], undefined);
  const explicit = permissions.expandSetupPurchasePermissions({ ...legacy, 'setup_purchase:location': false });
  assert.equal(explicit['setup_purchase:location'], false);
  assert(permissions.PAGE_PERMISSION_TREE.flatMap(group => group.pages).find(page => page.key === 'setup_purchases').actions.some(action => action.key === 'setup_purchase:location'));
  for (const action of ['location', 'create', 'update', 'delete', 'inbound']) {
    const key = 'setup_purchase:' + action;
    assert.equal(permissions.hasPermission({ role: 'USER', permissions: legacy }, key), true);
    assert.equal(permissions.hasPermission({ role: 'USER', permissions: { ...legacy, [key]: false } }, key), false);
    assert.equal(permissions.hasPermission({ role: 'USER', roleProfile: { permissions: { ...legacy, [key]: true } }, permissions: { [key]: false } }, key), false);
    assert.equal(permissions.hasPermission({ role: 'SUPER_ADMIN' }, key), true);
  }
  for (const [route, method, action] of [
    [routes[0][0], 'POST', 'create'], [routes[1][0], 'PUT', 'update'], [routes[1][0], 'DELETE', 'delete'],
    [routes[2][0], 'POST', 'create'], [routes[3][0], 'POST', 'create'],
    [routes[4][0], 'PUT', 'update'], [routes[4][0], 'PATCH', 'update'], [routes[4][0], 'DELETE', 'delete'],
  ]) {
    session = { id: 'account-a', role: 'USER', permissions: { ...legacy, ['setup_purchase:' + action]: false } };
    const before = writes;
    assert.equal((await route[method](request, params)).status, 403);
    assert.equal(writes, before);
  }

  const saved = new Map([['store-location:points:nationwide', 'legacy']]);
  const window = { localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) } };
  const { createLocationStorage } = load('src/components/SetupPurchases/locationStorage.ts', { window });
  const a = createLocationStorage('account-a'), b = createLocationStorage('account-b');
  assert.equal(a.getItem('store-location:points:nationwide'), null);
  a.setItem('store-location:points:nationwide', 'a'); b.setItem('store-location:points:nationwide', 'b');
  assert.equal(a.getItem('store-location:points:nationwide'), 'a'); assert.equal(b.getItem('store-location:points:nationwide'), 'b');
  a.removeItem('store-location:points:nationwide'); assert.equal(b.getItem('store-location:points:nationwide'), 'b');
  assert.equal(saved.get('store-location:points:nationwide'), 'legacy');
  console.log('PASS: login/module denial before DB access, account-scoped reads, foreign batch/item/product denial, wrong parent denial, authorized writes, isolated map storage and legacy preservation.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
