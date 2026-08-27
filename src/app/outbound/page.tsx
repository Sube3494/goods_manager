"use client";

import { useState, useEffect, useMemo } from "react";

import { Plus, Search, Package, History, RotateCcw, AlertCircle, Store, Eye, Filter, Pencil, BarChart3, TrendingUp, ArrowDownUp, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { OutboundModal } from "@/components/Outbound/OutboundModal";
import { OutboundDetailModal } from "@/components/Outbound/OutboundDetailModal";
import { PartialReturnModal } from "@/components/Outbound/PartialReturnModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Image from "next/image";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { OutboundOrder, OutboundOrderItem } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { cn, parseOutboundNote, getPlatformMeta } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";

function OutboundTableSkeleton() {
  return (
    <div className="w-full animate-pulse divide-y divide-border">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center px-4 py-3.5 gap-4">
          <div className="w-[140px] space-y-1">
            <div className="h-3.5 w-24 rounded bg-black/6 dark:bg-white/8" />
            <div className="h-2.5 w-16 rounded bg-black/4 dark:bg-white/5" />
          </div>
          <div className="w-[100px]">
            <div className="h-5 w-16 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-3/4 rounded bg-black/6 dark:bg-white/8" />
            <div className="h-2.5 w-1/2 rounded bg-black/4 dark:bg-white/5" />
          </div>
          <div className="w-[70px] flex justify-center">
            <div className="h-4 w-8 rounded bg-black/6 dark:bg-white/8" />
          </div>
          <div className="w-[140px] space-y-1">
            <div className="h-3.5 w-28 rounded bg-black/6 dark:bg-white/8" />
            <div className="h-2.5 w-16 rounded bg-black/4 dark:bg-white/5" />
          </div>
          <div className="w-[110px] flex justify-end gap-2">
            <div className="h-7 w-7 rounded-lg bg-black/6 dark:bg-white/8" />
            <div className="h-7 w-7 rounded-lg bg-black/6 dark:bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function OutboundCardSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, index) => (
        <div 
          key={index}
          className="rounded-[22px] border border-border/70 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#161b2b] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="h-4 w-28 rounded bg-black/6 dark:bg-white/8" />
              <div className="h-3 w-16 rounded bg-black/4 dark:bg-white/5" />
            </div>
            <div className="h-5 w-16 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <div className="h-10 w-10 rounded-xl bg-black/6 dark:bg-white/8 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-2/3 rounded bg-black/6 dark:bg-white/8" />
              <div className="h-3 w-1/3 rounded bg-black/4 dark:bg-white/5" />
            </div>
            <div className="h-4 w-10 rounded bg-black/6 dark:bg-white/8 shrink-0" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
            <div className="h-3 w-28 rounded bg-black/4 dark:bg-white/5" />
            <div className="h-7 w-20 rounded-lg bg-black/6 dark:bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

type AnalyticsSort = "sold-desc" | "return-rate-desc" | "returned-desc" | "net-desc" | "recent-desc";

interface OutboundProductSalesItem {
  key: string;
  productId?: string | null;
  shopProductId?: string | null;
  name: string;
  sku?: string | null;
  image?: string | null;
  shopName?: string | null;
  soldQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  orderCount: number;
  returnRate: number;
  lastOutboundAt?: string | null;
}

interface OutboundAnalytics {
  productSales: OutboundProductSalesItem[];
  totals: {
    soldQuantity: number;
    returnedQuantity: number;
    netQuantity: number;
    skuCount: number;
    returnRate: number;
  };
}

const emptyOutboundAnalytics: OutboundAnalytics = {
  productSales: [],
  totals: {
    soldQuantity: 0,
    returnedQuantity: 0,
    netQuantity: 0,
    skuCount: 0,
    returnRate: 0,
  },
};

function formatPercent(value: number) {
  return `${(Math.max(0, value || 0) * 100).toFixed(1)}%`;
}

export default function OutboundPage() {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [analytics, setAnalytics] = useState<OutboundAnalytics>(emptyOutboundAnalytics);
  const [allShopNames, setAllShopNames] = useState<string[]>([]);
  const [allPlatforms, setAllPlatforms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailOrder, setSelectedDetailOrder] = useState<OutboundOrder | null>(null);
  const [returningOrder, setReturningOrder] = useState<OutboundOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("全部平台");
  const [selectedShop, setSelectedShop] = useState("全部门店");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [analyticsSort, setAnalyticsSort] = useState<AnalyticsSort>("sold-desc");
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsStartDate, setAnalyticsStartDate] = useState("");
  const [analyticsEndDate, setAnalyticsEndDate] = useState("");
  const [analyticsPlatform, setAnalyticsPlatform] = useState("全部平台");
  const [analyticsShop, setAnalyticsShop] = useState("全部门店");
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const { showToast } = useToast();
  const { user } = useUser();
  const canCreate = hasPermission(user as SessionUser | null, "outbound:manage");

  useEffect(() => {
    fetchOrders();
  }, [currentPage, pageSize, searchQuery, startDate, endDate, typeFilter, platformFilter, selectedShop]);

  useEffect(() => {
    if (isAnalyticsOpen) {
      fetchAnalytics();
    }
  }, [isAnalyticsOpen, analyticsStartDate, analyticsEndDate, analyticsPlatform, analyticsShop]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      });
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (platformFilter !== "全部平台") params.set("platform", platformFilter);
      if (selectedShop !== "全部门店") params.set("shop", selectedShop);

      const res = await fetch(`/api/outbound?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          setTotalItems(data.length);
          setTotalPages(Math.max(1, Math.ceil(data.length / pageSize)));
          return;
        }

        setOrders(Array.isArray(data.items) ? data.items : []);
        setTotalItems(Number(data.meta?.total || 0));
        setTotalPages(Math.max(1, Number(data.meta?.totalPages || 1)));
        setAllPlatforms(Array.isArray(data.filters?.platforms) ? data.filters.platforms : []);
        setAllShopNames(Array.isArray(data.filters?.shops) ? data.filters.shops : []);
      }
    } catch (error) {
      console.error("Failed to fetch outbound orders:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setIsAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10",
        analytics: "1",
      });
      if (analyticsStartDate) params.set("startDate", analyticsStartDate);
      if (analyticsEndDate) params.set("endDate", analyticsEndDate);
      if (analyticsPlatform !== "全部平台") params.set("platform", analyticsPlatform);
      if (analyticsShop !== "全部门店") params.set("shop", analyticsShop);

      const res = await fetch(`/api/outbound?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data.analytics && Array.isArray(data.analytics.productSales) ? data.analytics : emptyOutboundAnalytics);
        setAllPlatforms(Array.isArray(data.filters?.platforms) ? data.filters.platforms : allPlatforms);
        setAllShopNames(Array.isArray(data.filters?.shops) ? data.filters.shops : allShopNames);
      }
    } catch (error) {
      console.error("Failed to fetch outbound analytics:", error);
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const handleCreateOutbound = async (data: Partial<OutboundOrder>) => {
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        showToast("出库登记成功", "success");
        setIsModalOpen(false);
        fetchOrders();
      } else {
        showToast("登记失败", "error");
      }
    } catch (error) {
      console.error("Create outbound failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleReturn = (order: OutboundOrder) => {
    setReturningOrder(order);
  };

  // 从 note 中提取店铺名的辅助函数
  const extractShopName = (note: string | undefined | null): string | null => {
    return parseOutboundNote(note).shopName;
  };

  const resolveOrderShopName = (order: OutboundOrder): string | null => {
    const noteShopName = extractShopName(order.note);
    if (noteShopName) return noteShopName;

    const itemShopName = order.items.find((item) => item.shopProduct?.shopName)?.shopProduct?.shopName;
    if (itemShopName) return itemShopName;

    return order.shopName || null;
  };

  // 从 note 中提取平台的辅助函数 (归一化为 美团、京东、淘宝等)
  const extractPlatform = (note: string | undefined | null): string | null => {
    const rawPlatform = parseOutboundNote(note).platform;
    return getPlatformMeta(rawPlatform)?.name || null;
  };

  const paginatedOrders = orders;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, typeFilter, platformFilter, selectedShop, pageSize]);
  
  const activeFiltersCount = useMemo(() => {
    return (typeFilter !== "all" ? 1 : 0) + 
           (platformFilter !== "全部平台" ? 1 : 0) + 
           (selectedShop !== "全部门店" ? 1 : 0);
  }, [typeFilter, platformFilter, selectedShop]);

  const sortedProductSales = useMemo(() => {
    const items = [...analytics.productSales];
    items.sort((a, b) => {
      if (analyticsSort === "return-rate-desc") {
        return b.returnRate - a.returnRate || b.returnedQuantity - a.returnedQuantity || b.soldQuantity - a.soldQuantity;
      }
      if (analyticsSort === "returned-desc") {
        return b.returnedQuantity - a.returnedQuantity || b.returnRate - a.returnRate || b.soldQuantity - a.soldQuantity;
      }
      if (analyticsSort === "net-desc") {
        return b.netQuantity - a.netQuantity || b.soldQuantity - a.soldQuantity;
      }
      if (analyticsSort === "recent-desc") {
        return new Date(b.lastOutboundAt || 0).getTime() - new Date(a.lastOutboundAt || 0).getTime();
      }
      return b.soldQuantity - a.soldQuantity || b.netQuantity - a.netQuantity;
    });
    return items;
  }, [analytics.productSales, analyticsSort]);

  const highReturnProducts = useMemo(() => {
    return [...analytics.productSales]
      .filter((item) => item.returnedQuantity > 0)
      .sort((a, b) => b.returnRate - a.returnRate || b.returnedQuantity - a.returnedQuantity)
      .slice(0, 6);
  }, [analytics.productSales]);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-20">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">出库管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">处理销售、样本或损耗，精准抵扣账面余值。</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAnalyticsOpen(true)}
            className="h-9 md:h-11 flex items-center justify-center gap-2 px-4 md:px-5 rounded-full border border-border bg-white text-foreground font-bold text-sm transition-all hover:bg-muted/60 active:scale-95 shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <BarChart3 size={17} />
            <span className="hidden sm:inline">商品分析</span>
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/10 px-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
              {analytics.totals.skuCount}
            </span>
          </button>

        {canCreate && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="group relative h-9 md:h-11 flex items-center justify-center gap-2 px-4 md:px-8 bg-primary text-primary-foreground rounded-full font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 overflow-hidden shrink-0"
          >
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <Plus size={18} className="relative md:size-[20px]" />
            <span className="relative text-sm md:text-base">新增出库</span>
          </button>
        )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-3 mb-6 md:mb-8">
        <div className="flex flex-wrap items-center gap-3 text-foreground">
          {/* 搜索框 + 重置按钮 */}
          <div className="flex items-center gap-2 flex-grow sm:flex-1 min-w-[280px]">
            <div className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 sm:gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-grow">
              <Search size={18} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="搜索单号、备注或商品名称..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
              />
            </div>
            
            {(searchQuery.trim() !== "" || startDate !== "" || endDate !== "" || activeFiltersCount > 0) && (
                <button
                    onClick={() => {
                        setSearchQuery("");
                        setStartDate("");
                        setEndDate("");
                        setTypeFilter("all");
                        setPlatformFilter("全部平台");
                        setSelectedShop("全部门店");
                        setCurrentPage(1);
                    }}
                    className="h-10 sm:h-11 px-3 sm:px-4 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                >
                    <RotateCcw size={14} />
                    <span className="hidden sm:inline">重置</span>
                    <span className="sm:hidden text-[10px]">重置</span>
                </button>
            )}
          </div>
          
          {/* Date Range Pickers */}
          <div className="flex items-center gap-1.5 sm:gap-2 h-10 sm:h-11 shrink-0 flex-1 sm:flex-none">
              <DatePicker 
                  value={startDate} 
                  onChange={setStartDate} 
                  maxDate={endDate}
                  placeholder="起始日期" 
                  className="h-full w-full sm:w-32 lg:w-36"
                  triggerClassName="rounded-full shadow-sm"
                  isCompact
              />
              <span className="text-muted-foreground text-[10px] sm:text-xs shrink-0 font-medium whitespace-nowrap">至</span>
              <DatePicker 
                  value={endDate} 
                  onChange={setEndDate} 
                  minDate={startDate}
                  placeholder="截至日期" 
                  className="h-full w-full sm:w-32 lg:w-36"
                  triggerClassName="rounded-full shadow-sm"
                  isCompact
              />
          </div>

          {/* 高级筛选折叠按钮 */}
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className={cn(
              "h-10 sm:h-11 px-4 flex items-center gap-2 rounded-full border text-xs font-bold transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap",
              isFiltersExpanded || activeFiltersCount > 0
                ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-muted/50 dark:hover:bg-white/10 text-muted-foreground"
            )}
          >
            <Filter size={14} className={cn("transition-transform duration-200", isFiltersExpanded && "rotate-180")} />
            <span>筛选</span>
            {activeFiltersCount > 0 && (
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-black">
                {activeFiltersCount}
              </span>
            )}
          </button>

        </div>

        {/* 折叠高级筛选框面板 */}
        {isFiltersExpanded && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/10 dark:border-white/5 mt-2 animate-in fade-in slide-in-from-top-2 duration-200 w-full">
            <div className="w-full sm:w-36 h-10 sm:h-11 shrink-0">
                <CustomSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                        { value: "all", label: "所有类型" },
                        { value: "Sale", label: "销售出库" },
                        { value: "Sample", label: "样板领用" },
                        { value: "Loss", label: "损耗出库" },
                        { value: "Return", label: "退货入库" }
                    ]}
                    className="h-full"
                    triggerClassName={cn(
                        "h-full rounded-full border shadow-sm text-[10px] sm:text-sm font-normal transition-all px-3 sm:px-4",
                        typeFilter !== "all" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-bold" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5"
                    )}
                />
            </div>
            
            <div className="w-full sm:w-36 h-10 sm:h-11 shrink-0">
                <CustomSelect
                    value={platformFilter}
                    onChange={setPlatformFilter}
                    options={[
                      { value: "全部平台", label: "全部平台" },
                      ...allPlatforms.map(name => ({ value: name, label: name }))
                    ]}
                    placeholder="全部平台"
                    className="h-full"
                    triggerClassName={cn(
                        "h-full rounded-full border shadow-sm text-[10px] sm:text-sm font-normal transition-all px-3 sm:px-4",
                        platformFilter !== "全部平台" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-bold" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5"
                    )}
                />
            </div>
            
            <div className="w-full sm:w-36 h-10 sm:h-11 shrink-0">
                <CustomSelect
                    value={selectedShop}
                    onChange={setSelectedShop}
                    options={[
                      { value: "全部门店", label: "全部门店" },
                      ...allShopNames.map(name => ({ value: name, label: name }))
                    ]}
                    placeholder="全部门店"
                    className="h-full"
                    triggerClassName={cn(
                        "h-full rounded-full border shadow-sm text-[10px] sm:text-sm font-normal transition-all px-3 sm:px-4",
                        selectedShop !== "全部门店" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-bold" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5"
                    )}
                />
            </div>
          </div>
        )}
      </div>

      {/* Orders List */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100dvh-280px-env(safe-area-inset-bottom,0px))]">
          {isLoading ? (
            <OutboundTableSkeleton />
          ) : paginatedOrders.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[900px] table-auto">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">单据编号</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">类型</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">平台</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">出库时间</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">商品概览</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                  {paginatedOrders.map((order) => {
                    const isReturned = order.status === 'Returned';
                    const parsed = parseOutboundNote(order.note);
                    
                    const isPartialReturned = order.status === 'PartialReturned';
                    const shopName = parsed.shopName || resolveOrderShopName(order);
                    const platformName = extractPlatform(order.note);
                    const platformMeta = getPlatformMeta(platformName);
                    const serialNum = parsed.serialNum;

                    return (
                      <tr 
                        key={order.id}
                        className={`transition-all duration-300 group ${
                          isReturned ? 'opacity-40 grayscale-[0.6] bg-muted/5' : 'hover:bg-muted/20'
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-center text-[11px] font-mono text-muted-foreground">
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {shopName && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                  <Store size={8} />
                                  {shopName}
                                </span>
                              )}
                            </div>
                            <span className="font-semibold text-muted-foreground/40 text-[10px]">
                              {serialNum ? `流水单号 #${serialNum}` : `#${order.id.slice(-6).toUpperCase()}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              order.type === 'Sale' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                              order.type === 'Sample' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                              'bg-orange-500/10 text-orange-600 border-orange-500/20'
                            }`}>
                              {order.type === 'Sale' ? '销售' : order.type === 'Sample' ? '领用' : order.type === 'Return' ? '退货' : '损耗'}
                            </span>
                            {isReturned && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-destructive bg-destructive/5 px-2 py-0.5 rounded-md border border-destructive/10">
                                <RotateCcw size={10} />
                                已对冲
                              </span>
                            )}
                            {isPartialReturned && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded-md border border-amber-500/10">
                                <RotateCcw size={10} />
                                部分退回
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center">
                            {platformMeta ? (
                              <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] shadow-xs", platformMeta.className)}>
                                <span className="inline-flex h-4.5 w-4.5 items-center justify-center shrink-0">
                                  <Image
                                    src={platformMeta.iconSrc}
                                    alt={platformMeta.name}
                                    width={18}
                                    height={18}
                                    className="h-4.5 w-4.5 object-cover"
                                    unoptimized
                                  />
                                </span>
                                <span>{platformMeta.name}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 dark:bg-slate-500/20 dark:border-slate-500/30 shadow-xs whitespace-nowrap">
                                <Pencil size={11} className="shrink-0" />
                                <span>手动登记</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className={`flex items-center justify-center gap-1.5 text-xs font-mono transition-colors ${isReturned ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                            <History size={11} className="opacity-50" />
                            {format(new Date(order.date), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-wrap justify-center gap-2 max-w-[320px] mx-auto">
                            {order.items.slice(0, 3).map((item: OutboundOrderItem) => (
                              <div 
                                key={item.id} 
                                className={`flex items-center gap-2 p-0.5 pr-2.5 rounded-full bg-secondary/30 dark:bg-white/5 border border-border/50 max-w-[180px] shadow-sm hover:border-primary/30 transition-all cursor-default ${isReturned ? 'opacity-40 grayscale' : ''}`}
                                title={item.shopProduct?.name || item.product?.name}
                              >
                                <div className="relative w-6 h-6 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center">
                                  {(item.shopProduct?.image || item.product?.image) ? (
                                    <Image src={item.shopProduct?.image || item.product?.image || ""} className="object-cover" alt="" fill sizes="24px" />
                                  ) : (
                                    <Package size={12} className="text-muted-foreground/50" />
                                  )}
                                </div>
                                <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                                  {item.shopProduct?.name || item.product?.name || '未知商品'}
                                </span>
                                <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                            {order.items.length > 3 && (
                              <div className={`flex items-center justify-center h-7 px-3 rounded-full bg-muted/50 border border-border/50 text-[10px] font-bold text-muted-foreground ${isReturned ? 'opacity-40 grayscale' : ''}`}>
                                +{order.items.length - 3}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex justify-center items-center gap-1">
                            <button
                              onClick={() => {
                                setSelectedDetailOrder(order);
                                setIsDetailOpen(true);
                              }}
                              className="p-2.5 rounded-2xl text-muted-foreground hover:bg-primary/10 hover:text-primary hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 active:scale-90"
                              title="查看详细信息"
                            >
                              <Eye size={18} />
                            </button>
                            {!isReturned ? (
                              <button 
                                onClick={() => handleReturn(order)}
                                className="p-2.5 rounded-2xl text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 active:scale-90"
                                title={isPartialReturned ? "继续退货入库" : "退货入库"}
                              >
                                <RotateCcw size={18} />
                              </button>
                            ) : (
                              <div className="p-2.5 text-muted-foreground/10" title="该记录已对冲，不可重复操作">
                                  <RotateCcw size={18} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              icon={<History size={40} strokeWidth={1.5} />}
              title="暂无出库记录"
              description="点击右上角「新增出库申请」开始记录。"
              className="py-32"
            />
          )}
        </div>
      </div>

      {/* Mobile Card View (Updated for aesthetic consistency) */}
      <div className="md:hidden rounded-2xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
        <div className="p-4 space-y-4">
          <>
            {isLoading ? (
              <OutboundCardSkeleton />
            ) : paginatedOrders.length > 0 ? (
              paginatedOrders.map((order) => {
                const isReturned = order.status === 'Returned';
                const isPartialReturned = order.status === 'PartialReturned';
                const parsed = parseOutboundNote(order.note);
                
                const shopName = parsed.shopName || resolveOrderShopName(order);
                const platformName = extractPlatform(order.note);
                const platformMeta = getPlatformMeta(platformName);
                const serialNum = parsed.serialNum;

                const noteParts = order.note?.match(/^(.*)\s*\(已退回:\s*(.*)\)$/);
                const returnReason = noteParts ? noteParts[2] : (isReturned ? "常规退回" : null);

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl border border-border shadow-xs p-5 space-y-3 transition-all duration-500 ${
                      isReturned ? 'bg-muted/5 opacity-60 grayscale-[0.5]' : 'bg-white/50 dark:bg-white/5 active:scale-[0.98]'
                    }`}
                  >
                    {/* 第一排：单号、状态属性整合与操作 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                        
                        {/* 1. 平台与流水单号集成 Badge */}
                        {platformMeta ? (
                          <span className={cn("inline-flex h-7 items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border shadow-xs whitespace-nowrap", platformMeta.className)}>
                            <span className="inline-flex h-3.5 w-3.5 items-center justify-center shrink-0">
                              <Image
                                src={platformMeta.iconSrc}
                                alt={platformMeta.name}
                                width={14}
                                height={14}
                                className="h-3.5 w-3.5 object-cover"
                                unoptimized
                              />
                            </span>
                            <span>{serialNum ? `#${serialNum}` : `#${order.id.slice(-4).toUpperCase()}`}</span>
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex h-7 items-center rounded-full border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/4 px-2 text-[10px] font-mono font-black text-foreground/80 whitespace-nowrap">
                              {serialNum ? `#${serialNum}` : `#${order.id.slice(-4).toUpperCase()}`}
                            </span>
                            <span className="inline-flex h-7 items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 dark:bg-slate-500/20 dark:border-slate-500/30 shadow-xs whitespace-nowrap">
                              <Pencil size={11} className="shrink-0" />
                              <span>手动登记</span>
                            </span>
                          </>
                        )}

                        {/* 2. 出库门店 Badge */}
                        {shopName && (
                          <span className="inline-flex h-7 items-center rounded-full border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/4 px-2 text-[9px] font-bold text-blue-500 whitespace-nowrap">
                            <Store size={8} className="mr-1 text-blue-500" />
                            {shopName}
                          </span>
                        )}

                        {/* 3. 出库类型 Badge */}
                        <span className={`inline-flex h-7 items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase whitespace-nowrap ${
                          order.type === 'Sale' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                          order.type === 'Sample' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                          'bg-orange-500/10 text-orange-600 border-orange-500/20'
                        }`}>
                          {order.type === 'Sale' ? '销售' : order.type === 'Sample' ? '领用' : order.type === 'Return' ? '退货' : '损耗'}
                        </span>

                        {/* 4. 已对冲 Badge */}
                        {isReturned && (
                          <span className="inline-flex h-7 items-center text-[10px] font-bold text-destructive px-2.5 py-0.5 bg-destructive/5 rounded-full border border-destructive/10 whitespace-nowrap">已对冲</span>
                        )}
                        {isPartialReturned && (
                          <span className="inline-flex h-7 items-center text-[10px] font-bold text-amber-500 px-2.5 py-0.5 bg-amber-500/5 rounded-full border border-amber-500/10 whitespace-nowrap">部分退回</span>
                        )}
                      </div>

                      {/* 右侧操作按钮 */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            setSelectedDetailOrder(order);
                            setIsDetailOpen(true);
                          }}
                          className="p-2 text-primary bg-primary/5 rounded-2xl border border-primary/10 active:scale-90 transition-transform"
                          title="查看详情"
                        >
                          <Eye size={14} />
                        </button>
                        {!isReturned && (
                          <button 
                              onClick={() => handleReturn(order)}
                              className="p-2 text-orange-600 bg-orange-500/5 rounded-2xl border border-orange-500/10 active:scale-90 transition-transform"
                              title={isPartialReturned ? "继续退货入库" : "对冲退回"}
                          >
                              <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 第二排：时间与商品数量（以极细线条隔开） */}
                    <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
                      <div className="min-w-0 flex-1 pr-4">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-medium opacity-60">
                          <History size={10} />
                          {format(new Date(order.date), 'MM-dd HH:mm', { locale: zhCN })}
                        </div>
                        {isReturned && returnReason && (
                          <p className="text-[9px] font-bold text-destructive/50 mt-1 flex items-center gap-1 uppercase tracking-tighter">
                            <AlertCircle size={8} /> 理由: {returnReason}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-black tabular-nums transition-colors ${isReturned ? 'text-muted-foreground/30' : 'text-foreground'}`}>
                          {order.items.reduce((acc: number, item: OutboundOrderItem) => acc + item.quantity, 0)} 
                          <span className="text-[10px] font-normal text-muted-foreground ml-0.5">件商品</span>
                        </p>
                      </div>
                    </div>

                    {/* 第三排：商品缩略清单 */}
                    <div className="flex flex-wrap gap-2">
                      {order.items.slice(0, 4).map((item: OutboundOrderItem) => (
                        <div 
                          key={item.id} 
                          className={`flex items-center gap-2 p-0.5 pr-2.5 rounded-full bg-secondary/30 dark:bg-white/5 border border-border/50 max-w-[160px] shadow-sm hover:border-primary/30 transition-all cursor-default ${isReturned ? 'opacity-40 grayscale' : ''}`}
                          title={item.shopProduct?.name || item.product?.name}
                        >
                          <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center">
                            {(item.shopProduct?.image || item.product?.image) ? (
                              <Image src={item.shopProduct?.image || item.product?.image || ""} className="object-cover" alt="" fill sizes="20px" />
                            ) : (
                              <Package size={10} className="text-muted-foreground/50" />
                            )}
                          </div>
                          <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                            {item.shopProduct?.name || item.product?.name || '未知商品'}
                          </span>
                          <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 4 && (
                        <div className={`flex items-center justify-center h-6 px-2.5 rounded-full bg-muted/50 border border-border/50 text-[10px] font-bold text-muted-foreground ${isReturned ? 'opacity-40 grayscale' : ''}`}>
                          +{order.items.length - 4}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={<History size={40} strokeWidth={1.5} />}
                title="暂无记录"
                description="暂时没有出库数据。"
              />
            )}
          </>
        </div>
      </div>

      {/* Pagination Component */}
      {!isLoading && totalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {isAnalyticsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BarChart3 size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-foreground">商品分析</h2>
                  <p className="mt-1 text-xs text-muted-foreground">独立按门店商品统计销量、净出库和退货率</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAnalyticsOpen(false)}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭商品分析"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <DatePicker
                  value={analyticsStartDate}
                  onChange={setAnalyticsStartDate}
                  maxDate={analyticsEndDate}
                  placeholder="分析起始日期"
                  className="h-10 w-full sm:w-36"
                  triggerClassName="rounded-full shadow-sm"
                  isCompact
                />
                <DatePicker
                  value={analyticsEndDate}
                  onChange={setAnalyticsEndDate}
                  minDate={analyticsStartDate}
                  placeholder="分析截至日期"
                  className="h-10 w-full sm:w-36"
                  triggerClassName="rounded-full shadow-sm"
                  isCompact
                />
                <div className="h-10 w-full sm:w-36">
                  <CustomSelect
                    value={analyticsPlatform}
                    onChange={setAnalyticsPlatform}
                    options={[
                      { value: "全部平台", label: "全部平台" },
                      ...allPlatforms.map(name => ({ value: name, label: name })),
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full border shadow-sm text-xs font-bold px-4 bg-white dark:bg-white/5 border-border dark:border-white/10"
                  />
                </div>
                <div className="h-10 w-full sm:w-36">
                  <CustomSelect
                    value={analyticsShop}
                    onChange={setAnalyticsShop}
                    options={[
                      { value: "全部门店", label: "全部门店" },
                      ...allShopNames.map(name => ({ value: name, label: name })),
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full border shadow-sm text-xs font-bold px-4 bg-white dark:bg-white/5 border-border dark:border-white/10"
                  />
                </div>
                <div className="h-10 w-full sm:w-36">
                  <CustomSelect
                    value={analyticsSort}
                    onChange={(value) => setAnalyticsSort(value as AnalyticsSort)}
                    options={[
                      { value: "sold-desc", label: "销量最高" },
                      { value: "return-rate-desc", label: "退货率最高" },
                      { value: "returned-desc", label: "退货最多" },
                      { value: "net-desc", label: "净销量最高" },
                      { value: "recent-desc", label: "最近出库" },
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full border shadow-sm text-xs font-bold px-4 bg-white dark:bg-white/5 border-border dark:border-white/10"
                  />
                </div>
                {(analyticsStartDate || analyticsEndDate || analyticsPlatform !== "全部平台" || analyticsShop !== "全部门店") && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsStartDate("");
                      setAnalyticsEndDate("");
                      setAnalyticsPlatform("全部平台");
                      setAnalyticsShop("全部门店");
                    }}
                    className="h-10 rounded-full border border-border px-4 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    重置分析
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
                <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-white/5">
                  <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-black text-foreground">销量排行</h3>
                      <p className="text-xs text-muted-foreground">
                        {analytics.totals.skuCount} 个 SKU · 出库 {analytics.totals.soldQuantity} 件 · 退回 {analytics.totals.returnedQuantity} 件
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <ArrowDownUp size={13} />
                      {analyticsSort === "sold-desc" ? "销量最高" : analyticsSort === "return-rate-desc" ? "退货率最高" : analyticsSort === "returned-desc" ? "退货最多" : analyticsSort === "net-desc" ? "净销量最高" : "最近出库"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 border-b border-border/70 sm:grid-cols-4">
                    {[
                      { label: "销售件数", value: analytics.totals.soldQuantity },
                      { label: "净出库", value: analytics.totals.netQuantity },
                      { label: "退货件数", value: analytics.totals.returnedQuantity },
                      { label: "整体退货率", value: formatPercent(analytics.totals.returnRate) },
                    ].map((item) => (
                      <div key={item.label} className="border-r border-border/60 px-4 py-3 last:border-r-0">
                        <p className="text-[11px] font-bold text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-lg font-black tabular-nums text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-border/70">
                    {isAnalyticsLoading ? (
                      Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                          <div className="h-10 w-10 rounded-xl bg-black/6 dark:bg-white/8" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 w-2/3 rounded bg-black/6 dark:bg-white/8" />
                            <div className="h-2.5 w-1/3 rounded bg-black/4 dark:bg-white/5" />
                          </div>
                          <div className="h-4 w-16 rounded bg-black/6 dark:bg-white/8" />
                        </div>
                      ))
                    ) : sortedProductSales.length > 0 ? (
                      sortedProductSales.slice(0, 30).map((item, index) => (
                        <div key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_86px_86px_86px_86px] sm:items-center">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-black text-muted-foreground">
                            {index + 1}
                          </div>
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-muted">
                              {item.image ? (
                                <Image src={item.image} alt="" fill sizes="40px" className="object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package size={16} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-foreground">{item.name}</p>
                              <p className="truncate text-[11px] font-medium text-muted-foreground">
                                {[item.shopName, item.sku].filter(Boolean).join(" · ") || "未记录门店/SKU"}
                              </p>
                            </div>
                          </div>
                          <div className="col-span-2 grid grid-cols-4 gap-2 text-right sm:col-span-4">
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground">销量</p>
                              <p className="text-sm font-black tabular-nums text-foreground">{item.soldQuantity}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground">净销</p>
                              <p className="text-sm font-black tabular-nums text-foreground">{item.netQuantity}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground">退货</p>
                              <p className={cn("text-sm font-black tabular-nums", item.returnedQuantity > 0 ? "text-orange-600" : "text-foreground")}>{item.returnedQuantity}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground">退货率</p>
                              <p className={cn("text-sm font-black tabular-nums", item.returnRate >= 0.2 ? "text-destructive" : item.returnRate > 0 ? "text-orange-600" : "text-foreground")}>
                                {formatPercent(item.returnRate)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        当前分析条件内暂无销售出库商品。
                      </div>
                    )}
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-white/5">
                  <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                      <TrendingUp size={18} />
                    </span>
                    <div>
                      <h3 className="text-base font-black text-foreground">退货率预警</h3>
                      <p className="text-xs text-muted-foreground">按门店商品的退货率和退货件数排序</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border/70">
                    {isAnalyticsLoading ? (
                      Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="px-4 py-4 animate-pulse space-y-2">
                          <div className="h-3.5 w-3/4 rounded bg-black/6 dark:bg-white/8" />
                          <div className="h-2.5 w-1/2 rounded bg-black/4 dark:bg-white/5" />
                        </div>
                      ))
                    ) : highReturnProducts.length > 0 ? (
                      highReturnProducts.map((item) => (
                        <div key={item.key} className="px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-foreground">{item.name}</p>
                              <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
                                {item.shopName || "未分门店"} · 出库 {item.soldQuantity} 件 · 退回 {item.returnedQuantity} 件
                              </p>
                            </div>
                            <span className={cn(
                              "shrink-0 rounded-full px-2.5 py-1 text-xs font-black tabular-nums",
                              item.returnRate >= 0.2 ? "bg-destructive/10 text-destructive" : "bg-orange-500/10 text-orange-600"
                            )}>
                              {formatPercent(item.returnRate)}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", item.returnRate >= 0.2 ? "bg-destructive" : "bg-orange-500")}
                              style={{ width: `${Math.min(100, Math.max(3, item.returnRate * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                        当前分析条件内没有退货商品。
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      <OutboundModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOutbound}
      />

      <OutboundDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedDetailOrder(null);
        }}
        order={selectedDetailOrder}
      />

      <PartialReturnModal
        isOpen={Boolean(returningOrder)}
        order={returningOrder}
        onClose={() => setReturningOrder(null)}
        onSuccess={() => {
          setReturningOrder(null);
          fetchOrders();
        }}
      />
    </div>
  );
}
