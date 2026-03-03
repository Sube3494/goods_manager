"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Package, Calendar, Eye, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOrder } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { DatePicker } from "@/components/ui/DatePicker";
import { startOfDay, endOfDay, parseISO, isWithinInterval } from "date-fns";

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

  const hasActiveFilters = searchQuery.trim() !== "" || startDate !== "" || endDate !== "";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStartDate("");
    setEndDate("");
  }, []);

  

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
    
    // Date filter
    let matchesDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(p.date);
      const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
      const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
      matchesDate = isWithinInterval(orderDate, { start, end });
    }

    return matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
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
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">加载中...</p>
            </div>
          ) : filteredInbounds.length > 0 ? (
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库单编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">金额总计</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredInbounds.map((po) => (
                   <motion.tr 
                    key={po.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-foreground font-mono text-xs">{po.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
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
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
                 <Package size={40} strokeWidth={1.5} />
               </div>
               <h3 className="text-xl font-bold text-foreground">暂无入库记录</h3>
               <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                 {searchQuery ? '没有找到匹配的记录。' : '还没有入库记录，点击上方按钮开始登记。'}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
        <div className="p-4 space-y-4">
          <AnimatePresence mode="popLayout">
            {isLoading ? (
               <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground/50">
                  <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="text-sm font-medium tracking-widest uppercase opacity-50">Loading</p>
               </div>
            ) : filteredInbounds.length > 0 ? (
              filteredInbounds.map((po) => (
                <motion.div
                  key={po.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => handleView(po)}
                  className="rounded-2xl border border-border/50 bg-white/50 dark:bg-white/5 p-4 shadow-sm active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                     <span className="font-bold text-sm font-mono">{po.id}</span>
                     <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
                        已入库
                     </span>
                  </div>
                  <div className="flex items-center justify-between mt-4 border-t border-border/10 pt-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={12} />
                        <span className="text-[10px] font-mono">{formatLocalDateTime(po.date)}</span>
                    </div>
                    <div className="font-bold text-foreground text-sm">
                        ￥{po.totalAmount.toLocaleString()}
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-20 text-center text-muted-foreground">
                <p className="text-sm font-medium">暂无记录</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>


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
