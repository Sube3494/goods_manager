"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";
import { PURCHASE_STATUS_OPTIONS, PurchaseStatusFilter } from "@/lib/purchases";
import { PurchaseOrder } from "@/lib/types";

interface PurchaseFiltersProps {
  purchases: PurchaseOrder[];
  searchQuery: string;
  statusFilter: PurchaseStatusFilter;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PurchaseStatusFilter) => void;
  onReset: () => void;
}

export function PurchaseFilters({
  searchQuery,
  statusFilter,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onReset,
}: PurchaseFiltersProps) {
  return (
    <div className="mb-6 grid grid-cols-[minmax(0,1fr)_116px_auto] items-center gap-2 text-foreground sm:grid-cols-[minmax(0,1fr)_128px_auto] md:mb-8">
      <div className="min-w-0">
        <div className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 sm:gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 min-w-0 relative">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="搜索采购记录..."
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="contents">
        <div className="h-10 min-w-0 sm:h-11">
          <CustomSelect
            value={statusFilter}
            onChange={(value) => onStatusChange(value as PurchaseStatusFilter)}
            options={PURCHASE_STATUS_OPTIONS.map((status) => ({ value: status.value, label: status.label }))}
            placeholder="单据状态"
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border shadow-sm transition-all text-[13px] sm:text-sm",
              statusFilter !== "All"
                ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary shadow-sm transition-all hover:bg-primary/10 active:scale-95 sm:h-11 sm:w-auto sm:gap-2 sm:px-4"
          >
            <RotateCcw size={14} />
            <span className="hidden text-xs font-bold sm:inline">重置</span>
          </button>
        )}
      </div>
    </div>
  );
}
