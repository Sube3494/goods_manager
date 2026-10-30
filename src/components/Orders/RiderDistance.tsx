"use client";

import { useEffect, useRef, useState } from "react";
import type { AutoPickOrder } from "@/lib/types";
import { canShowRiderDistance, getRiderDistance, type RiderTrail } from "@/lib/riderDistance";

export function RiderDistance({ order }: { order: AutoPickOrder }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<{ key: string; trail: RiderTrail } | null>(null);
  const enabled = canShowRiderDistance(order);
  const key = `${order.id}:${order.deliveryId}`;

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !visible) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    async function refresh() {
      if (document.visibilityState === "hidden") {
        timer = setTimeout(refresh, 30_000);
        return;
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 20_000);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/trail`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("获取骑手距离失败");
        const trail: RiderTrail = await response.json();
        if (!disposed) setSnapshot({ key, trail });
      } catch {
        if (!disposed) setSnapshot(null);
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(refresh, 30_000);
      }
    }
    void refresh();
    return () => { disposed = true; controller?.abort(); clearTimeout(timer); };
  }, [enabled, visible, order.id, key]);

  const summary = getRiderDistance(order, snapshot?.key === key ? snapshot.trail : null);
  return (
    <span ref={ref} className={summary ? "inline-flex shrink-0 whitespace-nowrap" : "pointer-events-none absolute h-px w-px overflow-hidden"}>
      {summary ? (
        <span
          className={summary.phase === "pickup" ? "text-orange-600 dark:text-orange-400" : "text-emerald-600 dark:text-emerald-400"}
          title={`骑手距离${summary.phase === "pickup" ? "门店" : "顾客"}，每30秒更新`}
        >
          （{summary.label} {summary.distance}）
        </span>
      ) : null}
    </span>
  );
}
