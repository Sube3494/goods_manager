"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Package, Calendar, Eye, RotateCcw, Store } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOrder } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { Suspense } from "react";
import { AUTO_INBOUND_TYPE, isAutoInboundOrderLike } from "@/lib/purchaseOrderTypes";
import { cn } from "@/lib/utils";

function InboundTableSkeleton() {
  return (
    <div className="divide-y divide-border animate-pulse">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="grid grid-cols-[160px_1fr_120px_100px_160px_80px] items-center gap-4 px-6 py-4">
          <div className="flex flex-col items-center gap-1.5">
            <div className="h-5 w-24 rounded-md bg-black/6 dark:bg-white/8" />
            <div className="h-3 w-16 rounded bg-black/4 dark:bg-white/5" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <div className="h-7 w-36 rounded-full bg-black/6 dark:bg-white/8" />
            <div className="h-7 w-28 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex justify-center">
            <div className="h-5 w-16 rounded bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex justify-center">
            <div className="h-5 w-14 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="h-4 w-4 rounded bg-black/4 dark:bg-white/5" />
            <div className="h-4 w-28 rounded bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex justify-center">
            <div className="h-7 w-7 rounded-lg bg-black/6 dark:bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InboundCardSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={idx} className="rounded-2xl border border-border/50 bg-white/50 dark:bg-white/5 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded bg-black/6 dark:bg-white/8" />
              <div className="h-4 w-12 rounded bg-black/4 dark:bg-white/5" />
              <div className="h-4 w-20 rounded-full bg-black/4 dark:bg-white/5" />
            </div>
            <div className="h-5 w-12 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-6 w-32 rounded-full bg-black/6 dark:bg-white/8" />
            <div className="h-6 w-24 rounded-full bg-black/6 dark:bg-white/8" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/10">
            <div className="h-4 w-28 rounded bg-black/4 dark:bg-white/5" />
            <div className="h-4 w-20 rounded bg-black/6 dark:bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

const INBOUND_TYPE_ALL = "全部类型";
const INBOUND_TYPE_OPTIONS = [
  { value: INBOUND_TYPE_ALL, label: INBOUND_TYPE_ALL },
  { value: "Inbound", label: "采购入库" },
  { value: AUTO_INBOUND_TYPE, label: "自动补库存" },
  { value: "ReturnGroup", label: "退回入库" },
] as const;

function getInboundTypeLabel(order: PurchaseOrder) {
  if (isAutoInboundOrderLike(order)) return "自动补库存";
  if (order.type === "Purchase" && order.status === "Received") return "采购入库";
  switch (order.type) {
    case "Return":
      return "退货入库";
    case "InternalReturn":
      return "样品退回";
    case "Inbound":
    default:
      return "采购入库";
  }
}

function getCleanShortId(id: string): string {
  if (id.startsWith('PO-AUTO-')) {
    return id.slice('PO-AUTO-'.length).replace(/^[-\s]+/, '');
  }
  if (id.startsWith('PO-INIT-')) {
    return id.slice('PO-INIT-'.length);
  }
  if (id.startsWith('PO-')) {
    const sub = id.slice('PO-'.length);
    if (sub.length > 8 && /^\d{8}-\d+$/.test(sub)) {
      return sub.slice(4);
    }
    return sub;
  }
  return id.slice(-6).toUpperCase().replace(/^[-\s]+/, '');
}

function getInboundDisplayAmount(order: PurchaseOrder): number {
  const storedTotal = Number(order.totalAmount) || 0;
  if (storedTotal > 0) {
    return storedTotal;
  }

  return order.items.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    const costPrice = Number(item.costPrice) || 0;
    return sum + (costPrice * quantity);
  }, 0);
}

function InboundContent() {
  const { showToast } = useToast();
  // Data States
  const [inbounds, setInbounds] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedShop, setSelectedShop] = useState("全部");
  const [selectedInboundType, setSelectedInboundType] = useState(INBOUND_TYPE_ALL);
  const [platformFilter, setPlatformFilter] = useState("全部平台");
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasActiveFilters = searchQuery.trim() !== "" || startDate !== "" || endDate !== "" || selectedShop !== "全部" || selectedInboundType !== INBOUND_TYPE_ALL || platformFilter !== "全部平台";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSelectedShop("全部");
    setSelectedInboundType(INBOUND_TYPE_ALL);
    setPlatformFilter("全部平台");
    setCurrentPage(1);
  }, []);

  const allShopNames = useMemo(() => {
    const names = inbounds.map(p => p.shopName).filter(Boolean) as string[];
    return Array.from(new Set(names)).sort();
  }, [inbounds]);

  // 从 note 中提取平台 (如 [美团导入])
  const extractPlatform = (note: string | undefined | null): string | null => {
    if (!note) return null;
    const match = note.match(/\[([^\[\]]+)导入\]/);
    return match ? match[1] : null;
  };

  const allPlatforms = useMemo(() => {
    const platforms = inbounds.map(p => extractPlatform(p.note)).filter(Boolean) as string[];
    return Array.from(new Set(platforms)).sort();
  }, [inbounds]);

  

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/purchases?type=Inbound&page=1&pageSize=99999&_ts=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        setInbounds(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (error) {
      console.error("Failed to fetch inbound records:", error);
      showToast("加载数据失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleView = (po: PurchaseOrder) => {
    setSelectedOrder(po);
    setIsModalOpen(true);
  };

  const filteredInbounds = inbounds.filter(p => {
    const query = searchQuery.trim().toLowerCase();
    
    // Search query filter
    const matchesSearch = !query || 
           p.id.toLowerCase().includes(query) || 
           p.items.some(item => (item.shopProduct?.name || item.product?.name || item.shopProduct?.productName || "").toLowerCase().includes(query));
    
    // Shop filter
    const matchesShop = selectedShop === "全部" || p.shopName === selectedShop;

    // Inbound type filter
    const orderType = isAutoInboundOrderLike(p)
      ? AUTO_INBOUND_TYPE
      : p.type === "Purchase" && p.status === "Received"
      ? "Inbound"
      : p.type === "Return" || p.type === "InternalReturn"
      ? "ReturnGroup"
      : (p.type || "Inbound");
    const matchesInboundType = selectedInboundType === INBOUND_TYPE_ALL || orderType === selectedInboundType;

    // Platform filter
    const orderPlatform = extractPlatform(p.note);
    const matchesPlatform = platformFilter === "全部平台" || orderPlatform === platformFilter;

    // Date filter
    let matchesDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(p.date);
      const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
      const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
      matchesDate = isWithinInterval(orderDate, { start, end });
    }

    return matchesSearch && matchesShop && matchesInboundType && matchesPlatform && matchesDate;
  });

  // Pagination Logic
  const totalItems = filteredInbounds.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedInbounds = filteredInbounds.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset page when search or date changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, selectedShop, selectedInboundType, platformFilter, pageSize]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 头部标题块 */}
      <div className="flex flex-row items-center justify-between gap-4 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">入库管理</h1>
          <p className="hidden md:block text-muted-foreground mt-1.5 text-sm sm:text-base">查看入库历史、凭证明细，并进行批量或手动入库登记</p>
        </div>
      </div>

      {/* Filter & Search Bar: 移动端/中屏自适应分层横滑，超大屏单行填满 */}
      <div className="w-full flex flex-col xl:flex-row xl:items-center gap-2.5 sm:gap-3 text-foreground">
        {/* 搜索框区域 */}
        <div className="flex items-center gap-2 w-full xl:flex-1 min-w-0 xl:min-w-[260px]">
          <div className="h-10 sm:h-11 px-4 rounded-full bg-white/70 dark:bg-white/5 border border-border/60 dark:border-white/10 flex items-center gap-2.5 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all dark:hover:bg-white/10 flex-1 min-w-0 shadow-2xs">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="搜索入库单号或商品名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-xs sm:text-sm h-full"
            />
          </div>

          {/* 移动端/小屏重置按钮 */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="xl:hidden h-10 sm:h-11 px-3.5 flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-all active:scale-95 shadow-2xs shrink-0 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>重置</span>
            </button>
          )}
        </div>

        {/* 筛选器胶囊组：移动端/中屏横向丝滑滑动，超大屏无缝平铺 */}
        <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar py-1 shrink-0 w-full xl:w-auto -mx-1 px-1 xl:mx-0 xl:px-0 pe-4 xl:pe-0">
          {/* 1. 门店筛选 */}
          <div className="h-10 sm:h-11 shrink-0">
            <CustomSelect
              value={selectedShop}
              onChange={setSelectedShop}
              options={[
                { value: "全部", label: "全部门店" },
                ...allShopNames.map(name => ({ value: name, label: name }))
              ]}
              placeholder="全部门店"
              className="h-full"
              triggerClassName={cn(
                "h-full rounded-full border shadow-2xs text-xs font-bold transition-all px-3.5 gap-1.5 justify-center text-foreground whitespace-nowrap",
                selectedShop !== "全部" 
                  ? "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:bg-sky-500/20 dark:border-sky-500/30 dark:text-sky-300" 
                  : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 hover:bg-white dark:hover:bg-white/10"
              )}
            />
          </div>

          {/* 2. 平台筛选 */}
          <div className="h-10 sm:h-11 shrink-0">
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
                "h-full rounded-full border shadow-2xs text-xs font-bold transition-all px-3.5 gap-1.5 justify-center text-foreground whitespace-nowrap",
                platformFilter !== "全部平台" 
                  ? "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:bg-sky-500/20 dark:border-sky-500/30 dark:text-sky-300" 
                  : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 hover:bg-white dark:hover:bg-white/10"
              )}
            />
          </div>

          {/* 3. 类型筛选 */}
          <div className="h-10 sm:h-11 shrink-0">
            <CustomSelect
              value={selectedInboundType}
              onChange={setSelectedInboundType}
              options={INBOUND_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              placeholder="全部类型"
              className="h-full"
              triggerClassName={cn(
                "h-full rounded-full border shadow-2xs text-xs font-bold transition-all px-3.5 gap-1.5 justify-center text-foreground whitespace-nowrap",
                selectedInboundType !== INBOUND_TYPE_ALL 
                  ? "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:bg-sky-500/20 dark:border-sky-500/30 dark:text-sky-300" 
                  : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 hover:bg-white dark:hover:bg-white/10"
              )}
            />
          </div>

          {/* 4. Date Range Pickers: 日期 */}
          <div className="flex items-center gap-1.5 sm:gap-2 h-10 sm:h-11 shrink-0">
            <DatePicker 
              value={startDate} 
              onChange={setStartDate} 
              maxDate={endDate}
              placeholder="起始日期" 
              className="h-full w-24 sm:w-28"
              triggerClassName="rounded-full shadow-2xs border-border/60 bg-white/70 dark:bg-white/5 px-2.5"
              isCompact
            />
            <span className="text-muted-foreground text-[10px] sm:text-xs shrink-0 font-medium whitespace-nowrap">至</span>
            <DatePicker 
              value={endDate} 
              onChange={setEndDate} 
              minDate={startDate}
              placeholder="截至日期" 
              className="h-full w-24 sm:w-28"
              triggerClassName="rounded-full shadow-2xs border-border/60 bg-white/70 dark:bg-white/5 px-2.5"
              isCompact
            />
          </div>

          {/* 5. 桌面端重置按钮 */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="hidden lg:flex h-10 sm:h-11 px-3.5 items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold hover:bg-sky-500/20 transition-all active:scale-95 shadow-2xs shrink-0 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>重置</span>
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent backdrop-blur-md shadow-xs">
        <div className="overflow-auto max-h-[calc(100dvh-280px-env(safe-area-inset-bottom,0px))]">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <InboundTableSkeleton />
              </motion.div>
            ) : filteredInbounds.length > 0 ? (
              <motion.table 
                key="table"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full text-left border-collapse min-w-[800px] table-auto text-sm"
              >
                <thead>
                  <tr className="border-b border-border/60 dark:border-white/10 bg-muted/40 dark:bg-white/5 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-6 py-4 text-center">入库单信息</th>
                    <th className="px-6 py-4 text-center">包含商品</th>
                    <th className="px-6 py-4 text-center">入库金额</th>
                    <th className="px-6 py-4 text-center">状态</th>
                    <th className="px-6 py-4 text-center">入库时间</th>
                    <th className="px-6 py-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 dark:divide-white/5">
                    {paginatedInbounds.map((po) => {
                      const serialMatch = po.note?.match(/\[流水号:(.*?)\]/);
                      const cleanId = getCleanShortId(po.id);
                      const serialText = serialMatch && serialMatch[1] !== '无' ? `流水单号 #${serialMatch[1]}` : `#${cleanId}`;
                      const displayAmount = getInboundDisplayAmount(po);

                      return (
                       <tr 
                        key={po.id}
                        className="hover:bg-primary/[0.03] dark:hover:bg-white/[0.03] transition-colors group"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${
                                isAutoInboundOrderLike(po)
                                  ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400'
                                  : po.type === "Return" || po.type === "InternalReturn"
                                  ? 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400'
                                  : 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400'
                              }`}>
                                {getInboundTypeLabel(po)}
                              </span>
                              {po.shopName && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 shadow-2xs">
                                  <Store size={10} className="text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span>{po.shopName}</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-muted-foreground/60 font-medium">{serialText}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-wrap justify-center gap-1.5 max-w-[320px] mx-auto">
                            {po.items.slice(0, 3).map((item, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center gap-1.5 p-0.5 pr-2.5 rounded-full bg-white/80 dark:bg-white/5 border border-border/60 dark:border-white/10 max-w-[180px] shadow-2xs hover:border-primary/40 transition-all cursor-default"
                                title={item.shopProduct?.name || item.product?.name || item.shopProduct?.productName || ""}
                              >
                                <div className="w-5 h-5 shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                  {(item.shopProduct?.image || item.product?.image) ? (
                                    <img src={item.shopProduct?.image || item.product?.image || ""} className="w-full h-full object-cover" alt="" loading="lazy" />
                                  ) : (
                                    <Package size={10} className="text-muted-foreground/50" />
                                  )}
                                </div>
                                <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                                  {item.shopProduct?.name || item.product?.name || item.shopProduct?.productName || '未知商品'}
                                </span>
                                <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                                  x{item.quantity}
                                </span>
                              </div>
                            ))}
                            {po.items.length > 3 && (
                              <div className="flex items-center justify-center h-6 px-2.5 rounded-full bg-muted/60 dark:bg-white/5 border border-border/50 dark:border-white/10 text-[10px] font-bold text-muted-foreground">
                                +{po.items.length - 3}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center font-black text-sm text-foreground tabular-nums">
                            <span className="mr-0.5 text-xs opacity-60">¥</span>
                            {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 shadow-2xs">
                            已入库
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted-foreground whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1.5 font-mono">
                            <Calendar size={13} className="text-muted-foreground/60" />
                            <span>{formatLocalDateTime(po.date)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <div className="flex justify-center">
                            <button 
                              onClick={() => handleView(po)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-white dark:border-white/10 dark:bg-white/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all shadow-2xs cursor-pointer active:scale-90"
                              title="查看详情"
                            >
                              <Eye size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </motion.table>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  icon={<Package size={40} strokeWidth={1.5} />}
                  title="暂无入库记录"
                  description={searchQuery ? '没有找到匹配的记录。' : '还没有入库记录，点击上方按钮开始登记。'}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent backdrop-blur-md shadow-xs">
        <div className="p-3.5 sm:p-4 space-y-3">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="mobile-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <InboundCardSkeleton />
              </motion.div>
            ) : paginatedInbounds.length > 0 ? (
              <motion.div
                key="mobile-list"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-3"
              >
                {paginatedInbounds.map((po) => {
                  const serialMatch = po.note?.match(/\[流水号:(.*?)\]/);
                  const cleanId = getCleanShortId(po.id);
                  const shortIdText = serialMatch && serialMatch[1] !== '无' ? `#${serialMatch[1]}` : `#${cleanId}`;
                  const displayAmount = getInboundDisplayAmount(po);
                  const inboundTypeLabel = getInboundTypeLabel(po);
                  const isReturnInbound = po.type === "Return" || po.type === "InternalReturn";
                  const isAutoInbound = isAutoInboundOrderLike(po);

                  return (
                  <div
                    key={po.id}
                    onClick={() => handleView(po)}
                    className="rounded-[22px] border border-border/60 bg-white/70 dark:bg-white/[0.03] p-4 shadow-2xs active:scale-[0.98] transition-all cursor-pointer hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between mb-3">
                       <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs ${
                             isAutoInbound
                               ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400'
                               : isReturnInbound
                               ? 'bg-violet-500/10 text-violet-600 border-violet-500/20 dark:text-violet-400'
                               : 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400'
                          }`}>
                            {inboundTypeLabel}
                          </span>
                          {po.shopName && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 shadow-2xs">
                              <Store size={9} className="text-sky-600 dark:text-sky-400 shrink-0" />
                              <span>{po.shopName}</span>
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 dark:border-white/10 dark:bg-white/5 px-2 py-0.5 text-[10px] font-mono font-bold text-foreground/80 whitespace-nowrap">
                            {shortIdText}
                          </span>
                       </div>
                       <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase shrink-0 shadow-2xs">
                          已入库
                       </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-1.5 mb-3 mt-1">
                      {po.items.slice(0, 4).map((item, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center gap-1.5 p-0.5 pr-2 rounded-full bg-white/80 dark:bg-white/5 border border-border/60 dark:border-white/10 max-w-[160px] shadow-2xs"
                          title={item.shopProduct?.name || item.product?.name || item.shopProduct?.productName || ""}
                        >
                          <div className="w-4.5 h-4.5 shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                            {(item.shopProduct?.image || item.product?.image) ? (
                              <img src={item.shopProduct?.image || item.product?.image || ""} className="w-full h-full object-cover" alt="" loading="lazy" />
                            ) : (
                              <Package size={9} className="text-muted-foreground/50" />
                            )}
                          </div>
                          <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                            {item.shopProduct?.name || item.product?.name || item.shopProduct?.productName || '未知商品'}
                          </span>
                          <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                      {po.items.length > 4 && (
                        <div className="flex items-center justify-center h-5.5 px-2 rounded-full bg-muted/60 dark:bg-white/5 border border-border/50 dark:border-white/10 text-[9px] font-bold text-muted-foreground">
                          +{po.items.length - 4}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-3.5 border-t border-border/50 dark:border-white/5 pt-2.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Calendar size={11} className="text-muted-foreground/60" />
                          <span className="text-[10px] font-mono">{formatLocalDateTime(po.date)}</span>
                      </div>
                       <div className="font-black text-foreground text-sm flex items-center gap-0.5 tabular-nums">
                           <span className="text-[10px] text-muted-foreground font-normal mr-1">金额</span>
                           <span className="text-xs opacity-60">¥</span>
                           {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                       </div>
                     </div>
                  </div>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div
                key="mobile-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  icon={<Package size={40} strokeWidth={1.5} />}
                  title="暂无记录"
                  description="暂时没有入库数据。"
                />
              </motion.div>
            )}
          </AnimatePresence>
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


      <PurchaseOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={selectedOrder}
        onSubmit={() => {}}
        readOnly={true}
        defaultType="Inbound"
      />
    </div>
  );
}

export default function InboundPage() {
  return (
    <Suspense fallback={<div className="flex h-[50dvh] items-center justify-center text-muted-foreground">加载中...</div>}>
      <InboundContent />
    </Suspense>
  );
}
