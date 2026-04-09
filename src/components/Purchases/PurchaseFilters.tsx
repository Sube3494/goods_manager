"use client";

import { RotateCcw, Search, X } from "lucide-react";
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

  return (
    <>
      <div className="flex flex-row items-center gap-3 mb-6 md:mb-8">
        <div className="h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
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

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="h-11 px-4 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
          >
            <RotateCcw size={14} />
            <span>重置</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-6 md:mb-8 bg-white/40 dark:bg-white/5 p-4 rounded-2xl border border-border/50 shadow-sm backdrop-blur-sm">
        {uniqueShops.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-2 shrink-0 opacity-50">
              归属店铺
            </span>
            <button
              onClick={() => onShopChange("All")}
              className={cn(
                "px-3 h-7 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border",
                shopFilter === "All"
                  ? "bg-secondary text-secondary-foreground border-secondary shadow-sm"
                  : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80"
              )}
            >
              全部
            </button>
            {uniqueShops.map((shop) => (
              <button
                key={shop}
                onClick={() => onShopChange(shop)}
                className={cn(
                  "px-3 h-7 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border",
                  shopFilter === shop
                    ? "bg-secondary text-secondary-foreground border-secondary shadow-sm"
                    : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80"
                )}
              >
                {shop}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-3 border-t border-border/30">
          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mr-2 shrink-0 opacity-50">
            单据状态
          </span>
          {PURCHASE_STATUS_OPTIONS.map((status) => (
            <button
              key={status.value}
              onClick={() => onStatusChange(status.value)}
              className={cn(
                "px-3.5 h-8 rounded-full text-xs font-bold transition-all whitespace-nowrap border",
                statusFilter === status.value
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80"
              )}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
