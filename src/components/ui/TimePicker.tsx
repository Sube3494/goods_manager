"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Clock } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TimePickerProps {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  placeholder?: string;
}

export function TimePicker({
  value,
  onChange,
  className,
  triggerClassName,
  placeholder = "选择时间",
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  // 解析当前时和分
  const [hour, minute] = useMemo(() => {
    if (!value || !value.includes(":")) return ["12", "00"];
    const parts = value.split(":");
    return [parts[0].padStart(2, "0"), parts[1].padStart(2, "0")];
  }, [value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")), []);

  // 点击外部收起
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 展开时自动滚动到当前选中的值
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (hourListRef.current) {
          const selectedHourEl = hourListRef.current.querySelector("[data-selected='true']");
          if (selectedHourEl) {
            hourListRef.current.scrollTop = (selectedHourEl as HTMLElement).offsetTop - 70;
          }
        }
        if (minuteListRef.current) {
          const selectedMinEl = minuteListRef.current.querySelector("[data-selected='true']");
          if (selectedMinEl) {
            minuteListRef.current.scrollTop = (selectedMinEl as HTMLElement).offsetTop - 70;
          }
        }
      }, 50);
    }
  }, [isOpen]);

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${minute}`);
  };

  const handleSelectMinute = (m: string) => {
    onChange(`${hour}:${m}`);
  };

  return (
    <div ref={containerRef} className={cn("relative inline-block text-left", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "inline-flex h-8 items-center justify-between gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-foreground outline-none transition-all hover:bg-black/[0.02] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08] active:scale-[0.98] cursor-pointer min-w-[76px]",
          triggerClassName
        )}
      >
        <span className="font-medium font-mono">{value || placeholder}</span>
        <Clock size={12} className="text-muted-foreground/75 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 z-[110] w-[130px] h-[180px] bg-white dark:bg-slate-900 border border-border/80 dark:border-white/10 rounded-xl shadow-xl flex overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
          {/* 小时列 */}
          <div
            ref={hourListRef}
            className="flex-1 overflow-y-auto border-r border-border/40 dark:border-white/5 scrollbar-none py-1 scroll-smooth"
            style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
          >
            {hours.map((h) => {
              const isSelected = h === hour;
              return (
                <button
                  key={h}
                  type="button"
                  data-selected={isSelected}
                  onClick={() => handleSelectHour(h)}
                  className={cn(
                    "w-full h-7 text-[11px] font-mono font-medium flex items-center justify-center transition-colors cursor-pointer",
                    isSelected
                      ? "bg-rose-500 text-white font-semibold"
                      : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  {h}
                </button>
              );
            })}
          </div>

          {/* 分钟列 */}
          <div
            ref={minuteListRef}
            className="flex-1 overflow-y-auto scrollbar-none py-1 scroll-smooth"
            style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
          >
            {minutes.map((m) => {
              const isSelected = m === minute;
              return (
                <button
                  key={m}
                  type="button"
                  data-selected={isSelected}
                  onClick={() => handleSelectMinute(m)}
                  className={cn(
                    "w-full h-7 text-[11px] font-mono font-medium flex items-center justify-center transition-colors cursor-pointer",
                    isSelected
                      ? "bg-rose-500 text-white font-semibold"
                      : "text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
