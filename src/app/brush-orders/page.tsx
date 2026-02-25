"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { Plus, Search, Calendar, ShoppingBag, Upload, Download, Check, X as ClearIcon, ChevronDown, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrushOrderModal } from "@/components/BrushOrders/BrushOrderModal";
import { ImportModal } from "@/components/Goods/ImportModal";
import { BatchRecognitionModal } from "@/components/BrushOrders/BatchRecognitionModal";
import { BatchEditOrderModal } from "@/components/BrushOrders/BatchEditOrderModal";
import { BrushOrder } from "@/lib/types";
import { formatLocalDateTime, formatLocalDate } from "@/lib/dateUtils";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { cn } from "@/lib/utils";
import { ActionBar } from "@/components/ui/ActionBar";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { pinyinMatch } from "@/lib/pinyin";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";

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
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<import("@/lib/types").Product[]>([]);
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
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  
  const toggleDateExpansion = (date: string, e?: React.MouseEvent) => {
    const nextValue = expandedDate === date ? null : date;
    setExpandedDate(nextValue);
    
    // 如果是展开操作且有事件触发
    if (nextValue && e) {
        const target = e.currentTarget as HTMLElement;
        // 使用坐标计算替代 scrollIntoView，绕过浏览器的默认行为干扰
        const scrollTarget = () => {
            const rect = target.getBoundingClientRect();
            const absoluteTop = rect.top + window.scrollY - 85; // 85px 是顶部偏移量
            window.scrollTo({
                top: absoluteTop,
                behavior: 'smooth'
            });
        };

        // 第一次立即尝试滚动到大概位置
        scrollTarget();

        // 在内容展开过程中和完成后进行两次校准，应对布局高度的动态变化
        setTimeout(scrollTarget, 100);
        setTimeout(scrollTarget, 300);
    }
  };

  const hasActiveFilters = searchQuery !== "" || selectedType !== "全部" || startDate !== "" || endDate !== "";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedType("全部");
    setStartDate("");
    setEndDate("");
  };

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

  const groupedOrders = useMemo(() => {
    const groups: { 
        date: string; 
        orders: (BrushOrder & { globalIndex: number })[]; 
        dailyStats: { count: number; payment: number; received: number; commission: number };
    }[] = [];
    
    filteredOrders.forEach(order => {
      const dateStr = formatLocalDate(order.date);
      let group = groups.find(g => g.date === dateStr);
      if (!group) {
        group = { 
          date: dateStr, 
          orders: [], 
          dailyStats: { count: 0, payment: 0, received: 0, commission: 0 } 
        };
        groups.push(group);
      }
      group.orders.push(order as BrushOrder & { globalIndex: number });
      group.dailyStats.count++;
      group.dailyStats.payment += order.paymentAmount;
      group.dailyStats.received += order.receivedAmount;
      group.dailyStats.commission += order.commission;
    });

    // 对每个组内的订单进行时间升序排序（早的在前），重新编号
    groups.forEach(group => {
      group.orders.sort((a, b) => {
        const timeA = typeof a.date === 'string' ? new Date(a.date).getTime() : a.date.getTime();
        const timeB = typeof b.date === 'string' ? new Date(b.date).getTime() : b.date.getTime();
        return timeA - timeB; // 升序：早的排前面
      });
      group.orders.forEach((order, index) => {
         order.globalIndex = index + 1; // 每天从 1 开始
      });
    });

    return groups;
  }, [filteredOrders]);

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
      const res = await fetch("/api/brush-orders?limit=1000");
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
    // 增加商品加载逻辑供批量识别使用
    fetch("/api/products?pageSize=1000")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.items)) {
          setProducts(data.items);
        } else if (Array.isArray(data)) {
          setProducts(data);
        }
      })
      .catch(console.error);
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

   const handleSave = async (data: Partial<BrushOrder>) => {
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

  const handleBatchEdit = async (data: { commission?: number; note?: string }) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/brush-orders/batch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, updates: data }),
      });
      if (res.ok) {
        showToast(`批量修改成功`, "success");
        setSelectedIds([]);
        fetchData();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || "批量修改失败", "error");
      }
    } catch (error) {
      console.error("Batch edit failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsLoading(false);
      setIsBatchEditModalOpen(false);
    }
  };

  const toggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const toggleGroupSelect = useCallback((groupIds: string[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const allSelected = groupIds.length > 0 && groupIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !groupIds.includes(id));
      } else {
        return Array.from(new Set([...prev, ...groupIds]));
      }
    });
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
    setTimeout(async () => {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const { saveAs } = await import("file-saver");
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("刷单记录");

        if (dataToExport.length > 0) {
          const headers = Object.keys(dataToExport[0]);
          const headerRow = worksheet.addRow(headers);
          headerRow.font = { bold: true };
          
          dataToExport.forEach(data => {
            worksheet.addRow(headers.map(h => data[h as keyof typeof data]));
          });

          worksheet.eachRow((row) => {
            row.eachCell((cell) => {
              cell.font = { ...cell.font, name: '微软雅黑' };
            });
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const timestamp = formatLocalDate(new Date());
        saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `刷单记录_${timestamp}.xlsx`);
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
    <div className="space-y-8">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 uppercase">
        {[
          { label: "总单数", value: stats.count, color: "from-blue-500/10 to-transparent", textColor: "text-blue-500", icon: <ShoppingBag size={20} />, suffix: "单" },
          { label: "总实付", value: stats.payment, color: "from-slate-500/10 to-transparent", textColor: "text-foreground", icon: <Search size={20} /> },
          { label: "总到手", value: stats.received, color: "from-emerald-500/10 to-transparent", textColor: "text-emerald-500", icon: <Check size={20} /> },
          { label: "总佣金", value: stats.commission, color: "from-orange-500/10 to-transparent", textColor: "text-orange-500", icon: <Plus size={20} /> },
        ].map((s, idx) => (
          <div key={idx} className={`relative overflow-hidden bg-white dark:bg-white/5 p-4 rounded-2xl sm:rounded-3xl border border-border/50 shadow-sm flex flex-col justify-center min-h-[84px] transition-all hover:shadow-md hover:border-border`}>
            {/* 背景装饰图标 */}
            <div className={`absolute -right-2 -bottom-2 opacity-[0.03] dark:opacity-[0.05] ${s.textColor}`}>
                {s.icon}
            </div>
            
            <p className="text-[10px] sm:text-xs font-bold text-muted-foreground tracking-wider mb-1">{s.label}</p>
            <p className={`text-xl sm:text-2xl font-black font-number ${s.textColor}`}>
                {s.label === "总单数" ? "" : "¥"}{typeof s.value === 'number' && !s.suffix ? s.value.toFixed(2) : s.value}{s.suffix || ""}
            </p>
          </div>
        ))}
      </div>

      {/* Filters - Single row on PC */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6 md:mb-8">
        {/* Search & Platform */}
        <div className="flex items-center gap-2 flex-1">
          <div className="h-10 sm:h-11 px-5 flex-1 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm relative">
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
          
          <div className="w-28 sm:w-36 shrink-0 h-10 sm:h-11">
              <CustomSelect
                  value={selectedType}
                  onChange={setSelectedType}
                  options={[
                    { value: "全部", label: "全部平台" },
                    { value: "美团", label: "美团" },
                    { value: "淘宝", label: "淘宝" },
                    { value: "京东", label: "京东" }
                  ]}
                  placeholder="全部平台"
                  className="h-full"
                  triggerClassName={cn(
                      "h-full rounded-full border shadow-sm transition-all text-sm",
                      selectedType !== "全部" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5"
                  )}
              />
          </div>
        </div>

        {/* Date Range & Reset */}
        <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="flex-1 flex items-center gap-1.5 h-10 sm:h-11">
                <DatePicker 
                    value={startDate} 
                    onChange={handleStartDateChange} 
                    maxDate={endDate}
                    placeholder="开始日期" 
                    className="h-full flex-1 sm:flex-initial sm:w-36 md:w-40 lg:w-32 xl:w-40"
                    triggerClassName={cn(
                        "h-full rounded-full shadow-sm transition-all",
                        startDate && "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30"
                    )}
                    isCompact={false}
                />
                <span className="text-muted-foreground text-xs shrink-0 font-medium">至</span>
                <DatePicker 
                    value={endDate} 
                    onChange={handleEndDateChange} 
                    minDate={startDate}
                    placeholder="结束日期" 
                    className="h-full flex-1 sm:flex-initial sm:w-36 md:w-40 lg:w-32 xl:w-40"
                    triggerClassName={cn(
                        "h-full rounded-full shadow-sm transition-all",
                        endDate && "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30"
                    )}
                    isCompact={false}
                />
            </div>

            {hasActiveFilters && (
                <button
                    onClick={resetFilters}
                    className="h-10 sm:h-11 w-10 sm:w-11 flex items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0"
                    title="重置筛选"
                >
                    <RotateCcw size={16} />
                </button>
            )}
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
            {/* <thead className="hidden"> */}
            {/* 全局表头已隐藏，改为在展开项内显示 */}
            {/* </thead> */}
             <tbody className="divide-y divide-border/50">
                 {groupedOrders.map((group) => (
                     <Fragment key={group.date}>
                         <tr 
                            className="bg-muted/15 border-y border-border/50 cursor-pointer hover:bg-muted/25 transition-all sticky top-0 z-10 backdrop-blur-sm shadow-sm scroll-mt-20"
                            onClick={(e) => toggleDateExpansion(group.date, e)}
                         >
                             <td className="px-4 py-2.5 w-12" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex justify-center">
                                     <button 
                                       onClick={(e) => toggleGroupSelect(group.orders.map(o => o.id), e)}
                                       className={cn(
                                           "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer",
                                           group.orders.length > 0 && group.orders.every(o => selectedIds.includes(o.id))
                                           ? "bg-foreground border-foreground text-background scale-110" 
                                           : "border-muted-foreground/30 hover:border-foreground/50 bg-white dark:bg-black"
                                       )}
                                       title="全选本日订单"
                                     >
                                       {group.orders.length > 0 && group.orders.every(o => selectedIds.includes(o.id)) && (
                                           <Check size={12} strokeWidth={4} />
                                       )}
                                     </button>
                                 </div>
                             </td>
                             <td colSpan={4} className="py-2.5 px-3">
                                 <div className="flex items-center gap-2">
                                     <div 
                                        className={cn(
                                            "flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-white/10 border border-border/50 text-muted-foreground hover:text-primary transition-all duration-300",
                                            expandedDate === group.date && "rotate-0",
                                            expandedDate !== group.date && "-rotate-90 text-primary"
                                        )}
                                      >
                                         <ChevronDown size={14} />
                                     </div>
                                     <span className="text-sm font-black text-foreground tracking-tight ml-1">{group.date}</span>
                                     <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-white/10 border border-border/50 text-[10px] font-bold text-muted-foreground">
                                        {group.dailyStats.count} 单
                                     </span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">实付</span>
                                    <span className="text-xs font-mono font-bold text-foreground">¥{group.dailyStats.payment.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">到手</span>
                                    <span className="text-xs font-mono font-bold text-emerald-500">¥{group.dailyStats.received.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">佣金</span>
                                    <span className="text-xs font-mono font-bold text-orange-500">¥{group.dailyStats.commission.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center"></td>
                         </tr>
                         {expandedDate === group.date && (
                             <>
                                 <tr className="border-b border-border/30 bg-muted/10">
                                     <th className="px-4 py-3"></th>
                                     <th className="px-3 py-3 text-xs font-bold text-muted-foreground uppercase text-center">#</th>
                                     <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-left">商品</th>
                                     <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center">时间</th>
                                     <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center">平台</th>
                                     <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center">实付</th>
                                     <th className="px-6 py-3 text-xs font-bold text-emerald-500 uppercase text-center">到手</th>
                                     <th className="px-6 py-3 text-xs font-bold text-orange-500 uppercase text-center">佣金</th>
                                     <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center">备注</th>
                                 </tr>
                                 {group.orders.map(order => (
                            <tr 
                             key={order.id}
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
                               <td className="px-3 py-4 text-center">
                                   <span className="text-[10px] font-mono font-bold text-muted-foreground/50 group-hover:text-primary transition-colors">
                                       {String(order.globalIndex).padStart(2, '0')}
                                   </span>
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
                              <td className="px-6 py-4 text-sm font-mono text-muted-foreground whitespace-nowrap text-center">
                                 {formatLocalDateTime(order.date).split(' ')[1]}
                              </td>
                              <td className="px-6 py-4 text-center">
                                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold border border-blue-500/20">
                                      {order.type}
                                  </span>
                              </td>
                              <td className="px-6 py-4 font-number font-medium text-center text-sm">¥{order.paymentAmount.toFixed(2)}</td>
                              <td className="px-6 py-4 font-number font-bold text-emerald-500 text-center text-sm">¥{order.receivedAmount.toFixed(2)}</td>
                              <td className="px-6 py-4 font-number font-bold text-orange-500 text-center text-sm">¥{order.commission.toFixed(2)}</td>
                              <td className="px-6 py-4 text-center">
                                 <p className="text-xs text-muted-foreground line-clamp-1 max-w-[150px] mx-auto" title={order.note}>
                                     {order.note || "-"}
                                  </p>
                              </td>
                            </tr>
                                 ))}
                             </>
                         )}
                     </Fragment>
                 ))}
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
          <div className="p-3 space-y-6">
            {groupedOrders.map((group) => (
                <div key={group.date} className="space-y-3">
                    <div 
                        className="flex items-center justify-between px-3 py-3 bg-muted/20 dark:bg-white/5 rounded-2xl active:scale-[0.98] transition-all border border-border/40 shadow-sm scroll-mt-20"
                        onClick={(e) => toggleDateExpansion(group.date, e)}
                    >
                        <div className="flex items-center gap-3">
                            <button 
                              onClick={(e) => toggleGroupSelect(group.orders.map(o => o.id), e)}
                              className={cn(
                                  "relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center shrink-0 cursor-pointer",
                                  group.orders.length > 0 && group.orders.every(o => selectedIds.includes(o.id))
                                  ? "bg-foreground border-foreground text-background scale-110" 
                                  : "bg-black/10 border-black/20 dark:bg-black/30 dark:border-white/30 hover:border-black/40 dark:hover:border-white/50"
                              )}
                            >
                              {group.orders.length > 0 && group.orders.every(o => selectedIds.includes(o.id)) && (
                                  <Check size={14} strokeWidth={4} />
                              )}
                            </button>
                            <div className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-white/10 border border-border/50 text-primary shadow-sm transition-transform duration-300",
                                expandedDate === group.date ? "rotate-0" : "-rotate-90"
                            )}>
                                <ChevronDown size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-foreground tracking-tight">{group.date}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary uppercase">
                                        {group.dailyStats.count}单
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold">实付</span>
                                <span className="text-xs font-mono font-bold text-foreground">¥{group.dailyStats.payment.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold">到手</span>
                                <span className="text-xs font-mono font-bold text-emerald-500">¥{group.dailyStats.received.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {expandedDate === group.date && (
                        <div className="overflow-hidden space-y-3">
                            {group.orders.map(order => (
                                <div 
                                    key={order.id} 
                                    onClick={() => handleEdit(order)}
                                    className={cn(
                                        "bg-white/50 dark:bg-white/5 p-3.5 rounded-2xl border border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all relative overflow-hidden",
                                        selectedIds.includes(order.id) ? 'ring-2 ring-primary ring-inset' : ''
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* 选择框 */}
                                        <div 
                                            className="shrink-0"
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

                                        <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-white/5 border dark:border-white/10 overflow-hidden shrink-0 relative">
                                            {order.items[0]?.product?.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={order.items[0].product.image} className="w-full h-full object-cover" alt="Product" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                                    <ShoppingBag size={22} />
                                                </div>
                                            )}
                                            {order.items.length > 1 && (
                                                <div className="absolute top-0 right-0 bg-primary/90 text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-bl-xl shadow-md">
                                                    {order.items.length}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1 text-muted-foreground text-[10px] font-mono">
                                                        <Calendar size={11} />
                                                        {formatLocalDateTime(order.date).split(' ')[1]}
                                                    </div>
                                                    <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 text-[9px] font-bold border border-blue-500/20 uppercase">
                                                        {order.type}
                                                    </span>
                                                </div>
                                                <div className="bg-muted/30 text-muted-foreground/50 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold border border-border/20">
                                                    #{String(order.globalIndex).padStart(2, '0')}
                                                </div>
                                            </div>
                                            <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug mt-1 pr-6">
                                                {order.items[0]?.product?.name || "未绑定商品"}
                                                {order.items.length > 1 && <span className="text-muted-foreground font-normal ml-1 text-[11px]">等{order.items.length}件</span>}
                                            </p>
                                            {/* 备注 */}
                                            {order.note && (
                                                <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 opacity-60">
                                                    &quot;{order.note}&quot;
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className={cn("grid gap-2 mt-3 pt-3 border-t border-border/20", order.commission > 0 ? "grid-cols-3" : "grid-cols-2")}>
                                        <div className="bg-blue-500/8 rounded-xl px-2 py-2 text-center border border-blue-500/10">
                                            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wide mb-0.5">实付</p>
                                            <p className="font-mono text-sm font-bold text-foreground">¥{order.paymentAmount.toFixed(2)}</p>
                                        </div>
                                        <div className="bg-emerald-500/8 rounded-xl px-2 py-2 text-center border border-emerald-500/10">
                                            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wide mb-0.5">到手</p>
                                            <p className="font-mono text-sm font-bold text-emerald-500">¥{order.receivedAmount.toFixed(2)}</p>
                                        </div>
                                        {order.commission > 0 && (
                                            <div className="bg-orange-500/8 rounded-xl px-2 py-2 text-center border border-orange-500/10">
                                                <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wide mb-0.5">佣金</p>
                                                <p className="font-mono text-sm font-bold text-orange-500">¥{order.commission.toFixed(2)}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
        initialData={editingOrder}
        readOnly={readOnly}
        onOpenBatch={() => {
          setIsModalOpen(false);
          setIsBatchModalOpen(true);
        }}
      />

      <BatchRecognitionModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        products={products}
        onBatchComplete={fetchData}
        showToast={showToast}
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

      <BatchEditOrderModal
        isOpen={isBatchEditModalOpen}
        onClose={() => setIsBatchEditModalOpen(false)}
        onConfirm={handleBatchEdit}
        selectedCount={selectedIds.length}
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
        onEdit={canBrush ? () => setIsBatchEditModalOpen(true) : undefined}
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
