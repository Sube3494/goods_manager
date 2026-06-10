"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  dotColor?: string;
}

interface CustomMultiSelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function CustomMultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "请选择...",
  className,
  triggerClassName,
  disabled = false,
}: CustomMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    showAbove: boolean;
    isReady: boolean;
  }>({ top: 0, left: 0, width: 0, showAbove: false, isReady: false });
  const containerRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  // 拼接显示的文案
  let displayLabel = placeholder;
  if (value.length > 0 && !value.includes("all")) {
    const selectedLabels = value
      .map((val) => options.find((opt) => opt.value === val)?.label)
      .filter(Boolean);
    if (selectedLabels.length === 1) {
      displayLabel = selectedLabels[0]!;
    } else if (selectedLabels.length > 1) {
      displayLabel = `${selectedLabels[0]} +${selectedLabels.length - 1}`;
    }
  }

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.parentElement?.contains(event.target as Node)) {
        handleOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleOpenChange]);

  const updatePosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const dropdownHeight = 250; 
      const spaceBelow = windowHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      const width = Math.max(rect.width, 140);
      const windowWidth = window.innerWidth;
      let left = rect.left;

      if (rect.left + width > windowWidth - 16) {
        left = Math.max(16, rect.right - width);
      }

      requestAnimationFrame(() => {
        setDropdownPosition({
          top: showAbove ? rect.top - 8 : rect.bottom + 8,
          left,
          width,
          showAbove,
          isReady: true
        });
      });
    }
  }, [isOpen, setDropdownPosition]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
    } 
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  const handleToggleOption = (optValue: string) => {
    if (optValue === "all") {
      onChange(["all"]);
      return;
    }

    let newValue = [...value];
    // 先移除 "all"
    newValue = newValue.filter((v) => v !== "all");

    if (newValue.includes(optValue)) {
      newValue = newValue.filter((v) => v !== optValue);
    } else {
      newValue.push(optValue);
    }

    // 如果全部被取消了，则自动回到 ["all"]
    if (newValue.length === 0) {
      newValue = ["all"];
    }

    onChange(newValue);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={containerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && handleOpenChange(!isOpen)}
        className={cn(
          "flex w-full h-full items-center justify-between bg-white dark:bg-white/5 border border-border dark:border-white/10 px-2.5 text-left text-xs transition-all outline-none ring-offset-background rounded-full",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 bg-background" : "hover:bg-muted/5 dark:hover:bg-white/10",
          disabled && "opacity-60 cursor-not-allowed pointer-events-none bg-muted/10 dark:bg-white/5",
          triggerClassName
        )}
      >
        <span className="truncate font-normal">
          {displayLabel}
        </span>
        <ChevronDown
          size={12}
          className={cn("text-muted-foreground transition-transform duration-200 ml-1 shrink-0", isOpen && "rotate-180")}
        />
      </button>

      {mounted && dropdownPosition.isReady && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: dropdownPosition.showAbove ? 8 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dropdownPosition.showAbove ? 8 : -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: 'fixed',
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                zIndex: 999999,
                transformOrigin: dropdownPosition.showAbove ? 'bottom' : 'top',
                translateY: dropdownPosition.showAbove ? '-100%' : '0%',
                willChange: 'transform, opacity'
              } as React.CSSProperties}
              className="rounded-2xl border border-black/8 bg-white/98 shadow-2xl backdrop-blur-2xl focus:outline-none dark:border-white/10 dark:bg-[#202733]/98 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
            >
              <div className="max-h-52 overflow-auto p-1.5 py-2 space-y-1">
                {options.map((option, index) => {
                  const isChecked = value.includes(option.value);
                  return (
                    <button
                      key={`${option.value}-${index}`}
                      type="button"
                      onClick={() => handleToggleOption(option.value)}
                      className={cn(
                        "relative flex w-full select-none items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-normal text-foreground outline-none transition-colors hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer",
                        isChecked && "bg-primary/4 text-primary dark:bg-primary/8"
                      )}
                    >
                      {/* Checkbox 视觉呈现 */}
                      <div
                        className={cn(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-200",
                          isChecked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-gray-300 bg-white dark:border-white/20 dark:bg-white/5"
                        )}
                      >
                        {isChecked && <Check size={10} strokeWidth={4} className="text-white dark:text-zinc-950" />}
                      </div>

                      {option.dotColor && (
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", option.dotColor)} />
                      )}
                      <span className="whitespace-nowrap font-normal">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
