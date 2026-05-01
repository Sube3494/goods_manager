"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";
import { getUniquePurchaseShops, PURCHASE_STATUS_OPTIONS, PurchaseStatusFilter } from "@/lib/purchases";
import { PurchaseOrder } from "@/lib/types";

interface PurchaseFiltersProps {
  purchases: PurchaseOrder[];
  searchQuery: string;
  statusFilter: PurchaseStatusFilter;
  shopFilter: string;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PurchaseStatusFilter) => void;
  onShopChange: (value: string) => void;
  onReset: () => void;
}

export function PurchaseFilters({
  purchases,
  searchQuery,
  statusFilter,
  shopFilter,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onShopChange,
  onReset,
}: PurchaseFiltersProps) {
  const uniqueShops = getUniquePurchaseShops(purchases);
  const shopOptions = [
    { value: "All", label: "全部店铺" },
    ...uniqueShops.map((shop) => ({ value: shop, label: shop })),
  ];

  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-6 md:mb-8 text-foreground">
      <div className="flex items-center gap-2 w-full">
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

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:gap-3 sm:h-11 sm:w-auto">
        <div className="h-10 min-w-0 sm:h-full sm:w-28 sm:shrink-0">
          <CustomSelect
            value={statusFilter}
            onChange={(value) => onStatusChange(value as PurchaseStatusFilter)}
            options={PURCHASE_STATUS_OPTIONS.map((status) => ({ value: status.value, label: status.label }))}
            placeholder="单据状态"
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border shadow-sm transition-all text-[10px] sm:text-sm",
              statusFilter !== "All"
                ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>

        <div className="h-10 min-w-0 sm:h-full sm:w-28 sm:shrink-0">
          <CustomSelect
            value={shopFilter}
            onChange={onShopChange}
            options={shopOptions}
            placeholder="全部店铺"
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border shadow-sm transition-all text-[10px] sm:text-sm",
              shopFilter !== "All"
                ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="h-10 sm:h-11 px-3 sm:px-4 flex items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">重置</span>
            <span className="sm:hidden text-[10px]">重置</span>
          </button>
        )}
      </div>
    </div>
  );
}
