export const AUTO_INBOUND_TYPE = "AutoInbound";
export const AUTO_INBOUND_NOTE_KEYWORD = "库存不足，系统自动补齐";
export const ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD = "订单管理缺库存采购";

export function isAutoInboundOrderLike(input: { type?: string | null; note?: string | null }) {
  const type = String(input.type || "").trim();
  const note = String(input.note || "").trim();

  return type === AUTO_INBOUND_TYPE || note.includes(AUTO_INBOUND_NOTE_KEYWORD);
}

export function isOrderShortagePurchaseLike(input: { note?: string | null }) {
  const note = String(input.note || "").trim();
  return note.includes(ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD);
}
