"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
}: PaginationProps) {
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-border bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 dark:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="order-2 flex w-full items-center justify-between gap-4 sm:order-1 sm:w-auto sm:justify-start">
        <div className="flex items-center rounded-full border border-border/60 bg-muted/30 p-1 dark:bg-white/5">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded-full p-1.5 transition-all hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center px-1 sm:px-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else {
                if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2)
                  pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;
              }

              if (pageNum > totalPages) return null;

              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => onPageChange(pageNum)}
                  className={cn(
                    "h-8 w-8 rounded-full text-[10px] font-bold transition-all sm:text-xs",
                    currentPage === pageNum
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-white dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded-full p-1.5 transition-all hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span className="whitespace-nowrap rounded-full border border-border/40 bg-muted/20 px-3 py-1.5 text-[10px] font-bold text-muted-foreground/70 sm:text-xs">
          共 <span className="text-foreground">{totalItems}</span> 条
        </span>
      </div>

      <div className="order-1 flex w-full items-center justify-between gap-4 border-b border-border/20 pb-3 sm:order-2 sm:w-auto sm:justify-end sm:border-none sm:pb-0">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 sm:text-xs">
          每页显示
        </span>
        <div className="flex items-center rounded-full border border-border/60 bg-muted/30 p-1 dark:bg-white/5">
          {pageSizeOptions.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSizeChange(size)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[10px] font-bold transition-all sm:text-xs",
                pageSize === size
                  ? "bg-white dark:bg-white/10 text-foreground shadow-sm"
                  : "hover:bg-white/50 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
