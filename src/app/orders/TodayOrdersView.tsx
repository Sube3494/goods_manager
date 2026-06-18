"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Package2, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoPickOrder, AutoPickOrderItem } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { getBaseAutoPickStatusDisplay } from "@/lib/autoPickOrderStatus";
import {
  OrderCard,
  OrderCardErrorBoundary,
  isCompletedStatus,
  summarizeOrders,
  isCancelledStatus,
  isDeletedStatus,
  isAbnormalStatus,
  isBrushSyncEligibleOrder,
  getOrderActionErrorMessage
} from "./OrderCard";

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound" | "sync-brush";

interface TodayOrdersViewProps {
  refreshTrigger: number;
  onOpenCostBackfill: (order: AutoPickOrder) => void;
  onOpenMatchEditor: (order: AutoPickOrder, item: AutoPickOrderItem) => void;
  onOpenPurchaseDraft?: (draft: any) => void;
  onDataLoad: (data: {
    summary: { receivedAmount: number; platformCommission: number; validOrderCount: number; itemCount: number; totalDeliveryFee: number };
    overview: { totalCount: number; trueOrderCount: number; brushCount: number; cancelledCount: number };
    total: number;
    eligibleBrushSyncOrders: AutoPickOrder[];
    isLoading: boolean;
    promotionDate?: string;
  }) => void;
  localShops: Array<{ id: string; name: string; address: string }>;
}

const TODAY_TAB_PAGE_SIZE = 9999;

export function TodayOrdersView({
  refreshTrigger,
  onOpenCostBackfill,
  onOpenMatchEditor,
  onDataLoad,
  localShops,
  onOpenPurchaseDraft,
}: TodayOrdersViewProps) {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // 筛选状态
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shop, setShop] = useState("all");
  const [status, setStatus] = useState("all");
  
  const [actingId, setActingId] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showCompletedToday, setShowCompletedToday] = useState(false);
  const [showCancelledToday, setShowCancelledToday] = useState(false);
  
  const isFetchingRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const realtimePollingTimerRef = useRef<number | null>(null);
  const sseHealthyRef = useRef(false);

  const todayDate = useMemo(() => formatLocalDate(new Date()), []);

  // 1. 获取订单列表
  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    const silent = Boolean(options?.silent);
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: String(TODAY_TAB_PAGE_SIZE),
        startDate: todayDate,
        endDate: todayDate,
      });

      if (query.trim()) params.set("query", query.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (shop !== "all") params.set("shop", shop);
      if (silent) params.set("_lite", "1");

      const response = await fetch(`/api/orders?${params.toString()}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "加载今日订单失败");
      }

      const nextItems = Array.isArray(data.items) ? data.items : [];
      setOrders(nextItems);

      if (Array.isArray(data.filters?.platforms)) setPlatforms(data.filters.platforms);
      if (Array.isArray(data.filters?.statuses)) setStatuses(data.filters.statuses);

    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  }, [platform, query, shop, status, todayDate, showToast]);

  // 外部刷新信号监听
  useEffect(() => {
    void fetchOrders();
  }, [refreshTrigger, fetchOrders]);

  // 选项联动加载
  useEffect(() => {
    void fetchOrders();
  }, [platform, query, shop, status, fetchOrders]);

  // 2. SSE 与轮询监听逻辑
  useEffect(() => {
    const source = new EventSource("/api/orders/events");

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

  // 3. 卡片操作与事件回调
  const toggleExpanded = (orderId: string) => {
    setExpandedIds((current) => (
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    ));
  };

  const patchOrder = useCallback((orderId: string, updater: (order: AutoPickOrder) => AutoPickOrder) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  }, []);

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
            const draft = {
              id: `PO-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
              status: "Confirmed",
              type: "Purchase",
              date: today.toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
              items: data.insufficientItems.map((item: any) => ({
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
              shippingAddress: "",
              shopName: data.insufficientItems[0]?.mappedShopName || "",
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
          const raw = (order as unknown as { rawPayload?: Record<string, unknown> }).rawPayload || {};
          const systemMeta = (raw.systemMeta as Record<string, unknown>) || {};
          return {
            ...order,
            rawPayload: {
              ...raw,
              systemMeta: {
                ...systemMeta,
                mainSystemSelfDelivery: { triggered: true },
              },
            },
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

  const clearManualMatch = async (order: AutoPickOrder, item: AutoPickOrderItem) => {
    try {
      const response = await fetch(`/api/orders/${order.id}/items/${item.id}/match`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "清除手动匹配失败");
      }
      showToast("已清除手动匹配，已切换回条码匹配", "success");
      void fetchOrders({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    }
  };

  // 4. 数据统计与过滤处理
  const shopOptions = useMemo(() => {
    const list = localShops.map((item) => ({ value: item.name, label: item.name }));
    return [{ value: "all", label: "全部店铺" }, ...list];
  }, [localShops]);

  const platformOptions = useMemo(
    () => [{ value: "all", label: "全部平台" }, ...platforms.map((item) => ({ value: item, label: item }))],
    [platforms]
  );

  const statusOptions = useMemo(() => {
    return [{ value: "all", label: "全部状态" }, ...statuses.map((item) => ({ value: item, label: item }))];
  }, [statuses]);

  // 根据店铺和查询框对列表进行前端内存级过滤
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (shop !== "all" && order.matchedShopName !== shop) return false;
      return true;
    });
  }, [orders, shop]);

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
    return summarizeOrders(filteredOrders);
  }, [filteredOrders]);

  const orderOverviewCounts = useMemo(() => {
    const cancelledCount = filteredOrders.filter((item) => isCancelledStatus(item.status) || isDeletedStatus(item.status)).length;
    const validOrders = filteredOrders.filter((item) => !isCancelledStatus(item.status) && !isDeletedStatus(item.status));
    const brushCount = validOrders.filter((item) => item.isMainSystemSelfDelivery && !isAbnormalStatus(item.status)).length;
    const trueOrderCount = Math.max(0, validOrders.length - brushCount);
    return {
      totalCount: filteredOrders.length,
      trueOrderCount,
      brushCount,
      cancelledCount,
    };
  }, [filteredOrders]);

  const eligibleBrushSyncOrders = useMemo(() => {
    return filteredOrders.filter(isBrushSyncEligibleOrder);
  }, [filteredOrders]);

  // 数据上报机制
  useEffect(() => {
    onDataLoad({
      summary: displayedSummary,
      overview: orderOverviewCounts,
      total: filteredOrders.length,
      eligibleBrushSyncOrders,
      isLoading,
      promotionDate: todayDate,
    });
  }, [displayedSummary, orderOverviewCounts, filteredOrders.length, eligibleBrushSyncOrders, isLoading, onDataLoad, todayDate]);

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
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">筛选</div>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/85 px-4 py-2 text-xs font-black text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5"
              >
                <X size={13} />
                清空筛选
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <label className="flex h-11 items-center gap-3 rounded-xl border border-black/8 bg-white px-4 focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3">
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
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
            />
            <CustomSelect
              value={platform}
              onChange={setPlatform}
              options={platformOptions}
              className="h-11"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
            />
            <CustomSelect
              value={status}
              onChange={setStatus}
              options={statusOptions}
              className="h-11"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
            />
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

        {!isLoading && todayPendingOrders.length > 0 ? (
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
                  onClearManualMatch={clearManualMatch}
                  onRefresh={() => fetchOrders({ silent: true })}
                />
              </OrderCardErrorBoundary>
            ))}
          </div>
        ) : null}

        {!isLoading && todayCompletedOrders.length > 0 ? (
          <section className="rounded-[28px] border border-black/8 bg-white/76 p-3 shadow-xs dark:border-white/10 dark:bg-white/4">
            <button
              type="button"
              onClick={() => setShowCompletedToday((current) => !current)}
              className="flex w-full items-center justify-between rounded-[22px] border border-black/8 bg-black/2 px-4 py-4 text-left transition-all hover:bg-black/3 dark:border-white/10 dark:bg-white/3"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">今日已完成</div>
                <div className="mt-1 text-lg font-black text-foreground">{todayCompletedOrders.length} 单</div>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/85 dark:border-white/10 dark:bg-white/4">
                {showCompletedToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {showCompletedToday ? (
              <div className="mt-4 grid gap-4">
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
                      onClearManualMatch={clearManualMatch}
                      onRefresh={() => fetchOrders({ silent: true })}
                    />
                  </OrderCardErrorBoundary>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isLoading && todayCancelledOrders.length > 0 ? (
          <section className="rounded-[28px] border border-black/8 bg-white/76 p-3 shadow-xs dark:border-white/10 dark:bg-white/4">
            <button
              type="button"
              onClick={() => setShowCancelledToday((current) => !current)}
              className="flex w-full items-center justify-between rounded-[22px] border border-black/8 bg-black/2 px-4 py-4 text-left transition-all hover:bg-black/3 dark:border-white/10 dark:bg-white/3"
            >
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">今日已取消</div>
                <div className="mt-1 text-lg font-black text-foreground">{todayCancelledOrders.length} 单</div>
              </div>
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/8 bg-white/85 dark:border-white/10 dark:bg-white/4">
                {showCancelledToday ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {showCancelledToday ? (
              <div className="mt-4 grid gap-4">
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
                      onClearManualMatch={clearManualMatch}
                      onRefresh={() => fetchOrders({ silent: true })}
                    />
                  </OrderCardErrorBoundary>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isLoading && todayPendingOrders.length === 0 && todayCompletedOrders.length === 0 && todayCancelledOrders.length === 0 ? (
          <div className="rounded-[28px] border border-black/8 bg-white/76 py-8 dark:border-white/10 dark:bg-white/4">
            <EmptyState
              icon={<Package2 size={56} strokeWidth={1.5} className="text-muted-foreground/25" />}
              title="今天还没有订单推送"
              description="可以手动拉取。"
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
