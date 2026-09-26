"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { ArrowUp, Package2, Search, X, ChevronUp, ChevronDown, Loader2, LayoutGrid, List, RefreshCw, Clock3, MapPin, Truck, CheckCheck, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoPickOrder, AutoPickOrderItem, PurchaseOrder, PurchaseStatus } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { isShopNameMatch } from "@/lib/shopIdentity";
import { extractCustomerPhoneTail } from "@/lib/customerPhoneTail";
import {
  AUTO_PICK_EXTRA_STATUS_FILTERS,
  getBaseAutoPickStatusDisplay,
  getAutoPickStatusFilterLabel,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderRiderAssigned,
  isAutoPickPickupOrder,
} from "@/lib/autoPickOrderStatus";
import {
  OrderCard,
  OrderCardErrorBoundary,
  ActionButton,
  AutoCompleteStatusBadge,
  ProductStripItem,
  isCompletedStatus,
  isCancelledStatus,
  isBrushSyncEligibleOrder,
  getOrderActionErrorMessage,
  getExpandedOrderItemDisplays,
  getDeliveryFee,
  getDeadlineDisplay,
  getOrderTypeLabel,
  getPlatformBadgeMeta,
  getProductCostStatusText,
  getAutoOutboundRecoveryTargetItem,
  shouldShowAutoOutboundRecovery,
  toCurrency,
} from "./OrderCard";
import { motion, AnimatePresence } from "framer-motion";

const CompactOrderRouteModal = dynamic(() => import("@/components/Orders/OrderRouteModal").then((module) => module.OrderRouteModal), { ssr: false });
const CompactCustomerHistoryModal = dynamic(() => import("@/components/Orders/CustomerHistoryModal").then((module) => module.CustomerHistoryModal), { ssr: false });

function OrderListSkeleton({ count = 3, cardMode = false }: { count?: number; cardMode?: boolean }) {
  return (
    <div className={cardMode ? "animate-pulse columns-1 gap-4 sm:columns-2 xl:columns-3" : "grid gap-4 animate-pulse"}>
      {Array.from({ length: count }).map((_, index) => (
        <div 
          key={index} 
          className={`space-y-4 rounded-[28px] border border-black/8 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/4 sm:p-6 ${cardMode ? "mb-4 break-inside-avoid" : ""}`}
        >
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-7 w-20 rounded-full bg-black/6 dark:bg-white/8" />
              <div className="h-7 w-24 rounded-full bg-black/6 dark:bg-white/8" />
              <div className="h-6 w-16 rounded-md bg-black/4 dark:bg-white/5" />
            </div>
            <div className="h-6 w-20 rounded-lg bg-black/6 dark:bg-white/8" />
          </div>

          {/* Delivery Bar Skeleton */}
          <div className="h-2 w-full rounded-full bg-black/4 dark:bg-white/5" />

          {/* Items Preview */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-black/6 dark:bg-white/8 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 w-2/3 rounded bg-black/6 dark:bg-white/8" />
                <div className="h-3 w-1/3 rounded bg-black/4 dark:bg-white/5" />
              </div>
              <div className="h-5 w-14 rounded bg-black/6 dark:bg-white/8 shrink-0" />
            </div>
          </div>

          {/* Footer action row */}
          <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/5">
            <div className="h-4 w-32 rounded bg-black/4 dark:bg-white/5" />
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 rounded-xl bg-black/6 dark:bg-white/8" />
              <div className="h-8 w-24 rounded-xl bg-black/8 dark:bg-white/10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatCompactTime(value?: string | null) {
  if (!value) return "-";
  const matched = String(value).match(/(?:T|\s)(\d{2}:\d{2})/);
  return matched?.[1] || String(value).replace("T", " ").slice(-5);
}

function CompactTodayOrderCard({
  order,
  actingId,
  readOnly,
  canExpandDetails,
  onExpand,
  onRunAction,
  onOpenMatchEditor,
}: {
  order: AutoPickOrder;
  actingId: string;
  readOnly: boolean;
  canExpandDetails: boolean;
  onExpand: () => void;
  onRunAction: (action: OrderAction) => void;
  onOpenMatchEditor: (item: AutoPickOrderItem, options?: { autoOutbound?: boolean }) => void;
}) {
  const [routeOpen, setRouteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const compactProductRows = order.items.flatMap((item, itemIndex) => (
    getExpandedOrderItemDisplays(item, order.platform).map((display, displayIndex) => ({
      key: `${item.id || item.productNo || itemIndex}-${display.sourceId || display.sku || displayIndex}`,
      item,
      display,
      displayIndex,
    }))
  ));
  const platformBadge = getPlatformBadgeMeta(order.platform, order.rawPayload);
  const statusLabel = getBaseAutoPickStatusDisplay(order.status) || "待处理";
  const cancelled = isCancelledStatus(order.status) || statusLabel === "已删除";
  const completed = isCompletedStatus(order.status);
  const deleted = statusLabel === "已删除";
  const terminal = cancelled || completed || deleted;
  const pickup = Boolean(order.isPickup) || isAutoPickPickupOrder(order.rawPayload, order.userAddress, order.shopAddress);
  const delivering = isAutoPickOrderDeliveringStatus(order.status);
  const riderAssigned = isAutoPickOrderRiderAssigned(order);
  const displayAsOfflineOrder = order.platform === "线下交易" || String(order.platform || "").toLowerCase() === "other";
  const showPlatformActions = !displayAsOfflineOrder && !readOnly;
  const cannotSelfDeliver = Boolean(actingId) || terminal || delivering || pickup || riderAssigned;
  const showAutoOutboundRecovery = shouldShowAutoOutboundRecovery(order);
  const returned = Boolean(order.outboundReturnDetails?.some((entry) => entry.items?.some((item) => Number(item.quantity || 0) > 0)));
  const syncing = actingId === `${order.id}:sync`;
  const shopName = order.matchedShopName || order.rawShopName || order.shopId || "未匹配店铺";
  const deadlineDisplay = getDeadlineDisplay(order);
  const deliveryFee = getDeliveryFee(order.delivery, order);
  const customerPhoneTail = extractCustomerPhoneTail(order);
  const customerType = order.customerType;
  const orderTypeLabel = getOrderTypeLabel(order);
  const showBrushMarker = !pickup && !displayAsOfflineOrder && Boolean(order.isMainSystemSelfDelivery);
  const hasPureProfit = typeof order.pureProfit === "number" && Number.isFinite(order.pureProfit);
  const canShowPureProfit = Boolean(order.hasOutbound) && hasPureProfit;
  const pureProfitDisplay = hasPureProfit ? toCurrency(Number(order.pureProfit)) : (getProductCostStatusText(order) || "-");

  const statusClassName = cancelled
    ? "border-slate-500/15 bg-slate-500/10 text-slate-600 dark:text-slate-300"
    : completed
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300";

  const handleAutoOutboundRecovery = () => {
    const targetItem = getAutoOutboundRecoveryTargetItem(order);
    if (targetItem) {
      onOpenMatchEditor(targetItem, { autoOutbound: true });
      return;
    }
    onRunAction("outbound");
  };

  return (
    <>
      {routeOpen ? <CompactOrderRouteModal order={order} onClose={() => setRouteOpen(false)} /> : null}
      {historyOpen && customerPhoneTail ? (
        <CompactCustomerHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          phoneTail={customerPhoneTail}
          currentOrderNo={order.orderNo}
        />
      ) : null}
      <article className="group flex min-h-[286px] flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white/82 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-black/12 hover:shadow-lg dark:border-white/10 dark:bg-white/4 dark:hover:border-white/16">
        <div className="flex flex-1 flex-col p-4 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-white dark:border-white/10 dark:bg-white/8">
              <Image src={platformBadge.iconSrc} alt={platformBadge.iconAlt} width={20} height={20} className="h-5 w-5 object-contain" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-foreground">#{order.dailyPlatformSequence || "-"}</span>
                <span title={shopName} className="inline-flex h-6 min-w-0 max-w-32 items-center rounded-full border border-black/8 bg-black/3 px-2 text-[11px] font-semibold text-muted-foreground dark:border-white/10 dark:bg-white/5"><span className="truncate">{shopName}</span></span>
                {orderTypeLabel ? <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-2 text-[11px] font-semibold leading-none text-violet-700 dark:text-violet-300">{orderTypeLabel}</span> : null}
                {showBrushMarker ? <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-2 text-[11px] font-semibold leading-none text-rose-700 dark:text-rose-300">刷单</span> : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span>{formatCompactTime(order.orderTime)} · {order.distanceKm != null ? `${order.distanceKm.toFixed(2)} km` : "距离待同步"}</span>
                {customerType === "new" ? (
                  <span title="门店新客" className="rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[9.5px] leading-none text-orange-600 dark:text-orange-400">新客</span>
                ) : customerType === "returning" ? (
                  <button
                    type="button"
                    onClick={() => customerPhoneTail && setHistoryOpen(true)}
                    disabled={!customerPhoneTail}
                    title={customerPhoneTail ? `查看此老客历史订单（尾号 ${customerPhoneTail}）` : "老客"}
                    className="rounded-full border border-slate-400/20 bg-slate-500/8 px-1.5 py-0.5 text-[9.5px] leading-none text-slate-500 transition hover:bg-slate-500/15 disabled:cursor-default dark:text-slate-300"
                  >老客</button>
                ) : null}
                {pickup && !displayAsOfflineOrder ? <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[9.5px] leading-none text-sky-700 dark:text-sky-300">到店自取</span> : null}
              </div>
            </div>
          </div>
          <div className="flex max-w-[58%] shrink-0 flex-wrap items-center justify-end gap-1.5">
            {returned ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">已退</span> : null}
            {showAutoOutboundRecovery ? (
              readOnly ? (
                <span title={order.autoOutboundError || "自动出库失败"} className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                  <TriangleAlert size={11} />出库
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleAutoOutboundRecovery}
                  disabled={actingId === `${order.id}:outbound`}
                  title={order.autoOutboundError || "自动出库失败，点击处理"}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-700 transition hover:border-rose-500/40 hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-300"
                >
                  {actingId === `${order.id}:outbound` ? <Loader2 size={11} className="animate-spin" /> : <TriangleAlert size={11} />}
                  {actingId === `${order.id}:outbound` ? "处理中" : "出库"}
                </button>
              )
            ) : order.hasOutbound ? (
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tabular-nums ${canShowPureProfit ? (Number(order.pureProfit) >= 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300") : "border-slate-500/15 bg-slate-500/8 text-muted-foreground"}`}>
                利润 {pureProfitDisplay}
              </span>
            ) : null}
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName}`}>{statusLabel}</span>
          </div>
        </div>

        <div className="mt-3.5 space-y-2">
          {compactProductRows.length > 0 ? compactProductRows.map(({ key, item, display, displayIndex }) => (
            <ProductStripItem
              key={key}
              display={display}
              showEditMatch={displayIndex === 0 && !deleted && !readOnly}
              onEditMatch={() => onOpenMatchEditor(item)}
              matchedProduct={item.matchedProduct}
              showMatchStatus={displayIndex === 0}
            />
          )) : (
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-black/6 bg-black/[0.025] p-2.5 dark:border-white/8 dark:bg-white/[0.035]">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[13px] border border-black/6 bg-white text-muted-foreground/35 dark:border-white/8 dark:bg-white/6"><Package2 size={19} /></div>
              <div className="text-[13px] font-semibold text-foreground">纯配送订单</div>
            </div>
          )}
        </div>

        <div className={`mt-3 grid items-center divide-x divide-black/6 rounded-xl border border-black/6 bg-black/[0.018] px-1 py-2.5 text-[11px] dark:divide-white/8 dark:border-white/8 dark:bg-white/[0.025] ${Number(order.refundAmount || 0) > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
          <div className="flex min-w-0 items-center gap-1.5 px-2"><span className="shrink-0 text-muted-foreground">实付</span><span className="truncate font-bold tabular-nums text-foreground">{toCurrency(order.actualPaid)}</span></div>
          <div className="flex min-w-0 items-center justify-center gap-1.5 px-2"><span className="shrink-0 text-muted-foreground">到手</span><span className="truncate font-bold tabular-nums text-foreground">{toCurrency(order.expectedIncome)}</span></div>
          {Number(order.refundAmount || 0) > 0 ? (
            <div className="flex min-w-0 items-center justify-center gap-1.5 px-2"><span className="shrink-0 text-muted-foreground">退款</span><span className="truncate font-bold tabular-nums text-rose-600 dark:text-rose-400">{toCurrency(order.refundAmount)}</span></div>
          ) : null}
          <div className="flex min-w-0 items-center justify-end gap-1.5 px-2"><span className="shrink-0 text-muted-foreground">配送费</span><span className="truncate font-bold tabular-nums text-foreground">{Number.isFinite(deliveryFee) ? toCurrency(deliveryFee) : "-"}</span></div>
        </div>

        <AutoCompleteStatusBadge order={order} pickup={pickup} compact className="mt-2.5 max-w-full self-start" />

        <div className="mt-auto flex min-w-0 items-center gap-3 pt-3 text-[11px] font-medium text-muted-foreground">
          <span className={`flex items-center gap-1.5 ${order.isSubscribe ? "shrink-0" : "min-w-0"}`} title={deadlineDisplay !== "-" ? deadlineDisplay : undefined}>
            <Clock3 size={12} className="shrink-0" />
            <span className={order.isSubscribe ? "whitespace-nowrap" : "truncate"}>
              {deadlineDisplay !== "-" ? `${pickup ? "取货" : order.isSubscribe ? "预约" : "最晚"} ${deadlineDisplay}` : "时效待同步"}
            </span>
          </span>
          <button type="button" onClick={() => setRouteOpen(true)} title="查看配送地图" className="ml-auto flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-primary/6 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><MapPin size={12} className="shrink-0" /><span className="max-w-32 truncate">{order.userAddress || "地址待同步"}</span></button>
        </div>
        </div>

        {!readOnly || canExpandDetails ? (
          <div className="border-t border-black/6 bg-black/[0.012] px-4 py-2.5 dark:border-white/8 dark:bg-white/[0.018]">
            <div className="flex flex-nowrap items-center justify-end gap-1.5">
            {showPlatformActions && !deleted && !order.isSubscribe ? (
              <ActionButton
                label="自配"
                icon={actingId === `${order.id}:self-delivery` ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
                onClick={() => onRunAction("self-delivery")}
                disabled={cannotSelfDeliver}
                title={riderAssigned ? "骑手已接单，不能发起自配" : terminal ? "订单已结束，不能发起自配" : undefined}
              />
            ) : null}
            {showPlatformActions ? (
              <ActionButton
                label={pickup ? "完成取货" : "完成配送"}
                variant="primary"
                icon={actingId === `${order.id}:${pickup ? "pickup-complete" : "complete-delivery"}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                onClick={() => onRunAction(pickup ? "pickup-complete" : "complete-delivery")}
                disabled={Boolean(actingId) || terminal || (!pickup && (!delivering || !order.isMainSystemSelfDelivery))}
                title={terminal ? "订单已结束，不能重复完成" : !pickup && !order.isMainSystemSelfDelivery ? "平台骑手配送不能在主系统完成" : undefined}
              />
            ) : null}
            {!readOnly ? (
              <ActionButton
                label={syncing ? "同步中" : "同步"}
                icon={<RefreshCw size={12} className={syncing ? "animate-spin" : ""} />}
                onClick={() => onRunAction("sync")}
                disabled={syncing || deleted}
                title={deleted ? "订单已删除，不能同步" : "从平台重新同步最新订单状态"}
              />
            ) : null}
            {canExpandDetails ? <button type="button" onClick={onExpand} className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-foreground px-3 text-[11px] font-semibold text-background shadow-xs transition hover:opacity-85">查看详情</button> : null}
            </div>
          </div>
        ) : null}
      </article>
    </>
  );
}

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound" | "sync-brush";
type TodayOrderLayout = "cards" | "list";
type PurchaseDraftPayload = PurchaseOrder & { sourceOrderId?: string };
type ShopProfitInfo = {
  id: string | null;
  name: string;
  amount: number;
  count: number;
  receivedAmount?: number;
  realReceivedAmount?: number;
  brushReceivedAmount?: number;
  brushPaidAmount?: number;
  realOrderCount?: number;
  brushOrderCount?: number;
  deliveryFee: number;
  productCost: number;
  platformCommission: number;
  platformProfit?: Record<string, number>;
  platformCount?: Record<string, number>;
};
const UNMATCHED_SHOP_FILTER = "__unmatched__";

function normalizeDisplayPlatform(platform?: string | null) {
  const raw = String(platform || "").trim();
  const lower = raw.toLowerCase();
  if (lower === "other" || !raw) return "线下交易";
  if (lower === "ebai" || lower === "taobao" || raw.includes("淘宝")) return "淘宝";
  if (lower === "doudian" || lower === "douyin" || raw.includes("抖店") || raw.includes("抖音")) return "抖店";
  return raw;
}

interface TodayOrdersViewProps {
  refreshTrigger: number;
  targetRefreshOrder?: { id: string; timestamp: number } | null;
  onClearProfitUpdating?: (orderId: string) => void;
  onOpenCostBackfill: (order: AutoPickOrder) => void;
  onOpenMatchEditor: (order: AutoPickOrder, item: AutoPickOrderItem, options?: { autoOutbound?: boolean }) => void;
  onOpenPurchaseDraft?: (draft: PurchaseDraftPayload) => void;
  profitUpdatingOrderIds?: string[];
    onDataLoad: (data: {
      summary: { receivedAmount: number; platformCommission: number; validOrderCount: number; itemCount: number; totalDeliveryFee: number; platformReceived?: Record<string, { amount: number; count: number }>; platformDelivery?: Record<string, number>; pureProfit: number; platformProfit?: Record<string, { amount: number; count: number }>; shopProfit?: Record<string, ShopProfitInfo> };
    overview: { totalCount: number; trueOrderCount: number; brushCount: number; cancelledCount: number; platformBreakdown?: { truePlatformCounts: Record<string, number>; brushPlatformCounts: Record<string, number>; cancelledPlatformCounts: Record<string, number> } };
    total: number;
    eligibleBrushSyncOrders: AutoPickOrder[];
    isLoading: boolean;
    promotionDate?: string;
  }) => void;
  localShops: Array<{ id: string; name: string; address: string }>;
  userId?: string | null;
  shopFilterSignal?: { value: string; nonce: number } | null;
  onShopChange?: (shop: string) => void;
  readOnly?: boolean;
  canExpandDetails?: boolean;
  canViewProductCosts?: boolean;
}

const TODAY_TAB_PAGE_SIZE = 40;

type TodayCacheEntry = {
  orders: AutoPickOrder[];
  summary: {
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
    platformReceived?: Record<string, { amount: number; count: number }>;
    platformDelivery?: Record<string, number>;
    pureProfit: number;
    platformProfit?: Record<string, { amount: number; count: number }>;
    shopProfit?: Record<string, ShopProfitInfo>;
  };
  overview: {
    totalCount: number;
    trueOrderCount: number;
    brushCount: number;
    cancelledCount: number;
    platformBreakdown?: {
      truePlatformCounts: Record<string, number>;
      brushPlatformCounts: Record<string, number>;
      cancelledPlatformCounts: Record<string, number>;
    };
  };
  platforms: string[];
  statuses: string[];
  matchedShopOptions: Array<{ value: string; label: string }>;
  timestamp: number;
};

const todayOrdersMemoryCache = new Map<string, TodayCacheEntry>();
const CACHE_STALE_TIME = 5 * 60 * 1000; // 5分钟瞬时缓存有效期

const defaultTodaySummary = {
  receivedAmount: 0,
  platformCommission: 0,
  validOrderCount: 0,
  itemCount: 0,
  totalDeliveryFee: 0,
  platformReceived: {},
  platformDelivery: {},
  pureProfit: 0,
  platformProfit: {},
  shopProfit: {},
};

const defaultTodayOverview = {
  totalCount: 0,
  trueOrderCount: 0,
  brushCount: 0,
  cancelledCount: 0,
  platformBreakdown: {
    truePlatformCounts: {},
    brushPlatformCounts: {},
    cancelledPlatformCounts: {},
  },
};

export function TodayOrdersView({
  refreshTrigger,
  targetRefreshOrder,
  onClearProfitUpdating,
  onOpenCostBackfill,
  onOpenMatchEditor,
  onDataLoad,
  localShops,
  onOpenPurchaseDraft,
  profitUpdatingOrderIds = [],
  userId,
  shopFilterSignal,
  onShopChange,
  readOnly = false,
  canExpandDetails = true,
  canViewProductCosts = true,
}: TodayOrdersViewProps) {
  const { showToast } = useToast();
  const todayDate = useMemo(() => formatLocalDate(new Date()), []);
  const cacheKey = `${userId || "self"}_${todayDate}`;
  const initialCache = todayOrdersMemoryCache.get(cacheKey);
  const hasValidCache = Boolean(initialCache && Date.now() - initialCache.timestamp < CACHE_STALE_TIME);

  const [orders, setOrders] = useState<AutoPickOrder[]>(() => (hasValidCache && initialCache ? initialCache.orders : []));
  const [summary, setSummary] = useState(() => (hasValidCache && initialCache ? initialCache.summary : defaultTodaySummary));
  const [overview, setOverview] = useState(() => (hasValidCache && initialCache ? initialCache.overview : defaultTodayOverview));
  const [platforms, setPlatforms] = useState<string[]>(() => (hasValidCache && initialCache ? initialCache.platforms : []));
  const [statuses, setStatuses] = useState<string[]>(() => (hasValidCache && initialCache ? initialCache.statuses : []));
  const [matchedShopOptions, setMatchedShopOptions] = useState<Array<{ value: string; label: string }>>(() => (hasValidCache && initialCache ? initialCache.matchedShopOptions : []));
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !hasValidCache);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  
  // 筛选状态
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shop, setShop] = useState("all");
  const [status, setStatus] = useState("all");
  const [layoutMode, setLayoutMode] = useState<TodayOrderLayout>("list");
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const savedLayout = window.localStorage.getItem("today-orders-layout");
    if (savedLayout === "cards" || savedLayout === "list") {
      setLayoutMode(savedLayout);
    }
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    onShopChange?.(shop);
  }, [shop, onShopChange]);
  
  const [actingId, setActingId] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [showCompletedToday, setShowCompletedToday] = useState(true);
  const [showCancelledToday, setShowCancelledToday] = useState(false);
  
  const isFetchingRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchSequenceRef = useRef(0);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const realtimePollingTimerRef = useRef<number | null>(null);
  const sseHealthyRef = useRef(false);
  const onDataLoadRef = useRef(onDataLoad);

  useEffect(() => {
    onDataLoadRef.current = onDataLoad;
  }, [onDataLoad]);

  useEffect(() => {
    if (!shopFilterSignal?.value) return;
    setShop(shopFilterSignal.value);
  }, [shopFilterSignal?.nonce, shopFilterSignal?.value]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // 1. 获取订单列表
  const fetchOrders = useCallback(async (options?: { silent?: boolean; force?: boolean; append?: boolean; targetPage?: number }) => {
    if (isFetchingRef.current && !options?.force) return;
    if (options?.force) {
      fetchAbortRef.current?.abort();
    }
    isFetchingRef.current = true;
    const requestSequence = fetchSequenceRef.current + 1;
    fetchSequenceRef.current = requestSequence;
    const abortController = new AbortController();
    fetchAbortRef.current = abortController;
    
    const silent = Boolean(options?.silent);
    const append = Boolean(options?.append);
    const targetPage = options?.targetPage || 1;
    if (append) {
      setIsLoadingMore(true);
    } else if (!silent) {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: String(TODAY_TAB_PAGE_SIZE),
        startDate: todayDate,
        endDate: todayDate,
      });

      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (shop !== "all") params.set("shop", shop);
      if (userId) params.set("userId", userId);
      if (append) {
        params.set("_lite", "1");
      } else {
        params.set("_metrics", "1");
      }

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store", signal: abortController.signal });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "加载今日订单失败");
      }

      if (fetchSequenceRef.current !== requestSequence) return;

      const nextItems = Array.isArray(data.items) ? data.items : [];
      setOrders((current) => {
        if (!append) return nextItems;
        const seen = new Set(current.map((item) => item.id));
        const merged = [...current];
        for (const item of nextItems) {
          if (!seen.has(item.id)) {
            merged.push(item);
          }
        }
        return merged;
      });

      setCurrentPage(targetPage);
      const totalCount = typeof data.total === "number" ? data.total : (data.meta?.total || nextItems.length);
      setHasMore(targetPage * TODAY_TAB_PAGE_SIZE < totalCount);

      const nextPlatforms: string[] = Array.isArray(data.filters?.platforms)
        ? Array.from(new Set(data.filters.platforms.map((p: unknown) => normalizeDisplayPlatform(String(p || "")))))
        : [];
      if (nextPlatforms.length > 0) setPlatforms(nextPlatforms);

      const nextStatuses = Array.isArray(data.filters?.statuses) ? data.filters.statuses : [];
      if (nextStatuses.length > 0) setStatuses(nextStatuses);

      const nextShops = Array.isArray(data.filters?.shops)
        ? data.filters.shops
            .map((item: { value?: unknown; label?: unknown }) => ({
              value: String(item.value || "").trim(),
              label: String(item.label || item.value || "").trim(),
            }))
            .filter((item: { value: string; label: string }) => item.value && item.label)
        : [];
      if (nextShops.length > 0) setMatchedShopOptions(nextShops);

      if (data.summary) setSummary(data.summary);
      if (data.overview) setOverview(data.overview);

      // 在默认无特定过滤且第一页时更新瞬时内存缓存
      if (!append && !debouncedQuery.trim() && platform === "all" && status === "all" && shop === "all") {
        todayOrdersMemoryCache.set(cacheKey, {
          orders: nextItems,
          summary: data.summary || defaultTodaySummary,
          overview: data.overview || defaultTodayOverview,
          platforms: nextPlatforms,
          statuses: nextStatuses,
          matchedShopOptions: nextShops,
          timestamp: Date.now(),
        });
      }

      if (onDataLoadRef.current && !append) {
        onDataLoadRef.current({
          summary: data.summary || defaultTodaySummary,
          overview: data.overview || defaultTodayOverview,
          total: totalCount,
          eligibleBrushSyncOrders: [],
          isLoading: false,
        });
      }

    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      if (fetchSequenceRef.current === requestSequence) {
        isFetchingRef.current = false;
        fetchAbortRef.current = null;
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [platform, debouncedQuery, shop, status, todayDate, showToast, userId, cacheKey]);

  const handleRefreshOrder = useCallback(() => {
    void fetchOrders({ silent: true, force: true });
  }, [fetchOrders]);

  const handleLoadMore = useCallback(() => {
    if (isFetchingRef.current || isLoadingMore || !hasMore) return;
    void fetchOrders({ append: true, targetPage: currentPage + 1 });
  }, [currentPage, fetchOrders, hasMore, isLoadingMore]);

  // 触底无限加载监听
  useEffect(() => {
    const triggerEl = loadMoreTriggerRef.current;
    if (!triggerEl || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(triggerEl);
    return () => observer.disconnect();
  }, [handleLoadMore, hasMore, isLoadingMore]);

  // 组件挂载时先将缓存指标直出给父组件，实现 0ms 骨架屏秒开
  useEffect(() => {
    if (hasValidCache && initialCache && onDataLoadRef.current) {
      onDataLoadRef.current({
        summary: initialCache.summary,
        overview: initialCache.overview,
        total: initialCache.orders.length,
        eligibleBrushSyncOrders: [],
        isLoading: false,
      });
    }
  }, []); // 仅在挂载时直出一次

  const isInitialMountRef = useRef(true);

  // 外部刷新信号监听
  useEffect(() => {
    if (refreshTrigger > 0) {
      void fetchOrders({ force: true });
    }
  }, [refreshTrigger, fetchOrders]);

  // 筛选项变动或首次加载（初次有缓存时 silent 静默对齐）
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      void fetchOrders({ silent: hasValidCache });
      return;
    }
    void fetchOrders({ force: true });
  }, [platform, debouncedQuery, shop, status, fetchOrders]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      setShowScrollTop(scrollTop > 240);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // 2. SSE 与轮询监听逻辑
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      sseHealthyRef.current = false;
      return;
    }

    let source: EventSource;
    try {
      source = new EventSource("/api/orders/events");
    } catch (error) {
      console.warn("EventSource is unavailable, falling back to polling.", error);
      sseHealthyRef.current = false;
      return;
    }

    const queueRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        void fetchOrders({ silent: true });
      }, 250);
    };

    source.addEventListener("order-update", queueRefresh);
    source.addEventListener("ready", () => {
      sseHealthyRef.current = true;
    });
    source.onerror = () => {
      sseHealthyRef.current = false;
    };

    return () => {
      sseHealthyRef.current = false;
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      source.close();
    };
  }, [fetchOrders]);

  useEffect(() => {
    const runSilentRefresh = () => {
      if (document.visibilityState !== "visible" || isFetchingRef.current) return;
      void fetchOrders({ silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") runSilentRefresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    realtimePollingTimerRef.current = window.setInterval(() => {
      runSilentRefresh();
    }, sseHealthyRef.current ? 20000 : 10000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (realtimePollingTimerRef.current) {
        window.clearInterval(realtimePollingTimerRef.current);
        realtimePollingTimerRef.current = null;
      }
    };
  }, [fetchOrders]);

  const patchOrder = useCallback((orderId: string, updater: (order: AutoPickOrder) => AutoPickOrder) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  }, []);

  const ensureOrderDetail = useCallback(async (orderId: string) => {
    const target = orders.find((item) => item.id === orderId);
    if (!target || target.detailLoaded || target.detailLoading) {
      return;
    }

    patchOrder(orderId, (order) => ({ ...order, detailLoading: true }));
    try {
      const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.order) {
        throw new Error(data?.error || "读取订单详情失败");
      }
      patchOrder(orderId, (order) => ({
        ...order,
        ...data.order,
        delivery: data.order.delivery ?? order.delivery,
        detailLoaded: true,
        detailLoading: false,
      }));
    } catch (error) {
      patchOrder(orderId, (order) => ({ ...order, detailLoading: false }));
      showToast(error instanceof Error ? error.message : "读取订单详情失败", "error");
    }
  }, [orders, patchOrder, showToast]);

  const refreshSingleOrder = useCallback(async (orderId: string) => {
    try {
      const params = new URLSearchParams({
        ids: orderId,
        page: "1",
        pageSize: "1",
      });
      if (userId) params.set("userId", userId);
      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const refreshedOrder = Array.isArray(data?.items) ? data.items[0] : null;
      if (response.ok && refreshedOrder) {
        patchOrder(orderId, (order) => ({
          ...order,
          ...refreshedOrder,
          delivery: refreshedOrder.delivery ?? order.delivery,
          detailLoaded: true,
          detailLoading: false,
        }));
      }
    } catch (error) {
      console.error("Failed to refresh single order in TodayOrdersView:", error);
    } finally {
      onClearProfitUpdating?.(orderId);
    }

    // 后台静默刷新 summary 与 overview 指标，不替换 orders 列表 DOM
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "1",
        startDate: todayDate,
        endDate: todayDate,
        _metrics: "1",
      });
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (shop !== "all") params.set("shop", shop);
      if (userId) params.set("userId", userId);

      const metricsRes = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const metricsData = await metricsRes.json().catch(() => ({}));
      if (metricsRes.ok) {
        if (metricsData.summary) setSummary(metricsData.summary);
        if (metricsData.overview) setOverview(metricsData.overview);
        if (onDataLoadRef.current) {
          onDataLoadRef.current({
            summary: metricsData.summary || defaultTodaySummary,
            overview: metricsData.overview || defaultTodayOverview,
            total: typeof metricsData.total === "number" ? metricsData.total : (metricsData.meta?.total || 0),
            eligibleBrushSyncOrders: [],
            isLoading: false,
          });
        }
      }
    } catch {
      // 忽略指标静默更新失败
    }
  }, [debouncedQuery, onClearProfitUpdating, patchOrder, platform, shop, status, todayDate, userId]);

  const lastHandledRefreshRef = useRef<number>(0);
  useEffect(() => {
    if (targetRefreshOrder && targetRefreshOrder.timestamp > lastHandledRefreshRef.current) {
      lastHandledRefreshRef.current = targetRefreshOrder.timestamp;
      void refreshSingleOrder(targetRefreshOrder.id);
    }
  }, [targetRefreshOrder, refreshSingleOrder]);

  // 3. 卡片操作与事件回调
  const toggleExpanded = (orderId: string) => {
    if (!canExpandDetails) return;
    let shouldLoadDetail = false;
    setExpandedIds((current) => {
      if (current.includes(orderId)) {
        return current.filter((id) => id !== orderId);
      }
      shouldLoadDetail = true;
      return [...current, orderId];
    });
    if (shouldLoadDetail) {
      void ensureOrderDetail(orderId);
    }
  };

  const runAction = async (orderId: string, action: OrderAction) => {
    setActingId(`${orderId}:${action}`);
    try {
      let requestInit: RequestInit = { method: "POST" };
      if (action === "sync" || action === "sync-brush") {
        requestInit = {
          ...requestInit,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [orderId] }),
        };
      }
      const response = await fetch(`/api/orders/${orderId}/${action}`, requestInit);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409 && data.reason === "insufficient-stock" && Array.isArray(data.insufficientItems)) {
          if (onOpenPurchaseDraft) {
            const today = new Date();
            const draftShopId = data.insufficientItems[0]?.mappedShopId || "";
            const draftShopName = data.insufficientItems[0]?.mappedShopName || "";
            const matchedShop = draftShopId
              ? localShops.find((shop) => shop.id === draftShopId)
              : draftShopName
                ? localShops.find((shop) => isShopNameMatch(shop.name, draftShopName))
                : undefined;
            const draft = {
              id: `PO-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
              status: "Confirmed" as PurchaseStatus,
              type: "Purchase",
              date: today.toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
              items: data.insufficientItems.map((item: { productId?: string; shopProductId?: string; name?: string; image?: string | null; missingQuantity: number; mappedShopId?: string; mappedShopName?: string }) => ({
                productId: item.productId || null,
                shopProductId: item.shopProductId || null,
                product: {
                  id: item.shopProductId || item.productId,
                  name: item.name || "未命名商品",
                  sku: "",
                  image: item.image || null,
                  costPrice: 0,
                },
                image: item.image || null,
                supplierId: null,
                quantity: item.missingQuantity,
                costPrice: 0,
              })),
              shippingFees: 0,
              extraFees: 0,
              totalAmount: 0,
              discountAmount: 0,
              shippingAddress: matchedShop?.address || "",
              shopName: draftShopName,
              sourceOrderId: orderId,
            };
            onOpenPurchaseDraft(draft);
            showToast("库存不足，已为您生成采购草稿单，请输入成本并确认入库", "warning");
            return;
          }
        }

        if (
          (response.status === 409 && data.reason === "unmatched-item") ||
          String(data.error || data.message || "").includes("店铺商品匹配失败")
        ) {
          const targetOrder = orders.find((o) => o.id === orderId);
          const errorText = String(data.error || data.message || targetOrder?.autoOutboundError || "");
          const itemMatchedByError = (targetOrder?.items || []).find((it) => {
            if (it.productNo && errorText.includes(it.productNo)) return true;
            if (it.platformSkuId && errorText.includes(it.platformSkuId)) return true;
            if (it.productName && errorText.includes(it.productName)) return true;
            return false;
          });

          const unmatchedItem = itemMatchedByError || targetOrder?.items?.find((it) => {
            const rawPayload = it.rawPayload && typeof it.rawPayload === "object" && !Array.isArray(it.rawPayload)
              ? it.rawPayload as Record<string, unknown>
              : {};
            const isIgnored = rawPayload.ignoreOutbound === true
              || rawPayload.isManualIgnored === true
              || (it.matchedProduct as any)?.ignoreOutbound === true;
            if (isIgnored) return false;
            return !it.matchedProduct;
          }) || targetOrder?.items?.[0];

          if (targetOrder && unmatchedItem && onOpenMatchEditor) {
            onOpenMatchEditor(targetOrder, unmatchedItem, { autoOutbound: true });
            return;
          }
        }

        throw new Error(getOrderActionErrorMessage(data.error || data.message || "操作失败"));
      }

      if (action === "sync-brush") {
        showToast("同步刷单成功！已更新标记", "success");
        patchOrder(orderId, (order) => {
          return {
            ...order,
            isMainSystemSelfDelivery: true,
          } as AutoPickOrder;
        });
      } else if (action === "self-delivery") {
        showToast("发起自配成功", "success");
        patchOrder(orderId, (order) => {
          return {
            ...order,
            status: "delivering",
            isMainSystemSelfDelivery: true,
            delivery: {
              ...(data.order?.delivery ?? order.delivery ?? {}),
              sendFee: 0,
              logisticName: "自配送",
              riderName: "自配送",
            },
            deliveryDeadline: data.order?.deliveryDeadline ?? order.deliveryDeadline,
            autoCompleteAt: data.order?.autoCompleteAt || order.autoCompleteAt,
            // 关键：保留原有的 items 及其 matchedProduct 关联信息，彻底防止商品匹配状态闪烁
            items: order.items,
          } as AutoPickOrder;
        });
      } else {
        showToast("操作成功", "success");
        if (data.order) {
          patchOrder(orderId, (order) => {
            const rawShopName = String(data.order.rawShopName || order.rawShopName || "").trim();
            const matchedShopName = String(data.order.matchedShopName || order.matchedShopName || "").trim();
            const isAddressLike = (addr: string | null | undefined) => {
              if (!addr) return false;
              const trimmed = addr.trim();
              if (!trimmed) return false;
              if (rawShopName && (trimmed === rawShopName || rawShopName.includes(trimmed))) return false;
              if (matchedShopName && (trimmed === matchedShopName || matchedShopName.includes(trimmed))) return false;
              return true;
            };

            const safeShopAddress = isAddressLike(data.order.shopAddress)
              ? data.order.shopAddress
              : (isAddressLike(order.shopAddress) ? order.shopAddress : (data.order.shopAddress || order.shopAddress));

            return {
              ...order,
              ...data.order,
              matchedShopName: data.order.matchedShopName || order.matchedShopName,
              matchedShopId: data.order.matchedShopId || order.matchedShopId,
              shopAddress: safeShopAddress,
              items: data.order.items && data.order.items.some((i: any) => i.matchedProduct)
                ? data.order.items
                : order.items,
              delivery: data.order.delivery ?? order.delivery,
            };
          });
        } else {
          void fetchOrders({ silent: true });
        }

        if (action === "sync") {
          await fetchOrders({ silent: true, force: true });
        }
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setActingId("");
    }
  };


  // 4. 数据统计与过滤处理
  const shopOptions = useMemo(() => {
    const options = [...matchedShopOptions];
    if (shop !== "all" && !options.some((item) => item.value === shop)) {
      options.unshift({ value: shop, label: shop });
    }
    return [{ value: "all", label: "全部店铺" }, ...options];
  }, [matchedShopOptions, shop]);

  const platformOptions = useMemo(
    () => [{ value: "all", label: "全部平台" }, ...platforms.map((item) => ({ value: item, label: item }))],
    [platforms]
  );

  const statusOptions = useMemo(() => {
    const baseStatusOptions = Array.from(
      new Map(
        statuses.map((item) => {
          const label = getAutoPickStatusFilterLabel(item);
          return [label, { value: label, label }] as const;
        })
      ).values()
    );
    return [
      { value: "all", label: "全部状态" },
      ...AUTO_PICK_EXTRA_STATUS_FILTERS,
      ...baseStatusOptions,
    ];
  }, [statuses]);

  useEffect(() => {
    if (status === "all") return;
    if (statusOptions.some((option) => option.value === status)) return;
    setStatus("all");
  }, [status, statusOptions]);

  // 筛选和统计都交给后端；前端只对当前页做展示分组。
  const filteredOrders = useMemo(() => {
    return orders;
  }, [orders]);

  const todayCompletedOrders = useMemo(() => {
    return filteredOrders.filter((order) => isCompletedStatus(order.status));
  }, [filteredOrders]);

  const todayCancelledOrders = useMemo(() => {
    return filteredOrders.filter((order) => {
      const displayStatus = getBaseAutoPickStatusDisplay(order.status);
      return isCancelledStatus(order.status) || displayStatus === "已删除";
    });
  }, [filteredOrders]);

  const todayPendingOrders = useMemo(() => {
    return filteredOrders.filter((order) => {
      const displayStatus = getBaseAutoPickStatusDisplay(order.status);
      return !isCompletedStatus(order.status) && !isCancelledStatus(order.status) && displayStatus !== "已删除";
    });
  }, [filteredOrders]);

  const displayedSummary = useMemo(() => {
    return summary;
  }, [summary]);

  const orderOverviewCounts = useMemo(() => {
    return {
      totalCount: overview.totalCount,
      trueOrderCount: overview.trueOrderCount,
      brushCount: overview.brushCount,
      cancelledCount: overview.cancelledCount,
      platformBreakdown: overview.platformBreakdown || { truePlatformCounts: {}, brushPlatformCounts: {}, cancelledPlatformCounts: {} },
    };
  }, [overview]);

  const eligibleBrushSyncOrders = useMemo(() => {
    return filteredOrders.filter(isBrushSyncEligibleOrder);
  }, [filteredOrders]);

  // 数据上报机制

  useEffect(() => {
    onDataLoad({
      summary: displayedSummary,
      overview: orderOverviewCounts,
      total: overview.totalCount,
      eligibleBrushSyncOrders,
      isLoading,
      promotionDate: todayDate,
    });
  }, [displayedSummary, orderOverviewCounts, overview.totalCount, eligibleBrushSyncOrders, isLoading, onDataLoad, todayDate]);

  const hasActiveFilters = Boolean(query.trim() || platform !== "all" || shop !== "all" || status !== "all");

  const resetFilters = () => {
    setQuery("");
    setPlatform("all");
    setShop("all");
    setStatus("all");
  };

  const changeLayoutMode = (nextLayout: TodayOrderLayout) => {
    setLayoutMode(nextLayout);
    setDetailOrderId(null);
    window.localStorage.setItem("today-orders-layout", nextLayout);
  };

  const detailOrder = useMemo(
    () => orders.find((order) => order.id === detailOrderId) || null,
    [detailOrderId, orders]
  );

  useEffect(() => {
    if (!detailOrderId) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOrderId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailOrderId]);

  useEffect(() => {
    if (isMobileViewport) setDetailOrderId(null);
  }, [isMobileViewport]);

  const effectiveLayoutMode: TodayOrderLayout = isMobileViewport ? "list" : layoutMode;

  const renderOrderCollection = (groupOrders: AutoPickOrder[]) => (
    <div className={effectiveLayoutMode === "cards" ? "columns-1 gap-4 sm:columns-2 xl:columns-3" : "grid gap-4"}>
      {groupOrders.map((order) => {
        const expanded = expandedIds.includes(order.id);
        const showCompactCard = effectiveLayoutMode === "cards";
        return (
          <div key={order.id} className={showCompactCard ? "mb-4 min-w-0 break-inside-avoid" : "min-w-0"}>
            <OrderCardErrorBoundary orderNo={order.orderNo || order.id}>
              {showCompactCard ? (
                <CompactTodayOrderCard
                  order={order}
                  actingId={actingId}
                  readOnly={readOnly}
                  canExpandDetails={canExpandDetails}
                  onExpand={() => setDetailOrderId(order.id)}
                  onRunAction={(action) => runAction(order.id, action)}
                  onOpenMatchEditor={(item, options) => onOpenMatchEditor(order, item, options)}
                />
              ) : (
                <OrderCard
                  order={order}
                  expanded={expanded}
                  actingId={actingId}
                  onToggleExpanded={toggleExpanded}
                  onRunAction={runAction}
                  onOpenCostBackfill={onOpenCostBackfill}
                  onOpenMatchEditor={onOpenMatchEditor}
                  onRefresh={handleRefreshOrder}
                  isProfitUpdating={profitUpdatingOrderIds.includes(order.id)}
                  readOnly={readOnly}
                  canExpandDetails={canExpandDetails}
                  canViewProductCosts={canViewProductCosts}
                />
              )}
            </OrderCardErrorBoundary>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 筛选栏 */}
      <section className="rounded-3xl border border-black/8 bg-zinc-50/45 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/4">
        <div className="flex flex-col gap-4">

          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
            {/* 第一组：搜索框 + 全部店铺（移动端同行，桌面端自适应） */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="flex h-11 flex-1 items-center gap-2.5 sm:gap-3 rounded-full border border-black/8 bg-white px-3.5 sm:px-4.5 focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3 min-w-0">
                <Search size={16} className="text-muted-foreground shrink-0" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索订单号、地址、商品名、SKU"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </label>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  title="清空所有筛选条件"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/85 text-foreground hover:bg-white hover:border-black/12 active:scale-95 transition-all dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/5 cursor-pointer"
                >
                  <X size={16} />
                </button>
              ) : null}
              <CustomSelect
                value={shop}
                onChange={setShop}
                options={shopOptions}
                align="center"
                className="h-11 w-28 sm:w-32 lg:w-[136px] shrink-0"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/3 whitespace-nowrap text-center justify-center"
              />
            </div>

            {/* 第二组：全部平台、全部状态（移动端同行2列对称，桌面端单行展开） */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center shrink-0">
              <CustomSelect
                value={platform}
                onChange={setPlatform}
                options={platformOptions}
                align="center"
                matchTriggerWidth
                className="h-11 w-full lg:w-[124px]"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-sm shadow-none dark:border-white/10 dark:bg-white/3 whitespace-nowrap text-center justify-center"
              />
              <CustomSelect
                value={status}
                onChange={setStatus}
                options={statusOptions}
                align="center"
                matchTriggerWidth
                className="h-11 w-full lg:w-[124px]"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-sm shadow-none dark:border-white/10 dark:bg-white/3 whitespace-nowrap text-center justify-center"
              />
            </div>
          </div>

          <div className="hidden items-center justify-between gap-3 border-t border-black/6 pt-3 dark:border-white/8 sm:flex">
            <span className="text-xs font-medium text-muted-foreground">{filteredOrders.length} 张订单</span>
            <div className="inline-flex rounded-full border border-black/8 bg-white p-1 shadow-xs dark:border-white/10 dark:bg-white/4" role="group" aria-label="订单布局">
              <button
                type="button"
                onClick={() => changeLayoutMode("cards")}
                aria-pressed={layoutMode === "cards"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${layoutMode === "cards" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid size={13} />卡片
              </button>
              <button
                type="button"
                onClick={() => changeLayoutMode("list")}
                aria-pressed={layoutMode === "list"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${layoutMode === "list" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List size={13} />列表
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 订单列表 */}
      <main className="space-y-4 pb-8">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="today-orders-skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <OrderListSkeleton count={4} cardMode={effectiveLayoutMode === "cards"} />
            </motion.div>
          ) : todayPendingOrders.length === 0 && todayCompletedOrders.length === 0 && todayCancelledOrders.length === 0 ? (
            <motion.div
              key="today-orders-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-[28px] border border-black/8 bg-white/76 py-8 dark:border-white/10 dark:bg-white/4"
            >
              <EmptyState
                icon={<Package2 size={56} strokeWidth={1.5} className="text-muted-foreground/25" />}
                title="今天还没有订单推送"
                description="可以手动拉取。"
              />
            </motion.div>
          ) : (
            <motion.div
              key="today-orders-content"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {todayPendingOrders.length > 0 && (
                renderOrderCollection(todayPendingOrders)
              )}

              {todayCompletedOrders.length > 0 && (
                <section className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCompletedToday((current) => !current)}
                    className="flex w-full items-center justify-between rounded-[20px] border border-black/8 bg-white/76 px-5 py-4 text-left transition-all hover:bg-black/3 dark:border-white/10 dark:bg-white/5 shadow-xs"
                  >
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">今日已完成</div>
                      <div className="mt-1 text-lg font-bold text-foreground">{todayCompletedOrders.length} 单</div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-black/2 transition-colors hover:bg-black/3 dark:border-white/10 dark:bg-white/3">
                      {showCompletedToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {showCompletedToday && (
                    <div className="animate-in fade-in duration-200">{renderOrderCollection(todayCompletedOrders)}</div>
                  )}
                </section>
              )}

              {todayCancelledOrders.length > 0 && (
                <section className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCancelledToday((current) => !current)}
                    className="flex w-full items-center justify-between rounded-[20px] border border-black/8 bg-white/76 px-5 py-4 text-left transition-all hover:bg-black/3 dark:border-white/10 dark:bg-white/5 shadow-xs"
                  >
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">今日已取消</div>
                      <div className="mt-1 text-lg font-bold text-foreground">{overview.cancelledCount} 单</div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-black/2 transition-colors hover:bg-black/3 dark:border-white/10 dark:bg-white/3">
                      {showCancelledToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {showCancelledToday && (
                    <div className="animate-in fade-in duration-200">{renderOrderCollection(todayCancelledOrders)}</div>
                  )}
                </section>
              )}

              {/* 触底加载更多触发区域与状态指示 */}
              {hasMore && (
                <div
                  ref={loadMoreTriggerRef}
                  className="flex items-center justify-center py-6 text-xs text-muted-foreground"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      <span>正在加载更多今日订单...</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="rounded-full border border-black/8 bg-white/76 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      向下滚动或点击加载更多
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {effectiveLayoutMode === "cards" && detailOrder && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[150000] flex items-center justify-center bg-slate-950/72 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`订单 #${detailOrder.dailyPlatformSequence || detailOrder.orderNo} 详情`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOrderId(null);
          }}
        >
          <div className="flex max-h-[84dvh] w-full max-w-[1040px] flex-col overflow-hidden rounded-[26px] border border-white/12 bg-background shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-black/8 bg-background/96 px-4 py-3 backdrop-blur dark:border-white/10 sm:px-5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">订单详情</div>
                <div className="mt-0.5 truncate text-sm font-bold text-foreground">#{detailOrder.dailyPlatformSequence || "-"} · {detailOrder.matchedShopName || detailOrder.rawShopName || detailOrder.shopId || "未匹配店铺"}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrderId(null)}
                className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-black/3 text-muted-foreground transition hover:bg-black/7 hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                aria-label="关闭订单详情"
              >
                <X size={17} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
              <OrderCardErrorBoundary orderNo={detailOrder.orderNo || detailOrder.id}>
                <OrderCard
                  order={detailOrder}
                  expanded
                  actingId={actingId}
                  onToggleExpanded={() => setDetailOrderId(null)}
                  onRunAction={runAction}
                  onOpenCostBackfill={onOpenCostBackfill}
                  onOpenMatchEditor={onOpenMatchEditor}
                  onRefresh={handleRefreshOrder}
                  isProfitUpdating={profitUpdatingOrderIds.includes(detailOrder.id)}
                  readOnly={readOnly}
                  canExpandDetails={canExpandDetails}
                  canViewProductCosts={canViewProductCosts}
                />
              </OrderCardErrorBoundary>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {showScrollTop ? (
        <button
          type="button"
          onClick={scrollToTop}
          className="group fixed bottom-24 right-4 z-9999 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-foreground shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all hover:scale-110 active:scale-95 dark:border-white/10 dark:bg-white/10 sm:bottom-12 sm:right-12 sm:h-12 sm:w-12"
          aria-label="返回顶部"
          title="返回顶部"
        >
          <ArrowUp size={20} className="transition-transform group-hover:-translate-y-1" />
        </button>
      ) : null}
    </div>
  );
}
