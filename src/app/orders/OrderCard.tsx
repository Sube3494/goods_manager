"use client";

import { Component, memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MapPin,
  Navigation,
  Package2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  TimerReset,
  Truck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { createPortal } from "react-dom";
import { AutoPickOrder, AutoPickOrderItem, AutoPickIntegrationConfig } from "@/lib/types";
type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound" | "sync-brush";
import {
  getBaseAutoPickStatusDisplay,
  isAutoPickOrderAbnormalStatus,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderTerminalStatus,
} from "@/lib/autoPickOrderStatus";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

export function createDefaultSelfDeliveryTiming() {
  return {
    pickupMinutes: 8,
    minutesPerKm: 3,
    riderUpstairsMinutes: 5,
    deadlineLeadMinutes: 5,
  };
}

export function normalizeSelfDeliveryTiming(input: unknown) {
  const payload = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaults = createDefaultSelfDeliveryTiming();
  const readNumber = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  return {
    pickupMinutes: readNumber(payload.pickupMinutes, defaults.pickupMinutes),
    minutesPerKm: readNumber(payload.minutesPerKm, defaults.minutesPerKm),
    riderUpstairsMinutes: readNumber(payload.riderUpstairsMinutes, defaults.riderUpstairsMinutes),
    deadlineLeadMinutes: readNumber(payload.deadlineLeadMinutes, defaults.deadlineLeadMinutes),
  };
}

export function normalizeOptionalSelfDeliveryTiming(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return normalizeSelfDeliveryTiming(input);
}

export function readIntegrationConfigResponse(data: unknown): AutoPickIntegrationConfig {
  const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    pluginBaseUrl: String(payload.pluginBaseUrl || ""),
    inboundApiKey: String(payload.inboundApiKey || ""),
    maiyatianCookie: String(payload.maiyatianCookie || ""),
    maiyatianShopMappings: Array.isArray(payload.maiyatianShopMappings) ? payload.maiyatianShopMappings.map((item) => {
      const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        maiyatianShopId: String(record.maiyatianShopId || ""),
        maiyatianShopName: String(record.maiyatianShopName || ""),
        maiyatianShopAddress: String(record.maiyatianShopAddress || ""),
        localShopName: String(record.localShopName || ""),
        cityCode: record.cityCode ? String(record.cityCode) : undefined,
        cityName: record.cityName ? String(record.cityName) : undefined,
        libraryId: record.libraryId ? String(record.libraryId) : undefined,
        libraryName: record.libraryName ? String(record.libraryName) : undefined,
        brushCommission: typeof record.brushCommission === "number" ? record.brushCommission : null,
        selfDeliveryTiming: normalizeOptionalSelfDeliveryTiming(record.selfDeliveryTiming),
      };
    }) : [],
    selfDeliveryTiming: normalizeSelfDeliveryTiming(payload.selfDeliveryTiming),
    defaultBrushCommission: typeof payload.defaultBrushCommission === "number" ? payload.defaultBrushCommission : 0,
  };
}

export function serializeIntegrationConfig(config: Pick<AutoPickIntegrationConfig, "pluginBaseUrl" | "inboundApiKey" | "maiyatianCookie" | "maiyatianShopMappings" | "selfDeliveryTiming" | "defaultBrushCommission">) {
  return JSON.stringify({
    pluginBaseUrl: String(config.pluginBaseUrl || ""),
    inboundApiKey: String(config.inboundApiKey || ""),
    maiyatianCookie: String(config.maiyatianCookie || ""),
    maiyatianShopMappings: Array.isArray(config.maiyatianShopMappings) ? config.maiyatianShopMappings.map((item) => ({
      ...item,
      selfDeliveryTiming: normalizeOptionalSelfDeliveryTiming(item.selfDeliveryTiming),
    })) : [],
    selfDeliveryTiming: normalizeSelfDeliveryTiming(config.selfDeliveryTiming),
    defaultBrushCommission: typeof config.defaultBrushCommission === "number" ? config.defaultBrushCommission : 0,
  });
}

export function serializeMaiyatianMappings(config: Pick<AutoPickIntegrationConfig, "maiyatianShopMappings">) {
  return JSON.stringify(Array.isArray(config.maiyatianShopMappings) ? config.maiyatianShopMappings : []);
}

export function getSyncErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim();

  if (!normalized) {
    return "批量同步失败";
  }

  if (normalized.includes("Provided Date object is invalid") || normalized.includes("orderTime")) {
    return "批量同步失败：部分订单时间格式异常，请重试；如果持续出现，我已经保留了详细日志可继续排查。";
  }

  if (normalized.length > 180) {
    return "批量同步失败：服务端返回了过长的底层错误，详细原因已写入控制台日志。";
  }

  return normalized;
}

export function formatTimingNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function formatSelfDeliveryTimingLabel(timing: ReturnType<typeof createDefaultSelfDeliveryTiming>) {
  return `${formatTimingNumber(timing.pickupMinutes)} + 距离 × ${formatTimingNumber(timing.minutesPerKm)} + ${formatTimingNumber(timing.riderUpstairsMinutes)}`;
}

export function removeYear(timeStr?: string | null) {
  if (!timeStr) return "-";
  const trimmed = timeStr.trim();
  if (/^\d{4}[-/]/.test(trimmed)) {
    return trimmed.substring(5).replace("T", " ").replace(/\.\d+Z$/, "").replace(/Z$/, "");
  }
  return trimmed;
}

export function toCurrency(value: number | null | undefined) {
  const amount = Number(value || 0) / 100;
  return `¥${amount.toFixed(2)}`;
}

function getDisplayText(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || "-";
}

export function formatPercent(value: number | null | undefined) {
  const rate = Number(value || 0);
  return `${(rate * 100).toFixed(1)}%`;
}

export function getCommissionDisplay(value: number | null | undefined) {
  const amount = Math.abs(Number(value || 0));
  return {
    label: "佣金",
    value: toCurrency(amount),
  };
}

export function getExpectedIncome(
  expectedIncome: number | null | undefined,
  actualPaid: number | null | undefined,
  platformCommission: number | null | undefined,
  platform?: string | null
) {
  const directIncome = Number(expectedIncome);
  const paid = Number(actualPaid || 0);
  const isOffline = platform === "线下交易" || String(platform || "").toLowerCase() === "other";

  if (isOffline) {
    if (Number.isFinite(directIncome) && directIncome > 0) {
      return directIncome;
    }
    return Math.max(0, paid);
  }

  if (Number.isFinite(directIncome)) {
    return directIncome;
  }
  const commission = Number(platformCommission || 0);
  return paid - commission;
}

export function getDeliveryFee(delivery: unknown) {
  if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) {
    return 0;
  }
  const value = Number((delivery as Record<string, unknown>).sendFee || 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function summarizeOrders(orders: AutoPickOrder[]) {
  const normalizeProfitPlatform = (value?: string | null) => {
    const raw = String(value || "").trim();
    const lower = raw.toLowerCase();
    if (raw.includes("美团") || lower.includes("meituan") || lower === "shangou") return "美团";
    if (raw.includes("京东") || lower.includes("jd") || lower === "daojia") return "京东";
    if (raw.includes("淘宝") || raw.includes("天猫") || lower === "taobao" || lower === "ebai") return "淘宝";
    if (raw.includes("抖店") || raw.includes("抖音") || lower === "doudian" || lower === "douyin") return "抖店";
    return "线下交易";
  };
  return orders.reduce((acc, order) => {
    if (!isCancelledStatus(order.status) && !isDeletedStatus(order.status)) {
      const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
      const expectedIncome = Math.max(0, getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission, order.platform));
      const actualPaid = isOffline && (!order.actualPaid || Number(order.actualPaid) <= 0) && expectedIncome > 0
        ? expectedIncome
        : Math.max(0, Number(order.actualPaid || 0));
      acc.receivedAmount += expectedIncome;
      if (order.isMainSystemSelfDelivery) {
        acc.brushReceivedAmount += expectedIncome;
        acc.brushPaidAmount += actualPaid;
      } else {
        acc.realReceivedAmount += expectedIncome;
        acc.realPaidAmount += actualPaid;
      }
      acc.platformCommission += Math.max(0, Number(order.platformCommission || 0));
      acc.validOrderCount += 1;
      const deliveryFee = getDeliveryFee(order.delivery);
      acc.totalDeliveryFee += deliveryFee;

      const platform = order.platform || "其他";
      if (!acc.platformReceived[platform]) {
        acc.platformReceived[platform] = { amount: 0, count: 0 };
      }
      acc.platformReceived[platform].amount += expectedIncome;
      acc.platformReceived[platform].count += 1;

      const orderPureProfit = typeof order.pureProfit === "number" && Number.isFinite(order.pureProfit) ? order.pureProfit : 0;
      acc.pureProfit += orderPureProfit;
      if (!acc.platformProfit[platform]) {
        acc.platformProfit[platform] = { amount: 0, count: 0 };
      }
      acc.platformProfit[platform].amount += orderPureProfit;
      acc.platformProfit[platform].count += 1;

      const shopName = String(order.matchedShopName || "未绑定店铺").trim() || "未绑定店铺";
      const shopKey = order.matchedShopName ? shopName : "unmatched";
      if (!acc.shopProfit[shopKey]) {
        acc.shopProfit[shopKey] = {
          id: null,
          name: shopName,
          amount: 0,
          count: 0,
          deliveryFee: 0,
          productCost: 0,
          platformCommission: 0,
          platformProfit: {},
        };
      }
      acc.shopProfit[shopKey].amount += orderPureProfit;
      acc.shopProfit[shopKey].count += 1;
      acc.shopProfit[shopKey].deliveryFee += deliveryFee;
      acc.shopProfit[shopKey].productCost += Math.max(0, Number(order.productCost || 0));
      acc.shopProfit[shopKey].platformCommission += Math.max(0, Number(order.platformCommission || 0));
      const profitPlatform = normalizeProfitPlatform(order.platform);
      acc.shopProfit[shopKey].platformProfit[profitPlatform] = (acc.shopProfit[shopKey].platformProfit[profitPlatform] || 0) + orderPureProfit;

      if (deliveryFee > 0) {
        acc.platformDelivery[platform] = (acc.platformDelivery[platform] || 0) + deliveryFee;
      }
    } else {
      const platformStr = String(order.platform || "").trim().toLowerCase();
      const deliveryObj = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
        ? order.delivery as Record<string, unknown>
        : {};
      const logisticNameStr = String(deliveryObj.logisticName || deliveryObj.logistic_name || "").trim().toLowerCase();
      const isMeituanRelated = platformStr.includes("美团") || platformStr.includes("meituan") ||
                               logisticNameStr.includes("美团") || logisticNameStr.includes("meituan");
      if (order.hasOutbound && !isMeituanRelated) {
        acc.totalDeliveryFee += getDeliveryFee(order.delivery);
      }
    }
    acc.itemCount += getItemCount(getVisibleOrderItems(order.items));
    return acc;
  }, {
    receivedAmount: 0,
    realReceivedAmount: 0,
    brushReceivedAmount: 0,
    realPaidAmount: 0,
    brushPaidAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
    platformReceived: {} as Record<string, { amount: number; count: number }>,
    platformDelivery: {} as Record<string, number>,
    pureProfit: 0,
    platformProfit: {} as Record<string, { amount: number; count: number }>,
    shopProfit: {} as Record<string, { id: string | null; name: string; amount: number; count: number; deliveryFee: number; productCost: number; platformCommission: number; platformProfit: Record<string, number> }>,
  });
}

export function getOrderActionErrorMessage(raw: unknown) {
  const reason = String(raw || "").trim();

  switch (reason) {
    case "target-order-card-not-found":
    case "target-order-container-not-found":
      return "当前没有找到这张订单，请先确认订单仍在可操作列表中。";
    case "target-order-not-in-detail":
      return "当前读取到的订单详情和目标订单不一致，请刷新后重试。";
    case "maiyatian-confirm-page-not-found":
    case "not-confirm-page":
      return "当前不在可操作状态，请先确认麦芽田订单页状态。";
    case "self-delivery-option-not-found":
      return "当前订单没有找到自配送入口。";
    case "complete-delivery-button-not-found":
      return "当前订单没有找到完成配送按钮。";
    case "command-already-running":
      return "当前有其他命令正在执行，请稍后再试。";
    case "complete-delivery-api-not-implemented":
      return "完成配送接口还没完全迁进主系统，这一步我还在补。";
    case "picking-not-completed":
      return "当前订单还没完成拣货，暂时不能执行这个操作。";
    case "Order already completed":
      return "订单已完成，不需要重复操作。";
    case "Order already cancelled":
      return "订单已取消，不需要继续处理。";
    case "Order already deleted":
      return "订单已删除，不需要继续处理。";
    case "Pickup order does not require self delivery":
      return "到店自取订单不需要发起自配送。";
    case "该订单已生成出库单":
      return "这张订单已经生成过出库单了。";
    case "已删除订单不能生成出库":
      return "已删除订单不能生成出库。";
    case "已取消订单不能生成出库":
      return "已取消订单不能生成出库。";
    case "Non-pickup order does not require pickup complete":
      return "这不是到店自取订单，不需要完成自提。";
    case "订单未完成，暂时不能同步刷单":
      return "订单还没完成，暂时不能同步刷单。";
    case "订单商品还没匹配到系统商品，暂时不能同步刷单":
      return "订单商品还没匹配到系统商品，暂时不能同步刷单。";
    case "这不是自配送订单，不能同步刷单":
      return "这不是自配送订单，不能同步刷单。";
    case "当前订单不符合刷单同步条件":
      return "当前订单不符合刷单同步条件。";
    default:
      return reason || "操作失败";
  }
}

export function getBrushSyncSkippedReasonText(raw: unknown) {
  const reason = String(raw || "").trim();

  switch (reason) {
    case "not-self-delivery":
      return "非自配送";
    case "not-main-system-self-delivery":
      return "未标记刷单";
    case "order-not-completed":
      return "订单未完成";
    case "missing-matched-products":
      return "商品未匹配";
    case "order-not-found":
      return "订单不存在";
    default:
      return reason || "";
  }
}

export function getAutoPickSyncSkippedReasonText(raw: unknown) {
  const reason = String(raw || "").trim();

  if (!reason) {
    return "";
  }

  if (reason.startsWith("missing or invalid fields:")) {
    const rawFields = reason.slice("missing or invalid fields:".length).trim();
    const fields = rawFields
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean)
      .map((field) => {
        switch (field) {
          case "platform":
            return "平台";
          case "orderNo":
            return "订单号";
          case "orderTime":
            return "下单时间";
          case "userAddress":
            return "收货地址";
          case "id":
            return "订单 ID";
          case "items":
            return "商品项";
          default:
            return field;
        }
      });

    return fields.length > 0 ? `缺少或无效字段：${fields.join("、")}` : "订单字段不完整";
  }

  switch (reason) {
    case "payload is not an object":
      return "订单数据格式不正确";
    case "payload shape is invalid":
      return "订单数据结构不正确";
    default:
      return reason;
  }
}


export function getDisplayStatus(order: Pick<AutoPickOrder, "isPickup" | "status" | "platform" | "isPickCompleted">) {
  const baseStatus = getBaseAutoPickStatusDisplay(order.status);
  if (order.platform === "线下交易") {
    return baseStatus;
  }
  if (!order.isPickup) {
    return baseStatus;
  }

  if (baseStatus === "已取消") return "已取消";
  if (baseStatus === "已删除") return "已删除";
  if (baseStatus === "已完成") return "已取货";
  return "待取货";
}

export function isCompletedStatus(status?: string | null) {
  return isAutoPickOrderCompletedStatus(status);
}

export function isCancelledStatus(status?: string | null) {
  return isAutoPickOrderCancelledStatus(status);
}

export function isDeletedStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已删除";
}

export function isTerminalStatus(status?: string | null) {
  return isAutoPickOrderTerminalStatus(status);
}

export function isDeliveringStatus(status?: string | null) {
  return isAutoPickOrderDeliveringStatus(status);
}

export function isAbnormalStatus(status?: string | null) {
  return isAutoPickOrderAbnormalStatus(status);
}

export function isBrushSyncEligibleOrder(order: Pick<AutoPickOrder, "status" | "isPickup" | "isMainSystemSelfDelivery">) {
  return isCompletedStatus(order.status) && !order.isPickup && !order.isMainSystemSelfDelivery;
}

export function getStatusTone(display: string) {

  if (display === "已取消") {
    return {
      badge: "border-slate-500/15 bg-slate-500/10 text-slate-600 dark:text-slate-400",
      dot: "bg-slate-500",
      soft: "bg-slate-500/8 text-slate-600 dark:text-slate-300",
    };
  }

  if (display === "已删除") {
    return {
      badge: "border-zinc-500/15 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
      dot: "bg-zinc-500",
      soft: "bg-zinc-500/8 text-zinc-700 dark:text-zinc-300",
    };
  }

  if (display === "已完成" || display === "已取货") {
    return {
      badge: "border-sky-500/15 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      dot: "bg-sky-500",
      soft: "bg-sky-500/8 text-sky-700 dark:text-sky-300",
    };
  }

  if (display === "配送中") {
    return {
      badge: "border-sky-500/15 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      dot: "bg-sky-500",
      soft: "bg-sky-500/8 text-sky-700 dark:text-sky-300",
    };
  }

  return {
    badge: "border-amber-500/15 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    soft: "bg-amber-500/8 text-amber-700 dark:text-amber-300",
  };
}

export function hasAutoCompleteFailure(order: Pick<AutoPickOrder, "autoCompleteJobStatus">) {
  return String(order.autoCompleteJobStatus || "").trim().toLowerCase() === "failed"
    || String(order.autoCompleteJobStatus || "").trim().toUpperCase() === "FAILED";
}

export function hasAutoOutboundFailure(order: Pick<AutoPickOrder, "autoOutboundStatus" | "hasOutbound" | "actualPaid" | "expectedIncome" | "delivery">) {
  if (order.hasOutbound) {
    return false;
  }
  const deliveryFee = getDeliveryFee(order.delivery);
  const isPureDeliveryFeeOrder = Number(order.actualPaid || 0) <= 0 && Number(order.expectedIncome || 0) <= 0 && deliveryFee > 0;
  if (isPureDeliveryFeeOrder) {
    return false;
  }
  return String(order.autoOutboundStatus || "").trim().toLowerCase() === "failed";
}

export function isPureManualOfflineOrder(order: { platform?: string | null; orderNo?: string | null; sourceId?: string | null; rawPayload?: unknown }) {
  const rawPayload = order.rawPayload && typeof order.rawPayload === "object" && !Array.isArray(order.rawPayload)
    ? order.rawPayload as Record<string, unknown>
    : {};
  const systemMeta = rawPayload.systemMeta && typeof rawPayload.systemMeta === "object" && !Array.isArray(rawPayload.systemMeta)
    ? rawPayload.systemMeta as Record<string, unknown>
    : {};
  if (rawPayload.isManualOffline === true || systemMeta.isManualOffline === true) {
    return true;
  }
  const orderNo = String(order.orderNo || "").trim();
  const sourceId = String(order.sourceId || "").trim();
  if (orderNo.startsWith("OFFLINE-") || sourceId.startsWith("OFFLINE-")) {
    return true;
  }
  return false;
}

export function getPlatformBadgeMeta(platform?: string | null, rawPayload?: unknown) {
  const text = String(platform || "").trim();
  const normalized = text.toLowerCase();

  const raw = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
    ? rawPayload as Record<string, unknown>
    : {};
  const isManualOffline = raw.isManualOffline === true || (raw.systemMeta as any)?.isManualOffline === true;

  if (isManualOffline || normalized === "线下交易") {
    return {
      iconSrc: "/platform/线下交易.svg",
      iconAlt: "线下交易",
    };
  }

  if (normalized.includes("美团") || normalized.includes("meituan") || normalized === "shangou") {
    return {
      iconSrc: "/platform/美团.svg",
      iconAlt: "美团",
    };
  }

  if (normalized.includes("京东") || normalized.includes("jd") || normalized === "daojia") {
    return {
      iconSrc: "/platform/京东.svg",
      iconAlt: "京东",
    };
  }

  if (normalized.includes("淘宝") || normalized.includes("taobao") || normalized === "ebai") {
    return {
      iconSrc: "/platform/淘宝.svg",
      iconAlt: "淘宝",
    };
  }

  if (normalized.includes("抖店") || normalized.includes("抖音") || normalized === "doudian" || normalized === "douyin") {
    return {
      iconSrc: "/platform/doudian.svg",
      iconAlt: "抖店",
    };
  }

  return {
    iconSrc: "/platform/其他.svg",
    iconAlt: text === "other" ? "其他平台" : (text || "其他平台"),
  };
}

export function isJdOrder(platform?: string | null, channelTag?: string | null) {
  const p = String(platform || "").trim().toLowerCase();
  const c = String(channelTag || "").trim().toLowerCase();
  return p === "jd" || p.includes("jingdong") || p.includes("jddj") || p.includes("京东") || c === "daojia";
}

export function isMeituanOrder(platform?: string | null, channelTag?: string | null) {
  const p = String(platform || "").trim().toLowerCase();
  const c = String(channelTag || "").trim().toLowerCase();
  return p.includes("美团") || p.includes("meituan") || p === "shangou" || c === "shangou";
}

export function isTaobaoOrder(platform?: string | null, channelTag?: string | null) {
  const p = String(platform || "").trim().toLowerCase();
  const c = String(channelTag || "").trim().toLowerCase();
  return p.includes("淘宝") || p.includes("天猫") || p === "taobao" || p === "ebai" || c === "taobao" || c === "ebai";
}

export function isDoudianOrder(platform?: string | null, channelTag?: string | null) {
  const p = String(platform || "").trim().toLowerCase();
  const c = String(channelTag || "").trim().toLowerCase();
  return p.includes("抖店") || p.includes("抖音") || p === "doudian" || p === "douyin" || c === "doudian" || c === "douyin";
}

function readGoodsExtraRecord(rawPayload: Record<string, unknown>) {
  const goodsExtra = rawPayload.goods_extra || rawPayload.goodsExtra;
  if (typeof goodsExtra === "string") {
    try {
      const parsed = JSON.parse(goodsExtra);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return goodsExtra && typeof goodsExtra === "object" && !Array.isArray(goodsExtra)
    ? goodsExtra as Record<string, unknown>
    : {};
}

function readDisplaySourceId(item: AutoPickOrderItem, platform?: string | null, channelTag?: string | null) {
  const platformSkuId = String(item.platformSkuId || "").trim();
  if (platformSkuId) {
    return platformSkuId;
  }

  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : {};
  if (isMeituanOrder(platform, channelTag)) {
    const goodsExtra = readGoodsExtraRecord(rawPayload);
    return String(goodsExtra.original_sku_id || "").trim();
  }
  if (isTaobaoOrder(platform, channelTag)) {
    return String(rawPayload.sku_id || rawPayload.skuId || "").trim();
  }
  if (isDoudianOrder(platform, channelTag)) {
    return String(
      rawPayload.sku_id
      || rawPayload.skuId
      || rawPayload.source_id
      || rawPayload.sourceId
      || ""
    ).trim();
  }
  return String(
    item.productNo
    || rawPayload.source_id
    || rawPayload.sourceId
    || ""
  ).trim();
}

export function getOrderItemDisplay(item: AutoPickOrderItem, platform?: string | null, channelTag?: string | null) {
  const matchedProduct = item.matchedProduct;
  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : {};
  const isManualDeliveryPlaceholder =
    String(item.productNo || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NO
    || rawPayload.isManualDeliveryPlaceholder === true
    || String(item.productName || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NAME;
  const sourceId = readDisplaySourceId(item, platform, channelTag);

  return {
    name: matchedProduct?.name || (isManualDeliveryPlaceholder ? "可添加发货货品" : item.productName) || "未命名商品",
    sku: matchedProduct?.sku || (isManualDeliveryPlaceholder ? "不加则只记配送费" : item.productNo) || "-",
    image: matchedProduct?.image || item.thumb || null,
    quantity: item.quantity,
    sourceId: isManualDeliveryPlaceholder ? undefined : sourceId || undefined,
    optionalMatch: isManualDeliveryPlaceholder,
  };
}

export function getExpandedOrderItemDisplays(item: AutoPickOrderItem, platform?: string | null, channelTag?: string | null) {
  const matchedProduct = item.matchedProduct;
  const sourceId = readDisplaySourceId(item, platform, channelTag);

  if (Array.isArray(item.displayItems) && item.displayItems.length > 0) {
    return item.displayItems.map((displayItem) => ({
      name: displayItem.name || item.productName || "未命名商品",
      sku: displayItem.sku || matchedProduct?.sku || item.productNo || "-",
      image: displayItem.image || item.thumb || null,
      quantity: displayItem.quantity,
      sourceId: (displayItem as any).sourceId || undefined,
    }));
  }

  return [getOrderItemDisplay(item, platform, channelTag)];
}

const MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NO = "__manual_delivery_placeholder__";
const MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NAME = "手工配送占位商品";

function isManualDeliveryPlaceholderItem(item: AutoPickOrderItem) {
  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : {};

  return String(item.productNo || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NO
    || rawPayload.isManualDeliveryPlaceholder === true
    || String(item.productName || "").trim() === MANUAL_DELIVERY_PLACEHOLDER_PRODUCT_NAME;
}

function isUnmatchedOrIgnoredItem(item: AutoPickOrderItem) {
  const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
    ? item.rawPayload as Record<string, unknown>
    : {};
  const isIgnored = rawPayload.ignoreOutbound === true
    || rawPayload.isManualIgnored === true
    || (item.matchedProduct as any)?.ignoreOutbound === true;
  if (isIgnored) {
    return true;
  }
  const hasDisplayItems = Array.isArray(item.displayItems) && item.displayItems.length > 0;
  return isManualDeliveryPlaceholderItem(item) && !item.matchedProduct && !hasDisplayItems;
}

function getVisibleOrderItems(items: AutoPickOrderItem[]) {
  return (items || []).filter((item) => !isUnmatchedOrIgnoredItem(item));
}

function isLegacyManualDeliveryPlaceholderOrder(order: AutoPickOrder) {
  return order.platform === "线下交易" && order.items.some(isManualDeliveryPlaceholderItem);
}

function getMatchedProductIds(item: AutoPickOrderItem) {
  const matched = item.matchedProduct;
  if (!matched) {
    return { productId: "", shopProductId: "" };
  }

  const id = String(matched.id || "").trim();
  const productId = String(matched.productId || (matched.sourceType === "product" ? id : "")).trim();
  const shopProductId = String(matched.shopProductId || (matched.sourceType === "shopProduct" ? id : "")).trim();

  return { productId, shopProductId };
}

function getReturnedProductKey(item: AutoPickOrderItem) {
  const { productId, shopProductId } = getMatchedProductIds(item);
  if (shopProductId) return `shop:${shopProductId}`;
  if (productId) return `product:${productId}`;
  return "";
}

export function getOrderSourceLabel(order: AutoPickOrder) {
  return order.matchedShopName || "";
}

export function getFulfillmentLabel(order: Pick<AutoPickOrder, "isPickup">) {
  if (order.isPickup) return "到店自取";
  return "配送上门";
}

export function getOrderTypeLabel(order: Pick<AutoPickOrder, "isSubscribe">) {
  if (order.isSubscribe) return "预约单";
  return "";
}

export function getItemCount(items: AutoPickOrderItem[]) {
  return items.reduce(
    (sum, item) => sum + getExpandedOrderItemDisplays(item).reduce((innerSum, displayItem) => innerSum + displayItem.quantity, 0),
    0
  );
}

export function formatDistanceKm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} km` : "-";
}

export function formatCompactDateTime(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "-";

  // 如果包含时间区间，比如 08-24 18:45-19:15 或 18:45-19:15
  const rangeMatch = text.match(/(\d{4}[-/])?(\d{2}[-/]\d{2}\s+)?(\d{1,2}:\d{2}(?::\d{2})?\s*[-~至]\s*\d{1,2}:\d{2}(?::\d{2})?)/);
  if (rangeMatch) {
    const datePart = rangeMatch[2] || "";
    const rangePart = rangeMatch[3];
    return `${datePart}${rangePart}`.trim();
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${month}-${day} ${hours}:${minutes}`;
  }

  const match = text.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}|\d{2}:\d{2})/);
  return match?.[1] || text;
}

export function getFilterDateValue(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return formatLocalDate(date);
  }

  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

export function getProductCostStatusText(order: Pick<AutoPickOrder, "productCostStatus" | "missingCostItemCount">) {
  if (order.productCostStatus === "pending-backfill") {
    const count = Math.max(0, Number(order.missingCostItemCount || 0));
    return count > 0 ? `待回填（${count}项缺成本）` : "待回填";
  }
  if (order.productCostStatus === "pending-outbound") {
    return "待出库";
  }
  return "";
}

export function shiftTimeMinutes(timeStr: string, deltaMinutes: number): string {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return timeStr;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  let totalMinutes = hours * 60 + minutes + deltaMinutes;
  totalMinutes = (totalMinutes % 1440 + 1440) % 1440;
  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
}

export function getDeadlineDisplay(order: Pick<AutoPickOrder, "isPickup" | "isSubscribe" | "deliveryDeadline" | "deliveryTimeRange" | "orderTime" | "createdAt"> & { platform?: string | null; channelTag?: string | null }) {
  const deadlineText = String(order.deliveryDeadline || "").trim();
  const rangeText = String(order.deliveryTimeRange || "").trim();
  const text = order.isPickup ? (rangeText || deadlineText) : (rangeText || deadlineText);
  if (!text) {
    return "-";
  }

  if (!/\d{1,2}:\d{2}/.test(text)) {
    return "-";
  }

  if (order.isPickup) {
    return text;
  }

  // 尝试提取规范的年-月-日日期前缀
  let datePrefix = "";
  const dateSource = deadlineText || String(order.orderTime || "") || String(order.createdAt || "");
  const dateMatch = dateSource.match(/^(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2})/);
  if (dateMatch) {
    datePrefix = dateMatch[0] + " ";
  }

  const isJd = isJdOrder(order.platform, order.channelTag);
  const isMeituan = isMeituanOrder(order.platform, order.channelTag);
  const isSubscribe = Boolean(order.isSubscribe);

  // 美团预约单：美团真实最晚送达时间 = 麦芽田基准时间 + 20分钟，真实时间区间为 30 分钟窗口
  if (isMeituan && isSubscribe) {
    const baseMatch = text.match(/\d{1,2}:\d{2}/);
    if (baseMatch) {
      const baseTime = baseMatch[0];
      const realStart = shiftTimeMinutes(baseTime, -10);
      const realEnd = shiftTimeMinutes(baseTime, 20);
      return `${datePrefix}${realStart}-${realEnd}`;
    }
  }

  // 优先匹配标准时间段: HH:mm-HH:mm, HH:mm~HH:mm, HH:mm至HH:mm 等
  const rangeMatch = text.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*[-~至]\s*(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (rangeMatch) {
    if (isSubscribe) {
      return `${datePrefix}${rangeMatch[1]}-${rangeMatch[2]}`;
    }
    const startTime = rangeMatch[1];
    const endTime = rangeMatch[2];
    const targetTime = isJd ? endTime : startTime;
    return `${datePrefix}${targetTime}`;
  }

  // 如果包含范围连字符
  const parts = text.split(/\s*[-~至]\s*/);
  if (parts.length > 1) {
    if (isSubscribe) {
      return text;
    }
    const targetSegment = isJd ? parts[parts.length - 1].trim() : parts[0].trim();
    const timeMatch = targetSegment.match(/\d{1,2}:\d{2}(:\d{2})?/);
    if (timeMatch) {
      return `${datePrefix}${timeMatch[0]}`;
    }
    return `${datePrefix}${targetSegment}`;
  }

  // 兜底：如果只是单一时间
  const timeMatch = text.match(/\d{1,2}:\d{2}(:\d{2})?/);
  if (timeMatch) {
    return `${datePrefix}${timeMatch[0]}`;
  }

  const firstTimeMatch = text.match(/^(.*?\d{1,2}:\d{2})/);
  return firstTimeMatch?.[1] ? `${datePrefix}${firstTimeMatch[1].trim()}` : "-";
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[22px] sm:text-[30px] font-black leading-none tracking-tight text-foreground">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

type PromotionPlatformAmounts = {
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
};

const PROMOTION_PLATFORM_ROWS: { key: keyof PromotionPlatformAmounts; label: string; icon: string }[] = [
  { key: "amountMeituan", label: "美团", icon: "/platform/美团.svg" },
  { key: "amountJingdong", label: "京东", icon: "/platform/京东.svg" },
  { key: "amountTaobao", label: "淘宝", icon: "/platform/淘宝.svg" },
];

export function PromotionEditModal({
  platforms,
  date,
  onSave,
  onClose,
}: {
  platforms: PromotionPlatformAmounts;
  date: string;
  onSave: (vals: PromotionPlatformAmounts) => Promise<boolean>;
  onClose: () => void;
}) {
  const [vals, setVals] = useState<PromotionPlatformAmounts>({ ...platforms });
  const [isSaving, setIsSaving] = useState(false);
  const total = vals.amountMeituan + vals.amountJingdong + vals.amountTaobao;

  const setField = (key: keyof PromotionPlatformAmounts, raw: string) => {
    const v = parseFloat(raw);
    setVals((prev) => ({ ...prev, [key]: isNaN(v) ? 0 : Math.max(0, v) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await onSave(vals);
    setIsSaving(false);
    if (ok) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-[28px] border border-black/8 bg-white/96 shadow-[0_24px_64px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-[#0d1420]/98">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">推广费录入</div>
            <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">{date}</h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4"
          >
            <X size={16} />
          </button>
        </div>

        {/* 三平台输入 */}
        <div className="px-6 flex flex-col gap-3">
          {PROMOTION_PLATFORM_ROWS.map((row, i) => (
            <label key={row.key} className="flex items-center gap-3 rounded-2xl border border-black/8 bg-black/2 px-4 dark:border-white/10 dark:bg-white/3 focus-within:ring-2 focus-within:ring-primary/12 focus-within:border-primary/30 transition-all">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.icon}
                alt={row.label}
                className="h-5 w-5 shrink-0 rounded-md object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              <span className="w-10 shrink-0 text-sm font-semibold text-foreground">{row.label}</span>
              <span className="text-sm font-bold text-muted-foreground">¥</span>
              <input
                autoFocus={i === 0}
                type="number"
                step="0.01"
                min="0"
                value={vals[row.key] === 0 ? "" : String(vals[row.key])}
                onChange={(e) => setField(row.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); else if (e.key === "Escape") onClose(); }}
                disabled={isSaving}
                placeholder="0.00"
                className="h-12 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
              />
            </label>
          ))}
        </div>

        {/* 合计 + 按钮 */}
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/6 dark:border-white/8 px-6 py-4">
          <div className="text-sm text-muted-foreground">
            合计 <span className="text-lg font-black text-foreground">¥{total.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="h-10 px-4 rounded-xl border border-black/8 bg-white/85 text-sm font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-10 px-5 rounded-xl bg-foreground text-sm font-black text-background transition-all hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black flex items-center gap-2"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PromotionMetricCard({
  amount,
  platforms,
  date,
  onSave,
}: {
  amount: number;
  platforms: PromotionPlatformAmounts;
  date: string;
  onSave: (vals: PromotionPlatformAmounts) => Promise<boolean>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="group relative rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 transition-all duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">推广费</div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-primary hover:underline cursor-pointer"
          >
            录入/编辑
          </button>
        </div>
        <div
          onClick={() => setIsModalOpen(true)}
          className="mt-2 text-[22px] sm:text-[30px] font-black leading-none tracking-tight text-foreground cursor-pointer hover:opacity-85 transition-opacity duration-200"
        >
          ¥{amount.toFixed(2)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{date} 推广费录入</p>
      </div>

      {isMounted && isModalOpen && (
        <PromotionEditModal
          platforms={platforms}
          date={date}
          onSave={onSave}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}


export function StatusBadge({ order }: { order: Pick<AutoPickOrder, "isPickup" | "status" | "platform" | "isPickCompleted"> }) {
  const display = getDisplayStatus(order);
  const tone = getStatusTone(display);
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-full border px-1.5 text-[10px] font-black sm:h-8 sm:gap-2 sm:px-3 sm:text-xs", tone.badge)}>
      <span className={cn("h-1 w-1 rounded-full sm:h-2 sm:w-2", tone.dot)} />
      {display}
    </span>
  );
}

function formatCurrencyInputFromCents(value: number | null | undefined) {
  return (Number(value || 0) / 100).toFixed(2);
}

function parseCurrencyInputToCents(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) {
    return null;
  }

  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) {
    return null;
  }

  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100);
}

function OrderAmountEditModal({
  order,
  onClose,
  onSave,
}: {
  order: AutoPickOrder;
  onClose: () => void;
  onSave: (values: { expectedIncome: number }) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const isOffline = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
  const [expectedIncome, setExpectedIncome] = useState(() => formatCurrencyInputFromCents(getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission, order.platform)));
  const [isSaving, setIsSaving] = useState(false);
  const isJd = String(order.platform || "").includes("京东");

  const handleSave = async () => {
    const nextExpectedIncome = parseCurrencyInputToCents(expectedIncome);

    if (nextExpectedIncome == null) {
      showToast("请输入有效的到手金额", "error");
      return;
    }

    setIsSaving(true);
    const ok = await onSave({
      expectedIncome: nextExpectedIncome,
    });
    setIsSaving(false);
    if (ok) {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => { if (!isSaving) onClose(); }} />
      <div className="relative w-full max-w-sm rounded-[28px] border border-black/8 bg-white/96 shadow-[0_24px_64px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-[#0d1420]/98">
        <div className="flex items-start justify-between gap-3 px-6 pb-4 pt-6">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">修改商家到手</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{isJd ? "只覆盖京东订单的到手金额，实付保持系统原值不变。" : isOffline ? "修改线下订单金额（实付与到手保持一致）。" : "手动记录这张手工配送单的商家到手金额，实付保持系统原值不变。"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/4"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 pb-6">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商家到手</span>
            <div className="mt-2 flex items-center rounded-2xl border border-black/8 bg-white/88 px-3 dark:border-white/10 dark:bg-white/5">
              <span className="text-sm font-bold text-muted-foreground">¥</span>
              <input
                value={expectedIncome}
                onChange={(event) => setExpectedIncome(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 w-full bg-transparent px-2 text-sm font-semibold text-foreground outline-none"
              />
            </div>
          </label>

          <p className="rounded-2xl border border-amber-500/15 bg-amber-500/8 px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-300">
            保存后统计会按这个到手金额计算。
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-black/8 bg-white/85 px-4 text-sm font-bold text-foreground transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-bold text-background transition-all hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
              保存到手
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface EditableOfflineOrderItem {
  id?: string;
  productId?: string;
  shopProductId?: string | null;
  productName: string;
  productNo?: string | null;
  thumb?: string | null;
  quantity: number;
  sourceType?: "product" | "shopProduct";
}

function OfflineOrderEditModal({
  order,
  onClose,
  onSave,
}: {
  order: AutoPickOrder;
  onClose: () => void;
  onSave: (values: {
    actualPaid: number;
    deliveryFee: number;
    userAddress: string;
    customerRemark: string;
    items?: EditableOfflineOrderItem[];
  }) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [actualPaid, setActualPaid] = useState(() => formatCurrencyInputFromCents(order.actualPaid));
  const [deliveryFee, setDeliveryFee] = useState(() => formatCurrencyInputFromCents(getDeliveryFee(order.delivery)));
  const [userAddress, setUserAddress] = useState(() => String(order.userAddress || ""));
  const [customerRemark, setCustomerRemark] = useState(() => String(order.customerRemark || ""));
  const [items, setItems] = useState<EditableOfflineOrderItem[]>(() => {
    if (!Array.isArray(order.items)) return [];
    return order.items.map((item) => {
      const rawRecord = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
        ? (item.rawPayload as Record<string, any>)
        : {};
      const manualMatched = rawRecord.manualMatchedProduct && typeof rawRecord.manualMatchedProduct === "object"
        ? (rawRecord.manualMatchedProduct as Record<string, any>)
        : null;
      return {
        id: item.id,
        productId: manualMatched?.id || item.matchedProduct?.id || "",
        shopProductId: manualMatched?.shopProductId || item.matchedProduct?.shopProductId || null,
        productName: item.productName || "未命名商品",
        productNo: item.productNo || item.matchedProduct?.sku || null,
        thumb: item.thumb || item.matchedProduct?.image || null,
        quantity: Math.max(1, Number(item.quantity) || 1),
        sourceType: (manualMatched?.sourceType as "product" | "shopProduct") || "shopProduct",
      };
    });
  });
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdateQuantity = (index: number, delta: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item))
    );
  };

  const handleQuantityInputChange = (index: number, val: string) => {
    const parsed = parseInt(val, 10);
    const validQty = isNaN(parsed) || parsed <= 0 ? 1 : parsed;
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: validQty } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearAllItems = () => {
    setItems([]);
  };

  const handleSelectProducts = (selectedProducts: any[]) => {
    if (!selectedProducts || selectedProducts.length === 0) return;

    setItems((prevItems) => {
      const nextItems = [...prevItems];
      selectedProducts.forEach((prod) => {
        const resolvedProductId = String(prod.productId || prod.sourceProductId || prod.id || "").trim();
        const resolvedShopProductId = prod.sourceType === "shopProduct" ? prod.id : (prod.shopProductId || null);
        if (!resolvedProductId && !resolvedShopProductId) return;

        const existingIndex = nextItems.findIndex(
          (item) => (resolvedProductId && item.productId === resolvedProductId) || (resolvedShopProductId && item.shopProductId === resolvedShopProductId)
        );

        if (existingIndex > -1) {
          nextItems[existingIndex].quantity += 1;
        } else {
          nextItems.push({
            productId: resolvedProductId,
            shopProductId: resolvedShopProductId,
            productName: prod.productName || prod.name || "未命名商品",
            productNo: prod.sku || prod.productNo || null,
            thumb: prod.productImage || prod.image || prod.thumb || null,
            quantity: 1,
            sourceType: prod.sourceType === "shopProduct" ? "shopProduct" : "product",
          });
        }
      });
      return nextItems;
    });

    setIsProductPickerOpen(false);
    showToast(`成功添加 ${selectedProducts.length} 个商品`, "success");
  };

  const handleSave = async () => {
    const nextActualPaid = parseCurrencyInputToCents(actualPaid);
    const nextDeliveryFee = parseCurrencyInputToCents(deliveryFee);
    if (nextActualPaid == null) {
      showToast("请输入有效的商品金额", "error");
      return;
    }
    if (nextDeliveryFee == null) {
      showToast("请输入有效的配送支出", "error");
      return;
    }

    if (items.length === 0 && nextActualPaid <= 0 && nextDeliveryFee <= 0) {
      showToast("请至少添加一个商品或填写商品金额/配送支出", "error");
      return;
    }

    setIsSaving(true);
    const ok = await onSave({
      actualPaid: nextActualPaid,
      deliveryFee: nextDeliveryFee,
      userAddress,
      customerRemark,
      items,
    });
    setIsSaving(false);
    if (ok) {
      onClose();
    }
  };

  const inputClass = "h-11 w-full rounded-2xl border border-black/8 bg-white/88 px-3 text-sm font-semibold text-foreground outline-none transition focus:border-primary/45 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5";

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => { if (!isSaving && !isProductPickerOpen) onClose(); }} />
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-[28px] border border-black/8 bg-white/96 shadow-[0_24px_64px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-[#0d1420]/98 overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-6 pb-4 pt-6 dark:border-white/10 shrink-0">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">修改线下订单</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">可调整金额、配送支出、地址、备注及商品明细（支持删除商品或清空为纯跑腿单）。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/4 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 overflow-y-auto flex-1 custom-scrollbar">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商品金额</span>
              <div className="mt-2 flex items-center rounded-2xl border border-black/8 bg-white/88 px-3 dark:border-white/10 dark:bg-white/5">
                <span className="text-sm font-bold text-muted-foreground">¥</span>
                <input value={actualPaid} onChange={(event) => setActualPaid(event.target.value)} inputMode="decimal" className="h-11 w-full bg-transparent px-2 text-sm font-semibold text-foreground outline-none" />
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">配送支出</span>
              <div className="mt-2 flex items-center rounded-2xl border border-black/8 bg-white/88 px-3 dark:border-white/10 dark:bg-white/5">
                <span className="text-sm font-bold text-muted-foreground">¥</span>
                <input value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} inputMode="decimal" className="h-11 w-full bg-transparent px-2 text-sm font-semibold text-foreground outline-none" />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">配送地址</span>
            <input value={userAddress} onChange={(event) => setUserAddress(event.target.value)} className={cn("mt-2", inputClass)} placeholder="线下送货上门 / 线下柜台交易" />
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">备注</span>
            <textarea value={customerRemark} onChange={(event) => setCustomerRemark(event.target.value)} rows={2} className={cn("mt-2 min-h-18 py-2.5 resize-none", inputClass)} placeholder="订单备注" />
          </label>

          {/* 商品明细编辑 */}
          <div className="rounded-2xl border border-black/8 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold text-foreground flex items-center gap-2">
                <span>商品明细</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {items.length} 件
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllItems}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 hover:bg-rose-100 transition-colors cursor-pointer"
                  >
                    <Trash2 size={12} />
                    清空商品
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  添加商品
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/10 py-6 text-center text-xs text-muted-foreground dark:border-white/10">
                暂无关联商品明细（将作为纯跑腿 / 配送费订单保存，不关联扣减库存）
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {items.map((item, index) => (
                  <div
                    key={`${item.id || item.productId || item.productName}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-black/6 bg-white p-2.5 shadow-2xs dark:border-white/8 dark:bg-[#151c28]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.thumb ? (
                        <img src={item.thumb} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover border border-black/6 dark:border-white/6" />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/5 text-muted-foreground dark:bg-white/5">
                          <Package2 size={18} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-foreground leading-tight" title={item.productName}>
                          {item.productName}
                        </div>
                        {item.productNo ? (
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            货号: {item.productNo}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center rounded-lg border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/5 p-0.5">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(index, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-muted-foreground hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => handleQuantityInputChange(index, e.target.value)}
                          className="h-6 w-9 bg-transparent text-center text-xs font-bold text-foreground outline-none border-none p-0"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(index, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-muted-foreground hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        title="删除该商品"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-black/8 bg-white/85 px-4 text-sm font-bold text-foreground transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-sm font-bold text-background transition-all hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black cursor-pointer"
            >
              {isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
              保存修改
            </button>
          </div>
        </div>
      </div>

      {isProductPickerOpen ? (
        <ProductSelectionModal
          isOpen={isProductPickerOpen}
          onClose={() => setIsProductPickerOpen(false)}
          onSelect={handleSelectProducts}
          selectedIds={items.map((it) => it.shopProductId || it.productId || "").filter(Boolean)}
          title="选择线下订单商品"
          fetchPath="/api/shop-products"
          showPlatformSelector={false}
          showCategoryFilter={true}
          showPrice={false}
          query={{
            all: "true",
            ...(order.shopId ? { shopId: order.shopId } : {}),
            ...(order.matchedShopName ? { shopName: order.matchedShopName } : {}),
          }}
          loadAllOnOpen={true}
          singleSelect={false}
          confirmLabel="添加至订单"
        />
      ) : null}
    </div>,
    document.body
  );
}

export function DetailStat({
  label,
  value,
  valueClassName,
  className,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-black/6 bg-black/2 px-3 py-2.5 dark:border-white/8 dark:bg-white/3 sm:px-3 sm:py-2", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-medium text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}

export function DetailBlock({
  label,
  labelAccessory,
  value,
  className,
}: {
  label: string;
  labelAccessory?: ReactNode;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-black/6 bg-black/2 px-3 py-3 dark:border-white/8 dark:bg-white/3 sm:px-3 sm:py-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        {labelAccessory}
      </div>
      <div className="mt-1.5 wrap-break-word text-sm font-medium leading-5 text-foreground">{value}</div>
    </div>
  );
}

export function ProductStripItem({
  display,
  onEditMatch,
  showEditMatch = false,
  matchedProduct,
  showMatchStatus = false,
  returnedQuantity = 0,
  returnedDetails = [],
  isJdOrder = false,
  isMeituanOrder = false,
  isTaobaoOrder = false,
  isDoudianOrder = false,
}: {
  display: { name: string; sku: string; image: string | null; quantity: number; sourceId?: string; optionalMatch?: boolean };
  onEditMatch?: () => void;
  showEditMatch?: boolean;
  matchedProduct?: AutoPickOrderItem['matchedProduct'];
  showMatchStatus?: boolean;
  returnedQuantity?: number;
  returnedDetails?: Array<{
    createdAt: string;
    reason: string;
    quantity: number;
    refundAmount?: number;
    extraExpense?: number;
  }>;
  isJdOrder?: boolean;
  isMeituanOrder?: boolean;
  isTaobaoOrder?: boolean;
  isDoudianOrder?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const platformSourceLabel = isJdOrder ? "JD SKU" : isMeituanOrder ? "美团 SKU ID" : isTaobaoOrder ? "淘宝 SKU ID" : isDoudianOrder ? "抖店 SKU ID" : "";
  const platformSourceShortLabel = isJdOrder ? "JD" : isMeituanOrder ? "MT" : isTaobaoOrder ? "TB" : isDoudianOrder ? "DD" : "";

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-black/6 bg-white/70 px-2.5 py-2 dark:border-white/8 dark:bg-white/4 sm:gap-3 sm:rounded-[18px] sm:px-3 sm:py-2.5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-white/6 sm:h-11 sm:w-11 sm:rounded-xl">
        {display.image && !imgError ? (
          <Image
            src={display.image}
            alt={display.name}
            width={44}
            height={44}
            className="h-full w-full object-cover"
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <Package2 size={16} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 wrap-break-word text-[13px] font-medium leading-4.5 text-foreground sm:text-sm sm:leading-5 sm:line-clamp-1">
          {display.name}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground sm:mt-1 sm:gap-x-2.5">
          <span className="shrink-0">{display.sku}</span>
          <span className="shrink-0">x{display.quantity}</span>
          {showMatchStatus ? (
            <span className={cn(
              "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap",
              (matchedProduct as any)?.ignoreOutbound
                ? "bg-slate-500/10 text-slate-700 dark:text-slate-400"
                : matchedProduct
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
            )}>
              {(matchedProduct as any)?.ignoreOutbound
                ? "无需出库"
                : matchedProduct ? (matchedProduct.isManual ? "手动" : "自动") : (display.optionalMatch ? "可选" : "未匹配")}
            </span>
          ) : null}
          {platformSourceLabel && display.sourceId ? (
            <span className="inline-flex shrink-0 items-center font-mono text-[10px] font-normal text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/20 leading-none whitespace-nowrap">
              <span className="hidden sm:inline">{platformSourceLabel}:&nbsp;</span>
              <span className="sm:hidden">{platformSourceShortLabel}:&nbsp;</span>
              {display.sourceId}
            </span>
          ) : null}
          {returnedQuantity > 0 ? (
            <span
              className="relative group inline-flex cursor-help items-center rounded-full border border-amber-500/15 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700 dark:text-amber-300"
            >
              已退{returnedQuantity > 1 ? ` x${returnedQuantity}` : ""}
              {returnedDetails && returnedDetails.length > 0 && (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[320px] -translate-x-1/2 rounded-xl border border-black/8 bg-white/95 p-2 text-[10px] text-slate-800 opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-100 shadow-xl backdrop-blur-sm space-y-1.5">
                  {returnedDetails.map((detail, detailIndex) => (
                    <div 
                      key={detailIndex} 
                      className={cn(
                        "flex flex-col gap-1 text-left min-w-[160px] max-w-[280px]",
                        detailIndex > 0 && "border-t border-black/[0.06] pt-1.5 dark:border-white/[0.06]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {detail.reason || "退货"}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                          {removeYear(detail.createdAt)}
                        </span>
                      </div>
                      {(Number(detail.refundAmount) > 0 || Number(detail.extraExpense) > 0) && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {Number(detail.refundAmount) > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-500/10 text-[9px] font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                              退款 ¥{(Number(detail.refundAmount) / 100).toFixed(2)}
                            </span>
                          )}
                          {Number(detail.extraExpense) > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                              支出 ¥{(Number(detail.extraExpense) / 100).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-white dark:border-t-zinc-900 filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)]" />
                </span>
              )}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">

        {showEditMatch && onEditMatch ? (
          <button
            type="button"
            onClick={onEditMatch}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-2.5 text-[11px] font-bold text-foreground transition-all hover:border-black/12 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/6 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14"
          >
            改匹配
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  variant = "default",
  title,
  mobileIconOnly = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  title?: string;
  mobileIconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl px-3 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:gap-2 sm:px-4",
        mobileIconOnly && "aspect-square px-0 sm:aspect-auto sm:px-4",
        variant === "primary"
          ? "bg-foreground text-background hover:opacity-90 dark:bg-white dark:text-black"
          : "border border-black/8 bg-white/85 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
      )}
    >
      {icon}
      <span className={cn(mobileIconOnly ? "sr-only sm:not-sr-only sm:inline" : "")}>{label}</span>
    </button>
  );
}

export class OrderCardErrorBoundary extends Component<{ children: React.ReactNode; orderNo: string }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode; orderNo: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error("OrderCard render failed for order:", this.props.orderNo, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <article className="overflow-visible rounded-[26px] border border-rose-500/15 bg-rose-500/5 p-4 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/8 sm:rounded-[30px]">
          <div className="flex items-start gap-3">
            <span className="text-base shrink-0">⚠️</span>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-[13px] text-rose-800 dark:text-rose-400">该订单在当前视图下渲染失败</h4>
              <p className="mt-1 font-mono text-[11px] leading-4 text-rose-600 dark:text-rose-300">单号：{this.props.orderNo}</p>
              <p className="mt-1 font-mono text-[11px] leading-4 break-all opacity-85 text-rose-600 dark:text-rose-300">{this.state.error?.stack || this.state.error?.message}</p>
            </div>
          </div>
        </article>
      );
    }
    return this.props.children;
  }
}

export const OrderCard = memo(function OrderCard({
  order,
  expanded,
  actingId,
  onToggleExpanded,
  onRunAction,
  onOpenCostBackfill,
  onOpenMatchEditor,
  onRefresh,
}: {
  order: AutoPickOrder;
  expanded: boolean;
  actingId: string;
  onToggleExpanded: (id: string) => void;
  onRunAction: (orderId: string, action: OrderAction) => void;
  onOpenCostBackfill: (order: AutoPickOrder) => void;
  onOpenMatchEditor: (order: AutoPickOrder, item: AutoPickOrderItem) => void;
  onRefresh?: () => void;
}) {
  const [isProfitTooltipOpen, setIsProfitTooltipOpen] = useState(false);
  const [isProfitTooltipHovering, setIsProfitTooltipHovering] = useState(false);
  const [isUpdatingBrush, setIsUpdatingBrush] = useState(false);
  const [isAmountEditorOpen, setIsAmountEditorOpen] = useState(false);
  const [isSavingAmount, setIsSavingAmount] = useState(false);
  const [isOfflineEditorOpen, setIsOfflineEditorOpen] = useState(false);
  const [isSavingOfflineEdit, setIsSavingOfflineEdit] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingOffline, setIsDeletingOffline] = useState(false);
  const [isCommissionEditorOpen, setIsCommissionEditorOpen] = useState(false);
  const [editCommissionValue, setEditCommissionValue] = useState("");
  const [isSavingCommission, setIsSavingCommission] = useState(false);
  const [isShopEditorOpen, setIsShopEditorOpen] = useState(false);
  const { showToast } = useToast();
  const profitTooltipHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearProfitTooltipHoverTimeout = useCallback(() => {
    if (profitTooltipHoverTimeoutRef.current) {
      clearTimeout(profitTooltipHoverTimeoutRef.current);
      profitTooltipHoverTimeoutRef.current = null;
    }
  }, []);

  const openProfitTooltipHover = useCallback(() => {
    clearProfitTooltipHoverTimeout();
    setIsProfitTooltipHovering(true);
  }, [clearProfitTooltipHoverTimeout]);

  const closeProfitTooltipHover = useCallback(() => {
    clearProfitTooltipHoverTimeout();
    profitTooltipHoverTimeoutRef.current = setTimeout(() => {
      setIsProfitTooltipHovering(false);
      profitTooltipHoverTimeoutRef.current = null;
    }, 180);
  }, [clearProfitTooltipHoverTimeout]);

  const handleUpdateBrush = useCallback(async (val: boolean) => {
    if (val === order.isMainSystemSelfDelivery) return;
    try {
      setIsUpdatingBrush(true);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isMainSystemSelfDelivery: val }),
      });
      if (res.ok) {
        showToast("刷单标记修改成功", "success");
        onRefresh?.();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "修改失败", "error");
      }
    } catch (err) {
      console.error("更新刷单状态失败", err);
      showToast("网络请求失败，请稍后重试", "error");
    } finally {
      setIsUpdatingBrush(false);
    }
  }, [order.id, order.isMainSystemSelfDelivery, showToast, onRefresh]);

  const handleSaveExpectedIncome = useCallback(async ({ expectedIncome }: { expectedIncome: number }) => {
    try {
      setIsSavingAmount(true);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedIncome }),
      });
      if (res.ok) {
        showToast("京东到手金额修改成功", "success");
        onRefresh?.();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "修改失败", "error");
      return false;
    } catch (err) {
      console.error("更新订单到手金额失败", err);
      showToast("网络请求失败，请稍后重试", "error");
      return false;
    } finally {
      setIsSavingAmount(false);
    }
  }, [order.id, showToast, onRefresh]);

  const handleSaveOfflineOrder = useCallback(async (values: {
    actualPaid: number;
    deliveryFee: number;
    userAddress: string;
    customerRemark: string;
    items?: EditableOfflineOrderItem[];
  }) => {
    try {
      setIsSavingOfflineEdit(true);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offlineEdit: values,
        }),
      });
      if (res.ok) {
        showToast("线下订单修改成功", "success");
        onRefresh?.();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "修改失败", "error");
      return false;
    } catch (err) {
      console.error("修改线下订单失败", err);
      showToast("网络请求失败，请稍后重试", "error");
      return false;
    } finally {
      setIsSavingOfflineEdit(false);
    }
  }, [order.id, showToast, onRefresh]);

  const handleDeleteOfflineOrder = useCallback(async () => {
    try {
      setIsDeletingOffline(true);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "线下订单录入有误，作废并回滚出库",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "作废失败", "error");
        return;
      }

      const returnedOutboundCount = Number(data.returnedOutboundCount || 0);
      showToast(
        returnedOutboundCount > 0
          ? `线下订单已作废，并回滚 ${returnedOutboundCount} 张出库单`
          : "线下订单已作废",
        "success"
      );
      onRefresh?.();
    } catch (err) {
      console.error("作废线下订单失败", err);
      showToast("网络请求失败，请稍后重试", "error");
    } finally {
      setIsDeletingOffline(false);
    }
  }, [order.id, showToast, onRefresh]);

  const profitTooltipRef = useRef<HTMLDivElement | null>(null);
  const legacyManualDeliveryPlaceholderOrder = isLegacyManualDeliveryPlaceholderOrder(order);
  const visibleItems = getVisibleOrderItems(order.items);
  const unmatchedPlaceholderItem = (order.items || []).find(isUnmatchedOrIgnoredItem);
  const itemCount = getItemCount(visibleItems);
  const completed = isCompletedStatus(order.status);
  const cancelled = isCancelledStatus(order.status);
  const deleted = getBaseAutoPickStatusDisplay(order.status) === "已删除";
  const terminal = isTerminalStatus(order.status);
  const abnormal = isAbnormalStatus(order.status);
  const deliveryFee = getDeliveryFee(order.delivery);
  const hasDeliveryAddress = Boolean(String(order.userAddress || "").trim());
  const isPureOffline = isPureManualOfflineOrder(order);
  const displayAsOfflineOrder = isPureOffline;
  const pickup = Boolean(order.isPickup) || (displayAsOfflineOrder && deliveryFee <= 0 && !hasDeliveryAddress);
  const showManualDeliveryMarker = displayAsOfflineOrder && !pickup;
  const showPlatformActions = !displayAsOfflineOrder;
  const hideDeletedOfflineIncome = deleted && displayAsOfflineOrder;
  const delivering = !pickup && isDeliveringStatus(order.status);
  const hasOutbound = Boolean(order.hasOutbound);
  const showBrushMarker = !pickup && !showManualDeliveryMarker && order.isMainSystemSelfDelivery;
  const orderTypeLabel = getOrderTypeLabel(order);
  const platformMeta = getPlatformBadgeMeta(order.platform, order.rawPayload);
  const commissionDisplay = getCommissionDisplay(order.platformCommission);
  const expectedIncome = getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission, order.platform);
  const effectiveActualPaid = (displayAsOfflineOrder || String(order.platform || "").toLowerCase() === "other")
    && (!order.actualPaid || Number(order.actualPaid) <= 0)
    && expectedIncome > 0
      ? expectedIncome
      : order.actualPaid;
  const hasPureProfit = typeof order.pureProfit === "number" && Number.isFinite(order.pureProfit);
  const pureProfit = hasPureProfit ? Number(order.pureProfit) : 0;
  const productCostStatusText = getProductCostStatusText(order);
  const refundAmount = Math.max(0, Number(order.refundAmount || 0));
  const hasRefundAmount = refundAmount > 0;
  const returnExtraExpense = Math.max(0, Number(order.returnExtraExpense || 0));
  const hasReturnExtraExpense = returnExtraExpense > 0;
  const customerName = getDisplayText(order.customerName);
  const customerPhone = getDisplayText(order.customerPhone);
  const customerMaskedPhone = getDisplayText(order.customerMaskedPhone);
  const customerPhoneExtension = getDisplayText(order.customerPhoneExtension);
  const customerPrivacyPhone = customerPhoneExtension !== "-"
    ? `${customerPhone}${customerPhone !== "-" ? "_" : ""}${customerPhoneExtension}`
    : customerPhone;
  const logisticPlatform = getDisplayText(order.delivery?.logisticName || "第三方平台");
  const riderName = getDisplayText(order.delivery?.riderName);
  const riderPhone = getDisplayText(order.delivery?.riderPhone);
  const expectedIncomeDisplay = hideDeletedOfflineIncome ? "-" : toCurrency(expectedIncome);
  const actualPaidDisplay = hideDeletedOfflineIncome ? "-" : toCurrency(effectiveActualPaid);
  const pureProfitDisplay = hideDeletedOfflineIncome
    ? "-"
    : (hasPureProfit ? toCurrency(pureProfit) : (productCostStatusText || "-"));
  const serviceFeeRate = Number(order.serviceFeeRate || 0);
  const productCost = Number(order.productCost || 0);
  const productCostBreakdown = Array.isArray(order.productCostBreakdown) ? order.productCostBreakdown : [];
  const outboundReturnDetails = Array.isArray(order.outboundReturnDetails) ? order.outboundReturnDetails : [];
  const productKeyByOutboundItemId = productCostBreakdown.reduce((acc, item) => {
    const outboundOrderItemId = String(item.outboundOrderItemId || "").trim();
    if (!outboundOrderItemId) return acc;
    const shopProductId = String(item.shopProductId || "").trim();
    const productId = String(item.productId || "").trim();
    acc.set(
      outboundOrderItemId,
      shopProductId ? `shop:${shopProductId}` : productId ? `product:${productId}` : ""
    );
    return acc;
  }, new Map<string, string>());
  const returnedItemQuantityMap = outboundReturnDetails.reduce((acc, entry) => {
    for (const item of entry.items || []) {
      const outboundOrderItemId = String(item.outboundOrderItemId || "").trim();
      const key = productKeyByOutboundItemId.get(outboundOrderItemId) || "";
      if (!key) continue;
      acc.set(key, (acc.get(key) || 0) + Math.max(0, Number(item.quantity || 0)));
    }
    return acc;
  }, new Map<string, number>());
  const returnedItemDetailsMap = outboundReturnDetails.reduce((acc, entry) => {
    for (const item of entry.items || []) {
      const outboundOrderItemId = String(item.outboundOrderItemId || "").trim();
      const key = productKeyByOutboundItemId.get(outboundOrderItemId) || "";
      if (!key) continue;
      const list = acc.get(key) || [];
      list.push({
        createdAt: String(entry.createdAt || ""),
        reason: String(entry.reason || "").trim() || "退货",
        quantity: Math.max(0, Number(item.quantity || 0)),
        refundAmount: Number(entry.refundAmount || 0),
        extraExpense: Number(entry.extraExpense || 0),
      });
      acc.set(key, list);
    }
    return acc;
  }, new Map<string, Array<{ createdAt: string; reason: string; quantity: number; refundAmount?: number; extraExpense?: number }>>());
  const canEditProductCost = order.productCostStatus === "pending-backfill" || productCostBreakdown.length > 0;
  const settlementAfterRate = Math.round(expectedIncome * (1 - serviceFeeRate));
  const isJdOrder = String(order.platform || "").includes("京东");
  const isMeituanPlatformOrder = isMeituanOrder(order.platform);
  const canEditExpectedIncome = isJdOrder || legacyManualDeliveryPlaceholderOrder;
  const pureProfitTooltipRows: Array<{ label: string; value: string; editable?: boolean; onEdit?: () => void }> = hasPureProfit
    ? (showManualDeliveryMarker
      ? [
          { label: "订单收入", value: toCurrency(expectedIncome) },
          { label: "扣配送费", value: toCurrency(-deliveryFee) },
        ]
      : order.isMainSystemSelfDelivery
      ? [
          { label: "扣平台佣金", value: toCurrency(order.platformCommission) },
          {
            label: "扣刷单佣金",
            value: toCurrency(- (typeof order.brushCommission === "number" ? Math.round(order.brushCommission * 100) : Math.abs(pureProfit) - Math.abs(Number(order.platformCommission || 0)))),
            editable: true,
            onEdit: () => {
              const currentVal = typeof order.brushCommission === "number"
                ? order.brushCommission
                : (Math.abs(pureProfit) - Math.abs(Number(order.platformCommission || 0))) / 100;
              setEditCommissionValue(String(currentVal > 0 ? currentVal : ""));
              setIsProfitTooltipOpen(false);
              setIsCommissionEditorOpen(true);
            },
          },
        ]
        : [
            { label: "预计到手", value: toCurrency(hasRefundAmount ? expectedIncome + refundAmount : expectedIncome) },
            ...(hasRefundAmount ? [{ label: "减退款", value: toCurrency(refundAmount) }] : []),
            { label: `扣抽出 ${formatPercent(serviceFeeRate)} 后`, value: toCurrency(settlementAfterRate) },
            { label: "减配送费", value: toCurrency(deliveryFee) },
            { label: "减货品成本", value: toCurrency(productCost), editable: canEditProductCost },
            ...(hasReturnExtraExpense ? [{ label: "减退货支出", value: toCurrency(returnExtraExpense) }] : []),
          ])
    : productCostStatusText
      ? [
          { label: "预计到手", value: toCurrency(hasRefundAmount ? expectedIncome + refundAmount : expectedIncome) },
          ...(hasRefundAmount ? [{ label: "退款", value: toCurrency(refundAmount) }] : []),
          { label: "抽出率", value: formatPercent(serviceFeeRate) },
          { label: "配送费", value: toCurrency(deliveryFee) },
          { label: "货品成本", value: productCostStatusText, editable: canEditProductCost },
          ...(hasReturnExtraExpense ? [{ label: "退货支出", value: toCurrency(returnExtraExpense) }] : []),
        ]
      : [];
  const sourceLabel = getOrderSourceLabel(order);
  const deadlineDisplay = getDeadlineDisplay(order);
  const autoCompleteFailed = hasAutoCompleteFailure(order);
  const autoOutboundFailed = hasAutoOutboundFailure(order);
  const compactCompletedAt = formatCompactDateTime(order.completedAt);
  const compactAutoCompleteAt = formatCompactDateTime(order.autoCompleteAt);
  const compactDeadlineDisplay = formatCompactDateTime(deadlineDisplay);
  const isProfitTooltipVisible = isProfitTooltipOpen || isProfitTooltipHovering;
  const closeProfitTooltip = useCallback(() => {
    clearProfitTooltipHoverTimeout();
    setIsProfitTooltipHovering(false);
    setIsProfitTooltipOpen(false);
  }, [clearProfitTooltipHoverTimeout]);

  const handleProfitTooltipTriggerClick = useCallback(() => {
    clearProfitTooltipHoverTimeout();
    setIsProfitTooltipOpen((current) => {
      if (current) {
        setIsProfitTooltipHovering(false);
      }
      return !current;
    });
  }, [clearProfitTooltipHoverTimeout]);

  useEffect(() => {
    if (!isProfitTooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!profitTooltipRef.current?.contains(event.target as Node)) {
        closeProfitTooltip();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [closeProfitTooltip, isProfitTooltipOpen]);

  useEffect(() => {
    return () => {
      clearProfitTooltipHoverTimeout();
    };
  }, [clearProfitTooltipHoverTimeout]);

  return (
    <>
      <article className="overflow-visible rounded-[26px] border border-black/8 bg-white/78 shadow-xs transition-all hover:border-black/12 dark:border-white/10 dark:bg-white/4 sm:rounded-[30px]">
        <div className="border-b border-black/6 px-3.5 py-3.5 dark:border-white/6 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
                  <span className="inline-flex h-7 items-center gap-0.5 rounded-full border border-black/8 bg-black/3 pl-1 pr-1.5 text-foreground dark:border-white/10 dark:bg-white/4 sm:h-8 sm:gap-1.5 sm:pl-2 sm:pr-2.5">
                    <span className="inline-flex h-4 w-4 items-center justify-center sm:h-5 sm:w-5">
                      <Image
                        src={platformMeta.iconSrc}
                        alt={platformMeta.iconAlt}
                        width={16}
                        height={16}
                        className="h-4 w-4 object-cover"
                        unoptimized
                      />
                    </span>
                    <span className="pr-0.5 text-[12px] font-semibold leading-none tracking-tight sm:text-[15px]">#{order.dailyPlatformSequence || 0}</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsShopEditorOpen(true);
                    }}
                    title="点击修改订单归属门店"
                    className="inline-flex h-7 min-w-0 max-w-[calc(100vw-10rem)] items-center rounded-full border border-black/8 bg-black/3 px-1.5 text-[11px] font-medium leading-none text-muted-foreground transition-colors hover:border-sky-500/30 hover:bg-sky-500/10 hover:text-sky-600 dark:border-white/10 dark:bg-white/4 dark:hover:border-sky-400/30 dark:hover:bg-sky-500/15 dark:hover:text-sky-300 sm:h-8 sm:max-w-55 sm:px-2.5 sm:text-[13px]"
                  >
                    <span className="truncate">{sourceLabel || "+ 绑定门店"}</span>
                  </button>
                  {orderTypeLabel ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-1.5 text-[11px] font-medium leading-none text-violet-700 dark:text-violet-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      {orderTypeLabel}
                    </span>
                  ) : null}
                  {pickup && !displayAsOfflineOrder ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-sky-500/15 bg-sky-500/10 px-1.5 text-[11px] font-medium leading-none text-sky-700 dark:text-sky-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      到店自取
                    </span>
                  ) : null}
                  {showBrushMarker ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-rose-500/15 bg-rose-500/10 px-1.5 text-[11px] font-medium leading-none text-rose-700 dark:text-rose-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      刷单
                    </span>
                  ) : null}
                  {autoOutboundFailed && !deleted && !cancelled ? (
                    <div className="group/outbound relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRunAction(order.id, "outbound");
                        }}
                        disabled={actingId === `${order.id}:outbound`}
                        className="inline-flex h-7 items-center gap-0.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-1.5 text-[11px] font-medium leading-none text-rose-700 transition-all hover:border-rose-500/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-[13px]"
                      >
                        <TriangleAlert size={10} className="sm:h-3 sm:w-3" />
                        {actingId === `${order.id}:outbound` ? "处理中..." : "出库待处理"}
                      </button>
                      
                      {/* Tooltip 浮层 */}
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 scale-95 opacity-0 transition-all duration-200 ease-out group-hover/outbound:pointer-events-auto group-hover/outbound:scale-100 group-hover/outbound:opacity-100">
                        <div className="relative rounded-xl border border-slate-200/90 bg-white/98 px-3.5 py-2.5 text-xs shadow-xl dark:border-white/12 dark:bg-[#171b22]/96">
                          {/* 小三角 */}
                          <div className="absolute top-full left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-r border-b border-slate-200/90 bg-white dark:border-white/12 dark:bg-[#171b22]" />
                          <div className="font-semibold text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1.5">
                            <TriangleAlert size={12} className="shrink-0" />
                            <span>自动出库失败原因</span>
                          </div>
                          <div className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 wrap-break-word font-normal text-left">
                            {order.autoOutboundError || "未知异常，请检查库存或点击重试。"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <StatusBadge order={order} />
                  {hasRefundAmount ? (
                    <span
                      title="出库退款金额"
                      className="inline-flex h-7 min-w-0 items-center gap-0.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-1.5 text-[11px] font-medium leading-none text-rose-700 dark:text-rose-400 sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-[13px]"
                    >
                      <span className="shrink-0">已退款</span>
                      <span className="truncate font-semibold">{toCurrency(refundAmount)}</span>
                    </span>
                  ) : null}
                  {completed && (hasPureProfit || order.productCostStatus === "pending-backfill") ? (
                    <div
                      ref={profitTooltipRef}
                      className="group/profit relative"
                      onMouseEnter={openProfitTooltipHover}
                      onMouseLeave={closeProfitTooltipHover}
                    >
                      {hasPureProfit ? (
                        <button
                          type="button"
                          onClick={handleProfitTooltipTriggerClick}
                          aria-expanded={isProfitTooltipVisible}
                          className={cn(
                            "inline-flex h-7 min-w-0 items-center gap-0.5 rounded-full border px-1.5 text-[11px] font-medium leading-none transition-all hover:-translate-y-px active:translate-y-0 sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-[13px]",
                            pureProfit >= 0
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/35 hover:bg-emerald-500/14 dark:text-emerald-300"
                              : "border-rose-500/20 bg-rose-500/10 text-rose-700 hover:border-rose-500/35 hover:bg-rose-500/14 dark:text-rose-300"
                          )}
                        >
                          <span className="shrink-0">纯利润</span>
                          <span className="truncate font-semibold">{toCurrency(pureProfit)}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenCostBackfill(order)}
                          className="inline-flex h-7 min-w-0 items-center gap-0.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 text-[11px] font-medium leading-none text-orange-700 transition-all hover:border-orange-500/35 hover:bg-orange-500/14 dark:text-orange-300 sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-[13px]"
                        >
                          <span className="shrink-0">成本</span>
                          <span className="truncate">{productCostStatusText}</span>
                        </button>
                      )}
                      {pureProfitTooltipRows.length > 0 ? (
                        <>
                          <div className="pointer-events-none absolute left-1/2 top-full hidden h-4 w-70 -translate-x-1/2 sm:block" />
                          {isProfitTooltipOpen ? (
                            <div
                              className="fixed inset-0 z-40 bg-slate-950/42 sm:hidden"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                closeProfitTooltip();
                              }}
                              onClick={closeProfitTooltip}
                            />
                          ) : null}
                          {isProfitTooltipVisible ? (
                            <div className={cn(
                              "fixed left-1/2 top-1/2 z-50 w-[min(320px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/98 p-3 text-left shadow-[0_22px_60px_rgba(15,23,42,0.22)] dark:border-white/12 dark:bg-[#171b22]/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:absolute sm:left-1/2 sm:top-full sm:z-30 sm:mt-3 sm:w-70 sm:max-h-none sm:-translate-x-1/2 sm:translate-y-0 sm:overflow-visible"
                            )}>
                            <div className="hidden absolute left-12 top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-slate-200/90 bg-white/98 dark:border-white/12 dark:bg-[#171b22]/96 sm:block sm:left-1/2 sm:-translate-x-1/2" />
                            <button
                              type="button"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                closeProfitTooltip();
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                closeProfitTooltip();
                              }}
                              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-white/6 dark:text-white/55 dark:hover:text-white sm:hidden"
                              aria-label="关闭利润计算"
                            >
                              <X size={14} />
                            </button>
                            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-2 pr-10 dark:border-white/8 sm:items-center sm:pr-0">
                              <div className="min-w-0">
                                <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 dark:text-white/45">
                                  利润拆解
                                </div>
                                <div className="mt-0.5 text-[13px] font-semibold text-slate-900 dark:text-white">
                                  {hasPureProfit ? "这单的纯利润计算" : "这单的成本状态"}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {pureProfitTooltipRows.map((row, index) => (
                                <div
                                  key={row.label}
                                  className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2 text-[12px] leading-5 dark:bg-white/5"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500 shadow-sm dark:bg-white/10 dark:text-white/55">
                                      {index + 1}
                                    </span>
                                    <span className="truncate text-slate-600 dark:text-white/68">
                                      {row.label}
                                    </span>
                                  </div>
                                  <span className="flex shrink-0 items-center gap-1.5 font-semibold text-slate-950 dark:text-white">
                                    <span>{row.value}</span>
                                    {row.editable ? (
                                      <button
                                        type="button"
                                        aria-label={row.onEdit ? "修改刷单佣金" : "修改货品成本"}
                                        title={row.onEdit ? "修改刷单佣金" : "修改货品成本"}
                                        onClick={() => {
                                          setIsProfitTooltipOpen(false);
                                          if (row.onEdit) {
                                            row.onEdit();
                                          } else {
                                            onOpenCostBackfill(order);
                                          }
                                        }}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-500/22 bg-sky-500/10 text-sky-700 transition-all hover:border-sky-500/38 hover:bg-sky-500/16 dark:text-sky-300"
                                      >
                                        <Pencil size={11} className="shrink-0" />
                                      </button>
                                    ) : null}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {hasPureProfit && productCostBreakdown.length > 0 ? (
                              <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/8 dark:bg-white/4">
                                <div className="text-[11px] font-semibold tracking-[0.08em] text-slate-500 dark:text-white/45">
                                  货品成本明细
                                </div>
                                <div className="mt-2 space-y-2">
                                  {productCostBreakdown.map((item, index) => (
                                    <div key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 text-[12px]">
                                      <div className="min-w-0">
                                        <div className="truncate font-medium text-slate-900 dark:text-white">
                                          {item.name}
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-white/45">
                                          x{item.quantity} · {toCurrency(item.unitCost)}/件
                                        </div>
                                      </div>
                                      <div className="shrink-0 font-semibold text-slate-900 dark:text-white">
                                        {toCurrency(item.totalCost)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className={cn(
                              "mt-3 rounded-xl border px-3 py-2.5",
                              hasPureProfit
                                ? (pureProfit >= 0
                                  ? "border-emerald-500/20 bg-emerald-500/8 dark:border-emerald-500/20 dark:bg-emerald-500/10"
                                  : "border-rose-500/20 bg-rose-500/8 dark:border-rose-500/20 dark:bg-rose-500/10")
                                : "border-orange-500/20 bg-orange-500/8 dark:border-orange-500/20 dark:bg-orange-500/10"
                            )}>
                              <div className="flex items-center justify-between gap-4 text-[13px]">
                                <span className="whitespace-nowrap font-semibold text-slate-900 dark:text-white">
                                  {hasPureProfit ? "最终纯利润" : "当前状态"}
                                </span>
                                <span className={cn(
                                  "whitespace-nowrap text-[15px] font-bold",
                                  hasPureProfit
                                    ? (pureProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")
                                    : "text-orange-700 dark:text-orange-300"
                                )}>
                                  {hasPureProfit ? toCurrency(pureProfit) : productCostStatusText}
                                </span>
                              </div>
                            </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="w-full rounded-[18px] border border-black/8 bg-black/2 px-3 py-2.5 dark:border-white/10 dark:bg-white/3 sm:hidden">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">实付</div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{actualPaidDisplay}</div>
                    </div>
                    {canEditExpectedIncome ? (
                      <div className="min-w-0 text-right">
                        <button
                          type="button"
                          onClick={() => setIsAmountEditorOpen(true)}
                          disabled={isSavingAmount}
                          className="flex w-full flex-col items-end rounded-xl text-right transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-center justify-end gap-2">
                            {isSavingAmount ? <Loader2 size={11} className="animate-spin text-muted-foreground" /> : null}
                            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                          </div>
                          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{expectedIncomeDisplay}</div>
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 text-right">
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</div>
                        <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{expectedIncomeDisplay}</div>
                      </div>
                    )}
                    <div className="col-span-2 flex min-w-0 items-center justify-between border-t border-black/6 pt-2 dark:border-white/8">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{commissionDisplay.label}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{commissionDisplay.value}</span>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">实付</span>
                    <span className="truncate text-sm font-semibold text-foreground">{actualPaidDisplay}</span>
                  </div>
                  {canEditExpectedIncome ? (
                    <button
                      type="button"
                      onClick={() => setIsAmountEditorOpen(true)}
                      disabled={isSavingAmount}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 text-left transition-all hover:border-black/12 hover:bg-black/3 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/4 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0"
                    >
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                      <span className="truncate text-sm font-semibold text-foreground">{expectedIncomeDisplay}</span>
                      {isSavingAmount ? <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" /> : null}
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                      <span className="truncate text-sm font-semibold text-foreground">{expectedIncomeDisplay}</span>
                    </div>
                  )}
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:col-span-1 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{commissionDisplay.label}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{commissionDisplay.value}</span>
                  </div>
                  {order.delivery?.sendFee != null ? (
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">配送费</span>
                      <span className="truncate text-sm font-semibold text-foreground">{toCurrency(order.delivery.sendFee)}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                {/* PC 端：展示单行时间、距离以及接在后面的配送地址 */}
                <div className="hidden sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={13} />
                    {formatLocalDateTime(order.orderTime)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 max-w-[280px] md:max-w-[420px] lg:max-w-[560px] min-w-0">
                    <MapPin size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                    <span className="truncate shrink-0">{pickup ? "-" : (order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步")}</span>
                    {!pickup && order.userAddress ? (
                      <>
                        <span className="mx-1 text-slate-300 dark:text-zinc-700 font-normal shrink-0">·</span>
                        <span className="truncate text-foreground/80 font-normal" title={order.userAddress}>
                          {order.userAddress}
                        </span>
                      </>
                    ) : null}
                  </span>
                </div>

                {/* 移动端：展示精致小卡片面板，包含地址与配送费（优化后） */}
                {pickup ? (
                  <div className="mt-2.5 rounded-2xl border border-black/5 bg-black/2 p-2.5 dark:border-white/5 dark:bg-white/3 flex items-center justify-between text-xs font-medium sm:hidden">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock3 size={12} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                      <span>{formatLocalDateTime(order.orderTime)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      自提单
                    </span>
                  </div>
                ) : (
                  <div className="mt-2.5 rounded-2xl border border-black/5 bg-black/2 p-2.5 dark:border-white/5 dark:bg-white/3 space-y-2 text-xs font-medium sm:hidden">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock3 size={12} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                        <span>{formatLocalDateTime(order.orderTime)}</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                        <span>{order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步"}</span>
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-black/6 pt-2 dark:border-white/8">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck size={12} className="shrink-0 text-slate-400 dark:text-zinc-500" />
                        <span>配送费</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {order.delivery?.sendFee != null ? toCurrency(order.delivery.sendFee) : "-"}
                      </span>
                    </div>

                    <div className="flex items-start gap-1.5 text-foreground/90 border-t border-black/6 pt-2 dark:border-white/8">
                      <Navigation size={12} className="mt-0.5 shrink-0 text-slate-400 dark:text-zinc-500" />
                      <span className="line-clamp-2 break-all text-left w-full leading-normal">
                        {order.userAddress || "地址待同步"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 py-3 sm:px-5 sm:py-4">
        <div className="grid gap-3">
          {visibleItems.length > 0 ? (
            <div className="rounded-[18px] border border-black/6 bg-black/2 p-2.5 dark:border-white/8 dark:bg-white/3 sm:rounded-3xl sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {visibleItems.length > 1 ? "商品列表" : "商品"}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="text-xs font-medium text-muted-foreground">共 {itemCount} 件商品</div>
                </div>
              </div>

            <div className="mt-2 grid gap-1.5 sm:mt-2.5 sm:gap-2">
              {visibleItems.flatMap((item, index) =>
                getExpandedOrderItemDisplays(item, order.platform).map((display, displayIndex) => (
                  <ProductStripItem
                    key={`${item.productNo || item.productName}-${index}-${display.sku}-${displayIndex}`}
                    display={display}
                    showEditMatch={displayIndex === 0 && !deleted}
                    onEditMatch={() => onOpenMatchEditor(order, item)}
                    matchedProduct={item.matchedProduct}
                    showMatchStatus={displayIndex === 0}
                    returnedQuantity={returnedItemQuantityMap.get(getReturnedProductKey(item)) || 0}
                    returnedDetails={returnedItemDetailsMap.get(getReturnedProductKey(item)) || []}
                    isJdOrder={isJdOrder}
                    isMeituanOrder={isMeituanPlatformOrder}
                    isTaobaoOrder={isTaobaoOrder(order.platform)}
                    isDoudianOrder={isDoudianOrder(order.platform)}
                  />
                ))
              )}
            </div>
          </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-black/10 bg-black/[0.015] px-4 py-2.5 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.015]">
              <span>纯配送 / 跑腿订单（无关联商品）</span>
              {order.items && order.items.length > 0 && !deleted ? (
                <button
                  type="button"
                  onClick={() => onOpenMatchEditor(order, order.items[0])}
                  className="text-xs text-sky-600 hover:text-sky-500 dark:text-sky-400 font-medium hover:underline cursor-pointer"
                >
                  + 重新匹配商品
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-col gap-2 border-t border-black/6 pt-2.5 dark:border-white/6 lg:flex-row lg:items-center lg:justify-between lg:pt-4">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-1.5">
            {completed ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <CheckCheck size={12} />
                {order.completedAt ? (
                  <>
                    <span className="truncate sm:hidden">{`${compactCompletedAt} ${pickup && !displayAsOfflineOrder ? "自提" : "完成"}`}</span>
                    <span className="hidden sm:inline">{`${formatLocalDateTime(order.completedAt)} ${pickup && !displayAsOfflineOrder ? "已取货" : "已完成"}`}</span>
                  </>
                ) : pickup && !displayAsOfflineOrder ? "已取货" : "订单已完成"}
              </span>
            ) : null}
            {cancelled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/15 bg-slate-500/10 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                订单已取消
              </span>
            ) : null}
            {deleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/15 bg-zinc-500/10 px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                订单已删除
              </span>
            ) : null}
            {!pickup && !terminal && !abnormal && Boolean(order.isMainSystemSelfDelivery) && order.autoCompleteAt ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <TimerReset size={12} />
                <span className="truncate sm:hidden">{`自动完成 ${compactAutoCompleteAt}`}</span>
                <span className="hidden sm:inline">{`预计自动完成 ${formatLocalDateTime(order.autoCompleteAt)}`}</span>
              </span>
            ) : null}
            {autoCompleteFailed && Boolean(order.isMainSystemSelfDelivery) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                自动完成失败
              </span>
            ) : null}
            {deadlineDisplay !== "-" ? (
              <span className="ml-auto inline-flex min-w-0 items-center justify-end gap-1.5 rounded-full border border-black/8 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-white/4 sm:ml-0 sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <Clock3 size={12} />
                <span className="min-w-0 text-right sm:hidden">
                  <span className="block truncate">
                    {pickup
                      ? `取货 ${compactDeadlineDisplay}`
                      : order.isSubscribe
                        ? `预约 ${compactDeadlineDisplay}`
                        : `最晚 ${compactDeadlineDisplay}`}
                  </span>
                </span>
                <span className="hidden sm:inline">
                  {pickup
                    ? `取货时间 ${deadlineDisplay}`
                    : order.isSubscribe
                      ? `预约时间 ${deadlineDisplay}`
                      : `最晚送达 ${deadlineDisplay}`}
                </span>
              </span>
            ) : null}
            {showPlatformActions && !displayAsOfflineOrder && !deleted ? (
              <button
                type="button"
                onClick={() => onRunAction(order.id, "self-delivery")}
                disabled={Boolean(actingId) || terminal || delivering || pickup}
                title={
                  pickup
                    ? "到店自取订单不需要发起自配送"
                    : terminal
                    ? (cancelled ? "订单已取消，不能发起自配" : "订单已完成，不能再次发起自配")
                    : delivering
                      ? "订单已在配送中，不能重复发起自配"
                      : "发起商家自配送"
                }
                className="hidden h-7 items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 text-[11px] font-semibold text-sky-700 transition-all hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-45 dark:text-sky-300 sm:inline-flex sm:h-8 sm:px-3 sm:text-xs"
              >
                {actingId === `${order.id}:self-delivery` ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
                自配
              </button>
            ) : null}
          </div>

          <div className={cn(
            "grid gap-2 lg:min-w-110",
            deleted
              ? "grid-cols-1 sm:grid-cols-1 lg:min-w-0 lg:w-32 ml-auto"
            : showManualDeliveryMarker || displayAsOfflineOrder
              ? "grid-cols-3 sm:grid-cols-3 lg:min-w-0 lg:w-96 ml-auto"
              : "grid-cols-2 sm:grid-cols-3"
          )}>
            <ActionButton
              label={expanded ? "收起详情" : "展开详情"}
              icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => onToggleExpanded(order.id)}
              mobileIconOnly={!displayAsOfflineOrder}
              title={expanded ? "收起详情" : "展开详情"}
            />
            {displayAsOfflineOrder && !deleted ? (
              <ActionButton
                label={isSavingOfflineEdit ? "保存中" : "修改"}
                icon={isSavingOfflineEdit ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
                onClick={() => setIsOfflineEditorOpen(true)}
                disabled={isSavingOfflineEdit || Boolean(actingId)}
                title="修改这张线下订单的金额、配送支出、地址和备注"
              />
            ) : null}
            {displayAsOfflineOrder && !deleted ? (
              <ActionButton
                label={isDeletingOffline ? "作废中" : "作废"}
                icon={isDeletingOffline ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isDeletingOffline || Boolean(actingId)}
                title="作废这张录错的线下订单，并自动回滚关联出库库存"
              />
            ) : null}
            {showPlatformActions && (
              <>
                <ActionButton
                  label="同步"
                  title={deleted ? "订单已删除，不能同步" : "从平台重新同步最新订单状态"}
                  icon={actingId === `${order.id}:sync` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  onClick={() => onRunAction(order.id, "sync")}
                  disabled={Boolean(actingId) || deleted}
                  mobileIconOnly
                />
                <div className="sm:hidden">
                  <ActionButton
                    label="自配"
                    icon={actingId === `${order.id}:self-delivery` ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
                    onClick={() => onRunAction(order.id, "self-delivery")}
                    disabled={Boolean(actingId) || terminal || delivering || pickup}
                    mobileIconOnly
                    title={
                      pickup
                        ? "到店自取订单不需要发起自配送"
                        : terminal
                        ? (cancelled ? "订单已取消，不能发起自配" : "订单已完成，不能再次发起自配")
                        : delivering
                          ? "订单已在配送中，不能重复发起自配"
                          : "发起商家自配送"
                    }
                  />
                </div>
                <ActionButton
                  label={pickup ? "完成取货" : "完成配送"}
                  variant="primary"
                  icon={actingId === `${order.id}:${pickup ? "pickup-complete" : "complete-delivery"}` ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                  onClick={() => onRunAction(order.id, pickup ? "pickup-complete" : "complete-delivery")}
                  disabled={Boolean(actingId) || terminal || (!pickup && (!delivering || !order.isMainSystemSelfDelivery))}
                  mobileIconOnly
                  title={
                    pickup
                      ? (terminal ? (cancelled ? "订单已取消，不能完成取货" : "订单已取货，不能重复完成取货") : undefined)
                      : terminal
                        ? (cancelled ? "订单已取消，不能完成配送" : "订单已完成，不能重复完成配送")
                        : !order.isMainSystemSelfDelivery
                          ? "当前是平台骑手配送，不能在主系统直接完成配送"
                        : !delivering
                          ? "订单还未进入配送中，不能直接完成配送"
                          : undefined
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-black/6 bg-zinc-50/60 px-3.5 py-4 dark:border-white/6 dark:bg-white/2.5 sm:px-5 sm:py-5">
          {order.detailLoading && !order.detailLoaded ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-xs font-medium text-muted-foreground dark:border-white/10 dark:bg-white/5">
              <Loader2 size={13} className="animate-spin" />
              正在加载订单详情...
            </div>
          ) : null}
          {unmatchedPlaceholderItem ? (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-black/15 bg-white/80 p-3 dark:border-white/15 dark:bg-white/4 sm:px-4 sm:py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">发货货品（可选）</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">当前未关联发货商品，仅记录配送费</div>
              </div>
              <button
                type="button"
                onClick={() => onOpenMatchEditor(order, unmatchedPlaceholderItem)}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-3 text-xs font-bold text-foreground transition-all hover:border-black/12 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/6 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14 cursor-pointer"
              >
                + 选择发货货品
              </button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/4 sm:rounded-3xl sm:p-4">
              <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:mb-3">系统信息</h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <DetailStat label="订单状态" value={getDisplayStatus(order)} />
                <DetailStat label="订单类型" value={orderTypeLabel || "普通单"} />
                <div className="rounded-2xl border border-black/6 bg-black/2 px-3 py-2.5 dark:border-white/8 dark:bg-white/3 sm:px-3 sm:py-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">刷单标记</span>
                    {isUpdatingBrush && (
                      <Loader2 size={10} className="animate-spin text-primary" />
                    )}
                  </div>
                  <div className="flex items-center p-0.5 rounded-xl border border-black/8 dark:border-white/10 bg-black/2 dark:bg-black/20 w-full mt-2 h-8.5">
                    <button
                      type="button"
                      disabled={isUpdatingBrush || cancelled || deleted}
                      onClick={() => void handleUpdateBrush(true)}
                      className={cn(
                        "flex-1 h-full rounded-[10px] text-xs font-medium transition-all duration-200 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center",
                        order.isMainSystemSelfDelivery
                          ? "bg-white dark:bg-white/10 shadow-[0_1px_2.5px_rgba(0,0,0,0.15)] text-black dark:text-white"
                          : "bg-transparent text-zinc-400 dark:text-zinc-500 hover:text-foreground/80"
                      )}
                    >
                      是
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingBrush || cancelled || deleted}
                      onClick={() => void handleUpdateBrush(false)}
                      className={cn(
                        "flex-1 h-full rounded-[10px] text-xs font-medium transition-all duration-200 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center",
                        !order.isMainSystemSelfDelivery
                          ? "bg-white dark:bg-white/10 shadow-[0_1px_2.5px_rgba(0,0,0,0.15)] text-black dark:text-white"
                          : "bg-transparent text-zinc-400 dark:text-zinc-500 hover:text-foreground/80"
                      )}
                    >
                      否
                    </button>
                  </div>
                </div>
                <DetailStat label="出库状态" value={hasOutbound ? (productCostStatusText ? `已出库 · ${productCostStatusText}` : "已出库") : (autoOutboundFailed ? "自动出库失败" : "未出库")} />
                <DetailStat label="履约方式" value={getFulfillmentLabel(order)} />
                <DetailStat label="配送距离" value={pickup ? "-" : formatDistanceKm(order.distanceKm)} />
                <DetailStat label={pickup ? "取货时间" : order.isSubscribe ? "预约时间" : "最晚送达"} value={deadlineDisplay} />
                <DetailStat
                  label="订单坐标"
                  value={order.longitude != null && order.latitude != null ? `${order.longitude}, ${order.latitude}` : "-"}
                  valueClassName="break-all text-[13px] sm:text-sm"
                />
              </div>
              <div className="mt-2 space-y-2 sm:mt-2.5 sm:space-y-2.5">
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-2.5">
                  <DetailBlock
                    label="门店地址"
                    labelAccessory={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsShopEditorOpen(true);
                        }}
                        className="inline-flex max-w-[45%] items-center rounded-full border border-sky-400/20 bg-sky-500/12 px-2 py-0.5 text-[10px] font-medium leading-none text-sky-300 hover:bg-sky-500/20 transition-colors"
                        title="点击修改归属门店"
                      >
                        <span className="truncate">{order.matchedShopName || "未绑定门店"}</span>
                      </button>
                    }
                    value={order.rawShopAddress || order.shopAddress || "-"}
                    className="sm:col-span-2"
                  />
                  <DetailBlock
                    label="配送地址"
                    value={pickup ? "-" : order.userAddress}
                    className="sm:col-span-2"
                  />
                  <DetailBlock
                    label="顾客备注"
                    value={order.customerRemark || "-"}
                    className="sm:col-span-2"
                  />
                  <DetailStat
                    label="顾客昵称"
                    value={customerName}
                    valueClassName="break-all text-[13px] sm:text-sm"
                  />
                  <DetailStat
                    label="顾客电话"
                    value={customerMaskedPhone}
                    valueClassName="break-all text-[13px] sm:text-sm"
                  />
                  <DetailStat
                    label="隐私号"
                    value={customerPrivacyPhone}
                    valueClassName="break-all text-[13px] sm:text-sm"
                  />
                  <DetailStat
                    label="订单编号"
                    value={order.orderNo}
                    valueClassName="break-all text-[13px] sm:text-sm"
                  />
                </div>
                {autoCompleteFailed ? (
                  <div className="rounded-2xl border border-rose-500/15 bg-rose-500/8 px-3 py-3 dark:bg-rose-500/8">
                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                      <DetailStat label="自动完成任务" value="失败" />
                      <DetailStat label="失败次数" value={String(order.autoCompleteJobAttempts || 0)} />
                    </div>
                    <div className="mt-2 sm:mt-2.5">
                      <DetailBlock label="失败原因" value={order.autoCompleteJobError || "-"} />
                    </div>
                  </div>
                ) : null}

              </div>
            </section>

            <div className="space-y-3 sm:space-y-4">
              <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/4 sm:rounded-3xl sm:p-4">
                <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:mb-3">金额信息</h3>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <DetailStat label="顾客实付" value={toCurrency(order.actualPaid)} />
                  <DetailStat label={isJdOrder ? "京东到手" : "预计到手"} value={expectedIncomeDisplay} />
                  <DetailStat label="货品成本" value={order.productCostStatus === "ready" ? toCurrency(order.productCost) : (productCostStatusText || "-")} />
                  <DetailStat label="纯利润" value={pureProfitDisplay} />
                  {hasRefundAmount ? (
                    <DetailStat label="退款金额" value={toCurrency(refundAmount)} />
                  ) : null}
                  {hasReturnExtraExpense ? (
                    <DetailStat label="退货支出" value={toCurrency(returnExtraExpense)} />
                  ) : null}
                  <div className={hasRefundAmount || hasReturnExtraExpense ? "" : "col-span-2"}>
                    <DetailStat label={commissionDisplay.label} value={commissionDisplay.value} />
                  </div>
                </div>
              </section>
              <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/4 sm:rounded-3xl sm:p-4">
                <div className="mb-3 flex items-center justify-between gap-2 sm:mb-3">
                  <h3 className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">物流信息</h3>
                  <span className="inline-flex max-w-[60%] items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium leading-none text-emerald-700 dark:text-emerald-300">
                    <span className="truncate">{logisticPlatform}</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <DetailStat label="配送人" value={riderName} />
                  <DetailStat label="骑手电话" value={riderPhone} valueClassName="break-all text-[13px] sm:text-sm" />
                  <DetailStat label="取餐时间" value={removeYear(order.delivery?.pickupTime)} />
                  <DetailStat
                    label={
                      isAutoPickOrderCompletedStatus(order.status)
                        ? "送达时间"
                        : order.isSubscribe
                          ? "预约送达"
                          : "最晚送达"
                    }
                    value={
                      isAutoPickOrderCompletedStatus(order.status)
                        ? removeYear(order.delivery?.completedTime || order.completedAt)
                        : removeYear(getDeadlineDisplay(order))
                    }
                  />
                  <DetailStat label="配送费" value={order.delivery?.sendFee != null ? toCurrency(order.delivery.sendFee) : "-"} className="col-span-2" />
                </div>
                <div className="mt-2 sm:mt-2.5">
                  <DetailBlock label="轨迹" value={order.delivery?.track || "暂无轨迹"} />
                </div>
              </section>

            </div>
          </div>
        </div>
      ) : null}
      </article>
      {isAmountEditorOpen && canEditExpectedIncome ? (
        <OrderAmountEditModal
          order={order}
          onClose={() => {
            if (!isSavingAmount) {
              setIsAmountEditorOpen(false);
            }
          }}
          onSave={handleSaveExpectedIncome}
        />
      ) : null}
      {isOfflineEditorOpen ? (
        <OfflineOrderEditModal
          order={order}
          onClose={() => {
            if (!isSavingOfflineEdit) {
              setIsOfflineEditorOpen(false);
            }
          }}
          onSave={handleSaveOfflineOrder}
        />
      ) : null}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          if (!isDeletingOffline) {
            setIsDeleteConfirmOpen(false);
          }
        }}
        onConfirm={() => {
          void handleDeleteOfflineOrder();
        }}
        title="作废线下订单"
        message="这会把这张线下订单标记为已删除；如果已经生成出库单，系统会同步回滚库存。这个操作用于处理录错订单。"
        confirmLabel="确认作废"
        cancelLabel="取消"
        variant="danger"
      />

      {isCommissionEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-black/8 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#171b22]">
            <div className="flex items-center justify-between border-b border-black/5 pb-3 dark:border-white/5">
              <h3 className="text-sm font-bold text-foreground">修改刷单佣金</h3>
              <button
                type="button"
                onClick={() => setIsCommissionEditorOpen(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs text-muted-foreground">当前订单刷单佣金 (元/单)</label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 dark:border-white/10 dark:bg-[#111827]">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editCommissionValue}
                  onChange={(e) => setEditCommissionValue(e.target.value)}
                  placeholder="例如 6.5"
                  className="h-10 w-full bg-transparent text-sm font-medium outline-none"
                  autoFocus
                />
                <span className="text-xs text-muted-foreground shrink-0">元</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground leading-normal">
                修改后系统将以此佣金重新计算本单纯利润，并更新后台刷单费用统计。
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCommissionEditorOpen(false)}
                className="h-9 rounded-xl border border-black/8 px-4 text-xs font-medium text-muted-foreground hover:bg-black/4 dark:border-white/10 dark:hover:bg-white/4"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isSavingCommission}
                onClick={async () => {
                  const parsed = parseFloat(editCommissionValue);
                  if (isNaN(parsed) || parsed < 0) {
                    showToast("请输入有效的佣金金额", "error");
                    return;
                  }
                  setIsSavingCommission(true);
                  try {
                    const res = await fetch(`/api/orders/${order.id}/sync-brush`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ commission: parsed }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      throw new Error(data.error || "修改失败");
                    }
                    showToast("刷单佣金已成功修改", "success");
                    setIsCommissionEditorOpen(false);
                    onRefresh?.();
                  } catch (err) {
                    showToast(err instanceof Error ? err.message : "修改失败", "error");
                  } finally {
                    setIsSavingCommission(false);
                  }
                }}
                className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground shadow-xs transition-all hover:opacity-90 disabled:opacity-50"
              >
                {isSavingCommission ? <Loader2 size={13} className="animate-spin" /> : null}
                保存修改
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isShopEditorOpen ? (
        <OrderShopEditModal
          order={order}
          onClose={() => setIsShopEditorOpen(false)}
          onSaveSuccess={() => {
            onRefresh?.();
          }}
        />
      ) : null}
    </>
  );
});

function OrderShopEditModal({
  order,
  onClose,
  onSaveSuccess,
}: {
  order: AutoPickOrder;
  onClose: () => void;
  onSaveSuccess: () => void;
}) {
  const [shops, setShops] = useState<Array<{ id: string; name: string; address?: string | null; cityName?: string | null }>>([]);
  const [mappings, setMappings] = useState<Array<{ maiyatianShopId?: string; maiyatianShopName?: string; localShopName?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShopName, setSelectedShopName] = useState<string>(order.matchedShopName || "");
  const [selectedShopId, setSelectedShopId] = useState<string>(order.shopId || "");
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let isMounted = true;
    async function loadMaiyatianShops() {
      try {
        const res = await fetch("/api/orders/integration/maiyatian-shops");
        const data = await res.json();
        if (isMounted) {
          if (res.ok) {
            if (Array.isArray(data.shops)) setShops(data.shops);
            if (Array.isArray(data.maiyatianShopMappings)) setMappings(data.maiyatianShopMappings);

            const matched = data.shops?.find(
              (s: { id: string; name: string }) =>
                s.name === order.matchedShopName || (order.shopId && s.id === order.shopId)
            );
            if (matched) {
              setSelectedShopName(matched.name);
              setSelectedShopId(matched.id);
            }
          }
        }
      } catch (err) {
        console.error("加载麦芽田门店列表失败", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    void loadMaiyatianShops();
    return () => {
      isMounted = false;
    };
  }, [order.shopId, order.matchedShopName]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const targetShop = shops.find((s) => s.name === selectedShopName || s.id === selectedShopId);
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: targetShop?.id || selectedShopId || null,
          maiyatianShopName: targetShop?.name || selectedShopName || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "修改归属门店失败");
      }
      showToast("已成功更新订单归属门店", "success");
      onSaveSuccess();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "修改失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl border border-black/8 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#171b22]">
        <div className="flex items-center justify-between border-b border-black/5 pb-3 dark:border-white/5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">修改订单归属门店</h3>
            <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-white/10">
              #{order.dailyPlatformSequence || 0}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            请从麦芽田门店列表中选择该订单对应的归属门店：
          </p>

          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-xs">正在读取麦芽田门店列表...</span>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              <label
                onClick={() => {
                  setSelectedShopName("");
                  setSelectedShopId("");
                }}
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3 text-xs font-medium cursor-pointer transition-all",
                  selectedShopName === "" && selectedShopId === ""
                    ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300 font-semibold"
                    : "border-black/5 bg-black/2 hover:bg-black/4 dark:border-white/5 dark:bg-white/2 dark:hover:bg-white/4 text-muted-foreground"
                )}
              >
                <span>未指定（不绑定门店）</span>
                {selectedShopName === "" && selectedShopId === "" ? <Check size={14} className="text-sky-500" /> : null}
              </label>

              {shops.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground leading-relaxed">
                  暂未读取到麦芽田门店，请先在系统设置中配置或检查麦芽田连接状态。
                </div>
              ) : (
                shops.map((shop) => {
                  const matchedMapping = mappings.find(
                    (m) =>
                      (shop.id && String(m.maiyatianShopId || "").trim() === shop.id) ||
                      String(m.maiyatianShopName || "").trim() === shop.name
                  );
                  const displayLocalName = matchedMapping?.localShopName || shop.name;
                  const isSelected = selectedShopName === shop.name || (selectedShopId && selectedShopId === shop.id);

                  return (
                    <label
                      key={shop.id || shop.name}
                      onClick={() => {
                        setSelectedShopName(shop.name);
                        setSelectedShopId(shop.id);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-xl border p-3 text-xs font-medium cursor-pointer transition-all",
                        isSelected
                          ? "border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-300 font-semibold"
                          : "border-black/5 bg-black/2 hover:bg-black/4 dark:border-white/5 dark:bg-white/2 dark:hover:bg-white/4 text-foreground"
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2 text-left">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate text-xs font-bold text-foreground">{displayLocalName}</span>
                          {matchedMapping?.localShopName ? (
                            <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-500">
                              已映射
                            </span>
                          ) : null}
                        </div>
                        <span className="truncate text-[11px] text-muted-foreground font-normal mt-0.5">
                          {shop.name} {shop.cityName ? `(${shop.cityName})` : ""}
                        </span>
                      </div>
                      {isSelected ? <Check size={14} className="shrink-0 text-sky-500" /> : null}
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-black/8 px-4 text-xs font-medium text-muted-foreground hover:bg-black/4 dark:border-white/10 dark:hover:bg-white/4"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSaving || isLoading}
            onClick={() => void handleSave()}
            className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground shadow-xs transition-all hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
}
