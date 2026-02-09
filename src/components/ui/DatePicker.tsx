"use client";

import { useState, useRef, useEffect } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, eachDayOfInterval, isToday, startOfDay, endOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
  align?: "left" | "right";
}

export function DatePicker({ value, onChange, placeholder = "选择日期", className, showClear = true, minDate, maxDate, isCompact, align = "left" }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(value ? new Date(value) : new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? new Date(value) : null;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

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
          "flex w-full h-full items-center justify-between rounded-xl max-md:rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm transition-all outline-none ring-offset-background",
          isCompact && "px-2 text-xs",
          isOpen ? "ring-2 ring-primary/20 border-primary/20" : "hover:bg-muted/50 dark:hover:bg-white/10",
          !selectedDate && "text-muted-foreground"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
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

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
                "absolute top-full z-50 mt-2 w-full min-w-[280px] rounded-2xl border border-border dark:border-white/10 bg-white dark:bg-card/70 dark:backdrop-blur-xl p-4 shadow-2xl",
                align === "left" ? "left-0" : "right-0"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-foreground">
                {format(currentMonth, "yyyy年 MM月", { locale: zhCN })}
              </h4>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 mb-2">
              {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                <div key={day} className="text-center text-[10px] font-bold text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
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

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <button 
                    type="button"
                    onClick={() => handleDateClick(new Date())}
                    className="text-[10px] font-bold text-primary hover:underline px-2 py-1"
                >
                    今天
                </button>
                <button 
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground px-2 py-1"
                >
                    关闭
                </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
