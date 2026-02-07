"use client";

import { useState, useRef, useEffect } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl bg-secondary/50 border border-transparent px-4 py-2.5 text-left text-sm transition-all outline-none ring-offset-background",
          isOpen ? "ring-2 ring-primary/20 border-primary/20 bg-background" : "hover:bg-secondary/70",
          !value && "text-muted-foreground"
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={16}
          className={cn("text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md"
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
                    "relative flex w-full select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50",
                    option.value === value && "bg-accent/50 text-accent-foreground font-medium"
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
      </AnimatePresence>
    </div>
  );
}
