"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronDown, Check, Minus } from "lucide-react";
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
  displayLabel?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  inlineDropdown?: boolean;
  showSelectAll?: boolean;
}

export function CustomMultiSelect({
  options,
  value = [],
  onChange,
  placeholder = "请选择...",
  displayLabel: customDisplayLabel,
  className,
  triggerClassName,
  disabled = false,
  allowEmpty = false,
  inlineDropdown = false,
  showSelectAll,
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
  const dropdownRef = useRef<HTMLDivElement>(null);
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
  if (customDisplayLabel) {
    displayLabel = customDisplayLabel;
  }

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.parentElement?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        handleOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleOpenChange]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const dropdownHeight = 250; 
    const spaceBelow = windowHeight - rect.bottom;
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const width = Math.max(rect.width, 180);
    const windowWidth = window.innerWidth;
    let left = rect.left;

    if (rect.left + width > windowWidth - 16) {
      left = Math.max(16, rect.right - width);
    }

    setDropdownPosition({
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      left,
      width,
      showAbove,
      isReady: true
    });
  }, []);

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

  const selectableOptions = useMemo(() => {
    return options.filter((opt) => opt.value !== "all");
  }, [options]);

  const selectedCount = useMemo(() => {
    return selectableOptions.filter((opt) => value.includes(opt.value)).length;
  }, [selectableOptions, value]);

  const isAllSelected = selectableOptions.length > 0 && selectedCount === selectableOptions.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < selectableOptions.length;

  const canShowSelectAll = showSelectAll !== undefined
    ? showSelectAll
    : (selectableOptions.length > 1 && !options.some((opt) => opt.value === "all"));

  const handleToggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(selectableOptions.map((opt) => opt.value));
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const handleInvertSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSet = new Set(value);
    const invertedValues = selectableOptions
      .filter((opt) => !currentSet.has(opt.value))
      .map((opt) => opt.value);
    onChange(invertedValues);
  };

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

    if (newValue.length === 0 && !allowEmpty) {
      newValue = ["all"];
    }

    onChange(newValue);
  };

  const renderSelectAllBar = () => {
    if (!canShowSelectAll) return null;
    return (
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/5 dark:border-white/10 text-xs select-none bg-muted/20 dark:bg-white/[0.02] shrink-0">
        <button
          type="button"
          onClick={handleToggleAll}
          className="flex items-center gap-2 text-foreground font-medium hover:text-primary transition-colors cursor-pointer group"
        >
          <div
            className={cn(
              "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-all duration-200",
              isAllSelected || isPartiallySelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-gray-300 bg-white dark:border-white/20 dark:bg-white/5 group-hover:border-primary/50"
            )}
          >
            {isAllSelected && <Check size={10} strokeWidth={4} className="text-white dark:text-zinc-950" />}
            {isPartiallySelected && <Minus size={10} strokeWidth={4} className="text-white dark:text-zinc-950" />}
          </div>
          <span>全选</span>
          <span className="text-[10px] text-muted-foreground font-normal">
            ({selectedCount}/{selectableOptions.length})
          </span>
        </button>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-normal">
          <button
            type="button"
            onClick={handleInvertSelect}
            className="hover:text-primary transition-colors px-1 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            title="反选未勾选项"
          >
            反选
          </button>
          <span className="text-muted-foreground/30">|</span>
          <button
            type="button"
            onClick={handleClearAll}
            className="hover:text-primary transition-colors px-1 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            title="清空所有选择"
          >
            清空
          </button>
        </div>
      </div>
    );
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

      {inlineDropdown && isOpen ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-black/8 bg-white/98 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#202733]/98 dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
          {renderSelectAllBar()}
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
        </div>
      ) : null}

      {!inlineDropdown && mounted && isOpen && dropdownPosition.isReady && createPortal(
        <motion.div
          ref={dropdownRef}
          initial={{ opacity: 0, y: dropdownPosition.showAbove ? 8 : -8 }}
          animate={{ opacity: 1, y: 0 }}
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
          {renderSelectAllBar()}
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
        </motion.div>,
        document.body
      )}
    </div>
  );
}
