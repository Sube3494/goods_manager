"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, isToday, startOfDay, endOfDay } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createPortal } from "react-dom";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showClear?: boolean;
  minDate?: string;
  maxDate?: string;
  isCompact?: boolean;
  triggerClassName?: string;
}

export function DatePicker({ value, onChange, placeholder = "选择日期", className, showClear = true, minDate, maxDate, isCompact, triggerClassName }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    showAbove?: boolean;
  }>({ top: 0, left: 0, width: 0 });

  const selectedDate = value ? new Date(value) : null;

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const updatePosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const dropdownHeight = 350; 
      const dropdownMinWidth = 280;
      const spaceBelow = windowHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      // 始终优先左对齐，但在右侧空间不足时左移以防止溢出
      let left = rect.left;

      // 边界溢出保护 (保持 16px 间距)
      if (left + dropdownMinWidth > windowWidth - 16) {
        left = windowWidth - dropdownMinWidth - 16;
      }
      if (left < 16) {
        left = 16;
      }

      setDropdownPosition({
        top: showAbove ? rect.top - 8 : rect.bottom + 8,
        left: left,
        width: rect.width,
        showAbove
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      
      // 记录原始样式并禁止背景滚动
      const originalStyle = window.getComputedStyle(document.body).overflow;
      // 只有在当前没有被锁定的情况下才锁定，避免冲突
      if (originalStyle !== 'hidden') {
        document.body.style.overflow = 'hidden';
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
        // 恢复原始样式
        if (originalStyle !== 'hidden') {
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
    if (minDate && isSameDay(date, new Date(minDate)) === false && date < startOfDay(new Date(minDate))) return;
    if (maxDate && isSameDay(date, new Date(maxDate)) === false && date > endOfDay(new Date(maxDate))) return;

    onChange(format(date, "yyyy-MM-dd"));
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full h-full items-center justify-between rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm transition-all outline-none ring-offset-background",
          isCompact && "px-2 text-xs",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 shadow-lg" : "hover:bg-muted/50 dark:hover:bg-white/10",
          !selectedDate && "text-muted-foreground",
          triggerClassName
        )}
      >
        <div className="flex items-center justify-center gap-2 min-w-0 flex-1">
            {!isCompact && <CalendarIcon size={14} className={cn("shrink-0", selectedDate ? "text-primary" : "text-muted-foreground")} />}
            <span className={cn("truncate", selectedDate ? "text-foreground font-medium" : "text-muted-foreground")}>
            {selectedDate ? format(selectedDate, "yyyy-MM-dd", { locale: zhCN }) : placeholder}
            </span>
        </div>
        {showClear && selectedDate && (
            <X 
                size={14} 
                className="text-muted-foreground hover:text-foreground transition-colors" 
                onClick={(e) => {
                    e.stopPropagation();
                    onChange("");
                }}
            />
        )}
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
          <motion.div
            ref={pickerRef}
            initial={{ opacity: 0, scale: 0.95, y: dropdownPosition.showAbove ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: dropdownPosition.showAbove ? 10 : -10 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              minWidth: '280px',
              maxWidth: 'calc(100vw - 2rem)',
              pointerEvents: 'auto'
            }}
            className="z-1000001 rounded-[24px] glass p-3 shadow-2xl border border-white/10"
          >
            <div className="max-w-[280px] mx-auto">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-1.5 overflow-hidden">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); prevYear(); }}
                        className="rounded-lg p-1 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
                        title="上一年"
                    >
                        <ChevronLeft size={14} strokeWidth={3} />
                    </button>
                    <h4 className="text-sm font-bold text-foreground whitespace-nowrap">
                    {format(currentMonth, "yyyy年 MM月", { locale: zhCN })}
                    </h4>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); nextYear(); }}
                        className="rounded-lg p-1 hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
                        title="下一年"
                    >
                        <ChevronRight size={14} strokeWidth={3} />
                    </button>
                </div>
                <div className="flex gap-0.5 ml-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); prevMonth(); }}
                    className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    title="上一月"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); nextMonth(); }}
                    className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    title="下一月"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-2 px-1">
                {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                  <div key={day} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 px-1">
                {days.map((day, idx) => {
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isTodayDate = isToday(day);
                  const isBeforeMin = minDate ? startOfDay(day) < startOfDay(new Date(minDate)) : false;
                  const isAfterMax = maxDate ? startOfDay(day) > startOfDay(new Date(maxDate)) : false;
                  const isDisabled = isBeforeMin || isAfterMax;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleDateClick(day)}
                      className={cn(
                        "aspect-square w-full rounded-lg text-xs flex items-center justify-center transition-all duration-200 relative",
                        !isCurrentMonth && "text-muted-foreground/30",
                        isCurrentMonth && !isDisabled && "text-foreground hover:bg-primary/10 hover:text-primary",
                        isDisabled && "text-muted-foreground/20 cursor-not-allowed",
                        isSelected && "bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/30 hover:bg-primary hover:text-primary-foreground",
                        isTodayDate && !isSelected && "text-primary ring-1 ring-primary/30"
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 px-1">
                  <button 
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDateClick(new Date()); }}
                      className="text-[10px] font-bold text-primary hover:underline px-2 py-1"
                  >
                      今天
                  </button>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground px-2 py-1"
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
