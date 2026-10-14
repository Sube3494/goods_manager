import { expect, mock, test } from 'bun:test';
import { formatLocalDate, parseAsShanghaiTime } from '../src/lib/dateUtils';

const calls = [];
let allowed = true;
const user = { id: 'loading-test', role: 'SUPER_ADMIN', permissions: {} };
const day = formatLocalDate(new Date());
const date = parseAsShanghaiTime(`${day} 12:00:00`);
const orders = [{ id:'order-1', orderNo:'test-1', platform:'线下交易', status:'已完成', orderTime:date, shopId:'shop-1', shopAddress:'', rawPayload:{}, actualPaid:10000, expectedIncome:10000, platformCommission:0, delivery:{}, items:[] }];
const record = (name, result) => async args => { calls.push({ name, args }); return typeof result === 'function' ? result(args) : result; };
const db = {
  shop: { findMany: record('shop.findMany',[{id:'shop-1',name:'南山店',address:''}]), count: record('shop.count',1) },
  systemSetting: { findFirst: record('settings',null) },
  user: { findUnique: record('user',{shippingAddresses:[]}) },
  shopProduct: { findMany: record('shopProduct',[]) },
  product: { findMany: record('product',[]) },
  purchaseOrderItem: { findMany: record('inbound',[]) },
  purchaseOrder: { findMany: record('purchase',[]) },
  outboundOrder: { findMany: record('outbound',[]) },
  autoPickOrder: { findMany: record('autoPick',orders) },
  brushOrder: { findMany: record('brushOrder',[]) },
  brushProduct: { findMany: record('brushProduct',[]) },
  brushOrderPlan: { findMany: record('plans',[{date,shopName:'南山店',items:[{quantity:2}]}]) },
  operatingCostProfile: { findMany: record('operatingProfile',[{shopName:'南山店',monthlyRent:3000,monthlyLabor:0,allocationBaseDays:30},{shopName:'未开店',monthlyRent:3000,monthlyLabor:0,allocationBaseDays:30}]) },
  operatingCostMonthlyBill: { findMany: record('operatingBill',[]) },
};
mock.module('@/lib/prisma',()=>({default:db}));
mock.module('@/lib/auth',()=>({getAuthorizedUserAny:async()=>allowed?user:null,getAuthorizedUser:async()=>allowed?user:null}));
mock.module('@/lib/storage',()=>({getStorageStrategy:async()=>({resolveUrl:value=>value})}));
mock.module('@/lib/customerMemoryStore',()=>({resolveRememberedCustomerTypes:async()=>new Map()}));
mock.module('@/services/promotionService',()=>({getEffectivePromotionExpenses:async()=>[{amount:10,date,shopName:'南山店',platform:'线下交易'}]}));
mock.module('@/lib/autoPickOrders',()=>({normalizeAutoPickIntegrationConfig:()=>({}),readCustomerTypeFromRawPayload:()=>null,readDeliveryFeeFromValue:()=>0,readOrderExtraExpensesFromRawPayload:()=>[],calculateOrderTotalExtraExpense:()=>0,resolveAutoPickMatchedShopName:order=>order.shopId==='shop-1'?'南山店':''}));
const { NextRequest } = await import('next/server');
const { GET:stats } = await import('../src/app/api/stats/route');
const { GET:brush } = await import('../src/app/api/brush/dashboard/route');
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
