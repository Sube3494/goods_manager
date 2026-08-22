"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Package,
  ShoppingBag,
  Search,
  RotateCcw,
  Maximize,
  Minimize,
  Shield,
  Loader2,
  TrendingUp,
  Wallet,
  Receipt,
  Truck,
  Clock,
} from "lucide-react";
import { AutoPickOrder } from "@/lib/types";
import { OrderCard } from "@/app/orders/OrderCard";
import { Pagination } from "@/components/ui/Pagination";
import { formatLocalDate } from "@/lib/dateUtils";
import { useToast } from "@/components/ui/Toast";

interface UserOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  roleName?: string | null;
}

type DateRangeType = "all" | "today" | "7d" | "30d";

interface OrderSummaryMetrics {
  totalCount: number;
  todayCount: number;
  pendingCount: number;
  completedCount: number;
  trueSalesAmount: number;
  pureProfit: number;
  profitRate: number;
  brushCount: number;
  brushCommission: number;
  deliveryFee: number;
  platformBreakdown?: Record<string, { count: number; sales: number }>;
}

export function UserOrdersModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  roleName,
}: UserOrdersModalProps) {
  const { showToast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 展开折叠状态
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeType>("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Summary Metrics 对齐订单大盘
  const [summaryMetrics, setSummaryMetrics] = useState<OrderSummaryMetrics>({
    totalCount: 0,
    todayCount: 0,
    pendingCount: 0,
    completedCount: 0,
    trueSalesAmount: 0,
    pureProfit: 0,
    profitRate: 0,
    brushCount: 0,
    brushCommission: 0,
    deliveryFee: 0,
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const calculateDateBounds = useCallback((range: DateRangeType) => {
    const now = new Date();
    const todayStr = formatLocalDate(now);

    if (range === "today") {
      return { startDate: todayStr, endDate: todayStr };
    }
    if (range === "7d") {
      const past = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { startDate: formatLocalDate(past), endDate: todayStr };
    }
    if (range === "30d") {
      const past = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { startDate: formatLocalDate(past), endDate: todayStr };
    }
    return { startDate: "", endDate: "" };
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!userId || !isOpen) return;

    setIsLoading(true);
    try {
      const { startDate, endDate } = calculateDateBounds(dateRange);
      const params = new URLSearchParams({
        userId,
        page: String(currentPage),
        pageSize: String(pageSize),
        _metrics: "1",
      });

      if (searchQuery.trim()) params.set("query", searchQuery.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error("加载订单失败");
      }

      const data = await res.json();
      const orderList: AutoPickOrder[] = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.orders)
        ? data.orders
        : [];
      setOrders(orderList);
      const reportedTotal = typeof data.total === "number" ? data.total : orderList.length;
      setTotalCount(reportedTotal);

      // 对齐指标计算
      const todayStr = formatLocalDate(new Date());
      let todayCount = 0;
      let pendingCount = 0;
      let completedCount = 0;
      let salesAmount = 0;
      let profit = 0;
      let brushCount = 0;
      let brushCommission = 0;
      let deliveryFee = 0;
      const platformMap: Record<string, { count: number; sales: number }> = {};

      if (data.summary && typeof data.summary === "object") {
        const s = data.summary;
        todayCount = Number(s.todayOrdersCount || s.todayCount || 0);
        pendingCount = Number(s.pendingCount || 0);
        completedCount = Number(s.completedCount || 0);
        salesAmount = Number(s.trueSalesAmount ?? s.actualPaidTotal ?? 0);
        profit = Number(s.pureProfit ?? s.profitTotal ?? 0);
        brushCount = Number(s.brushOrdersCount ?? s.brushTotal ?? 0);
        brushCommission = Number(s.brushCommissionTotal ?? 0);
        deliveryFee = Number(s.totalDeliveryFee ?? 0);
      }

      if (salesAmount === 0 && orderList.length > 0) {
        orderList.forEach((order) => {
          const isToday = formatLocalDate(new Date(order.orderTime)) === todayStr;
          if (isToday) todayCount++;

          const st = String(order.status || "").toLowerCase();
          if (st.includes("完成") || st === "completed" || st === "done") {
            completedCount++;
          } else if (!st.includes("取消") && !st.includes("退款") && !st.includes("关闭")) {
            pendingCount++;
          }

          const curSales = (Number(order.expectedIncome) || Number(order.actualPaid) || 0) / 100;
          salesAmount += curSales;

          const pName = order.platform || "其他";
          if (!platformMap[pName]) platformMap[pName] = { count: 0, sales: 0 };
          platformMap[pName].count += 1;
          platformMap[pName].sales += curSales;
        });
      }

      const rate = salesAmount > 0 ? (profit / salesAmount) * 100 : 0;

      setSummaryMetrics({
        totalCount: reportedTotal,
        todayCount,
        pendingCount,
        completedCount,
        trueSalesAmount: salesAmount,
        pureProfit: profit,
        profitRate: rate,
        brushCount,
        brushCommission,
        deliveryFee,
        platformBreakdown: platformMap,
      });
    } catch (err) {
      console.error("Fetch user orders failed:", err);
      showToast("加载用户订单失败", "error");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    userId,
    isOpen,
    currentPage,
    pageSize,
    dateRange,
    platformFilter,
    statusFilter,
    searchQuery,
    calculateDateBounds,
    showToast,
  ]);

  useEffect(() => {
    if (isOpen && userId) {
      void fetchOrders();
    }
  }, [isOpen, userId, fetchOrders]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setDateRange("all");
    setPlatformFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const handleRunAction = useCallback(async (orderId: string, action: string) => {
    setActingId(orderId);
    try {
      showToast(`正在处理操作: ${action}`, "info");
      await fetchOrders();
    } finally {
      setActingId("");
    }
  }, [fetchOrders, showToast]);

  const totalPages = Math.ceil(totalCount / pageSize);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-85000 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className={`fixed left-1/2 top-1/2 z-85001 -translate-x-1/2 -translate-y-1/2 bg-background border border-border/80 shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen
                ? "w-screen h-dynamic-screen max-w-none max-h-none rounded-none border-none"
                : "w-[calc(100%-20px)] sm:w-[calc(100%-40px)] max-w-5xl max-h-safe-modal rounded-3xl"
            }`}
          >
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-border/60 shrink-0 bg-muted/25">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShoppingBag size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                      {userName || "成员"} 的订单数据
                    </h2>
                    {roleName && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <Shield size={10} />
                        {roleName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      麦芽田已接入
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {userEmail || userId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => void fetchOrders()}
                  disabled={isLoading}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95 disabled:opacity-50"
                  title="刷新数据"
                >
                  <RotateCcw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>
                <button
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95 hidden sm:flex"
                  title={isFullscreen ? "退出全屏" : "全屏查看"}
                >
                  {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </button>
                <button
                  onClick={onClose}
                  className="h-9 w-9 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center active:scale-95"
                  title="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-sky-600 dark:text-sky-400">
                    <span className="text-xs font-semibold">营业额 (成交额)</span>
                    <Wallet size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    <span className="text-sm font-semibold opacity-60">￥</span>
                    {summaryMetrics.trueSalesAmount.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                    <span>有效订单：{summaryMetrics.totalCount} 单</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                    <span className="text-xs font-semibold">预估净利润</span>
                    <TrendingUp size={16} />
                  </div>
                  <div className={`mt-2 text-xl sm:text-2xl font-black ${
                    summaryMetrics.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    <span className="text-sm font-semibold opacity-60">￥</span>
                    {summaryMetrics.pureProfit.toFixed(2)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                    <span>利润率：{summaryMetrics.profitRate.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span className="text-xs font-semibold">今日单量 / 待履约</span>
                    <Clock size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    {summaryMetrics.todayCount}{" "}
                    <span className="text-xs font-normal text-muted-foreground">今日单</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                    <Truck size={12} className="text-amber-600" />
                    <span>进行中/待处理: {summaryMetrics.pendingCount} 单</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-violet-600 dark:text-violet-400">
                    <span className="text-xs font-semibold">配送费与刷单</span>
                    <Receipt size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    <span className="text-sm font-semibold opacity-60">￥</span>
                    {(summaryMetrics.deliveryFee + summaryMetrics.brushCommission).toFixed(2)}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>配送: ￥{summaryMetrics.deliveryFee.toFixed(1)}</span>
                    <span>刷单: {summaryMetrics.brushCount}单</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1 rounded-xl bg-background/80 p-1 border border-border/50 text-xs">
                    {(
                      [
                        { key: "all", label: "全部时间" },
                        { key: "today", label: "今日" },
                        { key: "7d", label: "近 7 天" },
                        { key: "30d", label: "近 30 天" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => {
                          setDateRange(tab.key);
                          setCurrentPage(1);
                        }}
                        className={`rounded-lg px-2.5 sm:px-3 py-1 font-semibold transition-all ${
                          dateRange === tab.key
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={platformFilter}
                      onChange={(e) => {
                        setPlatformFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-8.5 rounded-xl border border-border/60 bg-background px-3 text-xs font-medium text-foreground outline-hidden focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">全部平台</option>
                      <option value="美团">美团闪购</option>
                      <option value="京东">京东秒送/到家</option>
                      <option value="淘宝">淘宝闪购/天猫</option>
                      <option value="饿了么">饿了么</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="h-8.5 rounded-xl border border-border/60 bg-background px-3 text-xs font-medium text-foreground outline-hidden focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">全部状态</option>
                      <option value="待出库">待出库</option>
                      <option value="待配送">待配送</option>
                      <option value="已送达">已送达</option>
                      <option value="已完成">已完成</option>
                      <option value="已取消">已取消</option>
                    </select>

                    {(searchQuery || platformFilter !== "all" || statusFilter !== "all" || dateRange !== "all") && (
                      <button
                        onClick={handleResetFilters}
                        className="h-8.5 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        重置筛选
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="按订单号、收货地址、商品名称或客户备注搜索..."
                    className="w-full h-9.5 pl-9 pr-4 rounded-xl bg-background border border-border/60 text-xs text-foreground outline-hidden focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="py-20 text-center text-muted-foreground space-y-3">
                  <Loader2 className="animate-spin mx-auto text-primary" size={32} />
                  <p className="text-xs">正在加载该成员的订单数据...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-border/60">
                  <Package size={40} className="mx-auto text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">暂无符合条件的订单记录</p>
                  <p className="text-xs text-muted-foreground">该成员已接入麦芽田接单，但当前筛选时间下无订单</p>
                </div>
              ) : (
                <div className="grid gap-3.5">
                  {orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      expanded={expandedIds.includes(order.id)}
                      actingId={actingId}
                      onToggleExpanded={toggleExpanded}
                      onRunAction={handleRunAction}
                      onOpenCostBackfill={() => {}}
                      onOpenMatchEditor={() => {}}
                      onRefresh={fetchOrders}
                    />
                  ))}
                </div>
              )}

              {!isLoading && totalCount > pageSize && (
                <div className="pt-2">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalCount}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
