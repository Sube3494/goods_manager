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
    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-6 px-4 sm:px-8 py-3 sm:py-4 rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 shadow-sm backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-4 sm:gap-6 order-2 sm:order-1 w-full sm:w-auto justify-between sm:justify-start">
        <div className="flex items-center bg-muted/30 dark:bg-white/5 rounded-full p-1 border border-border/50">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-1.5 rounded-full hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
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
                    "w-8 h-8 rounded-full text-[10px] sm:text-xs font-bold transition-all",
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
            className="p-1.5 rounded-full hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span className="text-[10px] sm:text-xs font-bold text-muted-foreground/60 whitespace-nowrap bg-muted/20 px-3 py-1.5 rounded-full border border-border/30">
          共 <span className="text-foreground">{totalItems}</span> 条
        </span>
      </div>

      <div className="flex items-center gap-4 order-1 sm:order-2 w-full sm:w-auto justify-between sm:justify-end border-b sm:border-none border-border/10 pb-3 sm:pb-0">
        <span className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-widest opacity-60">
          每页显示
        </span>
        <div className="flex items-center bg-muted/30 dark:bg-white/5 rounded-full p-1 border border-border/50">
          {pageSizeOptions.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSizeChange(size)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all",
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
