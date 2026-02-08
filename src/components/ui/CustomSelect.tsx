"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function CustomSelect({ options, value, onChange, placeholder = "Select...", className }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-left text-sm transition-all outline-none ring-offset-background",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 bg-background" : "hover:bg-muted/50 dark:hover:bg-white/10",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={16}
          className={cn("text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: 'absolute',
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
              }}
              className="z-99999 max-h-60 overflow-auto rounded-2xl bg-white dark:bg-card/70 dark:backdrop-blur-xl border border-border dark:border-white/10 p-1 shadow-xl ring-1 ring-black/5 focus:outline-none"
            >
              <div className="max-h-60 overflow-auto p-1 py-1.5 scrollbar-hide">
                {options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "relative flex w-full select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50",
                      option.value === value && "bg-black/10 dark:bg-white/10 font-medium"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === value && (
                      <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center text-primary">
                        <Check size={14} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
