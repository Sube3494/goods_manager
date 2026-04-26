"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  Loader2,
  MapPin,
  Package2,
  RefreshCw,
  Search,
  Settings2,
  TimerReset,
  Truck,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import {
  getBaseAutoPickStatusDisplay,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderTerminalStatus,
} from "@/lib/autoPickOrderStatus";
import { AutoPickIntegrationConfig, AutoPickOrder, AutoPickOrderItem } from "@/lib/types";
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
    actualPaid: number;
    platformCommission: number;
    itemCount: number;
    deliveryCount: number;
  };
};

const MIN_REFRESH_GAP_MS = 10 * 1000;
const TODAY_ACTIVE_REFRESH_MS = 30 * 1000;
const TODAY_IDLE_REFRESH_MS = 90 * 1000;

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
      return "插件当前页面里没有找到这张订单，请先确认订单仍在可操作列表中。";
    case "target-order-not-in-detail":
      return "插件打开的订单详情和当前订单不一致，请刷新后重试。";
    case "maiyatian-confirm-page-not-found":
    case "not-confirm-page":
      return "插件当前不在新订单页面，请先切回麦芽田新订单页。";
    case "self-delivery-option-not-found":
      return "当前订单没有找到自配送入口。";
    case "complete-delivery-button-not-found":
      return "当前订单没有找到完成配送按钮。";
    case "command-already-running":
      return "插件当前有其他命令正在执行，请稍后再试。";
    case "picking-not-completed":
      return "当前订单还没完成拣货，暂时不能执行这个操作。";
    case "Order already completed":
      return "订单已完成，不需要重复操作。";
    case "Order already cancelled":
      return "订单已取消，不需要继续处理。";
    case "Pickup order does not require self delivery":
      return "到店自取订单不需要发起自配送。";
    case "Non-pickup order does not require pickup complete":
      return "这不是到店自取订单，不需要完成自提。";
    default:
      return reason || "操作失败";
  }
}

function getDisplayStatus(order: Pick<AutoPickOrder, "isPickup" | "status">) {
  const baseStatus = getBaseAutoPickStatusDisplay(order.status);
  if (!order.isPickup) {
    return baseStatus;
  }

  if (baseStatus === "已取消") return "已取消";
  if (baseStatus === "已完成") return "已自提";
  return "待自提";
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
  const terminal = isTerminalStatus(order.status);
  const delivering = isDeliveringStatus(order.status) || Boolean(order.autoCompleteAt);
  const pickup = Boolean(order.isPickup);
  const subscribe = isSubscribeOrder(order);
  const platformMeta = getPlatformBadgeMeta(order.platform);
  const commissionDisplay = getCommissionDisplay(order.platformCommission);
  const expectedIncome = getExpectedIncome(order.expectedIncome, order.actualPaid, order.platformCommission);
  const sourceLabel = getOrderSourceLabel(order);
  const deadlineDisplay = getDeadlineDisplay(order);
  const autoCompleteFailed = hasAutoCompleteFailure(order);
  const compactCompletedAt = formatCompactDateTime(order.completedAt);
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
                  {subscribe ? (
                    <span className="inline-flex h-8 items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-2.5 text-[13px] font-medium leading-none text-violet-700 dark:text-violet-400">
                      预约单
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
                    <span className="truncate">{pickup ? "到店自取" : (order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步")}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                  <span className="hidden sm:inline-flex sm:items-center sm:gap-1.5">
                    <Clock3 size={13} />
                    {formatLocalDateTime(order.orderTime)}
                  </span>
                  <span className="hidden sm:inline-flex sm:items-center sm:gap-1.5">
                    <MapPin size={13} />
                    {pickup ? "到店自取" : (order.distanceKm != null ? formatDistanceKm(order.distanceKm) : "距离待同步")}
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
          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
            {completed ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <CheckCheck size={12} />
                {order.completedAt ? (
                  <>
                    <span className="truncate sm:hidden">{`${compactCompletedAt} ${pickup ? "自提" : "完成"}`}</span>
                    <span className="hidden sm:inline">{`${formatLocalDateTime(order.completedAt)} ${pickup ? "已自提" : "已完成"}`}</span>
                  </>
                ) : pickup ? "已自提" : "订单已完成"}
              </span>
            ) : null}
            {cancelled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/15 bg-slate-500/10 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                订单已取消
              </span>
            ) : null}
            {!terminal && order.autoCompleteAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <TimerReset size={12} />
                预计自动完成 {formatLocalDateTime(order.autoCompleteAt)}
              </span>
            ) : null}
            {autoCompleteFailed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/15 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <X size={12} />
                自动完成失败
              </span>
            ) : null}
            {deadlineDisplay !== "-" ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-black/8 bg-white/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
                <Clock3 size={12} />
                <span className="sm:hidden">
                  <span className="truncate">{pickup ? `取货 ${compactDeadlineDisplay}` : subscribe ? `预约 ${compactDeadlineDisplay}` : `最晚 ${compactDeadlineDisplay}`}</span>
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
              label={pickup ? "完成自提" : "完成配送"}
              variant="primary"
              icon={actingId === `${order.id}:${pickup ? "pickup-complete" : "complete-delivery"}` ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
              onClick={() => onRunAction(order.id, pickup ? "pickup-complete" : "complete-delivery")}
              disabled={Boolean(actingId) || terminal}
              mobileIconOnly
              title={
                pickup
                  ? (terminal ? (cancelled ? "订单已取消，不能完成自提" : "订单已自提，不能重复完成自提") : undefined)
                  : terminal
                    ? (cancelled ? "订单已取消，不能完成配送" : "订单已完成，不能重复完成配送")
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
                <DetailStat label="履约方式" value={pickup ? "到店自取" : "配送上门"} />
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

function IntegrationModal({
  integrationConfig,
  callbackUrl,
  isSavingIntegration,
  isTestingIntegration,
  modalRef,
  onClose,
  onChange,
  onCopyCallback,
  onSave,
  onTest,
}: {
  integrationConfig: AutoPickIntegrationConfig;
  callbackUrl: string;
  isSavingIntegration: boolean;
  isTestingIntegration: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChange: (value: AutoPickIntegrationConfig) => void;
  onCopyCallback: () => void;
  onSave: () => void;
  onTest: () => void;
}) {
  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-black/8 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b111e]/98 sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
              Auto Pick
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground">订单对接配置</h2>
            <p className="mt-2 text-sm text-muted-foreground">这里保留原有接入逻辑，只把信息组织成系统统一的配置面板样式。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/[0.04]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">插件地址</span>
            <input
              value={integrationConfig.pluginBaseUrl}
              onChange={(event) => onChange({ ...integrationConfig, pluginBaseUrl: event.target.value })}
              placeholder="http://127.0.0.1:22800"
              className="h-12 w-full rounded-2xl border border-black/8 bg-black/[0.02] px-4 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/[0.03]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">对接密钥</span>
            <input
              value={integrationConfig.inboundApiKey}
              onChange={(event) => onChange({ ...integrationConfig, inboundApiKey: event.target.value })}
              placeholder="输入 auto-pick inbound API key"
              className="h-12 w-full rounded-2xl border border-black/8 bg-black/[0.02] px-4 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/[0.03]"
            />
          </label>

          <div className="rounded-[24px] border border-black/8 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">回调地址</div>
                <p className="mt-1 text-xs text-muted-foreground">插件把来单上报到这里。</p>
              </div>
              <button
                type="button"
                onClick={onCopyCallback}
                className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-[11px] font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.05]"
              >
                <Copy size={12} />
                复制
              </button>
            </div>
            <code className="mt-3 block break-all rounded-2xl bg-white/80 px-3 py-3 font-mono text-[11px] leading-relaxed text-foreground dark:bg-[#111827]">
              {callbackUrl}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ActionButton
              label={isTestingIntegration ? "测试中..." : "测试连接"}
              icon={isTestingIntegration ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />}
              onClick={onTest}
              disabled={isTestingIntegration}
            />
            <ActionButton
              label={isSavingIntegration ? "保存中..." : "保存配置"}
              variant="primary"
              icon={isSavingIntegration ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              onClick={onSave}
              disabled={isSavingIntegration}
            />
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
  const lastRefreshAtRef = useRef(0);

  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [meta, setMeta] = useState<OrderResponse["meta"]>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<NonNullable<OrderResponse["summary"]>>({
    actualPaid: 0,
    platformCommission: 0,
    itemCount: 0,
    deliveryCount: 0,
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
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showCompletedToday, setShowCompletedToday] = useState(false);
  const [actingId, setActingId] = useState("");

  const [integrationConfig, setIntegrationConfig] = useState<AutoPickIntegrationConfig>({
    pluginBaseUrl: "",
    inboundApiKey: "",
  });
  const [callbackUrl, setCallbackUrl] = useState("");
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [isSavingIntegration, setIsSavingIntegration] = useState(false);
  const [isTestingIntegration, setIsTestingIntegration] = useState(false);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/api/v1/api-key/listened-orders`);
    }
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
      });
    } catch (error) {
      console.error("Failed to fetch order integration config:", error);
      showToast(error instanceof Error ? error.message : "加载对接配置失败", "error");
    }
  }, [showToast]);

  const patchOrder = useCallback((orderId: string, updater: (order: AutoPickOrder) => AutoPickOrder) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  }, []);

  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (isFetchingRef.current) {
      return;
    }

    const silent = Boolean(options?.silent);
    isFetchingRef.current = true;
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
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
      setOrders(Array.isArray(payload.items) ? payload.items : []);
      setMeta(payload.meta || { total: 0, page: 1, pageSize, totalPages: 1 });
      setPlatforms(Array.isArray(payload.filters?.platforms) ? payload.filters.platforms : []);
      setStatuses(Array.isArray(payload.filters?.statuses) ? payload.filters.statuses : []);
      setSummary(payload.summary || { actualPaid: 0, platformCommission: 0, itemCount: 0, deliveryCount: 0 });
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      isFetchingRef.current = false;
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [activeTab, currentPage, endDate, pageSize, platform, query, showToast, startDate, status, todayDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchIntegrationConfig();
  }, [fetchIntegrationConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, endDate, platform, query, shop, startDate, status]);

  const platformOptions = useMemo(
    () => [{ value: "all", label: "全部平台" }, ...platforms.map((item) => ({ value: item, label: item }))],
    [platforms]
  );

  const statusOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        statuses
          .map((item) => item.split(/[,，\s]/)[0].trim())
          .filter(Boolean)
      )
    );

    return [
      { value: "all", label: "全部状态" },
      ...labels.map((label) => ({
        value: statuses.find((item) => item.split(/[,，\s]/)[0].trim() === label) || label,
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
      const response = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast(getOrderActionErrorMessage(data?.error || data?.reason), "error");
        return;
      }

      const nowIso = new Date().toISOString();
      if (action === "self-delivery") {
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

  const saveIntegrationConfig = async () => {
    setIsSavingIntegration(true);
    try {
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationConfig),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "保存对接配置失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
      });
      showToast("自动推单对接配置已保存", "success");
    } catch (error) {
      console.error("Failed to save order integration config:", error);
      showToast(error instanceof Error ? error.message : "保存对接配置失败", "error");
    } finally {
      setIsSavingIntegration(false);
    }
  };

  const testIntegrationConfig = async () => {
    setIsTestingIntegration(true);
    try {
      const response = await fetch("/api/orders/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationConfig),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "连通性测试失败");
      }

      showToast(data.ok ? "连通性测试通过" : "连通性测试未完全通过", data.ok ? "success" : "error");
    } catch (error) {
      console.error("Failed to test order integration config:", error);
      showToast(error instanceof Error ? error.message : "连通性测试失败", "error");
    } finally {
      setIsTestingIntegration(false);
    }
  };

  const syncOrders = async () => {
    setIsBulkSyncing(true);
    try {
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
      const backfilledCount = Number(data?.backfilled || 0);
      showToast(
        backfilledCount > 0
          ? `已同步 ${syncedCount} 单，补齐 ${backfilledCount} 单`
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

  const filteredOrders = useMemo(() => {
    if (shop === "all") {
      return orders;
    }
    return orders.filter((item) => String(item.matchedShopName || "").trim() === shop);
  }, [orders, shop]);
  const todayPendingOrders = useMemo(() => filteredOrders.filter((item) => !isTerminalStatus(item.status)), [filteredOrders]);
  const todayCompletedOrders = useMemo(() => filteredOrders.filter((item) => isTerminalStatus(item.status)), [filteredOrders]);
  const visibleOrders = activeTab === "today" ? todayPendingOrders : filteredOrders;
  const hasActiveFilters = Boolean(query.trim() || platform !== "all" || shop !== "all" || status !== "all" || startDate || endDate);
  const hasLiveOrders = todayPendingOrders.length > 0;
  const autoRefreshIntervalMs = activeTab === "today"
    ? (hasLiveOrders ? TODAY_ACTIVE_REFRESH_MS : TODAY_IDLE_REFRESH_MS)
    : 0;

  useEffect(() => {
    const triggerRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < MIN_REFRESH_GAP_MS) {
        return;
      }

      lastRefreshAtRef.current = now;
      void fetchOrders({ silent: true });
    };

    const refreshWhenVisible = () => {
      triggerRefresh();
    };

    let timer: number | null = null;

    const scheduleNext = () => {
      if (!autoRefreshIntervalMs) {
        return;
      }

      timer = window.setTimeout(() => {
        triggerRefresh();
        scheduleNext();
      }, autoRefreshIntervalMs);
    };

    scheduleNext();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [autoRefreshIntervalMs, fetchOrders]);

  return (
    <div className="relative px-2 sm:px-1">
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-700 sm:space-y-8">
        <section className="rounded-[24px] border border-black/8 bg-white/72 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/[0.04] sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">订单管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeTab === "today" ? "聚焦今天待处理订单" : "按时间和状态回看订单"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={syncOrders}
                  disabled={isBulkSyncing || isLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-4 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isBulkSyncing ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                  一键同步
                </button>
                <button
                  type="button"
                  onClick={() => fetchOrders()}
                  disabled={isLoading || isRefreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-4 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  刷新订单
                </button>
                <button
                  type="button"
                  onClick={() => setIsIntegrationOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-4 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
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

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="当前订单"
                value={activeTab === "today" ? todayPendingOrders.length : visibleOrders.length}
                hint={activeTab === "today" ? "今日待处理" : "当前页筛选结果"}
              />
              <MetricCard
                label="用户实付"
                value={toCurrency(summary.actualPaid)}
                hint="当前结果页汇总"
              />
              <MetricCard
                label="配送覆盖"
                value={summary.deliveryCount}
                hint={`商品共 ${summary.itemCount} 件`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/8 bg-zinc-50/45 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">筛选面板</div>
                <p className="mt-1 text-sm text-muted-foreground">沿用系统现有过滤区布局，不再做订单页专属的重型头部筛选。</p>
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
                  <div className="mt-1 text-xs text-muted-foreground">按你现在的工作流，已完成订单默认折叠，避免打断处理中列表。</div>
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
        </main>

        <Pagination
          currentPage={currentPage}
          totalPages={meta.totalPages}
          totalItems={meta.total}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {isMounted && isIntegrationOpen
        ? createPortal(
            <IntegrationModal
              integrationConfig={integrationConfig}
              callbackUrl={callbackUrl}
              isSavingIntegration={isSavingIntegration}
              isTestingIntegration={isTestingIntegration}
              modalRef={modalRef}
              onClose={() => setIsIntegrationOpen(false)}
              onChange={setIntegrationConfig}
              onCopyCallback={() => {
                navigator.clipboard.writeText(callbackUrl);
                showToast("地址已复制", "success");
              }}
              onSave={saveIntegrationConfig}
              onTest={testIntegrationConfig}
            />,
            document.body
          )
        : null}
    </div>
  );
}
