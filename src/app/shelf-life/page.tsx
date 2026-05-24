"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { 
  Clock, 
  Search, 
  AlertCircle, 
  X, 
  Edit3, 
  FileText, 
  RefreshCw,
  CheckCircle,
  Package,
  Store,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";

interface BatchItem {
  id: string;
  productId: string;
  shopProductId: string;
  batchNo: string;
  productionDate: string | null;
  expirationDate: string;
  quantity: number;
  remainingStock: number;
  purchaseOrderId: string | null;
  productName: string;
  productImage: string | null;
  sku: string | null;
  shopName: string;
  shelfLifeDays: number | null;
  remainingDays: number;
  status: "expired" | "critical" | "warning" | "safe";
  remark: string;
}

interface StatsSummary {
  expired: { count: number; value: number };
  critical: { count: number; value: number };
  warning: { count: number; value: number };
  safe: { count: number; value: number };
}

export default function ShelfLifeDashboard() {
  const { showToast } = useToast();
  const { user } = useUser();
  const sessionUser = user as SessionUser | null;
  const canManage = hasPermission(sessionUser, "shelf_life:manage");
  
  // SEO 标题控制
  useEffect(() => {
    document.title = "保质期与临期库存管理 | 智能批次追溯管理系统";
  }, []);

  // 核心状态
  const [stats, setStats] = useState<{ summary: StatsSummary } | null>(null);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  
  // 台账筛选
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "expired" | "critical" | "warning" | "safe">("all");
  const [selectedShop, setSelectedShop] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBatches, setTotalBatches] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  
  // 弹窗状态
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  
  // 调整库存表单状态
  const [activeAdjustBatch, setActiveAdjustBatch] = useState<BatchItem | null>(null);
  const [adjustStock, setAdjustStock] = useState<number | "">("");
  const [adjustRemark, setAdjustRemark] = useState("");
  const [isAdjustingBatch, setIsAdjustingBatch] = useState(false);

  // 获取统计看板数据
  const fetchStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const res = await fetch("/api/shelf-life/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch shelf life stats:", err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // 获取台账明细
  const fetchBatches = useCallback(async (isFirstPage = true) => {
    try {
      setIsLoadingBatches(true);
      const targetPage = isFirstPage ? 1 : currentPage + 1;
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        pageSize: "15",
        status: selectedStatus,
        shopId: selectedShop,
        search: searchQuery
      });
      
      const res = await fetch(`/api/shelf-life/batches?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (isFirstPage) {
          setBatches(data.items);
        } else {
          setBatches(prev => [...prev, ...data.items]);
        }
        setTotalBatches(data.total);
        setCurrentPage(targetPage);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      console.error("Failed to fetch product batches:", err);
    } finally {
      setIsLoadingBatches(false);
    }
  }, [selectedStatus, selectedShop, searchQuery, currentPage]);

  // 获取店铺列表
  const fetchShops = useCallback(async () => {
    try {
      const res = await fetch("/api/shops?source=shipping-addresses");
      if (res.ok) {
        const data = await res.json();
        const shopList = Array.isArray(data?.shops) ? data.shops : [];
        setShops(shopList);
        if (shopList.length === 1) {
          setSelectedShop(shopList[0].id);
        }
      }
    } catch (err) {
      console.error("Failed to fetch shops:", err);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    void fetchStats();
    void fetchShops();
  }, [fetchStats, fetchShops]);

  // 当台账筛选条件变化时，重新获取台账数据
  useEffect(() => {
    void fetchBatches(true);
  }, [selectedStatus, selectedShop, searchQuery, fetchBatches]);

  // 手动调整剩余库存/核销批次
  const handleAdjustBatch = async () => {
    if (!activeAdjustBatch || adjustStock === "") {
      showToast("请输入合法的剩余库存数量", "warning");
      return;
    }
    setIsAdjustingBatch(true);
    try {
      const res = await fetch("/api/shelf-life/batches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeAdjustBatch.id,
          remainingStock: Number(adjustStock),
          remark: adjustRemark
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || "调整批次失败", "error");
        return;
      }
      showToast(Number(adjustStock) === 0 ? "该批次库存已成功核销报废！" : "批次库存调整成功！", "success");
      setIsAdjustModalOpen(false);
      
      // 刷新数据
      void fetchStats();
      void fetchBatches(true);
    } catch (err) {
      console.error("Failed to adjust batch:", err);
      showToast("请求失败，请稍后重试", "error");
    } finally {
      setIsAdjustingBatch(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* 顶部 Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 transition-all relative z-10">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Clock className="text-primary animate-pulse" size={32} /> 
            <span className="font-extrabold">保质期与临期库存</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-2xl font-medium">
            智能化监控商品保质期状态，自动判定临期预警，保障食品与货品品质安全。
          </p>
        </div>
      </div>

      {/* 1. 核心看板 (磨砂玻璃与高级呼吸微光卡片) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* 已过期 */}
        <div className="group relative rounded-3xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 p-6 backdrop-blur-md transition-all duration-300 hover:border-red-500/30 hover:shadow-[0_12px_30px_-5px_rgba(239,68,68,0.08)] hover:-translate-y-1 bg-linear-to-br from-red-500/1.5 to-transparent overflow-hidden shadow-sm">
          {/* 水印背景图标 */}
          <AlertCircle className="absolute right-[-15px] bottom-[-15px] text-red-500/3 pointer-events-none scale-150 h-28 w-28 transition-transform duration-500 group-hover:scale-170 group-hover:rotate-12" />
          
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">已过期</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black bg-linear-to-r from-red-500 to-red-400 bg-clip-text text-transparent tracking-tight font-sans">
              {isLoadingStats ? "..." : stats?.summary.expired.count || 0}
            </span>
            <span className="text-xs text-muted-foreground/80 font-bold">批次变质</span>
          </div>
          <div className="mt-4 text-xs font-mono text-muted-foreground/60 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
            <span>积压损失估值</span>
            <span className="font-bold text-red-500 font-number">￥{isLoadingStats ? "0.00" : stats?.summary.expired.value.toFixed(2)}</span>
          </div>
        </div>

        {/* 严重临期 */}
        <div className="group relative rounded-3xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 p-6 backdrop-blur-md transition-all duration-300 hover:border-orange-500/30 hover:shadow-[0_12px_30px_-5px_rgba(249,115,22,0.08)] hover:-translate-y-1 bg-linear-to-br from-orange-500/1.5 to-transparent overflow-hidden shadow-sm">
          {/* 水印背景图标 */}
          <AlertCircle className="absolute right-[-15px] bottom-[-15px] text-orange-500/3 pointer-events-none scale-150 h-28 w-28 transition-transform duration-500 group-hover:scale-170 group-hover:rotate-12" />
          
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">严重临期 (≤15天)</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black bg-linear-to-r from-orange-500 to-orange-400 bg-clip-text text-transparent tracking-tight font-sans">
              {isLoadingStats ? "..." : stats?.summary.critical.count || 0}
            </span>
            <span className="text-xs text-muted-foreground/80 font-bold">批次亟待处理</span>
          </div>
          <div className="mt-4 text-xs font-mono text-muted-foreground/60 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
            <span>面临过期风险</span>
            <span className="font-bold text-orange-500 font-number">￥{isLoadingStats ? "0.00" : stats?.summary.critical.value.toFixed(2)}</span>
          </div>
        </div>

        {/* 临期提醒 */}
        <div className="group relative rounded-3xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 p-6 backdrop-blur-md transition-all duration-300 hover:border-amber-500/30 hover:shadow-[0_12px_30px_-5px_rgba(245,158,11,0.08)] hover:-translate-y-1 bg-linear-to-br from-amber-500/1.5 to-transparent overflow-hidden shadow-sm">
          {/* 水印背景图标 */}
          <AlertCircle className="absolute right-[-15px] bottom-[-15px] text-amber-500/3 pointer-events-none scale-150 h-28 w-28 transition-transform duration-500 group-hover:scale-170 group-hover:rotate-12" />
          
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">预警提醒 (15-45天)</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black bg-linear-to-r from-amber-500 to-amber-400 bg-clip-text text-transparent tracking-tight font-sans">
              {isLoadingStats ? "..." : stats?.summary.warning.count || 0}
            </span>
            <span className="text-xs text-muted-foreground/80 font-bold">批次安全警报</span>
          </div>
          <div className="mt-4 text-xs font-mono text-muted-foreground/60 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
            <span>预警在库成本</span>
            <span className="font-bold text-amber-500 font-number">￥{isLoadingStats ? "0.00" : stats?.summary.warning.value.toFixed(2)}</span>
          </div>
        </div>

        {/* 安全在库 */}
        <div className="group relative rounded-3xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 p-6 backdrop-blur-md transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_12px_30px_-5px_rgba(16,185,129,0.08)] hover:-translate-y-1 bg-linear-to-br from-emerald-500/1.5 to-transparent overflow-hidden shadow-sm">
          {/* 水印背景图标 */}
          <CheckCircle className="absolute right-[-15px] bottom-[-15px] text-emerald-500/3 pointer-events-none scale-150 h-28 w-28 transition-transform duration-500 group-hover:scale-170 group-hover:rotate-12" />
          
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-widest text-muted-foreground/80 uppercase">安全在库 (&gt;45天)</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl sm:text-5xl font-black bg-linear-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent tracking-tight font-sans">
              {isLoadingStats ? "..." : stats?.summary.safe.count || 0}
            </span>
            <span className="text-xs text-muted-foreground/80 font-bold">批次处于安全期</span>
          </div>
          <div className="mt-4 text-xs font-mono text-muted-foreground/60 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3">
            <span>安全库存总货值</span>
            <span className="font-bold text-emerald-500 font-number">￥{isLoadingStats ? "0.00" : stats?.summary.safe.value.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 在库批次台账列表 */}
      <div className="flex flex-col gap-6">
        <div className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 sm:p-8 backdrop-blur-md flex flex-col gap-6 shadow-xl">
            
            {/* 列表头部与快速过滤器面板 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                <span className="font-extrabold tracking-tight">保质期库存批次台账</span>
                <span className="text-[10px] text-muted-foreground font-mono bg-black/5 dark:bg-white/10 px-2.5 py-0.5 rounded-full font-bold">{totalBatches} 行</span>
              </h2>
            </div>

            {/* 搜索与过滤单行面板（全部收到一起） */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full">
              {/* 搜索框 */}
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
                <input 
                  type="text" 
                  placeholder="搜索商品名、SKU店内码、简拼..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-8 rounded-full bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/20 dark:focus:ring-white/15 focus:border-primary/30 dark:focus:border-white/20 transition-all placeholder:text-muted-foreground/60 font-semibold"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* 店铺选择器 */}
              <div className="w-full md:w-44 shrink-0">
                <CustomSelect
                  value={selectedShop}
                  onChange={(val) => setSelectedShop(val)}
                  options={
                    shops.length === 1 
                      ? shops.map(s => ({ value: s.id, label: s.name }))
                      : [
                          { value: "all", label: "所有店铺" },
                          ...shops.map(s => ({ value: s.id, label: s.name }))
                        ]
                  }
                  triggerClassName="rounded-full h-10 px-4 text-xs text-foreground font-bold border-black/5 dark:border-white/10 bg-white dark:bg-white/5"
                />
              </div>

              {/* 保质期预警状态选择器 */}
              <div className="w-full md:w-44 shrink-0">
                <CustomSelect
                  value={selectedStatus}
                  onChange={(val) => setSelectedStatus(val as typeof selectedStatus)}
                  options={[
                    { value: "all", label: "所有保质期状态" },
                    { value: "expired", label: "已过期" },
                    { value: "critical", label: "严重临期" },
                    { value: "warning", label: "临期提醒" },
                    { value: "safe", label: "安全在库" }
                  ]}
                  triggerClassName="rounded-full h-10 px-4 text-xs text-foreground font-bold border-black/5 dark:border-white/10 bg-white dark:bg-white/5"
                />
              </div>

              {/* 重置按钮 */}
              {(searchQuery || 
                selectedStatus !== "all" || 
                (shops.length > 0 && (shops.length > 1 ? selectedShop !== "all" : selectedShop !== shops[0].id))) && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedStatus("all");
                    if (shops.length === 1 && shops[0]) {
                      setSelectedShop(shops[0].id);
                    } else {
                      setSelectedShop("all");
                    }
                  }}
                  className="h-10 px-4 flex items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-xs shrink-0 whitespace-nowrap"
                >
                  <RotateCcw size={13} />
                  <span>重置</span>
                </button>
              )}
            </div>

            {/* 账册表格 / 卡片列表 */}
            <div className="space-y-3">
              {isLoadingBatches && batches.length === 0 ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse border border-black/5 dark:border-white/5" />
                  ))}
                </div>
              ) : batches.length === 0 ? (
                <EmptyState
                  icon={<Clock size={36} className="text-muted-foreground/30 animate-pulse" />}
                  title="没有匹配的库存批次档案"
                  description="在当前筛选条件与搜索关键字下，未能检索到与之对应的保质期在库库存数据。"
                  className="py-16"
                />
              ) : (
                <div className="flex flex-col gap-3">
                  
                  {/* Desktop Table View (电脑端表格展示) */}
                  <div className="hidden md:block rounded-2xl border border-black/5 dark:border-white/10 bg-white/20 dark:bg-white/2 overflow-hidden backdrop-blur-md">
                    <table className="w-full text-left border-collapse table-auto text-xs">
                      <thead>
                        <tr className="border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest">
                          <th className="px-6 py-4 w-[20%]">商品</th>
                          <th className="px-6 py-4 w-[10%] text-center">店铺</th>
                          <th className="px-6 py-4 text-center whitespace-nowrap">保质期状态</th>
                          <th className="px-6 py-4 text-center whitespace-nowrap">在库状态</th>
                          <th className="px-6 py-4 w-[18%] text-center">备注说明</th>
                          {canManage && <th className="px-6 py-4 text-center whitespace-nowrap">操作</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 dark:divide-white/5">
                        {batches.map(batch => {
                          const isExpired = batch.status === "expired";
                          const isCritical = batch.status === "critical";
                          const isWarning = batch.status === "warning";
                          
                          return (
                            <tr 
                              key={batch.id} 
                              className={cn(
                                "hover:bg-black/2 dark:hover:bg-white/2 transition-all duration-200 group",
                                isExpired && "bg-red-500/1.5",
                                isCritical && "bg-orange-500/1.5",
                                isWarning && "bg-amber-500/1.5"
                              )}
                            >
                              {/* 商品 */}
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2.5 w-fit max-w-full cursor-default">
                                  <div className="relative w-7 h-7 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center border border-black/5 dark:border-white/5 shadow-xs">
                                    {batch.productImage ? (
                                      <Image 
                                        src={batch.productImage} 
                                        alt={batch.productName}
                                        fill
                                        unoptimized
                                        className="object-cover transition-transform duration-300 group-hover:scale-105" 
                                      />
                                    ) : (
                                      <div className={cn(
                                        "h-full w-full flex items-center justify-center font-bold text-xs uppercase overflow-hidden",
                                        isExpired && "bg-red-500/10 text-red-500",
                                        isCritical && "bg-orange-500/10 text-orange-500",
                                        isWarning && "bg-amber-500/10 text-amber-500",
                                        batch.status === "safe" && "bg-emerald-500/10 text-emerald-500"
                                      )}>
                                        <Package size={12} />
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[11px] font-medium text-foreground/90 leading-none truncate max-w-[140px] lg:max-w-[180px] group-hover:text-primary transition-colors duration-200" title={batch.productName}>
                                    {batch.productName}
                                  </span>
                                </div>
                              </td>

                              {/* 店铺 */}
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/5 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/10 dark:border-blue-500/20 text-xs font-bold whitespace-nowrap">
                                  <Store size={12} className="shrink-0 text-blue-500 dark:text-blue-400" />
                                  {batch.shopName}
                                </span>
                              </td>

                              {/* 保质期状态 */}
                              <td className="px-6 py-4 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <span className={cn(
                                    "text-xs font-extrabold flex items-center gap-1.5",
                                    isExpired && "text-red-500",
                                    isCritical && "text-orange-500",
                                    isWarning && "text-amber-500",
                                    batch.status === "safe" && "text-emerald-500"
                                  )}>
                                    {isExpired ? (
                                      <>
                                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_4px_rgba(239,68,68,0.8)]" />
                                        <span>已过期 {Math.abs(batch.remainingDays)} 天</span>
                                      </>
                                    ) : (
                                      <>
                                        <span className={cn(
                                          "h-1.5 w-1.5 rounded-full",
                                          isCritical && "bg-orange-500 animate-pulse shadow-[0_0_4px_rgba(249,115,22,0.8)]",
                                          isWarning && "bg-amber-500",
                                          batch.status === "safe" && "bg-emerald-500"
                                        )} />
                                        <span>剩余 {batch.remainingDays} 天</span>
                                      </>
                                    )}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/50 font-bold font-mono">到期: {batch.expirationDate}</span>
                                </div>
                              </td>

                              {/* 在库状态 */}
                              <td className="px-6 py-4 text-center whitespace-nowrap">
                                <div className="flex flex-col items-center justify-center font-mono gap-1">
                                  <div className="flex items-baseline gap-0.5 leading-none">
                                    <span className="text-sm font-extrabold text-foreground">{batch.remainingStock}</span>
                                    <span className="text-[10px] text-muted-foreground/60">/ {batch.quantity} 件</span>
                                  </div>
                                  {/* 2px 高度的超精细进度条 */}
                                  <div className="w-16 h-0.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden mt-1">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full transition-all duration-500",
                                        isExpired && "bg-red-500",
                                        isCritical && "bg-orange-500",
                                        isWarning && "bg-amber-500",
                                        batch.status === "safe" && "bg-emerald-500"
                                      )}
                                      style={{ width: `${batch.quantity > 0 ? Math.min(100, (batch.remainingStock / batch.quantity) * 100) : 0}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              {/* 备注说明 */}
                              <td className="px-6 py-4 text-center">
                                {batch.remark ? (
                                  <span className="text-xs text-foreground/75 leading-normal break-all font-medium">
                                    {batch.remark}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/30 italic text-[11px]">无备注</span>
                                )}
                              </td>

                              {/* 操作 */}
                              {canManage && (
                                <td className="px-6 py-4 text-center whitespace-nowrap">
                                  <button
                                    onClick={() => {
                                      setActiveAdjustBatch(batch);
                                      setAdjustStock(batch.remainingStock);
                                      setAdjustRemark(batch.remark);
                                      setIsAdjustModalOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all active:scale-95 cursor-pointer mx-auto"
                                    title="报废核销或更正库存"
                                  >
                                    <Edit3 size={12} />
                                    <span>调整/核销</span>
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View (移动端卡片式展示，自适应降级) */}
                  <div className="flex flex-col gap-3 md:hidden">
                    {batches.map(batch => {
                      const isExpired = batch.status === "expired";
                      const isCritical = batch.status === "critical";
                      const isWarning = batch.status === "warning";
                      
                      return (
                        <div 
                          key={batch.id}
                          className={cn(
                            "group relative flex flex-col gap-3.5 p-4 rounded-2xl border bg-white/40 dark:bg-white/2 border-black/5 dark:border-white/5 transition-all shadow-xs hover:bg-white/80 dark:hover:bg-white/5 hover:border-primary/20 dark:hover:border-white/15 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-white/1 overflow-hidden",
                            isExpired && "border-red-500/20 bg-red-500/1.5",
                            isCritical && "border-orange-500/20 bg-orange-500/1.5",
                            isWarning && "border-amber-500/20 bg-amber-500/1.5"
                          )}
                        >
                          {/* 1. 卡片头部：商品信息与状态 Badge 左右对齐 */}
                          <div className="flex items-start justify-between gap-3 w-full min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="relative w-8 h-8 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center border border-black/5 dark:border-white/5 shadow-xs">
                                {batch.productImage ? (
                                  <Image 
                                    src={batch.productImage} 
                                    alt={batch.productName}
                                    fill
                                    unoptimized
                                    className="object-cover transition-transform duration-300 group-hover:scale-105" 
                                  />
                                ) : (
                                  <div className={cn(
                                    "h-full w-full flex items-center justify-center font-bold text-xs uppercase overflow-hidden",
                                    isExpired && "bg-red-500/10 text-red-500",
                                    isCritical && "bg-orange-500/10 text-orange-500",
                                    isWarning && "bg-amber-500/10 text-amber-500",
                                    batch.status === "safe" && "bg-emerald-500/10 text-emerald-500"
                                  )}>
                                    <Package size={14} />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-foreground/90 truncate block leading-snug group-hover:text-primary transition-colors" title={batch.productName}>
                                  {batch.productName}
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-blue-500 dark:text-blue-400 mt-0.5">
                                  <Store size={9} className="shrink-0" />
                                  {batch.shopName}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <span className={cn(
                                "inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border leading-none",
                                isExpired && "bg-red-500/10 text-red-500 border-red-500/10",
                                isCritical && "bg-orange-500/10 text-orange-500 border-orange-500/10 animate-pulse",
                                isWarning && "bg-amber-500/10 text-amber-500 border-amber-500/10",
                                batch.status === "safe" && "bg-emerald-500/10 text-emerald-500 border-emerald-500/10"
                              )}>
                                {isExpired ? ('已过期 ' + Math.abs(batch.remainingDays) + '天') : ('剩余 ' + batch.remainingDays + '天')}
                              </span>
                              <span className="text-[8px] text-muted-foreground/50 block font-mono font-bold mt-1">到期: {batch.expirationDate}</span>
                            </div>
                          </div>

                          {/* 2. 卡片中段：在库状态及进度条 */}
                          <div className="flex flex-col gap-1 w-full mt-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground font-semibold">在库状态</span>
                              <span className="font-mono font-bold text-foreground">{batch.remainingStock} / {batch.quantity} 件</span>
                            </div>
                            <div className="w-full h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden mt-0.5">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  isExpired && "bg-red-500",
                                  isCritical && "bg-orange-500",
                                  isWarning && "bg-amber-500",
                                  batch.status === "safe" && "bg-emerald-500"
                                )}
                                style={{ width: (batch.quantity > 0 ? Math.min(100, (batch.remainingStock / batch.quantity) * 100) : 0) + '%' }}
                              />
                            </div>
                          </div>

                          {/* 3. 卡片备注区 */}
                          {batch.remark && (
                            <div className="w-full text-[10px] text-foreground/75 font-medium bg-black/2 dark:bg-white/2 px-2.5 py-2 rounded-xl border border-black/5 dark:border-white/5 mt-0.5">
                              <span className="text-muted-foreground mr-1">备注:</span>
                              <span className="break-all">{batch.remark}</span>
                            </div>
                          )}

                          {/* 4. 卡片操作区：操作按钮居右 */}
                          {canManage && (
                            <div className="flex justify-end pt-2 border-t border-black/5 dark:border-white/5 w-full shrink-0">
                              <button
                                onClick={() => {
                                  setActiveAdjustBatch(batch);
                                  setAdjustStock(batch.remainingStock);
                                  setAdjustRemark(batch.remark);
                                  setIsAdjustModalOpen(true);
                                }}
                                className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 px-3 py-1.5 rounded-xl transition-all active:scale-95 border border-black/5 dark:border-white/10"
                              >
                                <Edit3 size={11} />
                                <span>调整/核销</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {hasMore && (
                    <button 
                      onClick={() => void fetchBatches(false)}
                      disabled={isLoadingBatches}
                      className="w-full h-11 flex items-center justify-center gap-2 border border-dashed border-black/10 dark:border-white/10 hover:border-primary/30 rounded-full hover:bg-black/5 dark:hover:bg-white/5 font-bold text-xs text-muted-foreground hover:text-foreground transition-all active:scale-98 disabled:opacity-50"
                    >
                      {isLoadingBatches ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>加载中...</span>
                        </>
                      ) : (
                        <span>加载更多台账记录</span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            
          </div>
        </div>

      {/* 弹窗：核销与数量微调 (Modal) */}
      <AnimatePresence>
        {isAdjustModalOpen && activeAdjustBatch && (
          <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsAdjustModalOpen(false)} 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md rounded-3xl border border-black/5 dark:border-white/10 bg-white/95 dark:bg-[#0b111e]/98 backdrop-blur-xl p-6 shadow-2xl flex flex-col"
            >
              <div className="mb-4 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Edit3 size={18} className="text-primary" />
                  <span className="font-extrabold tracking-tight">批次在库库存调整与核销</span>
                </h3>
                <button onClick={() => setIsAdjustModalOpen(false)} className="rounded-full p-1.5 hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-primary/5 dark:bg-white/5 border border-primary/10 dark:border-white/5 rounded-2xl p-4 text-xs space-y-4 font-sans">
                  {/* 商品卡片头部 */}
                  <div className="flex items-center gap-3 border-b border-black/5 dark:border-white/5 pb-3">
                    <div className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black border border-black/5 dark:border-white/5 shadow-xs">
                      {activeAdjustBatch.productImage ? (
                        <Image 
                          src={activeAdjustBatch.productImage} 
                          alt={activeAdjustBatch.productName}
                          fill
                          unoptimized
                          className="object-cover" 
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-black/5 dark:bg-white/5 text-muted-foreground">
                          <Package size={18} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground leading-none font-bold uppercase tracking-wider">当前修改商品</p>
                      <p className="text-xs font-semibold text-foreground mt-1 leading-snug line-clamp-2" title={activeAdjustBatch.productName}>
                        {activeAdjustBatch.productName}
                      </p>
                    </div>
                  </div>

                  {/* 详细参数 Grid 网格 */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                    <div className="col-span-2 border-b border-black/5 dark:border-white/5 pb-2">
                      <span className="text-muted-foreground block leading-normal mb-0.5">批次号 / 单号</span>
                      <span className="font-mono font-bold text-foreground break-all select-all">{activeAdjustBatch.purchaseOrderId || activeAdjustBatch.batchNo || "—"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block leading-normal mb-0.5">所属店铺</span>
                      <span className="font-bold text-foreground">{activeAdjustBatch.shopName}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block leading-normal mb-0.5">原始到货</span>
                      <span className="font-bold text-foreground font-mono">{activeAdjustBatch.quantity} 件</span>
                    </div>
                    <div className="col-span-2 border-t border-black/5 dark:border-white/5 pt-2 mt-0.5">
                      <span className="text-muted-foreground block leading-normal mb-0.5">生产日期</span>
                      <span className="font-bold text-foreground font-mono">{activeAdjustBatch.productionDate || "未填"}</span>
                    </div>
                  </div>

                  {/* 保质到期与临期天数 (突出显示) */}
                  <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-3 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block leading-normal">保质到期日</span>
                      <span className="font-bold text-foreground font-mono">{activeAdjustBatch.expirationDate}</span>
                    </div>
                    <div className="text-right">
                      {activeAdjustBatch.status === "expired" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 dark:bg-red-500/20 dark:text-red-400 border border-red-500/10 dark:border-red-500/20 font-bold">
                          已过期
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-md font-bold border",
                          activeAdjustBatch.status === "critical" && "bg-orange-500/10 text-orange-500 dark:bg-orange-500/20 dark:text-orange-400 border-orange-500/10 dark:border-orange-500/20",
                          activeAdjustBatch.status === "warning" && "bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/10 dark:border-amber-500/20",
                          activeAdjustBatch.status === "safe" && "bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-500/10 dark:border-emerald-500/20"
                        )}>
                          剩余 {activeAdjustBatch.remainingDays} 天
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    在库剩余库存数量 (输入 0 代表报废核销)
                  </label>
                  <input 
                    type="number"
                    min="0"
                    placeholder="修改当前在库实数..."
                    value={adjustStock}
                    onChange={(e) => setAdjustStock(e.target.value !== "" ? Number(e.target.value) : "")}
                    className="w-full h-11 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 text-foreground font-mono text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:focus:ring-white/15 focus:border-primary/30 dark:focus:border-white/20 transition-all"
                  />
                  {adjustStock === 0 && (
                    <div className="text-[10px] text-red-500 font-semibold flex items-center gap-1.5 bg-red-500/10 dark:bg-red-500/20 border border-red-500/20 p-2.5 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle size={12} strokeWidth={3} className="shrink-0" />
                      <span>警告: 数量设为 0 后，该批次将执行核销下架，不再占用在库货值！</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">更新备注</label>
                  <input 
                    type="text"
                    placeholder="例如: 变质损耗/数据更正..."
                    value={adjustRemark}
                    onChange={(e) => setAdjustRemark(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 px-4 text-foreground text-sm outline-none focus:ring-2 focus:ring-primary/20 dark:focus:ring-white/15 focus:border-primary/30 dark:focus:border-white/20 transition-all font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t border-black/5 dark:border-white/5 shrink-0 mt-6">
                <button
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="flex-1 h-10 rounded-full border border-black/10 dark:border-white/10 text-xs sm:text-sm font-bold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95"
                >
                  取消
                </button>
                <button
                  onClick={handleAdjustBatch}
                  disabled={isAdjustingBatch || adjustStock === ""}
                  className={cn(
                    "flex-1 h-10 rounded-full text-xs sm:text-sm font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50",
                    adjustStock === 0 
                      ? "bg-red-500 text-white shadow-red-500/20 hover:shadow-red-500/40" 
                      : "bg-primary text-primary-foreground shadow-primary/20 hover:shadow-primary/45"
                  )}
                >
                  {isAdjustingBatch ? "保存中..." : (adjustStock === 0 ? "确认报废核销" : "确认调整保存")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
