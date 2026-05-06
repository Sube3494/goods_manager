"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { Plus, Search, ShoppingBag, Upload, Download, Check, X as ClearIcon, ChevronDown, RotateCcw, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrushOrderModal } from "@/components/BrushOrders/BrushOrderModal";
import { ImportModal } from "@/components/Goods/ImportModal";
import { BatchEditOrderModal } from "@/components/BrushOrders/BatchEditOrderModal";
import { BrushOrder, User as UserType } from "@/lib/types";
import { formatLocalDateTime, formatLocalDate, formatLocalMonth } from "@/lib/dateUtils";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionBar } from "@/components/ui/ActionBar";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { isWithinInterval, parseISO, startOfDay, endOfDay } from "date-fns";
import { pinyinMatch } from "@/lib/pinyin";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { BrushDisplaySettings, getDisplayedMetrics } from "@/lib/brushDisplay";

export default function BrushOrdersPage() {
  const { showToast } = useToast();
  const { user } = useUser();
  const typedUser = user as unknown as UserType;
  const canBrush = hasPermission(user as SessionUser | null, "brush:manage");
  const canUseBrushSimulation = hasPermission(user as SessionUser | null, "brush:simulate");
  const [orders, setOrders] = useState<BrushOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<BrushOrder | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
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
  const [selectedShop, setSelectedShop] = useState("全部");
  const [displaySettings, setDisplaySettings] = useState<BrushDisplaySettings>({
    brushCommissionBoostEnabled: false,
  });
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  
  const toggleMonthExpansion = (month: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedMonths(prev => 
      prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
    );
  };
  
  const toggleDateExpansion = (date: string, e?: React.MouseEvent) => {
    const nextValue = expandedDate === date ? null : date;
    const isExpanding = !!nextValue;
    setExpandedDate(nextValue);
    
    if (isExpanding && e) {
        const target = e.currentTarget as HTMLElement;
        // 等待下一帧，确保 DOM 已渲染展开后的内容
        requestAnimationFrame(() => {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    }
  };

  const hasActiveFilters = searchQuery !== "" || selectedType !== "全部" || selectedShop !== "全部" || startDate !== "" || endDate !== "";
  const showSimulatedValues = canUseBrushSimulation && Boolean(displaySettings.brushCommissionBoostEnabled);

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedType("全部");
    setSelectedShop("全部");
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
          pinyinMatch(o.platformOrderId || "", query) ||
          pinyinMatch(o.shopName || "", query) ||
          o.items.some(i => i.product?.name && pinyinMatch(i.product.name, query)) 
      );

      // 2. 平台筛选
      const matchesType = selectedType === "全部" || o.type === selectedType;

      // 3. 店铺筛选
      const matchesShop = selectedShop === "全部" || o.shopName === selectedShop;

      // 3. 日期筛选
      let matchesDate = true;
      if (startDate || endDate) {
          const orderDate = typeof o.date === 'string' ? parseISO(o.date) : o.date;
          const start = startDate ? startOfDay(parseISO(startDate)) : new Date(0);
          const end = endDate ? endOfDay(parseISO(endDate)) : new Date(8640000000000000);
          matchesDate = isWithinInterval(orderDate, { start, end });
      }

      return matchesSearch && matchesType && matchesShop && matchesDate;
    }).sort((a, b) => {
        const timeA = typeof a.date === 'string' ? new Date(a.date).getTime() : a.date.getTime();
        const timeB = typeof b.date === 'string' ? new Date(b.date).getTime() : b.date.getTime();
        return timeB - timeA;
    });
  }, [orders, searchQuery, startDate, endDate, selectedType, selectedShop]);

  const allShopNames = useMemo(() => {
    const addressLabels = typedUser?.shippingAddresses?.map(a => a.label) || [];
    const existingOrderShops = orders.map(o => o.shopName).filter(Boolean) as string[];
    return Array.from(new Set([...addressLabels, ...existingOrderShops])).sort();
  }, [typedUser?.shippingAddresses, orders]);

  const groupedOrders = useMemo(() => {
    // 结构: 月份 -> 天 -> 订单
    const groups: {
      month: string;
      periodStats: { count: number; payment: number; received: number; commission: number };
      days: {
        date: string;
        orders: (BrushOrder & { globalIndex: number })[];
        dailyStats: { count: number; payment: number; received: number; commission: number };
      }[];
    }[] = [];

    // 第一步：按月分类，再按天分类
    filteredOrders.forEach(order => {
      const monthStr = formatLocalMonth(order.date);
      const dateStr = formatLocalDate(order.date);

      // 找月份
      let monthGroup = groups.find(g => g.month === monthStr);
      if (!monthGroup) {
        monthGroup = {
          month: monthStr,
          periodStats: { count: 0, payment: 0, received: 0, commission: 0 },
          days: []
        };
        groups.push(monthGroup);
      }

      // 月份统计
      const displayed = getDisplayedMetrics(order, displaySettings, showSimulatedValues);
      monthGroup.periodStats.count++;
      monthGroup.periodStats.payment += displayed.payment;
      monthGroup.periodStats.received += displayed.received;
      monthGroup.periodStats.commission += displayed.commission;

      // 找具体的天
      let dayGroup = monthGroup.days.find(d => d.date === dateStr);
      if (!dayGroup) {
        dayGroup = {
          date: dateStr,
          orders: [],
          dailyStats: { count: 0, payment: 0, received: 0, commission: 0 }
        };
        monthGroup.days.push(dayGroup);
      }

      // 添加订单并进行每日统计
      dayGroup.orders.push(order as BrushOrder & { globalIndex: number });
      dayGroup.dailyStats.count++;
      dayGroup.dailyStats.payment += displayed.payment;
      dayGroup.dailyStats.received += displayed.received;
      dayGroup.dailyStats.commission += displayed.commission;
    });

    // 第二步：排序并编序号
    groups.forEach(monthGroup => {
        // 天数按时间倒序排列（最新的在前）
        monthGroup.days.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        monthGroup.days.forEach(dayGroup => {
            dayGroup.orders.sort((a, b) => {
                const timeA = typeof a.date === 'string' ? new Date(a.date).getTime() : a.date.getTime();
                const timeB = typeof b.date === 'string' ? new Date(b.date).getTime() : b.date.getTime();
                return timeA - timeB; // 单日内按照时间正序排列（早的在前）
            });
            // 重新按序分配每天的内部序号（保持从 1 开始，也可以考虑从当前总数倒数，但业务上通常正序编号即可）
            dayGroup.orders.forEach((order, index) => {
                order.globalIndex = index + 1; 
            });
        });
    });
    
    // 月份也改为倒排（最新的在前）
    groups.sort((a, b) => b.month.localeCompare(a.month));

    return groups;
  }, [displaySettings, filteredOrders, showSimulatedValues]);

  const stats = useMemo(() => {
    return filteredOrders.reduce((acc, curr) => ({
      count: acc.count + 1,
      payment: acc.payment + getDisplayedMetrics(curr, displaySettings, showSimulatedValues).payment,
      received: acc.received + getDisplayedMetrics(curr, displaySettings, showSimulatedValues).received,
      commission: acc.commission + getDisplayedMetrics(curr, displaySettings, showSimulatedValues).commission,
    }), { count: 0, payment: 0, received: 0, commission: 0 });
  }, [displaySettings, filteredOrders, showSimulatedValues]);

  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/brush-orders?limit=100000");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.data || []); 
        if (data.displaySettings) {
          setDisplaySettings(data.displaySettings);
        }
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

  const handleBatchEdit = async (data: { commission?: number; note?: string; type?: string; shopName?: string }) => {
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

    // Execute directly to maintain user gesture chain for Safari compatibility
    const runExport = async () => {
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
    };
    
    runExport();
  }, [filteredOrders, showToast]);

  const handleImport = async (data: Record<string, unknown>[] | Record<string, unknown[]>) => {
      const rows = Array.isArray(data) ? data : [];
      const sheetName = rows.length > 0 && typeof rows[0]?.__sheetName === "string" ? String(rows[0].__sheetName) : "";

      if (rows.length === 0) {
        showToast("导入文件里没有可用数据", "info");
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch("/api/brush-orders/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows, sheetName })
        });
      const result = await res.json();
      if (res.ok) {
        if (result.failed > 0 && result.errors?.length > 0) {
          setImportErrors(result.errors);
          setIsErrorModalOpen(true);
        }
        const overwriteText = result.overwrittenCount > 0 ? `, 覆盖 ${result.overwrittenCount} 条` : "";
        showToast(`导入完成: 成功 ${result.success} 条, 失败 ${result.failed} 条${overwriteText}`);
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
    <div className="space-y-8 pb-20">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div className="flex-1 min-w-0">
          <Link
            href="/brush"
            className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground dark:bg-white/5"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            <span>返回刷单中心</span>
          </Link>
          <h1 className="mt-3 text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">刷单管理</h1>
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
          
          <div className="w-24 sm:w-28 shrink-0 h-10 sm:h-11">
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
                      "h-full rounded-full border shadow-sm transition-all text-[10px] sm:text-sm",
                      selectedType !== "全部" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-normal" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
                  )}
              />
          </div>
          {/* 店铺筛选 */}
          {allShopNames.length > 0 && (
            <div className="w-24 sm:w-28 shrink-0 h-10 sm:h-11">
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
                        selectedShop !== "全部" ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-normal" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
                    )}
                />
            </div>
          )}
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
                 {groupedOrders.map((monthGroup) => (
                     <Fragment key={monthGroup.month}>
                         <tr 
                            className="bg-muted/15 border-y border-border/50 cursor-pointer hover:bg-muted/25 transition-all sticky top-0 z-20 backdrop-blur-sm shadow-sm scroll-mt-[85px]"
                            onClick={(e) => toggleMonthExpansion(monthGroup.month, e)}
                         >
                             <td className="px-4 py-2.5 w-12" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex justify-center">
                                     <button 
                                       onClick={(e) => toggleGroupSelect(monthGroup.days.flatMap(d => d.orders).map(o => o.id), e)}
                                       className={cn(
                                           "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer",
                                           monthGroup.days.flatMap(d => d.orders).length > 0 && monthGroup.days.flatMap(d => d.orders).every(o => selectedIds.includes(o.id))
                                           ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
                                           : "border-muted-foreground/30 hover:border-foreground/50 bg-white dark:bg-black"
                                       )}
                                       title="全选本月订单"
                                     >
                                       {monthGroup.days.flatMap(d => d.orders).length > 0 && monthGroup.days.flatMap(d => d.orders).every(o => selectedIds.includes(o.id)) && (
                                           <Check size={12} strokeWidth={4} />
                                       )}
                                     </button>
                                 </div>
                             </td>
                             <td colSpan={5} className="py-2.5 px-3">
                                 <div className="flex items-center gap-2">
                                     <div 
                                        className={cn(
                                            "flex items-center justify-center w-6 h-6 rounded-lg bg-white dark:bg-white/10 border border-border/50 text-muted-foreground hover:text-primary transition-all duration-300",
                                            expandedMonths.includes(monthGroup.month) && "rotate-0",
                                            !expandedMonths.includes(monthGroup.month) && "-rotate-90 text-primary"
                                        )}
                                      >
                                         <ChevronDown size={14} />
                                     </div>
                                     <span className="text-sm font-black text-foreground tracking-tight ml-1">{monthGroup.month}</span>
                                     <span className="px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-500">
                                        {monthGroup.periodStats.count} 单
                                     </span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center whitespace-nowrap">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">总实付</span>
                                    <span className="text-xs font-mono font-bold text-foreground whitespace-nowrap">¥{monthGroup.periodStats.payment.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center whitespace-nowrap">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider whitespace-nowrap">总到手</span>
                                    <span className="text-xs font-mono font-bold text-emerald-500 whitespace-nowrap">¥{monthGroup.periodStats.received.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center whitespace-nowrap">
                                 <div className="flex items-center justify-center gap-1.5">
                                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wider whitespace-nowrap">总佣金</span>
                                    <span className="text-xs font-mono font-bold text-orange-500 whitespace-nowrap">¥{monthGroup.periodStats.commission.toFixed(2)}</span>
                                 </div>
                             </td>
                             <td className="px-6 py-2.5 text-center"></td>
                         </tr>
                         
                         {expandedMonths.includes(monthGroup.month) && monthGroup.days.map((dayGroup) => (
                             <Fragment key={dayGroup.date}>
                                 <tr 
                                    className="bg-muted/5 border-y border-border/30 cursor-pointer hover:bg-muted/10 transition-all sticky top-[45px] z-10 backdrop-blur-sm scroll-mt-[130px]"
                                    onClick={(e) => toggleDateExpansion(dayGroup.date, e)}
                                 >
                                     <td className="px-4 py-2 w-12" onClick={(e) => e.stopPropagation()}>
                                         <div className="flex justify-center">
                                             <button 
                                               onClick={(e) => toggleGroupSelect(dayGroup.orders.map(o => o.id), e)}
                                               className={cn(
                                                   "relative h-4 w-4 rounded-full border-2 transition-all duration-300 flex items-center justify-center cursor-pointer",
                                                   dayGroup.orders.length > 0 && dayGroup.orders.every(o => selectedIds.includes(o.id))
                                                   ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
                                                   : "border-muted-foreground/30 hover:border-foreground/50 bg-white dark:bg-black"
                                               )}
                                               title="全选本日订单"
                                             >
                                               {dayGroup.orders.length > 0 && dayGroup.orders.every(o => selectedIds.includes(o.id)) && (
                                                   <Check size={10} strokeWidth={4} />
                                               )}
                                             </button>
                                         </div>
                                     </td>
                                     <td colSpan={5} className="py-2 px-3 pl-8">
                                         <div className="flex items-center gap-2">
                                             <div 
                                                className={cn(
                                                    "flex items-center justify-center w-5 h-5 rounded-md bg-white dark:bg-white/5 border border-border/40 text-muted-foreground hover:text-primary transition-all duration-300",
                                                    expandedDate === dayGroup.date && "rotate-0",
                                                    expandedDate !== dayGroup.date && "-rotate-90 text-primary"
                                                )}
                                              >
                                                 <ChevronDown size={12} />
                                             </div>
                                             <span className="text-xs font-bold text-foreground tracking-tight">{dayGroup.date}</span>
                                             <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-blue-500 bg-blue-500/10">
                                                {dayGroup.dailyStats.count} 单
                                             </span>
                                         </div>
                                     </td>
                                     <td className="px-6 py-2 text-center text-xs">
                                         <span className="font-mono font-medium text-foreground">¥{dayGroup.dailyStats.payment.toFixed(2)}</span>
                                     </td>
                                     <td className="px-6 py-2 text-center text-xs">
                                         <span className="font-mono font-medium text-emerald-500">¥{dayGroup.dailyStats.received.toFixed(2)}</span>
                                     </td>
                                     <td className="px-6 py-2 text-center text-xs">
                                         <span className="font-mono font-medium text-orange-500">¥{dayGroup.dailyStats.commission.toFixed(2)}</span>
                                     </td>
                                     <td className="px-6 py-2 text-center"></td>
                                 </tr>

                                 {expandedDate === dayGroup.date && (
                                     <>
                                         <tr className="border-b border-border/30 bg-muted/10">
                                             <th className="px-4 py-3"></th>
                                             <th className="px-3 py-3 text-xs font-bold text-muted-foreground uppercase text-center">#</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-left">商品</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center">时间</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center whitespace-nowrap">平台</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center whitespace-nowrap">店铺</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center whitespace-nowrap">实付</th>
                                             <th className="px-6 py-3 text-xs font-bold text-emerald-500 uppercase text-center whitespace-nowrap">到手</th>
                                             <th className="px-6 py-3 text-xs font-bold text-orange-500 uppercase text-center whitespace-nowrap">佣金</th>
                                             <th className="px-6 py-3 text-xs font-bold text-muted-foreground uppercase text-center whitespace-nowrap">备注</th>
                                         </tr>
                                         {dayGroup.orders.map(order => {
                                    const displayed = getDisplayedMetrics(order, displaySettings, showSimulatedValues);
                                    return (
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
                                                 ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
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
                                             <p className="text-sm font-medium line-clamp-1 max-w-[120px]" title={order.items.map(i => i.product?.name).join("\n")}>
                                                 {order.items[0]?.product?.name || "未绑定商品"}
                                                 {order.items.length > 1 && <span className="text-muted-foreground ml-1 text-xs">等{order.items.length}件</span>}
                                             </p>
                                         </div>
                                      </td>
                                      <td className="px-6 py-4 text-sm font-mono text-muted-foreground whitespace-nowrap text-center">
                                         {formatLocalDateTime(order.date).substring(5, 16)}
                                      </td>
                                       <td className="px-6 py-4 text-center whitespace-nowrap">
                                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20 uppercase whitespace-nowrap">
                                                  {order.type}
                                              </span>
                                       </td>
                                       <td className="px-6 py-4 text-center whitespace-nowrap">
                                              {order.shopName ? (
                                                  <div className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold border border-indigo-500/20 whitespace-nowrap truncate max-w-[120px] mx-auto text-center" title={order.shopName}>
                                                      {order.shopName}
                                                  </div>
                                              ) : (
                                                  <span className="text-muted-foreground/50">-</span>
                                              )}
                                       </td>
                                      <td className="px-6 py-4 font-number font-medium text-center text-sm whitespace-nowrap">¥{displayed.payment.toFixed(2)}</td>
                                      <td className="px-6 py-4 font-number font-bold text-emerald-500 text-center text-sm whitespace-nowrap">¥{displayed.received.toFixed(2)}</td>
                                      <td className="px-6 py-4 font-number font-bold text-orange-500 text-center text-sm whitespace-nowrap">¥{displayed.commission.toFixed(2)}</td>
                                      <td className="px-6 py-4 text-center whitespace-nowrap">
                                         <p className="text-xs text-muted-foreground line-clamp-1 max-w-[150px] mx-auto whitespace-normal" title={order.note}>
                                             {order.note || "-"}
                                          </p>
                                      </td>
                                    </tr>
                                         )})}
                                     </>
                                 )}
                             </Fragment>
                         ))}
                     </Fragment>
                 ))}
             </tbody>
          </table>
          )}
          {filteredOrders.length === 0 && !isLoading && (
              <EmptyState
                icon={<ShoppingBag size={40} strokeWidth={1.5} />}
                title="暂无记录"
                description="没有找到匹配的刷单数据。"
                className="py-12"
              />
          )}
        </div>
        
      </div>

        <div className="md:hidden rounded-2xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
          <div className="p-3 space-y-6">
            {groupedOrders.map((monthGroup) => (
                <div key={monthGroup.month} className="space-y-3">
                    {/* 月份 Header */}
                    <div 
                        className="flex items-center justify-between px-3 py-3 bg-muted/30 dark:bg-white/5 rounded-2xl border border-border/50 sticky top-0 z-10 backdrop-blur-md"
                        onClick={(e) => toggleMonthExpansion(monthGroup.month, e)}
                    >
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={(e) => toggleGroupSelect(monthGroup.days.flatMap(d => d.orders).map(o => o.id), e)}
                                className={cn(
                                    "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center shrink-0 cursor-pointer",
                                    monthGroup.days.flatMap(d => d.orders).length > 0 && monthGroup.days.flatMap(d => d.orders).every(o => selectedIds.includes(o.id))
                                    ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
                                    : "bg-white/50 border-primary/20 dark:bg-white/10"
                                )}
                            >
                                {monthGroup.days.flatMap(d => d.orders).length > 0 && monthGroup.days.flatMap(d => d.orders).every(o => selectedIds.includes(o.id)) && (
                                    <Check size={14} strokeWidth={4} />
                                )}
                            </button>
                            <div className={cn(
                                "flex items-center justify-center w-7 h-7 rounded-xl bg-white dark:bg-white/5 border border-primary/10 text-primary shadow-sm transition-transform duration-300",
                                expandedMonths.includes(monthGroup.month) ? "rotate-0" : "-rotate-90"
                            )}>
                                <ChevronDown size={16} />
                            </div>
                            <h3 className="text-sm font-black text-foreground tracking-tight whitespace-nowrap">{monthGroup.month}</h3>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] font-bold text-blue-500 uppercase bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                                {monthGroup.periodStats.count}单
                            </span>
                            <div className="flex flex-col items-end">
                                <span className="text-[9px] font-mono font-medium text-muted-foreground whitespace-nowrap">
                                    实付 ¥{monthGroup.periodStats.payment.toFixed(2)}
                                </span>
                                <span className="text-[11px] font-mono font-bold text-emerald-500 whitespace-nowrap">
                                    到手 ¥{monthGroup.periodStats.received.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {expandedMonths.includes(monthGroup.month) && monthGroup.days.map((dayGroup) => (
                        <div key={dayGroup.date} className="space-y-2 pl-2 border-l-2 border-primary/5 ml-4 my-2">
                            <div 
                                className="flex items-center justify-between px-2.5 py-2.5 bg-muted/20 dark:bg-white/5 rounded-xl border border-border/40"
                                onClick={(e) => toggleDateExpansion(dayGroup.date, e)}
                            >
                                <div className="flex items-center gap-2">
                                    <button 
                                      onClick={(e) => toggleGroupSelect(dayGroup.orders.map(o => o.id), e)}
                                      className={cn(
                                          "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center shrink-0 cursor-pointer",
                                          dayGroup.orders.length > 0 && dayGroup.orders.every(o => selectedIds.includes(o.id))
                                          ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
                                          : "bg-black/5 border-black/10 dark:bg-black/20 dark:border-white/20"
                                      )}
                                    >
                                      {dayGroup.orders.length > 0 && dayGroup.orders.every(o => selectedIds.includes(o.id)) && (
                                          <Check size={12} strokeWidth={4} />
                                      )}
                                    </button>
                                    <div className={cn(
                                        "flex items-center justify-center w-7 h-7 rounded-lg bg-white dark:bg-white/10 border border-border/50 text-muted-foreground transition-transform duration-300",
                                        expandedDate === dayGroup.date ? "rotate-0" : "-rotate-90"
                                    )}>
                                        <ChevronDown size={16} />
                                    </div>
                                    <h4 className="text-sm font-bold text-foreground">{dayGroup.date}</h4>
                                    <span className="text-[10px] text-blue-500 font-bold ml-1 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                        {dayGroup.dailyStats.count}单
                                    </span>
                                </div>
                                <div className="text-right flex flex-col items-end shrink-0">
                                    <p className="text-[10px] font-mono text-muted-foreground scale-90 origin-right">实付 ¥{dayGroup.dailyStats.payment.toFixed(2)}</p>
                                    <p className="text-xs font-mono font-bold text-emerald-500">到手 ¥{dayGroup.dailyStats.received.toFixed(2)}</p>
                                </div>
                            </div>

                            {expandedDate === dayGroup.date && (
                                <div className="space-y-2 mt-2">
                                    {dayGroup.orders.map(order => {
                                        const displayed = getDisplayedMetrics(order, displaySettings, showSimulatedValues);
                                        return (
                                        <div 
                                            key={order.id} 
                                            onClick={() => handleEdit(order)}
                                            className={cn(
                                                "bg-white dark:bg-white/5 p-3 rounded-xl border border-border/50 shadow-sm relative overflow-hidden cursor-pointer active:scale-[0.98] transition-all",
                                                selectedIds.includes(order.id) ? 'ring-2 ring-primary ring-inset' : ''
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="shrink-0"
                                                    onClick={(e) => toggleSelect(order.id, e)}
                                                >
                                                    <button 
                                                        className={cn(
                                                            "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                                                            selectedIds.includes(order.id)
                                                            ? "bg-foreground border-foreground text-background dark:text-black scale-110" 
                                                            : "bg-black/5 dark:bg-black/20 border-border"
                                                        )}
                                                    >
                                                        {selectedIds.includes(order.id) && (
                                                            <Check size={12} strokeWidth={4} />
                                                        )}
                                                    </button>
                                                </div>

                                                <div className="w-12 h-12 rounded-lg bg-gray-50 dark:bg-white/5 border dark:border-white/10 overflow-hidden shrink-0 relative">
                                                    {order.items[0]?.product?.image ? (
                                                        /* eslint-disable-next-line @next/next/no-img-element */
                                                        <img src={order.items[0].product.image} className="w-full h-full object-cover" alt="Product" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                                                            <ShoppingBag size={18} />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                     <div className="flex items-center justify-between">
                                                         <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-mono font-bold text-muted-foreground/30">
                                                                #{String(order.globalIndex).padStart(2, '0')}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[8px] font-bold border border-blue-500/20 uppercase leading-none">
                                                                {order.type}
                                                            </span>
                                                         </div>
                                                         <span className="text-[10px] font-mono text-muted-foreground">
                                                             {formatLocalDateTime(order.date).substring(5, 16)}
                                                         </span>
                                                     </div>
                                                     <p className="text-xs font-bold text-foreground line-clamp-1 mt-0.5">
                                                         {order.items[0]?.product?.name || "未绑定商品"}
                                                         {order.items.length > 1 && <span className="text-muted-foreground font-normal ml-1">等{order.items.length}件</span>}
                                                     </p>
                                                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mt-1.5">
                                                         {order.shopName && (
                                                             <div className="px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 text-[9px] font-bold border border-indigo-500/20 whitespace-nowrap truncate max-w-[80px]" title={order.shopName}>
                                                                 {order.shopName}
                                                             </div>
                                                         )}
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] text-muted-foreground uppercase font-bold">实付</span>
                                                            <span className="text-[10px] font-mono font-bold text-foreground">
                                                                ¥{displayed.payment.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] text-emerald-500 uppercase font-bold">到手</span>
                                                            <span className="text-[10px] font-mono font-bold text-emerald-500">
                                                                ¥{displayed.received.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
           
           {filteredOrders.length === 0 && !isLoading && (
               <EmptyState
                 icon={<ShoppingBag size={40} strokeWidth={1.5} />}
                 title="暂无刷单记录"
                 description="暂时没有刷单数据。"
               />
           )}
         </div>
       </div>

      <BrushOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
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

      <BatchEditOrderModal
        isOpen={isBatchEditModalOpen}
        onClose={() => setIsBatchEditModalOpen(false)}
        onConfirm={handleBatchEdit}
        selectedCount={selectedIds.length}
        shopOptions={allShopNames}
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
        title="导入全部订单 (智能分流)"
        description="支持混合导入：系统将自动根据商品名称智能匹配库存，并根据【配送平台】自动分流为真实出库单或刷单记录。缺货的真实订单将自动补偿入库。"
        templateFileName="订单导入说明.txt"
        templateData={[
          {
            "下单日期": "2024-01-01 12:00:00",
            "来源平台": "美团",
            "商品": "示例商品名x1+搭配礼盒x1",
            "配送平台": "闪送 / 自配送",
            "用户实付金额": 95.00,
            "商家实收金额": 100.00,
            "佣金": 5.00,
            "备注": "示例：只要配送平台是自配送，即判定为刷单"
          }
        ]}
      />

      <ConfirmModal
        isOpen={isErrorModalOpen}
        onClose={() => setIsErrorModalOpen(false)}
        onConfirm={() => setIsErrorModalOpen(false)}
        title="导入结果详情"
        message={
          <div className="mt-2 max-h-60 overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-4">以下数据导入失败，请检查文件后重试：</p>
            <ul className="space-y-2">
              {importErrors.map((err, idx) => (
                <li key={idx} className="text-xs text-destructive bg-destructive/5 p-2 rounded border border-destructive/10">
                  {err}
                </li>
              ))}
            </ul>
          </div>
        }
        variant="info"
        confirmLabel="知道了"
      />
    </div>
  );
}
