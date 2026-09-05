"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, RefreshCw, X } from "lucide-react";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import type { AutoPickOrder } from "@/lib/types";

type Point = { lng: number; lat: number };
type Trail = {
  dispatcher: Point | null;
  sender: Point | null;
  receiver: Point | null;
  distance: string;
  orderStatus: string;
  statusName?: string;
  isTakeGoods: boolean;
  fetchedAt: string;
};

type DeliveryPhase = "unassigned" | "assigned" | "arrived_shop" | "delivering" | "delivered";

function calculateDistanceMeters(p1: Point, p2: Point): number {
  const rad = Math.PI / 180;
  const dLat = (p2.lat - p1.lat) * rad;
  const dLng = (p2.lng - p1.lng) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(p1.lat * rad) * Math.cos(p2.lat * rad)
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatMeters(meters: number): string {
  if (meters < 1000) return `${meters}米`;
  return `${(meters / 1000).toFixed(1)}公里`;
}

function formatDistanceText(raw?: string | number | null): string {
  if (raw == null) return "";
  const str = String(raw).trim();
  if (!str) return "";
  if (/^\d+(\.\d+)?$/.test(str)) {
    return formatMeters(parseFloat(str));
  }
  return str;
}

function getDeliveryPhase(order: AutoPickOrder, trail: Trail | null, riderAssigned: boolean): {
  phase: DeliveryPhase;
  statusTitle: string;
  statusBadgeClass: string;
  distanceLabel: string;
} {
  const orderStatus = String(order.status || "").trim();
  const trailStatus = String(trail?.orderStatus || "").trim();
  const statusCombined = `${orderStatus} ${trailStatus}`;

  const isDelivered = /已完成|已送达|配送完成|finished|completed/i.test(statusCombined)
    || Boolean(order.delivery?.completedTime);
  if (isDelivered) {
    return {
      phase: "delivered",
      statusTitle: "订单已送达",
      statusBadgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      distanceLabel: "配送状态",
    };
  }

  const isTakeGoods = Boolean(trail?.isTakeGoods)
    || Boolean(order.delivery?.pickupTime)
    || /已取货|配送中|派送中|delivering/i.test(statusCombined);

  if (isTakeGoods) {
    return {
      phase: "delivering",
      statusTitle: "骑手已取货 · 正在配送中",
      statusBadgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      distanceLabel: "骑手距离顾客",
    };
  }

  const isArrivedShop = !isTakeGoods && /已到店|到店|arrival|arrived/i.test(statusCombined);
  if (isArrivedShop) {
    return {
      phase: "arrived_shop",
      statusTitle: "骑手已到店 · 等待出餐取货",
      statusBadgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      distanceLabel: "骑手距离门店",
    };
  }

  if (riderAssigned) {
    return {
      phase: "assigned",
      statusTitle: "骑手已接单 · 赶往门店中",
      statusBadgeClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      distanceLabel: "骑手距离门店",
    };
  }

  return {
    phase: "unassigned",
    statusTitle: "骑手尚未接单 · 先查看配送路线",
    statusBadgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    distanceLabel: "门店距收货地址",
  };
}

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

  const customerCoord: Point | null = (trail?.receiver ?? null) || (
    typeof order.longitude === "number" && typeof order.latitude === "number"
    && Number.isFinite(order.longitude) && Number.isFinite(order.latitude)
    && Math.abs(order.longitude) <= 180 && Math.abs(order.latitude) <= 90
    && (order.longitude !== 0 || order.latitude !== 0)
      ? { lng: order.longitude, lat: order.latitude }
      : null
  );
  const shopCoord: Point | null = trail?.sender ?? null;
  const riderCoord: Point | null = trail?.dispatcher ?? null;

  const phaseInfo = getDeliveryPhase(order, trail, riderAssigned);

  let primaryDistanceValue = "";
  const platformDistance = formatDistanceText(trail?.distance);

  if (phaseInfo.phase === "delivered") {
    primaryDistanceValue = "已送达";
  } else if (phaseInfo.phase === "delivering") {
    if (platformDistance) {
      primaryDistanceValue = platformDistance;
    } else if (riderCoord && customerCoord) {
      primaryDistanceValue = `约 ${formatMeters(calculateDistanceMeters(riderCoord, customerCoord))}（直线）`;
    } else {
      primaryDistanceValue = "位置同步中";
    }
  } else if (phaseInfo.phase === "arrived_shop") {
    if (platformDistance) {
      primaryDistanceValue = `已到店（距门店 ${platformDistance}）`;
    } else {
      primaryDistanceValue = "已到店";
    }
  } else if (phaseInfo.phase === "assigned") {
    if (platformDistance) {
      primaryDistanceValue = platformDistance;
    } else if (riderCoord && shopCoord) {
      primaryDistanceValue = `约 ${formatMeters(calculateDistanceMeters(riderCoord, shopCoord))}（直线）`;
    } else {
      primaryDistanceValue = "位置同步中";
    }
  } else {
    primaryDistanceValue = routeSummary || (order.distanceKm != null ? `约 ${(order.distanceKm).toFixed(2)} 公里` : "正在规划路线…");
  }

  const shopToCustomerDistance = order.distanceKm != null
    ? `约 ${order.distanceKm.toFixed(2)} 公里`
    : (shopCoord && customerCoord ? `约 ${formatMeters(calculateDistanceMeters(shopCoord, customerCoord))}（直线）` : "");

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
          const markers = [
            { label: "骑手", point: trail?.dispatcher, color: "#f97316", zIndex: 200 },
            { label: "门店", point: trail?.sender, color: "#2563eb", zIndex: 100 },
            { label: "顾客", point: customerCoord, color: "#059669", zIndex: 100 },
          ] as const;

          const addedMarkers: any[] = [];
          for (const item of markers) {
            if (!item.point) continue;
            const lng = Number(item.point.lng);
            const lat = Number(item.point.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

            const content = document.createElement("div");
            content.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));";

            const caption = document.createElement("div");
            caption.textContent = item.label;
            caption.style.cssText = `background:${item.color};color:#fff;border:1.5px solid #fff;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:600;line-height:14px;white-space:nowrap;margin-bottom:2px;box-shadow:0 1px 3px rgba(0,0,0,0.2);`;

            const svgNamespace = "http://www.w3.org/2000/svg";
            const pin = document.createElementNS(svgNamespace, "svg");
            pin.setAttribute("width", "22");
            pin.setAttribute("height", "28");
            pin.setAttribute("viewBox", "0 0 44 54");
            pin.setAttribute("aria-hidden", "true");
            pin.style.display = "block";

            const shape = document.createElementNS(svgNamespace, "path");
            shape.setAttribute("d", "M22 52C18 46 3 31 3 22a19 19 0 1 1 38 0c0 9-15 24-19 30Z");
            shape.setAttribute("fill", item.color);
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

            try {
              const marker = new sdk.Marker({
                position: [lng, lat],
                title: item.label,
                content,
                anchor: "bottom-center",
                zIndex: item.zIndex,
              });
              map!.add(marker);
              addedMarkers.push(marker);
            } catch {
              // 忽略单个 Marker 创建失败
            }
          }

          if (addedMarkers.length > 0) {
            try {
              map!.setFitView(addedMarkers);
            } catch {
              // 忽略视野自适应异常
            }
          }
        }
        setMapError("");
      } catch (err) {
        if (!disposed) setMapError(err instanceof Error ? err.message : "地图加载失败");
      } finally { clearTimeout(timeout); }
    }
    void draw();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      try {
        map?.destroy();
      } catch {
        // 忽略地图销毁时的偶发异常
      }
    };
  }, [trail, riderAssigned, shopAddress, order.longitude, order.latitude, order.userAddress, attempt, customerCoord]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="order-route-title" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="order-route-title" className="font-semibold text-base">{riderAssigned ? "骑手位置" : "门店到收货地址"}</h2>
        <button type="button" onClick={onClose} aria-label="关闭骑手位置" className="rounded-full p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
      </div>

      <div className="space-y-3 p-4 text-sm">
        {/* 顶部状态栏与图例 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${phaseInfo.statusBadgeClass}`}>
            {phaseInfo.statusTitle}
          </span>
          {riderAssigned && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f97316]" />骑手
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2563eb]" />门店
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#059669]" />顾客
              </span>
            </div>
          )}
        </div>

        {/* 核心动态距离卡片 */}
        <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">{phaseInfo.distanceLabel}</span>
            <span className="font-bold text-base text-primary">{primaryDistanceValue}</span>
          </div>
          {shopToCustomerDistance && phaseInfo.phase !== "unassigned" && (
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1.5 border-t border-border/50">
              <span>门店距收货地址</span>
              <span>{shopToCustomerDistance}</span>
            </div>
          )}
        </div>

        {/* 基本订单与配送信息 */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {riderAssigned && (
            <p className="text-foreground">
              <span className="text-muted-foreground">骑手：</span>
              {order.delivery?.riderName || "暂未提供"} {order.delivery?.riderPhone || ""}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">门店：</span>
            {order.matchedShopName || order.rawShopName || order.shopAddress || "暂未提供"}
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">收货地址：</span>
            {order.userAddress || "暂未提供"}
          </p>
        </div>

        {/* 状态与刷新栏 */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {riderAssigned && trail?.fetchedAt && (
              <p>最近查询：{new Date(trail.fetchedAt).toLocaleTimeString()} · 每 30 秒刷新</p>
            )}
            {riderAssigned && !trail?.dispatcher && !loading && (
              <p role="status" className="text-amber-500">平台暂未返回骑手实时坐标</p>
            )}
            {error && <p role="alert" className="text-red-500">{error}{trail ? "（显示上次成功位置）" : ""}</p>}
            {mapError && <p role="alert" className="text-red-500">{mapError}</p>}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {loading ? "正在查询…" : "刷新地图"}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="h-[50dvh] min-h-64 w-full bg-muted" />
    </dialog>, document.body,
  );
}

