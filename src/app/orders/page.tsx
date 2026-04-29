"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  canAutoPickCompleteDelivery,
  canAutoPickStartSelfDelivery,
  getBaseAutoPickStatusDisplay,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderTerminalStatus,
} from "@/lib/autoPickOrderStatus";
import { AutoPickIntegrationConfig, AutoPickMaiyatianShop, AutoPickOrder, AutoPickOrderItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync";
type OrdersTab = "today" | "all";

type OrderResponse = {
  items: AutoPickOrder[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filters: {
    platforms: string[];
    statuses: string[];
  };
  summary?: {
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
  };
};

type LocalShopOption = {
  id: string;
  name: string;
  address: string;
  isDefault?: boolean;
};

function serializeIntegrationConfig(config: Pick<AutoPickIntegrationConfig, "maiyatianCookie" | "maiyatianShopMappings">) {
  return JSON.stringify({
    maiyatianCookie: String(config.maiyatianCookie || ""),
    maiyatianShopMappings: Array.isArray(config.maiyatianShopMappings) ? config.maiyatianShopMappings : [],
  });
}

function serializeMaiyatianMappings(config: Pick<AutoPickIntegrationConfig, "maiyatianShopMappings">) {
  return JSON.stringify(Array.isArray(config.maiyatianShopMappings) ? config.maiyatianShopMappings : []);
}

const TODAY_TAB_PAGE_SIZE = 9999;
const ALL_ORDERS_BATCH_SIZE = 50;

function toCurrency(value: number | null | undefined) {
  const amount = Number(value || 0) / 100;
  return `¥${amount.toFixed(2)}`;
}

function getCommissionDisplay(value: number | null | undefined) {
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

function getExpectedIncome(expectedIncome: number | null | undefined, actualPaid: number | null | undefined, platformCommission: number | null | undefined) {
  const directIncome = Number(expectedIncome);
  if (Number.isFinite(directIncome)) {
    return directIncome;
  }
  const paid = Number(actualPaid || 0);
  const commission = Number(platformCommission || 0);
  return paid - commission;
}

function getOrderActionErrorMessage(raw: unknown) {
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
    case "delivery-not-started":
      return "当前订单还没进入配送中，暂时不能完成配送。";
    case "pending-self-delivery-not-requested":
      return "这张订单还没有加入待自配。";
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

function getBrushSyncSkippedReasonText(raw: unknown) {
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


function getDisplayStatus(order: Pick<AutoPickOrder, "isPickup" | "status">) {
  const baseStatus = getBaseAutoPickStatusDisplay(order.status);
  if (!order.isPickup) {
    return baseStatus;
  }

  if (baseStatus === "已取消") return "已取消";
  if (baseStatus === "已删除") return "已删除";
  if (baseStatus === "已完成") return "已取货";
  return "待取货";
}

function isCompletedStatus(status?: string | null) {
  return isAutoPickOrderCompletedStatus(status);
}

function isCancelledStatus(status?: string | null) {
  return isAutoPickOrderCancelledStatus(status);
}

function isTerminalStatus(status?: string | null) {
  return isAutoPickOrderTerminalStatus(status);
}

function isDeliveringStatus(status?: string | null) {
  return isAutoPickOrderDeliveringStatus(status);
}

function getStatusTone(display: string) {

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

  if (display === "已完成") {
    return {
      badge: "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      dot: "bg-emerald-500",
      soft: "bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
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

function hasAutoCompleteFailure(order: Pick<AutoPickOrder, "autoCompleteJobStatus">) {
  return String(order.autoCompleteJobStatus || "").trim().toLowerCase() === "failed"
    || String(order.autoCompleteJobStatus || "").trim().toUpperCase() === "FAILED";
}

function hasAutoOutboundFailure(order: Pick<AutoPickOrder, "autoOutboundStatus" | "hasOutbound">) {
  if (order.hasOutbound) {
    return false;
  }
  return String(order.autoOutboundStatus || "").trim().toLowerCase() === "failed";
}

function getPlatformBadgeMeta(platform?: string | null) {
  const text = String(platform || "").trim();
  const normalized = text.toLowerCase();

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

function getOrderItemDisplay(item: AutoPickOrderItem) {
  const matchedProduct = item.matchedProduct;
  return {
    name: matchedProduct?.name || item.productName || "未命名商品",
    sku: item.productNo || matchedProduct?.sku || "-",
    image: matchedProduct?.image || item.thumb || null,
    quantity: item.quantity,
  };
}

function getOrderSourceLabel(order: AutoPickOrder) {
  return order.matchedShopName || "";
}

function getFulfillmentLabel(order: Pick<AutoPickOrder, "isPickup">) {
  if (order.isPickup) return "到店自取";
  return "配送上门";
}

function getOrderTypeLabel(order: Pick<AutoPickOrder, "isSubscribe">) {
  if (order.isSubscribe) return "预约单";
  return "";
}

function getItemCount(items: AutoPickOrderItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function formatDistanceKm(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} km` : "-";
}

function formatCompactDateTime(value: string | null | undefined) {
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

function getDeadlineDisplay(order: Pick<AutoPickOrder, "isPickup" | "deliveryDeadline" | "deliveryTimeRange">) {
  const deadlineText = String(order.deliveryDeadline || "").trim();
  const rangeText = String(order.deliveryTimeRange || "").trim();
  const text = order.isPickup ? (rangeText || deadlineText) : deadlineText;
  if (!text) {
    return "-";
  }

  if (!/\d{1,2}:\d{2}/.test(text)) {
    return "-";
  }

  if (order.isPickup) {
    return text;
  }

  const rangeMatch = text.match(/^(.+?\d{1,2}:\d{2})\s*[-~至].*$/);
  if (rangeMatch?.[1]) {
    return rangeMatch[1].trim();
  }

  const firstTimeMatch = text.match(/^(.*?\d{1,2}:\d{2})/);
  return firstTimeMatch?.[1]?.trim() || "-";
}

function isSubscribeOrder(order: Pick<AutoPickOrder, "isSubscribe" | "isPickup">) {
  return Boolean(order.isSubscribe) && !order.isPickup;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/[0.05]">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[30px] font-black leading-none tracking-tight text-foreground">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatusBadge({ order }: { order: Pick<AutoPickOrder, "isPickup" | "status"> }) {
  const display = getDisplayStatus(order);
  const tone = getStatusTone(display);
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black", tone.badge)}>
      <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
      {display}
    </span>
  );
}

function DetailStat({
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
    <div className={cn("rounded-2xl border border-black/6 bg-black/[0.02] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03] sm:px-3 sm:py-2", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold text-foreground", valueClassName)}>{value}</div>
    </div>
  );
}

function DetailBlock({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-black/6 bg-black/[0.02] px-3 py-3 dark:border-white/8 dark:bg-white/[0.03] sm:px-3 sm:py-2.5", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 break-words text-sm font-medium leading-5 text-foreground">{value}</div>
    </div>
  );
}

function ProductStripItem({ item }: { item: AutoPickOrderItem }) {
  const display = getOrderItemDisplay(item);

  return (
    <div className="flex items-center gap-2.5 rounded-[16px] border border-black/6 bg-white/70 px-2.5 py-2 dark:border-white/8 dark:bg-white/[0.04] sm:gap-3 sm:rounded-[18px] sm:px-3 sm:py-2.5">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-white/[0.06] sm:h-11 sm:w-11 sm:rounded-xl">
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
        <div className="line-clamp-2 break-words text-[13px] font-medium leading-4.5 text-foreground sm:text-sm sm:leading-5 sm:line-clamp-1">
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

function ActionButton({
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
          : "border border-black/8 bg-white/85 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
      )}
    >
      {icon}
      <span className={cn(mobileIconOnly ? "sr-only sm:not-sr-only sm:inline" : "")}>{label}</span>
    </button>
  );
}

function OrderCard({
  order,
  expanded,
  actingId,
  onToggleExpanded,
  onRunAction,
}: {
  order: AutoPickOrder;
  expanded: boolean;
  actingId: string;
  onToggleExpanded: (id: string) => void;
  onRunAction: (orderId: string, action: OrderAction) => void;
}) {
  const itemCount = getItemCount(order.items);
  const completed = isCompletedStatus(order.status);
  const cancelled = isCancelledStatus(order.status);
  const deleted = getBaseAutoPickStatusDisplay(order.status) === "已删除";
  const terminal = isTerminalStatus(order.status);
  const delivering = isDeliveringStatus(order.status) || Boolean(order.autoCompleteAt);
  const pickup = Boolean(order.isPickup);
  const subscribe = isSubscribeOrder(order);
  const canStartSelfDelivery = canAutoPickStartSelfDelivery(order.status, order.rawPayload);
  const canFinishDelivery = canAutoPickCompleteDelivery(order.status);
  const hasOutbound = Boolean(order.hasOutbound);
  const orderTypeLabel = getOrderTypeLabel(order);
  const platformMeta = getPlatformBadgeMeta(order.platform);
  const commissionDisplay = getCommissionDisplay(order.platformCommission);
  const expectedIncome = getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission);
  const sourceLabel = getOrderSourceLabel(order);
  const deadlineDisplay = getDeadlineDisplay(order);
  const autoCompleteFailed = hasAutoCompleteFailure(order);
  const autoOutboundFailed = hasAutoOutboundFailure(order);
  const compactCompletedAt = formatCompactDateTime(order.completedAt);
  const compactAutoCompleteAt = formatCompactDateTime(order.autoCompleteAt);
  const compactDeadlineDisplay = formatCompactDateTime(deadlineDisplay);
  return (
    <article className="overflow-hidden rounded-[26px] border border-black/8 bg-white/78 shadow-xs transition-all hover:border-black/12 dark:border-white/10 dark:bg-white/[0.04] sm:rounded-[30px]">
      <div className="border-b border-black/6 px-3.5 py-3.5 dark:border-white/6 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/8 bg-black/[0.03] pl-2 pr-2.5 text-foreground dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden">
                      <Image
                        src={platformMeta.iconSrc}
                        alt={platformMeta.iconAlt}
                        width={20}
                        height={20}
                        className="h-5 w-5 object-cover"
                        unoptimized
                      />
                    </span>
                    <span className="pr-0.5 text-[15px] font-semibold leading-none tracking-tight">#{order.dailyPlatformSequence || 0}</span>
                  </span>
                  {sourceLabel ? (
                    <span className="inline-flex h-8 min-w-0 max-w-[calc(100vw-11rem)] items-center rounded-full border border-black/8 bg-black/[0.03] px-2.5 text-[13px] font-medium leading-none text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] sm:max-w-[220px]">
                      <span className="truncate">{sourceLabel}</span>
                    </span>
                  ) : null}
                  {orderTypeLabel ? (
                    <span className="inline-flex h-8 items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-2.5 text-[13px] font-medium leading-none text-violet-700 dark:text-violet-400">
                      {orderTypeLabel}
                    </span>
                  ) : null}
                  {order.isMainSystemSelfDelivery ? (
                    <span className="inline-flex h-8 items-center rounded-full border border-rose-500/15 bg-rose-500/10 px-2.5 text-[13px] font-medium leading-none text-rose-700 dark:text-rose-400">
                      刷单
                    </span>
                  ) : null}
                  {autoOutboundFailed ? (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-2.5 text-[13px] font-medium leading-none text-rose-700 dark:text-rose-400">
                      <TriangleAlert size={13} />
                      出库待处理
                    </span>
                  ) : null}
                  <StatusBadge order={order} />
                </div>

                <div className="w-full rounded-[18px] border border-black/8 bg-black/[0.02] px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03] sm:hidden">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">实付</div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{toCurrency(order.actualPaid)}</div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</div>
                    </div>
                    <div className="col-span-2 flex min-w-0 items-center justify-between border-t border-black/6 pt-2 dark:border-white/8">
                      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{commissionDisplay.label}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{commissionDisplay.value}</span>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:flex sm:flex-wrap sm:justify-end sm:gap-2">
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03] sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">实付</span>
                    <span className="truncate text-sm font-semibold text-foreground">{toCurrency(order.actualPaid)}</span>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03] sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">到手</span>
                    <span className="truncate text-sm font-semibold text-foreground">{toCurrency(expectedIncome)}</span>
                  </div>
                  <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-black/8 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03] sm:col-span-1 sm:inline-flex sm:h-9 sm:justify-start sm:rounded-full sm:py-0">
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
          <div className="rounded-[18px] border border-black/6 bg-black/[0.02] p-2.5 dark:border-white/8 dark:bg-white/[0.03] sm:rounded-[24px] sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {order.items.length > 1 ? "商品列表" : "商品"}
              </div>
              <div className="text-xs font-medium text-muted-foreground">共 {itemCount} 件商品</div>
            </div>

            <div className="mt-2 grid gap-1.5 sm:mt-2.5 sm:gap-2">
              {order.items.map((item, index) => (
                <ProductStripItem key={`${item.productNo || item.productName}-${index}`} item={item} />
              ))}
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
                    <span className="truncate sm:hidden">{`${compactCompletedAt} ${pickup ? "自提" : "完成"}`}</span>
                    <span className="hidden sm:inline">{`${formatLocalDateTime(order.completedAt)} ${pickup ? "已取货" : "已完成"}`}</span>
                  </>
                ) : pickup ? "已取货" : "订单已完成"}
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
            {!terminal && order.autoCompleteAt ? (
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
              <span className="ml-auto inline-flex min-w-0 items-center justify-end gap-1.5 rounded-full border border-black/8 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] sm:ml-0 sm:justify-start sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <Clock3 size={12} />
                <span className="min-w-0 text-right sm:hidden">
                  <span className="block truncate">{pickup ? `取货 ${compactDeadlineDisplay}` : subscribe ? `预约 ${compactDeadlineDisplay}` : `最晚 ${compactDeadlineDisplay}`}</span>
                </span>
                <span className="hidden sm:inline">
                  {pickup ? `取货时间 ${deadlineDisplay}` : subscribe ? `预约送达 ${deadlineDisplay}` : `最晚送达 ${deadlineDisplay}`}
                </span>
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4 lg:min-w-[440px]">
            <ActionButton
              label={expanded ? "收起详情" : "展开详情"}
              icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => onToggleExpanded(order.id)}
              mobileIconOnly
              title={expanded ? "收起详情" : "展开详情"}
            />
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
              disabled={Boolean(actingId) || terminal || delivering || pickup || !canStartSelfDelivery}
              mobileIconOnly
              title={
                pickup
                  ? "到店自取订单不需要发起自配送"
                  : terminal
                  ? (cancelled ? "订单已取消，不能发起自配" : "订单已完成，不能再次发起自配")
                  : delivering
                    ? "订单已在配送中，不能重复发起自配"
                    : !canStartSelfDelivery
                      ? "订单还没完成拣货，暂时不能发起自配"
                    : undefined
              }
            />
            <ActionButton
              label={pickup ? "完成取货" : "完成配送"}
              variant="primary"
              icon={actingId === `${order.id}:${pickup ? "pickup-complete" : "complete-delivery"}` ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
              onClick={() => onRunAction(order.id, pickup ? "pickup-complete" : "complete-delivery")}
              disabled={Boolean(actingId) || terminal || (!pickup && !canFinishDelivery)}
              mobileIconOnly
              title={
                pickup
                  ? (terminal ? (cancelled ? "订单已取消，不能完成取货" : "订单已取货，不能重复完成取货") : undefined)
                  : terminal
                    ? (cancelled ? "订单已取消，不能完成配送" : "订单已完成，不能重复完成配送")
                    : !canFinishDelivery
                      ? "订单还没进入配送中，暂时不能完成配送"
                    : undefined
              }
            />
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-black/6 bg-zinc-50/60 px-3.5 py-4 dark:border-white/6 dark:bg-white/[0.025] sm:px-5 sm:py-5">
          <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/[0.04] sm:rounded-[24px] sm:p-4">
              <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:mb-3">系统信息</h3>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <DetailStat label="订单状态" value={getDisplayStatus(order)} />
                <DetailStat label="订单类型" value={orderTypeLabel || "普通单"} />
                <DetailStat label="刷单标记" value={order.isMainSystemSelfDelivery ? "主系统自配" : "否"} />
                <DetailStat label="出库状态" value={hasOutbound ? "已出库" : (autoOutboundFailed ? "自动出库失败" : "未出库")} />
                <DetailStat label="履约方式" value={getFulfillmentLabel(order)} />
                <DetailStat label="配送距离" value={pickup ? "-" : formatDistanceKm(order.distanceKm)} />
                <DetailStat label={pickup ? "取货时间" : subscribe ? "预约送达" : "最晚送达"} value={deadlineDisplay} />
              </div>
              <div className="mt-2 space-y-2 sm:mt-2.5 sm:space-y-2.5">
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
                  <div className="rounded-2xl border border-rose-500/15 bg-rose-500/8 px-3 py-3 dark:bg-rose-500/[0.08]">
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
                  <div className="rounded-2xl border border-rose-500/15 bg-rose-500/8 px-3 py-3 dark:bg-rose-500/[0.08]">
                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                      <DetailStat label="自动出库" value="失败" />
                      <DetailStat label="尝试时间" value={order.autoOutboundAttemptedAt ? formatLocalDateTime(order.autoOutboundAttemptedAt) : "-"} />
                    </div>
                    <div className="mt-2 sm:mt-2.5">
                      <DetailBlock label="失败原因" value={order.autoOutboundError || "-"} />
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="space-y-3 sm:space-y-4">
              <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/[0.04] sm:rounded-[24px] sm:p-4">
                <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:mb-3">金额信息</h3>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <DetailStat label="顾客实付" value={toCurrency(order.actualPaid)} />
                  <DetailStat label="预计到手" value={toCurrency(expectedIncome)} />
                  <div className="col-span-2">
                    <DetailStat label={commissionDisplay.label} value={commissionDisplay.value} />
                  </div>
                </div>
              </section>
              <section className="rounded-[20px] border border-black/6 bg-white/80 p-3.5 dark:border-white/8 dark:bg-white/[0.04] sm:rounded-[24px] sm:p-4">
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
  );
}

function MappingSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative mt-2.5">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-medium outline-none transition-all",
          "border-black/8 bg-white/90 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10",
          "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-white/[0.06]"
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {selected?.label || "暂不映射"}
        </span>
        <ChevronDown size={15} className={cn("shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-black/8 bg-white/95 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#111827]/96">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-primary/12 text-foreground"
                      : "text-foreground hover:bg-black/[0.035] dark:hover:bg-white/[0.05]"
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{option.label}</div>
                    {option.hint ? (
                      <div className={cn("mt-1 line-clamp-2 text-[11px] leading-4", active ? "text-foreground/70" : "text-muted-foreground")}>
                        {option.hint}
                      </div>
                    ) : null}
                  </div>
                  {active ? <Check size={14} className="mt-0.5 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IntegrationModal({
  integrationConfig,
  maiyatianShops,
  localShops,
  isFetchingMaiyatianShops,
  isTestingPlugin,
  isTestingCookie,
  isRegeneratingInboundApiKey,
  modalRef,
  onClose,
  onChange,
  onFetchMaiyatianShops,
  onRegenerateInboundApiKey,
  onTestPlugin,
  onTestCookie,
}: {
  integrationConfig: AutoPickIntegrationConfig;
  maiyatianShops: AutoPickMaiyatianShop[];
  localShops: LocalShopOption[];
  isFetchingMaiyatianShops: boolean;
  isTestingPlugin: boolean;
  isTestingCookie: boolean;
  isRegeneratingInboundApiKey: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChange: (value: AutoPickIntegrationConfig) => void;
  onFetchMaiyatianShops: () => void;
  onRegenerateInboundApiKey: () => void;
  onTestPlugin: () => void;
  onTestCookie: () => void;
}) {
  const hasCookie = Boolean(integrationConfig.maiyatianCookie.trim());
  const [isEditingCookie, setIsEditingCookie] = useState(!hasCookie);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const pillButtonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/8 bg-white/85 px-3 py-2 text-[11px] font-black text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-all duration-150 hover:-translate-y-px hover:border-black/12 hover:bg-white hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 sm:min-h-9 sm:rounded-full sm:px-3 sm:py-1.5 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/92 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-white/18 dark:hover:bg-white/[0.09] dark:hover:text-white dark:hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)]";
  const localShopOptions = localShops.map((item) => ({
    value: item.name,
    label: `${item.name}${item.isDefault ? "（默认）" : ""}`,
    hint: item.address,
  }));
  const callbackBaseUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.origin;
  }, []);
  const callbackOrderUrl = callbackBaseUrl ? `${callbackBaseUrl}/api/v1/api-key/listened-orders` : "/api/v1/api-key/listened-orders";

  useEffect(() => {
    if (!integrationConfig.maiyatianCookie.trim()) {
      setIsEditingCookie(true);
      return;
    }
    setIsEditingCookie(false);
  }, [integrationConfig.maiyatianCookie]);

  const copyCallbackUrl = useCallback(async () => {
    if (!callbackOrderUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(callbackOrderUrl);
    setCopiedCallback(true);
    window.setTimeout(() => setCopiedCallback(false), 1500);
  }, [callbackOrderUrl]);

  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[1120px] flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b111e]/98 sm:rounded-[32px]"
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-0 pt-5 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              Auto Pick
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">订单对接配置</h2>
            <p className="mt-2 text-sm text-muted-foreground">脚本负责监听订单和执行动作，主系统这里只保留回调配置和门店映射。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/[0.04]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-[18px] border border-black/8 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.03] lg:col-start-1 lg:row-start-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">系统回调地址</div>
                <button
                  type="button"
                  onClick={() => void copyCallbackUrl()}
                  className={pillButtonClass}
                >
                  <CheckCheck size={12} />
                  {copiedCallback ? "已复制" : "复制"}
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-black/8 bg-white/72 px-3 py-3 dark:border-white/10 dark:bg-[#111827]">
                <div className="break-all font-mono text-xs leading-5 text-foreground">{callbackOrderUrl}</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">脚本里的上报地址填这里，`MYSHOP_API_KEY` 填下面的回调密钥。</p>
            </div>

            <div className="rounded-[20px] border border-black/8 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.03] sm:p-4 lg:col-start-2 lg:row-start-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">麦芽田 Cookie</div>
                  <p className="mt-1 text-xs text-muted-foreground">这里只用于读取麦芽田门店，方便你做门店映射。</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                  {hasCookie ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingCookie((current) => !current)}
                      className={cn(pillButtonClass, "min-w-[64px]")}
                    >
                      {isEditingCookie ? "取消" : "编辑"}
                    </button>
                  ) : null}
                  {hasCookie ? (
                    <button
                      type="button"
                      onClick={() => onChange({ ...integrationConfig, maiyatianCookie: "" })}
                      className={cn(pillButtonClass, "min-w-[64px]")}
                    >
                      删除
                    </button>
                  ) : null}
                </div>
              </div>

              {isEditingCookie ? (
                <textarea
                  value={integrationConfig.maiyatianCookie}
                  onChange={(event) => onChange({ ...integrationConfig, maiyatianCookie: event.target.value })}
                  placeholder="粘贴麦芽田 cookie，用于读取发货门店"
                  className="mt-3 min-h-[92px] w-full rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#111827]"
                />
              ) : (
                <div
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  className="mt-3 select-none rounded-xl border border-black/8 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-[#111827]"
                >
                  <div className="text-sm font-medium text-foreground">已保存 Cookie</div>
                  <div className="mt-1 text-xs text-muted-foreground">默认隐藏，当前界面不展示明文。</div>
                  <div className="mt-2 font-mono text-xs tracking-[0.18em] text-muted-foreground">
                    {"•".repeat(28)}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[18px] border border-black/8 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.03] lg:col-start-1 lg:row-start-2">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">脚本地址</div>
                <input
                  value={integrationConfig.pluginBaseUrl}
                  onChange={(event) => onChange({ ...integrationConfig, pluginBaseUrl: event.target.value })}
                  placeholder="例如 http://127.0.0.1:22800"
                  className="mt-3 h-11 w-full rounded-xl border border-black/8 bg-white/80 px-3 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#111827]"
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">主系统通过这个地址调用 `auto-pick` 脚本。</p>
              </div>
              <div className="mt-4 min-w-0 border-t border-black/8 pt-4 dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">回调密钥</div>
                  <button
                    type="button"
                    onClick={onRegenerateInboundApiKey}
                    disabled={isRegeneratingInboundApiKey}
                    className={pillButtonClass}
                  >
                    {isRegeneratingInboundApiKey ? "生成中..." : "重新生成"}
                  </button>
                </div>
                <div
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  className="mt-3 select-none rounded-xl border border-black/8 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-[#111827]"
                >
                  <div className="text-sm font-medium text-foreground">已保存唯一密钥</div>
                  <div className="mt-1 text-xs text-muted-foreground">默认隐藏，重新生成后系统会自动复制到剪贴板。</div>
                  <div className="mt-2 font-mono text-xs tracking-[0.18em] text-muted-foreground">
                    {"•".repeat(28)}
                  </div>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">脚本上报订单时使用这个值区分用户。</p>
              </div>
            </div>

            <div className="rounded-[20px] border border-black/8 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.03] sm:p-4 lg:col-start-2 lg:row-start-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">麦芽田门店绑定</div>
                  <p className="mt-1 text-xs text-muted-foreground">读取麦芽田发货门店后，在这里手动映射到系统门店。</p>
                </div>
                <button
                  type="button"
                  onClick={onFetchMaiyatianShops}
                  disabled={isFetchingMaiyatianShops}
                  className={cn(
                    pillButtonClass,
                    "min-w-[88px] shrink-0 self-start px-3.5 text-center leading-4",
                    "bg-white/88 dark:bg-white/[0.05]",
                    "disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-black/6 disabled:bg-black/[0.04] disabled:text-muted-foreground disabled:shadow-none",
                    "dark:disabled:border-white/10 dark:disabled:bg-white/[0.04] dark:disabled:text-white/45"
                  )}
                >
                  {isFetchingMaiyatianShops ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  读取门店
                </button>
              </div>

              {localShops.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-black/8 bg-white/65 px-3 py-2.5 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                  还没有读取到系统发货地址，请先去个人资料里维护地址。
                </div>
              ) : null}

              <div className="mt-3 space-y-2.5">
                {maiyatianShops.length > 0 ? maiyatianShops.map((shop) => {
                  const mapped = integrationConfig.maiyatianShopMappings.find((item) => item.maiyatianShopId === shop.id);
                  return (
                    <div key={shop.id} className="rounded-2xl border border-black/8 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-5 text-foreground">{shop.name}</div>
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {shop.address}
                              </div>
                              <div className="mt-1.5 text-[11px] text-muted-foreground">
                                {shop.cityName ? `${shop.cityName} · ` : ""}ID {shop.id}
                              </div>
                            </div>
                            <span className={cn(
                              "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                              mapped
                                ? "border border-emerald-500/20 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                                : "border border-black/8 bg-black/[0.03] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]"
                            )}>
                              {mapped ? "已映射" : "待映射"}
                            </span>
                          </div>
                          {!mapped?.localShopName ? (
                            <div className="mt-2.5 text-[11px] text-muted-foreground">还没绑定系统门店。</div>
                          ) : null}
                        </div>

                        <div className="rounded-[16px] border border-black/8 bg-black/[0.02] p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">系统门店</div>
                          <MappingSelect
                            value={mapped?.localShopName || ""}
                            options={[{ value: "", label: "暂不映射" }, ...localShopOptions]}
                            onChange={(localShopName) => {
                              const nextMappings = integrationConfig.maiyatianShopMappings.filter((item) => item.maiyatianShopId !== shop.id);
                              if (localShopName) {
                                nextMappings.push({
                                  maiyatianShopId: shop.id,
                                  maiyatianShopName: shop.name,
                                  maiyatianShopAddress: shop.address,
                                  localShopName,
                                  cityCode: shop.cityCode || undefined,
                                  cityName: shop.cityName || undefined,
                                });
                              }
                              onChange({
                                ...integrationConfig,
                                maiyatianShopMappings: nextMappings,
                              });
                            }}
                          />
                          {!mapped?.localShopName ? (
                            <div className="mt-2 text-[11px] text-muted-foreground">选择后会固定这条映射。</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[18px] border border-dashed border-black/8 bg-white/60 px-4 py-5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.02]">
                    读取后会在这里列出麦芽田发货门店，你可以逐条绑定到系统门店。
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-start-1 lg:row-start-3">
              <ActionButton
                label={isTestingPlugin ? "测试中..." : "测试脚本"}
                icon={isTestingPlugin ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                onClick={() => onTestPlugin()}
                disabled={isTestingPlugin}
              />
            </div>

            <div className="lg:col-start-2 lg:row-start-3">
              <ActionButton
                label={isTestingCookie ? "测试中..." : "测试 Cookie"}
                icon={isTestingCookie ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                onClick={() => onTestCookie()}
                disabled={isTestingCookie}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { showToast } = useToast();
  const todayDate = formatLocalDate(new Date());
  const modalRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const hasLoadedIntegrationRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [meta, setMeta] = useState<OrderResponse["meta"]>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<NonNullable<OrderResponse["summary"]>>({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
  });
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<OrdersTab>("today");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shop, setShop] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showCompletedToday, setShowCompletedToday] = useState(false);
  const [actingId, setActingId] = useState("");

  const [integrationConfig, setIntegrationConfig] = useState<AutoPickIntegrationConfig>({
    pluginBaseUrl: "",
    inboundApiKey: "",
    maiyatianCookie: "",
    maiyatianShopMappings: [],
  });
  const [maiyatianShops, setMaiyatianShops] = useState<AutoPickMaiyatianShop[]>([]);
  const [localShops, setLocalShops] = useState<LocalShopOption[]>([]);
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [isTestingPlugin, setIsTestingPlugin] = useState(false);
  const [isTestingCookie, setIsTestingCookie] = useState(false);
  const [isRegeneratingInboundApiKey, setIsRegeneratingInboundApiKey] = useState(false);
  const [isFetchingMaiyatianShops, setIsFetchingMaiyatianShops] = useState(false);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [isBulkBrushSyncing, setIsBulkBrushSyncing] = useState(false);
  const [savedIntegrationDigest, setSavedIntegrationDigest] = useState(() => serializeIntegrationConfig({
    maiyatianCookie: "",
    maiyatianShopMappings: [],
  }));
  const [savedMappingsDigest, setSavedMappingsDigest] = useState(() => serializeMaiyatianMappings({
    maiyatianShopMappings: [],
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isIntegrationOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modalRef.current?.contains(target)) {
        setIsIntegrationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIntegrationOpen]);

  useEffect(() => {
    if (!isIntegrationOpen) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isIntegrationOpen]);

  const fetchIntegrationConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/orders/integration", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "加载对接配置失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      });
      setSavedIntegrationDigest(serializeIntegrationConfig({
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      hasLoadedIntegrationRef.current = true;
    } catch (error) {
      console.error("Failed to fetch order integration config:", error);
      showToast(error instanceof Error ? error.message : "加载对接配置失败", "error");
    }
  }, [showToast]);

  const patchOrder = useCallback((orderId: string, updater: (order: AutoPickOrder) => AutoPickOrder) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  }, []);

  const fetchOrders = useCallback(async (options?: { silent?: boolean; append?: boolean; targetPage?: number }) => {
    if (isFetchingRef.current) {
      return;
    }

    const silent = Boolean(options?.silent);
    const append = Boolean(options?.append) && activeTab === "all";
    isFetchingRef.current = true;
    if (append) {
      setIsLoadingMore(true);
    } else if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const effectivePage = activeTab === "today" ? 1 : (options?.targetPage || 1);
      const effectivePageSize = activeTab === "today" ? TODAY_TAB_PAGE_SIZE : ALL_ORDERS_BATCH_SIZE;
      const params = new URLSearchParams({
        page: String(effectivePage),
        pageSize: String(effectivePageSize),
      });

      const effectiveStartDate = activeTab === "today" ? todayDate : startDate;
      const effectiveEndDate = activeTab === "today" ? todayDate : endDate;

      if (query.trim()) params.set("query", query.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (effectiveStartDate) params.set("startDate", effectiveStartDate);
      if (effectiveEndDate) params.set("endDate", effectiveEndDate);

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "加载订单失败");
      }

      const payload = data as OrderResponse;
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setOrders((current) => {
        if (!append) {
          return nextItems;
        }
        const seen = new Set(current.map((item) => item.id));
        const merged = [...current];
        for (const item of nextItems) {
          if (!seen.has(item.id)) {
            merged.push(item);
          }
        }
        return merged;
      });
      setMeta(payload.meta || { total: 0, page: 1, pageSize: effectivePageSize, totalPages: 1 });
      setCurrentPage(effectivePage);
      setPlatforms(Array.isArray(payload.filters?.platforms) ? payload.filters.platforms : []);
      setStatuses(Array.isArray(payload.filters?.statuses) ? payload.filters.statuses : []);
      setSummary(payload.summary || { receivedAmount: 0, platformCommission: 0, validOrderCount: 0, itemCount: 0, totalDeliveryFee: 0 });
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      isFetchingRef.current = false;
      if (append) {
        setIsLoadingMore(false);
      } else if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [activeTab, endDate, platform, query, showToast, startDate, status, todayDate]);

  useEffect(() => {
    setCurrentPage(1);
    fetchOrders();
  }, [activeTab, endDate, fetchOrders, platform, query, shop, startDate, status]);

  useEffect(() => {
    fetchIntegrationConfig();
  }, [fetchIntegrationConfig]);

  const platformOptions = useMemo(
    () => [{ value: "all", label: "全部平台" }, ...platforms.map((item) => ({ value: item, label: item }))],
    [platforms]
  );

  const statusOptions = useMemo(() => {
    const preferredOrder = ["同步中", "待处理", "已拣货", "待配送", "配送中", "已完成", "已取消", "已删除"];
    const labels = Array.from(
      new Set(
        statuses
          .map((item) => getBaseAutoPickStatusDisplay(item))
          .filter(Boolean)
      )
    );

    const sortedLabels = [
      ...preferredOrder.filter((label) => labels.includes(label)),
      ...labels.filter((label) => !preferredOrder.includes(label)),
    ];

    return [
      { value: "all", label: "全部状态" },
      ...sortedLabels.map((label) => ({
        value: label,
        label,
      })),
    ];
  }, [statuses]);

  const shopOptions = useMemo(() => {
    const labels = Array.from(new Set(orders.map((item) => String(item.matchedShopName || "").trim()).filter(Boolean)));
    return [{ value: "all", label: "全部店铺" }, ...labels.map((label) => ({ value: label, label }))];
  }, [orders]);

  const resetFilters = () => {
    setQuery("");
    setPlatform("all");
    setShop("all");
    setStatus("all");
    setStartDate("");
    setEndDate("");
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const runAction = async (orderId: string, action: OrderAction) => {
    setActingId(`${orderId}:${action}`);
    try {
      const requestInit: RequestInit = { method: "POST" };

      const response = await fetch(`/api/orders/${orderId}/${action}`, requestInit);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(getOrderActionErrorMessage(data?.error || data?.reason), "error");
        return;
      }

      const nowIso = new Date().toISOString();
      if (action === "self-delivery") {
        if (data?.pending) {
          showToast("已加入待自配，拣货完成后会自动发起", "success");
          void fetchOrders({ silent: true });
          return;
        }
        patchOrder(orderId, (order) => ({
          ...order,
          status: "配送中",
          autoCompleteJobStatus: order.autoCompleteJobStatus === "FAILED" ? "PENDING" : order.autoCompleteJobStatus,
          autoCompleteJobError: null,
        }));
      } else if (action === "pickup-complete" || action === "complete-delivery") {
        patchOrder(orderId, (order) => ({
          ...order,
          status: "已完成",
          completedAt: order.completedAt || nowIso,
          autoCompleteAt: null,
          autoCompleteJobStatus: "COMPLETED",
          autoCompleteJobError: null,
          lastSyncedAt: nowIso,
        }));
      } else if (action === "sync" && data?.status) {
        patchOrder(orderId, (order) => ({
          ...order,
          status: String(data.status),
          completedAt: typeof data.completedAt === "string" ? data.completedAt : (String(data.status).includes("完成") ? order.completedAt : null),
          lastSyncedAt: typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : nowIso,
          autoCompleteAt: (String(data.status).includes("完成") || String(data.status).includes("取消")) ? null : order.autoCompleteAt,
        }));
      }

      showToast(
        action === "self-delivery"
          ? "已发起自配送"
          : action === "pickup-complete"
            ? "已发送完成自提指令"
          : action === "complete-delivery"
            ? "已发送完成配送指令"
            : "已同步最新订单状态",
        "success"
      );
      void fetchOrders({ silent: true });
    } catch (error) {
      console.error("Order action failed:", error);
      showToast(error instanceof Error ? getOrderActionErrorMessage(error.message) : "操作失败", "error");
    } finally {
      setActingId("");
    }
  };

  const saveIntegrationConfig = useCallback(async (
    nextConfig?: AutoPickIntegrationConfig,
    options?: { silent?: boolean }
  ) => {
    try {
      const payload = nextConfig && typeof nextConfig === "object" && !("nativeEvent" in (nextConfig as object))
        ? nextConfig
        : integrationConfig;
      const shouldRefreshOrders = serializeMaiyatianMappings(payload) !== savedMappingsDigest;
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "保存对接配置失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      });
      setSavedIntegrationDigest(serializeIntegrationConfig({
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      if (!options?.silent) {
        showToast("自动推单对接配置已保存", "success");
      }
      if (shouldRefreshOrders) {
        void fetchOrders({ silent: true });
      }
    } catch (error) {
      console.error("Failed to save order integration config:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "保存对接配置失败", "error");
      }
    }
  }, [fetchOrders, integrationConfig, savedMappingsDigest, showToast]);

  const regenerateInboundApiKey = useCallback(async () => {
    setIsRegeneratingInboundApiKey(true);
    try {
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateInboundApiKey: true }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "重新生成回调密钥失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      });
      setSavedIntegrationDigest(serializeIntegrationConfig({
        maiyatianCookie: String(data.maiyatianCookie || ""),
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: Array.isArray(data.maiyatianShopMappings) ? data.maiyatianShopMappings : [],
      }));
      const nextInboundApiKey = String(data.inboundApiKey || "").trim();
      if (nextInboundApiKey && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(nextInboundApiKey);
        showToast("已生成新的唯一回调密钥，并自动复制到剪贴板", "success");
      } else {
        showToast("已生成新的唯一回调密钥", "success");
      }
    } catch (error) {
      console.error("Failed to regenerate inbound api key:", error);
      showToast(error instanceof Error ? error.message : "重新生成回调密钥失败", "error");
    } finally {
      setIsRegeneratingInboundApiKey(false);
    }
  }, [showToast]);

  const testIntegrationConfig = async (target: "plugin" | "cookie") => {
    if (target === "plugin") {
      setIsTestingPlugin(true);
    } else {
      setIsTestingCookie(true);
    }
    try {
      const response = await fetch("/api/orders/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...integrationConfig, target }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || `${target === "plugin" ? "脚本" : "Cookie"} 测试失败`);
      }

      showToast(data.ok ? `${target === "plugin" ? "脚本" : "Cookie"} 测试通过` : `${target === "plugin" ? "脚本" : "Cookie"} 测试未通过`, data.ok ? "success" : "error");
    } catch (error) {
      console.error("Failed to test order integration config:", error);
      showToast(error instanceof Error ? error.message : `${target === "plugin" ? "脚本" : "Cookie"} 测试失败`, "error");
    } finally {
      if (target === "plugin") {
        setIsTestingPlugin(false);
      } else {
        setIsTestingCookie(false);
      }
    }
  };

  const fetchLocalShops = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await fetch("/api/orders/integration/local-shops", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取系统地址失败");
      }

      const nextLocalShops = Array.isArray(data?.shops)
        ? data.shops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        : [];

      setLocalShops(nextLocalShops);

      if (!options?.silent && nextLocalShops.length === 0) {
        showToast("还没有读取到系统发货地址，请先去个人资料里维护地址", "error");
      }
    } catch (error) {
      console.error("Failed to fetch local shops:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "读取系统地址失败", "error");
      }
    }
  }, [showToast]);

  const fetchMaiyatianShops = useCallback(async () => {
    const cookie = integrationConfig.maiyatianCookie.trim();
    if (!cookie) {
      showToast("请先填写麦芽田 Cookie", "error");
      return;
    }

    setIsFetchingMaiyatianShops(true);
    try {
      const response = await fetch("/api/orders/integration/maiyatian-shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maiyatianCookie: cookie }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取麦芽田门店失败");
      }

      setMaiyatianShops(Array.isArray(data.shops) ? data.shops : []);
      if (Array.isArray(data.localShops)) {
        setLocalShops(
          data.localShops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        );
      }
      showToast(`已读取 ${Array.isArray(data.shops) ? data.shops.length : 0} 家麦芽田门店`, "success");
    } catch (error) {
      console.error("Failed to fetch Maiyatian shops:", error);
      showToast(error instanceof Error ? error.message : "读取麦芽田门店失败", "error");
    } finally {
      setIsFetchingMaiyatianShops(false);
    }
  }, [integrationConfig.maiyatianCookie, showToast]);

  useEffect(() => {
    if (integrationConfig.maiyatianCookie.trim()) {
      return;
    }
    setMaiyatianShops([]);
  }, [integrationConfig.maiyatianCookie]);

  useEffect(() => {
    if (!hasLoadedIntegrationRef.current) return;
    if (!isIntegrationOpen) return;

    const currentDigest = serializeIntegrationConfig(integrationConfig);
    if (currentDigest === savedIntegrationDigest) return;

    const timer = window.setTimeout(() => {
      void saveIntegrationConfig(integrationConfig, { silent: true });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [integrationConfig, isIntegrationOpen, saveIntegrationConfig, savedIntegrationDigest]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (localShops.length > 0) return;
    void fetchLocalShops();
  }, [fetchLocalShops, isIntegrationOpen, localShops.length]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (!integrationConfig.maiyatianCookie.trim()) return;
    if (maiyatianShops.length > 0) return;
    void fetchMaiyatianShops();
  }, [fetchMaiyatianShops, integrationConfig.maiyatianCookie, isIntegrationOpen, maiyatianShops.length]);

  const syncOrders = async () => {
    setIsBulkSyncing(true);
    try {
      const currentIntegrationDigest = serializeIntegrationConfig(integrationConfig);
      if (currentIntegrationDigest !== savedIntegrationDigest) {
        await saveIntegrationConfig(integrationConfig, { silent: true });
      }

      const targetDate = activeTab === "today"
        ? todayDate
        : (endDate || startDate || todayDate);
      const response = await fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "date",
          date: targetDate,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "批量同步失败");
      }

      const syncedCount = Number(data?.synced || 0);
      const skippedCount = Number(data?.skipped || 0);
      const backfilledCount = Number(data?.backfilled || 0);
      const skippedOrders = Array.isArray(data?.skippedOrders) ? data.skippedOrders : [];
      const firstSkippedReason = skippedOrders[0] && typeof skippedOrders[0] === "object"
        ? String((skippedOrders[0] as { reason?: unknown }).reason || "").trim()
        : "";
      showToast(
        backfilledCount > 0
          ? skippedCount > 0
            ? `已同步 ${syncedCount} 单，补齐 ${backfilledCount} 单，跳过 ${skippedCount} 单${firstSkippedReason ? `：${firstSkippedReason}` : ""}`
            : `已同步 ${syncedCount} 单，补齐 ${backfilledCount} 单`
          : skippedCount > 0
            ? `已同步 ${syncedCount} 单，跳过 ${skippedCount} 单${firstSkippedReason ? `：${firstSkippedReason}` : ""}`
            : `已同步 ${syncedCount} 单`,
        "success"
      );
      await fetchOrders({ silent: true });
    } catch (error) {
      console.error("Failed to sync orders:", error);
      showToast(error instanceof Error ? error.message : "批量同步失败", "error");
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const syncBrushOrders = async () => {
    const targetOrders = eligibleBrushSyncOrders
      .map((item) => ({
        id: item.id,
        matchedShopName: item.matchedShopName || null,
      }))
      .filter((item) => item.id);
    if (targetOrders.length === 0) {
      showToast("当前筛选范围没有可同步刷单的已完成配送单", "error");
      return;
    }

    setIsBulkBrushSyncing(true);
    try {
      const response = await fetch("/api/orders/sync-brush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: targetOrders }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "批量同步刷单失败");
      }

      const syncedCount = Number(data?.synced || 0);
      const updatedCount = Number(data?.updated || 0);
      const skippedCount = Number(data?.skipped || 0);
      const skippedOrders = Array.isArray(data?.skippedOrders) ? data.skippedOrders : [];
      const skippedReasonCounts = new Map<string, number>();
      for (const item of skippedOrders) {
        const reason = item && typeof item === "object"
          ? getBrushSyncSkippedReasonText((item as { reason?: unknown }).reason)
          : "";
        if (!reason) {
          continue;
        }
        skippedReasonCounts.set(reason, (skippedReasonCounts.get(reason) || 0) + 1);
      }
      const skippedReasonSummary = Array.from(skippedReasonCounts.entries())
        .slice(0, 2)
        .map(([reason, count]) => `${reason} ${count} 单`)
        .join("，");

      showToast(
        skippedCount > 0
          ? `已同步 ${syncedCount} 单，已更新 ${updatedCount} 单，不符合条件 ${skippedCount} 单${skippedReasonSummary ? `（${skippedReasonSummary}）` : ""}`
          : `已同步 ${syncedCount} 单，已更新 ${updatedCount} 单`,
        "success"
      );
      await fetchOrders({ silent: true });
    } catch (error) {
      console.error("Failed to sync brush orders:", error);
      showToast(error instanceof Error ? error.message : "批量同步刷单失败", "error");
    } finally {
      setIsBulkBrushSyncing(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (shop === "all") {
      return orders;
    }
    return orders.filter((item) => String(item.matchedShopName || "").trim() === shop);
  }, [orders, shop]);
  const todayPendingOrders = useMemo(() => filteredOrders.filter((item) => !isTerminalStatus(item.status)), [filteredOrders]);
  const todayCompletedOrders = useMemo(() => filteredOrders.filter((item) => isTerminalStatus(item.status)), [filteredOrders]);
  const visibleOrders = activeTab === "today" ? todayPendingOrders : filteredOrders;
  const eligibleBrushSyncOrders = useMemo(
    () => (activeTab === "today" ? todayCompletedOrders : filteredOrders).filter(
      (item) => isCompletedStatus(item.status) && !item.isPickup && !item.isMainSystemSelfDelivery
    ),
    [activeTab, filteredOrders, todayCompletedOrders]
  );
  const ordersForOverview = activeTab === "today" ? filteredOrders : visibleOrders;
  const orderOverviewCounts = useMemo(() => {
    const cancelledCount = ordersForOverview.filter((item) => isCancelledStatus(item.status)).length;
    const validOrders = ordersForOverview.filter((item) => !isCancelledStatus(item.status));
    const brushCount = validOrders.filter((item) => item.isMainSystemSelfDelivery).length;
    const trueOrderCount = Math.max(0, validOrders.length - brushCount);
    return {
      validCount: validOrders.length,
      trueOrderCount,
      brushCount,
      cancelledCount,
    };
  }, [ordersForOverview]);
  const hasActiveFilters = Boolean(query.trim() || platform !== "all" || shop !== "all" || status !== "all" || startDate || endDate);
  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const source = new EventSource("/api/orders/events");

    const queueRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void fetchOrders({ silent: true });
      }, 250);
    };

    source.addEventListener("order-update", queueRefresh);
    source.addEventListener("ready", () => undefined);
    source.onerror = () => undefined;

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      source.close();
    };
  }, [fetchOrders, isMounted]);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const st = window.pageYOffset || document.documentElement.scrollTop || 0;
          setShowScrollTop(st > 10);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative px-2 sm:px-1">
      <div className="space-y-6 sm:space-y-8">
        <section className="rounded-[24px] border border-black/8 bg-white/72 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/[0.04] sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">订单管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeTab === "today" ? "聚焦今天待处理订单" : "按时间和状态回看订单"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={syncOrders}
                  disabled={isBulkSyncing || isLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isBulkSyncing ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                  一键同步
                </button>
                <button
                  type="button"
                  onClick={() => fetchOrders()}
                  disabled={isLoading || isRefreshing}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  刷新订单
                </button>
                <button
                  type="button"
                  onClick={syncBrushOrders}
                  disabled={isBulkBrushSyncing || isLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isBulkBrushSyncing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  同步刷单
                </button>
                <button
                  type="button"
                  onClick={() => setIsIntegrationOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <Settings2 size={15} />
                  对接配置
                </button>
              </div>
            </div>

            <div className="inline-flex w-full rounded-xl border border-black/8 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.04] sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab("today")}
                className={cn(
                  "flex-1 rounded-lg px-5 py-2.5 text-sm font-black transition-all sm:min-w-[140px]",
                  activeTab === "today"
                    ? "bg-foreground text-background dark:bg-white dark:text-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                今日推单
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "flex-1 rounded-lg px-5 py-2.5 text-sm font-black transition-all sm:min-w-[140px]",
                  activeTab === "all"
                    ? "bg-foreground text-background dark:bg-white dark:text-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                全部订单
              </button>
            </div>

            <div className="grid items-start gap-3 lg:grid-cols-3">
              <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/[0.05]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">总订单</div>
                    <div className="mt-2 text-[30px] font-black leading-none tracking-tight text-foreground">{ordersForOverview.length}</div>
                    <p className="mt-2 text-xs text-muted-foreground">{activeTab === "today" ? "今日订单分布" : "当前结果页分布"}</p>
                  </div>
                  <div className="flex min-w-[98px] max-w-[126px] flex-col items-stretch gap-1">
                    <div className="inline-flex items-center justify-between rounded-full border border-sky-500/18 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                      <span className="truncate pr-2">真单</span>
                      <span className="shrink-0">{orderOverviewCounts.trueOrderCount} 单</span>
                    </div>
                    <div className="inline-flex items-center justify-between rounded-full border border-rose-500/18 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                      <span className="truncate pr-2">刷单</span>
                      <span className="shrink-0">{orderOverviewCounts.brushCount} 单</span>
                    </div>
                    <div className="inline-flex items-center justify-between rounded-full border border-slate-500/18 bg-slate-500/10 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                      <span className="truncate pr-2">取消</span>
                      <span className="shrink-0">{orderOverviewCounts.cancelledCount} 单</span>
                    </div>
                  </div>
                </div>
              </div>
              <MetricCard
                label="商家实收"
                value={toCurrency(summary.receivedAmount)}
                hint={`有效订单 ${summary.validOrderCount} 单`}
              />
              <MetricCard
                label="总配送费"
                value={toCurrency(summary.totalDeliveryFee)}
                hint="当前结果页汇总"
              />
            </div>

          </div>
        </section>

        <section className="rounded-[24px] border border-black/8 bg-zinc-50/45 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">筛选</div>
              </div>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-4 py-2 text-xs font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <X size={13} />
                  清空筛选
                </button>
              ) : null}
            </div>

            <div className={cn("grid gap-3", activeTab === "today" ? "lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]" : "lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1fr)]")}>
              <label className="flex h-11 items-center gap-3 rounded-xl border border-black/8 bg-white px-4 focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/[0.03]">
                <Search size={16} className="text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索订单号、地址、商品名、SKU"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>

              <CustomSelect
                value={shop}
                onChange={setShop}
                options={shopOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />
              <CustomSelect
                value={platform}
                onChange={setPlatform}
                options={platformOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />
              <CustomSelect
                value={status}
                onChange={setStatus}
                options={statusOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />

              {activeTab === "today" ? null : (
                <>
                  <DatePicker
                    value={startDate}
                    onChange={setStartDate}
                    placeholder="开始日期"
                    className="h-11 w-full"
                    triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
                  />
                  <DatePicker
                    value={endDate}
                    onChange={setEndDate}
                    placeholder="结束日期"
                    className="h-11 w-full"
                    triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
                  />
                </>
              )}
            </div>

            {activeTab === "today" ? null : (
              <div className="flex flex-col gap-3 rounded-[20px] border border-black/8 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">连续浏览</div>
                  <p className="mt-1 text-xs text-muted-foreground">全部订单不再分页截断，向下浏览时按批次继续加载。</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  已加载 <span className="font-semibold text-foreground">{visibleOrders.length}</span> / {meta.total}
                </div>
              </div>
            )}
          </div>
        </section>

        <main className="space-y-4 pb-8">
          {isLoading ? (
            <div className="grid gap-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[28px] border border-black/8 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]" />
              ))}
            </div>
          ) : null}

          {!isLoading && visibleOrders.length > 0 ? (
            <div className="grid gap-4">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  expanded={expandedIds.includes(order.id)}
                  actingId={actingId}
                  onToggleExpanded={toggleExpanded}
                  onRunAction={runAction}
                />
              ))}
            </div>
          ) : null}

          {!isLoading && activeTab === "today" && todayCompletedOrders.length > 0 ? (
            <section className="rounded-[28px] border border-black/8 bg-white/76 p-3 shadow-xs dark:border-white/10 dark:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => setShowCompletedToday((current) => !current)}
                className="flex w-full items-center justify-between rounded-[22px] border border-black/8 bg-black/[0.02] px-4 py-4 text-left transition-all hover:bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">今日已完成</div>
                  <div className="mt-1 text-lg font-black text-foreground">{todayCompletedOrders.length} 单</div>
                </div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/85 dark:border-white/10 dark:bg-white/[0.04]">
                  {showCompletedToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {showCompletedToday ? (
                <div className="mt-4 grid gap-4">
                  {todayCompletedOrders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={expandedIds.includes(order.id)}
                      actingId={actingId}
                      onToggleExpanded={toggleExpanded}
                      onRunAction={runAction}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {!isLoading && visibleOrders.length === 0 ? (
            <div className="rounded-[28px] border border-black/8 bg-white/76 py-8 dark:border-white/10 dark:bg-white/[0.04]">
              <EmptyState
                icon={<Package2 size={56} strokeWidth={1.5} className="text-muted-foreground/25" />}
                title="当前没有匹配订单"
                description="可以换个筛选条件试试；如果本该有数据，再检查 auto-pick 插件连接和回调地址。"
              />
            </div>
          ) : null}

          {!isLoading && activeTab === "all" && visibleOrders.length > 0 ? (
            <div className="flex justify-center pt-2">
              {meta.page < meta.totalPages ? (
                <button
                  type="button"
                  onClick={() => void fetchOrders({ append: true, targetPage: currentPage + 1 })}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-5 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isLoadingMore ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
                  {isLoadingMore ? "加载中..." : "加载更多"}
                </button>
              ) : (
                <div className="text-sm text-muted-foreground">全部订单已加载完成</div>
              )}
            </div>
          ) : null}
        </main>
      </div>

      {isMounted && isIntegrationOpen
        ? createPortal(
              <IntegrationModal
                integrationConfig={integrationConfig}
                maiyatianShops={maiyatianShops}
                localShops={localShops}
                isFetchingMaiyatianShops={isFetchingMaiyatianShops}
                isTestingPlugin={isTestingPlugin}
                isTestingCookie={isTestingCookie}
                isRegeneratingInboundApiKey={isRegeneratingInboundApiKey}
                modalRef={modalRef}
                onClose={() => setIsIntegrationOpen(false)}
                onChange={setIntegrationConfig}
                onFetchMaiyatianShops={fetchMaiyatianShops}
                onRegenerateInboundApiKey={() => void regenerateInboundApiKey()}
                onTestPlugin={() => void testIntegrationConfig("plugin")}
                onTestCookie={() => void testIntegrationConfig("cookie")}
              />,
            document.body
          )
        : null}

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              onClick={scrollToTop}
              className="fixed bottom-24 right-6 z-9999 rounded-full border border-black/10 bg-white p-3 text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all hover:scale-110 active:scale-95 group sm:bottom-12 sm:right-12 sm:p-4 dark:border-white/10 dark:bg-white/10"
            >
              <ArrowUp size={24} className="transition-transform group-hover:-translate-y-1" />
            </motion.button>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
