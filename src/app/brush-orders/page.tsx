"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, Search, Calendar, ShoppingBag, Upload, Download, Check, X as ClearIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrushOrderModal } from "@/components/BrushOrders/BrushOrderModal";
import { ImportModal } from "@/components/Goods/ImportModal";
import { BrushOrder } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { formatLocalDateTime } from "@/lib/dateUtils";
import * as XLSX from "xlsx";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionBar } from "@/components/ui/ActionBar";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { pinyinMatch } from "@/lib/pinyin";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export default function BrushOrdersPage() {
  const { showToast } = useToast();
  const { user } = useUser();
  const canBrush = hasPermission(user as SessionUser | null, "brush:create");
  const [orders, setOrders] = useState<BrushOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<BrushOrder | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: "danger" | "warning" | "info";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [selectedType, setSelectedType] = useState("全部");

   const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const query = searchQuery.trim();
      
      // 1. 搜索筛选 (当 query 为空时 pinyinMatch 会返回 true)
      const matchesSearch = !query || (
          pinyinMatch(o.id, query) ||
          pinyinMatch(o.type, query) ||
          pinyinMatch(o.note || "", query) ||
          o.items.some(i => i.product?.name && pinyinMatch(i.product.name, query)) 
      );

      // 2. 平台筛选
      const matchesType = selectedType === "全部" || o.type === selectedType;

      // 3. 日期筛选
      let matchesDate = true;
      if (startDate || endDate) {
          const orderDate = typeof o.date === 'string' ? parseISO(o.date) : o.date;
          const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
          const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
          matchesDate = isWithinInterval(orderDate, { start, end });
      }

      return matchesSearch && matchesType && matchesDate;
    });
  }, [orders, searchQuery, startDate, endDate, selectedType]);

  const stats = useMemo(() => {
    return filteredOrders.reduce((acc, curr) => ({
      count: acc.count + 1,
      payment: acc.payment + curr.paymentAmount,
      received: acc.received + curr.receivedAmount,
      commission: acc.commission + curr.commission,
    }), { count: 0, payment: 0, received: 0, commission: 0 });
  }, [filteredOrders]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/brush-orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data || []); 
      }
    } catch (error) {
      console.error("Failed to fetch brush orders:", error);
      showToastRef.current("加载失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

  const handleCreate = () => {
    setEditingOrder(null);
    setReadOnly(false);
    setIsModalOpen(true);
  };

  const handleEdit = (order: BrushOrder) => {
    setEditingOrder(order);
    setReadOnly(false);
    setIsModalOpen(true);
  };

  const handleSave = async (data: BrushOrder) => {
    try {
      const isEdit = !!editingOrder;
      const url = isEdit ? `/api/brush-orders/${editingOrder.id}` : "/api/brush-orders";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        fetchData();
        showToast(isEdit ? "订单已更新" : "订单已创建", "success");
        setIsModalOpen(false);
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || "保存失败", "error");
      }
    } catch (error) {
      console.error("Save failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除订单",
      message: "确定要删除此订单吗？此操作不可恢复。",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/brush-orders/${id}`, { method: "DELETE" });
          if (res.ok) {
            fetchData();
            showToast("订单已删除", "success");
            setIsModalOpen(false);
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            showToast("删除失败", "error");
          }
        } catch (error) {
          console.error("Delete failed:", error);
          showToast("网络错误", "error");
        }
      },
    });
  };

  const handleBatchDelete = async () => {
    const count = selectedIds.length;
    setConfirmConfig({
      isOpen: true,
      title: "批量删除",
      message: `确定要删除选中的 ${count} 个订单吗？此操作不可恢复。`,
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/brush-orders/batch", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedIds }),
          });
          if (res.ok) {
            showToast(`成功删除 ${count} 个记录`, "success");
            setSelectedIds([]);
            fetchData();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            const errorData = await res.json().catch(() => ({}));
            showToast(errorData.error || "批量删除失败", "error");
          }
        } catch (error) {
          console.error("Batch delete failed:", error);
          showToast("网络错误", "error");
        }
      },
    });
  };

  const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleExport = useCallback(() => {
    if (filteredOrders.length === 0) {
      showToast("暂无数据可导出", "info");
      return;
    }

    const dataToExport = filteredOrders.map((o, index) => {
      const date = typeof o.date === 'string' ? parseISO(o.date) : o.date;
      const formattedDate = date instanceof Date && !isNaN(date.getTime()) 
        ? date.toISOString().split('T')[0] 
        : String(o.date);

      return {
        "序号": index + 1,
        "日期": formattedDate,
        "类型": o.type,
        "商品": o.items.map(i => i.product?.name).join(", "),
        "实付": o.paymentAmount,
        "到手金额": o.receivedAmount,
        "佣金": o.commission,
        "备注": o.note,
      };
    });

    // Wrap in setTimeout to allow click state/animations to settle and avoid UI blocking "shudder"
    setTimeout(() => {
      try {
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "刷单记录");
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
        XLSX.writeFile(wb, `刷单记录_${timestamp}.xlsx`);
        showToast("导出成功");
      } catch (error) {
        console.error("Export failed:", error);
        showToast("导出失败", "error");
      }
    }, 0);
  }, [filteredOrders, showToast]);

  const handleImport = async (data: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!Array.isArray(data)) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/brush-orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (res.ok) {
        showToast(`导入完成: 成功 ${result.success} 条, 失败 ${result.failed} 条`);
        fetchData();
      } else {
        showToast(result.error || "导入失败", "error");
      }
    } catch {
      showToast("系统错误", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val && endDate && parseISO(val) > parseISO(endDate)) {
      setEndDate(val);
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (val && startDate && parseISO(val) < parseISO(startDate)) {
      setStartDate(val);
    }
  };



  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">刷单管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">管理刷单记录及佣金统计。</p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
           {canBrush && (
             <div className="flex items-center gap-1 sm:gap-2">
              <button 
                  onClick={() => setIsImportModalOpen(true)}
                  className="h-9 w-9 sm:w-auto sm:h-10 flex items-center justify-center gap-2 rounded-full border border-border bg-white dark:bg-white/5 sm:px-4 text-xs font-bold text-foreground hover:bg-muted transition-all"
                  title="导入"
              >
                  <Upload size={16} className="sm:size-[18px]" />
                  <span className="hidden sm:inline">导入</span>
              </button>
              <button 
                  onClick={handleExport}
                  className="h-9 w-9 sm:w-auto sm:h-10 flex items-center justify-center gap-2 rounded-full border border-border bg-white dark:bg-white/5 sm:px-4 text-xs font-bold text-foreground hover:bg-muted transition-all"
                  title="导出"
              >
                  <Download size={16} className="sm:size-[18px]" />
                  <span className="hidden sm:inline">导出</span>
              </button>
             </div>
           )}
           
          {canBrush && (
            <button 
              onClick={handleCreate}
              className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all shrink-0"
            >
              <Plus size={16} className="md:w-[18px] md:h-[18px]" />
               <span className="hidden sm:inline">新建刷单</span>
               <span className="inline sm:hidden">新建</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "总单数", value: stats.count, color: "text-blue-500", suffix: "单" },
          { label: "总实付", value: stats.payment, color: "" },
          { label: "总到手", value: stats.received, color: "text-emerald-500" },
          { label: "总佣金", value: stats.commission, color: "text-orange-500" },
        ].map((s, idx) => (
          <div key={idx} className={`bg-white dark:bg-white/5 p-4 rounded-3xl border border-border shadow-sm flex flex-col justify-center col-span-1`}>
            <p className="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-lg md:text-2xl font-mono font-bold mt-0.5 ${s.color || "text-foreground"}`}>
                {s.label === "总单数" ? "" : "¥"}{typeof s.value === 'number' && !s.suffix ? s.value.toFixed(2) : s.value}{s.suffix || ""}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 md:mb-8">
        <div className="h-10 sm:h-11 px-5 w-full md:flex-1 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="搜索记录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
          />
          {searchQuery && (
            <button
                onClick={() => setSearchQuery("")}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
                <ClearIcon size={16} />
            </button>
          )}
        </div>
        <div className="w-full sm:w-32 md:w-40 shrink-0 h-10">
            <CustomSelect
                value={selectedType}
                onChange={setSelectedType}
                options={[
                  { value: "全部", label: "全部平台" },
                  { value: "淘宝", label: "淘宝" },
                  { value: "京东", label: "京东" },
                  { value: "拼多多", label: "拼多多" },
                  { value: "抖音", label: "抖音" },
                  { value: "快手", label: "快手" },
                  { value: "美团", label: "美团" }
                ]}
                placeholder="全部平台"
                className="h-full"
                triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 shadow-sm"
            />
        </div>
        <div className="flex flex-nowrap items-center gap-2 h-10">
            <DatePicker 
                value={startDate} 
                onChange={handleStartDateChange} 
                maxDate={endDate}
                placeholder="开始" 
                className="h-full flex-1 min-w-0 md:w-36 md:flex-none"
                triggerClassName="rounded-full shadow-sm"
                isCompact
                align="left"
            />
            <span className="text-muted-foreground text-xs shrink-0 font-medium px-1">至</span>
            <DatePicker 
                value={endDate} 
                onChange={handleEndDateChange} 
                minDate={startDate}
                placeholder="结束" 
                className="h-full flex-1 min-w-0 md:w-36 md:flex-none"
                triggerClassName="rounded-full shadow-sm"
                isCompact
                align="right"
            />
        </div>
      </div>

      {/* Table */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
        <div className="overflow-auto">
          {isLoading && (
              <div className="p-8 text-center text-muted-foreground">加载中...</div>
          )}
          {!isLoading && (
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-4 w-12">
                   <div className="flex justify-center">
                    <button 
                      onClick={() => {
                        if (selectedIds.length === filteredOrders.length) {
                          setSelectedIds([]);
                        } else {
                          setSelectedIds(filteredOrders.map(o => o.id));
                        }
                      }}
                      className={cn(
                        "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                        filteredOrders.length > 0 && selectedIds.length === filteredOrders.length
                        ? "bg-foreground border-foreground text-background scale-110" 
                        : "border-muted-foreground/30 hover:border-foreground/50"
                      )}
                    >
                      {filteredOrders.length > 0 && selectedIds.length === filteredOrders.length && (
                        <Check size={12} strokeWidth={4} />
                      )}
                    </button>
                   </div>
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-left">商品</th>
                 <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">日期</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">平台</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">实付</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center text-emerald-500">到手</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center text-orange-500">佣金</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredOrders.map(order => (
                   <motion.tr 
                    key={order.id}
                    layout
                    onClick={() => handleEdit(order)}
                    className={`hover:bg-muted/20 transition-colors cursor-pointer group ${selectedIds.includes(order.id) ? 'bg-primary/5' : ''}`}
                   >
                      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <button 
                            onClick={() => toggleSelect(order.id)}
                            className={cn(
                                "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                                selectedIds.includes(order.id)
                                ? "bg-foreground border-foreground text-background scale-110" 
                                : "border-muted-foreground/30 hover:border-foreground/50"
                            )}
                          >
                            {selectedIds.includes(order.id) && (
                                <Check size={12} strokeWidth={4} />
                            )}
                          </button>
                        </div>
                      </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 border dark:border-white/10 overflow-hidden shrink-0 relative">
                                {order.items[0]?.product?.image ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                 <img src={order.items[0].product.image} className="w-full h-full object-cover" alt="Product" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                        <ShoppingBag size={16} />
                                    </div>
                                )}
                                {order.items.length > 1 && (
                                    <div className="absolute top-0 right-0 bg-primary/90 text-primary-foreground text-[8px] font-bold px-1 rounded-bl-md shadow-sm">
                                        {order.items.length}
                                    </div>
                                )}
                            </div>
                            <p className="text-sm font-medium line-clamp-1 max-w-[200px]" title={order.items.map(i => i.product?.name).join("\n")}>
                                {order.items[0]?.product?.name || "未绑定商品"}
                                {order.items.length > 1 && <span className="text-muted-foreground ml-1 text-xs">等{order.items.length}件</span>}
                            </p>
                        </div>
                     </td>
                     <td className="px-6 py-4 text-sm font-mono text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                            <Calendar size={14} />
                            {formatLocalDateTime(order.date)}
                        </div>
                     </td>
                     <td className="px-6 py-4 text-center">
                         <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold border border-blue-500/20">
                             {order.type}
                         </span>
                     </td>
                     <td className="px-6 py-4 font-mono font-medium text-center text-sm">¥{order.paymentAmount.toFixed(2)}</td>
                     <td className="px-6 py-4 font-mono font-bold text-emerald-500 text-center text-sm">¥{order.receivedAmount.toFixed(2)}</td>
                     <td className="px-6 py-4 font-mono font-bold text-orange-500 text-center text-sm">¥{order.commission.toFixed(2)}</td>
                     <td className="px-6 py-4 text-center">
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-[150px] mx-auto" title={order.note}>
                            {order.note || "-"}
                        </p>
                     </td>
                   </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          )}
          {filteredOrders.length === 0 && !isLoading && (
              <div className="py-12 flex flex-col items-center justify-center text-center text-muted-foreground">
                  <ShoppingBag size={48} className="mb-4 opacity-20" />
                  <p>暂无记录</p>
              </div>
          )}
        </div>
      </div>

       <div className="md:hidden rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
         <div className="p-3 space-y-3">
           {filteredOrders.map(order => (
               <div 
                key={order.id} 
                onClick={() => handleEdit(order)}
                className={`bg-white/50 dark:bg-white/5 p-3 rounded-2xl border border-border/50 shadow-sm space-y-3 cursor-pointer active:scale-[0.98] transition-all relative overflow-hidden ${selectedIds.includes(order.id) ? 'ring-2 ring-primary ring-inset' : ''}`}
               >
                   {/* Mobile selection overlay - Moved to top-right to avoid blocking content */}
                   <div 
                    className="absolute top-2.5 left-2.5 z-10"
                    onClick={(e) => toggleSelect(order.id, e)}
                   >
                      <button 
                        className={cn(
                            "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                            selectedIds.includes(order.id)
                            ? "bg-foreground border-foreground text-background scale-110" 
                            : "bg-black/20 dark:bg-black/40 backdrop-blur-md border-white/40 hover:border-white/60"
                        )}
                      >
                        {selectedIds.includes(order.id) && (
                          <Check size={12} strokeWidth={4} />
                        )}
                      </button>
                   </div>
                     <div className="flex gap-3">
                                 <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-white/5 border dark:border-white/10 overflow-hidden shrink-0 relative">
                                     {order.items[0]?.product?.image ? (
                                         /* eslint-disable-next-line @next/next/no-img-element */
                                          <img src={order.items[0].product.image} className="w-full h-full object-cover" alt="Product" />
                                     ) : (
                                         <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                             <ShoppingBag size={24} />
                                         </div>
                                     )}
                                     {order.items.length > 1 && (
                                         <div className="absolute top-0 right-0 bg-primary/90 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-bl-xl shadow-md border-l border-b border-primary-foreground/20">
                                             {order.items.length}
                                         </div>
                                     )}
                                 </div>
                                 <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                      <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1 text-muted-foreground text-[10px] font-mono">
                                              <Calendar size={12} />
                                              {formatLocalDateTime(order.date)}
                                          </div>
                                          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[9px] font-bold border border-primary/20 uppercase tracking-tighter">
                                              {order.type}
                                          </span>
                                      </div>
                                      <div>
                                          <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">
                                               {order.items[0]?.product?.name || "未绑定商品"}
                                               {order.items.length > 1 && <span className="text-muted-foreground font-normal ml-1 text-[11px]">等{order.items.length}件</span>}
                                          </p>
                                          {order.note && (
                                              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 opacity-60">
                                                  &quot;{order.note}&quot;
                                              </p>
                                          )}
                                      </div>
                                 </div>
                     </div>

                    <div className="flex items-center justify-between pt-2.5 border-t border-border/10">
                        <div className="flex-1">
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight opacity-60 font-mono">实付</p>
                            <p className="font-mono text-xs font-bold mt-0.5">¥{order.paymentAmount.toFixed(2)}</p>
                        </div>
                        <div className="flex-1 text-center border-x border-border/10">
                            <p className="text-[9px] uppercase text-emerald-500 font-bold tracking-tight">到手</p>
                            <p className="font-mono text-xs text-emerald-500 font-bold mt-0.5">¥{order.receivedAmount.toFixed(2)}</p>
                        </div>
                        <div className="flex-1 text-right">
                            <p className="text-[9px] uppercase text-orange-500 font-bold tracking-tight">佣金</p>
                            <p className="font-mono text-xs text-orange-500 font-bold mt-0.5">¥{order.commission.toFixed(2)}</p>
                        </div>
                    </div>
               </div>
           ))}
           {filteredOrders.length === 0 && !isLoading && (
               <div className="py-20 flex flex-col items-center justify-center text-center text-muted-foreground">
                   <ShoppingBag size={48} className="mb-4 opacity-10" />
                   <p className="text-sm font-medium">暂无刷单记录</p>
               </div>
           )}
         </div>
       </div>

      <BrushOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        onDelete={handleDelete}
        initialData={editingOrder}
        readOnly={readOnly}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant={confirmConfig.variant}
        confirmLabel="确认删除"
      />

      <ActionBar 
        selectedCount={selectedIds.length}
        totalCount={filteredOrders.length}
        onToggleSelectAll={() => {
          if (selectedIds.length === filteredOrders.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredOrders.map(o => o.id));
          }
        }}
        onClear={() => setSelectedIds([])}
        onDelete={canBrush ? handleBatchDelete : undefined}
        label="个订单"
      />
    <ImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImport}
        title="导入刷单记录"
        description="系统将根据 SKU 自动匹配商品"
        templateFileName="刷单记录导入模版.xlsx"
        templateData={[
          {
            "*日期": "2024-01-01",
            "*类型": "淘宝",
            "*SKU": "SKU001",
            "数量": 1,
            "*实付": 95.00,
            "到手金额": 100.00,
            "佣金": 5.00,
            "备注": "示例模版数据"
          }
        ]}
      />
    </div>
  );
}
