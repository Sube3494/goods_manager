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
  const [routeSummary, setRouteSummary] = useState("");
  const riderAssigned = Boolean(trail?.dispatcher || trail?.isTakeGoods
    || /^(pickup|delivering)$/i.test(trail?.orderStatus || "")
    || /^(pickup|delivering)$/i.test(order.status || "")
    || /配送已接单|骑手已接单|骑手已到店|配送中|已取货/.test(order.status || "")
    || order.delivery?.riderName || order.delivery?.riderPhone);
  const shopAddress = order.shopAddress?.trim() || order.rawShopAddress?.trim() || "";

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
      if (!order.deliveryId) { setLoading(false); return; }
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
  }, [order.id, order.deliveryId, attempt]);

  useEffect(() => {

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
        if (!riderAssigned) {
          await new Promise<void>((resolve) => sdk.plugin(["AMap.Geocoder", "AMap.Riding"], resolve));
          if (disposed) return;
          const geocoder = new sdk.Geocoder();
          const resolvePoint = (point: Point | null | undefined, address: string) => new Promise<[number, number]>((resolve, reject) => {
            if (point) return resolve([point.lng, point.lat]);
            if (!address) return reject(new Error("缺少门店或收货地址，暂时无法规划路线。"));
            geocoder.getLocation(address, (status: string, result: { geocodes?: { location: { lng: number; lat: number } }[] }) => {
              const location = result?.geocodes?.[0]?.location;
              if (status === "complete" && location) resolve([location.lng, location.lat]);
              else reject(new Error("地址识别失败，请检查门店和收货地址。"));
            });
          });
          const customer = typeof order.longitude === "number" && typeof order.latitude === "number"
            && Number.isFinite(order.longitude) && Number.isFinite(order.latitude)
            && Math.abs(order.longitude) <= 180 && Math.abs(order.latitude) <= 90
            && (order.longitude !== 0 || order.latitude !== 0)
            ? { lng: order.longitude, lat: order.latitude } : null;
          const [start, end] = await Promise.all([
            resolvePoint(trail?.sender, shopAddress), resolvePoint(trail?.receiver || customer, order.userAddress),
          ]);
          if (disposed) return;
          const riding = new sdk.Riding({ map, autoFitView: true });
          riding.search(start, end, (status: string, result: { routes?: { distance: number; time: number }[] }) => {
            if (disposed) return;
            const route = result?.routes?.[0];
            if (status === "complete" && route) {
              setRouteSummary(`骑行 ${(route.distance / 1000).toFixed(2)} km · 约 ${Math.max(1, Math.round(route.time / 60))} 分钟`);
            } else setMapError("暂未找到可用骑行路线，请刷新重试。");
          });
        } else {
          for (const [label, point, color] of [["骑手", trail?.dispatcher, "#f97316"], ["门店", trail?.sender, "#2563eb"], ["顾客", trail?.receiver, "#059669"]] as const) {
            if (!point) continue;
            const content = document.createElement("div");
            content.style.cssText = "display:flex;flex-direction:column;align-items:center;width:44px;filter:drop-shadow(0 3px 5px #0004);";
            const caption = document.createElement("div");
            caption.textContent = label === "骑手" ? "骑手在这里" : label;
            caption.style.cssText = `background:${color};color:#fff;border:2px solid white;border-radius:10px;padding:5px 10px;font-size:13px;font-weight:700;white-space:nowrap;margin-bottom:3px;`;
            const svgNamespace = "http://www.w3.org/2000/svg";
            const pin = document.createElementNS(svgNamespace, "svg");
            pin.setAttribute("width", "44");
            pin.setAttribute("height", "54");
            pin.setAttribute("viewBox", "0 0 44 54");
            pin.setAttribute("aria-hidden", "true");
            pin.style.display = "block";
            const shape = document.createElementNS(svgNamespace, "path");
            shape.setAttribute("d", "M22 52C18 46 3 31 3 22a19 19 0 1 1 38 0c0 9-15 24-19 30Z");
            shape.setAttribute("fill", color);
            shape.setAttribute("stroke", "white");
            shape.setAttribute("stroke-width", "2");
            shape.setAttribute("stroke-linejoin", "round");
            const center = document.createElementNS(svgNamespace, "circle");
            center.setAttribute("cx", "22");
            center.setAttribute("cy", "22");
            center.setAttribute("r", "7");
            center.setAttribute("fill", "white");
            pin.append(shape, center);
            content.append(caption, pin);
            map!.add(new sdk.Marker({ position: [point.lng, point.lat], title: label, content, anchor: "bottom-center", zIndex: label === "骑手" ? 200 : 100 }));
          }
          map!.setFitView();
        }
        setMapError("");
      } catch (err) {
        if (!disposed) setMapError(err instanceof Error ? err.message : "地图加载失败");
      } finally { clearTimeout(timeout); }
    }
    void draw();
    return () => { disposed = true; clearTimeout(timeout); map?.destroy(); };
  }, [trail, riderAssigned, shopAddress, order.longitude, order.latitude, order.userAddress, attempt]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="order-route-title" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 id="order-route-title" className="font-semibold">{riderAssigned ? "骑手位置" : "门店到收货地址"}</h2>
        <button type="button" onClick={onClose} aria-label="关闭骑手位置" className="rounded-full p-2 hover:bg-muted"><X size={20} /></button>
      </div>
      <div className="space-y-2 p-4 text-sm">
        <p className="font-semibold">{riderAssigned ? "骑手已接单 · 橙色标记为骑手" : "骑手尚未接单 · 先查看配送路线"}</p>
        {riderAssigned ? <p>骑手：{order.delivery?.riderName || "暂未提供"} {order.delivery?.riderPhone || ""}</p> : <p className="text-muted-foreground">{routeSummary || "正在规划门店到收货地址的骑行路线…"}</p>}
        <p>门店：{order.matchedShopName || order.rawShopName || order.shopAddress || "暂未提供"}</p>
        <p>收货地址：{order.userAddress || "暂未提供"}</p>
        {riderAssigned && trail && <>
          <p>{trail.orderStatus === "pickup" && !trail.isTakeGoods ? "骑手距离商家" : "平台返回距离"}：{trail.distance || "暂无距离"}</p>
          {!trail.dispatcher && <p role="status">平台暂未返回骑手坐标，无法显示骑手位置。</p>}
          <p className="text-muted-foreground">最近查询：{new Date(trail.fetchedAt).toLocaleTimeString()} · 每 30 秒刷新（位置以平台上报为准）</p>
        </>}
        {riderAssigned && error && <p role="alert" className="text-red-500">{error}{trail ? " 当前显示上次成功查询的位置。" : ""}</p>}
        {riderAssigned && !trail?.dispatcher && !loading && <p role="status">骑手位置暂未更新</p>}
        {mapError && <p role="alert" className="text-red-500">{mapError}</p>}
        <button type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 disabled:opacity-50">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {loading ? "正在查询…" : "刷新地图"}
        </button>
      </div>
      <div ref={containerRef} className="h-[50dvh] min-h-64 w-full bg-muted" />
    </dialog>, document.body,
  );
}
