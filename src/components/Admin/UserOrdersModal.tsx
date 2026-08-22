"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Package,
  ShoppingBag,
  ExternalLink,
  Search,
  Calendar,
  Layers,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  RotateCcw,
  Maximize,
  Minimize,
  Store,
  MapPin,
  CircleDollarSign,
  ReceiptText,
  User as UserIcon,
  Shield,
  Loader2,
} from "lucide-react";
import { AutoPickOrder } from "@/lib/types";
import { Pagination } from "@/components/ui/Pagination";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

interface UserOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  roleName?: string | null;
}

type DateRangeType = "today" | "7d" | "30d" | "all";

export function UserOrdersModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  roleName,
}: UserOrdersModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeType>("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Summary Metrics
  const [summaryStats, setSummaryStats] = useState({
    totalCount: 0,
    todayCount: 0,
    pendingCount: 0,
    completedCount: 0,
    totalRevenue: 0,
  });

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

      if (searchQuery.trim()) {
        params.set("query", searchQuery.trim());
      }
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) {
        throw new Error("加载订单失败");
      }

      const data = await res.json();
      const orderList = Array.isArray(data.items) ? data.items : (Array.isArray(data.orders) ? data.orders : []);
      setOrders(orderList);
      const reportedTotal = typeof data.total === "number" ? data.total : orderList.length;
      setTotalCount(reportedTotal);

      // 计算指标
      const todayStr = formatLocalDate(new Date());
      let todayOrders = 0;
      let pendingOrders = 0;
      let completedOrders = 0;
      let revenue = 0;

      if (data.summary && typeof data.summary === "object") {
        todayOrders = Number(data.summary.todayOrdersCount || 0);
        pendingOrders = Number(data.summary.pendingCount || 0);
        completedOrders = Number(data.summary.completedCount || 0);
        revenue = Number(data.summary.trueSalesAmount || data.summary.revenue || 0);
      }

      // 如果 summary 没有给全，从列表补充统计
      if (todayOrders === 0 && pendingOrders === 0 && revenue === 0 && orderList.length > 0) {
        orderList.forEach((order: AutoPickOrder) => {
          const orderDateStr = formatLocalDate(order.orderTime);
          if (orderDateStr === todayStr) {
            todayOrders++;
          }
          const st = String(order.status || "").toLowerCase();
          if (st.includes("完成") || st === "completed" || st === "done") {
            completedOrders++;
          } else if (!st.includes("取消") && !st.includes("退款") && !st.includes("关闭")) {
            pendingOrders++;
          }
          revenue += (Number(order.expectedIncome) || Number(order.actualPaid) || 0) / 100;
        });
      }

      setSummaryStats({
        totalCount: reportedTotal,
        todayCount: todayOrders,
        pendingCount: pendingOrders,
        completedCount: completedOrders,
        totalRevenue: revenue,
      });
    } catch (err) {
      console.error("Fetch user orders failed:", err);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, isOpen, currentPage, pageSize, dateRange, platformFilter, statusFilter, searchQuery, calculateDateBounds]);

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

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-85000 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className={`fixed left-1/2 top-1/2 z-85001 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen
                ? "w-screen h-dynamic-screen max-w-none max-h-none rounded-none border-none"
                : "w-[calc(100%-20px)] sm:w-[calc(100%-40px)] max-w-5xl max-h-safe-modal rounded-3xl border border-border/60"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-border/60 shrink-0 bg-muted/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShoppingBag size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-xl font-bold text-foreground truncate">
                      {userName || "成员"} 的订单数据
                    </h2>
                    {roleName && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <Shield size={10} />
                        {roleName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {userEmail || userId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* 跳转到全量订单页 */}
                {userId && (
                  <a
                    href={`/orders?userId=${userId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-9 px-2.5 sm:px-3.5 rounded-xl border border-border/70 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center gap-1.5 active:scale-95"
                    title="在订单工作台中打开"
                  >
                    <ExternalLink size={14} className="text-blue-500" />
                    <span className="hidden md:inline">在订单大盘查看</span>
                  </a>
                )}

                {/* 刷新 */}
                <button
                  onClick={() => void fetchOrders()}
                  disabled={isLoading}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center justify-center active:scale-95 disabled:opacity-50"
                  title="刷新数据"
                >
                  <RotateCcw size={15} className={isLoading ? "animate-spin" : ""} />
                </button>

                {/* 全屏切换 */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all hidden sm:flex items-center justify-center active:scale-95"
                  title={isFullscreen ? "退出全屏" : "全屏查看"}
                >
                  {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </button>

                {/* 关闭 */}
                <button
                  onClick={onClose}
                  className="h-9 w-9 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center active:scale-95"
                  title="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
              {/* Metrics Summary Cards */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
                <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-sky-600 dark:text-sky-400">
                    <span className="text-xs font-semibold">筛选订单总量</span>
                    <Layers size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    {summaryStats.totalCount} <span className="text-xs font-normal text-muted-foreground">单</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                    <span className="text-xs font-semibold">今日订单数</span>
                    <Clock size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    {summaryStats.todayCount} <span className="text-xs font-normal text-muted-foreground">单</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                    <span className="text-xs font-semibold">进行中/待配送</span>
                    <Truck size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    {summaryStats.pendingCount} <span className="text-xs font-normal text-muted-foreground">单</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-violet-500/15 bg-violet-500/5 p-3.5 sm:p-4">
                  <div className="flex items-center justify-between text-violet-600 dark:text-violet-400">
                    <span className="text-xs font-semibold">当前成交总额</span>
                    <CircleDollarSign size={16} />
                  </div>
                  <div className="mt-2 text-xl sm:text-2xl font-black text-foreground">
                    <span className="text-sm font-semibold opacity-60">￥</span>
                    {summaryStats.totalRevenue.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Filter Toolbar */}
              <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* Date Range Tabs */}
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

                  {/* Platform & Status Dropdowns */}
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
                      <option value="线下交易">线下交易</option>
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
                      <option value="待处理">待处理</option>
                      <option value="待配送">待配送</option>
                      <option value="配送中">配送中</option>
                      <option value="已完成">已完成</option>
                      <option value="已取消">已取消</option>
                    </select>

                    {(searchQuery || dateRange !== "today" || platformFilter !== "all" || statusFilter !== "all") && (
                      <button
                        onClick={handleResetFilters}
                        className="h-8.5 px-2.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
                      >
                        <RotateCcw size={12} />
                        重置
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Bar */}
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

              {/* Order List */}
              {isLoading ? (
                <div className="py-20 text-center text-muted-foreground space-y-3">
                  <Loader2 className="animate-spin mx-auto text-primary" size={32} />
                  <p className="text-xs">正在加载该成员的订单数据...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className="py-16 text-center space-y-3 rounded-2xl border border-dashed border-border/60">
                  <Package size={40} className="mx-auto text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">暂无符合条件的订单记录</p>
                  <p className="text-xs text-muted-foreground">可尝试切换时间范围或清除筛选条件</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => {
                    const statusText = order.status || "待处理";
                    const isCompleted = statusText.includes("完成") || statusText === "completed" || statusText === "done";
                    const isCancelled = statusText.includes("取消") || statusText.includes("退款") || statusText.includes("关闭");
                    const shopName = order.matchedShopName || order.rawShopName || "默认店铺";

                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-border/60 bg-background/80 hover:bg-muted/10 transition-all p-4 sm:p-5 shadow-xs space-y-3"
                      >
                        {/* Order Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="rounded-lg bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-bold font-mono">
                              #{order.dailyPlatformSequence || "-"}
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                              {order.platform || "三方平台"}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              单号: {order.orderNo}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                              <Clock size={12} />
                              {formatLocalDateTime(order.orderTime)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                isCompleted
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : isCancelled
                                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {statusText}
                            </span>

                            <div className="text-right">
                              <span className="text-sm font-black text-foreground">
                                ￥{((order.expectedIncome || order.actualPaid || 0) / 100).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Shop & Customer Info */}
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Store size={13} className="text-primary/70 shrink-0" />
                            <span className="font-semibold text-foreground/90 truncate max-w-[200px]">{shopName}</span>
                          </div>

                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <MapPin size={13} className="text-muted-foreground/70 shrink-0" />
                            <span className="truncate">{order.userAddress || "用户地址未填写"}</span>
                            {order.distanceKm ? (
                              <span className="shrink-0 text-muted-foreground/60 font-mono">({order.distanceKm}km)</span>
                            ) : null}
                          </div>
                        </div>

                        {/* Customer Remark */}
                        {order.customerRemark && (
                          <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <span className="font-bold">顾客备注：</span>
                            {order.customerRemark}
                          </div>
                        )}

                        {/* Items Breakdown */}
                        {Array.isArray(order.items) && order.items.length > 0 && (
                          <div className="pt-2 border-t border-border/40 space-y-1.5">
                            <div className="text-[11px] font-semibold text-muted-foreground">
                              商品明细 ({order.items.length} 种)：
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {order.items.map((item, idx) => {
                                const itemImage = item.matchedProduct?.image || item.thumb;
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2.5 rounded-xl bg-muted/20 p-2 text-xs border border-border/30"
                                  >
                                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                                      {itemImage ? (
                                        <img src={itemImage} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <Package size={14} className="text-muted-foreground/50" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium text-foreground truncate">{item.productName || "商品"}</div>
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {item.productNo ? `编码: ${item.productNo}` : ""}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0 font-mono">
                                      <span className="font-bold text-primary">x{item.quantity || 1}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalCount > pageSize && (
                <div className="pt-4 border-t border-border/60">
                  <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(totalCount / pageSize)}
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
