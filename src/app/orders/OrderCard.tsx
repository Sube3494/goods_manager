"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package2,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
  TimerReset,
  Truck,
  X,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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

export function readIntegrationConfigResponse(data: unknown): AutoPickIntegrationConfig {
  const payload = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    pluginBaseUrl: String(payload.pluginBaseUrl || ""),
    inboundApiKey: String(payload.inboundApiKey || ""),
    maiyatianCookie: String(payload.maiyatianCookie || ""),
    maiyatianShopMappings: Array.isArray(payload.maiyatianShopMappings) ? payload.maiyatianShopMappings : [],
    selfDeliveryTiming: normalizeSelfDeliveryTiming(payload.selfDeliveryTiming),
    defaultBrushCommission: typeof payload.defaultBrushCommission === "number" ? payload.defaultBrushCommission : 0,
  };
}

export function serializeIntegrationConfig(config: Pick<AutoPickIntegrationConfig, "pluginBaseUrl" | "inboundApiKey" | "maiyatianCookie" | "maiyatianShopMappings" | "selfDeliveryTiming" | "defaultBrushCommission">) {
  return JSON.stringify({
    pluginBaseUrl: String(config.pluginBaseUrl || ""),
    inboundApiKey: String(config.inboundApiKey || ""),
    maiyatianCookie: String(config.maiyatianCookie || ""),
    maiyatianShopMappings: Array.isArray(config.maiyatianShopMappings) ? config.maiyatianShopMappings : [],
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

const TODAY_TAB_PAGE_SIZE = 9999;
const ALL_ORDERS_BATCH_SIZE = 50;

export function toCurrency(value: number | null | undefined) {
  const amount = Number(value || 0) / 100;
  return `¥${amount.toFixed(2)}`;
}

export function formatPercent(value: number | null | undefined) {
  const rate = Number(value || 0);
  return `${(rate * 100).toFixed(1)}%`;
}

export function getCommissionDisplay(value: number | null | undefined) {
  const amount = Number(value || 0);
  if (amount < 0) {
    return {
      label: "平台扣费",
      value: toCurrency(Math.abs(amount)),
    };
  }

  return {
    label: "佣金",
    value: toCurrency(amount),
  };
}

export function getExpectedIncome(expectedIncome: number | null | undefined, actualPaid: number | null | undefined, platformCommission: number | null | undefined) {
  const directIncome = Number(expectedIncome);
  if (Number.isFinite(directIncome)) {
    return directIncome;
  }
  const paid = Number(actualPaid || 0);
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
  return orders.reduce((acc, order) => {
    if (!isCancelledStatus(order.status)) {
      acc.receivedAmount += Math.max(0, getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission));
      acc.platformCommission += Math.max(0, Number(order.platformCommission || 0));
      acc.validOrderCount += 1;
      acc.totalDeliveryFee += getDeliveryFee(order.delivery);
    } else {
      const platformStr = String(order.platform || "").trim().toLowerCase();
      const deliveryObj = order.delivery && typeof order.delivery === "object" && !Array.isArray(order.delivery)
        ? order.delivery as Record<string, unknown>
        : {};
      const logisticNameStr = String(deliveryObj.logisticName || deliveryObj.logistic_name || "").trim().toLowerCase();
      const isMeituanRelated = platformStr.includes("美团") || platformStr.includes("meituan") ||
                               logisticNameStr.includes("美团") || logisticNameStr.includes("meituan");
      if (!isMeituanRelated) {
        acc.totalDeliveryFee += getDeliveryFee(order.delivery);
      }
    }
    acc.itemCount += getItemCount(order.items);
    return acc;
  }, {
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
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

export function hasAutoOutboundFailure(order: Pick<AutoPickOrder, "autoOutboundStatus" | "hasOutbound">) {
  if (order.hasOutbound) {
    return false;
  }
  return String(order.autoOutboundStatus || "").trim().toLowerCase() === "failed";
}

export function getPlatformBadgeMeta(platform?: string | null) {
  const text = String(platform || "").trim();
  const normalized = text.toLowerCase();

  if (normalized.includes("线下交易") || normalized.includes("线下")) {
    return {
      iconSrc: "/platform/线下交易.svg",
      iconAlt: "线下交易",
    };
  }

  if (normalized.includes("美团")) {
    return {
      iconSrc: "/platform/美团.svg",
      iconAlt: "美团",
    };
  }

  if (normalized.includes("京东")) {
    return {
      iconSrc: "/platform/京东.svg",
      iconAlt: "京东",
    };
  }

  if (normalized.includes("淘宝")) {
    return {
      iconSrc: "/platform/淘宝.svg",
      iconAlt: "淘宝",
    };
  }

  return {
    iconSrc: "/platform/其他.svg",
    iconAlt: text || "其他平台",
  };
}

export function getOrderItemDisplay(item: AutoPickOrderItem) {
  const matchedProduct = item.matchedProduct;
  return {
    name: matchedProduct?.name || item.productName || "未命名商品",
    sku: item.productNo || matchedProduct?.sku || "-",
    image: matchedProduct?.image || item.thumb || null,
    quantity: item.quantity,
  };
}

export function getExpandedOrderItemDisplays(item: AutoPickOrderItem) {
  if (Array.isArray(item.displayItems) && item.displayItems.length > 0) {
    return item.displayItems.map((displayItem) => ({
      name: displayItem.name || item.productName || "未命名商品",
      sku: displayItem.sku || item.productNo || "-",
      image: displayItem.image || item.thumb || null,
      quantity: displayItem.quantity,
    }));
  }

  return [getOrderItemDisplay(item)];
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

export function getDeadlineDisplay(order: Pick<AutoPickOrder, "isPickup" | "deliveryDeadline" | "deliveryTimeRange">) {
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

  const leadingRangeMatch = text.match(/^(.*?\d{1,2}:\d{2})\s*[-~至]/);
  if (leadingRangeMatch?.[1]) {
    return leadingRangeMatch[1].trim();
  }

  const firstTimeMatch = text.match(/^(.*?\d{1,2}:\d{2})/);
  return firstTimeMatch?.[1]?.trim() || "-";
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
      <div className="mt-2 text-[30px] font-black leading-none tracking-tight text-foreground">{value}</div>
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
          className="mt-2 text-[30px] font-black leading-none tracking-tight text-foreground cursor-pointer hover:opacity-85 transition-opacity duration-200"
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
  const [expectedIncome, setExpectedIncome] = useState(() => formatCurrencyInputFromCents(getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission)));
  const [isSaving, setIsSaving] = useState(false);

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
            <p className="mt-2 text-xs leading-5 text-muted-foreground">只覆盖京东订单的到手金额，实付保持系统原值不变。</p>
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
            适合修正京东订单智能抓取错误的到手金额，保存后统计也会按这个值走。
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
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-black/6 bg-black/2 px-3 py-3 dark:border-white/8 dark:bg-white/3 sm:px-3 sm:py-2.5", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 wrap-break-word text-sm font-medium leading-5 text-foreground">{value}</div>
    </div>
  );
}

export function ProductStripItem({
  display,
}: {
  display: { name: string; sku: string; image: string | null; quantity: number };
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-black/6 bg-white/70 px-2.5 py-2 dark:border-white/8 dark:bg-white/4 sm:gap-3 sm:rounded-[18px] sm:px-3 sm:py-2.5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-white/6 sm:h-11 sm:w-11 sm:rounded-xl">
        {display.image ? (
          <Image
            src={display.image}
            alt={display.name}
            width={44}
            height={44}
            className="h-full w-full object-cover"
            unoptimized
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
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground sm:mt-1">
          <span>{display.sku}</span>
          <span>x{display.quantity}</span>
        </div>
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

export function OrderCard({
  order,
  expanded,
  actingId,
  onToggleExpanded,
  onRunAction,
  onOpenCostBackfill,
  onOpenMatchEditor,
  onClearManualMatch,
  onRefresh,
}: {
  order: AutoPickOrder;
  expanded: boolean;
  actingId: string;
  onToggleExpanded: (id: string) => void;
  onRunAction: (orderId: string, action: OrderAction) => void;
  onOpenCostBackfill: (order: AutoPickOrder) => void;
  onOpenMatchEditor: (order: AutoPickOrder, item: AutoPickOrderItem) => void;
  onClearManualMatch: (order: AutoPickOrder, item: AutoPickOrderItem) => void;
  onRefresh?: () => void;
}) {
  const [isProfitTooltipOpen, setIsProfitTooltipOpen] = useState(false);
  const [isUpdatingBrush, setIsUpdatingBrush] = useState(false);
  const [isAmountEditorOpen, setIsAmountEditorOpen] = useState(false);
  const [isSavingAmount, setIsSavingAmount] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeletingOffline, setIsDeletingOffline] = useState(false);
  const { showToast } = useToast();

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
  const itemCount = getItemCount(order.items);
  const completed = isCompletedStatus(order.status);
  const cancelled = isCancelledStatus(order.status);
  const deleted = getBaseAutoPickStatusDisplay(order.status) === "已删除";
  const terminal = isTerminalStatus(order.status);
  const abnormal = isAbnormalStatus(order.status);
  const pickup = Boolean(order.isPickup) || order.platform === "线下交易";
  const delivering = !pickup && isDeliveringStatus(order.status);
  const hasOutbound = Boolean(order.hasOutbound);
  const showBrushMarker = !pickup && order.isMainSystemSelfDelivery;
  const orderTypeLabel = getOrderTypeLabel(order);
  const platformMeta = getPlatformBadgeMeta(order.platform);
  const commissionDisplay = getCommissionDisplay(order.platformCommission);
  const expectedIncome = getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission);
  const hasPureProfit = typeof order.pureProfit === "number" && Number.isFinite(order.pureProfit);
  const pureProfit = hasPureProfit ? Number(order.pureProfit) : 0;
  const productCostStatusText = getProductCostStatusText(order);
  const serviceFeeRate = Number(order.serviceFeeRate || 0);
  const deliveryFee = getDeliveryFee(order.delivery);
  const productCost = Number(order.productCost || 0);
  const productCostBreakdown = Array.isArray(order.productCostBreakdown) ? order.productCostBreakdown : [];
  const settlementAfterRate = Math.round(expectedIncome * (1 - serviceFeeRate));
  const isJdOrder = String(order.platform || "").includes("京东");
  const pureProfitTooltipRows = hasPureProfit
    ? (order.isMainSystemSelfDelivery
      ? [
          { label: "扣平台佣金", value: toCurrency(order.platformCommission) },
          { label: "扣刷单佣金", value: toCurrency(- (Math.abs(pureProfit) - Math.abs(Number(order.platformCommission || 0)))) },
        ]
      : [
          { label: "预计到手", value: toCurrency(expectedIncome) },
          { label: `扣抽出 ${formatPercent(serviceFeeRate)} 后`, value: toCurrency(settlementAfterRate) },
          { label: "减配送费", value: toCurrency(deliveryFee) },
          { label: "减货品成本", value: toCurrency(productCost) },
        ])
    : productCostStatusText
      ? [
          { label: "预计到手", value: toCurrency(expectedIncome) },
          { label: "抽出率", value: formatPercent(serviceFeeRate) },
          { label: "配送费", value: toCurrency(deliveryFee) },
          { label: "货品成本", value: productCostStatusText },
        ]
      : [];
  const sourceLabel = getOrderSourceLabel(order);
  const deadlineDisplay = getDeadlineDisplay(order);
  const autoCompleteFailed = hasAutoCompleteFailure(order);
  const autoOutboundFailed = hasAutoOutboundFailure(order);
  const compactCompletedAt = formatCompactDateTime(order.completedAt);
  const compactAutoCompleteAt = formatCompactDateTime(order.autoCompleteAt);
  const compactDeadlineDisplay = formatCompactDateTime(deadlineDisplay);

  useEffect(() => {
    if (!isProfitTooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!profitTooltipRef.current?.contains(event.target as Node)) {
        setIsProfitTooltipOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isProfitTooltipOpen]);

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
                  {sourceLabel ? (
                    <span className="inline-flex h-7 min-w-0 max-w-[calc(100vw-10rem)] items-center rounded-full border border-black/8 bg-black/3 px-1.5 text-[11px] font-medium leading-none text-muted-foreground dark:border-white/10 dark:bg-white/4 sm:h-8 sm:max-w-55 sm:px-2.5 sm:text-[13px]">
                      <span className="truncate">{sourceLabel}</span>
                    </span>
                  ) : null}
                  {orderTypeLabel ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-1.5 text-[11px] font-medium leading-none text-violet-700 dark:text-violet-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      {orderTypeLabel}
                    </span>
                  ) : null}
                  {pickup && order.platform !== "线下交易" ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-sky-500/15 bg-sky-500/10 px-1.5 text-[11px] font-medium leading-none text-sky-700 dark:text-sky-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      到店自取
                    </span>
                  ) : null}
                  {showBrushMarker ? (
                    <span className="inline-flex h-7 items-center rounded-full border border-rose-500/15 bg-rose-500/10 px-1.5 text-[11px] font-medium leading-none text-rose-700 dark:text-rose-400 sm:h-8 sm:px-2.5 sm:text-[13px]">
                      刷单
                    </span>
                  ) : null}
                  {autoOutboundFailed ? (
                    <button
                      type="button"
                      onClick={() => void onRunAction(order.id, "outbound")}
                      disabled={actingId === `${order.id}:outbound`}
                      className="inline-flex h-7 items-center gap-0.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-1.5 text-[11px] font-medium leading-none text-rose-700 transition-all hover:border-rose-500/30 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-[13px]"
                    >
                      <TriangleAlert size={10} className="sm:h-3 sm:w-3" />
                      {actingId === `${order.id}:outbound` ? "处理中..." : "出库待处理"}
                    </button>
                  ) : null}
                  <StatusBadge order={order} />
                  {completed && (hasPureProfit || order.productCostStatus === "pending-backfill") ? (
                    <div ref={profitTooltipRef} className="group/profit relative">
                      {hasPureProfit ? (
                        <button
                          type="button"
                          onClick={() => setIsProfitTooltipOpen((current) => !current)}
                          aria-expanded={isProfitTooltipOpen}
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
                          {isProfitTooltipOpen ? (
                            <div
                              className="fixed inset-0 z-40 bg-slate-950/42 backdrop-blur-[2px] sm:hidden"
                              onClick={() => setIsProfitTooltipOpen(false)}
                            />
                          ) : null}
                          <div className={cn(
                            "pointer-events-none fixed left-1/2 top-1/2 z-50 w-[min(320px,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] -translate-x-1/2 -translate-y-[48%] overflow-y-auto rounded-2xl border border-slate-200/90 bg-white/98 p-3 text-left opacity-0 shadow-[0_22px_60px_rgba(15,23,42,0.22)] backdrop-blur-md transition-all duration-150 dark:border-white/12 dark:bg-[#171b22]/96 dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:pointer-events-none sm:absolute sm:left-1/2 sm:top-full sm:z-30 sm:mt-3 sm:w-[280px] sm:max-h-none sm:-translate-x-1/2 sm:translate-y-1 sm:overflow-visible sm:opacity-0 sm:group-hover/profit:translate-y-0 sm:group-hover/profit:opacity-100",
                            isProfitTooltipOpen && "pointer-events-auto -translate-y-1/2 opacity-100 sm:pointer-events-auto sm:translate-y-0 sm:opacity-100"
                          )}>
                          <div className="hidden absolute left-12 top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-slate-200/90 bg-white/98 dark:border-white/12 dark:bg-[#171b22]/96 sm:block sm:left-1/2 sm:-translate-x-1/2" />
                          <button
                            type="button"
                            onClick={() => setIsProfitTooltipOpen(false)}
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
                                <span className="shrink-0 font-semibold text-slate-950 dark:text-white">
                                  {row.value}
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
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="w-full rounded-[18px] border border-black/8 bg-black/2 px-3 py-2.5 dark:border-white/10 dark:bg-white/3 sm:hidden">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">实付</div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{toCurrency(order.actualPaid)}</div>
                    </div>
                    {isJdOrder ? (
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
                          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</div>
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0 text-right">
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</div>
                        <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</div>
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
                    <span className="truncate text-sm font-semibold text-foreground">{toCurrency(order.actualPaid)}</span>
                  </div>
                  {isJdOrder ? (
                    <button
                      type="button"
                      onClick={() => setIsAmountEditorOpen(true)}
                      disabled={isSavingAmount}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 text-left transition-all hover:border-black/12 hover:bg-black/3 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/4 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0"
                    >
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                      <span className="truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</span>
                      {isSavingAmount ? <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" /> : null}
                    </button>
                  ) : (
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                      <span className="truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</span>
                    </div>
                  )}
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/2 px-3 py-2 dark:border-white/10 dark:bg-white/3 sm:col-span-1 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{commissionDisplay.label}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{commissionDisplay.value}</span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-medium text-muted-foreground sm:hidden">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Clock3 size={12} className="shrink-0" />
                    <span className="truncate">{formatLocalDateTime(order.orderTime)}</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center justify-end gap-1.5 text-right">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{pickup ? "-" : (order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步")}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                  <span className="hidden sm:inline-flex sm:items-center sm:gap-1.5">
                    <Clock3 size={13} />
                    {formatLocalDateTime(order.orderTime)}
                  </span>
                  <span className="hidden sm:inline-flex sm:items-center sm:gap-1.5">
                    <MapPin size={13} />
                    {pickup ? "-" : (order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 py-3 sm:px-5 sm:py-4">
        <div className="grid gap-3">
          <div className="rounded-[18px] border border-black/6 bg-black/2 p-2.5 dark:border-white/8 dark:bg-white/3 sm:rounded-3xl sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {order.items.length > 1 ? "商品列表" : "商品"}
              </div>
              <div className="text-xs font-medium text-muted-foreground">共 {itemCount} 件商品</div>
            </div>

            <div className="mt-2 grid gap-1.5 sm:mt-2.5 sm:gap-2">
              {order.items.flatMap((item, index) =>
                getExpandedOrderItemDisplays(item).map((display, displayIndex) => (
                  <ProductStripItem
                    key={`${item.productNo || item.productName}-${index}-${display.sku}-${displayIndex}`}
                    display={display}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col gap-2 border-t border-black/6 pt-2.5 dark:border-white/6 lg:flex-row lg:items-center lg:justify-between lg:pt-4">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-1.5">
            {completed ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <CheckCheck size={12} />
                {order.completedAt ? (
                  <>
                    <span className="truncate sm:hidden">{`${compactCompletedAt} ${pickup && order.platform !== "线下交易" ? "自提" : "完成"}`}</span>
                    <span className="hidden sm:inline">{`${formatLocalDateTime(order.completedAt)} ${pickup && order.platform !== "线下交易" ? "已取货" : "已完成"}`}</span>
                  </>
                ) : pickup && order.platform !== "线下交易" ? "已取货" : "订单已完成"}
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
            {!pickup && !terminal && !abnormal && order.autoCompleteAt ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <TimerReset size={12} />
                <span className="truncate sm:hidden">{`自动完成 ${compactAutoCompleteAt}`}</span>
                <span className="hidden sm:inline">{`预计自动完成 ${formatLocalDateTime(order.autoCompleteAt)}`}</span>
              </span>
            ) : null}
            {autoCompleteFailed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                自动完成失败
              </span>
            ) : null}
            {deadlineDisplay !== "-" ? (
              <span className="ml-auto inline-flex min-w-0 items-center justify-end gap-1.5 rounded-full border border-black/8 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-white/4 sm:ml-0 sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <Clock3 size={12} />
                <span className="min-w-0 text-right sm:hidden">
                  <span className="block truncate">{pickup ? `取货 ${compactDeadlineDisplay}` : `最晚 ${compactDeadlineDisplay}`}</span>
                </span>
                <span className="hidden sm:inline">
                  {pickup ? `取货时间 ${deadlineDisplay}` : `最晚送达 ${deadlineDisplay}`}
                </span>
              </span>
            ) : null}
          </div>

          <div className={cn(
            "grid gap-2 lg:min-w-110",
            order.platform === "线下交易"
              ? deleted
                ? "grid-cols-1 sm:grid-cols-1 lg:min-w-0 lg:w-32 ml-auto"
                : "grid-cols-2 sm:grid-cols-2 lg:min-w-0 lg:w-64 ml-auto"
              : "grid-cols-4 sm:grid-cols-4"
          )}>
            <ActionButton
              label={expanded ? "收起详情" : "展开详情"}
              icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => onToggleExpanded(order.id)}
              mobileIconOnly={order.platform !== "线下交易"}
              title={expanded ? "收起详情" : "展开详情"}
            />
            {order.platform === "线下交易" && !deleted ? (
              <ActionButton
                label={isDeletingOffline ? "作废中" : "作废"}
                icon={isDeletingOffline ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isDeletingOffline || Boolean(actingId)}
                title="作废这张录错的线下订单，并自动回滚关联出库库存"
              />
            ) : null}
            {order.platform !== "线下交易" && (
              <>
                <ActionButton
                  label="同步"
                  title={cancelled ? "订单已取消，不需要再次同步" : undefined}
                  icon={actingId === `${order.id}:sync` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  onClick={() => onRunAction(order.id, "sync")}
                  disabled={Boolean(actingId) || cancelled}
                  mobileIconOnly
                />
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
                        : undefined
                  }
                />
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
                <DetailStat label={pickup ? "取货时间" : "最晚送达"} value={deadlineDisplay} />
              </div>
              <div className="mt-2 space-y-2 sm:mt-2.5 sm:space-y-2.5">
                <div className="rounded-[18px] border border-black/6 bg-black/2 p-3 dark:border-white/8 dark:bg-white/3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">商品匹配</div>
                    <div className="text-xs text-muted-foreground">可直接手动改</div>
                  </div>
                  <div className="grid gap-2">
                    {order.items.map((item, index) => (
                      <div key={item.id || `${item.productNo || item.productName}-${index}`} className="rounded-2xl border border-black/6 bg-white/80 p-3 dark:border-white/8 dark:bg-white/4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-foreground">{item.matchedProduct?.name || "未匹配到系统商品"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              原始商品：{item.productName || "未命名商品"}{item.productNo ? ` / ${item.productNo}` : ""}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className={cn(
                                "inline-flex items-center rounded-full px-2 py-1 font-bold",
                                item.matchedProduct
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              )}>
                                {item.matchedProduct ? (item.matchedProduct.isManual ? "手动匹配" : "自动匹配") : "未匹配"}
                              </span>
                              {item.matchedProduct?.sku ? (
                                <span className="text-muted-foreground">SKU {item.matchedProduct.sku}</span>
                              ) : null}
                              <span className="text-muted-foreground">x{item.quantity}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.matchedProduct?.isManual ? (
                              <button
                                type="button"
                                onClick={() => onClearManualMatch(order, item)}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-3 text-xs font-bold text-foreground transition-all hover:border-black/12 hover:bg-zinc-100 hover:text-foreground dark:border-white/10 dark:bg-white/6 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14 dark:hover:text-white"
                              >
                                恢复自动
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onOpenMatchEditor(order, item)}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-3 text-xs font-bold text-foreground transition-all hover:border-black/12 hover:bg-zinc-100 hover:text-foreground dark:border-white/10 dark:bg-white/6 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/14 dark:hover:text-white"
                            >
                              改匹配
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 sm:gap-2.5">
                  <DetailBlock label="系统门店" value={order.matchedShopName || "-"} />
                  <DetailBlock label="订单坐标" value={order.longitude != null && order.latitude != null ? `${order.longitude}, ${order.latitude}` : "-"} />
                  <DetailBlock
                    label="门店地址"
                    value={order.rawShopAddress || order.shopAddress || "-"}
                    className="sm:col-span-2"
                  />
                  <DetailBlock
                    label="配送地址"
                    value={pickup ? "-" : order.userAddress}
                    className="sm:col-span-2"
                  />
                  <DetailStat
                    label="订单编号"
                    value={order.orderNo}
                    valueClassName="break-all text-[13px] sm:text-sm"
                  />
                  <DetailStat
                    label="原始 ID"
                    value={order.sourceId}
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
                {autoOutboundFailed ? (
                  <div className="rounded-2xl border border-rose-500/15 bg-rose-500/8 px-3 py-3 dark:bg-rose-500/8">
                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                      <DetailStat label="自动出库" value="失败" />
                      <DetailStat label="尝试时间" value={order.autoOutboundAttemptedAt ? formatLocalDateTime(order.autoOutboundAttemptedAt) : "-"} />
                    </div>
                    <div className="mt-2 sm:mt-2.5">
                      <DetailBlock label="失败原因" value={order.autoOutboundError || "-"} />
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => void onRunAction(order.id, "outbound")}
                        disabled={actingId === `${order.id}:outbound`}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/12 px-3 text-[12px] font-medium text-rose-700 transition-all hover:border-rose-500/35 hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
                      >
                        {actingId === `${order.id}:outbound` ? "正在检查库存..." : "创建采购单"}
                      </button>
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
                  <DetailStat label={isJdOrder ? "京东到手" : "预计到手"} value={toCurrency(expectedIncome)} />
                  <DetailStat label="货品成本" value={order.productCostStatus === "ready" ? toCurrency(order.productCost) : (productCostStatusText || "-")} />
                  <DetailStat label="纯利润" value={hasPureProfit ? toCurrency(pureProfit) : (productCostStatusText || "-")} />
                  <div className="col-span-2">
                    <DetailStat label={commissionDisplay.label} value={commissionDisplay.value} />
                  </div>
                </div>
              </section>
              <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/4 sm:rounded-3xl sm:p-4">
                <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:mb-3">物流信息</h3>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <DetailStat label="物流平台" value={order.delivery?.logisticName || "第三方平台"} />
                  <DetailStat label="配送人" value={order.delivery?.riderName || "-"} />
                  <DetailStat label="取餐时间" value={order.delivery?.pickupTime || "-"} />
                  <DetailStat label="配送费" value={order.delivery?.sendFee != null ? toCurrency(order.delivery.sendFee) : "-"} />
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
      {isAmountEditorOpen && isJdOrder ? (
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
    </>
  );
}
