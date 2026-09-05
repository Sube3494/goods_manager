"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import type { AutoPickOrder } from "@/lib/types";

type Geocoder = {
  getLocation: (address: string, callback: (status: string, result: string | { geocodes?: { location: AMap.LngLat }[] }) => void) => void;
};
type Riding = {
  search: (origin: AMap.LngLat, destination: AMap.LngLat, callback: (status: string, result: string | { routes?: { distance: number; time: number }[] }) => void) => void;
};

export function OrderRouteModal({ order, onClose }: { order: AutoPickOrder; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("正在加载路线…");
  const [error, setError] = useState("");
  const shopAddress = order.shopAddress?.trim() || order.rawShopAddress?.trim() || "";
  const { userAddress, longitude, latitude } = order;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    let disposed = false;
    let map: AMap.Map | undefined;
    const timeout = window.setTimeout(() => {
      if (!disposed) {
        disposed = true;
        setError("路线加载超时，请检查网络后重试。");
        setStatus("");
      }
    }, 20000);

    async function boot() {
      try {
        if (!shopAddress) throw new Error("该订单缺少店铺地址，暂时无法规划路线。");
        const key = process.env.NEXT_PUBLIC_AMAP_KEY;
        if (!key) throw new Error("高德地图配置未就绪，请配置地图 JS API Key 后重新构建。");
        const sdk = await loadBareAmap(key, process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "");
        if (disposed) return;
        await new Promise<void>((resolve) => sdk.plugin(["AMap.Riding", "AMap.Geocoder"], resolve));
        if (disposed || !containerRef.current) return;
        const geocoder = new sdk.Geocoder() as Geocoder;
        const geocode = (address: string) => new Promise<AMap.LngLat>((resolve, reject) => {
          if (!address) return reject(new Error("该订单缺少收货地点，暂时无法规划路线。"));
          geocoder.getLocation(address, (resultStatus, result) => {
            if (resultStatus === "complete" && typeof result !== "string" && result.geocodes?.[0]) {
              resolve(result.geocodes[0].location);
            } else reject(new Error("无法识别地址，请检查收货地点和店铺地址是否完整。"));
          });
        });
        const hasCoordinates = typeof longitude === "number" && typeof latitude === "number"
          && Number.isFinite(longitude) && Number.isFinite(latitude)
          && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90 && (longitude !== 0 || latitude !== 0);
        const [origin, destination] = await Promise.all([
          hasCoordinates ? Promise.resolve(new sdk.LngLat(longitude, latitude) as AMap.LngLat) : geocode(userAddress),
          geocode(shopAddress),
        ]);
        if (disposed) return;
        map = new sdk.Map(containerRef.current, { zoom: 13, center: origin, resizeEnable: true });
        const riding = new sdk.Riding({ map, autoFitView: true }) as Riding;
        riding.search(origin, destination, (resultStatus, result) => {
          if (disposed) return;
          window.clearTimeout(timeout);
          if (resultStatus === "complete" && typeof result !== "string" && result.routes?.[0]) {
            const route = result.routes[0];
            setStatus(`骑行 ${(route.distance / 1000).toFixed(2)} km · 约 ${Math.max(1, Math.round(route.time / 60))} 分钟`);
          } else {
            setStatus("");
            setError("未找到可用的骑行路线，请检查地址或稍后重试。");
          }
        });
      } catch (err) {
        if (disposed) return;
        window.clearTimeout(timeout);
        setStatus("");
        setError(err instanceof Error ? err.message : "地图加载失败，请稍后重试。");
      }
    }
    void boot();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      map?.destroy();
    };
  }, [shopAddress, userAddress, longitude, latitude, attempt]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="order-route-title" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-auto rounded-3xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 id="order-route-title" className="font-semibold">地点到店铺的路线</h2>
        <button type="button" onClick={onClose} aria-label="关闭路线图" className="rounded-full p-2 hover:bg-muted"><X size={20} /></button>
      </div>
      <div className="space-y-2 p-4 text-sm">
        <p>起点：{userAddress || "订单收货坐标"}</p>
        <p>终点：{order.matchedShopName || order.rawShopName || "店铺"} · {shopAddress || "地址缺失"}</p>
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          {status === "正在加载路线…" && <Loader2 size={16} className="animate-spin" />}{status}
        </p>
        {error && <div role="alert" className="flex items-center justify-between gap-3 text-red-500">
          <p>{error}</p>
          <button type="button" className="shrink-0 rounded-lg border border-border px-3 py-1" onClick={() => { setError(""); setStatus("正在加载路线…"); setAttempt((value) => value + 1); }}>重试</button>
        </div>}
      </div>
      <div ref={containerRef} className="h-[50dvh] min-h-64 w-full bg-muted" />
    </dialog>, document.body,
  );
}
