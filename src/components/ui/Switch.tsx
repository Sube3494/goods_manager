"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-all duration-500 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border border-black/5 dark:border-white/5",
        checked 
          ? "bg-emerald-500 shadow-[0_2px_10px_-1px_rgba(16,185,129,0.5)]" 
          : "bg-zinc-200 dark:bg-zinc-800 shadow-inner"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4.5 w-4.5 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2)] ring-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] transform ml-0.5",
          checked ? "translate-x-5 scale-110" : "translate-x-0 scale-90 opacity-90"
        )}
      />
    </button>
  );
}
