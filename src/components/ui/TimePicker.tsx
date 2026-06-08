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
  value: string; // 格式如 "HH:mm"
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
}

export function TimePicker({
  value,
  onChange,
  className,
  triggerClassName,
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    showAbove?: boolean;
  }>({ top: 0, left: 0, width: 0 });

  const [selectedHour, selectedMinute] = useMemo(() => {
    if (!value || !value.includes(":")) return ["00", "00"];
    const [h, m] = value.split(":");
    return [h.padStart(2, "0"), m.padStart(2, "0")];
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
      const windowWidth = window.innerWidth;
      const dropdownHeight = 260; 
      const dropdownMinWidth = 180;
      const spaceBelow = windowHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      let left = rect.left;

      if (left + dropdownMinWidth > windowWidth - 16) {
        left = windowWidth - dropdownMinWidth - 16;
      }
      if (left < 16) {
        left = 16;
      }

      setDropdownPosition({
        top: showAbove ? rect.top - 8 : rect.bottom + 8,
        left: left,
        width: Math.max(rect.width, 180),
        showAbove,
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        const isClickInsideTrigger = containerRef.current?.contains(target);
        const isClickInsidePicker = pickerRef.current?.contains(target);

        if (!isClickInsideTrigger && !isClickInsidePicker) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);

      // 定位当前选中项到视口中央
      const timer = setTimeout(() => {
        if (hourListRef.current) {
          const activeHour = hourListRef.current.querySelector("[data-active='true']");
          if (activeHour) {
            activeHour.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }
        if (minuteListRef.current) {
          const activeMinute = minuteListRef.current.querySelector("[data-active='true']");
          if (activeMinute) {
            activeMinute.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }
      }, 50);

      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
        document.removeEventListener("mousedown", handleClickOutside);
        clearTimeout(timer);
      };
    }
  }, [isOpen, updatePosition]);

  const handleHourSelect = (h: string) => {
    onChange(`${h}:${selectedMinute}`);
  };

  const handleMinuteSelect = (m: string) => {
    onChange(`${selectedHour}:${m}`);
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full h-full items-center justify-between rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm transition-all outline-none",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 shadow-lg" : "hover:bg-muted/50 dark:hover:bg-white/10",
          triggerClassName
        )}
      >
        <span className="font-mono text-foreground font-semibold">
          {selectedHour}:{selectedMinute}
        </span>
        <Clock size={14} className="text-muted-foreground shrink-0 ml-2" />
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
                position: "fixed",
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                minWidth: "180px",
                maxWidth: "calc(100vw - 2rem)",
                pointerEvents: "auto",
              }}
              className="z-1000002 rounded-2xl bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-2xl p-3 border border-black/8 dark:border-white/10 shadow-2xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
            >
              <div className="flex gap-2">
                {/* 小时列 */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground text-center mb-1.5 uppercase tracking-wider">
                    时
                  </div>
                  <div
                    ref={hourListRef}
                    className="h-44 overflow-y-auto pr-1 flex flex-col gap-0.5 scrollbar-none"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {hours.map((h) => {
                      const isSelected = h === selectedHour;
                      return (
                        <button
                          key={h}
                          type="button"
                          data-active={isSelected}
                          onClick={() => handleHourSelect(h)}
                          className={cn(
                            "h-8 shrink-0 rounded-xl text-xs font-mono font-medium transition-all duration-150 flex items-center justify-center",
                            isSelected
                              ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                              : "text-foreground/80 hover:bg-slate-100 dark:hover:bg-white/8"
                          )}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 分界线 */}
                <div className="w-px bg-border/40 dark:bg-white/10 self-stretch my-2 shrink-0" />

                {/* 分钟列 */}
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground text-center mb-1.5 uppercase tracking-wider">
                    分
                  </div>
                  <div
                    ref={minuteListRef}
                    className="h-44 overflow-y-auto pr-1 flex flex-col gap-0.5 scrollbar-none"
                    style={{ scrollbarWidth: "none" }}
                  >
                    {minutes.map((m) => {
                      const isSelected = m === selectedMinute;
                      return (
                        <button
                          key={m}
                          type="button"
                          data-active={isSelected}
                          onClick={() => handleMinuteSelect(m)}
                          className={cn(
                            "h-8 shrink-0 rounded-xl text-xs font-mono font-medium transition-all duration-150 flex items-center justify-center",
                            isSelected
                              ? "bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20"
                              : "text-foreground/80 hover:bg-slate-100 dark:hover:bg-white/8"
                          )}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 底部关闭/确定 */}
              <div className="mt-2.5 pt-2 border-t border-border/40 dark:bg-white/0 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-[10px] font-bold text-primary hover:underline px-2.5 py-1"
                >
                  确定
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
