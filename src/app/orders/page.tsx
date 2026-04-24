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
import { AutoPickIntegrationConfig, AutoPickOrder, AutoPickOrderItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

type OrderAction = "self-delivery" | "complete-delivery" | "sync";
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

function getDisplayStatus(status?: string | null) {
  const text = String(status || "").trim();
  if (!text) return "同步中";
  if (text.includes("已完成")) return "已完成";
  if (text.includes("配送中")) return "配送中";
  if (text.includes("已拣货") || text.includes("拣货中")) return "已拣货";
  return text.split(/[,，]/)[0].trim() || "同步中";
}

function isCompletedStatus(status?: string | null) {
  return getDisplayStatus(status) === "已完成";
}

function getStatusTone(status?: string | null) {
  const display = getDisplayStatus(status);

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
    sku: matchedProduct?.sku || item.productNo || "-",
    image: matchedProduct?.image || item.thumb || null,
    quantity: item.quantity,
    sourceLabel: matchedProduct
      ? matchedProduct.sourceType === "shopProduct"
        ? matchedProduct.shopName || "门店商品"
        : "商品库"
      : "推单商品",
  };
}

function getItemCount(items: AutoPickOrderItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
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
    <div className="rounded-[22px] border border-black/8 bg-white/80 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/[0.05]">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const tone = getStatusTone(status);
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black", tone.badge)}>
      <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
      {getDisplayStatus(status)}
    </span>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="max-w-[65%] text-right text-sm font-bold text-foreground">{value}</span>
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
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "primary";
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black transition-all disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary"
          ? "bg-foreground text-background hover:opacity-90 dark:bg-white dark:text-black"
          : "border border-black/8 bg-white/85 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
      )}
    >
      {icon}
      {label}
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
  const tone = getStatusTone(order.status);
  const itemCount = getItemCount(order.items);
  const firstItem = order.items[0] ? getOrderItemDisplay(order.items[0]) : null;
  const completed = isCompletedStatus(order.status);
  const extraItemCount = Math.max(0, order.items.length - 1);
  const platformMeta = getPlatformBadgeMeta(order.platform);
  const commissionDisplay = getCommissionDisplay(order.platformCommission);

  return (
    <article className="overflow-hidden rounded-[30px] border border-black/8 bg-white/78 shadow-xs transition-all hover:border-black/12 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="border-b border-black/6 px-4 py-4 dark:border-white/6 sm:px-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-9 items-center gap-2 rounded-full border border-black/8 bg-black/[0.03] pl-2.5 pr-3 text-foreground dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden">
                      <Image
                        src={platformMeta.iconSrc}
                        alt={platformMeta.iconAlt}
                        width={24}
                        height={24}
                        className="h-6 w-6 object-cover"
                        unoptimized
                      />
                    </span>
                    <span className="pr-0.5 text-base font-black leading-none tracking-tight">#{order.dailyPlatformSequence || 0}</span>
                  </span>
                  {firstItem?.sourceLabel ? (
                    <span className="inline-flex h-9 items-center rounded-full border border-black/8 bg-black/[0.03] px-3 text-sm font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      {firstItem.sourceLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex h-9 items-center gap-2 rounded-full border border-black/8 bg-black/[0.02] px-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">实付</span>
                    <span className="text-sm font-black text-foreground">{toCurrency(order.actualPaid)}</span>
                  </div>
                  <div className="inline-flex h-9 items-center gap-2 rounded-full border border-black/8 bg-black/[0.02] px-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{commissionDisplay.label}</span>
                    <span className="text-sm font-black text-foreground">{commissionDisplay.value}</span>
                  </div>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={13} />
                    {formatLocalDateTime(order.orderTime)}
                  </span>
                  <span>{order.distanceKm != null ? `${order.distanceKm.toFixed(2)} km` : "距离待同步"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-black/6 bg-black/[0.02] p-4 dark:border-white/8 dark:bg-white/[0.03]">
            <div className="flex items-start gap-4">
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[20px] bg-white shadow-xs dark:bg-white/[0.06]">
                {firstItem?.image ? (
                  <Image
                    src={firstItem.image}
                    alt={firstItem.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                    <Package2 size={24} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商品概览</div>
                <div className="mt-1 line-clamp-2 text-base font-black leading-snug text-foreground">
                  {firstItem?.name || "暂无商品信息"}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-medium text-muted-foreground">
                  <span>{firstItem?.sku || "-"}</span>
                  <span>{firstItem ? `x${firstItem.quantity}` : "x0"}</span>
                  <span>共 {itemCount} 件商品</span>
                  {extraItemCount > 0 ? (
                    <span className="rounded-full border border-dashed border-black/10 bg-black/[0.02] px-2.5 py-1 text-[10px] font-bold text-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      另有 +{extraItemCount} 件
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-black/6 pt-4 dark:border-white/6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {completed ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-400">
                <CheckCheck size={12} />
                订单已完成
              </span>
            ) : null}
            {!completed && order.autoCompleteAt ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/15 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-700 dark:text-amber-400">
                <TimerReset size={12} />
                预计自动完成 {formatLocalDateTime(order.autoCompleteAt)}
              </span>
            ) : null}
            {order.lastSyncedAt ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-3 py-1.5 text-xs font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                <RefreshCw size={12} />
                最近同步 {formatLocalDateTime(order.lastSyncedAt)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ActionButton
              label={expanded ? "收起详情" : "展开详情"}
              icon={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => onToggleExpanded(order.id)}
            />
            <ActionButton
              label="同步"
              title={completed ? "订单已完成，不需要再次同步" : undefined}
              icon={actingId === `${order.id}:sync` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              onClick={() => onRunAction(order.id, "sync")}
              disabled={Boolean(actingId) || completed}
            />
            <ActionButton
              label="自配"
              icon={actingId === `${order.id}:self-delivery` ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
              onClick={() => onRunAction(order.id, "self-delivery")}
              disabled={Boolean(actingId) || completed}
              title={completed ? "订单已完成，不能再次发起自配" : undefined}
            />
            <ActionButton
              label="完成配送"
              variant="primary"
              icon={actingId === `${order.id}:complete-delivery` ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
              onClick={() => onRunAction(order.id, "complete-delivery")}
              disabled={Boolean(actingId) || completed}
              title={completed ? "订单已完成，不能重复完成配送" : undefined}
            />
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-black/6 bg-zinc-50/60 px-4 py-5 dark:border-white/6 dark:bg-white/[0.025] sm:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <section className="rounded-[24px] border border-black/6 bg-white/80 p-4 dark:border-white/8 dark:bg-white/[0.04]">
              <div className="mb-4 flex items-center gap-2">
                <Package2 size={15} className="text-muted-foreground" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商品明细</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {order.items.map((item, index) => {
                  const display = getOrderItemDisplay(item);
                  return (
                    <div
                      key={`${display.sku}-${index}`}
                      className="flex items-center gap-3 rounded-[20px] border border-black/6 bg-black/[0.02] p-3 dark:border-white/8 dark:bg-white/[0.03]"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-white/[0.06]">
                        {display.image ? (
                          <Image
                            src={display.image}
                            alt={display.name}
                            width={56}
                            height={56}
                            className="h-full w-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                            <Package2 size={18} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-black text-foreground">{display.name}</div>
                        <div className="mt-1 text-xs font-medium text-muted-foreground">{display.sku}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-bold text-foreground dark:bg-white/[0.07]">{display.sourceLabel}</span>
                          <span className="rounded-full bg-primary/8 px-2.5 py-1 text-[10px] font-bold text-primary">x{display.quantity}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-[24px] border border-black/6 bg-white/80 p-4 dark:border-white/8 dark:bg-white/[0.04]">
                <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">物流信息</h3>
                <div className="space-y-3">
                  <InfoPair label="物流平台" value={order.delivery?.logisticName || "第三方平台"} />
                  <InfoPair label="轨迹" value={order.delivery?.track || "暂无轨迹"} />
                  <InfoPair label="取餐时间" value={order.delivery?.pickupTime || "-"} />
                  <InfoPair label="配送费" value={order.delivery?.sendFee != null ? toCurrency(order.delivery.sendFee) : "-"} />
                </div>
              </section>

              <section className="rounded-[24px] border border-black/6 bg-white/80 p-4 dark:border-white/8 dark:bg-white/[0.04]">
                <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">系统信息</h3>
                <div className="space-y-3">
                  <InfoPair label="订单编号" value={order.orderNo} />
                  <InfoPair label="原始 ID" value={order.sourceId} />
                  <InfoPair label="配送地址" value={order.userAddress} />
                  <InfoPair label="坐标" value={order.longitude && order.latitude ? `${order.longitude}, ${order.latitude}` : "-"} />
                  <InfoPair label="距离类型" value={order.distanceIsLinear ? "直线距离" : "路面距离"} />
                  <InfoPair label="送达时限" value={order.deliveryDeadline || "-"} />
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
  const [status, setStatus] = useState("all");
  const [hasDelivery, setHasDelivery] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
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

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
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
      if (hasDelivery !== "all") params.set("hasDelivery", String(hasDelivery === "true"));
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
      setIsLoading(false);
    }
  }, [activeTab, currentPage, endDate, hasDelivery, pageSize, platform, query, showToast, startDate, status, todayDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchIntegrationConfig();
  }, [fetchIntegrationConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, endDate, hasDelivery, platform, query, startDate, status]);

  const tickAutoComplete = useCallback(async () => {
    try {
      await fetch("/api/orders/tick-auto-complete", { method: "POST" });
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      tickAutoComplete().then(() => fetchOrders());
    }, 60 * 1000);

    return () => clearInterval(timer);
  }, [fetchOrders, tickAutoComplete]);

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

  const deliveryOptions = [
    { value: "all", label: "全部配送" },
    { value: "true", label: "已有配送" },
    { value: "false", label: "缺少配送" },
  ];

  const resetFilters = () => {
    setQuery("");
    setPlatform("all");
    setStatus("all");
    setHasDelivery("all");
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
        throw new Error(data?.error || data?.reason || "操作失败");
      }

      showToast(
        action === "self-delivery"
          ? "已发起自配送"
          : action === "complete-delivery"
            ? "已发送完成配送指令"
            : "已同步最新订单状态",
        "success"
      );
      fetchOrders();
    } catch (error) {
      console.error("Order action failed:", error);
      showToast(error instanceof Error ? error.message : "操作失败", "error");
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

  const todayPendingOrders = useMemo(() => orders.filter((item) => !isCompletedStatus(item.status)), [orders]);
  const todayCompletedOrders = useMemo(() => orders.filter((item) => isCompletedStatus(item.status)), [orders]);
  const visibleOrders = activeTab === "today" ? todayPendingOrders : orders;
  const hasActiveFilters = Boolean(query.trim() || platform !== "all" || status !== "all" || hasDelivery !== "all" || startDate || endDate);

  return (
    <div className="relative px-2 sm:px-1">
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-700 sm:space-y-8">
        <section className="overflow-hidden rounded-[28px] border border-black/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(244,244,245,0.82)_48%,rgba(236,253,245,0.72)_100%)] px-4 py-4 shadow-xs dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),rgba(255,255,255,0.04)_45%,rgba(16,185,129,0.05)_100%)] sm:px-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center rounded-full border border-black/8 bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]">
                Order Center
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">订单管理</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                这版不再沿用原来那套独立工作台外观，直接回到系统现有页面的版式语言，把筛选、状态、商品和配送动作收进同一层次里。
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("today")}
                  className={cn(
                    "rounded-full px-4 py-2.5 text-sm font-black transition-all",
                    activeTab === "today"
                      ? "bg-foreground text-background shadow-lg dark:bg-white dark:text-black"
                      : "border border-black/8 bg-white/80 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                  )}
                >
                  今日推单
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={cn(
                    "rounded-full px-4 py-2.5 text-sm font-black transition-all",
                    activeTab === "all"
                      ? "bg-foreground text-background shadow-lg dark:bg-white dark:text-black"
                      : "border border-black/8 bg-white/80 text-foreground hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                  )}
                >
                  全部订单
                </button>
                <button
                  type="button"
                  onClick={() => setIsIntegrationOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-4 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  <Settings2 size={15} />
                  对接配置
                </button>
                <button
                  type="button"
                  onClick={fetchOrders}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/80 px-4 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                >
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  刷新订单
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:w-[520px] xl:grid-cols-2">
              <MetricCard
                label="当前模式"
                value={activeTab === "today" ? "今日推单" : "全部订单"}
                hint={activeTab === "today" ? `固定日期 ${todayDate}` : "支持历史时间筛选"}
              />
              <MetricCard
                label="当前订单"
                value={activeTab === "today" ? todayPendingOrders.length : meta.total}
                hint={activeTab === "today" ? "仅显示今日待处理" : "当前筛选结果总数"}
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

            <div className={cn("grid gap-3", activeTab === "today" ? "lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_220px]" : "lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1fr)]")}>
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
              <CustomSelect
                value={hasDelivery}
                onChange={setHasDelivery}
                options={deliveryOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />

              {activeTab === "today" ? (
                <div className="flex h-11 items-center rounded-xl border border-black/8 bg-white px-4 text-xs font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                  今日视图固定为 {todayDate}
                </div>
              ) : (
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

          {!isLoading && orders.length === 0 ? (
            <div className="rounded-[28px] border border-black/8 bg-white/76 py-8 dark:border-white/10 dark:bg-white/[0.04]">
              <EmptyState
                icon={<Package2 size={56} strokeWidth={1.5} className="text-muted-foreground/25" />}
                title="当前还没有订单"
                description="检查 auto-pick 插件连接和回调地址；来单后这里会按系统页面风格自动汇总展示。"
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
