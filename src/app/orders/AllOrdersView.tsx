"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Package2, Search, X, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoPickOrder, AutoPickOrderItem, PurchaseOrder, PurchaseStatus } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { isShopNameMatch } from "@/lib/shopIdentity";
import { AUTO_PICK_EXTRA_STATUS_FILTERS, getBaseAutoPickStatusDisplay, getAutoPickStatusFilterLabel, isAutoPickExtraStatusFilter, matchesAutoPickStatusFilter } from "@/lib/autoPickOrderStatus";
import {
  OrderCard,
  OrderCardErrorBoundary,
  summarizeOrders,
  isCancelledStatus,
  isDeletedStatus,
  isAbnormalStatus,
  isBrushSyncEligibleOrder,
  getOrderActionErrorMessage
} from "./OrderCard";

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound" | "sync-brush";
type PurchaseDraftPayload = PurchaseOrder & { sourceOrderId?: string };

interface AllOrdersViewProps {
  refreshTrigger: number;
  onOpenCostBackfill: (order: AutoPickOrder) => void;
  onOpenMatchEditor: (order: AutoPickOrder, item: AutoPickOrderItem) => void;
  onOpenPurchaseDraft?: (draft: PurchaseDraftPayload) => void;
  onDataLoad: (data: {
    summary: { receivedAmount: number; platformCommission: number; validOrderCount: number; itemCount: number; totalDeliveryFee: number; platformReceived?: Record<string, { amount: number; count: number }>; platformDelivery?: Record<string, number>; pureProfit: number; platformProfit?: Record<string, { amount: number; count: number }> };
    overview: { totalCount: number; trueOrderCount: number; brushCount: number; cancelledCount: number; platformBreakdown?: { truePlatformCounts: Record<string, number>; brushPlatformCounts: Record<string, number>; cancelledPlatformCounts: Record<string, number> } };
    total: number;
    eligibleBrushSyncOrders: AutoPickOrder[];
    isLoading: boolean;
    promotionDate?: string;
  }) => void;
  localShops: Array<{ id: string; name: string; address: string }>;
}

const ALL_ORDERS_BATCH_SIZE = 20;

export function AllOrdersView({
  refreshTrigger,
  onOpenCostBackfill,
  onOpenMatchEditor,
  onDataLoad,
  localShops,
  onOpenPurchaseDraft,
}: AllOrdersViewProps) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    pageSize: ALL_ORDERS_BATCH_SIZE,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<{
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
    platformReceived?: Record<string, { amount: number; count: number }>;
    platformDelivery?: Record<string, number>;
    pureProfit: number;
    platformProfit?: Record<string, { amount: number; count: number }>;
  }>({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
    platformReceived: {},
    platformDelivery: {},
    pureProfit: 0,
    platformProfit: {},
  });
  const [overview, setOverview] = useState<{
    totalCount: number;
    trueOrderCount: number;
    brushCount: number;
    cancelledCount: number;
    platformBreakdown?: {
      truePlatformCounts: Record<string, number>;
      brushPlatformCounts: Record<string, number>;
      cancelledPlatformCounts: Record<string, number>;
    };
  }>({
    totalCount: 0,
    trueOrderCount: 0,
    brushCount: 0,
    cancelledCount: 0,
    platformBreakdown: {
      truePlatformCounts: {},
      brushPlatformCounts: {},
      cancelledPlatformCounts: {},
    },
  });

  const [platforms, setPlatforms] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 筛选状态
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shop, setShop] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [actingId, setActingId] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const isFetchingRef = useRef(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const todayDate = useMemo(() => formatLocalDate(new Date()), []);
  const hasMore = meta.page < meta.totalPages;

  // 获取全部订单列表
  const fetchOrders = useCallback(async (options?: { silent?: boolean; append?: boolean; targetPage?: number }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const silent = Boolean(options?.silent);
    const append = Boolean(options?.append);
    if (append) {
      setIsLoadingMore(true);
    } else if (!silent) {
      setIsLoading(true);
    }

    try {
      const effectivePage = options?.targetPage || 1;
      const params = new URLSearchParams({
        page: String(effectivePage),
        pageSize: String(ALL_ORDERS_BATCH_SIZE),
      });

      if (query.trim()) params.set("query", query.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all" && !isAutoPickExtraStatusFilter(status)) params.set("status", status);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (shop !== "all") params.set("shop", shop);
      if (!silent) {
        params.set("_metrics", "1");
      }
      if (silent) params.set("_lite", "1");

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "加载订单失败");
      }

      const nextItems = Array.isArray(data.items) ? data.items : [];
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

      setMeta(data.meta || { total: 0, page: 1, pageSize: ALL_ORDERS_BATCH_SIZE, totalPages: 1 });
      setCurrentPage(effectivePage);

      if (Array.isArray(data.filters?.platforms)) setPlatforms(data.filters.platforms);
      if (Array.isArray(data.filters?.statuses)) setStatuses(data.filters.statuses);

      if (data.summary) setSummary(data.summary);
      if (data.overview) setOverview(data.overview);

    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [platform, query, startDate, endDate, status, shop, showToast]);

  // 外部刷新信号监听
  useEffect(() => {
    void fetchOrders();
  }, [refreshTrigger, fetchOrders]);

  // 筛选项联动加载 (重置为第一页)
  useEffect(() => {
    setCurrentPage(1);
    void fetchOrders();
  }, [platform, query, startDate, endDate, status, shop, fetchOrders]);

  // 日期范围自适应
  useEffect(() => {
    if (startDate && startDate > todayDate) {
      setStartDate(todayDate);
      return;
    }
    if (endDate && endDate > todayDate) {
      setEndDate(todayDate);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [endDate, startDate, todayDate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!hasMore || isLoading || isLoadingMore) {
      return;
    }
    const target = loadMoreTriggerRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || isFetchingRef.current) {
          return;
        }
        void fetchOrders({ append: true, targetPage: currentPage + 1 });
      },
      {
        root: null,
        rootMargin: "240px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [currentPage, fetchOrders, hasMore, isLoading, isLoadingMore]);

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

  // 卡片操作与事件回调
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
      } else {
        showToast("操作成功", "success");
        if (data.order) {
          patchOrder(orderId, () => data.order);
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



  // 数据统计与过滤处理
  const shopOptions = useMemo(() => {
    const list = localShops.map((item) => ({ value: item.name, label: item.name }));
    return [{ value: "all", label: "全部店铺" }, ...list];
  }, [localShops]);

  const platformOptions = useMemo(
    () => [{ value: "all", label: "全部平台" }, ...platforms.map((item) => ({ value: item, label: item }))],
    [platforms]
  );

  const statusOptions = useMemo(() => {
    const dynamicExtraOptions = AUTO_PICK_EXTRA_STATUS_FILTERS.filter((option) => (
      orders.some((order) => matchesAutoPickStatusFilter(order, option.value))
    ));
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
      ...dynamicExtraOptions,
      ...baseStatusOptions,
    ];
  }, [orders, statuses]);

  useEffect(() => {
    if (status === "all") return;
    if (statusOptions.some((option) => option.value === status)) return;
    setStatus("all");
  }, [status, statusOptions]);

  // 前端过滤（针对店铺筛选项）
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (shop !== "all" && order.matchedShopName !== shop) return false;
      if (!matchesAutoPickStatusFilter(order, status)) return false;
      return true;
    });
  }, [orders, shop, status]);

  const orderOverviewCounts = useMemo(() => {
    if (shop === "all") {
      return {
        totalCount: meta.total,
        trueOrderCount: overview.trueOrderCount,
        brushCount: overview.brushCount,
        cancelledCount: overview.cancelledCount,
        platformBreakdown: overview.platformBreakdown || { truePlatformCounts: {}, brushPlatformCounts: {}, cancelledPlatformCounts: {} },
      };
    }
    const cancelledCount = filteredOrders.filter((item) => isCancelledStatus(item.status) || isDeletedStatus(item.status)).length;
    const validOrders = filteredOrders.filter((item) => !isCancelledStatus(item.status) && !isDeletedStatus(item.status));
    const brushCount = validOrders.filter((item) => item.isMainSystemSelfDelivery && !isAbnormalStatus(item.status)).length;
    const trueOrderCount = Math.max(0, validOrders.length - brushCount);

    const truePlatformCounts: Record<string, number> = {};
    const brushPlatformCounts: Record<string, number> = {};
    const cancelledPlatformCounts: Record<string, number> = {};

    for (const item of filteredOrders) {
      const platform = item.platform || "线下交易";
      const cancelled = isCancelledStatus(item.status) || isDeletedStatus(item.status);
      if (cancelled) {
        cancelledPlatformCounts[platform] = (cancelledPlatformCounts[platform] || 0) + 1;
      } else {
        const isBrush = item.isMainSystemSelfDelivery && !isAbnormalStatus(item.status);
        if (isBrush) {
          brushPlatformCounts[platform] = (brushPlatformCounts[platform] || 0) + 1;
        } else {
          truePlatformCounts[platform] = (truePlatformCounts[platform] || 0) + 1;
        }
      }
    }

    return {
      totalCount: filteredOrders.length,
      trueOrderCount,
      brushCount,
      cancelledCount,
      platformBreakdown: {
        truePlatformCounts,
        brushPlatformCounts,
        cancelledPlatformCounts,
      },
    };
  }, [filteredOrders, overview, shop, meta.total]);

  const displayedSummary = useMemo(() => {
    if (shop === "all") {
      return summary;
    }
    return summarizeOrders(filteredOrders);
  }, [filteredOrders, shop, summary]);

  const eligibleBrushSyncOrders = useMemo(() => {
    return filteredOrders.filter(isBrushSyncEligibleOrder);
  }, [filteredOrders]);

  const remainingOrderCount = Math.max(0, meta.total - filteredOrders.length);

  // 数据同步给父组件
  useEffect(() => {
    onDataLoad({
      summary: displayedSummary,
      overview: orderOverviewCounts,
      total: shop === "all" ? meta.total : filteredOrders.length,
      eligibleBrushSyncOrders,
      isLoading,
      promotionDate: startDate || todayDate,
    });
  }, [displayedSummary, orderOverviewCounts, meta.total, filteredOrders.length, shop, eligibleBrushSyncOrders, isLoading, onDataLoad, startDate, todayDate]);

  const hasActiveFilters = Boolean(query.trim() || platform !== "all" || shop !== "all" || status !== "all" || startDate || endDate);

  const resetFilters = () => {
    setQuery("");
    setPlatform("all");
    setShop("all");
    setStatus("all");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="space-y-6">
      {/* 筛选栏 */}
      <section className="rounded-3xl border border-black/8 bg-zinc-50/45 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/4">
        <div className="flex flex-col gap-4">


          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex items-center gap-2 min-w-0">
              <label className="flex h-11 flex-1 items-center gap-3 rounded-xl border border-black/8 bg-white px-4 focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3 min-w-0">
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/85 text-foreground hover:bg-white hover:border-black/12 active:scale-95 transition-all dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/5 cursor-pointer"
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <CustomSelect
                value={shop}
                onChange={setShop}
                options={shopOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <CustomSelect
                value={platform}
                onChange={setPlatform}
                options={platformOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
            </div>
            <CustomSelect
              value={status}
              onChange={setStatus}
              options={statusOptions}
              className="h-11"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
            />
            <div className="grid grid-cols-2 gap-3 sm:contents">
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="开始日期"
                maxDate={endDate || todayDate}
                className="h-11 w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="结束日期"
                minDate={startDate || undefined}
                maxDate={todayDate}
                className="h-11 w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 订单列表 */}
      <main className="space-y-4 pb-8">
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-[28px] border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/4" />
            ))}
          </div>
        ) : null}

        {!isLoading && filteredOrders.length > 0 ? (
          <div className="grid gap-4">
            {filteredOrders.map((order) => (
              <OrderCardErrorBoundary key={order.id} orderNo={order.orderNo || order.id}>
                <OrderCard
                  order={order}
                  expanded={expandedIds.includes(order.id)}
                  actingId={actingId}
                  onToggleExpanded={toggleExpanded}
                  onRunAction={runAction}
                  onOpenCostBackfill={onOpenCostBackfill}
                  onOpenMatchEditor={onOpenMatchEditor}
                  onRefresh={() => fetchOrders({ silent: true })}
                />
              </OrderCardErrorBoundary>
            ))}
          </div>
        ) : null}

        {!isLoading && filteredOrders.length === 0 ? (
          <div className="rounded-[28px] border border-black/8 bg-white/76 py-8 dark:border-white/10 dark:bg-white/4">
            <EmptyState
              icon={<Package2 size={56} strokeWidth={1.5} className="text-muted-foreground/25" />}
              title="当前没有匹配订单"
              description="可以换个筛选条件试试。"
            />
          </div>
        ) : null}

        {!isLoading && filteredOrders.length > 0 ? (
          <div className="flex justify-center pt-2">
            {meta.page < meta.totalPages ? (
              <div className="flex w-full flex-col items-center gap-2">
                <div ref={loadMoreTriggerRef} className="h-4 w-full" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => void fetchOrders({ append: true, targetPage: currentPage + 1 })}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-5 py-2.5 text-sm font-black text-foreground transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                >
                  {isLoadingMore ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />}
                  {isLoadingMore ? "正在自动加载..." : `继续加载 ${remainingOrderCount} 单`}
                </button>
                <div className="text-xs text-muted-foreground">
                  滑动到底部会自动继续加载，按钮可手动补触发
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">全部订单已加载完成</div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
