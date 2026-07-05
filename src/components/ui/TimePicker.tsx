"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    showAbove?: boolean;
  }>({ top: 0, left: 0 });

  // 解析当前时和分
  const [hour, minute] = useMemo(() => {
    if (!value || !value.includes(":")) return ["12", "00"];
    const parts = value.split(":");
    return [parts[0].padStart(2, "0"), parts[1].padStart(2, "0")];
  }, [value]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")), []);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const updatePosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const dropdownHeight = 220;
      const spaceBelow = windowHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      setDropdownPosition({
        top: showAbove ? rect.top - 8 : rect.bottom + 8,
        left: rect.left,
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

  // 展开时自动滚动到当前选中的值
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (hourListRef.current) {
          const el = hourListRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
          if (el) hourListRef.current.scrollTop = el.offsetTop - 80;
        }
        if (minuteListRef.current) {
          const el = minuteListRef.current.querySelector("[data-selected='true']") as HTMLElement | null;
          if (el) minuteListRef.current.scrollTop = el.offsetTop - 80;
        }
      }, 80);
    }
  }, [isOpen]);

  const handleSelectHour = (h: string) => {
    onChange(`${h}:${minute}`);
  };

  const handleSelectMinute = (m: string) => {
    onChange(`${hour}:${m}`);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full h-full items-center justify-between rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm transition-all outline-none",
          isOpen
            ? "ring-2 ring-primary/20 border-primary/20 shadow-lg"
            : "hover:bg-muted/50 dark:hover:bg-white/10",
          !value && "text-muted-foreground",
          triggerClassName
        )}
      >
        <div className="flex items-center justify-center gap-2 min-w-0 flex-1">
          <span className={cn("truncate font-mono", value ? "text-foreground font-medium" : "text-muted-foreground")}>
            {value || placeholder}
          </span>
        </div>
        <Clock size={14} className={cn("shrink-0", value ? "text-primary" : "text-muted-foreground")} />
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
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  pointerEvents: "auto",
                }}
                className="z-[1000001] w-[148px] rounded-2xl bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-2xl border border-black/8 dark:border-white/10 shadow-2xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden"
              >
                {/* 标题栏 */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 dark:border-white/5">
                  <span className="text-[11px] font-bold text-foreground">选择时间</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono font-medium">
                    <span className="text-primary">{hour}</span>
                    <span>:</span>
                    <span className="text-primary">{minute}</span>
                  </div>
                </div>

                {/* 时分双列 */}
                <div className="flex h-[160px]">
                  {/* 小时列 */}
                  <div className="flex flex-col flex-1 border-r border-border/30 dark:border-white/5">
                    <div className="text-[9px] font-bold text-muted-foreground text-center py-1 bg-black/[0.02] dark:bg-white/[0.02]">时</div>
                    <div
                      ref={hourListRef}
                      className="flex-1 overflow-y-auto"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
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
                              "w-full h-7 text-[11px] font-mono flex items-center justify-center transition-all duration-150 cursor-pointer",
                              isSelected
                                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                : "text-foreground hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 分钟列 */}
                  <div className="flex flex-col flex-1">
                    <div className="text-[9px] font-bold text-muted-foreground text-center py-1 bg-black/[0.02] dark:bg-white/[0.02]">分</div>
                    <div
                      ref={minuteListRef}
                      className="flex-1 overflow-y-auto"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
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
                              "w-full h-7 text-[11px] font-mono flex items-center justify-center transition-all duration-150 cursor-pointer",
                              isSelected
                                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                : "text-foreground hover:bg-primary/10 hover:text-primary"
                            )}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-between border-t border-border/50 dark:border-white/5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const h = String(now.getHours()).padStart(2, "0");
                      const m = String(now.getMinutes()).padStart(2, "0");
                      onChange(`${h}:${m}`);
                    }}
                    className="text-[10px] font-bold text-primary hover:underline px-1 py-0.5"
                  >
                    此刻
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground px-1 py-0.5"
                  >
                    关闭
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
