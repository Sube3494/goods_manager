import { Package } from "lucide-react";

export function GoodsCardSkeleton() {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card/50 shadow-sm animate-pulse">
      {/* Image Skeleton */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted/40 flex items-center justify-center">
        <Package size={32} className="text-muted/20" strokeWidth={1.5} />
        {/* Shimmer overlay */}
        <div className="absolute inset-0 shimmer opacity-20" />
      </div>

      {/* Content Skeleton */}
      <div className="flex flex-1 flex-col p-3 sm:p-5 space-y-3">
        {/* Title line */}
        <div className="h-4 sm:h-5 bg-muted/40 rounded-full w-3/4" />
        
        {/* Tags line */}
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-muted/30 rounded-full" />
          <div className="h-5 w-20 bg-muted/30 rounded-full" />
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-4" />
        
        {/* Bottom bar */}
        <div className="pt-4 border-t border-border/50 flex justify-between items-end">
          <div className="space-y-1.5">
            <div className="h-2 w-8 bg-muted/30 rounded-sm" />
            <div className="h-4 w-12 bg-muted/40 rounded-sm" />
          </div>
          <div className="space-y-1.5 text-right flex flex-col items-end">
            <div className="h-2 w-12 bg-muted/30 rounded-sm" />
            <div className="h-5 w-20 bg-muted/40 rounded-sm" />
          </div>
        </div>

        {/* Mobile Actions placeholder */}
        <div className="sm:hidden pt-3 border-t border-border/30 flex justify-end gap-3">
          <div className="h-4 w-4 bg-muted/30 rounded-sm" />
          <div className="h-4 w-4 bg-muted/30 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
