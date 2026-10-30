const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const context = { exports: {}, console, setInterval, setTimeout: (callback) => callback(), Date, require(name) {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name}.ts`));
      return require(name);
    } };
    cache.set(file, context.exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText, context, { filename: file });
    return context.exports;
  }
  return load;
}

async function main() {
  const clone = (value) => structuredClone(value);
  const rules = loader()("src/lib/queuedSelfDeliveryRules.ts");
  const base = {
    id: "order", userId: "owner", platform: "美团", orderNo: "platform-order", sourceId: "source",
    orderTime: new Date(), updatedAt: new Date(), status: "待处理", userAddress: "顾客收货地址", shopAddress: "门店地址",
    rawPayload: { delivery: false, pickProgress: { pickCompleted: false } }, delivery: null, queuedSelfDelivery: null,
  };
  assert.equal(rules.queuedSelfDeliveryBlockedReason(base), null);
  const cancelledDelivery = { ...base, status: "异常", delivery: { logisticName: "闪送", track: "运单已取消", status: 99 } };
  assert.equal(rules.queuedSelfDeliveryBlockedReason(cancelledDelivery), null);
  assert.match(rules.queuedSelfDeliveryBlockedReason({ ...base, status: "异常" }), /异常/);
  assert.match(rules.queuedSelfDeliveryBlockedReason({ ...cancelledDelivery, status: "已取消" }), /结束/);
  for (const value of [true, 1, "1"]) assert.match(rules.queuedSelfDeliveryBlockedReason({ ...base, rawPayload: { isSubscribe: value } }), /预约/);
  assert.equal(rules.isOrderReadyForQueuedSelfDelivery({ ...base, status: "拣货中" }), false);
  assert.equal(rules.isOrderReadyForQueuedSelfDelivery({ ...base, status: "已拣货" }), true);
  assert.equal(rules.isOrderReadyForQueuedSelfDelivery({ ...base, rawPayload: { pickProgress: { pickCompleted: true } } }), true);

  let order = clone(base);
  let remote = (value) => value;
  let commands = 0;
  let commandOK = true;
  let pendingCommand;
  const events = [];
  function matches(where) {
    if (where.id && where.id !== order.id || where.userId && where.userId !== order.userId) return false;
    if (where.updatedAt && where.updatedAt.getTime() !== order.updatedAt.getTime()) return false;
    if (where.AND && !where.AND.every(matches)) return false;
    if (where.queuedSelfDelivery) {
      const filter = where.queuedSelfDelivery;
      let value = order.queuedSelfDelivery;
      for (const key of filter.path) value = value?.[key];
      if ("equals" in filter && value !== filter.equals) return false;
      if ("lt" in filter && !(value < filter.lt)) return false;
    }
    return true;
  }
  const prisma = { autoPickOrder: {
    findMany: async ({ where }) => matches(where) ? [{ id: order.id }] : [],
    findUnique: async () => clone(order),
    findUniqueOrThrow: async () => clone(order),
    findFirst: async ({ where }) => matches(where) ? clone(order) : null,
    updateMany: async ({ where, data }) => {
      if (!matches(where)) return { count: 0 };
      order = { ...order, ...clone(data), updatedAt: new Date(order.updatedAt.getTime() + 1) };
      return { count: 1 };
    },
    update: async ({ data }) => { order = { ...order, ...clone(data) }; return clone(order); },
  } };
  const mocks = {
    "@/lib/prisma": { __esModule: true, default: prisma },
    "../../prisma/generated-client": {},
    "@/lib/autoPickOrders": { refreshAutoPickOrderFromPlugin: async () => {
      const next = remote(clone(order));
      if (next) order = next;
      return next;
    } },
    "@/lib/executeOrderSelfDelivery": { executeOrderSelfDelivery: async () => {
      commands++;
      if (pendingCommand) await pendingCommand;
      return { ok: commandOK, json: async () => commandOK ? {} : { error: "平台超时，结果待确认" } };
    } },
    "@/lib/autoPickOrderEvents": { emitAutoPickOrderEvent: (event) => events.push(event) },
    "@/lib/queuedSelfDeliveryRules": rules,
  };
  const load = loader(mocks);
  const queue = load("src/lib/queuedSelfDelivery.ts");
  await queue.setQueuedSelfDelivery(clone(order), true);
  assert.equal(order.queuedSelfDelivery.status, "waiting");
  await queue.processQueuedSelfDeliveryOrder(order.id);
  assert.equal(commands, 0, "未完成拣货不能发出命令");
  remote = (value) => ({ ...value, status: "已拣货" });
  await Promise.all([queue.processQueuedSelfDeliveryOrder(order.id), queue.processQueuedSelfDeliveryOrder(order.id)]);
  assert.equal(commands, 1, "并发检查只能执行一次");
  assert.equal(order.queuedSelfDelivery.status, "succeeded");

  order = clone(base); remote = (value) => value;
  await queue.setQueuedSelfDelivery(clone(order), true);
  await queue.setQueuedSelfDelivery(clone(order), false);
  await queue.processQueuedSelfDeliveryOrder(order.id);
  assert.equal(order.queuedSelfDelivery.status, "cancelled");
  assert.equal(commands, 1);

  for (const change of [
    (value) => ({ ...value, status: "已取消" }),
    (value) => ({ ...value, rawPayload: { is_subscribe: 1 } }),
    (value) => ({ ...value, delivery: { logisticName: "顺丰", track: "骑手已接单" }, rawPayload: {} }),
  ]) {
    order = clone(base);
    await queue.setQueuedSelfDelivery(clone(order), true);
    remote = change;
    await queue.processQueuedSelfDeliveryOrder(order.id);
    assert.equal(order.queuedSelfDelivery.status, "cancelled");
    assert.equal(commands, 1);
  }

  order = clone(base); remote = (value) => ({ ...value, status: "已拣货" }); commandOK = false;
  await queue.setQueuedSelfDelivery(clone(order), true);
  await queue.processQueuedSelfDeliveryOrder(order.id);
  await queue.processQueuedSelfDeliveryOrder(order.id);
  assert.equal(commands, 2, "失败不会自动反复发单");
  assert.equal(order.queuedSelfDelivery.status, "failed");
  order.queuedSelfDelivery = { ...order.queuedSelfDelivery, status: "running", updatedAt: new Date(Date.now() - 6 * 60_000).toISOString() };
  await loader(mocks)("src/lib/queuedSelfDelivery.ts").processQueuedSelfDeliveryOrder(order.id);
  assert.equal(order.queuedSelfDelivery.status, "failed");
  assert.equal(commands, 2, "重启后不重发结果不明的任务");

  order = clone(base); commandOK = true;
  await queue.setQueuedSelfDelivery(clone(order), true);
  let releaseCommand;
  pendingCommand = new Promise(resolve => { releaseCommand = resolve; });
  const activePoll = queue.processQueuedSelfDeliveries();
  while (order.queuedSelfDelivery.status !== "running") await new Promise(resolve => setImmediate(resolve));
  order.queuedSelfDelivery.updatedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  await queue.processQueuedSelfDeliveries();
  assert.equal(order.queuedSelfDelivery.status, "failed", "平台调用挂起时，下一轮仍必须回收超时任务");
  assert.equal(commands, 3, "超时回收不得重复发单");
  releaseCommand();
  await activePoll;
  pendingCommand = null;
  assert.equal(order.queuedSelfDelivery.status, "failed", "迟到的执行结果不得覆盖回收状态");

  let session = { id: "other", role: "USER" };
  const route = loader({ ...mocks,
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/auth": { getAuthorizedUser: async () => session },
    "@/lib/queuedSelfDelivery": queue,
  })("src/app/api/orders/[id]/queue-self-delivery/route.ts");
  order = clone(base);
  const request = { json: async () => ({ enabled: true }) };
  assert.equal((await route.POST(request, { params: Promise.resolve({ id: order.id }) })).status, 404);
  session = { id: "owner", role: "USER" };
  order.rawPayload.isSubscribe = true;
  assert.equal((await route.POST(request, { params: Promise.resolve({ id: order.id }) })).status, 409);

  let actualCommands = 0;
  let delayedStatus = false;
  let scheduled = 0;
  const service = loader({ ...mocks,
    "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    "@/lib/autoPickOrders": {
      callAutoPickCommand: async (ownerId, command, payload) => {
        actualCommands++;
        assert.equal(ownerId, "owner"); assert.equal(command, "/self-delivery"); assert.equal(payload.sourceId, "source");
        return { ok: true, status: 200, data: {} };
      },
      resolveAutoPickCommandPlatform: () => "美团",
      markAutoPickOrderMainSystemSelfDelivery: async () => {
        order.rawPayload = { ...order.rawPayload, systemMeta: { mainSystemSelfDelivery: { triggered: true } } };
      },
      refreshAutoPickOrderFromPlugin: async () => { if (!delayedStatus) order.status = "delivering"; return clone(order); },
      getAutoPickIntegrationConfigByUserId: async () => ({}),
      resolveShopSelfDeliveryTiming: () => ({}),
      readShopIdFromRawPayload: () => "",
      readShopNameFromRawPayload: () => "",
      readShopAddressFromRawPayload: () => "",
    },
    "@/lib/autoPickAutoComplete": { cancelAutoCompleteJob: async () => {}, ensureAutoCompleteJob: async () => { scheduled++; } },
    "@/lib/autoPickSchedule": { getEstimatedAutoCompleteAt: () => new Date(Date.now() + 600000) },
  })("src/lib/executeOrderSelfDelivery.ts");
  order = clone(base);
  order.queuedSelfDelivery = { token: "test", status: "waiting" };
  assert.equal((await service.executeOrderSelfDelivery(order.id, { id: "owner" })).status, 409);
  order.queuedSelfDelivery.status = "running";
  assert.equal((await service.executeOrderSelfDelivery(order.id, { id: "owner" }, true)).status, 409);
  assert.equal(actualCommands, 0);
  order.status = "已拣货";
  assert.equal((await service.executeOrderSelfDelivery(order.id, { id: "owner" }, true)).status, 200);
  assert.equal(actualCommands, 1);
  assert.equal(order.status, "delivering");
  assert.equal(order.delivery.sendFee, 0);
  order = clone(cancelledDelivery);
  order.rawPayload.pickProgress.pickCompleted = true;
  order.queuedSelfDelivery = { token: "recovery", status: "running" };
  delayedStatus = true;
  assert.equal((await service.executeOrderSelfDelivery(order.id, { id: "owner" }, true)).status, 200);
  assert.equal(actualCommands, 2);
  assert.equal(scheduled, 2, "平台仍返回旧异常时，自配成功也必须创建自动完成任务");
  assert.equal(order.status, "delivering");
  assert.equal(rules.queuedSelfDeliveryBlockedReason(order), "订单已有配送任务或骑手已接单");
  assert.equal(order.delivery.track, undefined, "不继承旧运单取消轨迹");
  order = clone(cancelledDelivery);
  commandOK = true;
  remote = value => ({ ...value, rawPayload: { ...value.rawPayload, pickProgress: { pickCompleted: true } } });
  await queue.setQueuedSelfDelivery(clone(order), true);
  await queue.processQueuedSelfDeliveryOrder(order.id);
  assert.equal(order.queuedSelfDelivery.status, "succeeded", "取消运单后的异常订单可等待拣货并执行自配");
  assert(events.length > 0);
  console.log("拣货后自配：等待、完成后触发、取消、预约单/配送拦截、并发去重、失败和重启保护、身份隔离通过");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
