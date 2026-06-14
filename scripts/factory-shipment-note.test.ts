import { buildFactoryShipmentNote, parseFactoryShipmentNote } from "../src/lib/utils";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const note = buildFactoryShipmentNote({
  recipientName: "张三",
  recipientPhone: "13800138000",
  recipientAddress: "上海市浦东新区测试路 88 号",
  paymentStatus: "未支付",
  compensationStatus: "待补偿",
  compensationLogisticsName: "顺丰",
  compensationTrackingNumber: "SF-COMP-001",
  compensationItems: [{ itemKey: "prod-1", quantity: 1 }],
  trackingEntries: [
    {
      itemKey: "item-a",
      logisticsName: "中通",
      trackingNumber: "ZT-001",
      shippingFee: 12,
    },
    {
      itemKey: "item-b",
      logisticsName: "圆通",
      trackingNumber: "YT-002",
      shippingFee: 8,
    },
  ],
  remark: "测试备注",
});

const parsed = parseFactoryShipmentNote(note);

assert(parsed.compensationLogisticsName === "顺丰", "应正确解析补偿物流");
assert(parsed.compensationTrackingNumber === "SF-COMP-001", "应正确解析补偿单号");
assert(parsed.trackingEntries.length === 2, "补偿单号存在时不应丢失发货单号记录");
assert(parsed.trackingEntries[0]?.itemKey === "item-a", "应保留第一条发货记录的 itemKey");
assert(parsed.trackingEntries[0]?.trackingNumber === "ZT-001", "应保留第一条发货记录的快递单号");
assert(parsed.trackingEntries[1]?.itemKey === "item-b", "应保留第二条发货记录的 itemKey");
assert(parsed.trackingEntries[1]?.trackingNumber === "YT-002", "应保留第二条发货记录的快递单号");

console.log("factory-shipment-note test passed");
