"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import type { AutoPickOrder } from "@/lib/types";

type Point = { lng: number; lat: number };
type Trail = {
  dispatcher: Point | null; sender: Point | null; receiver: Point | null;
  distance: string; orderStatus: string; isTakeGoods: boolean; fetchedAt: string;
};

export function OrderRouteModal({ order, onClose }: { order: AutoPickOrder; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      setLoading(true);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/trail`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "获取骑手位置失败");
        if (!disposed) { setTrail(data); setError(""); }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "获取骑手位置失败");
      } finally {
        if (!disposed) { setLoading(false); timer = setTimeout(refresh, 30000); }
      }
    }
    void refresh();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [order.id, attempt]);

  useEffect(() => {
    if (!trail) return;
    let disposed = false;
    let map: AMap.Map | undefined;
    const timeout = setTimeout(() => { if (!disposed) { disposed = true; setMapError("地图加载超时，请刷新重试。"); } }, 15000);
    async function draw() {
      try {
        const key = process.env.NEXT_PUBLIC_AMAP_KEY;
        if (!key) throw new Error("高德地图配置未就绪");
        const sdk = await loadBareAmap(key, process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "");
        if (disposed || !containerRef.current) return;
        map = new sdk.Map(containerRef.current, { zoom: 14, resizeEnable: true });
        for (const [label, point] of [["骑手", trail!.dispatcher], ["门店", trail!.sender], ["顾客", trail!.receiver]] as const) {
          if (!point) continue;
          map!.add(new sdk.Marker({ position: [point.lng, point.lat], title: label,
            label: { content: label, direction: "top" } }));
        }
        map!.setFitView();
        setMapError("");
      } catch (err) {
        if (!disposed) setMapError(err instanceof Error ? err.message : "地图加载失败");
      } finally { clearTimeout(timeout); }
    }
    void draw();
    return () => { disposed = true; clearTimeout(timeout); map?.destroy(); };
  }, [trail]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="order-route-title" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 id="order-route-title" className="font-semibold">骑手位置</h2>
        <button type="button" onClick={onClose} aria-label="关闭骑手位置" className="rounded-full p-2 hover:bg-muted"><X size={20} /></button>
      </div>
      <div className="space-y-2 p-4 text-sm">
        <p>骑手：{order.delivery?.riderName || "暂未提供"} {order.delivery?.riderPhone || ""}</p>
        <p>门店：{order.matchedShopName || order.rawShopName || order.shopAddress || "暂未提供"}</p>
        <p>收货地址：{order.userAddress || "暂未提供"}</p>
        {trail && <>
          <p>{trail.orderStatus === "pickup" && !trail.isTakeGoods ? "骑手距离商家" : "平台返回距离"}：{trail.distance || "暂无距离"}</p>
          {!trail.dispatcher && <p role="status">平台暂未返回骑手坐标，无法显示骑手位置。</p>}
          <p className="text-muted-foreground">最近查询：{new Date(trail.fetchedAt).toLocaleTimeString()} · 每 30 秒刷新（位置以平台上报为准）</p>
        </>}
        {error && <p role="alert" className="text-red-500">{error}{trail ? " 当前显示上次成功查询的位置。" : ""}</p>}
        {mapError && <p role="alert" className="text-red-500">{mapError}</p>}
        <button type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {loading ? "正在查询骑手位置…" : "刷新位置"}
        </button>
      </div>
      <div ref={containerRef} className="h-[50dvh] min-h-64 w-full bg-muted" />
    </dialog>, document.body,
  );
}
