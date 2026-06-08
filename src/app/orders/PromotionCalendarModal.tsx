"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Loader2, Check, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// 对应三个推广费平台
const PROMOTION_PLATFORM_ROWS = [
  { key: "amountMeituan" as const, label: "美团" },
  { key: "amountJingdong" as const, label: "京东" },
  { key: "amountTaobao" as const, label: "淘宝" },
];

interface PromotionPlatformAmounts {
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
}

interface DayData {
  promotionAmount: number;
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
  realOrderCount: number;
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

  // 日历网格数据状态与 Loading 状态
  const [calendarData, setCalendarData] = useState<Record<string, DayData>>({});
  const [isLoading, setIsLoading] = useState(false);

  // 右侧表单编辑状态
  const [editVals, setEditVals] = useState<PromotionPlatformAmounts>({
    amountMeituan: 0,
    amountJingdong: 0,
    amountTaobao: 0,
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
        amountMeituan: data.amountMeituan,
        amountJingdong: data.amountJingdong,
        amountTaobao: data.amountTaobao,
      });
    } else {
      setEditVals({
        amountMeituan: 0,
        amountJingdong: 0,
        amountTaobao: 0,
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
        }),
      });

      if (res.ok) {
        showToast(`${selectedDateStr} 推广费已保存`, "success");
        // 本地更新该格数据，避免重新发起大请求
        setCalendarData((prev) => {
          const total = editVals.amountMeituan + editVals.amountJingdong + editVals.amountTaobao;
          const currentDay = prev[selectedDateStr] || {
            promotionAmount: 0,
            amountMeituan: 0,
            amountJingdong: 0,
            amountTaobao: 0,
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

  const editTotalAmount = editVals.amountMeituan + editVals.amountJingdong + editVals.amountTaobao;

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
      <div className="relative flex h-[90dvh] max-h-[680px] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white dark:border-white/10 dark:bg-[#0d1420] shadow-[0_24px_64px_rgba(15,23,42,0.20)] md:flex-row">
        
        {/* 左侧日历主栏 */}
        <div className="flex flex-1 flex-col p-5 sm:p-6 md:border-r md:border-black/6 md:dark:border-white/8">
          
          {/* 日历头部 */}
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-3">
              <CalendarIcon size={18} className="text-muted-foreground" />
              <h2 className="text-lg font-black text-foreground sm:text-xl">
                {currentYear} 年 {currentMonth} 月
              </h2>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleBackToToday}
                className="rounded-lg border border-black/8 bg-white px-2.5 py-1.5 text-xs font-black text-foreground hover:bg-slate-50 dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/8 transition-all cursor-pointer active:scale-95"
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
                className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/4 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* 星期表头 */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground/80 py-2 border-b border-black/4 dark:border-white/5 uppercase tracking-wider">
            <span>日</span>
            <span>一</span>
            <span>二</span>
            <span>三</span>
            <span>四</span>
            <span>五</span>
            <span>六</span>
          </div>

          {/* 日历网格 */}
          <div className="relative mt-2 grid flex-1 grid-cols-7 gap-1.5">
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
              const realOrderCount = dayDetail?.realOrderCount || 0;

              return (
                <div
                  key={`${dayStr}-${idx}`}
                  onClick={() => isCurrentMonth && setSelectedDateStr(dayStr)}
                  className={`group relative flex h-15 cursor-pointer flex-col justify-between rounded-xl border p-2 transition-all duration-150 ${
                    !isCurrentMonth
                      ? "pointer-events-none border-transparent text-slate-200 dark:text-slate-800 opacity-20"
                      : isSelected
                      ? "border-blue-600 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30 shadow-xs"
                      : isToday
                      ? "border-transparent bg-transparent"
                      : "border-transparent bg-transparent hover:bg-slate-100/85 dark:hover:bg-white/5"
                  }`}
                >
                  {/* 日期数字与真实订单数 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-bold ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400 font-extrabold"
                          : isToday
                          ? "text-blue-600 dark:text-blue-400 font-black"
                          : isCurrentMonth
                          ? "text-slate-700 dark:text-slate-300"
                          : "text-slate-200 dark:text-slate-800"
                      }`}>
                        {day.getDate()}
                      </span>
                      {isToday && isCurrentMonth && (
                        <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-blue-600 dark:bg-blue-400" />
                      )}
                    </div>
                    {isCurrentMonth && realOrderCount > 0 && (
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[8px] font-black transition-all ${
                        isSelected 
                          ? "bg-blue-600/10 text-blue-600 dark:bg-blue-400/20 dark:text-blue-400" 
                          : "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      }`}>
                        {realOrderCount}单
                      </span>
                    )}
                  </div>

                  {/* 推广费用 */}
                  <div className="text-right truncate">
                    {isCurrentMonth && promoAmount > 0 ? (
                      <span className={`text-[10px] font-black ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-primary dark:text-primary-foreground"
                      }`}>
                        ¥{promoAmount.toFixed(0)}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右侧编辑侧边栏 */}
        <div className="flex w-full flex-col bg-slate-50/50 p-5 dark:bg-white/[0.02] md:w-[320px] md:p-6 justify-between border-t md:border-t-0 border-black/6 dark:border-white/8">
          
          <div className="space-y-5">
            {/* 选中日期标题与关闭按钮 */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">日期统计</span>
                <h3 className="text-base font-black text-foreground mt-0.5 flex items-center gap-2">
                  <span>{selectedDateStr}</span>
                  {selectedDateStr === formatDate(today) && (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black text-primary">今天</span>
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
                <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                  <span>订单统计</span>
                  <span className="font-bold text-foreground">{selectedDayInfo.total} 单</span>
                </div>
                
                {/* 简明无渐变的纯色进度条 */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 flex">
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

                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold text-muted-foreground">
                  <div className="rounded-lg bg-black/2 py-1.5 dark:bg-white/2">
                    <span className="text-emerald-500">真实 {selectedDayInfo.real}</span>
                  </div>
                  <div className="rounded-lg bg-black/2 py-1.5 dark:bg-white/2">
                    <span className="text-rose-500">刷单 {selectedDayInfo.brush}</span>
                  </div>
                  <div className="rounded-lg bg-black/2 py-1.5 dark:bg-white/2">
                    <span>取消 {selectedDayInfo.cancelled}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 各平台金额输入（经典清爽文本标签布局） */}
            <div className="space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">渠道推广费</span>
              {PROMOTION_PLATFORM_ROWS.map((row) => (
                <label
                  key={row.key}
                  className="flex items-center gap-3 rounded-xl border border-black/8 bg-white/90 px-4 focus-within:ring-2 focus-within:ring-primary/12 focus-within:border-primary/30 transition-all dark:border-white/10 dark:bg-slate-900/40 cursor-text"
                >
                  <span className="w-12 shrink-0 text-xs font-bold text-foreground">{row.label}</span>
                  <span className="text-xs font-bold text-muted-foreground">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={editVals[row.key] === 0 ? "" : String(editVals[row.key])}
                    onChange={(e) => handleFieldChange(row.key, e.target.value)}
                    disabled={isSaving}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                    className="h-11 flex-1 bg-transparent text-xs font-bold text-foreground outline-none placeholder:text-muted-foreground/30 tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* 表单底部合计与保存按钮 */}
          <div className="pt-4 border-t border-black/6 dark:border-white/8 mt-4 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground font-semibold">
              当日合计 
              <div className="text-base font-black text-foreground mt-0.5 tabular-nums">
                ¥{editTotalAmount.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-5 rounded-xl bg-gradient-to-r bg-foreground text-xs font-black text-background transition-all hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                保存数据
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}
