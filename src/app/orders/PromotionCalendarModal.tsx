"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Loader2, Check, Calendar as CalendarIcon, ChevronDown, Store } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from "recharts";

// 自定义折线图悬浮框
interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  platform: PromotionPlatformKey;
}

function CustomTooltip({ active, payload, platform }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const dateStr = payload[0].payload.dateStr;
    const promoVal = payload[0].value;
    const orderVal = payload[1]?.value ?? 0;
    const platformMeta = PROMOTION_PLATFORM_META[platform];
    
    return (
      <div className="rounded-xl border border-black/8 bg-white/95 p-3 shadow-md dark:border-white/10 dark:bg-slate-900/95 backdrop-blur-xs">
        <p className="text-[11px] text-muted-foreground">{dateStr}</p>
        <div className="mt-1.5 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${platformMeta.dotClassName}`} />
              {platformMeta.label}推广费:
            </span>
            <span className="text-foreground">¥{Number(promoVal).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              真实订单量:
            </span>
            <span className="text-foreground">{orderVal} 单</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function CustomLegend({ platform }: { platform: PromotionPlatformKey }) {
  const platformMeta = PROMOTION_PLATFORM_META[platform];
  return (
    <div className="flex justify-center gap-6 text-[11px] text-muted-foreground pt-2">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${platformMeta.dotClassName}`} />
        {platformMeta.label}推广费用 (左轴)
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-md bg-[#10B981]" style={{ clipPath: "polygon(0 40%, 100% 40%, 100% 60%, 0 60%)" }} />
        真实订单数 (右轴)
      </span>
    </div>
  );
}

type PromotionPlatformKey = "amountMeituan" | "amountJingdong" | "amountTaobao" | "amountOther";

const PROMOTION_PLATFORM_ROWS: Array<{
  key: PromotionPlatformKey;
  label: string;
  logo: string;
  activeColor: string;
  stroke: string;
  dotClassName: string;
  orderKey: "orderMeituan" | "orderJingdong" | "orderTaobao" | "orderDoudian";
  bgLight: string;
}> = [
  { key: "amountMeituan", label: "美团", logo: "/platform/美团.svg", activeColor: "border-[#FFB800] bg-[#FFB800]/5 text-[#FFB800]", stroke: "#FFB800", dotClassName: "bg-[#FFB800]", orderKey: "orderMeituan", bgLight: "bg-[#FFB800]/10" },
  { key: "amountJingdong", label: "京东", logo: "/platform/京东.svg", activeColor: "border-[#DF1E1D] bg-[#DF1E1D]/5 text-[#DF1E1D]", stroke: "#DF1E1D", dotClassName: "bg-[#DF1E1D]", orderKey: "orderJingdong", bgLight: "bg-[#DF1E1D]/10" },
  { key: "amountTaobao", label: "淘宝", logo: "/platform/淘宝.svg", activeColor: "border-[#FF5500] bg-[#FF5500]/5 text-[#FF5500]", stroke: "#FF5500", dotClassName: "bg-[#FF5500]", orderKey: "orderTaobao", bgLight: "bg-[#FF5500]/10" },
  { key: "amountOther", label: "抖店", logo: "/platform/doudian.svg", activeColor: "border-[#38BDF8] bg-[#38BDF8]/5 text-[#38BDF8]", stroke: "#38BDF8", dotClassName: "bg-[#38BDF8]", orderKey: "orderDoudian", bgLight: "bg-[#38BDF8]/10" },
];

const PROMOTION_PLATFORM_META = Object.fromEntries(
  PROMOTION_PLATFORM_ROWS.map((item) => [item.key, item])
) as Record<PromotionPlatformKey, (typeof PROMOTION_PLATFORM_ROWS)[number]>;

interface PromotionPlatformAmounts {
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
  amountOther: number;
}

interface PromotionPlatformInputValues {
  amountMeituan: string;
  amountJingdong: string;
  amountTaobao: string;
  amountOther: string;
}

function formatPromotionInputValue(value: number) {
  return value === 0 ? "" : String(value);
}

function parsePromotionInputValue(rawValue: string) {
  const parsed = Number.parseFloat(rawValue);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

interface DayData {
  promotionAmount: number;
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
  amountOther: number;
  realOrderCount: number;
  realOrderMeituan: number;
  realOrderJingdong: number;
  realOrderTaobao: number;
  realOrderDoudian: number;
  brushOrderCount: number;
  brushOrderMeituan?: number;
  brushOrderJingdong?: number;
  brushOrderTaobao?: number;
  brushOrderDoudian?: number;
  cancelledOrderCount: number;
  cancelledOrderMeituan?: number;
  cancelledOrderJingdong?: number;
  cancelledOrderTaobao?: number;
  cancelledOrderDoudian?: number;
  shopBreakdown?: Record<string, number>;
}

interface PromotionCalendarModalProps {
  initialDate: string;
  localShops?: Array<{ id: string; name: string; address: string }>;
  userId?: string;
  userName?: string;
  onClose: () => void;
  readOnly?: boolean;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PromotionCalendarModal({
  initialDate,
  localShops,
  userId,
  userName,
  onClose,
  readOnly = false,
}: PromotionCalendarModalProps) {
  const { showToast } = useToast();
  const today = useMemo(() => new Date(), []);
  
  // 阻止背景滚动
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);
  
  // 当前日历正在查看的年份与月份
  const [currentYear, setCurrentYear] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return Number.isNaN(d.getTime()) ? today.getFullYear() : d.getFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return Number.isNaN(d.getTime()) ? today.getMonth() + 1 : d.getMonth() + 1;
  });

  // 当前点击选中的日期
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return Number.isNaN(d.getTime()) ? formatDate(today) : formatDate(d);
  });

  // 当前活动 Tab: 'calendar' (日历) 或 'chart' (趋势图)
  const [activeTab, setActiveTab] = useState<"calendar" | "chart">("calendar");
  // 当前展示趋势图的平台
  const [chartPlatform, setChartPlatform] = useState<PromotionPlatformKey>("amountMeituan");
  // 趋势图当前选择的店铺（空字符串 = 全部汇总）
  const [chartShopName, setChartShopName] = useState<string>("");

  // 日历网格数据状态与 Loading 状态
  const [calendarData, setCalendarData] = useState<Record<string, DayData>>({});
  const [isLoading, setIsLoading] = useState(false);
  // 日历 hover 气泡状态
  const [hoveredDateStr, setHoveredDateStr] = useState<string | null>(null);

  const availableShops = useMemo(() => {
    if (localShops && localShops.length > 0) {
      return localShops;
    }
    return [{ id: "default", name: "默认店铺", address: "" }];
  }, [localShops]);

  // 当前展开手风琴的店铺名称（一次只能打开一家店铺）
  const [expandedShopName, setExpandedShopName] = useState<string | null>(() => {
    return localShops?.[0]?.name || "默认店铺";
  });

  const toggleShopExpand = (shopName: string) => {
    setExpandedShopName((prev) => (prev === shopName ? null : shopName));
  };

  const [shopExpenses, setShopExpenses] = useState<Record<string, PromotionPlatformAmounts>>({});
  const [shopInputs, setShopInputs] = useState<Record<string, PromotionPlatformInputValues>>({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 计算当前月份的 42 天网格
  const gridDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDayPrevMonth = new Date(currentYear, currentMonth - 1, 0);
    const lastDayCurrentMonth = new Date(currentYear, currentMonth, 0);

    const prevMonthDays = firstDay.getDay(); // 星期天为0，星期一为1...
    const currentMonthDays = lastDayCurrentMonth.getDate();

    const list: Date[] = [];

    // 上月补白
    for (let i = prevMonthDays - 1; i >= 0; i--) {
      list.push(new Date(currentYear, currentMonth - 2, lastDayPrevMonth.getDate() - i));
    }

    // 本月日期
    for (let i = 1; i <= currentMonthDays; i++) {
      list.push(new Date(currentYear, currentMonth - 1, i));
    }

    // 下月补白：能用 35 天 (5行) 装下的不强制凑 42 天 (6行)，减少屏幕纵向占用
    const targetCount = list.length <= 35 ? 35 : 42;
    const remaining = targetCount - list.length;
    for (let i = 1; i <= remaining; i++) {
      list.push(new Date(currentYear, currentMonth, i));
    }

    return list;
  }, [currentYear, currentMonth]);

  // 趋势图数据计算
  const chartData = useMemo(() => {
    const currentMonthDays = gridDays.filter((day) => day.getMonth() + 1 === currentMonth);
    const sorted = [...currentMonthDays].sort((a, b) => a.getTime() - b.getTime());
    
    return sorted.map((day) => {
      const dayStr = formatDate(day);
      const data = calendarData[dayStr];
      const dateLabel = `${day.getDate()}日`;
      
      return {
        dateStr: dayStr,
        dateLabel,
        amountMeituan: data?.amountMeituan || 0,
        amountJingdong: data?.amountJingdong || 0,
        amountTaobao: data?.amountTaobao || 0,
        amountOther: data?.amountOther || 0,
        orderMeituan: data?.realOrderMeituan || 0,
        orderJingdong: data?.realOrderJingdong || 0,
        orderTaobao: data?.realOrderTaobao || 0,
        orderDoudian: data?.realOrderDoudian || 0,
      };
    });
  }, [gridDays, currentMonth, calendarData]);

  // 趋势图统计汇总
  const summaryInfo = useMemo(() => {
    let totalPromo = 0;
    let totalOrders = 0;
    
    chartData.forEach((day) => {
      const platformMeta = PROMOTION_PLATFORM_META[chartPlatform];
      totalPromo += day[chartPlatform];
      totalOrders += day[platformMeta.orderKey];
    });
    
    const avgCostPerOrder = totalOrders > 0 ? totalPromo / totalOrders : 0;
    
    return {
      totalPromo,
      totalOrders,
      avgCostPerOrder,
    };
  }, [chartData, chartPlatform]);

  // 从后端拉取整个日期网格的数据（支持按店铺过滤，用于趋势图）
  const fetchCalendarData = useCallback(async (shopFilter?: string) => {
    if (gridDays.length === 0) return;
    setIsLoading(true);
    const startDateStr = formatDate(gridDays[0]);
    const endDateStr = formatDate(gridDays[gridDays.length - 1]);
    const shopParam = shopFilter ? `&shopName=${encodeURIComponent(shopFilter)}` : "";
    const userParam = userId ? `&userId=${encodeURIComponent(userId)}` : "";
    try {
      const res = await fetch(`/api/promotion/calendar?startDate=${startDateStr}&endDate=${endDateStr}${shopParam}${userParam}`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        if (body.success && body.data) {
          setCalendarData(body.data);
        }
      } else {
        showToast("无法加载日历统计数据", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("网络请求失败，请稍后重试", "error");
    } finally {
      setIsLoading(false);
    }
  }, [gridDays, userId, showToast]);

  useEffect(() => {
    fetchCalendarData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, currentMonth]);

  // 趋势图切换店铺时，重新拉取对应店铺的日历数据
  useEffect(() => {
    if (activeTab === "chart") {
      fetchCalendarData(chartShopName || undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartShopName, activeTab]);

  // 获取当前日期所有店铺的推广费明细列表
  // 获取当前日期所有店铺的推广费明细列表
  const fetchDayDetail = useCallback(async (dateStr: string) => {
    setIsDetailLoading(true);
    try {
      const userParam = userId ? `&userId=${encodeURIComponent(userId)}` : "";
      const res = await fetch(`/api/promotion?date=${dateStr}${userParam}`, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json();
        const items = Array.isArray(body.items) ? body.items : [];
        const mappedExpenses: Record<string, PromotionPlatformAmounts> = {};
        const mappedInputs: Record<string, PromotionPlatformInputValues> = {};

        // 初始化所有已知店铺为 0 确保防空
        availableShops.forEach((shop) => {
          mappedExpenses[shop.name] = {
            amountMeituan: 0,
            amountJingdong: 0,
            amountTaobao: 0,
            amountOther: 0,
          };
          mappedInputs[shop.name] = {
            amountMeituan: "",
            amountJingdong: "",
            amountTaobao: "",
            amountOther: "",
          };
        });

        items.forEach((item: any) => {
          const sName = item.shopName || (availableShops[0]?.name || "默认店铺");
          mappedExpenses[sName] = {
            amountMeituan: item.amountMeituan || 0,
            amountJingdong: item.amountJingdong || 0,
            amountTaobao: item.amountTaobao || 0,
            amountOther: item.amountOther || 0,
          };
          mappedInputs[sName] = {
            amountMeituan: formatPromotionInputValue(item.amountMeituan || 0),
            amountJingdong: formatPromotionInputValue(item.amountJingdong || 0),
            amountTaobao: formatPromotionInputValue(item.amountTaobao || 0),
            amountOther: formatPromotionInputValue(item.amountOther || 0),
          };
        });

        setShopExpenses(mappedExpenses);
        setShopInputs(mappedInputs);
      }
    } catch (e) {
      console.error("Failed to fetch day detail:", e);
    } finally {
      setIsDetailLoading(false);
    }
  }, [availableShops, userId]);

  // 当选择日期变化时，异步拉取该日期各店铺的明细
  useEffect(() => {
    void fetchDayDetail(selectedDateStr);
  }, [selectedDateStr, fetchDayDetail]);

  // 仅在当前展开的店铺不存在于店铺列表时进行安全重置（允许为 null 正常收起）
  useEffect(() => {
    if (expandedShopName && !availableShops.some((s) => s.name === expandedShopName)) {
      setExpandedShopName(null);
    }
  }, [availableShops, expandedShopName]);

  // 切换上个月
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  // 切换下个月
  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // 回到今天
  const handleBackToToday = () => {
    const todayStr = formatDate(today);
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
    setSelectedDateStr(todayStr);
  };

  // 某个店铺的某个渠道输入变动
  const handleFieldChange = (shopName: string, key: keyof PromotionPlatformAmounts, rawValue: string) => {
    if (readOnly) return;
    if (!/^\d*(\.\d{0,2})?$/.test(rawValue)) {
      return;
    }
    const parsed = parsePromotionInputValue(rawValue);
    setShopInputs((prev) => ({
      ...prev,
      [shopName]: {
        ...(prev[shopName] || {
          amountMeituan: "",
          amountJingdong: "",
          amountTaobao: "",
          amountOther: "",
        }),
        [key]: rawValue,
      },
    }));
    setShopExpenses((prev) => ({
      ...prev,
      [shopName]: {
        ...(prev[shopName] || {
          amountMeituan: 0,
          amountJingdong: 0,
          amountTaobao: 0,
          amountOther: 0,
        }),
        [key]: parsed,
      },
    }));
  };

  // 保存当日所有店铺的推广费
  const handleSave = async () => {
    if (readOnly) return;
    setIsSaving(true);
    try {
      const items = availableShops.map((shop) => {
        const expenses = shopExpenses[shop.name] || {
          amountMeituan: 0,
          amountJingdong: 0,
          amountTaobao: 0,
          amountOther: 0,
        };
        return {
          date: selectedDateStr,
          shopName: shop.name,
          amountMeituan: expenses.amountMeituan,
          amountJingdong: expenses.amountJingdong,
          amountTaobao: expenses.amountTaobao,
          amountOther: expenses.amountOther,
          userId,
        };
      });

      const res = await fetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDateStr,
          userId,
          items,
        }),
      });

      if (res.ok) {
        showToast(`${selectedDateStr} 各店铺推广费已保存`, "success");
        // 重新加载该月统计以同步更新大盘日历的聚合求和结果
        void fetchCalendarData();
      } else {
        showToast("保存失败，请稍后重试", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("网络错误，保存失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 获取指定店铺的小计金额
  const getShopTotal = useCallback(
    (shopName: string) => {
      const expense = shopExpenses[shopName];
      if (!expense) return 0;
      return (
        (expense.amountMeituan || 0) +
        (expense.amountJingdong || 0) +
        (expense.amountTaobao || 0) +
        (expense.amountOther || 0)
      );
    },
    [shopExpenses]
  );

  // 当日所有店铺合计金额
  const editTotalAmount = useMemo(() => {
    return Object.values(shopExpenses).reduce((acc, cur) => {
      return (
        acc +
        (cur.amountMeituan || 0) +
        (cur.amountJingdong || 0) +
        (cur.amountTaobao || 0) +
        (cur.amountOther || 0)
      );
    }, 0);
  }, [shopExpenses]);

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-3 sm:p-4">
      {/* 蒙层 */}
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-md" onClick={onClose} />
      
      {/* 弹窗主体（高阶微质感与现代全胶囊体系） */}
      <div className="relative flex h-auto max-h-[95dvh] md:h-[90dvh] md:max-h-[700px] w-full max-w-5xl flex-col overflow-y-auto overscroll-contain md:overflow-hidden rounded-[28px] sm:rounded-[32px] border border-black/8 bg-white/95 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-[#111827]/92 dark:shadow-black/50 md:flex-row">
        
        {/* 左侧日历主栏 */}
        <div className={`flex flex-col shrink-0 md:shrink p-3 sm:p-6 ${
          activeTab === "calendar" ? "md:flex-1 md:min-h-0" : "flex-1 min-h-[260px] md:min-h-0"
        } ${
          activeTab === "calendar" ? "md:border-r md:border-border/60" : ""
        }`}>
          
          {/* 日历头部 */}
          <div className="flex flex-col gap-2 pb-2.5 sm:gap-3 sm:pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50">
            <div className="flex items-center justify-between sm:justify-start gap-2.5">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                  <CalendarIcon size={14} className="sm:w-4 sm:h-4" />
                </div>
                <h2 className="text-sm sm:text-lg font-black tracking-tight text-foreground whitespace-nowrap">
                  {userName ? `${userName} · ` : ""}{currentYear} 年 {currentMonth} 月
                </h2>
              </div>
              {/* 模式选择 Tab */}
              <div className="inline-flex rounded-full border border-border/70 bg-muted/40 p-0.5 sm:p-1 shadow-2xs shrink-0">
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === "calendar"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  月度日历
                </button>
                <button
                  onClick={() => setActiveTab("chart")}
                  className={`rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === "chart"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  趋势曲线
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-1 sm:gap-1.5 w-full sm:w-auto">
              <button
                onClick={handleBackToToday}
                className="rounded-full border border-border/70 bg-white px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] transition-all cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
              >
                今天
              </button>
              <button
                onClick={handlePrevMonth}
                className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] cursor-pointer active:scale-90 shadow-2xs transition-all"
                title="上个月"
              >
                <ChevronLeft size={14} className="sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] cursor-pointer active:scale-90 shadow-2xs transition-all"
                title="下个月"
              >
                <ChevronRight size={14} className="sm:w-4 sm:h-4" />
              </button>
              <button
                onClick={onClose}
                className={`${activeTab === "chart" ? "" : "md:hidden"} inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] cursor-pointer shadow-2xs transition-all`}
              >
                <X size={14} className="sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>

          {activeTab === "calendar" ? (
            <>
              {/* 星期表头 */}
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center text-[10px] sm:text-xs text-muted-foreground/80 py-1 sm:py-2 border-b border-black/4 dark:border-white/8 uppercase tracking-wider">
                <span>日</span>
                <span>一</span>
                <span>二</span>
                <span>三</span>
                <span>四</span>
                <span>五</span>
                <span>六</span>
              </div>

              {/* 日历网格 */}
              <div className="relative mt-1 sm:mt-2 grid grid-cols-7 gap-1 sm:gap-1.5 md:flex-1 bg-transparent dark:bg-transparent">
                {isLoading && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/30 backdrop-blur-[1px] dark:bg-slate-950/20 rounded-xl">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                )}
                
                {gridDays.map((day, idx) => {
                  const dayStr = formatDate(day);
                  const isCurrentMonth = day.getMonth() + 1 === currentMonth;
                  const isSelected = dayStr === selectedDateStr;
                  const isToday = formatDate(today) === dayStr;
                  const dayDetail = calendarData[dayStr];
                  const isHovered = hoveredDateStr === dayStr;
                  
                  const promoAmount = dayDetail?.promotionAmount || 0;
                  const shopBreakdown = dayDetail?.shopBreakdown || {};
                  const shopEntries = Object.entries(shopBreakdown).filter(([, v]) => v > 0);
                  const hasMultiShop = shopEntries.length > 1;

                  return (
                    <div
                      key={`${dayStr}-${idx}`}
                      onClick={() => isCurrentMonth && setSelectedDateStr(dayStr)}
                      onMouseEnter={() => isCurrentMonth && promoAmount > 0 && setHoveredDateStr(dayStr)}
                      onMouseLeave={() => setHoveredDateStr(null)}
                      className={`group relative flex h-9 sm:h-16 min-h-[36px] sm:min-h-[64px] cursor-pointer flex-col items-center justify-center rounded-lg sm:rounded-xl border p-0.5 sm:p-2 transition-all duration-150 ${
                        !isCurrentMonth
                          ? "pointer-events-none border-transparent text-slate-200 dark:text-slate-800 opacity-20"
                          : isSelected
                          ? "border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/20 shadow-sm"
                          : isToday
                          ? "border-orange-500/50 bg-orange-50/50 dark:border-orange-500/30 dark:bg-orange-500/4 shadow-2xs"
                          : "border-black/6 bg-white/72 hover:bg-white dark:border-white/8 dark:bg-white/[0.045] dark:hover:bg-white/[0.075]"
                      }`}
                    >
                      {/* 顶部：日期数字 */}
                      <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                        <span className={`text-[11px] sm:text-sm font-semibold leading-none ${
                          isSelected
                            ? "text-orange-600 dark:text-orange-400"
                            : isToday
                            ? "text-orange-600 dark:text-orange-400"
                            : isCurrentMonth
                            ? "text-slate-700 dark:text-slate-300"
                            : "text-slate-200 dark:text-slate-800"
                        }`}>
                          {day.getDate()}
                        </span>
                        {isToday && isCurrentMonth && (
                          <span className="h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full shrink-0 bg-orange-500 dark:bg-orange-400" />
                        )}
                      </div>

                      {/* 中下部 data：精致居中的推广费用 */}
                      {isCurrentMonth && promoAmount > 0 && (
                        <div className="mt-0.5 sm:mt-1 flex items-center justify-center text-[8px] sm:text-[10px] text-center w-full leading-none">
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 tabular-nums hidden sm:inline">
                            -¥{promoAmount.toFixed(2)}
                          </span>
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 tabular-nums sm:hidden">
                            -¥{promoAmount >= 1000 ? `${(promoAmount / 1000).toFixed(1)}k` : promoAmount.toFixed(0)}
                          </span>
                        </div>
                      )}

                      {/* Hover 气泡：各店铺推广明细（仅多店铺时展示分店信息） */}
                      {isHovered && isCurrentMonth && promoAmount > 0 && (
                        <div
                          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 w-max max-w-[180px] rounded-2xl border border-black/8 bg-white/95 px-3 py-2.5 shadow-xl backdrop-blur-sm dark:border-white/12 dark:bg-slate-900/96 pointer-events-none"
                          style={{ filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.14))" }}
                        >
                          {/* 尖角 */}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid rgba(255,255,255,0.95)" }} />
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">{dayStr} 推广费</p>
                          {hasMultiShop ? (
                            <div className="space-y-1">
                              {shopEntries.map(([name, amount]) => (
                                <div key={name} className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[90px]">{name}</span>
                                  <span className="text-[11px] text-orange-600 dark:text-orange-400 tabular-nums shrink-0">-¥{amount.toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="border-t border-black/6 dark:border-white/8 pt-1 mt-1 flex items-center justify-between gap-3">
                                <span className="text-[11px] text-foreground">合计</span>
                                <span className="text-[11px] text-orange-600 dark:text-orange-400 tabular-nums font-medium">-¥{promoAmount.toFixed(2)}</span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[13px] text-orange-600 dark:text-orange-400 tabular-nums">-¥{promoAmount.toFixed(2)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col mt-4 space-y-4 min-h-0">
              {/* 工具栏：平台切换（左）+ 店铺切换（右），移动端自动折行 */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 overflow-visible">
                {/* 左：平台选择 */}
                <div className="flex gap-2 flex-wrap">
                  {PROMOTION_PLATFORM_ROWS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setChartPlatform(p.key)}
                      className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-all cursor-pointer ${
                        chartPlatform === p.key
                          ? p.activeColor
                          : "border-black/6 bg-white/72 text-muted-foreground hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/[0.045] dark:hover:bg-white/[0.075]"
                      }`}
                    >
                      <img src={p.logo} alt={p.label} className="h-3.5 w-3.5 object-contain" />
                      <span className="hidden sm:inline">{p.label}</span>
                    </button>
                  ))}
                </div>

                {/* 右：店铺过滤（多店铺时才显示） */}
                {localShops && localShops.length > 1 && (
                  <CustomSelect
                    value={chartShopName}
                    onChange={setChartShopName}
                    options={[
                      { value: "", label: "全部汇总" },
                      ...localShops.map((shop) => ({ value: shop.name, label: shop.name })),
                    ]}
                    className="h-8 w-32 shrink-0"
                    triggerClassName="h-full rounded-full border border-border/70 bg-white px-3 text-xs font-bold shadow-2xs dark:border-white/10 dark:bg-white/[0.06]"
                   />
                )}
              </div>

              {/* 折线图图表 */}
              <div className="h-[260px] md:h-[380px] rounded-2xl border border-black/6 bg-white/72 p-3 shadow-2xs dark:border-white/8 dark:bg-white/[0.04] sm:p-4 flex flex-col justify-between">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onClick={(nextState: any) => {
                      if (!nextState) return;
                      let clickedDateStr = nextState.activePayload?.[0]?.payload?.dateStr;
                      if (!clickedDateStr && typeof nextState.activeTooltipIndex === "number") {
                        const idx = nextState.activeTooltipIndex;
                        clickedDateStr = chartData[idx]?.dateStr;
                      }
                      if (clickedDateStr) {
                        setSelectedDateStr(clickedDateStr);
                      }
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                    <XAxis
                      dataKey="dateLabel"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickFormatter={(val) => `¥${val}`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                      tickFormatter={(val) => `${val}单`}
                    />
                    <RechartsTooltip content={<CustomTooltip platform={chartPlatform} />} />
                    <RechartsLegend content={<CustomLegend platform={chartPlatform} />} />
                    
                    {/* 推广费用折线 */}
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey={chartPlatform}
                      stroke={PROMOTION_PLATFORM_META[chartPlatform].stroke}
                      strokeWidth={2.5}
                      dot={{ r: 2, strokeWidth: 1 }}
                      activeDot={{ r: 4 }}
                      name="推广费用"
                    />
                    
                    {/* 订单数量折线 */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={PROMOTION_PLATFORM_META[chartPlatform].orderKey}
                      stroke="#10B981"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 2, strokeWidth: 1 }}
                      activeDot={{ r: 4 }}
                      name="真实订单数"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 汇总指标卡片 */}
              <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                <div className="rounded-2xl border border-black/6 bg-white/78 p-2.5 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/[0.04] overflow-hidden">
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground block uppercase truncate tracking-wider">累计推广费</span>
                  <span className="text-xs sm:text-sm font-black text-foreground mt-0.5 block tabular-nums truncate">
                    {summaryInfo.totalPromo > 0 ? "-" : ""}¥{summaryInfo.totalPromo.toFixed(2)}
                  </span>
                </div>
                <div className="rounded-2xl border border-black/6 bg-white/78 p-2.5 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/[0.04] overflow-hidden">
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground block uppercase truncate tracking-wider">真实订单量</span>
                  <span className="text-xs sm:text-sm font-black text-foreground mt-0.5 block tabular-nums truncate">
                    {summaryInfo.totalOrders} 单
                  </span>
                </div>
                <div className="rounded-2xl border border-black/6 bg-white/78 p-2.5 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/[0.04] overflow-hidden">
                  <span className="text-[9px] sm:text-[10px] font-bold text-muted-foreground block uppercase truncate tracking-wider">单均推广成本</span>
                  <span className="text-xs sm:text-sm font-black text-foreground mt-0.5 block tabular-nums truncate">
                    ¥{summaryInfo.avgCostPerOrder.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧编辑侧边栏 */}
        {/* 右侧编辑侧边栏 */}
        {activeTab === "calendar" && (
          <div className="flex w-full flex-col md:w-[340px] md:h-full md:max-h-full border-t border-border/60 bg-zinc-50/65 dark:bg-white/[0.035] md:border-t-0 overflow-hidden">
          
            <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 md:p-6 space-y-3 sm:space-y-5 custom-scrollbar">
            {/* 选中日期标题与关闭按钮 */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">推广费录入</span>
                <h3 className="text-base font-black text-foreground mt-0.5 flex items-center gap-2">
                  <span>{selectedDateStr}</span>
                  {selectedDateStr === formatDate(today) && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">今天</span>
                  )}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="hidden md:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-all hover:text-foreground hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] cursor-pointer shadow-2xs"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            {/* 店铺推广费手风琴列表 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  {readOnly ? "各店铺推广费明细" : "各店铺推广费录入"}
                </span>
                {readOnly ? (
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">只读模式</span>
                ) : null}
                {isDetailLoading && (
                  <Loader2 size={12} className="animate-spin text-primary" />
                )}
              </div>

              <div className="space-y-2.5">
                {availableShops.map((shop) => {
                  const isExpanded = expandedShopName === shop.name;
                  const shopTotal = getShopTotal(shop.name);
                  const inputs = shopInputs[shop.name] || {
                    amountMeituan: "",
                    amountJingdong: "",
                    amountTaobao: "",
                    amountOther: "",
                  };

                  return (
                    <div
                      key={shop.id || shop.name}
                      className={cn(
                        "overflow-hidden rounded-2xl border transition-all duration-250 ease-in-out",
                        isExpanded
                          ? "border-primary/40 bg-white shadow-xs dark:border-primary/40 dark:bg-white/[0.06]"
                          : "border-border/70 bg-white/75 hover:border-border hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                      )}
                    >
                      {/* 店铺卡片头部：点击切换展开/折叠 */}
                      <button
                        type="button"
                        onClick={() => toggleShopExpand(shop.name)}
                        className="flex w-full items-center justify-between p-3 sm:px-3.5 text-left transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <div
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-250",
                              isExpanded
                                ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            <Store size={15} />
                          </div>
                          <span className="text-xs font-bold text-foreground truncate max-w-[140px] sm:max-w-[160px]">
                            {shop.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              "text-xs font-mono font-bold tabular-nums transition-colors duration-250",
                              shopTotal > 0 ? "text-primary" : "text-muted-foreground/60"
                            )}
                          >
                            ¥{shopTotal.toFixed(2)}
                          </span>
                          <ChevronDown
                            size={16}
                            className={cn(
                              "text-muted-foreground transition-transform duration-250 ease-in-out",
                              isExpanded && "rotate-180 text-primary"
                            )}
                          />
                        </div>
                      </button>

                      {/* 展开的渠道单列输入框（平滑折叠动画） */}
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-250 ease-in-out",
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="border-t border-border/50 bg-zinc-50/70 p-3 pt-2.5 space-y-2 dark:border-white/5 dark:bg-black/20">
                            {PROMOTION_PLATFORM_ROWS.map((row) => (
                              <label
                                key={row.key}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-full border border-border/70 bg-white px-3 transition-all dark:border-white/10 dark:bg-white/[0.06] shadow-2xs",
                                  readOnly
                                    ? "cursor-default opacity-85"
                                    : "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 cursor-text hover:border-border dark:hover:bg-white/[0.08]"
                                )}
                              >
                                {/* 平台 Logo */}
                                <img
                                  src={row.logo}
                                  alt={row.label}
                                  className="h-4 w-4 shrink-0 object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                                <span className="w-8 shrink-0 text-[11px] font-bold text-foreground">{row.label}</span>
                                <span className="text-[11px] text-muted-foreground font-mono">¥</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  pattern="^\d*(\.\d{0,2})?$"
                                  placeholder="0.00"
                                  value={inputs[row.key]}
                                  onChange={(e) => !readOnly && handleFieldChange(shop.name, row.key, e.target.value)}
                                  disabled={isSaving || readOnly}
                                  readOnly={readOnly}
                                  onKeyDown={(e) => {
                                    if (!readOnly && e.key === "Enter") handleSave();
                                  }}
                                  className={cn(
                                    "h-8 flex-1 bg-transparent text-xs font-mono font-bold text-foreground outline-none placeholder:text-muted-foreground/30 tabular-nums",
                                    readOnly && "cursor-default"
                                  )}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 表单底部合计与保存按钮 */}
            <div className="shrink-0 border-t border-border/60 bg-white/95 dark:bg-[#111827]/95 backdrop-blur-sm p-4 md:px-6 md:py-4 flex items-center justify-between gap-3 shadow-xs">
            <div className="text-xs text-muted-foreground">
              <span className="text-[10px] font-bold uppercase tracking-wider block">当日合计</span>
              <div className="text-base font-black text-foreground mt-0.5 tabular-nums">
                {editTotalAmount > 0 ? "-" : ""}¥{editTotalAmount.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
{!readOnly ? (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
                保存数据
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground/80 px-2 py-1 font-medium select-none">
                仅供查看，不可修改
              </span>
            )}
            </div>
          </div>

        </div>
        )}

      </div>
    </div>,
    document.body
  );
}
