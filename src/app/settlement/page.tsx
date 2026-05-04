"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Loader2, Receipt, RefreshCw, Save, Store, History, Calculator, FileText, CalendarDays, ChevronLeft, ChevronRight, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { FinanceMath } from "@/lib/math";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { User } from "@/lib/types";

interface PlatformData {
  id: string;
  shopName: string;
  platformName: string;
  serviceFeeRate: number;
  received: number;
  brushing: number;
  receivedToCard: number;
}

interface ShopGroup {
  shopName: string;
  serviceFeeRate: number;
  entries: Array<PlatformData & { net: number; fee: number }>;
  totalReceived: number;
  totalNet: number;
  totalServiceFee: number;
  totalAlreadyReceived: number;
  finalBalance: number;
  hasData: boolean;
}

const DEFAULT_PLATFORMS = ["美团闪购", "京东秒送", "淘宝闪购"];
const money = (value: number) => `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SettlementPage() {
  const { user, isLoading: userLoading } = useUser();
  const shops = useMemo(() => (user as unknown as User)?.shippingAddresses || [], [user]);
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const canManage = hasPermission(user as SessionUser | null, "settlement:manage");

  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");
  const [initialLoading, setInitialLoading] = useState(false);
  const [originalData, setOriginalData] = useState<{ entries: PlatformData[], note: string, month: string } | null>(null);

  const [activeShop, setActiveShop] = useState<string>("");
  const [entries, setEntries] = useState<PlatformData[]>([]);
  const [note, setNote] = useState("");
  const [businessMonth, setBusinessMonth] = useState(format(new Date(), "yyyy-MM"));
  const [isSaving, setIsSaving] = useState(false);

  // Month Picker State
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(parseInt(format(new Date(), "yyyy")));
  const monthPickerContainerRef = useRef<HTMLDivElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isConfirmNavOpen, setIsConfirmNavOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 点击外部关闭月份选择器
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideTrigger = monthPickerContainerRef.current?.contains(target);
      const isInsidePicker = pickerPanelRef.current?.contains(target);
      
      if (!isInsideTrigger && !isInsidePicker) {
        setIsMonthPickerOpen(false);
      }
    }
    if (isMonthPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMonthPickerOpen]);

  // 处理编辑模式下的数据加载
  useEffect(() => {
    if (!editId || !shops.length) return;

    const fetchSettlementForEdit = async () => {
      try {
        setInitialLoading(true);
        const res = await fetch(`/api/settlements/${editId}`);
        if (!res.ok) throw new Error("获取记录失败");
        const data = await res.json();

        // 映射数据到表单状态
        const monthStr = format(new Date(data.date), "yyyy-MM");
        setBusinessMonth(monthStr);
        setNote(data.note || "");
        
        // 构建 entries
        const mappedEntries: PlatformData[] = [];
        shops.forEach((shop: any) => {
          const shopName = shop.label;
          // 查找该店铺的所有平台记录
          DEFAULT_PLATFORMS.forEach((platformName) => {
            const match = data.items.find((item: any) => 
              item.shopName === shopName && item.platformName === platformName
            );

            mappedEntries.push({
              id: `${shopName}-${platformName}`,
              shopName: shopName,
              platformName,
              // 优先使用历史记录中的费率，如果没有则回退到店铺当前配置
              serviceFeeRate: match?.serviceFeeRate ?? (shop.serviceFeeRate ?? 0.06),
              received: match?.received || 0,
              brushing: match?.brushing || 0,
              receivedToCard: match?.receivedToCard || 0
            });
          });
        });

        setEntries(mappedEntries);
        setOriginalData({ entries: mappedEntries, note: data.note || "", month: monthStr });
        
        // 如果有店铺，默认选第一个有数据的
        const firstWithData = data.items[0]?.shopName;
        if (firstWithData) setActiveShop(firstWithData);
        
      } catch (err) {
        showToast((err as Error).message, "error");
        router.replace(pathname);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchSettlementForEdit();
  }, [editId, shops]);

  // 初始化所有的表单输入数据（非编辑模式）
  useEffect(() => {
    if (!shops || shops.length === 0 || editId) return;
    if (!activeShop) setActiveShop(shops[0].label);

    setEntries((prev) => {
      if (prev.length > 0) return prev; 
      const init: PlatformData[] = [];
      shops.forEach((shop: any) => {
        const rate = shop.serviceFeeRate ?? 0.06;
        DEFAULT_PLATFORMS.forEach((platformName) => {
          init.push({
            id: `${shop.label}-${platformName}`,
            shopName: shop.label,
            platformName,
            serviceFeeRate: rate,
            received: 0,
            brushing: 0,
            receivedToCard: 0
          });
        });
      });
      return init;
    });
  }, [shops, activeShop, editId]);

  // 结算计算引擎
  const groups = useMemo<ShopGroup[]>(() => {
    return shops.map((shop: any) => {
      const shopName = shop.label;
      const entriesForShop = entries.filter((entry) => entry.shopName === shopName);
      
      const entriesWithCalc = entriesForShop.map((e) => {
        // 真实业绩 = 账单入账 - 刷单到手 (财务级减法)
        const net = Math.max(0, FinanceMath.subtract(e.received, e.brushing));
        // 抽成 = 真实业绩 * 费率 (基于扣除刷单后的实收计算，财务级乘法)
        const fee = FinanceMath.multiply(net, e.serviceFeeRate);
        return { ...e, net, fee };
      });

      const totalReceived = FinanceMath.sum(...entriesWithCalc.map(e => e.received));
      const totalNet = FinanceMath.sum(...entriesWithCalc.map(e => e.net));
      const totalServiceFee = FinanceMath.sum(...entriesWithCalc.map(e => e.fee));
      const totalAlreadyReceived = FinanceMath.sum(...entriesWithCalc.map(e => e.receivedToCard));
      
      // 应补差价 = 账单入账 - 商家实际已收 - 总抽成
      const finalBalance = FinanceMath.subtract(
        FinanceMath.subtract(totalReceived, totalAlreadyReceived),
        totalServiceFee
      );

      return {
        shopName,
        serviceFeeRate: entriesForShop[0]?.serviceFeeRate || shop.serviceFeeRate || 0.06,
        entries: entriesWithCalc,
        totalReceived,
        totalNet,
        totalServiceFee,
        totalAlreadyReceived,
        finalBalance,
        hasData: totalReceived > 0 || totalAlreadyReceived > 0 || note.length > 0,
      };
    });
  }, [entries, shops, note]);

  const hasUnsavedChanges = useMemo(() => {
    if (editId && originalData) {
      // 在编辑模式下，对比当前数据与原始数据
      const entriesChanged = JSON.stringify(entries) !== JSON.stringify(originalData.entries);
      const noteChanged = note !== originalData.note;
      const monthChanged = businessMonth !== originalData.month;
      return entriesChanged || noteChanged || monthChanged;
    }
    // 在新增模式下，检查是否有任何录入数据
    return groups.some(g => g.hasData);
  }, [groups, editId, originalData, entries, note, businessMonth]);

  // 拦截应用内侧边栏跳转
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!hasUnsavedChanges) return;

      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:") || href === pathname) return;

      const isSidebarLink = target.closest("aside") || target.closest(".sidebar-link");
      
      if (isSidebarLink) {
        e.preventDefault();
        e.stopPropagation();
        setPendingUrl(href);
        setIsConfirmNavOpen(true);
      }
    };

    document.addEventListener("click", handleGlobalClick, true);
    return () => document.removeEventListener("click", handleGlobalClick, true);
  }, [hasUnsavedChanges, pathname]);

  const activeGroup = groups.find((g) => g.shopName === activeShop);

  const handleInputChange = (id: string, field: "received" | "brushing" | "receivedToCard", value: string) => {
    const numeric = Number.parseFloat(value) || 0;
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, [field]: numeric } : entry)));
  };

  // 统一的取消/返回处理
  const handleCancelEdit = () => {
    const historyUrl = "/settlement/history";
    if (hasUnsavedChanges) {
      setPendingUrl(historyUrl); 
      setIsConfirmNavOpen(true);
    } else {
      router.push(historyUrl);
    }
  };

  const saveSettlement = async () => {
    if (!activeGroup || !activeGroup.hasData) {
      showToast("未填写任何有效账单金额，无法保存", "error");
      return;
    }

    setIsSaving(true);
    try {
      const url = editId ? `/api/settlements/${editId}` : "/api/settlements";
      const method = editId ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: businessMonth ? new Date(`${businessMonth}-01T12:00:00`) : new Date(),
          totalNet: activeGroup.totalNet,
          serviceFeeRate: activeGroup.serviceFeeRate, 
          serviceFee: activeGroup.totalServiceFee,
          totalAlreadyReceived: activeGroup.totalAlreadyReceived,
          finalBalance: activeGroup.finalBalance,
          note,
          shopName: activeGroup.shopName,
          items: activeGroup.entries
            .filter(entry => entry.received > 0 || entry.brushing > 0 || entry.receivedToCard > 0)
            .map((entry) => ({
              platformName: entry.platformName,
              shopName: entry.shopName,
              serviceFeeRate: entry.serviceFeeRate,
              received: entry.received,
              brushing: entry.brushing,
              receivedToCard: entry.receivedToCard,
              net: entry.net,
            }))
        }),
      });
      if (!response.ok) throw new Error(editId ? "更新失败" : "保存失败");
      
      showToast(`${activeGroup.shopName} 结算单已${editId ? "更新" : "保存"}至历史记录！`, "success");
      
      if (editId) {
        // 编辑模式下跳转回历史记录
        router.push("/settlement/history");
      } else {
        router.refresh();
        setEntries((prev) => prev.map((entry) => (entry.shopName === activeShop ? { ...entry, received: 0, brushing: 0, receivedToCard: 0 } : entry)));
        setNote("");
      }
    } catch (error) {
      console.error(error);
      showToast("保存失败，请重试", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleHistoryClick = () => {
    if (hasUnsavedChanges) {
      setIsConfirmNavOpen(true);
    } else {
      router.push("/settlement/history");
    }
  };

  if (userLoading) return null;
  if (!canManage) return null;

  return (
    <div className="w-full space-y-6 pb-20 px-2 sm:px-4 max-w-7xl mx-auto">
      {/* Unified Dashboard Header */}
      <div className="relative space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-xl text-primary shrink-0">
              <Receipt size={24} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-none">
                  单店对账台
                </h1>
                {editId && (
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 text-[10px] font-black uppercase tracking-wider animate-pulse">
                    <Edit2 size={10} />
                    正在编辑历史记录
                  </div>
                )}
              </div>
              <p className="hidden sm:block text-sm text-muted-foreground font-medium opacity-80">
                {editId ? "正在修改已保存的结算单。更新后将同步至历史记录。" : "专注为每家店铺生成单独的结算发票。填写完毕即刻保存入账。"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editId && (
              <button 
                onClick={handleCancelEdit}
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400 px-4 text-sm font-bold transition-all hover:bg-rose-500/10 active:scale-95"
              >
                <ChevronLeft size={16} strokeWidth={3} />
                返回历史
              </button>
            )}
            {!editId && (
              <button 
                onClick={handleHistoryClick}
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-border/50 bg-white dark:bg-white/5 text-foreground px-5 text-sm font-bold transition-all hover:bg-muted/50 dark:hover:bg-white/10 shadow-sm active:scale-95"
              >
                <History size={16} />
                历史记录
              </button>
            )}
          </div>
        </div>
        <p className="sm:hidden text-xs text-muted-foreground font-medium opacity-80 pl-1">
          专注为每家店铺生成单独的结算发票。填写完毕即刻保存入账。
        </p>

        {/* Shop Segmented Control */}
        <div className="p-1 rounded-[20px] bg-white dark:bg-white/5 border border-border/40 inline-flex flex-wrap gap-1 shadow-inner backdrop-blur-md relative overflow-hidden">
          {editId && (
            <div className="absolute inset-0 z-20 bg-white/20 dark:bg-black/20 backdrop-blur-[1px] flex items-center justify-center cursor-not-allowed group">
               <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-[10px] px-3 py-1 rounded-full font-bold">编辑模式下锁定切换</div>
            </div>
          )}
          {shops.map((shop) => {
            const isActive = shop.label === activeShop;
            const hasData = groups.find(g => g.shopName === shop.label)?.hasData;
            return (
              <button
                key={shop.id}
                onClick={() => !editId && setActiveShop(shop.label)}
                disabled={!!editId && !isActive}
                className={`relative flex items-center gap-2 rounded-[14px] px-5 py-2 text-sm font-bold transition-all duration-300 ${
                  isActive
                    ? "bg-white dark:bg-white/10 text-primary shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30 dark:hover:bg-white/5 disabled:opacity-40"
                }`}
              >
                <Store size={14} className={isActive ? "text-primary" : "text-muted-foreground/60"} />
                {shop.label}
                {hasData && !isActive && (
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                )}
                {isActive && (
                  <motion.div layoutId="active-shop-pill" className="absolute inset-0 rounded-[14px] border border-primary/20 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <ConfirmModal 
        isOpen={isConfirmNavOpen}
        onClose={() => {
          setIsConfirmNavOpen(false);
          setPendingUrl(null);
        }}
        onConfirm={() => {
          setIsConfirmNavOpen(false);
          if (pendingUrl) {
            router.push(pendingUrl);
          } else {
            router.push("/settlement/history");
          }
          setPendingUrl(null);
        }}
        title="数据尚未保存"
        message="当前有录入的数据尚未保存，离开此页面将导致数据丢失。确定要离开吗？"
        variant="warning"
        confirmLabel="离开页面"
        cancelLabel="留在此页"
      />

      {!activeGroup ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-white/50 dark:bg-white/5">
          <p className="text-sm font-bold text-muted-foreground">未选中或暂无店铺配置。</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* 左侧：主工作台 */}
          <main className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[24px] border border-border/50 bg-white/70 dark:bg-white/5 p-4 shadow-sm transition-colors hover:border-border/80">
              <div className="flex items-center gap-4">
                <div className="bg-white dark:bg-white/5 p-2.5 rounded-2xl shadow-sm">
                  <FileText size={20} className="text-primary" />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">当前结算单基准</div>
                  <div className="font-bold tracking-tight text-foreground mt-0.5">{activeGroup.shopName} · 综合抽成费率 {(activeGroup.serviceFeeRate * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto relative" ref={monthPickerContainerRef}>
                <button 
                  onClick={() => {
                    setPickerYear(parseInt(businessMonth.split('-')[0]));
                    setIsMonthPickerOpen(!isMonthPickerOpen);
                  }}
                  className={`flex items-center justify-between gap-2 h-10 w-full sm:w-[150px] rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm transition-all outline-none ${
                    isMonthPickerOpen ? "ring-2 ring-primary/20 border-primary/20 shadow-lg" : "hover:bg-muted/50 dark:hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 min-w-0 flex-1">
                    <CalendarDays size={14} className={businessMonth ? "text-primary" : "text-muted-foreground"} />
                    <span className="truncate text-foreground font-medium">
                      {businessMonth ? format(new Date(businessMonth + "-01"), "yyyy-MM") : "选择月份"}
                    </span>
                  </div>
                </button>
                <button 
                  onClick={() => setIsConfirmResetOpen(true)} 
                  disabled={!!editId}
                  title={editId ? "编辑模式无法重置" : "重置本店数据"} 
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-border/10 bg-white dark:bg-white/5 shadow-sm text-muted-foreground hover:dark:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={16} />
                </button>

                <ConfirmModal 
                  isOpen={isConfirmResetOpen}
                  onClose={() => setIsConfirmResetOpen(false)}
                  onConfirm={() => {
                    setIsConfirmResetOpen(false);
                    setEntries((prev) => prev.map((entry) => 
                      entry.shopName === activeShop 
                        ? { ...entry, received: 0, brushing: 0, receivedToCard: 0 } 
                        : entry
                    ));
                    setNote("");
                    showToast(`${activeShop} 的输入数据已重置`, "info");
                  }}
                  title="确认清空数据"
                  message={`确定要清空 ${activeShop} 的输入数据吗？该操作不可撤销。`}
                  variant="danger"
                  confirmLabel="确定清空"
                  cancelLabel="保留数据"
                />

                {mounted && isMonthPickerOpen && createPortal(
                  <AnimatePresence>
                    <motion.div
                      ref={pickerPanelRef}
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="fixed z-[1000001] rounded-[24px] glass p-4 shadow-2xl border border-white/10"
                      style={{
                        top: monthPickerContainerRef.current ? monthPickerContainerRef.current.getBoundingClientRect().bottom + 8 : 0,
                        left: monthPickerContainerRef.current ? monthPickerContainerRef.current.getBoundingClientRect().left : 0,
                        minWidth: '280px'
                      }}
                    >
                      <div className="max-w-[280px] mx-auto">
                        <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setPickerYear(y => y - 1); }}
                              className="rounded-lg p-1 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
                            >
                              <ChevronLeft size={14} strokeWidth={3} />
                            </button>
                            <h4 className="text-sm font-bold text-foreground tracking-widest">{pickerYear}年</h4>
                            <button
                              onClick={(e) => { e.stopPropagation(); setPickerYear(y => y + 1); }}
                              className="rounded-lg p-1 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
                            >
                              <ChevronRight size={14} strokeWidth={3} />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                            const monthStr = `${pickerYear}-${m.toString().padStart(2, '0')}`;
                            const isSelected = businessMonth === monthStr;
                            return (
                              <button
                                key={m}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBusinessMonth(monthStr);
                                  setIsMonthPickerOpen(false);
                                }}
                                className={`h-11 rounded-xl text-xs font-bold transition-all ${
                                  isSelected 
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-105" 
                                    : "text-foreground hover:bg-primary/10 hover:text-primary"
                                }`}
                              >
                                {m}月
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setBusinessMonth(format(new Date(), "yyyy-MM")); setIsMonthPickerOpen(false); }}
                                className="text-[10px] font-bold text-primary hover:underline px-2 py-1"
                            >
                                本月
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setIsMonthPickerOpen(false); }}
                              className="text-[10px] font-bold text-muted-foreground hover:text-foreground px-2 py-1"
                            >
                                关闭
                            </button>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>,
                  document.body
                )}
              </div>
            </div>

            <div className="space-y-4">
              {activeGroup.entries.map((entry) => {
                const isRowActive = entry.received > 0 || entry.brushing > 0 || entry.receivedToCard > 0;
                let brandBadge = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
                if (entry.platformName.includes('美团')) brandBadge = "bg-[#FFD000]/15 text-[#b39200] dark:text-[#FFD000]";
                if (entry.platformName.includes('淘宝')) brandBadge = "bg-[#FF5000]/10 text-[#FF5000]";
                if (entry.platformName.includes('京东')) brandBadge = "bg-[#E1251B]/10 text-[#E1251B]";

                return (
                  <div key={entry.id} className={`overflow-hidden rounded-[24px] border transition-all duration-300 shadow-sm ${
                    isRowActive ? "border-primary/30 bg-primary/[0.02]" : "border-border/50 bg-white dark:bg-white/5 hover:border-border/80"
                  }`}>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 bg-white dark:bg-white/5">
                      <div className={`px-2.5 py-1 rounded-md text-[11px] font-black tracking-widest ${brandBadge}`}>
                        {entry.platformName}
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className="text-muted-foreground"><span className="text-[10px] tracking-wider uppercase font-sans mr-1">业绩</span>{money(entry.net)}</span>
                        <span className="text-orange-500/80"><span className="text-[10px] tracking-wider uppercase font-sans mr-1">抽成</span>{money(entry.fee)}</span>
                      </div>
                    </div>
                    {/* 输入区 - 响应式栅格：窄屏单列，中屏双列，宽屏三列 */}
                    <div className="flex flex-col md:grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30">
                      <div className="px-4 py-2.5 md:p-4 flex items-center justify-between md:block relative group transition-colors hover:bg-muted/30 dark:hover:bg-white/[0.02]">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 md:mb-2 block shrink-0">账单入账(A)</label>
                        <div className="relative w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium group-focus-within:text-primary transition-colors">¥</span>
                          <input type="number" inputMode="decimal" value={entry.received || ""} onChange={(e) => handleInputChange(entry.id, "received", e.target.value)} placeholder="0.00" className="h-9 md:h-11 w-full rounded-xl bg-transparent dark:bg-transparent pl-8 pr-3 text-right font-mono text-sm md:text-base font-bold outline-none transition-all focus:bg-white dark:focus:bg-white/5 focus:ring-2 focus:ring-primary/20" />
                        </div>
                      </div>
                      <div className="px-4 py-2.5 md:p-4 flex items-center justify-between md:block relative group transition-colors hover:bg-muted/30 dark:hover:bg-white/[0.02]">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 md:mb-2 block shrink-0">刷单到手</label>
                        <div className="relative w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium group-focus-within:text-rose-500 transition-colors">¥</span>
                          <input type="number" inputMode="decimal" value={entry.brushing || ""} onChange={(e) => handleInputChange(entry.id, "brushing", e.target.value)} placeholder="0.00" className="h-9 md:h-11 w-full rounded-xl bg-transparent dark:bg-transparent pl-8 pr-3 text-right font-mono text-sm md:text-base font-bold outline-none transition-all focus:bg-white dark:focus:bg-white/5 focus:ring-2 focus:ring-rose-500/20" />
                        </div>
                      </div>
                      <div className="px-4 py-2.5 md:p-4 flex items-center justify-between md:block relative group transition-colors hover:bg-muted/30 dark:hover:bg-white/[0.02]">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 md:mb-2 block shrink-0">商家已收</label>
                        <div className="relative w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-orange-500/50 font-medium group-focus-within:text-orange-500 transition-colors">¥</span>
                          <input type="number" inputMode="decimal" value={entry.receivedToCard || ""} onChange={(e) => handleInputChange(entry.id, "receivedToCard", e.target.value)} placeholder="0.00" className="h-9 md:h-11 w-full rounded-xl bg-orange-500/5 dark:bg-orange-500/5 pl-8 pr-3 text-right font-mono text-sm md:text-base font-bold text-orange-600 dark:text-orange-400 outline-none transition-all focus:bg-white dark:focus:bg-white/5 focus:ring-2 focus:ring-orange-500/20" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-[24px] border border-border/50 bg-white/70 dark:bg-white/5 p-4 shadow-sm">
               <label htmlFor="settlement-note" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">单据备注</label>
               <textarea id="settlement-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={`补充 ${activeGroup.shopName} 的特殊结账说明（选填）...`} className="h-20 w-full resize-none rounded-xl bg-transparent hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-border/50 px-4 py-3 text-sm outline-none transition-all focus:bg-white dark:focus:bg-white/5 focus:ring-2 focus:ring-primary/20" />
            </div>
          </main>

          {/* 右侧：单店结算看板 - 在 xl 以下会自动堆叠到下方 */}
          <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <section className="overflow-hidden rounded-[28px] border border-border/50 bg-white shadow-xl shadow-primary/5 dark:bg-white/5 dark:shadow-none flex flex-col relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />
              <div className="px-6 pt-7 pb-5 text-center border-b border-border/30 relative z-10">
                <div className="mx-auto w-12 h-12 bg-white dark:bg-white/5 border border-border/30 text-foreground rounded-full flex items-center justify-center mb-3 ring-4 ring-muted/30 dark:ring-white/5 shadow-sm">
                  <Calculator size={20} />
                </div>
                <div className="text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-1">本店应补差价</div>
                <div className={`text-4xl lg:text-5xl font-black tracking-tighter ${activeGroup.finalBalance > 0 ? "text-primary" : "text-foreground"}`}>
                  {money(activeGroup.finalBalance)}
                </div>
              </div>

              <div className="p-6 space-y-4 flex-1 relative z-10">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm py-1 border-b border-border/30 border-dashed">
                    <span className="font-bold text-muted-foreground">账单总入账 (A)</span>
                    <span className="font-mono font-bold text-foreground">{money(activeGroup.totalReceived)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-border/30 border-dashed">
                    <span className="font-bold text-muted-foreground">总抽成</span>
                    <span className="font-mono font-bold text-rose-500">-{money(activeGroup.totalServiceFee)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm py-1 border-b border-border/30 border-dashed">
                    <span className="font-bold text-muted-foreground">商家实际已收</span>
                    <span className="font-mono font-bold text-orange-500">-{money(activeGroup.totalAlreadyReceived)}</span>
                  </div>
                </div>

                <div className="mt-2 rounded-2xl bg-muted/50 dark:bg-white/5 p-3 border border-border/30">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 opacity-70">计算逻辑</div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/80 overflow-x-auto no-scrollbar whitespace-nowrap">
                    <span>账单入账</span>
                    <span className="text-primary">-</span>
                    <span>总抽成</span>
                    <span className="text-primary">-</span>
                    <span>实际已收</span>
                    <span className="text-primary">=</span>
                    <span className="text-primary">应补差价</span>
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={saveSettlement} 
                    disabled={isSaving || !activeGroup.hasData} 
                    className="group relative flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-[20px] bg-primary text-base font-black text-primary-foreground shadow-lg transition-all hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/25 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 disabled:grayscale"
                  >
                    {isSaving ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <>
                        <Save size={18} className="z-10" />
                        <span className="z-10 tracking-wide">{editId ? "更新当前结算单" : "存入本店结算单"}</span>
                        <div className="absolute inset-0 z-0 bg-linear-to-r from-transparent via-white/15 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
                      </>
                    )}
                  </button>
                  {!activeGroup.hasData && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">填入金额后方可保存账单</p>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
