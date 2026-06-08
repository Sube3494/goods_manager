"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Loader2, Check, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
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
  platform: "amountMeituan" | "amountJingdong" | "amountTaobao";
}

function CustomTooltip({ active, payload, platform }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const dateStr = payload[0].payload.dateStr;
    const promoVal = payload[0].value;
    const orderVal = payload[1]?.value ?? 0;
    const platformLabel = platform === "amountMeituan" ? "美团" : platform === "amountJingdong" ? "京东" : "淘宝";
    const dotColor = platform === "amountMeituan" ? "bg-[#FFB800]" : platform === "amountJingdong" ? "bg-[#DF1E1D]" : "bg-[#FF5500]";
    
    return (
      <div className="rounded-xl border border-black/8 bg-white/95 p-3 shadow-md dark:border-white/10 dark:bg-slate-900/95 backdrop-blur-xs">
        <p className="text-[11px] text-muted-foreground">{dateStr}</p>
        <div className="mt-1.5 space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${dotColor}`} />
              {platformLabel}推广费:
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

function CustomLegend({ platform }: { platform: "amountMeituan" | "amountJingdong" | "amountTaobao" }) {
  const platformLabel = platform === "amountMeituan" ? "美团" : platform === "amountJingdong" ? "京东" : "淘宝";
  const color = platform === "amountMeituan" ? "bg-[#FFB800]" : platform === "amountJingdong" ? "bg-[#DF1E1D]" : "bg-[#FF5500]";
  return (
    <div className="flex justify-center gap-6 text-[11px] text-muted-foreground pt-2">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {platformLabel}推广费用 (左轴)
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-md bg-[#10B981]" style={{ clipPath: "polygon(0 40%, 100% 40%, 100% 60%, 0 60%)" }} />
        真实订单数 (右轴)
      </span>
    </div>
  );
}

// 对应推广费平台配置，包含官方Logo与字段映射
const PROMOTION_PLATFORM_ROWS = [
  { key: "amountMeituan" as const, label: "美团", logo: "/platform/美团.svg" },
  { key: "amountJingdong" as const, label: "京东", logo: "/platform/京东.svg" },
  { key: "amountTaobao" as const, label: "淘宝", logo: "/platform/淘宝.svg" },
  { key: "amountOther" as const, label: "其他", logo: "/platform/其他.svg" },
];

interface PromotionPlatformAmounts {
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
  amountOther: number;
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
  brushOrderCount: number;
  cancelledOrderCount: number;
}

interface PromotionCalendarModalProps {
  initialDate: string;
  onClose: () => void;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PromotionCalendarModal({
  initialDate,
  onClose,
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
  const [chartPlatform, setChartPlatform] = useState<"amountMeituan" | "amountJingdong" | "amountTaobao">("amountMeituan");

  // 日历网格数据状态与 Loading 状态
  const [calendarData, setCalendarData] = useState<Record<string, DayData>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 右侧表单编辑状态
  const [editVals, setEditVals] = useState<PromotionPlatformAmounts>({
    amountMeituan: 0,
    amountJingdong: 0,
    amountTaobao: 0,
    amountOther: 0,
  });
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

    // 下月补白，凑够 42 天 (6行7列)
    const remaining = 42 - list.length;
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
        orderMeituan: data?.realOrderMeituan || 0,
        orderJingdong: data?.realOrderJingdong || 0,
        orderTaobao: data?.realOrderTaobao || 0,
      };
    });
  }, [gridDays, currentMonth, calendarData]);

  // 趋势图统计汇总
  const summaryInfo = useMemo(() => {
    let totalPromo = 0;
    let totalOrders = 0;
    
    chartData.forEach((day) => {
      if (chartPlatform === "amountMeituan") {
        totalPromo += day.amountMeituan;
        totalOrders += day.orderMeituan;
      } else if (chartPlatform === "amountJingdong") {
        totalPromo += day.amountJingdong;
        totalOrders += day.orderJingdong;
      } else if (chartPlatform === "amountTaobao") {
        totalPromo += day.amountTaobao;
        totalOrders += day.orderTaobao;
      }
    });
    
    const avgCostPerOrder = totalOrders > 0 ? totalPromo / totalOrders : 0;
    
    return {
      totalPromo,
      totalOrders,
      avgCostPerOrder,
    };
  }, [chartData, chartPlatform]);

  // 从后端拉取整个日期网格的数据
  const fetchCalendarData = async () => {
    if (gridDays.length === 0) return;
    setIsLoading(true);
    const startDateStr = formatDate(gridDays[0]);
    const endDateStr = formatDate(gridDays[gridDays.length - 1]);
    try {
      const res = await fetch(`/api/promotion/calendar?startDate=${startDateStr}&endDate=${endDateStr}`, { cache: "no-store" });
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
  };

  useEffect(() => {
    fetchCalendarData();
  }, [currentYear, currentMonth]);

  // 每次选择日期变化，或者日历数据变化时，更新右侧表单的值
  useEffect(() => {
    const data = calendarData[selectedDateStr];
    if (data) {
      setEditVals({
        amountMeituan: data.amountMeituan || 0,
        amountJingdong: data.amountJingdong || 0,
        amountTaobao: data.amountTaobao || 0,
        amountOther: data.amountOther || 0,
      });
    } else {
      setEditVals({
        amountMeituan: 0,
        amountJingdong: 0,
        amountTaobao: 0,
        amountOther: 0,
      });
    }
  }, [selectedDateStr, calendarData]);

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

  // 字段修改输入
  const handleFieldChange = (key: keyof PromotionPlatformAmounts, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    setEditVals((prev) => ({
      ...prev,
      [key]: isNaN(parsed) ? 0 : Math.max(0, parsed),
    }));
  };

  // 保存当日推广费
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDateStr,
          amountMeituan: editVals.amountMeituan,
          amountJingdong: editVals.amountJingdong,
          amountTaobao: editVals.amountTaobao,
          amountOther: editVals.amountOther,
        }),
      });

      if (res.ok) {
        showToast(`${selectedDateStr} 推广费已保存`, "success");
        // 本地更新该格数据，避免重新发起大请求
        setCalendarData((prev) => {
          const total = editVals.amountMeituan + editVals.amountJingdong + editVals.amountTaobao + editVals.amountOther;
          const currentDay = prev[selectedDateStr] || {
            promotionAmount: 0,
            amountMeituan: 0,
            amountJingdong: 0,
            amountTaobao: 0,
            amountOther: 0,
            realOrderCount: 0,
            brushOrderCount: 0,
            cancelledOrderCount: 0,
          };
          return {
            ...prev,
            [selectedDateStr]: {
              ...currentDay,
              promotionAmount: total,
              amountMeituan: editVals.amountMeituan,
              amountJingdong: editVals.amountJingdong,
              amountTaobao: editVals.amountTaobao,
              amountOther: editVals.amountOther,
            },
          };
        });
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

  const editTotalAmount = editVals.amountMeituan + editVals.amountJingdong + editVals.amountTaobao + editVals.amountOther;

  // 计算选中日期的订单比例数据
  const selectedDayInfo = useMemo(() => {
    const detail = calendarData[selectedDateStr];
    if (!detail) return null;
    const real = detail.realOrderCount || 0;
    const brush = detail.brushOrderCount || 0;
    const cancelled = detail.cancelledOrderCount || 0;
    const total = real + brush + cancelled;
    return {
      real,
      brush,
      cancelled,
      total,
      realPercent: total > 0 ? (real / total) * 100 : 0,
      brushPercent: total > 0 ? (brush / total) * 100 : 0,
      cancelledPercent: total > 0 ? (cancelled / total) * 100 : 0,
    };
  }, [selectedDateStr, calendarData]);

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-3 sm:p-4">
      {/* 蒙层 */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* 弹窗主体（与系统设计高度统一的经典卡片风格） */}
      <div className="relative flex h-auto max-h-[95dvh] md:h-[90dvh] md:max-h-[680px] w-full max-w-5xl flex-col overflow-y-auto overscroll-contain md:overflow-hidden rounded-[24px] border border-black/8 bg-white dark:border-white/10 dark:bg-[#0b111e]/98 shadow-[0_24px_64px_rgba(15,23,42,0.20)] md:flex-row">
        
        {/* 左侧日历主栏 */}
        <div className={`flex flex-col shrink-0 md:shrink p-3.5 sm:p-6 ${
          activeTab === "calendar" ? "md:flex-1 min-h-[480px] md:min-h-0" : "flex-1 min-h-[320px] md:min-h-0"
        } ${
          activeTab === "calendar" ? "md:border-r md:border-black/6 md:dark:border-white/8" : ""
        }`}>
          
          {/* 日历头部 */}
          <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between border-b border-black/4 dark:border-white/8">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon size={18} className="text-muted-foreground shrink-0" />
                <h2 className="text-base text-foreground sm:text-xl whitespace-nowrap">
                  {currentYear} 年 {currentMonth} 月
                </h2>
              </div>
              {/* 模式选择 Tab */}
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-white/5 shadow-2xs shrink-0">
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`rounded-md px-2.5 py-1 text-xs font-normal transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === "calendar"
                      ? "bg-white text-foreground shadow-2xs dark:bg-slate-800"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  月度日历
                </button>
                <button
                  onClick={() => setActiveTab("chart")}
                  className={`rounded-md px-2.5 py-1 text-xs font-normal transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === "chart"
                      ? "bg-white text-foreground shadow-2xs dark:bg-slate-800"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  趋势曲线
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-1.5 w-full sm:w-auto">
              <button
                onClick={handleBackToToday}
                className="rounded-lg border border-black/8 bg-white px-2.5 py-1.5 text-xs text-foreground hover:bg-slate-50 dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/8 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              >
                今天
              </button>
              <button
                onClick={handlePrevMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/4 cursor-pointer active:scale-90"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={handleNextMonth}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/4 cursor-pointer active:scale-90"
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={onClose}
                className={`${activeTab === "chart" ? "" : "md:hidden"} inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/4 cursor-pointer`}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {activeTab === "calendar" ? (
            <>
              {/* 星期表头 */}
              <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground/80 py-2 border-b border-black/4 dark:border-white/8 uppercase tracking-wider">
                <span>日</span>
                <span>一</span>
                <span>二</span>
                <span>三</span>
                <span>四</span>
                <span>五</span>
                <span>六</span>
              </div>

              {/* 日历网格 */}
              <div className="relative mt-2 grid grid-cols-7 gap-1.5 md:flex-1 bg-transparent dark:bg-transparent">
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
                  
                  const promoAmount = dayDetail?.promotionAmount || 0;

                  return (
                    <div
                      key={`${dayStr}-${idx}`}
                      onClick={() => isCurrentMonth && setSelectedDateStr(dayStr)}
                      className={`group relative flex h-14 sm:h-16 min-h-[56px] sm:min-h-[64px] cursor-pointer flex-col items-center justify-center rounded-xl border p-1 sm:p-2 transition-all duration-150 ${
                        !isCurrentMonth
                          ? "pointer-events-none border-transparent text-slate-200 dark:text-slate-800 opacity-20"
                          : isSelected
                          ? "border-orange-500 bg-orange-50 dark:border-orange-500 dark:bg-orange-950/20 shadow-sm"
                          : isToday
                          ? "border-orange-500/50 bg-orange-50/50 dark:border-orange-500/30 dark:bg-orange-500/4 shadow-2xs"
                          : "border-slate-100 bg-slate-50/70 hover:bg-slate-100/50 dark:border-white/5 dark:bg-white/2 dark:hover:bg-white/5"
                      }`}
                    >
                      {/* 顶部：日期数字 */}
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-xs sm:text-sm ${
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
                          <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-orange-500 dark:bg-orange-400" />
                        )}
                      </div>

                      {/* 中下部数据：精致居中的推广费用 */}
                      {isCurrentMonth && promoAmount > 0 && (
                        <div className="mt-1 flex items-center justify-center text-[9px] sm:text-[10px] text-center w-full leading-none">
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 tabular-nums">
                            -¥{promoAmount.toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col mt-4 space-y-4 overflow-hidden">
              {/* 平台选择 */}
              <div className="flex justify-center sm:justify-start gap-2 flex-wrap">
                {[
                  { key: "amountMeituan" as const, label: "美团", logo: "/platform/美团.svg", activeColor: "border-[#FFB800] bg-[#FFB800]/5 text-[#FFB800]" },
                  { key: "amountJingdong" as const, label: "京东", logo: "/platform/京东.svg", activeColor: "border-[#DF1E1D] bg-[#DF1E1D]/5 text-[#DF1E1D]" },
                  { key: "amountTaobao" as const, label: "淘宝", logo: "/platform/淘宝.svg", activeColor: "border-[#FF5500] bg-[#FF5500]/5 text-[#FF5500]" },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setChartPlatform(p.key)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all cursor-pointer ${
                      chartPlatform === p.key
                        ? p.activeColor
                        : "border-slate-100 bg-slate-50/50 text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/6"
                    }`}
                  >
                    <img src={p.logo} alt={p.label} className="h-4 w-4 object-contain" />
                    <span>{p.label}趋势</span>
                  </button>
                ))}
              </div>

              {/* 折线图图表 */}
              <div className="h-[260px] md:h-[380px] bg-slate-50/30 dark:bg-white/1 rounded-2xl border border-slate-100/50 dark:border-white/8 p-3 sm:p-4 flex flex-col justify-between">
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
                      stroke={chartPlatform === "amountMeituan" ? "#FFB800" : chartPlatform === "amountJingdong" ? "#DF1E1D" : "#FF5500"}
                      strokeWidth={2.5}
                      dot={{ r: 2, strokeWidth: 1 }}
                      activeDot={{ r: 4 }}
                      name="推广费用"
                    />
                    
                    {/* 订单数量折线 */}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={chartPlatform === "amountMeituan" ? "orderMeituan" : chartPlatform === "amountJingdong" ? "orderJingdong" : "orderTaobao"}
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
                <div className="rounded-xl border border-slate-100 bg-white p-2 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/2 overflow-hidden">
                  <span className="text-[8.5px] sm:text-[10px] text-muted-foreground block uppercase truncate">累计推广费</span>
                  <span className="text-xs sm:text-sm text-foreground mt-0.5 block tabular-nums truncate">
                    {summaryInfo.totalPromo > 0 ? "-" : ""}¥{summaryInfo.totalPromo.toFixed(1)}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-2 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/2 overflow-hidden">
                  <span className="text-[8.5px] sm:text-[10px] text-muted-foreground block uppercase truncate">真实订单量</span>
                  <span className="text-xs sm:text-sm text-foreground mt-0.5 block tabular-nums truncate">
                    {summaryInfo.totalOrders} 单
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-2 sm:p-3 shadow-2xs dark:border-white/8 dark:bg-white/2 overflow-hidden">
                  <span className="text-[8.5px] sm:text-[10px] text-muted-foreground block uppercase truncate">单均推广成本</span>
                  <span className="text-xs sm:text-sm text-foreground mt-0.5 block tabular-nums truncate">
                    ¥{summaryInfo.avgCostPerOrder.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧编辑侧边栏 */}
        {activeTab === "calendar" && (
          <div className="flex w-full flex-col p-5 md:w-[320px] md:p-6 justify-between border-t md:border-t-0 border-black/6 dark:border-white/8">
          
          <div className="space-y-5">
            {/* 选中日期标题与关闭按钮 */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">日期统计</span>
                <h3 className="text-base text-foreground mt-0.5 flex items-center gap-2">
                  <span>{selectedDateStr}</span>
                  {selectedDateStr === formatDate(today) && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">今天</span>
                  )}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="hidden md:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white text-muted-foreground transition-all hover:text-foreground dark:border-white/8 dark:bg-white/5 cursor-pointer shadow-2xs"
              >
                <X size={16} />
              </button>
            </div>

            {/* 每日订单统计卡片 */}
            {selectedDayInfo && (
              <div className="rounded-2xl border border-black/6 bg-white/80 p-4 shadow-2xs dark:border-white/6 dark:bg-white/2 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>订单统计</span>
                  <span className="text-foreground">{selectedDayInfo.total} 单</span>
                </div>
                
                {/* 简明无渐变的纯色进度条 */}
                <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex shadow-inner">
                  {selectedDayInfo.total > 0 ? (
                    <>
                      <div className="bg-emerald-500" style={{ width: `${selectedDayInfo.realPercent}%` }} />
                      <div className="bg-rose-500" style={{ width: `${selectedDayInfo.brushPercent}%` }} />
                      <div className="bg-slate-400 dark:bg-slate-600" style={{ width: `${selectedDayInfo.cancelledPercent}%` }} />
                    </>
                  ) : (
                    <div className="h-full w-full bg-slate-200 dark:bg-slate-800" />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
                  <div className="rounded-xl bg-black/3 py-2 dark:bg-white/4 shadow-2xs">
                    <span className="text-emerald-600 dark:text-emerald-400">真实 {selectedDayInfo.real}</span>
                  </div>
                  <div className="rounded-xl bg-black/3 py-2 dark:bg-white/4 shadow-2xs">
                    <span className="text-rose-600 dark:text-rose-400">刷单 {selectedDayInfo.brush}</span>
                  </div>
                  <div className="rounded-xl bg-black/3 py-2 dark:bg-white/4 shadow-2xs">
                    <span className="text-slate-600 dark:text-slate-400">取消 {selectedDayInfo.cancelled}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 各平台金额输入（经典清爽文本标签布局） */}
            <div className="space-y-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground block">渠道推广费</span>
              {PROMOTION_PLATFORM_ROWS.map((row) => (
                <label
                  key={row.key}
                  className="flex items-center gap-3 rounded-xl border border-black/8 bg-white px-3 focus-within:ring-2 focus-within:ring-primary/12 focus-within:border-primary/30 transition-all dark:border-white/10 dark:bg-white/4 cursor-text shadow-2xs hover:border-black/15 dark:hover:border-white/15"
                >
                  {/* 平台 Logo */}
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-white/5 p-0.5">
                    <img
                      src={row.logo}
                      alt={row.label}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  
                  <span className="w-10 shrink-0 text-sm text-foreground">{row.label}</span>
                  <span className="text-sm text-muted-foreground">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editVals[row.key] === 0 ? "" : String(editVals[row.key])}
                    onChange={(e) => handleFieldChange(row.key, e.target.value)}
                    disabled={isSaving}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    className="h-11 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/30 tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* 表单底部合计与保存按钮 */}
          <div className="pt-4 border-t border-black/6 dark:border-white/8 mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              当日合计 
              <div className="text-base text-foreground mt-0.5 tabular-nums">
                {editTotalAmount > 0 ? "-" : ""}¥{editTotalAmount.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-5 rounded-xl bg-linear-to-r bg-foreground text-xs text-background transition-all hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                保存数据
              </button>
            </div>
          </div>

        </div>
        )}

      </div>
    </div>,
    document.body
  );
}
