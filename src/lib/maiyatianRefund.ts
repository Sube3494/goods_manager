import { readConfirmedRefundAmountFromRawPayload, readEffectiveConfirmedRefunds } from "./orderFinancials";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

export function readMaiyatianRefundGoods(value: Record<string, unknown>) {
  try {
    const parsed = typeof value.goods_format === "string" ? JSON.parse(value.goods_format) : value.goods_format;
    if (Array.isArray(parsed)) return parsed.map(record);
  } catch { /* 缺少或损坏的明细不能证明整单退款。 */ }
  return Array.isArray(value.goods) ? value.goods.map(record) : [];
}

function matchesGoods(goods: Record<string, unknown>, refundGoods: Record<string, unknown>) {
  const orderGoodsId = String(refundGoods.order_goods_id || "");
  if (orderGoodsId && goods.id) return orderGoodsId === String(goods.id);
  const extra = (() => { try { return record(typeof goods.goods_extra === "string" ? JSON.parse(goods.goods_extra) : goods.goods_extra); } catch { return {}; } })();
  const originalSku = String(refundGoods.original_sku_id || "");
  if (originalSku && extra.original_sku_id) return originalSku === String(extra.original_sku_id);
  const sku = String(refundGoods.sku_code || "");
  if (sku && goods.sku_code) return sku === String(goods.sku_code);
  const goodsId = String(refundGoods.out_goods_id || refundGoods.goods_id || "");
  return Boolean(goodsId && goodsId === String(goods.goods_id || goods.source_id || ""));
}

export function readMaiyatianItemRefundQuantity(goodsValue: unknown, rawPayload: unknown) {
  const goods = record(goodsValue);
  const quantity = Math.max(0, Number(goods.number ?? goods.quantity ?? 0));
  const fromDetails = readEffectiveConfirmedRefunds(rawPayload).reduce((sum, refund) => (
    sum + readMaiyatianRefundGoods(refund).filter((entry) => matchesGoods(goods, entry))
      .reduce((count, entry) => count + Math.max(0, Number(entry.number || 0)), 0)
  ), 0);
  const taggedQuantity = /已退款\s*(\d+)\s*件/.exec(String(goods.part_refund_title || ""));
  return Math.min(quantity, Math.max(fromDetails, taggedQuantity ? Number(taggedQuantity[1]) : 0));
}

export function summarizeMaiyatianRefund(rawPayload: unknown, actualPaid?: unknown) {
  const raw = record(rawPayload);
  const goods = Array.isArray(raw.goods) ? raw.goods.map(record) : [];
  const confirmed = readEffectiveConfirmedRefunds(rawPayload);
  const amount = readConfirmedRefundAmountFromRawPayload(rawPayload);
  const paid = Math.max(0, Number(actualPaid ?? record(raw.fee).user_fee ?? 0));
  const totalQuantity = goods.reduce((sum, item) => sum + Math.max(0, Number(item.number || 0)), 0);
  const returnedQuantity = goods.reduce((sum, item) => sum + readMaiyatianItemRefundQuantity(item, rawPayload), 0);
  let kind: "partial" | "full" | "unconfirmed" | "unknown" = "unknown";
  if (paid > 0 && amount >= paid) kind = "full";
  else if (totalQuantity > 0 && returnedQuantity > 0) kind = returnedQuantity < totalQuantity ? "partial" : "full";
  else if (paid > 0 && amount > 0 && amount < paid) kind = "partial";
  else if (confirmed.length === 0) kind = "unconfirmed";
  return { kind, amount, returnedQuantity, totalQuantity };
}

export function resolveMaiyatianRefundStatus(rawPayload: unknown, currentStatus?: string | null, actualPaid?: unknown) {
  const raw = record(rawPayload);
  const summary = summarizeMaiyatianRefund(rawPayload, actualPaid);
  if (summary.kind === "full") return "已取消";
  if (summary.kind !== "partial") return currentStatus || undefined;
  const delivery = record(raw.delivery);
  const text = [raw.status, raw.tips, delivery.track].join(" ");
  const finished = Number(raw.finished_time || delivery.finished_time || 0);
  if (finished > 0 || /已完成|配送完成|已送达|用户已收货|completed|done/.test(text)) return "已完成";
  if (/配送中|派送中|已取货|delivering/.test(text)) return "配送中";
  if (currentStatus && !/取消|cancel|close|退款/.test(currentStatus)) return currentStatus;
  return "待配送";
}
