"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Package, History, RotateCcw, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { OutboundModal } from "@/components/Outbound/OutboundModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Image from "next/image";
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { OutboundOrder, OutboundOrderItem } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AnimatePresence } from "framer-motion";

export default function OutboundPage() {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  
  const { showToast } = useToast();
  const { user } = useUser();
  const canCreate = hasPermission(user as SessionUser | null, "outbound:create");

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/outbound");
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch outbound orders:", error);
    } finally {
      setIsLoading(false);
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

  const handleReturn = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "出库退货入库",
      message: "此操作将该笔出库记录标记为“已退回”，并自动将相关商品及其对应的批次库存退回到库房。此举符合财务对冲规范，不会物理删除历史痕迹。确定继续吗？",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/outbound/${id}`, { 
            method: "POST",
            body: JSON.stringify({ reason: "异常退回" }) 
          });
          if (res.ok) {
            showToast("对冲操作成功，库存已恢复", "success");
            fetchOrders();
          } else {
            const data = await res.json();
            showToast(data.error || "操作失败", "error");
          }
        } catch (error) {
          console.error("Return outbound failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };

  const filteredOrders = orders.filter(order => {
    // Search query filter
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((item: OutboundOrderItem) => item.product?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Type filter
    const matchesType = typeFilter === "all" || order.type === typeFilter;
    
    // Date filter
    let matchesDate = true;
    if (startDate || endDate) {
      const orderDate = new Date(order.date);
      const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
      const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
      matchesDate = isWithinInterval(orderDate, { start, end });
    }
    
    return matchesSearch && matchesType && matchesDate;
  });

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 pb-20">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">出库管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">处理销售、样本或损耗，精准抵扣账面余值。</p>
        </div>

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

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6 md:mb-8">
        <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full lg:flex-1">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="搜索单号、备注或商品名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 h-auto sm:h-10 w-full lg:w-auto">
            {/* Date Range Pickers */}
            <div className="flex items-center gap-2 h-10 shrink-0 w-full sm:w-auto">
                <DatePicker 
                    value={startDate} 
                    onChange={setStartDate} 
                    maxDate={endDate}
                    placeholder="起始日期" 
                    className="h-full flex-1 md:w-36"
                    triggerClassName="rounded-full shadow-sm"
                    isCompact
                />
                <span className="text-muted-foreground text-xs shrink-0 font-medium hidden sm:block">至</span>
                <DatePicker 
                    value={endDate} 
                    onChange={setEndDate} 
                    minDate={startDate}
                    placeholder="截至日期" 
                    className="h-full flex-1 md:w-36"
                    triggerClassName="rounded-full shadow-sm"
                    isCompact
                    align="right"
                />
            </div>

            <div className="w-full sm:w-40 h-10 shrink-0">
                <CustomSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                        { value: "all", label: "所有类型" },
                        { value: "Sale", label: "销售出库" },
                        { value: "Sample", label: "样板/领用" },
                        { value: "Loss", label: "库存损耗" },
                        { value: "Return", label: "退货出库" }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-sm font-medium"
                />
            </div>
        </div>
      </div>

      {/* Orders List */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-3xl border border-border bg-white dark:bg-gray-900/70 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">加载中...</p>
            </div>
          ) : filteredOrders.length > 0 ? (
            <table className="w-full text-left border-collapse min-w-[900px] table-auto">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">单据编号</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">类型</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">出库时间</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">备注</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">商品概览</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">数量总计</th>
                  <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence mode="popLayout">
                  {filteredOrders.map((order) => {
                    // @ts-expect-error - status property is available but not in base type
                    const isReturned = order.status === 'Returned';
                    const noteParts = order.note?.match(/^(.*)\s*\(已退回:\s*(.*)\)$/);
                    const displayNote = noteParts ? noteParts[1] : (order.note || "");
                    const returnReason = noteParts ? noteParts[2] : (isReturned ? "常规退回" : null);

                    return (
                      <motion.tr 
                        key={order.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`transition-all duration-300 group ${
                          isReturned ? 'opacity-40 grayscale-[0.6] bg-muted/5' : 'hover:bg-muted/20'
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-center text-[11px] font-mono text-muted-foreground">
                            #{order.id.slice(-6).toUpperCase()}
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
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className={`flex flex-col items-center gap-0.5 text-xs font-mono transition-colors ${isReturned ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                            <div className="flex items-center gap-1.5">
                              <History size={11} className="opacity-50" />
                              {format(new Date(order.date), 'yyyy-MM-dd', { locale: zhCN })}
                            </div>
                            <span className="text-[10px] opacity-60">{format(new Date(order.date), 'HH:mm', { locale: zhCN })}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1 max-w-[180px] mx-auto">
                            <p className={`text-xs font-medium leading-relaxed transition-all ${
                              isReturned ? 'text-muted-foreground/40 line-through' : 'text-foreground'
                            }`} title={displayNote}>
                              {displayNote || <span className="opacity-20 transition-opacity">未填写备注</span>}
                            </p>
                            {isReturned && returnReason && (
                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-destructive/5 text-destructive/60 rounded text-[9px] font-bold border border-destructive/5 self-center whitespace-nowrap">
                                <AlertCircle size={8} />
                                理由: {returnReason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center -space-x-3 transition-transform group-hover:-space-x-1 duration-300">
                            {order.items.slice(0, 3).map((item: OutboundOrderItem) => (
                              <div 
                                key={item.id} 
                                className={`relative h-9 w-9 rounded-xl border-2 bg-muted overflow-hidden shadow-sm transition-all ${
                                  isReturned ? 'border-muted-foreground/10 grayscale' : 'border-white dark:border-gray-900 ring-1 ring-black/5'
                                }`}
                                title={`${item.product?.name || "未知商品"} x ${item.quantity}`}
                              >
                                {item.product?.image ? (
                                  <Image src={item.product.image} alt={item.product.name || ""} fill className="object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                    <Package size={14} />
                                  </div>
                                )}
                              </div>
                            ))}
                            {order.items.length > 3 && (
                              <div className={`h-9 w-9 rounded-xl border-2 flex items-center justify-center text-[10px] font-bold shadow-sm transition-all ${
                                isReturned ? 'bg-muted/50 text-muted-foreground/30 border-muted-foreground/10' : 'bg-muted text-muted-foreground border-white dark:border-gray-900'
                              }`}>
                                +{order.items.length - 3}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className={`flex flex-col items-center transition-colors ${isReturned ? 'text-muted-foreground/30' : 'text-foreground'}`}>
                            <span className="text-sm font-black tabular-nums">
                              {order.items.reduce((acc: number, item: OutboundOrderItem) => acc + item.quantity, 0)}
                            </span>
                            <span className="text-[10px] opacity-60 font-medium">件商品</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex justify-center items-center gap-1">
                            {!isReturned ? (
                              <button 
                                onClick={() => handleReturn(order.id)}
                                className="p-2.5 rounded-2xl text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 active:scale-90"
                                title="退货入库 (执行对冲)"
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
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          ) : (
            <div className="py-32 flex flex-col items-center justify-center text-center">
              <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
                <History size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-foreground">暂无出库记录</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-[280px]">点击右上角“新增出库申请”开始记录。</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View (Updated for aesthetic consistency) */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-20 px-1">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
             <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground/50">
                <div className="w-8 h-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium tracking-widest uppercase opacity-50">Loading</p>
             </div>
          ) : filteredOrders.length > 0 ? (
            filteredOrders.map((order) => {
              // @ts-expect-error - status property is available but not in base type
              const isReturned = order.status === 'Returned';
              const noteParts = order.note?.match(/^(.*)\s*\(已退回:\s*(.*)\)$/);
              const displayNote = noteParts ? noteParts[1] : (order.note || "");
              const returnReason = noteParts ? noteParts[2] : (isReturned ? "常规退回" : null);

              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`rounded-4xl border border-border shadow-sm p-5 space-y-4 transition-all duration-500 ${
                    isReturned ? 'bg-muted/5 opacity-60 grayscale-[0.5]' : 'bg-white dark:bg-white/5 active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase ${
                        order.type === 'Sale' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                        order.type === 'Sample' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                        'bg-orange-500/10 text-orange-500 border-orange-500/20'
                      }`}>
                        {order.type === 'Sale' ? '销售' : order.type === 'Sample' ? '领用' : order.type === 'Return' ? '退货' : '损耗'}
                      </span>
                      {isReturned && (
                          <span className="text-[10px] font-bold text-destructive px-2 py-0.5 bg-destructive/5 rounded-md border border-destructive/10">已对冲</span>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground/40">#{order.id.slice(-4).toUpperCase()}</span>
                    </div>
                    {!isReturned && (
                      <button 
                          onClick={() => handleReturn(order.id)}
                          className="p-2.5 text-orange-600 bg-orange-500/5 rounded-2xl border border-orange-500/10 active:scale-90 transition-transform"
                      >
                          <RotateCcw size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1 pr-4">
                      <p className={`text-sm font-bold line-clamp-1 transition-all ${
                        isReturned ? 'text-muted-foreground/40 line-through' : 'text-foreground font-bold'
                      }`}>
                          {displayNote || "未填写备注"}
                      </p>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] mt-1 font-medium opacity-60">
                        <History size={10} />
                        {format(new Date(order.date), 'MM-dd HH:mm', { locale: zhCN })}
                      </div>
                      {isReturned && returnReason && (
                        <p className="text-[9px] font-bold text-destructive/50 mt-1 flex items-center gap-1 uppercase tracking-tighter">
                          <AlertCircle size={8} /> Reason: {returnReason}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black tabular-nums transition-colors ${isReturned ? 'text-muted-foreground/30' : 'text-foreground'}`}>
                        {order.items.reduce((acc: number, item: OutboundOrderItem) => acc + item.quantity, 0)} 
                        <span className="text-[10px] font-normal text-muted-foreground ml-0.5">件</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex -space-x-2.5">
                    {order.items.slice(0, 5).map((item: OutboundOrderItem) => (
                      <div 
                        key={item.id} 
                        className={`relative h-10 w-10 rounded-[1.2rem] border-2 bg-muted overflow-hidden shadow-sm transition-all ${
                          isReturned ? 'border-muted-foreground/5 grayscale-[0.8]' : 'border-white dark:border-gray-900 ring-1 ring-black/5'
                        }`}
                      >
                        {item.product?.image ? (
                          <Image src={item.product.image} alt={item.product.name || ""} fill className="object-cover" />
                        ) : (
                          <Package className="w-full h-full p-2.5 text-muted-foreground/20" />
                        )}
                      </div>
                    ))}
                    {order.items.length > 5 && (
                      <div className={`h-10 w-10 rounded-[1.2rem] border-2 flex items-center justify-center text-[10px] font-black shadow-sm ${
                        isReturned ? 'bg-muted/30 text-muted-foreground/20 border-muted-foreground/5' : 'bg-muted text-muted-foreground border-white dark:border-gray-900 ring-1 ring-black/5'
                      }`}>
                        +{order.items.length - 5}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="py-20 text-center">
              <p className="text-muted-foreground text-sm">暂无记录</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <OutboundModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOutbound}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
      />
    </div>
  );
}
