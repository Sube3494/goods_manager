"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Package2, Search, X, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoPickOrder, AutoPickOrderItem, PurchaseOrder, PurchaseStatus } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { isShopNameMatch } from "@/lib/shopIdentity";
import { AUTO_PICK_EXTRA_STATUS_FILTERS, getBaseAutoPickStatusDisplay, getAutoPickStatusFilterLabel } from "@/lib/autoPickOrderStatus";
import {
  OrderCard,
  OrderCardErrorBoundary,
  isCompletedStatus,
  isCancelledStatus,
  isBrushSyncEligibleOrder,
  getOrderActionErrorMessage
} from "./OrderCard";
import { motion, AnimatePresence } from "framer-motion";

function OrderListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, index) => (
        <div 
          key={index} 
          className="rounded-[28px] border border-black/8 bg-white/70 dark:border-white/10 dark:bg-white/4 p-5 sm:p-6 space-y-4 shadow-sm"
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

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound" | "sync-brush";
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
  const [platform, setPlatform] = useState("all");
  const [shop, setShop] = useState("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    onShopChange?.(shop);
  }, [shop, onShopChange]);
  
  const [actingId, setActingId] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showCompletedToday, setShowCompletedToday] = useState(true);
  const [showCancelledToday, setShowCancelledToday] = useState(false);
  
  const isFetchingRef = useRef(false);
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

  // 1. 获取订单列表
  const fetchOrders = useCallback(async (options?: { silent?: boolean; force?: boolean; append?: boolean; targetPage?: number }) => {
    if (isFetchingRef.current && !options?.force) return;
    isFetchingRef.current = true;
    
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

      if (query.trim()) params.set("query", query.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (shop !== "all") params.set("shop", shop);
      if (userId) params.set("userId", userId);
      if (append) {
        params.set("_lite", "1");
      } else {
        params.set("_metrics", "1");
      }

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "加载今日订单失败");
      }

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
      if (!append && !query.trim() && platform === "all" && status === "all" && shop === "all") {
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
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [platform, query, shop, status, todayDate, showToast, userId, cacheKey]);

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
    void fetchOrders();
  }, [platform, query, shop, status, fetchOrders]);

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

  // 3. 卡片操作与事件回调
  const toggleExpanded = (orderId: string) => {
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
          patchOrder(orderId, (order) => ({
            ...order,
            ...data.order,
            items: data.order.items && data.order.items.some((i: any) => i.matchedProduct)
              ? data.order.items
              : order.items,
            delivery: data.order.delivery ?? order.delivery,
          }));
        } else {
          void fetchOrders({ silent: true });
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
                className="h-11 w-full lg:w-[124px]"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-sm shadow-none dark:border-white/10 dark:bg-white/3 whitespace-nowrap text-center justify-center"
              />
              <CustomSelect
                value={status}
                onChange={setStatus}
                options={statusOptions}
                align="center"
                className="h-11 w-full lg:w-[124px]"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-sm shadow-none dark:border-white/10 dark:bg-white/3 whitespace-nowrap text-center justify-center"
              />
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
              <OrderListSkeleton count={4} />
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
                <div className="grid gap-4">
                  {todayPendingOrders.map((order) => (
                    <OrderCardErrorBoundary key={order.id} orderNo={order.orderNo || order.id}>
                      <OrderCard
                        order={order}
                        expanded={expandedIds.includes(order.id)}
                        actingId={actingId}
                        onToggleExpanded={toggleExpanded}
                        onRunAction={runAction}
                        onOpenCostBackfill={onOpenCostBackfill}
                        onOpenMatchEditor={onOpenMatchEditor}
                        onRefresh={handleRefreshOrder}
                        isProfitUpdating={profitUpdatingOrderIds.includes(order.id)}
                        readOnly={readOnly}
                      />
                    </OrderCardErrorBoundary>
                  ))}
                </div>
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
                    <div className="grid gap-4 animate-in fade-in duration-200">
                      {todayCompletedOrders.map((order) => (
                        <OrderCardErrorBoundary key={order.id} orderNo={order.orderNo || order.id}>
                          <OrderCard
                            order={order}
                            expanded={expandedIds.includes(order.id)}
                            actingId={actingId}
                            onToggleExpanded={toggleExpanded}
                            onRunAction={runAction}
                            onOpenCostBackfill={onOpenCostBackfill}
                            onOpenMatchEditor={onOpenMatchEditor}
                            onRefresh={handleRefreshOrder}
                            isProfitUpdating={profitUpdatingOrderIds.includes(order.id)}
                            readOnly={readOnly}
                          />
                        </OrderCardErrorBoundary>
                      ))}
                    </div>
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
                      <div className="mt-1 text-lg font-bold text-foreground">{todayCancelledOrders.length} 单</div>
                    </div>
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-black/2 transition-colors hover:bg-black/3 dark:border-white/10 dark:bg-white/3">
                      {showCancelledToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {showCancelledToday && (
                    <div className="grid gap-4 animate-in fade-in duration-200">
                      {todayCancelledOrders.map((order) => (
                        <OrderCardErrorBoundary key={order.id} orderNo={order.orderNo || order.id}>
                          <OrderCard
                            order={order}
                            expanded={expandedIds.includes(order.id)}
                            actingId={actingId}
                            onToggleExpanded={toggleExpanded}
                            onRunAction={runAction}
                            onOpenCostBackfill={onOpenCostBackfill}
                            onOpenMatchEditor={onOpenMatchEditor}
                            onRefresh={handleRefreshOrder}
                            isProfitUpdating={profitUpdatingOrderIds.includes(order.id)}
                            readOnly={readOnly}
                          />
                        </OrderCardErrorBoundary>
                      ))}
                    </div>
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
