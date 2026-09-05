"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
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
  const trailStatusName = String(trail?.statusName || "").trim();
  const trailOrderStatus = String(trail?.orderStatus || "").trim().toLowerCase();
  const deliveryTrack = String(order.delivery?.track || (order.delivery as any)?.status || "").trim();
  const orderStatus = String(order.status || "").trim();

  // 1. 已完成 / 已送达
  if (
    /已完成|已送达|配送完成|done|finished|completed/i.test(`${trailStatusName} ${trailOrderStatus} ${deliveryTrack} ${orderStatus}`)
    || Boolean(order.delivery?.completedTime)
  ) {
    return {
      phase: "delivered",
      statusTitle: trailStatusName || "已送达",
      statusBadgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      distanceLabel: "配送状态",
    };
  }

  // 2. 配送中 / 送货中（麦芽田指示正在送往顾客）
  if (
    /配送中|送货中|送件中|已取货|派送中/i.test(`${trailStatusName} ${deliveryTrack}`)
    || /delivering|shipping|send|delivery/i.test(trailOrderStatus)
    || trail?.isTakeGoods === true
  ) {
    return {
      phase: "delivering",
      statusTitle: trailStatusName || "配送中",
      statusBadgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      distanceLabel: "骑手距离顾客",
    };
  }

  // 3. 已到店（麦芽田指示骑手已到店等待取货）
  if (/已到店|到店|arrival|arrived/i.test(`${trailStatusName} ${trailOrderStatus} ${deliveryTrack}`)) {
    return {
      phase: "arrived_shop",
      statusTitle: trailStatusName || "已到店",
      statusBadgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      distanceLabel: "骑手距离门店",
    };
  }

  // 4. 待取货 / 已接单（麦芽田指示骑手赶往门店取货）
  if (
    /待取货|已接单|待接单|取货中/i.test(`${trailStatusName} ${trailOrderStatus} ${deliveryTrack}`)
    || /pickup|accepted|assign/i.test(trailOrderStatus)
    || riderAssigned
  ) {
    return {
      phase: "assigned",
      statusTitle: trailStatusName || "待取货",
      statusBadgeClass: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
      distanceLabel: "骑手距离门店",
    };
  }

  // 5. 未分配骑手
  return {
    phase: "unassigned",
    statusTitle: trailStatusName || orderStatus || "未接单",
    statusBadgeClass: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",
    distanceLabel: "门店距收货地址",
  };
}

/**
 * 创建高品质圆形矢量 Marker（门店/骑手/顾客）
 * 严格禁止使用任何 emoji 表情，统一采用高质感 SVG 矢量图标配以纯文本微胶囊
 */
function createPinMarkerElement(type: "shop" | "rider" | "customer", labelText?: string) {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.32));user-select:none;";

  const circle = document.createElement("div");
  circle.style.cssText = `
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 2.5px solid #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  `;

  let svgContent = "";
  let bgColor = "#0284c7";
  let defaultLabel = "门店";

  if (type === "shop") {
    // 门店：高德科技蓝圆徽章 + 专业实体商铺与波浪条纹遮阳篷 SVG 图标
    bgColor = "#0284c7";
    defaultLabel = "门店";
    circle.style.background = "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)";
    circle.style.boxShadow = "0 4px 14px rgba(2, 132, 199, 0.48)";
    svgContent = `
      <svg width="25" height="25" viewBox="0 0 24 24" fill="white">
        <path d="M2 4h20v2H2z" />
        <path d="M3 6h18l-1.3 5c-.2.8-.9 1.4-1.7 1.4s-1.5-.6-1.7-1.4L16.8 7.5h-1.6l-.8 3.5c-.2.8-.9 1.4-1.7 1.4s-1.5-.6-1.7-1.4L9.8 7.5H8.2l-.8 3.5c-.2.8-.9 1.4-1.7 1.4s-1.5-.6-1.7-1.4L4.3 6z" />
        <path d="M4 13v7.2c0 .4.4.8.8.8h14.4c.4 0 .8-.4.8-.8V13h-2v6H6v-6H4z" />
        <rect x="9.5" y="14" width="5" height="6.8" rx="0.5" fill="white" />
        <circle cx="13.5" cy="17.5" r="0.6" fill="#0369a1" />
      </svg>
    `;
  } else if (type === "rider") {
    // 骑手：活力外卖橙圆徽章 + 头盔骑手小电驴/摩托车与后座保温外卖箱 SVG 图标
    bgColor = "#ea580c";
    defaultLabel = "骑手";
    circle.style.background = "linear-gradient(135deg, #ff7300 0%, #ea580c 100%)";
    circle.style.boxShadow = "0 4px 16px rgba(234, 88, 12, 0.55)";
    svgContent = `
      <svg width="28" height="28" viewBox="0 0 36 36" fill="white">
        <circle cx="21" cy="7.5" r="3.4" />
        <rect x="5" y="11.5" width="8" height="8.5" rx="1.5" fill="white" />
        <line x1="5" y1="15" x2="13" y2="15" stroke="#ea580c" stroke-width="1.2" />
        <path d="M17 11.5c-1 0-2 .6-2.5 1.5l-1.8 2.5h4.8l2.8-3.2c-.9-.5-2.1-.8-3.3-.8z" />
        <path d="M20 11.8l-2.6 4.8 3.2 2.8h4.2l2.4-4c.4-.6.2-1.4-.4-1.8l-4-2c-.8-.4-1.8-.1-2.8.2z" />
        <path d="M9 20h8l4-7h5l2.5 7" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="9" cy="26" r="4.2" fill="none" stroke="white" stroke-width="2.8" />
        <circle cx="9" cy="26" r="1.5" fill="white" />
        <circle cx="27" cy="26" r="4.2" fill="none" stroke="white" stroke-width="2.8" />
        <circle cx="27" cy="26" r="1.5" fill="white" />
      </svg>
    `;
  } else {
    // 顾客：高德科技蓝圆徽章 + 白色单人人像剪影 SVG 图标
    bgColor = "#0284c7";
    defaultLabel = "顾客";
    circle.style.background = "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)";
    circle.style.boxShadow = "0 4px 14px rgba(2, 132, 199, 0.48)";
    svgContent = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
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
    border-left: 5.5px solid transparent;
    border-right: 5.5px solid transparent;
    border-top: 6px solid ${bgColor};
    margin-top: -1px;
  `;

  // 下方纯文本微胶囊标签（严禁使用任何 emoji 表情符号）
  const badge = document.createElement("div");
  badge.style.cssText = `
    margin-top: 2px;
    padding: 1.5px 7px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    color: #ffffff;
    background-color: ${bgColor};
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.22);
    white-space: nowrap;
  `;
  badge.textContent = labelText || defaultLabel;

  container.appendChild(circle);
  container.appendChild(pointer);
  container.appendChild(badge);
  return container;
}

/**
 * 创建橙边悬浮距离气泡（自动适配暗色与亮色主题，自带指示下箭头）
 */
function createDistanceBubbleElement(text: string, isDark: boolean = false) {
  const container = document.createElement("div");
  container.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none;user-select:none;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.25));";

  const bubble = document.createElement("div");
  bubble.style.cssText = `
    background: ${isDark ? "rgba(24, 24, 27, 0.96)" : "#ffffff"};
    border: 1.5px solid #ff7a18;
    border-radius: 7px;
    padding: 5px 12px;
    font-size: 13px;
    font-weight: 600;
    color: ${isDark ? "#ffffff" : "#1f2937"};
    white-space: nowrap;
    box-shadow: ${isDark ? "0 4px 16px rgba(0, 0, 0, 0.6), 0 0 10px rgba(255, 122, 24, 0.3)" : "0 4px 12px rgba(255, 122, 24, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08)"};
    backdrop-filter: blur(6px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
  `;
  bubble.textContent = text;

  const arrow = document.createElement("div");
  arrow.style.cssText = `
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #ff7a18;
    margin-top: -0.5px;
  `;

  container.appendChild(bubble);
  container.appendChild(arrow);
  return container;
}

export function OrderRouteModal({ order, onClose }: { order: AutoPickOrder; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [attempt, setAttempt] = useState(0);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [routeSummary, setRouteSummary] = useState("");
  const [showInfoCard, setShowInfoCard] = useState(true);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark" || (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const [resolvedShopCoord, setResolvedShopCoord] = useState<Point | null>(null);

  const riderAssigned = Boolean(trail?.dispatcher || trail?.isTakeGoods
    || /^(pickup|delivering)$/i.test(trail?.orderStatus || "")
    || isAutoPickOrderRiderAssigned(order));
  const shopAddress = order.shopAddress?.trim() || order.rawShopAddress?.trim() || "";
  const displayShopName = order.matchedShopName?.trim() || order.rawShopName?.trim() || "门店";

  const customerCoord: Point | null = (trail?.receiver ?? null) || (
    typeof order.longitude === "number" && typeof order.latitude === "number"
    && Number.isFinite(order.longitude) && Number.isFinite(order.latitude)
    && Math.abs(order.longitude) <= 180 && Math.abs(order.latitude) <= 90
    && (order.longitude !== 0 || order.latitude !== 0)
      ? { lng: order.longitude, lat: order.latitude }
      : null
  );
  const shopCoord: Point | null = trail?.sender ?? null;
  const effectiveShopCoord: Point | null = shopCoord || resolvedShopCoord;
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
    } else if (riderCoord && effectiveShopCoord) {
      primaryDistanceValue = `${formatMeters(calculateDistanceMeters(riderCoord, effectiveShopCoord))}`;
    } else {
      primaryDistanceValue = "位置同步中";
    }
  } else {
    primaryDistanceValue = routeSummary || (order.distanceKm != null ? `${order.distanceKm.toFixed(1)}公里` : "计算中…");
  }

  const shopToCustomerDistance = order.distanceKm != null
    ? `${order.distanceKm.toFixed(1)}公里`
    : (effectiveShopCoord && customerCoord ? `${formatMeters(calculateDistanceMeters(effectiveShopCoord, customerCoord))}` : "");

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => previousFocus?.focus();
  }, []);

  // 动态响应暗黑模式切换
  useEffect(() => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.setMapStyle(isDark ? "amap://styles/dark" : "amap://styles/normal");
      } catch {
        // 忽略样式切换异常
      }
    }
  }, [isDark]);

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

        // 初始化高德地图实例（铺满全屏，适配暗色/亮色底图样式）
        map = new sdk.Map(containerRef.current, {
          zoom: 14,
          resizeEnable: true,
          viewMode: "2D",
          mapStyle: isDark ? "amap://styles/dark" : "amap://styles/normal",
        });
        mapInstanceRef.current = map;

        // 添加高德原生控件群（ControlBar罗盘、ToolBar缩放条、Scale比例尺）
        sdk.plugin(["AMap.Scale", "AMap.ToolBar", "AMap.ControlBar"], () => {
          if (disposed || !map) return;
          try {
            const scale = new sdk.Scale({
              position: { top: "18px", left: "95px" },
            });
            map.addControl(scale);

            const controlBar = new sdk.ControlBar({
              position: { top: "12px", left: "15px" },
            });
            map.addControl(controlBar);

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

          const shopMarker = new sdk.Marker({
            position: start,
            content: createPinMarkerElement("shop", displayShopName),
            anchor: "bottom-center",
            title: "门店",
            zIndex: 115,
          });
          const customerMarker = new sdk.Marker({
            position: end,
            content: createPinMarkerElement("customer", "顾客"),
            anchor: "bottom-center",
            title: "顾客",
            zIndex: 115,
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

              const bubbleMarker = new sdk.Marker({
                position: end,
                content: createDistanceBubbleElement(`门店距顾客：${distText}`, isDark),
                anchor: "bottom-center",
                offset: new sdk.Pixel(0, -68),
                zIndex: 160,
              });
              map.add(bubbleMarker);
            } else {
              setMapError("暂未找到可用骑行路线，请刷新重试。");
            }
          });
        } else {
          // 已接单/配送中状态
          const addedMarkers: any[] = [];

          // 1. 获取门店真实经纬度（优先取 trail.sender，缺失时使用高德地理编码精准解析门店地址）
          let finalShopLng = trail?.sender ? Number(trail.sender.lng) : (resolvedShopCoord ? Number(resolvedShopCoord.lng) : NaN);
          let finalShopLat = trail?.sender ? Number(trail.sender.lat) : (resolvedShopCoord ? Number(resolvedShopCoord.lat) : NaN);

          if ((!Number.isFinite(finalShopLng) || !Number.isFinite(finalShopLat)) && (shopAddress || displayShopName)) {
            try {
              await new Promise<void>((resolve) => sdk.plugin(["AMap.Geocoder"], resolve));
              const geocoder = new sdk.Geocoder({
                city: order.userAddress ? order.userAddress.slice(0, 4) : undefined,
              });
              const searchAddresses = [shopAddress, `${displayShopName} ${shopAddress}`.trim(), displayShopName].filter(Boolean);
              for (const addr of searchAddresses) {
                const loc = await new Promise<{ lng: number; lat: number } | null>((resolve) => {
                  geocoder.getLocation(addr, (status: string, result: any) => {
                    const location = result?.geocodes?.[0]?.location;
                    if (status === "complete" && location) resolve({ lng: location.lng, lat: location.lat });
                    else resolve(null);
                  });
                });
                if (loc && !disposed) {
                  finalShopLng = loc.lng;
                  finalShopLat = loc.lat;
                  setResolvedShopCoord(loc);
                  break;
                }
              }
            } catch {
              // 忽略解析失败
            }
          }

          // 判定骑手与门店是否处于近距离（如 38 米）避让范围
          const riderLng = trail?.dispatcher ? Number(trail.dispatcher.lng) : NaN;
          const riderLat = trail?.dispatcher ? Number(trail.dispatcher.lat) : NaN;
          const hasRider = Number.isFinite(riderLng) && Number.isFinite(riderLat);
          const hasShop = Number.isFinite(finalShopLng) && Number.isFinite(finalShopLat);

          const isCloseProximity = hasRider && hasShop
            && calculateDistanceMeters({ lng: riderLng, lat: riderLat }, { lng: finalShopLng, lat: finalShopLat }) < 80;

          // 渲染门店 Marker（近距离时智能左偏移 22px，避免被骑手盖死）
          if (hasShop) {
            const marker = new sdk.Marker({
              position: [finalShopLng, finalShopLat],
              content: createPinMarkerElement("shop", displayShopName),
              anchor: "bottom-center",
              offset: isCloseProximity ? new sdk.Pixel(-22, 0) : new sdk.Pixel(0, 0),
              title: `门店：${displayShopName}`,
              zIndex: 115,
            });
            map.add(marker);
            addedMarkers.push(marker);
          }

          // 2. 顾客 Marker
          if (customerCoord) {
            const lng = Number(customerCoord.lng);
            const lat = Number(customerCoord.lat);
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              const marker = new sdk.Marker({
                position: [lng, lat],
                content: createPinMarkerElement("customer", "顾客"),
                anchor: "bottom-center",
                title: "顾客收货地址",
                zIndex: 120,
              });
              map.add(marker);
              addedMarkers.push(marker);
            }
          }

          // 3. 骑手 Marker 与悬浮距离气泡
          if (hasRider) {
            const riderMarker = new sdk.Marker({
              position: [riderLng, riderLat],
              content: createPinMarkerElement("rider", "骑手"),
              anchor: "bottom-center",
              offset: isCloseProximity ? new sdk.Pixel(22, 0) : new sdk.Pixel(0, 0),
              title: "骑手实时位置",
              zIndex: 140,
            });
            map.add(riderMarker);
            addedMarkers.push(riderMarker);

            // 气泡文本：严格依据取货阶段，未取货时显示“骑手距离门店”，送货中显示“骑手距离顾客”
            const displayDistance = primaryDistanceValue
              || (phaseInfo.phase === "delivering" && customerCoord
                ? formatMeters(calculateDistanceMeters({ lng: riderLng, lat: riderLat }, customerCoord))
                : (hasShop ? formatMeters(calculateDistanceMeters({ lng: riderLng, lat: riderLat }, { lng: finalShopLng, lat: finalShopLat })) : ""));

            const bubbleText = phaseInfo.phase === "delivering"
              ? `骑手距离顾客：${displayDistance || "计算中…"}`
              : (phaseInfo.phase === "arrived_shop"
                ? (displayDistance ? `骑手已到店 · 距门店 ${displayDistance}` : `骑手已到店`)
                : `骑手距离门店：${displayDistance || "计算中…"}`);

            const bubbleMarker = new sdk.Marker({
              position: [riderLng, riderLat],
              content: createDistanceBubbleElement(bubbleText, isDark),
              anchor: "bottom-center",
              offset: isCloseProximity ? new sdk.Pixel(22, -72) : new sdk.Pixel(0, -72),
              zIndex: 170,
            });
            map.add(bubbleMarker);
            addedMarkers.push(bubbleMarker);
          } else if (customerCoord && primaryDistanceValue) {
            const bubbleMarker = new sdk.Marker({
              position: [customerCoord.lng, customerCoord.lat],
              content: createDistanceBubbleElement(`门店距收货地址：${shopToCustomerDistance || primaryDistanceValue}`, isDark),
              anchor: "bottom-center",
              offset: new sdk.Pixel(0, -72),
              zIndex: 170,
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
        mapInstanceRef.current = null;
      } catch {
        // 忽略地图销毁异常
      }
    };
  }, [trail, riderAssigned, shopAddress, displayShopName, order.longitude, order.latitude, order.userAddress, attempt, customerCoord, phaseInfo.phase, primaryDistanceValue, shopToCustomerDistance, isDark]);

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby="order-route-title"
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto h-[88dvh] max-h-[860px] w-[95vw] max-w-5xl overflow-hidden rounded-2xl border border-border/80 bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      {/* 沉浸式全屏高德地图容器 */}
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

        {/* 刷新按钮 */}
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

        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭弹窗"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:bg-muted hover:text-foreground dark:bg-zinc-900/90"
        >
          <X size={16} />
        </button>
      </div>

      {/* 底部轻量浮动卡片（支持点击折叠/展开，零 emoji，采用 Lucide 矢量图标） */}
      <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:w-96">
        <div className="overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-xl backdrop-blur-md dark:bg-zinc-900/95 transition-all">
          {/* 卡片头部 */}
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

          {/* 详情部分 */}
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

              {/* 实时配送动态距离行 */}
              {riderAssigned && primaryDistanceValue && (
                <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px]">
                  <span>{phaseInfo.distanceLabel}</span>
                  <span className={`font-semibold ${phaseInfo.phase === "delivering" ? "text-emerald-500" : "text-orange-500"}`}>
                    {primaryDistanceValue}
                  </span>
                </div>
              )}

              {shopToCustomerDistance && (
                <div className="flex items-center justify-between pt-0.5 text-[11px]">
                  <span>门店距收货地址</span>
                  <span className="font-medium text-foreground">{shopToCustomerDistance}</span>
                </div>
              )}

              {riderAssigned && trail?.fetchedAt && (
                <div className="text-[10px] text-muted-foreground/80 flex items-center justify-between pt-1 border-t border-border/30">
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


