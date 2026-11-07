import { expect, mock, test } from 'bun:test';
import { readDeliveryFeeFromValue } from '../src/lib/autoPickOrderStatus';
import { formatLocalDate, parseAsShanghaiTime } from '../src/lib/dateUtils';
import { buildOutboundReturnMetaNote } from '../src/lib/outboundReturnMeta';

const calls = [];
let allowed = true;
const user = { id: 'loading-test', role: 'SUPER_ADMIN', permissions: {} };
const day = formatLocalDate(new Date());
const date = parseAsShanghaiTime(`${day} 12:00:00`);
const orders = [{ id:'order-1', orderNo:'test-1', platform:'线下交易', status:'已完成', orderTime:date, shopId:'shop-1', shopAddress:'', rawPayload:{}, actualPaid:10000, expectedIncome:10000, platformCommission:0, delivery:{}, items:[] }];
const outboundOrders = [];
const operatingProfiles = [
  { shopName: '南山店', monthlyRent: 3000, monthlyLabor: 0, allocationBaseDays: 30 },
  { shopName: '未开店', monthlyRent: 3000, monthlyLabor: 0, allocationBaseDays: 30 },
];
const record = (name, result) => async args => { calls.push({ name, args }); return typeof result === 'function' ? result(args) : result; };
const db = {
  shop: { findMany: record('shop.findMany',[{id:'shop-1',name:'南山店',address:''}]), count: record('shop.count',1) },
  systemSetting: { findFirst: record('settings',null) },
  user: { findUnique: record('user',{shippingAddresses:[]}) },
  shopProduct: { findMany: record('shopProduct',[]) },
  product: { findMany: record('product',[]) },
  purchaseOrderItem: { findMany: record('inbound',[]) },
  purchaseOrder: { findMany: record('purchase',[]) },
  outboundOrder: { findMany: record('outbound',outboundOrders) },
  autoPickOrder: { findMany: record('autoPick',orders) },
  brushOrder: { findMany: record('brushOrder',[]) },
  brushProduct: { findMany: record('brushProduct',[]) },
  brushOrderPlan: { findMany: record('plans',[{date,shopName:'南山店',items:[{quantity:2}]}]) },
  operatingCostProfile: {
    findMany: record('operatingProfile', operatingProfiles),
    findUnique: record('operatingProfile.findUnique', ({ where }) => operatingProfiles.find(profile => profile.shopName === where.userId_shopName.shopName)),
    upsert: record('operatingProfile.upsert', ({ where, update }) => {
      const profile = operatingProfiles.find(profile => profile.shopName === where.userId_shopName.shopName);
      Object.assign(profile, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
      return profile;
    }),
  },
  operatingCostMonthlyBill: { findMany: record('operatingBill',[]), findUnique: record('operatingBill.findUnique', null) },
};
const { readOrderExtraExpensesFromRawPayload, calculateOrderTotalExtraExpense } = await import('../src/lib/autoPickOrders');
mock.module('@/lib/prisma',()=>({default:db}));
mock.module('@/lib/auth',()=>({getAuthorizedUserAny:async()=>allowed?user:null,getAuthorizedUser:async()=>allowed?user:null,getAuthorizedAdmin:async()=>allowed?user:null}));
mock.module('@/lib/storage',()=>({getStorageStrategy:async()=>({resolveUrl:value=>value})}));
mock.module('@/lib/customerMemoryStore',()=>({resolveRememberedCustomerTypes:async()=>new Map()}));
mock.module('@/services/promotionService',()=>({getEffectivePromotionExpenses:async()=>[{amount:10,date,shopName:'南山店',platform:'线下交易'}]}));
mock.module('@/lib/autoPickOrders',()=>({normalizeAutoPickIntegrationConfig:()=>({}),readCustomerTypeFromRawPayload:()=>null,readDeliveryFeeFromValue,readOrderExtraExpensesFromRawPayload,calculateOrderTotalExtraExpense,resolveAutoPickMatchedShopName:order=>order.shopId==='shop-1'?'南山店':''}));
const { NextRequest } = await import('next/server');
const { GET:stats } = await import('../src/app/api/stats/route');
const { GET:brush } = await import('../src/app/api/brush/dashboard/route');
const { GET:readCosts } = await import('../src/app/api/operating-costs/route');
const { POST:saveProfile } = await import('../src/app/api/operating-costs/profile/route');
const fields = ['rangeStart','rangeEnd','rangeDays','userPaid','promotionExpense','platformMatrix','customerAnalysis','productSales','businessTrend','platformBusinessTrend'];

test('marketing preserves summary fields and skips unused dashboard queries',async()=>{
 const full = await stats(new NextRequest('http://localhost/api/stats?range=all'));
 expect(full.status).toBe(200);
 const expected = await full.json();
 calls.length=0;
 const lean = await stats(new NextRequest('http://localhost/api/stats?range=all&view=marketing'));
 const actual = await lean.json();
 expect(lean.status).toBe(200);
 for(const field of fields)expect(actual[field]).toEqual(expected[field]);
 expect(actual.userPaid).toBeGreaterThan(0);
 expect(calls.some(call=>['settings','shop.count','inbound','purchase'].includes(call.name))).toBe(false);
 expect(calls.filter(call=>call.name==='autoPick'&&call.args.take===200)).toHaveLength(1);
});

test('saved rent start dates control the operating cost in the profit trend', async () => {
  const originalProfile = { ...operatingProfiles[0] };
  const priorDay = formatLocalDate(new Date(date.getTime() - 86_400_000));
  const save = (rentStartDate) => saveProfile(new Request('http://localhost/api/operating-costs/profile', {
    method: 'POST',
    body: JSON.stringify({ ...originalProfile, monthlyLabor: 6000, rentStartDate }),
  }));
  const getTrend = async (query) => {
    const response = await stats(new NextRequest(`http://localhost/api/stats?${query}&endDate=${day}`));
    expect(response.status).toBe(200);
    return (await response.json()).businessTrend;
  };

  try {
    expect((await save('2026-02-30')).status).toBe(400);
    expect((await save(priorDay)).status).toBe(200);
    expect((await save(undefined)).status).toBe(200);
    const read = await readCosts(new NextRequest(`http://localhost/api/operating-costs?shopName=${encodeURIComponent(originalProfile.shopName)}`));
    expect(read.status).toBe(200);
    expect((await read.json()).profile.rentStartDate).toBe(priorDay);
    const allTrend = await getTrend('range=all');
    expect(allTrend.map(point => [point.date, point.operatingExpense])).toEqual([[priorDay, 100], [day, 300]]);

    const nextDay = formatLocalDate(new Date(date.getTime() + 86_400_000));
    expect((await save(nextDay)).status).toBe(200);
    expect((await getTrend(`startDate=${priorDay}`)).map(point => point.operatingExpense)).toEqual([0, 200]);

    expect((await save(null)).status).toBe(200);
    expect((await getTrend('range=all')).map(point => point.operatingExpense)).toEqual([300]);
  } finally {
    operatingProfiles[0] = originalProfile;
  }
});

test.each([
  { refundAmount: 460, retainedIncome: 10, deliveryExpense: 8.82, pureProfit: 1.18 },
  { refundAmount: 470, retainedIncome: 0, deliveryExpense: 0, pureProfit: 0 },
])('offline return contributes only retained income after a ¥$refundAmount refund', async ({ refundAmount, retainedIncome, deliveryExpense, pureProfit }) => {
  const originalOrder = orders[0];
  orders[0] = { ...originalOrder, actualPaid: 47000, expectedIncome: 47000, delivery: { manualDeliveryFee: 882 } };
  outboundOrders.push({
    id: 'outbound-1', type: '销售出库', date, status: 'Returned',
    items: [{
      id: 'item-1', quantity: 1, shopProduct: null, product: null,
      costSnapshot: { batches: [{ purchaseOrderItemId: 'purchase-1', quantity: 1, unitCost: 198 }] },
    }],
    note: buildOutboundReturnMetaNote('平台单号:test-1', [{
      id: 'return-1', createdAt: date.toISOString(), reason: '售后退货',
      refundAmount, extraExpense: 0, returnedCost: 198,
      items: [{ outboundOrderItemId: 'item-1', quantity: 1 }],
    }], 'Returned'),
  });

  try {
    const response = await stats(new NextRequest('http://localhost/api/stats?range=all'));
    expect(response.status).toBe(200);
    const data = await response.json();
    const point = data.businessTrend.at(-1);
    expect(data.userPaid).toBe(retainedIncome);
    expect(data.deliveryExpense).toBe(deliveryExpense);
    expect(point.userPaid).toBe(retainedIncome);
    expect(point.trueOrderCount).toBe(0);
    expect(point.productCost).toBe(0);
    expect(point.pureProfit).toBe(pureProfit);
    expect(point.platformPureProfit['线下交易'] ?? 0).toBe(pureProfit);
    expect(point.shopPlatformPureProfit['南山店']?.['线下交易'] ?? 0).toBe(pureProfit);
    expect(data.platformBusinessTrend['线下交易'].at(-1).pureProfit).toBe(pureProfit);
  } finally {
    orders[0] = originalOrder;
    outboundOrders.pop();
  }
});

test.each([
  { status: '已删除', voided: undefined },
  { status: '已完成', voided: { reason: '录入有误' } },
])('dashboard excludes the original offline order after deletion or voiding ($status)', async ({ status, voided }) => {
  const [originalOrder] = orders;
  const replacement = { ...originalOrder, id: 'order-2', orderNo: 'test-2' };
  const items = [{ productName: '玩偶', quantity: 1 }];
  const delivery = { sendFee: 4900, isOffline: true };
  orders[0] = {
    ...originalOrder,
    status, items, delivery, actualPaid: 40000, expectedIncome: 40000,
    rawPayload: { systemMeta: {
      manualOfflineVoided: voided,
      extraExpenses: [{ id: 'old-expense', name: '额外支出', amount: 20000, type: 'expense' }],
    } },
  };
  orders.push({ ...replacement, items, delivery, actualPaid: 40000, expectedIncome: 40000 });
  const outboundItem = {
    id: 'item-1', quantity: 1,
    costSnapshot: { batches: [{ purchaseOrderItemId: 'purchase-1', quantity: 1, unitCost: 200 }] },
  };
  outboundOrders.push({
    id: 'outbound-1', type: 'Sale', date, status: 'Returned', items: [outboundItem],
    note: buildOutboundReturnMetaNote('平台单号:test-1', [{
      id: 'return-1', createdAt: date.toISOString(), reason: '售后退货',
      refundAmount: 0, extraExpense: 0, returnedCost: 200,
      items: [{ outboundOrderItemId: 'item-1', quantity: 1 }],
    }], 'Returned'),
  }, {
    id: 'outbound-2', type: 'Sale', date, status: 'Confirmed', note: '平台单号:test-2',
    items: [{ ...outboundItem, id: 'item-2' }],
  });

  try {
    const response = await stats(new NextRequest('http://localhost/api/stats?range=all'));
    expect(response.status).toBe(200);
    const data = await response.json();
    const point = data.businessTrend.at(-1);
    expect(point.pureProfit).toBe(151);
    expect(point.platformPureProfit['线下交易']).toBe(151);
    expect(point.shopPlatformPureProfit['南山店']['线下交易']).toBe(151);
    expect(data.platformBusinessTrend['线下交易'].at(-1).pureProfit).toBe(151);
    expect(point.productCost).toBe(200);
    expect(data.productCost).toBe(200);
    expect(point.orderCount).toBe(1);
  } finally {
    orders[0] = originalOrder;
    orders.pop();
    outboundOrders.splice(-2);
  }
});

test.each([
  { name: 'zero-cost batch', snapshot: { batches: [{ purchaseOrderItemId: 'free-batch', quantity: 1, unitCost: 0 }] }, pureProfit: 75 },
  { name: 'manual zero cost', snapshot: { manualCostRecorded: true, averageUnitCost: 0, batches: [] }, pureProfit: 75 },
  { name: 'missing batch cost', snapshot: { batches: [{ purchaseOrderItemId: 'unknown-batch', quantity: 1 }] }, pureProfit: 0 },
])('dashboard distinguishes $name in mixed-cost orders', async ({ snapshot, pureProfit }) => {
  const originalOrder = orders[0];
  orders[0] = { ...originalOrder, items: [{ productName: '玩偶', quantity: 1 }, { productName: '专人配送', quantity: 1 }] };
  outboundOrders.push({
    id: 'outbound-1', type: '销售出库', date, status: 'Confirmed', note: '平台单号:test-1',
    items: [
      { id: 'paid-item', quantity: 1, costSnapshot: { batches: [{ purchaseOrderItemId: 'paid-batch', quantity: 1, unitCost: 25 }] } },
      { id: 'service-item', quantity: 1, costSnapshot: snapshot },
    ],
  });
  try {
    const response = await stats(new NextRequest('http://localhost/api/stats?range=all'));
    expect(response.status).toBe(200);
    const point = (await response.json()).businessTrend.at(-1);
    expect(point.pureProfit).toBe(pureProfit);
    expect(point.shopPureProfit['南山店'] ?? 0).toBe(pureProfit);
  } finally {
    orders[0] = originalOrder;
    outboundOrders.pop();
  }
});

test('brush dashboard limits plan reads to the current Shanghai day',async()=>{
 calls.length=0;
 const response=await brush();
 expect(response.status).toBe(200);
 const data=await response.json();
 expect(data.stats.todayPlanItemCount).toBe(2);
 expect(data.stats.todayShopCount).toBe(1);
 const planRead=calls.find(call=>call.name==='plans');
 expect(planRead.args.where.userId).toBe(user.id);
 expect(formatLocalDate(planRead.args.where.date.gte)).toBe(day);
 expect(planRead.args.where.date.lt.getTime()-planRead.args.where.date.gte.getTime()).toBe(86400000);
});


test('both optimized endpoints still reject unauthorized requests before querying data',async()=>{
 calls.length=0;
 allowed=false;
 try {
  expect((await stats(new NextRequest('http://localhost/api/stats?view=marketing'))).status).toBe(401);
  expect((await brush()).status).toBe(403);
  expect(calls).toHaveLength(0);
 } finally { allowed=true; }
});
