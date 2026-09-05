"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Phone, RefreshCw, Store, User, X } from "lucide-react";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import type { AutoPickOrder } from "@/lib/types";
import { isAutoPickOrderRiderAssigned } from "@/lib/autoPickOrderStatus";

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
      statusBadgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
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
      statusBadgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      distanceLabel: "骑手距离顾客",
    };
  }

  const isArrivedShop = !isTakeGoods && /已到店|到店|arrival|arrived/i.test(statusCombined);
  if (isArrivedShop) {
    return {
      phase: "arrived_shop",
      statusTitle: "骑手已到店 · 等待取货",
      statusBadgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      distanceLabel: "骑手距离门店",
    };
  }

  if (riderAssigned) {
    return {
      phase: "assigned",
      statusTitle: "骑手已接单 · 赶往门店中",
      statusBadgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
      distanceLabel: "骑手距离门店",
    };
  }

  return {
    phase: "unassigned",
    statusTitle: "骑手未接单 · 路线规划",
    statusBadgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
    distanceLabel: "门店距收货地址",
  };
}

/** 创建与参考图二 1:1 像素级复刻的圆形图标 Marker */
function createPinMarkerElement(type: "shop" | "rider" | "customer") {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.28));user-select:none;";

  const circle = document.createElement("div");
  circle.style.cssText = `
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 2.5px solid #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  `;

  let svgContent = "";
  let bgColor = "#0284c7";

  if (type === "shop") {
    // 门店：天蓝色底徽章 + 白色商铺屋檐图标（与图二一致）
    bgColor = "#0284c7";
    circle.style.backgroundColor = bgColor;
    circle.style.boxShadow = "0 3px 10px rgba(2, 132, 199, 0.45)";
    svgContent = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M4 4h16l1 5H3L4 4zm-1 6h18v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3-3v-2zm2 6h14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-4z"/>
      </svg>
    `;
  } else if (type === "rider") {
    // 骑手：暖橙色底徽章 + 白色节点放射/定位图标（与图二一致）
    bgColor = "#f97316";
    circle.style.backgroundColor = bgColor;
    circle.style.boxShadow = "0 3px 12px rgba(249, 115, 22, 0.5)";
    svgContent = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="18" cy="5" r="2.8" fill="white"/>
        <circle cx="6" cy="12" r="2.8" fill="white"/>
        <circle cx="18" cy="19" r="2.8" fill="white"/>
        <line x1="8.5" y1="13.5" x2="15.5" y2="17.5"/>
        <line x1="15.5" y1="6.5" x2="8.5" y2="10.5"/>
      </svg>
    `;
  } else {
    // 顾客：天蓝色底徽章 + 白色单人人像剪影图标（与图二一致）
    bgColor = "#0284c7";
    circle.style.backgroundColor = bgColor;
    circle.style.boxShadow = "0 3px 10px rgba(2, 132, 199, 0.45)";
    svgContent = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    `;
  }

  circle.innerHTML = svgContent;

  // 底部倒三角定位指针
  const pointer = document.createElement("div");
  pointer.style.cssText = `
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid ${bgColor};
    margin-top: -1px;
  `;

  container.appendChild(circle);
  container.appendChild(pointer);
  return container;
}

/** 创建与参考图二 1:1 像素级复刻的橙边白底悬浮距离气泡 */
function createDistanceBubbleElement(text: string) {
  const bubble = document.createElement("div");
  bubble.style.cssText = `
    background-color: #ffffff;
    border: 1.5px solid #ff7a18;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    pointer-events: none;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
  `;
  bubble.textContent = text;
  return bubble;
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
  const [showInfoCard, setShowInfoCard] = useState(true);

  const riderAssigned = Boolean(trail?.dispatcher || trail?.isTakeGoods
    || /^(pickup|delivering)$/i.test(trail?.orderStatus || "")
    || isAutoPickOrderRiderAssigned(order));
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
      primaryDistanceValue = `${formatMeters(calculateDistanceMeters(riderCoord, customerCoord))}`;
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
      primaryDistanceValue = `${formatMeters(calculateDistanceMeters(riderCoord, shopCoord))}`;
    } else {
      primaryDistanceValue = "位置同步中";
    }
  } else {
    primaryDistanceValue = routeSummary || (order.distanceKm != null ? `${order.distanceKm.toFixed(1)}公里` : "计算中…");
  }

  const shopToCustomerDistance = order.distanceKm != null
    ? `${order.distanceKm.toFixed(1)}公里`
    : (shopCoord && customerCoord ? `${formatMeters(calculateDistanceMeters(shopCoord, customerCoord))}` : "");

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
    let map: any | undefined;
    const timeout = setTimeout(() => { if (!disposed) { disposed = true; setMapError("地图加载超时，请刷新重试。"); } }, 15000);

    async function draw() {
      try {
        const key = process.env.NEXT_PUBLIC_AMAP_KEY;
        if (!key) throw new Error("高德地图配置未就绪");
        const sdk = await loadBareAmap(key, process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "");
        if (disposed || !containerRef.current) return;

        // 初始化高德地图实例（铺满整个视窗）
        map = new sdk.Map(containerRef.current, {
          zoom: 14,
          resizeEnable: true,
          viewMode: "2D",
        });

        // 加载并添加与参考图二一致的高德原生控件群（ControlBar罗盘、ToolBar缩放条、Scale比例尺）
        sdk.plugin(["AMap.Scale", "AMap.ToolBar", "AMap.ControlBar"], () => {
          if (disposed || !map) return;
          try {
            // 比例尺（图二位于左上角顶栏）
            const scale = new sdk.Scale({
              position: { top: "18px", left: "95px" },
            });
            map.addControl(scale);

            // 罗盘 ControlBar（图二位于最左上角）
            const controlBar = new sdk.ControlBar({
              position: { top: "12px", left: "15px" },
            });
            map.addControl(controlBar);

            // 缩放滑块 ToolBar（图二位于罗盘正下方）
            const toolBar = new sdk.ToolBar({
              position: { top: "115px", left: "20px" },
            });
            map.addControl(toolBar);
          } catch {
            // 忽略控件加载异常
          }
        });

        if (!riderAssigned) {
          // 未接单状态：解析地址并规划路线
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

          // 添加图二风格的门店与顾客 Marker
          const shopMarker = new sdk.Marker({
            position: start,
            content: createPinMarkerElement("shop"),
            anchor: "bottom-center",
            title: "门店",
            zIndex: 110,
          });
          const customerMarker = new sdk.Marker({
            position: end,
            content: createPinMarkerElement("customer"),
            anchor: "bottom-center",
            title: "顾客",
            zIndex: 110,
          });
          map.add(shopMarker);
          map.add(customerMarker);

          const riding = new sdk.Riding({ map, autoFitView: true });
          riding.search(start, end, (status: string, result: { routes?: { distance: number; time: number }[] }) => {
            if (disposed) return;
            const route = result?.routes?.[0];
            if (status === "complete" && route) {
              const distText = `${(route.distance / 1000).toFixed(1)}公里`;
              setRouteSummary(distText);

              // 在顾客上方挂载图二白底橙边气泡
              const bubbleMarker = new sdk.Marker({
                position: end,
                content: createDistanceBubbleElement(`门店距顾客：${distText}`),
                anchor: "bottom-center",
                offset: new sdk.Pixel(0, -48),
                zIndex: 150,
              });
              map.add(bubbleMarker);
            } else {
              setMapError("暂未找到可用骑行路线，请刷新重试。");
            }
          });
        } else {
          // 已接单/配送中：渲染图二风格圆形实体 Marker 与橙边悬浮距离气泡
          const addedMarkers: any[] = [];

          // 1. 门店 Marker
          if (trail?.sender) {
            const lng = Number(trail.sender.lng);
            const lat = Number(trail.sender.lat);
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              const marker = new sdk.Marker({
                position: [lng, lat],
                content: createPinMarkerElement("shop"),
                anchor: "bottom-center",
                title: "门店",
                zIndex: 110,
              });
              map.add(marker);
              addedMarkers.push(marker);
            }
          }

          // 2. 顾客 Marker
          if (customerCoord) {
            const lng = Number(customerCoord.lng);
            const lat = Number(customerCoord.lat);
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              const marker = new sdk.Marker({
                position: [lng, lat],
                content: createPinMarkerElement("customer"),
                anchor: "bottom-center",
                title: "顾客",
                zIndex: 110,
              });
              map.add(marker);
              addedMarkers.push(marker);
            }
          }

          // 3. 骑手 Marker 与图二橙边白底悬浮气泡
          if (trail?.dispatcher) {
            const lng = Number(trail.dispatcher.lng);
            const lat = Number(trail.dispatcher.lat);
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              const riderMarker = new sdk.Marker({
                position: [lng, lat],
                content: createPinMarkerElement("rider"),
                anchor: "bottom-center",
                title: "骑手",
                zIndex: 130,
              });
              map.add(riderMarker);
              addedMarkers.push(riderMarker);

              // 气泡文字动态匹配：未取货时显示“骑手距离门店”，已取货时显示“骑手距离顾客”
              const bubbleText = phaseInfo.phase === "delivering"
                ? `骑手距离顾客：${primaryDistanceValue}`
                : (phaseInfo.phase === "arrived_shop"
                  ? `骑手已到店`
                  : `骑手距离门店：${primaryDistanceValue}`);

              // 图二悬浮气泡挂载在骑手上空，跟随骑手坐标
              const bubbleMarker = new sdk.Marker({
                position: [lng, lat],
                content: createDistanceBubbleElement(bubbleText),
                anchor: "bottom-center",
                offset: new sdk.Pixel(0, -48),
                zIndex: 160,
              });
              map.add(bubbleMarker);
              addedMarkers.push(bubbleMarker);
            }
          } else if (customerCoord && primaryDistanceValue) {
            // 若暂无骑手坐标，气泡挂在顾客头顶
            const bubbleMarker = new sdk.Marker({
              position: [customerCoord.lng, customerCoord.lat],
              content: createDistanceBubbleElement(`门店距收货地址：${shopToCustomerDistance || primaryDistanceValue}`),
              anchor: "bottom-center",
              offset: new sdk.Pixel(0, -48),
              zIndex: 160,
            });
            map.add(bubbleMarker);
            addedMarkers.push(bubbleMarker);
          }

          if (addedMarkers.length > 0) {
            try {
              map.setFitView(addedMarkers, false, [70, 70, 70, 70]);
            } catch {
              // 忽略视野自适应异常
            }
          }
        }
        setMapError("");
      } catch (err) {
        if (!disposed) setMapError(err instanceof Error ? err.message : "地图加载失败");
      } finally {
        clearTimeout(timeout);
      }
    }

    void draw();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      try {
        map?.destroy();
      } catch {
        // 忽略地图销毁异常
      }
    };
  }, [trail, riderAssigned, shopAddress, order.longitude, order.latitude, order.userAddress, attempt, customerCoord, phaseInfo.phase, primaryDistanceValue, shopToCustomerDistance]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="order-route-title"
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto h-[88dvh] max-h-[860px] w-[95vw] max-w-5xl overflow-hidden rounded-2xl border border-border/80 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      {/* 沉浸式全屏高德大地图容器（彻底告别图一顶部大黑板） */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full bg-muted/40" />

      {/* 右上角悬浮操作胶囊栏 */}
      <div className="absolute right-3.5 top-3.5 z-20 flex items-center gap-2">
        {/* 配送状态指示胶囊 */}
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur-md bg-background/90 dark:bg-zinc-900/90 ${phaseInfo.statusBadgeClass}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
          </span>
          <span>{phaseInfo.statusTitle}</span>
        </div>

        {/* 刷新地图按钮 */}
        <button
          type="button"
          disabled={loading}
          onClick={() => setAttempt((v) => v + 1)}
          title="刷新骑手实时位置"
          className="flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 text-xs font-medium text-foreground shadow-md backdrop-blur-md transition-colors hover:bg-muted disabled:opacity-50 dark:bg-zinc-900/90"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-primary" : ""} />
          <span className="hidden sm:inline">{loading ? "查询中…" : "刷新"}</span>
        </button>

        {/* 关闭弹窗按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:bg-muted hover:text-foreground dark:bg-zinc-900/90"
        >
          <X size={16} />
        </button>
      </div>

      {/* 底部轻量浮动卡片（包含骑手电话、门店、收货地址，支持一键折叠） */}
      <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
        <div className="overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-xl backdrop-blur-md dark:bg-zinc-900/95 transition-all">
          {/* 卡片头部：可点击折叠/展开 */}
          <div
            onClick={() => setShowInfoCard((v) => !v)}
            className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {riderAssigned ? (order.delivery?.riderName ? `骑手：${order.delivery.riderName}` : "骑手配送信息") : "配送路线信息"}
              </span>
              {order.delivery?.riderPhone && (
                <a
                  href={`tel:${order.delivery.riderPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Phone size={11} />
                  {order.delivery.riderPhone}
                </a>
              )}
            </div>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              {showInfoCard ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          </div>

          {/* 展开的详情部分 */}
          {showInfoCard && (
            <div className="space-y-2 border-t border-border/60 px-3.5 py-2.5 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Store size={13} className="mt-0.5 shrink-0 text-blue-500" />
                <span className="text-foreground line-clamp-1">
                  {order.matchedShopName || order.rawShopName || order.shopAddress || "暂无门店信息"}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <User size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                <span className="text-foreground line-clamp-2">
                  {order.userAddress || "暂无收货地址"}
                </span>
              </div>
              {shopToCustomerDistance && (
                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
                  <span>门店距收货地址</span>
                  <span className="font-medium text-foreground">{shopToCustomerDistance}</span>
                </div>
              )}
              {riderAssigned && trail?.fetchedAt && (
                <div className="text-[10px] text-muted-foreground/80 flex items-center justify-between pt-0.5">
                  <span>最近更新：{new Date(trail.fetchedAt).toLocaleTimeString()}</span>
                  <span>30秒自动刷新</span>
                </div>
              )}
              {riderAssigned && !trail?.dispatcher && !loading && (
                <div className="text-[11px] text-amber-500 font-medium">平台暂未返回骑手实时坐标</div>
              )}
              {error && <div className="text-[11px] text-red-500">{error}</div>}
              {mapError && <div className="text-[11px] text-red-500">{mapError}</div>}
            </div>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}


