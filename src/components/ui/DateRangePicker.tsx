"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval,
  isToday,
  startOfDay,
  endOfDay,
  subDays,
  isAfter,
  isBefore,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createPortal } from "react-dom";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const parseSafeDate = (value: string | Date | null | undefined, fallback: Date = new Date()): Date => {
  if (!value) return fallback;
  if (value instanceof Date) return isNaN(value.getTime()) ? fallback : value;
  const d = typeof value === "string" ? new Date(value.replace(/-/g, "/")) : new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
};

export interface DateRangePickerProps {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  onChange: (range: { startDate: string; endDate: string }) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  showClear?: boolean;
  minDate?: string;
  maxDate?: string;
  isCompact?: boolean;
  includeToday?: boolean;
}

export function DateRangePicker({
  startDate = "",
  endDate = "",
  onChange,
  placeholder = "选择日期范围",
  className,
  triggerClassName,
  showClear = true,
  minDate,
  maxDate,
  isCompact,
  includeToday = true,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => parseSafeDate(endDate || startDate));
  const [selectingStart, setSelectingStart] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    showAbove?: boolean;
  }>({ top: 0, left: 0, width: 0, maxHeight: 600 });

  const parsedStartDate = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate.replace(/-/g, "/"));
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }, [startDate]);

  const parsedEndDate = useMemo(() => {
    if (!endDate) return null;
    const d = new Date(endDate.replace(/-/g, "/"));
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }, [endDate]);

  const parsedMinDate = useMemo(() => {
    if (!minDate) return null;
    const d = new Date(minDate.replace(/-/g, "/"));
    return isNaN(d.getTime()) ? null : startOfDay(d);
  }, [minDate]);

  const parsedMaxDate = useMemo(() => {
    if (!maxDate) return null;
    const d = new Date(maxDate.replace(/-/g, "/"));
    return isNaN(d.getTime()) ? null : endOfDay(d);
  }, [maxDate]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  // 同步当前月份
  useEffect(() => {
    if (isOpen) {
      if (parsedEndDate) {
        setCurrentMonth(parsedEndDate);
      } else if (parsedStartDate) {
        setCurrentMonth(parsedStartDate);
      }
      setSelectingStart(null);
      setHoverDate(null);
    }
  }, [isOpen]);

  const updatePosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const dropdownHeight = 420;
      const dropdownMinWidth = 320;
      const spaceBelow = windowHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const showAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

      const maxHeight = Math.max(showAbove ? spaceAbove : spaceBelow, 240);
      let left = rect.left;

      if (left + dropdownMinWidth > windowWidth - 16) {
        left = windowWidth - dropdownMinWidth - 16;
      }
      if (left < 16) {
        left = 16;
      }

      setDropdownPosition({
        top: showAbove ? rect.top - 8 : rect.bottom + 8,
        left,
        width: Math.max(rect.width, dropdownMinWidth),
        maxHeight,
        showAbove,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);

      const originalStyle = window.getComputedStyle(document.body).overflow;
      if (originalStyle !== "hidden") {
        document.body.style.overflow = "hidden";
      }

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isClickInsideTrigger = containerRef.current?.contains(target);
        const isClickInsidePicker = pickerRef.current?.contains(target);

        if (!isClickInsideTrigger && !isClickInsidePicker) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
        document.removeEventListener("mousedown", handleClickOutside);
        if (originalStyle !== "hidden") {
          document.body.style.overflow = originalStyle;
        }
      };
    }
  }, [isOpen, updatePosition]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextYear = () => setCurrentMonth(addMonths(currentMonth, 12));
  const prevYear = () => setCurrentMonth(subMonths(currentMonth, 12));

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
  });

  const handleDateClick = (date: Date) => {
    const dayStart = startOfDay(date);
    if (parsedMinDate && dayStart < parsedMinDate) return;
    if (parsedMaxDate && dayStart > parsedMaxDate) return;

    if (!selectingStart) {
      // 第一步：选定开始日期
      setSelectingStart(dayStart);
    } else {
      // 第二步：选定结束日期
      if (isBefore(dayStart, selectingStart)) {
        // 如果点击的比开始日期还早，则把当前点击的重设为开始日期
        setSelectingStart(dayStart);
      } else {
        // 完成范围选择
        const startStr = format(selectingStart, "yyyy-MM-dd");
        const endStr = format(dayStart, "yyyy-MM-dd");
        onChange({ startDate: startStr, endDate: endStr });
        setSelectingStart(null);
        setHoverDate(null);
        setIsOpen(false);
      }
    }
  };

  const setPresetRange = (start: Date, end: Date) => {
    const clampedEnd = parsedMaxDate && isAfter(end, parsedMaxDate) ? parsedMaxDate : end;
    const clampedStart = parsedMinDate && isBefore(start, parsedMinDate) ? parsedMinDate : start;
    onChange({
      startDate: format(clampedStart, "yyyy-MM-dd"),
      endDate: format(clampedEnd, "yyyy-MM-dd"),
    });
    setSelectingStart(null);
    setHoverDate(null);
    setIsOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange({ startDate: "", endDate: "" });
    setSelectingStart(null);
    setHoverDate(null);
  };

  // 格式化展示标签（同一年省略后者的年份，避免截断省略号）
  const displayLabel = useMemo(() => {
    if (!startDate && !endDate) return placeholder;
    if (startDate && endDate) {
      if (startDate === endDate) return startDate;
      const startYear = startDate.slice(0, 4);
      const endYear = endDate.slice(0, 4);
      if (startYear === endYear) {
        return `${startDate} ~ ${endDate.slice(5)}`;
      }
      return `${startDate} ~ ${endDate}`;
    }
    if (startDate) return `${startDate} 起`;
    return `至 ${endDate}`;
  }, [startDate, endDate, placeholder]);

  const hasValue = Boolean(startDate || endDate);

  // 预设项计算
  const presets = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const yesterday = subDays(today, 1);
    const last7Days = subDays(today, 6);
    const last30Days = subDays(today, 29);
    const currentMonthStart = startOfMonth(today);
    const prevMonthEnd = subDays(currentMonthStart, 1);
    const prevMonthStart = startOfMonth(prevMonthEnd);

    const list = [
      ...(includeToday ? [{ label: "今天", start: today, end: today }] : []),
      { label: "昨天", start: yesterday, end: yesterday },
      { label: "近7天", start: last7Days, end: today },
      { label: "近30天", start: last30Days, end: today },
      { label: "本月", start: currentMonthStart, end: today },
      { label: "上月", start: prevMonthStart, end: prevMonthEnd },
    ];

    return list;
  }, [includeToday]);

  return (
    <div className={cn("relative inline-flex", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={hasValue ? (startDate && endDate ? `${startDate} ~ ${endDate}` : displayLabel) : ""}
        className={cn(
          "flex w-full h-full items-center justify-center rounded-full bg-white dark:bg-white/5 border border-black/8 dark:border-white/10 px-3.5 text-xs transition-all outline-none whitespace-nowrap",
          isCompact && "px-2 text-xs",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 shadow-sm" : "hover:bg-black/2 dark:hover:bg-white/10",
          !hasValue && "text-muted-foreground",
          triggerClassName
        )}
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0 whitespace-nowrap">
          {!isCompact && (
            <CalendarIcon
              size={13}
              className={cn("shrink-0", hasValue ? "text-primary" : "text-muted-foreground")}
            />
          )}
          <span className={cn("whitespace-nowrap text-center", hasValue ? "text-foreground font-medium" : "text-muted-foreground")}>
            {displayLabel}
          </span>
        </div>
        {showClear && hasValue && (
          <X
            size={13}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-1.5 cursor-pointer"
            onClick={handleClear}
          />
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                ref={pickerRef}
                initial={{ opacity: 0, scale: 0.95, y: dropdownPosition.showAbove ? 10 : -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: dropdownPosition.showAbove ? 10 : -10 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: "fixed",
                  top: dropdownPosition.showAbove ? "auto" : `${dropdownPosition.top}px`,
                  bottom: dropdownPosition.showAbove ? `${window.innerHeight - dropdownPosition.top}px` : "auto",
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                  minWidth: "320px",
                  maxWidth: "calc(100vw - 2rem)",
                  maxHeight: `${dropdownPosition.maxHeight}px`,
                  overflowY: "auto",
                  pointerEvents: "auto",
                }}
                className="z-1000001 rounded-2xl bg-white/95 dark:bg-zinc-900/90 backdrop-blur-xl p-3.5 border border-black/10 dark:border-white/15 shadow-2xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)]"
              >
                <div className="max-w-[320px] mx-auto">
                  {/* 快捷范围预设按钮 */}
                  <div className={cn(
                    "mb-3 pb-2.5 border-b border-black/6 dark:border-white/8 gap-1",
                    presets.length === 6 ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-5"
                  )}>
                    {presets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setPresetRange(preset.start, preset.end)}
                        className="rounded-lg bg-black/4 hover:bg-black/8 dark:bg-white/6 dark:hover:bg-white/12 py-1 text-center text-xs font-medium text-foreground transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* 正在选择提示 */}
                  {selectingStart ? (
                    <div className="mb-2 text-center text-xs font-semibold text-primary">
                      已选择开始日期：{format(selectingStart, "yyyy-MM-dd")}，请点击结束日期
                    </div>
                  ) : null}

                  {/* 年月份导航 */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          prevYear();
                        }}
                        className="rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-white/8 text-muted-foreground/50 hover:text-foreground transition-all"
                        title="上一年"
                      >
                        <ChevronLeft size={14} strokeWidth={3} />
                      </button>
                      <h4 className="text-sm font-bold text-foreground whitespace-nowrap">
                        {format(currentMonth, "yyyy年 MM月")}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          nextYear();
                        }}
                        className="rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-white/8 text-muted-foreground/50 hover:text-foreground transition-all"
                        title="下一年"
                      >
                        <ChevronRight size={14} strokeWidth={3} />
                      </button>
                    </div>

                    <div className="flex gap-0.5 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          prevMonth();
                        }}
                        className="rounded-xl p-1.5 hover:bg-slate-100 dark:hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all"
                        title="上一月"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          nextMonth();
                        }}
                        className="rounded-xl p-1.5 hover:bg-slate-100 dark:hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all"
                        title="下一月"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  {/* 星期表头 */}
                  <div className="grid grid-cols-7 mb-1.5 px-1">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                      <div key={day} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* 日历格子 */}
                  <div className="grid grid-cols-7 gap-y-1 px-1">
                    {days.map((day, idx) => {
                      const dayStart = startOfDay(day);
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isTodayDate = isToday(day);
                      const isBeforeMin = parsedMinDate ? dayStart < parsedMinDate : false;
                      const isAfterMax = parsedMaxDate ? dayStart > parsedMaxDate : false;
                      const isDisabled = isBeforeMin || isAfterMax;

                      // 区间判断
                      const activeStart = selectingStart || parsedStartDate;
                      const activeEnd = selectingStart
                        ? (hoverDate && isAfter(hoverDate, selectingStart) ? hoverDate : null)
                        : parsedEndDate;

                      const isStart = activeStart ? isSameDay(dayStart, activeStart) : false;
                      const isEnd = activeEnd ? isSameDay(dayStart, activeEnd) : false;
                      const isInRange =
                        activeStart &&
                        activeEnd &&
                        isAfter(dayStart, activeStart) &&
                        isBefore(dayStart, activeEnd);

                      const isRowStart = idx % 7 === 0;
                      const isRowEnd = idx % 7 === 6;
                      const hasRangeSelection = Boolean(activeStart && activeEnd && !isSameDay(activeStart, activeEnd));

                      return (
                        <div
                          key={idx}
                          className="relative flex items-center justify-center p-0.5"
                          onMouseEnter={() => {
                            if (selectingStart) {
                              setHoverDate(dayStart);
                            }
                          }}
                        >
                          {/* 连续选区底色胶囊轨道 (Track) */}
                          {hasRangeSelection && isInRange && (
                            <div
                              className={cn(
                                "absolute inset-y-0.5 left-0 right-0 bg-primary/10 dark:bg-primary/20",
                                isRowStart && "rounded-l-xl",
                                isRowEnd && "rounded-r-xl"
                              )}
                            />
                          )}

                          {hasRangeSelection && isStart && (
                            <div
                              className={cn(
                                "absolute inset-y-0.5 left-1/2 right-0 bg-primary/10 dark:bg-primary/20",
                                isRowEnd && "rounded-r-xl"
                              )}
                            />
                          )}

                          {hasRangeSelection && isEnd && (
                            <div
                              className={cn(
                                "absolute inset-y-0.5 left-0 right-1/2 bg-primary/10 dark:bg-primary/20",
                                isRowStart && "rounded-l-xl"
                              )}
                            />
                          )}

                          <button
                            type="button"
                            disabled={isDisabled}
                            onClick={() => handleDateClick(day)}
                            className={cn(
                              "aspect-square w-full rounded-xl text-xs flex items-center justify-center transition-all duration-150 relative z-10",
                              !isCurrentMonth && "text-muted-foreground/40",
                              isCurrentMonth && !isDisabled && "text-foreground hover:bg-primary/15 hover:text-primary",
                              isDisabled && "text-muted-foreground/20 cursor-not-allowed",
                              (isStart || isEnd) &&
                                "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/30 hover:bg-primary hover:text-primary-foreground",
                              isTodayDate && !isStart && !isEnd && "text-primary ring-1 ring-primary/40 font-semibold"
                            )}
                          >
                            {format(day, "d")}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* 底部功能条 */}
                  <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5 px-1">
                    <button
                      type="button"
                      onClick={() => handleClear()}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="text-xs font-semibold text-primary hover:underline px-2 py-1"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
