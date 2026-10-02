"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { pinyinMatch } from "@/lib/pinyin";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  onAddNew?: () => void;
  addNewLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  align?: "left" | "center" | "right";
  matchTriggerWidth?: boolean;
}

export function CustomSelect({
  options,
  value,
  onChange,
  onOpenChange,
  placeholder = "请选择...",
  className,
  triggerClassName,
  onAddNew,
  addNewLabel,
  searchable,
  searchPlaceholder = "搜索...",
  align,
  matchTriggerWidth = true,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const isSearchable = searchable ?? options.length >= 12;

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchQuery("");
    }
  }, []);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
    showAbove: boolean;
    isReady: boolean;
  }>({ top: 0, left: 0, width: 0, showAbove: false, isReady: false });
  const containerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;
  const filteredOptions = isSearchable
    ? options.filter((option) => pinyinMatch(option.label, searchQuery))
    : options;

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (isOpen && isSearchable) {
      const handle = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(handle);
    }
  }, [isOpen, isSearchable]);



  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".select-dropdown-container")) {
        return;
      }
      if (containerRef.current && !containerRef.current.parentElement?.contains(target)) {
        handleOpenChange(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [handleOpenChange]);

  const longestLabelLength = useMemo(() => {
    return options.reduce((max, opt) => Math.max(max, (opt.label || "").length), 0);
  }, [options]);

  const updatePosition = useCallback(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const dropdownHeight = 240; 
      const spaceBelow = windowHeight - rect.bottom;
      const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      requestAnimationFrame(() => {
        // 根据选项最长文本动态估算紧凑宽度，与按钮宽度取较大值，杜绝右侧冗余空白与文字挤压截断
        const estimatedContentWidth = Math.ceil(longestLabelLength * 13) + 38;
        const targetWidth = matchTriggerWidth
          ? Math.max(rect.width, estimatedContentWidth)
          : Math.max(rect.width, 96);
        let preferredLeft = rect.left;
        if (align === "right") {
          preferredLeft = rect.right - targetWidth;
        } else if (align === "center") {
          preferredLeft = rect.left + (rect.width - targetWidth) / 2;
        }
        const safeLeft = Math.max(8, Math.min(preferredLeft, window.innerWidth - targetWidth - 12));

        setDropdownPosition({
          top: showAbove ? rect.top - 4 : rect.bottom + 4,
          left: safeLeft,
          width: targetWidth,
          showAbove,
          isReady: true
        });
      });
    }
  }, [align, isOpen, matchTriggerWidth, longestLabelLength]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScroll = (e: Event) => {
        const target = e.target as HTMLElement;
        if (target?.closest?.(".select-dropdown-container")) {
          return;
        }
        handleOpenChange(false);
      };
      window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen, updatePosition, handleOpenChange]);

  // Always use custom styled select dropdown even on mobile to maintain visual aesthetics

  const isCenter =
    align === "center" ||
    triggerClassName?.includes("text-center") ||
    triggerClassName?.includes("justify-center");

  return (
    <div className={cn("relative", className)}>
      <button
        ref={containerRef}
        type="button"
        onClick={() => handleOpenChange(!isOpen)}
        className={cn(
          "flex w-full h-full items-center bg-white dark:bg-white/5 border border-border dark:border-white/10 px-2.5 text-xs transition-all outline-none ring-offset-background text-foreground",
          isCenter ? "justify-center text-center" : "justify-between text-left",
          !triggerClassName?.includes("rounded-") && "rounded-lg",
          isOpen ? "ring-2 ring-primary/20 border-primary/30" : "hover:bg-muted/5 dark:hover:bg-white/10",
          triggerClassName
        )}
      >
        <div className={cn(
          "flex items-center gap-1.5 min-w-0",
          isCenter ? "justify-center w-full" : "flex-1 justify-between"
        )}>
          {searchable ? (
            <input
              ref={inputRef}
              type="text"
              value={isOpen ? searchQuery : selectedLabel}
              onChange={(e) => {
                if (!isOpen) {
                  handleOpenChange(true);
                }
                setSearchQuery(e.target.value);
              }}
              onFocus={() => {
                if (!isOpen) handleOpenChange(true);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isOpen) handleOpenChange(true);
              }}
              placeholder={isOpen ? (searchPlaceholder || selectedLabel || "搜索...") : selectedLabel}
              className={cn(
                "w-full bg-transparent outline-none text-xs sm:text-sm font-normal",
                isCenter && "text-center",
                !value && !searchQuery && "text-muted-foreground placeholder:text-muted-foreground"
              )}
            />
          ) : (
            <span className={cn("truncate font-normal", !value && "text-muted-foreground", isCenter && "text-center")}>
              {selectedLabel}
            </span>
          )}
          {isOpen && searchQuery ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 shrink-0 cursor-pointer text-xs leading-none"
              title="清空搜索"
            >
              ✕
            </span>
          ) : (
            <ChevronDown
              size={12}
              className={cn("text-muted-foreground transition-transform duration-200 shrink-0", isOpen && "rotate-180")}
            />
          )}
        </div>
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
                minWidth: matchTriggerWidth ? `${dropdownPosition.width}px` : `${Math.max(dropdownPosition.width, 120)}px`,
                maxWidth: 'calc(100vw - 24px)',
                width: matchTriggerWidth ? `${dropdownPosition.width}px` : 'max-content',
                zIndex: 999999,
                transformOrigin: dropdownPosition.showAbove ? 'bottom' : 'top',
                translateY: dropdownPosition.showAbove ? '-100%' : '0%',
                willChange: 'transform, opacity'
              } as React.CSSProperties}
              className="select-dropdown-container rounded-2xl bg-white/80 dark:bg-zinc-900/75 backdrop-blur-xl border border-black/10 dark:border-white/15 shadow-2xl dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] focus:outline-none overflow-hidden"
            >
              {/* 仅在胶囊本身不是搜索输入框(!searchable)但选项极多时，才作为下拉列表备用搜索框；胶囊自身可搜索时坚决不展示，杜绝重复 */}
              {!searchable && isSearchable && (
                <div className="p-2 border-b border-border/40 sticky top-0 bg-white/80 dark:bg-zinc-900/75 backdrop-blur-md z-10">
                  <div className="relative flex items-center">
                    <Search size={12} className="absolute left-2.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={searchPlaceholder}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full h-7.5 pl-7 pr-6 bg-muted/50 dark:bg-white/5 border border-border/50 rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 transition-all font-normal"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearchQuery("");
                        }}
                        className="absolute right-1.5 text-muted-foreground hover:text-foreground text-xs p-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="max-h-56 overflow-auto p-1.5">
                {filteredOptions.length > 0 ? (
                  filteredOptions.map((option, index) => (
                    <button
                      key={`${option.value}-${index}`}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        handleOpenChange(false);
                      }}
                      className={cn(
                        "relative flex w-full select-none items-center rounded-xl py-1.5 pl-2.5 pr-6 text-xs outline-none transition-colors hover:bg-slate-100 dark:hover:bg-white/8 cursor-pointer font-medium text-foreground",
                        option.value === value && "bg-primary/10 text-primary font-bold dark:bg-primary/20 dark:text-primary"
                      )}
                    >
                      <span className="truncate font-medium">{option.label}</span>
                      {option.value === value && (
                        <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="py-6 text-center space-y-3">
                    <p className="text-xs text-muted-foreground">{searchable && searchQuery ? "暂无匹配结果" : "暂无选项"}</p>
                    {onAddNew && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddNew();
                          handleOpenChange(false);
                        }}
                        className="mx-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold rounded-lg hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
                      >
                        <Plus size={12} strokeWidth={3} />
                        {addNewLabel || "去新增"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
