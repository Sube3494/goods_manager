import { expect, test } from "bun:test";
import { getMaiyatianFulfillmentItems, readMaiyatianItemRefundDetails, readMaiyatianItemRefundQuantity, resolveMaiyatianRefundStatus, summarizeMaiyatianRefund } from "../src/lib/maiyatianRefund";
import { readConfirmedRefundAmountFromRawPayload, resolveOrderRefundAmount, resolveRefundAdjustedIncomeMetrics } from "../src/lib/orderFinancials";
import { isOrderFullyRefunded } from "../src/lib/autoPickOrderStatus";

// 只保留用户提供的订单样例中与退款有关的字段，不保存联系方式和访问凭证。
const goods = { id: "10469227", goods_id: "73042968", sku_code: "B31", number: "5",
  goods_extra: JSON.stringify({ original_sku_id: 33417010414 }), show_part_refund_tag: 1, part_refund_title: "已退款2件" };
const refundGoods = { order_goods_id: "10469227", goods_id: "73042968", sku_code: "B31", number: 2, original_sku_id: 33417010414 };
const refund = { id: "1109058862", source_cancel_id: "86596309843", status: "1", title: "确认退款", total_price: 264.4,
  goods_format: JSON.stringify([refundGoods]) };
const detail = { id: "13244231622", status: "delivering", is_cancel: 1, finished_time: "",
  fee: { user_fee: "66110", shop_fee: "62237" }, goods: [goods], delivery: { track: "配送中", finished_time: "0" },
  cancelDetails: [{ ...refund, id: "1109058848", status: "0", title: "发起退款" }, refund] };

test("平台退款悬停读取已确认的原因和本次金额，申请记录不重复显示", () => {
  expect(readMaiyatianItemRefundDetails(goods, { ...detail, cancelDetails: detail.cancelDetails.map((entry) => ({ ...entry, reason: "改数量", ctime: "13:32" })) })).toEqual([
    { reason: "改数量", createdAt: "13:32", quantity: 2, refundAmount: 26440 },
  ]);
});

test("出库扣除2件退款，只保留3件且不改写订单原始数量", () => {
  const items = [{ quantity: 5, rawPayload: goods }];
  expect(getMaiyatianFulfillmentItems(items, detail)[0].quantity).toBe(3);
  expect(items[0].quantity).toBe(5);
  expect(getMaiyatianFulfillmentItems(items, { ...detail, cancelDetails: [], goods: [] })[0].quantity).toBe(3);
  expect(getMaiyatianFulfillmentItems([{ quantity: 5, rawPayload: { ...goods, part_refund_title: "" } }], { cancelDetails: [] })[0].quantity).toBe(5);
  expect(getMaiyatianFulfillmentItems(items, { cancelDetails: [{ ...refund, goods_format: JSON.stringify([{ ...refundGoods, number: 5 }]) }] })).toEqual([]);
});

test("退款后的手工匹配总数量和组合匹配随剩余数量缩减", () => {
  const rawPayload = { ...goods, manualMatchedProduct: { quantity: 5, compositeItems: [{ id: "part", quantity: 10 }] } };
  const result = getMaiyatianFulfillmentItems([{ quantity: 5, rawPayload }], detail)[0];
  expect(result.rawPayload.manualMatchedProduct.quantity).toBe(3);
  expect(result.rawPayload.manualMatchedProduct.compositeItems[0].quantity).toBe(6);
  expect(rawPayload.manualMatchedProduct.quantity).toBe(5);
});

test("真实样例：配送中、退款2/5件、退款264.40元，不能整单取消", () => {
  expect(summarizeMaiyatianRefund(detail)).toEqual({ kind: "partial", amount: 26440, returnedQuantity: 2, totalQuantity: 5 });
  expect(resolveMaiyatianRefundStatus(detail, "已取消")).toBe("配送中");
  expect(readMaiyatianItemRefundQuantity(goods, detail)).toBe(2);
  expect(resolveOrderRefundAmount({ rawPayload: detail, actualPaid: 66110, hasReturnedGoods: false })).toBe(26440);
  expect(isOrderFullyRefunded({ status: "配送中", actualPaid: 66110, refundAmount: 26440, expectedIncome: 0 })).toBe(false);
});
test("同一退款生命周期只计一次；多个独立请求金额累计", () => {
  expect(readConfirmedRefundAmountFromRawPayload(detail)).toBe(26440);
  expect(readConfirmedRefundAmountFromRawPayload({ cancelDetails: [...detail.cancelDetails, { ...refund, source_cancel_id: "refund-2", total_price: 10 }] })).toBe(27440);
});
test("记录倒序时仍按最新流水判断，撤销后不计退款", () => {
  expect(readConfirmedRefundAmountFromRawPayload({ cancelDetails: [...detail.cancelDetails].reverse() })).toBe(26440);
  expect(readConfirmedRefundAmountFromRawPayload({ cancelDetails: [...detail.cancelDetails, { ...refund, id: "1109058863", status: "3", title: "取消退款申请" }] })).toBe(0);
});
test("退款详情暂时未读到时，商品部分退款标记仍可保护配送状态", () => {
  expect(resolveMaiyatianRefundStatus({ ...detail, cancelDetails: [] }, "已取消")).toBe("配送中");
});
test("已完成的部分退款保持完成，0字符串完成时间不算送达", () => {
  expect(resolveMaiyatianRefundStatus({ ...detail, status: "completed", delivery: { track: "配送完成" } }, "已取消")).toBe("已完成");
  expect(resolveMaiyatianRefundStatus(detail, "已取消")).toBe("配送中");
});
test("全额退款仍归入取消，金额未知不能因缺少商品明细认定全额退款", () => {
  expect(summarizeMaiyatianRefund({ ...detail, cancelDetails: [{ ...refund, total_price: 661.1 }] }).kind).toBe("full");
  expect(resolveMaiyatianRefundStatus({ ...detail, cancelDetails: [{ ...refund, total_price: 661.1 }] }, "配送中")).toBe("已取消");
  expect(summarizeMaiyatianRefund({ status: "cancel", cancelDetails: [{ ...refund, total_price: 0, goods_format: "bad json" }] }).kind).toBe("unknown");
});
test("两次退货累计到全部商品时识别整单退货", () => {
  const refunds = [refund, { ...refund, source_cancel_id: "refund-2", goods_format: JSON.stringify([{ ...refundGoods, number: 3 }]), total_price: 0 }];
  expect(summarizeMaiyatianRefund({ ...detail, cancelDetails: refunds }).kind).toBe("full");
});
test("同货号多个订单商品行必须按order_goods_id匹配", () => {
  expect(readMaiyatianItemRefundQuantity({ ...goods, id: "another-line", part_refund_title: "" }, detail)).toBe(0);
});
test("顾客实付退款只冲减实付，到手和佣金沿用平台或手动金额", () => {
  expect(resolveRefundAdjustedIncomeMetrics({ actualPaid: 66110, refundAmount: 26440, expectedIncome: 62237, platformCommission: 3973 })).toEqual({
    actualPaid: 39670, expectedIncome: 62237, platformCommission: 3973, refundedExpectedIncome: 0, refundedCommission: 0,
  });
  expect(resolveRefundAdjustedIncomeMetrics({ actualPaid: 66110, refundAmount: 26440, expectedIncome: 37342, platformCommission: 3973 }).expectedIncome).toBe(37342);
});
test("美团部分退款按剩余实付重算6%佣金和到手", () => {
  expect(resolveRefundAdjustedIncomeMetrics({ platform: "美团", actualPaid: 66110, refundAmount: 26440, expectedIncome: 62237, platformCommission: 3973 })).toEqual({
    actualPaid: 39670, expectedIncome: 37290, platformCommission: 2380, refundedExpectedIncome: 0, refundedCommission: 0,
  });
  expect(resolveRefundAdjustedIncomeMetrics({ platform: "美团", amountScale: 100, actualPaid: 661.1, refundAmount: 264.4, expectedIncome: 622.37, platformCommission: 39.73 })).toMatchObject({
    expectedIncome: 372.9, platformCommission: 23.8,
  });
});
test("历史手动到手不能覆盖美团退款后的自动重算", () => {
  expect(resolveRefundAdjustedIncomeMetrics({ platform: "美团", actualPaid: 66110, refundAmount: 26440, expectedIncome: 37000, platformCommission: 2380 })).toMatchObject({
    expectedIncome: 37290, platformCommission: 2380,
  });
});
test("全額退款到手和佣金归零，无退款时保持平台金额", () => {
  expect(resolveRefundAdjustedIncomeMetrics({ platform: "美团", actualPaid: 66110, refundAmount: 66110, expectedIncome: 62237, platformCommission: 3973 })).toMatchObject({
    expectedIncome: 0, platformCommission: 0,
  });
  expect(resolveRefundAdjustedIncomeMetrics({ platform: "美团", actualPaid: 66110, refundAmount: 0, expectedIncome: 62237, platformCommission: 3973 })).toMatchObject({
    expectedIncome: 62237, platformCommission: 3973,
  });
});
