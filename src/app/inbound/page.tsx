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
import Image from "next/image";

import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { Suspense } from "react";

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
  const [platformFilter, setPlatformFilter] = useState("全部平台");
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const hasActiveFilters = searchQuery.trim() !== "" || startDate !== "" || endDate !== "" || selectedShop !== "全部" || platformFilter !== "全部平台";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
    setSelectedShop("全部");
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
      const res = await fetch("/api/purchases?type=Inbound");
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
           p.items.some(item => item.product?.name?.toLowerCase().includes(query));
    
    // Shop filter
    const matchesShop = selectedShop === "全部" || p.shopName === selectedShop;

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

    return matchesSearch && matchesShop && matchesPlatform && matchesDate;
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
  }, [searchQuery, startDate, endDate, selectedShop, platformFilter, pageSize]);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-20">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">入库管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">查看入库历史、凭证明细，并进行批量或手动入库登记。</p>
        </div>
        
      </div>


      {/* Search Box & Reset */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6 md:mb-8 text-foreground">
        <div className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 sm:gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full md:flex-1">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="搜索入库单号或商品名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
            />
        </div>

        <div className="flex flex-row items-center gap-2 sm:gap-3 h-10 sm:h-11 w-full md:w-auto">
            {/* Date Range Pickers */}
            <div className="flex items-center gap-1.5 sm:gap-2 h-full shrink-0 flex-1 md:flex-none">
                <DatePicker 
                    value={startDate} 
                    onChange={setStartDate} 
                    maxDate={endDate}
                    placeholder="起始日期" 
                    className="h-full w-full md:w-32 lg:w-36"
                    triggerClassName="rounded-full shadow-sm"
                    isCompact
                />
                <span className="text-muted-foreground text-[10px] sm:text-xs shrink-0 font-medium whitespace-nowrap">至</span>
                <DatePicker 
                    value={endDate} 
                    onChange={setEndDate} 
                    minDate={startDate}
                    placeholder="截至日期" 
                    className="h-full w-full md:w-32 lg:w-36"
                    triggerClassName="rounded-full shadow-sm"
                    isCompact
                />
            </div>

            <div className="w-24 sm:w-28 h-full shrink-0">
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
                        "h-full rounded-full border shadow-sm transition-all text-[10px] sm:text-sm",
                        platformFilter !== "全部平台" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
                    )}
                />
            </div>

            <div className="w-24 sm:w-28 h-full shrink-0">
                <CustomSelect
                    value={selectedShop}
                    onChange={setSelectedShop}
                    options={[
                      { value: "全部", label: "全部店铺" },
                      ...allShopNames.map(name => ({ value: name, label: name }))
                    ]}
                    placeholder="全部店铺"
                    className="h-full"
                    triggerClassName={cn(
                        "h-full rounded-full border shadow-sm transition-all text-[10px] sm:text-sm",
                        selectedShop !== "全部" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
                    )}
                />
            </div>

            {hasActiveFilters && (
                <button
                    onClick={resetFilters}
                    className="h-full px-3 sm:px-4 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                >
                    <RotateCcw size={14} />
                    <span className="hidden sm:inline">重置</span>
                    <span className="sm:hidden text-[10px]">重置</span>
                </button>
            )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 backdrop-blur-md shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">加载中...</p>
            </div>
          ) : filteredInbounds.length > 0 ? (
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库单信息</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">包含商品</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">总数量</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
                {paginatedInbounds.map((po) => {
                  const serialMatch = po.note?.match(/\[流水号:(.*?)\]/);
                  const serialText = serialMatch && serialMatch[1] !== '无' ? `流水单号 #${serialMatch[1]}` : `#${po.id.slice(-6).toUpperCase()}`;

                  return (
                   <tr 
                    key={po.id}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            po.id.startsWith('PO-AUTO') ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                          }`}>
                            {po.id.startsWith('PO-AUTO') ? '系统补库' : '采购入库'}
                          </span>
                          {po.shopName && (
                            <span className="flex items-center justify-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 w-fit">
                              <Store size={10} />
                              {po.shopName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/30 font-semibold">{serialText}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-wrap justify-center gap-2 max-w-[320px] mx-auto">
                        {po.items.slice(0, 3).map((item, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-center gap-2 p-0.5 pr-2.5 rounded-full bg-secondary/30 dark:bg-white/5 border border-border/50 max-w-[180px] shadow-sm hover:border-primary/30 transition-all cursor-default"
                              title={item.product?.name}
                          >
                            <div className="relative w-6 h-6 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center">
                              {item.product?.image ? (
                                <Image src={item.product.image} className="object-cover" alt="" fill sizes="24px" />
                              ) : (
                                <Package size={12} className="text-muted-foreground/50" />
                              )}
                            </div>
                            <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                              {item.product?.name || '未知商品'}
                            </span>
                            <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                              x{item.quantity}
                            </span>
                          </div>
                        ))}
                        {po.items.length > 3 && (
                          <div className="flex items-center justify-center h-7 px-3 rounded-full bg-muted/50 border border-border/50 text-[10px] font-bold text-muted-foreground">
                            +{po.items.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-sm text-foreground">
                        {po.items.reduce((sum, item) => sum + item.quantity, 0)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        已入库
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                          <Calendar size={14} />
                          <span className="font-mono">
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button 
                            onClick={() => handleView(po)}
                            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                            title="查看详情"
                        >
                            <Eye size={16} />
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          ) : (
            <EmptyState
              icon={<Package size={40} strokeWidth={1.5} />}
              title="暂无入库记录"
              description={searchQuery ? '没有找到匹配的记录。' : '还没有入库记录，点击上方按钮开始登记。'}
            />
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden rounded-2xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
        <div className="p-4 space-y-4">
            {isLoading ? (
               <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground/50">
                  <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin mb-4" />
                   <p className="text-sm font-medium tracking-widest opacity-50">加载中</p>
               </div>
            ) : paginatedInbounds.length > 0 ? (
              paginatedInbounds.map((po) => {
                const serialMatch = po.note?.match(/\[流水号:(.*?)\]/);
                const serialText = serialMatch && serialMatch[1] !== '无' ? `流水单号 #${serialMatch[1]}` : `#${po.id.slice(-6).toUpperCase()}`;

                return (
                <div
                  key={po.id}
                  onClick={() => handleView(po)}
                  className="rounded-2xl border border-border/50 bg-white/50 dark:bg-white/5 p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                     <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-1.5">
                         <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            po.id.startsWith('PO-AUTO') ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                         }`}>
                           {po.id.startsWith('PO-AUTO') ? '系统补库' : '采购入库'}
                         </span>
                         {po.shopName && (
                           <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
                             <Store size={8} />
                             {po.shopName}
                           </span>
                         )}
                       </div>
                       <span className="text-[10px] font-mono text-muted-foreground/30 font-semibold">{serialText}</span>
                     </div>
                     <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase shrink-0">
                        已入库
                     </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-3 mt-1">
                    {po.items.slice(0, 4).map((item, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-2 p-0.5 pr-2.5 rounded-full bg-secondary/30 dark:bg-white/5 border border-border/50 max-w-[160px] shadow-sm"
                        title={item.product?.name}
                      >
                        <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden bg-white dark:bg-black flex items-center justify-center">
                          {item.product?.image ? (
                            <Image src={item.product.image} className="object-cover" alt="" fill sizes="20px" />
                          ) : (
                            <Package size={10} className="text-muted-foreground/50" />
                          )}
                        </div>
                        <span className="text-[10px] font-medium truncate text-foreground/80 leading-none">
                          {item.product?.name || '未知商品'}
                        </span>
                        <span className="text-[10px] font-black text-primary shrink-0 leading-none">
                          x{item.quantity}
                        </span>
                      </div>
                    ))}
                    {po.items.length > 4 && (
                      <div className="flex items-center justify-center h-6 px-2.5 rounded-full bg-muted/50 border border-border/50 text-[10px] font-bold text-muted-foreground">
                        +{po.items.length - 4}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-4 border-t border-border/10 pt-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={12} />
                        <span className="text-[10px] font-mono">{formatLocalDateTime(po.date)}</span>
                    </div>
                    <div className="font-bold text-foreground text-sm flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground font-normal">总计:</span>
                        {po.items.reduce((sum, item) => sum + item.quantity, 0)} 件
                    </div>
                  </div>
                </div>
              );
            })
            ) : (
              <EmptyState
                icon={<Package size={40} strokeWidth={1.5} />}
                title="暂无记录"
                description="暂时没有入库数据。"
              />
            )}
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
      />
    </div>
  );
}

export default function InboundPage() {
  return (
    <Suspense fallback={<div className="flex h-[50vh] items-center justify-center text-muted-foreground">加载中...</div>}>
      <InboundContent />
    </Suspense>
  );
}
