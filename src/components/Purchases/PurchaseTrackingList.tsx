"use client";

import { Copy, ExternalLink, Truck } from "lucide-react";
import { PurchaseOrder } from "@/lib/types";
import { getTrackingUrl } from "@/lib/purchases";

interface PurchaseTrackingListProps {
  trackingData?: PurchaseOrder["trackingData"];
  status?: PurchaseOrder["status"];
  compact?: boolean;
  onCopy: (trackingNumber: string, compact?: boolean) => void;
}

export function PurchaseTrackingList({
  trackingData,
  status,
  compact = false,
  onCopy,
}: PurchaseTrackingListProps) {
  if (!trackingData || trackingData.length === 0) {
    if (status !== "Draft" && !compact) {
      return <span className="text-[10px] text-muted-foreground opacity-30 italic">暂由仓库处理中</span>;
    }

    return null;
  }

  if (compact) {
    return (
      <div className="grid grid-cols-1 gap-1.5">
        {trackingData.map((tracking, idx) => {
          const trackingUrl = getTrackingUrl(tracking.number, tracking.courier);

          return (
            <div
              key={`${tracking.courier}-${tracking.number}-${idx}`}
              className="flex justify-between items-center bg-orange-500/5 px-3 py-2 rounded-lg border border-orange-500/10 group/mob-item"
              onClick={(event) => {
                event.stopPropagation();
                onCopy(tracking.number, true);
              }}
            >
              <div className="flex items-center gap-2 text-orange-500 font-mono text-[10px] min-w-0 flex-1">
                <Truck size={12} className="shrink-0" />
                <span className="shrink-0 whitespace-nowrap">{tracking.courier}:</span>
                <span className="truncate font-bold">{tracking.number}</span>
              </div>
              <div className="flex items-center gap-2 opacity-40 group-hover/mob-item:opacity-100 transition-opacity">
                {trackingUrl && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      window.open(trackingUrl, "_blank");
                    }}
                    className="p-1"
                  >
                    <ExternalLink size={12} className="text-orange-500" />
                  </button>
                )}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onCopy(tracking.number);
                  }}
                  className="p-1"
                >
                  <Copy size={12} className="text-orange-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[140px] max-w-[200px] mx-auto">
      {trackingData.map((tracking, idx) => {
        const trackingUrl = getTrackingUrl(tracking.number, tracking.courier);

        return (
          <div
            key={`${tracking.courier}-${tracking.number}-${idx}`}
            className="flex items-center gap-2 text-[10px] text-orange-500 font-mono bg-orange-500/5 px-2 py-0.5 rounded-md border border-orange-500/10 group/item relative overflow-hidden"
          >
            <Truck size={10} className="shrink-0" />
            <span className="opacity-70 shrink-0 whitespace-nowrap">{tracking.courier}:</span>
            <span className="font-bold truncate min-w-0">{tracking.number}</span>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onCopy(tracking.number);
              }}
              className="p-0.5 hover:bg-orange-500/20 rounded"
              title="复制单号"
            >
              <Copy size={10} />
            </button>
            {trackingUrl && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(trackingUrl, "_blank");
                }}
                className="p-0.5 hover:bg-orange-500/20 rounded"
                title="追踪查询"
              >
                <ExternalLink size={10} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
