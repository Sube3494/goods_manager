"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  MapPin,
  X,
  RefreshCw,
  Store,
  Calendar,
  Layers,
  ShoppingBag,
  Clock,
  Navigation,
  Loader2,
  ChevronRight,
  ChevronDown,
  BarChart2,
  Plus,
  Minus,
  Crosshair,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";
import { useTheme } from "next-themes";

interface DistributionOrder {
  id: string;
  orderNo: string;
  seq: number;
  platform: string;
  orderTime: string;
  userAddress: string;
  lng: number;
  lat: number;
  actualPaid: number;
  status?: string;
  distanceKm?: number;
  isBrush?: boolean;
  items: Array<{
    name: string;
    quantity: number;
    thumb?: string | null;
    productNo?: string | null;
  }>;
}

interface DistributionSummary {
  totalOrders: number;
  totalPaid: number;
  avgDistanceKm: number;
  platformStats: Record<string, { count: number; amount: number }>;
  totalRealOrders?: number;
  totalBrushOrders?: number;
  orderType?: string;
}

interface CurrentShopInfo {
  id: string;
  name: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
}

interface ShopDistributionItem {
  id: string;
  name: string;
  address: string;
  orderCount?: number;
  locatedOrderCount?: number;
  longitude?: number | null;
  latitude?: number | null;
}

interface OrderDistributionModalProps {
  onClose: () => void;
  initialShopName?: string;
  localShops?: Array<{ id: string; name: string; address?: string }>;
  userId?: string | null;
}

const PLATFORM_COLOR_MAP: Record<string, { bg: string; border: string; text: string; pinBg: string; icon: string }> = {
  美团: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", pinBg: "#f59e0b", icon: "/platform/美团.svg" },
  京东: { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400", pinBg: "#ef4444", icon: "/platform/京东.svg" },
  淘宝: { bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-600 dark:text-orange-400", pinBg: "#f97316", icon: "/platform/淘宝.svg" },
  抖店: { bg: "bg-sky-500/15", border: "border-sky-500/30", text: "text-sky-600 dark:text-sky-400", pinBg: "#0ea5e9", icon: "/platform/doudian.svg" },
  饿了么: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", pinBg: "#2563eb", icon: "/platform/其他.svg" },
  线下交易: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", pinBg: "#10b981", icon: "/platform/线下交易.svg" },
};

function getPlatformTheme(platform?: string | null) {
  const raw = String(platform || "").trim();
  if (PLATFORM_COLOR_MAP[raw]) return PLATFORM_COLOR_MAP[raw];
  if (raw.includes("美团")) return PLATFORM_COLOR_MAP["美团"];
  if (raw.includes("京东") || raw.toLowerCase().includes("jd")) return PLATFORM_COLOR_MAP["京东"];
  if (raw.includes("淘宝") || raw.toLowerCase().includes("taobao")) return PLATFORM_COLOR_MAP["淘宝"];
  if (raw.includes("抖店") || raw.toLowerCase().includes("doudian")) return PLATFORM_COLOR_MAP["抖店"];
  if (raw.includes("饿了么") || raw.toLowerCase().includes("eleme")) return PLATFORM_COLOR_MAP["饿了么"];
  if (raw.includes("线下") || raw.toLowerCase() === "other") return PLATFORM_COLOR_MAP["线下交易"];
  return {
    bg: "bg-violet-500/15",
    border: "border-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
    pinBg: "#8b5cf6",
    icon: "/platform/其他.svg",
  };
}

export function OrderDistributionModal({ onClose, initialShopName, localShops, userId }: OrderDistributionModalProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark" || (typeof document !== "undefined" && document.documentElement.classList.contains("dark"));

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // 筛选状态：根据订单实际关联的门店动态呈现
  const [availableShops, setAvailableShops] = useState<ShopDistributionItem[]>(() => {
    if (Array.isArray(localShops) && localShops.length > 0) {
      return localShops.map((s) => ({ id: s.id, name: s.name, address: s.address || "" }));
    }
    return [];
  });
  const [selectedShop, setSelectedShop] = useState<string>(initialShopName || "all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [orderType, setOrderType] = useState<"all" | "real" | "brush">("all");
  const [datePreset, setDatePreset] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "custom">("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 数据状态
  const [currentShop, setCurrentShop] = useState<CurrentShopInfo | null>(null);
  const [orders, setOrders] = useState<DistributionOrder[]>([]);
  const [summary, setSummary] = useState<DistributionSummary>({
    totalOrders: 0,
    totalPaid: 0,
    avgDistanceKm: 0,
    platformStats: {},
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [selectedOrder, setSelectedOrder] = useState<DistributionOrder | null>(null);
  const [isMobileSummaryOpen, setIsMobileSummaryOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // 提取最佳视野自适应的目标 Markers（优先聚焦订单集群，自动剔除跨省千里的无关异地门店，防止全国大地图）
  const getSmartFitTargets = useCallback((allMarkers: any[]) => {
    if (!allMarkers || allMarkers.length === 0) return [];

    // 区分订单点（带有 extData）与门店点
    const orderMarkers = allMarkers.filter((m) => Boolean(m.getExtData && m.getExtData()));
    const shopMarkers = allMarkers.filter((m) => !m.getExtData || !m.getExtData());

    if (orderMarkers.length > 0) {
      // 计算订单经纬度中心
      let sumLng = 0;
      let sumLat = 0;
      let validCount = 0;
      for (const om of orderMarkers) {
        const pos = om.getPosition();
        if (pos) {
          sumLng += pos.getLng();
          sumLat += pos.getLat();
          validCount++;
        }
      }

      if (validCount > 0) {
        const centerLng = sumLng / validCount;
        const centerLat = sumLat / validCount;

        const targets = [...orderMarkers];
        // 仅将距离订单密集区中心经纬度差小于 0.8度（约 80-90公里，即同城商圈范围）的门店加入视口计算
        for (const sm of shopMarkers) {
          const pos = sm.getPosition();
          if (pos) {
            const dLng = Math.abs(pos.getLng() - centerLng);
            const dLat = Math.abs(pos.getLat() - centerLat);
            if (dLng < 0.8 && dLat < 0.8) {
              targets.push(sm);
            }
          }
        }
        return targets;
      }
      return orderMarkers;
    }

    // 若当前筛选下无订单，则以门店作为视口目标
    return shopMarkers.length > 0 ? shopMarkers : allMarkers;
  }, []);

  // 快捷一键视野自适应缩放定位
  const handleResetFitView = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    // 移动端顶部控制器高度约 95px，预留充足 padding 避免最北端订单被顶部遮挡
    const fitViewPadding = isMobile ? [95, 20, 50, 20] : [60, 60, 60, 60];
    try {
      map.resize();
    } catch {
      // ignore
    }

    const targets = getSmartFitTargets(markersRef.current);
    if (targets && targets.length > 0) {
      map.setFitView(targets, false, fitViewPadding, 15);
    } else if (currentShop?.longitude && currentShop?.latitude) {
      map.setCenter([currentShop.longitude, currentShop.latitude]);
      map.setZoom(14);
    }
  }, [currentShop, getSmartFitTargets]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 监听 Escape 键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // 弹窗打开时锁定背景页面滚动
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  // 动态响应暗黑/浅色模式切换高德底图
  useEffect(() => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.setMapStyle(isDark ? "amap://styles/dark" : "amap://styles/normal");
      } catch {
        // 忽略样式切换异常
      }
    }
  }, [isDark]);

  // 预设日期切换
  const handleDatePresetChange = (preset: "all" | "today" | "yesterday" | "7d" | "30d" | "custom") => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const todayStr = formatLocalDate(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "yesterday") {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayStr = formatLocalDate(yesterday);
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (preset === "7d") {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setStartDate(formatLocalDate(start));
      setEndDate(formatLocalDate(now));
    } else if (preset === "30d") {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      setStartDate(formatLocalDate(start));
      setEndDate(formatLocalDate(now));
    }
  };

  // 请求后端分布数据
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setSelectedOrder(null);
    try {
      const params = new URLSearchParams();
      if (selectedShop && selectedShop !== "all") params.set("shop", selectedShop);
      if (selectedPlatform && selectedPlatform !== "all") params.set("platform", selectedPlatform);
      if (orderType && orderType !== "all") params.set("orderType", orderType);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (userId) params.set("userId", userId);

      const res = await fetch(`/api/orders/distribution?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "获取订单分布数据失败");
      }

      const nextShops = Array.isArray(data.availableShops) ? data.availableShops : [];
      setAvailableShops(nextShops);

      if (selectedShop !== "all") {
        const isSelectedValid = selectedShop && nextShops.some((s: any) => s.name === selectedShop);
        if (!isSelectedValid) {
          if (initialShopName && (initialShopName === "all" || nextShops.some((s: any) => s.name === initialShopName))) {
            setSelectedShop(initialShopName);
          } else if (nextShops.length > 0) {
            setSelectedShop(nextShops[0].name);
          } else {
            setSelectedShop("all");
          }
        }
      }
      setCurrentShop(data.currentShop || null);
      setOrders(data.orders || []);
      setSummary(data.summary || {
        totalOrders: 0,
        totalPaid: 0,
        avgDistanceKm: 0,
        platformStats: {},
      });
    } catch (err) {
      console.error("加载订单分布失败:", err);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [selectedShop, selectedPlatform, orderType, startDate, endDate, userId, initialShopName]);

  // 依赖变化重新拉取
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 地图初始化与点位绘制
  useEffect(() => {
    let isDisposed = false;
    async function initMap() {
      if (!mapContainerRef.current) return;
      try {
        const key = process.env.NEXT_PUBLIC_AMAP_KEY;
        if (!key) {
          setError("缺少高德地图配置 (NEXT_PUBLIC_AMAP_KEY)");
          return;
        }
        const sdk = await loadBareAmap(key, process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE || "");
        if (isDisposed || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new sdk.Map(mapContainerRef.current, {
            zoom: 13,
            resizeEnable: true,
            touchZoom: true,
            dragEnable: true,
            zoomEnable: true,
            doubleClickZoom: true,
            touchZoomCenter: 1,
            jog: true,
            mapStyle: isDark ? "amap://styles/dark" : "amap://styles/normal",
          });
        }

        const map = mapInstanceRef.current;

        // 彻底清空地图上的所有历史标记与覆盖物，绝不残留旧标
        try {
          map.clearMap();
        } catch {
          if (markersRef.current.length > 0) {
            map.remove(markersRef.current);
          }
        }
        markersRef.current = [];
        const orderMarkers: any[] = [];
        const shopMarkers: any[] = [];

        // 1. 【第一优先级】优先极速绘制所有订单 Marker（订单自带经纬度，纯内存批量生成，毫秒级呈现，绝不被门店异步网络所阻塞）
        for (const order of orders) {
          if (!order.lng || !order.lat) continue;
          const platformTheme = getPlatformTheme(order.platform);

          const markerDom = document.createElement("div");
          markerDom.className = "flex flex-col items-center cursor-pointer transition-transform hover:scale-125 select-none";
          markerDom.style.zIndex = "100";

          const seqText = order.seq ? `#${order.seq}` : "";
          markerDom.innerHTML = `
            <div style="
              background: ${platformTheme.pinBg};
              color: #ffffff;
              padding: 1.5px 5px 1.5px 2px;
              border-radius: 9999px;
              border: 1.5px solid #ffffff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.28);
              display: inline-flex;
              align-items: center;
              gap: 2.5px;
              line-height: 12px;
              white-space: nowrap;
            ">
              <div style="
                width: 15px;
                height: 15px;
                border-radius: 50%;
                background: #ffffff;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
                box-shadow: 0 1px 2px rgba(0,0,0,0.15);
              ">
                <img 
                  src="${platformTheme.icon}" 
                  alt="${order.platform}" 
                  style="width: 12px; height: 12px; object-fit: contain; display: block;" 
                />
              </div>
              ${seqText ? `
                <span style="
                  font-size: 10px;
                  font-weight: 800;
                  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                  letter-spacing: -0.2px;
                ">${seqText}</span>
              ` : ""}
            </div>
            <div style="
              width: 0; height: 0;
              border-left: 3.5px solid transparent;
              border-right: 3.5px solid transparent;
              border-top: 4.5px solid ${platformTheme.pinBg};
            "></div>
          `;

          const marker = new sdk.Marker({
            position: [order.lng, order.lat],
            content: markerDom,
            offset: new sdk.Pixel(-12, -20),
            zIndex: 100,
            extData: order,
            title: `${order.platform} ${seqText} ${order.isBrush ? "[刷单]" : "[真单]"} - ¥${(order.actualPaid / 100).toFixed(2)}`,
          });

          marker.on("click", () => {
            setSelectedOrder(order);
            map.panTo([order.lng, order.lat]);
          });

          orderMarkers.push(marker);
        }

        // 2. 绘制门店 Marker（如果是全部店铺模式添加有效门店，若是单店模式添加当前门店）
        const shopsToRender = (selectedShop === "all" || !selectedShop)
          ? availableShops
          : (currentShop && currentShop.id !== "all" ? [currentShop] : []);

        const labelBg = isDark 
          ? "linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)" 
          : "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
        const labelColor = "#ffffff";
        const labelBorder = isDark 
          ? "rgba(255, 255, 255, 0.22)" 
          : "rgba(255, 255, 255, 0.32)";
        const labelDot = "#93c5fd";
        const labelShadow = isDark 
          ? "0 6px 18px rgba(30, 58, 138, 0.5), 0 2px 6px rgba(0, 0, 0, 0.4)" 
          : "0 6px 16px rgba(37, 99, 235, 0.35), 0 2px 4px rgba(0, 0, 0, 0.12)";
        const pinDropShadow = isDark 
          ? "drop-shadow(0 4px 12px rgba(30, 58, 138, 0.6))" 
          : "drop-shadow(0 4px 10px rgba(37, 99, 235, 0.35))";
        const pinInnerDot = isDark ? "#1e3a8a" : "#1d4ed8";

        // 并发解析门店坐标（带快速超时保护，绝不阻塞整体渲染）
        let geocoderInstance: any = null;
        if (shopsToRender.some((s) => !s.longitude || !s.latitude)) {
          try {
            await new Promise<void>((resolve) => sdk.plugin(["AMap.Geocoder"], resolve));
            geocoderInstance = new sdk.Geocoder();
          } catch {
            // ignore
          }
        }

        for (const shopItem of shopsToRender) {
          if (!shopItem || isDisposed) continue;
          let shopCoord: [number, number] | null = null;
          if (
            shopItem.longitude &&
            shopItem.latitude &&
            shopItem.longitude > 0 &&
            shopItem.latitude > 0
          ) {
            shopCoord = [shopItem.longitude, shopItem.latitude];
          } else if (shopItem.address && geocoderInstance) {
            try {
              shopCoord = await Promise.race([
                new Promise<[number, number] | null>((resolve) => {
                  geocoderInstance.getLocation(shopItem.address, (status: string, result: any) => {
                    const loc = result?.geocodes?.[0]?.location;
                    if (status === "complete" && loc) {
                      resolve([loc.lng, loc.lat]);
                    } else {
                      resolve(null);
                    }
                  });
                }),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
              ]);
            } catch {
              shopCoord = null;
            }
          }

          if (shopCoord && !isDisposed) {
            const shopDom = document.createElement("div");
            shopDom.className = "group relative flex flex-col items-center cursor-pointer select-none transition-transform hover:scale-110";
            shopDom.style.zIndex = "300";
            shopDom.innerHTML = `
              <div style="
                position: absolute;
                bottom: 32px;
                left: 50%;
                transform: translateX(-50%);
                padding: 3.5px 9px;
                background: ${labelBg};
                color: ${labelColor};
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.2px;
                border-radius: 999px;
                border: 1px solid ${labelBorder};
                box-shadow: ${labelShadow};
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 4.5px;
                z-index: 2;
                pointer-events: none;
              ">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${labelDot};box-shadow: 0 0 6px rgba(147, 197, 253, 0.8);"></span>
                <span>${shopItem.name}</span>
              </div>
              <svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg"
                style="filter: ${pinDropShadow}; transition: transform 0.2s;">
                <path d="M11 28C11 28 22 17.5 22 11C22 4.92487 17.0751 0 11 0C4.92487 0 0 4.92487 0 11C0 17.5 11 28 11 28Z" fill="#2563eb" />
                <circle cx="11" cy="11" r="5" fill="white"/>
                <circle cx="11" cy="11" r="2.2" fill="${pinInnerDot}"/>
              </svg>
            `;
            const shopMarker = new sdk.Marker({
              position: shopCoord,
              content: shopDom,
              offset: new sdk.Pixel(-11, -28),
              zIndex: 300,
              title: `门店：${shopItem.name}`,
            });

            shopMarker.on("click", () => {
              if (selectedShop === "all") {
                setSelectedShop(shopItem.name);
              }
              map.setZoomAndCenter(14, shopCoord);
            });

            shopMarkers.push(shopMarker);
          }
        }

        if (isDisposed) return;

        // 3. 一次性批量添加到地图（提升渲染性能 10 倍，避免数百次逐个 add 引发的卡顿与重排）
        const allMarkers = [...orderMarkers, ...shopMarkers];
        if (allMarkers.length > 0) {
          map.add(allMarkers);
        }
        markersRef.current = allMarkers;

        // 4. 智能视野自适应聚焦（优先以订单集群为主体，过滤掉跨省千里之外的门店干扰）
        const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
        const fitViewPadding = isMobile ? [95, 20, 50, 20] : [60, 60, 60, 60];

        const fitTargets = getSmartFitTargets(allMarkers);
        if (fitTargets.length > 0) {
          map.setFitView(fitTargets, false, fitViewPadding, 15);
          setTimeout(() => {
            if (!isDisposed && mapInstanceRef.current) {
              try {
                mapInstanceRef.current.resize();
                mapInstanceRef.current.setFitView(fitTargets, false, fitViewPadding, 15);
              } catch {
                // ignore
              }
            }
          }, 200);
        } else if (currentShop?.longitude && currentShop?.latitude) {
          map.setCenter([currentShop.longitude, currentShop.latitude]);
          map.setZoom(14);
        }

        setTimeout(() => {
          if (!isDisposed && mapInstanceRef.current) {
            try {
              mapInstanceRef.current.resize();
            } catch {
              // ignore
            }
          }
        }, 150);
      } catch (e) {
        console.error("高德地图渲染失败:", e);
      }
    }

    void initMap();

    return () => {
      isDisposed = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.clearMap();
        } catch {
          // ignore
        }
      }
    };
  }, [orders, currentShop, availableShops, selectedShop, isDark]);

  const shopOptions = useMemo(() => {
    const totalAllOrders = availableShops.reduce((sum, s) => sum + (s.orderCount || 0), 0);
    const options = availableShops.map((s) => ({
      value: s.name,
      label: typeof s.orderCount === "number" ? `${s.name} (${s.orderCount}单)` : s.name,
    }));
    return [{ value: "all", label: `全部店铺 (共${totalAllOrders}单)` }, ...options];
  }, [availableShops]);

  const platformOptions = useMemo(() => [
    { value: "all", label: "全部平台" },
    { value: "美团", label: "美团" },
    { value: "饿了么", label: "饿了么" },
    { value: "京东", label: "京东" },
    { value: "淘宝", label: "淘宝" },
    { value: "抖店", label: "抖店" },
    { value: "线下交易", label: "线下交易" },
  ], []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-80000 flex items-center justify-center p-0 sm:p-4">
      {/* 遮罩背景 */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 flex flex-col w-full h-full max-w-full max-h-full sm:max-w-[96vw] sm:max-h-[92vh] rounded-none sm:rounded-[28px] border-0 sm:border border-black/10 bg-background dark:border-white/10 dark:bg-zinc-950 overflow-hidden shadow-2xl">
        {/* 顶部控制栏 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 border-b border-black/8 px-3 py-2.5 sm:px-6 sm:py-3 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/80 shrink-0">
          {/* 标题区（移动端整行带关闭，桌面端单行左侧） */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5 shrink-0 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <MapPin size={16} className="sm:hidden" />
                <MapPin size={18} className="hidden sm:block" />
              </div>
              <div className="shrink-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h2 className="text-sm sm:text-base lg:text-lg font-bold text-foreground whitespace-nowrap">
                    订单地点分布
                  </h2>
                  <span className="rounded-full border border-black/10 bg-black/4 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-muted-foreground dark:border-white/10 dark:bg-white/5 whitespace-nowrap">
                    {selectedShop === "all" ? "全景" : "单店"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap hidden 2xl:block">
                  基于订单经纬度实时呈现门店外卖收货辐射网络
                </p>
              </div>
            </div>

            {/* 移动端专属快捷操作（右上角直达） */}
            <div className="flex items-center gap-1.5 sm:hidden shrink-0">
              <button
                type="button"
                onClick={fetchData}
                disabled={isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground active:scale-95 transition-all dark:border-white/10 dark:bg-white/5 disabled:opacity-50"
                title="刷新数据"
              >
                <RefreshCw size={13} className={cn(isLoading && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-black/8 bg-white text-muted-foreground hover:text-foreground active:scale-95 transition-all dark:border-white/10 dark:bg-white/5"
                title="关闭"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* 筛选控制器行（桌面端单行靠右，移动端流畅横向滑动） */}
          <div className="flex items-center justify-start sm:justify-end gap-2 overflow-x-auto sm:overflow-visible no-scrollbar pb-1 sm:pb-0 shrink-0 w-full sm:w-auto sm:ml-auto">
            {/* 店铺筛选 */}
            <div className="w-32 sm:w-44 h-8 sm:h-9 shrink-0">
              <CustomSelect
                value={selectedShop}
                onChange={(val) => setSelectedShop(val)}
                options={shopOptions}
                placeholder="选择店铺"
                className="h-full w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-2.5 text-xs sm:text-sm shadow-none dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6"
              />
            </div>

            {/* 平台筛选 */}
            <div className="w-24 sm:w-28 h-8 sm:h-9 shrink-0">
              <CustomSelect
                value={selectedPlatform}
                onChange={(val) => setSelectedPlatform(val)}
                options={platformOptions}
                placeholder="全部平台"
                className="h-full w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-2.5 text-xs sm:text-sm shadow-none dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6"
              />
            </div>

            {/* 订单类型筛选：全部 / 真单 / 刷单 */}
            <div className="inline-flex h-8 sm:h-9 items-center rounded-xl border border-black/8 bg-black/3 p-0.5 sm:p-1 dark:border-white/10 dark:bg-white/3 shrink-0">
              <button
                type="button"
                onClick={() => setOrderType("all")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  orderType === "all"
                    ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => setOrderType("real")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all flex items-center gap-1 sm:gap-1.5",
                  orderType === "real"
                    ? "bg-emerald-500 text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", orderType === "real" ? "bg-white" : "bg-emerald-500")} />
                真单
              </button>
              <button
                type="button"
                onClick={() => setOrderType("brush")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all flex items-center gap-1 sm:gap-1.5",
                  orderType === "brush"
                    ? "bg-rose-500 text-white shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", orderType === "brush" ? "bg-white" : "bg-rose-500")} />
                刷单
              </button>
            </div>

            {/* 日期预设切换 */}
            <div className="inline-flex h-8 sm:h-9 items-center rounded-xl border border-black/8 bg-black/3 p-0.5 sm:p-1 dark:border-white/10 dark:bg-white/3 shrink-0">
              <button
                type="button"
                onClick={() => handleDatePresetChange("all")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  datePreset === "all" ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                全部
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("today")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  datePreset === "today" ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("yesterday")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  datePreset === "yesterday" ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                昨日
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("7d")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  datePreset === "7d" ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                近7天
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("30d")}
                className={cn(
                  "h-full rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-all",
                  datePreset === "30d" ? "bg-white dark:bg-white/15 text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                近30天
              </button>
            </div>

            {/* 日期选择器 */}
            <div className="flex items-center gap-1.5 h-8 sm:h-9 shrink-0">
              <DatePicker
                value={startDate}
                placeholder="开始日期"
                onChange={(val) => {
                  setStartDate(val);
                  setDatePreset("custom");
                }}
                className="h-full w-24 sm:w-28"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-2 text-xs shadow-none dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6"
              />
              <span className="text-xs text-muted-foreground font-medium select-none">至</span>
              <DatePicker
                value={endDate}
                placeholder="结束日期"
                onChange={(val) => {
                  setEndDate(val);
                  setDatePreset("custom");
                }}
                className="h-full w-24 sm:w-28"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-2 text-xs shadow-none dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6"
              />
            </div>

            {/* 桌面端专属的刷新与关闭 */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={fetchData}
                disabled={isLoading}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white text-muted-foreground hover:text-foreground active:scale-95 transition-all dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6 disabled:opacity-50 cursor-pointer"
                title="刷新地图数据"
              >
                <RefreshCw size={15} className={cn(isLoading && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white text-muted-foreground hover:text-foreground active:scale-95 transition-all dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/6 cursor-pointer"
                title="关闭弹窗"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* 地图主体与悬浮覆盖层 */}
        <div className="relative flex-1 min-h-0 w-full h-full overflow-hidden bg-muted/20">
          {/* 高德地图 DOM 挂载容器（启用 touch-action: none 确保移动端双指手势直达地图画布） */}
          <div
            ref={mapContainerRef}
            className="w-full h-full select-none"
            style={{ touchAction: "none" }}
          />

          {/* 加载状态浮层 */}
          {isLoading && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90">
              <Loader2 size={14} className="animate-spin text-primary" />
              正在检索与绘制订单点位...
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-600 shadow-lg backdrop-blur-md dark:text-rose-400">
              {error}
            </div>
          )}

          {/* 暂未检索到关联订单门店的友好指引 */}
          {!isLoading && !error && availableShops.length === 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm">
                <Store size={28} />
              </div>
              <h3 className="mt-4 text-base font-bold text-foreground sm:text-lg">
                暂未检索到关联外卖订单的门店
              </h3>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                订单分布功能直接根据您的真实订单动态提取关联门店。当前订单库中暂无可用的外卖订单数据，请先拉取或导入订单。
              </p>
            </div>
          )}

          {/* 无订单提示浮层（仅在已选门店但无订单时展示） */}
          {!isLoading && !error && availableShops.length > 0 && orders.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl border border-black/8 bg-white/90 px-4 py-2.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90">
              <MapPin size={14} className="text-muted-foreground" />
              {selectedShop === "all"
                ? `当前筛选条件下暂无有效定位${orderType === "real" ? "真单" : orderType === "brush" ? "刷单" : "订单"}`
                : `当前门店【${currentShop?.name || selectedShop}】在所选筛选条件下暂无有效定位${orderType === "real" ? "真单" : orderType === "brush" ? "刷单" : "订单"}`}
            </div>
          )}

          {/* 移动端轻量悬浮统计触发胶囊（收起状态） */}
          {!isLoading && !error && availableShops.length > 0 && !isMobileSummaryOpen && (
            <button
              type="button"
              onClick={() => setIsMobileSummaryOpen(true)}
              className="absolute top-3 left-3 z-20 sm:hidden flex items-center gap-1.5 rounded-full border border-black/10 bg-white/95 px-3 py-1.5 text-xs font-bold text-foreground shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 active:scale-95 transition-all"
            >
              <BarChart2 size={13} className="text-primary" />
              <span>订单分布 ({summary.totalOrders}单)</span>
              <ChevronDown size={13} className="text-muted-foreground" />
            </button>
          )}

          {/* 统计面板（移动端支持可展开悬浮卡片，桌面端左上角常驻） */}
          <div
            className={cn(
              "absolute z-20 flex-col gap-2.5 rounded-2xl border border-black/10 bg-white/95 p-3.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 pointer-events-auto transition-all",
              "sm:top-4 sm:left-4 sm:flex sm:max-w-xs",
              isMobileSummaryOpen
                ? "top-3 left-3 right-3 max-h-[75vh] overflow-y-auto flex"
                : "hidden sm:flex"
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-black/6 pb-2 dark:border-white/6">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground min-w-0">
                <Store size={14} className="text-primary shrink-0" />
                <span className="truncate">{selectedShop === "all" ? `全部店铺 (${availableShops.length}家门店)` : (currentShop?.name || "未选择店铺")}</span>
              </div>
              {/* 移动端收起按钮 */}
              <button
                type="button"
                onClick={() => setIsMobileSummaryOpen(false)}
                className="sm:hidden rounded-lg p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                title="收起统计"
              >
                <X size={14} />
              </button>
            </div>
            {selectedShop !== "all" && currentShop?.address && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2" title={currentShop.address}>
                {currentShop.address}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl border border-black/5 bg-black/2 p-2 dark:border-white/5 dark:bg-white/3">
                <div className="text-[10px] text-muted-foreground">
                  {orderType === "real" ? "真单点位" : orderType === "brush" ? "刷单点位" : "订单点位"}
                </div>
                <div className="text-sm font-bold text-foreground mt-0.5">{summary.totalOrders} 笔</div>
              </div>
              <div className="rounded-xl border border-black/5 bg-black/2 p-2 dark:border-white/5 dark:bg-white/3">
                <div className="text-[10px] text-muted-foreground">总实付金额</div>
                <div className="text-sm font-bold text-foreground mt-0.5">¥{(summary.totalPaid / 100).toFixed(2)}</div>
              </div>
            </div>

            {/* 真单与刷单细分统计（全部视图下展示对比） */}
            {summary.totalRealOrders !== undefined && summary.totalBrushOrders !== undefined && (
              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-black/6 dark:border-white/6">
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  真单: <b className="font-bold">{summary.totalRealOrders}</b> 笔
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  刷单: <b className="font-bold">{summary.totalBrushOrders}</b> 笔
                </span>
              </div>
            )}

            {summary.avgDistanceKm > 0 && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>平均配送半径</span>
                <span className="font-semibold text-foreground">约 {summary.avgDistanceKm} km</span>
              </div>
            )}

            {/* 平台分布微柱条 */}
            <div className="pt-2 border-t border-black/6 dark:border-white/6 flex flex-col gap-1.5">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">平台订单分布</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(summary.platformStats).map(([plat, stat]) => {
                  const theme = getPlatformTheme(plat);
                  return (
                    <span
                      key={plat}
                      className="inline-flex items-center gap-1.5 rounded-md border border-black/6 bg-black/3 px-2 py-0.5 text-[10px] font-medium text-foreground dark:border-white/6 dark:bg-white/4"
                    >
                      <img src={theme.icon} alt="" className="w-3 h-3 object-contain shrink-0" />
                      <span>{plat}</span>
                      <span className="font-bold">{stat.count}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80 mt-1">
              💡 提示：点击地图图钉可查看订单详情
            </p>
          </div>

          {/* 右侧悬浮地图操作栏：缩放与一键视野聚焦（专为移动端单手操作优化） */}
          <div className="absolute right-3.5 bottom-6 sm:bottom-6 sm:right-5 z-20 flex flex-col items-center gap-2 select-none pointer-events-auto">
            {/* 智能视野自适应聚焦（居中并自适应当前订单） */}
            <button
              type="button"
              onClick={handleResetFitView}
              className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl border border-black/10 bg-white/95 text-foreground shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 active:scale-90 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
              title="智能视野复位（聚焦订单集群）"
            >
              <Crosshair size={18} className="text-primary" />
            </button>

            {/* 放大 / 缩小 快捷控制器 */}
            <div className="flex flex-col items-center rounded-2xl border border-black/10 bg-white/95 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.zoomIn();
                  }
                }}
                className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center text-foreground hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all cursor-pointer border-b border-black/6 dark:border-white/6"
                title="放大地图"
              >
                <Plus size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.zoomOut();
                  }
                }}
                className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center text-foreground hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                title="缩小地图"
              >
                <Minus size={18} />
              </button>
            </div>
          </div>

          {/* 选中的订单卡片浮层（移动端居中贴底，桌面端贴右下角） */}
          {selectedOrder && (
            <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:bottom-4 sm:right-4 z-30 w-auto sm:w-96 rounded-2xl border border-black/10 bg-white/95 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 animate-in fade-in slide-in-from-bottom-3 duration-200">
              <div className="flex items-start justify-between gap-2 border-b border-black/6 pb-2.5 dark:border-white/6">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white shadow-xs"
                      style={{ background: getPlatformTheme(selectedOrder.platform).pinBg }}
                    >
                      <img src={getPlatformTheme(selectedOrder.platform).icon} alt="" className="w-3.5 h-3.5 object-contain" />
                      {selectedOrder.platform}
                    </span>
                    {selectedOrder.seq ? (
                      <span className="text-xs font-bold text-foreground">#{selectedOrder.seq}</span>
                    ) : null}
                    {selectedOrder.isBrush !== undefined && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                          selectedOrder.isBrush
                            ? "bg-rose-500/15 text-rose-600 border border-rose-500/30 dark:text-rose-400"
                            : "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 dark:text-emerald-400"
                        )}
                      >
                        {selectedOrder.isBrush ? "刷单" : "真单"}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={selectedOrder.orderNo}>
                      {selectedOrder.orderNo}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                    <Clock size={11} />
                    {formatLocalDateTime(selectedOrder.orderTime)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                >
                  <X size={14} />
                </button>
              </div>

              {/* 地址 */}
              <div className="mt-3 flex items-start gap-2">
                <MapPin size={14} className="shrink-0 text-primary mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground leading-snug">
                    {selectedOrder.userAddress}
                  </div>
                  {selectedOrder.distanceKm ? (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      直线距离约 {selectedOrder.distanceKm.toFixed(2)} km
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 金额与状态 */}
              <div className="mt-3 flex items-center justify-between rounded-xl border border-black/5 bg-black/2 px-3 py-2 text-xs dark:border-white/5 dark:bg-white/3">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">实付金额:</span>
                  <span className="font-bold text-foreground">¥{(selectedOrder.actualPaid / 100).toFixed(2)}</span>
                </div>
                {selectedOrder.status && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {selectedOrder.status}
                  </span>
                )}
              </div>

              {/* 商品列表 */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-black/6 pt-2.5 dark:border-white/6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      包含商品 ({selectedOrder.items.reduce((acc, curr) => acc + curr.quantity, 0)}件)
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 max-h-40 sm:max-h-48 overflow-y-auto pr-0.5 no-scrollbar">
                    {selectedOrder.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2.5 p-1.5 rounded-xl bg-black/2 hover:bg-black/4 dark:bg-white/3 dark:hover:bg-white/6 transition-colors border border-black/4 dark:border-white/4"
                      >
                        {/* 商品缩略图 */}
                        <div
                          className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-black/8 bg-black/4 dark:border-white/10 dark:bg-white/5 flex items-center justify-center cursor-pointer group"
                          onClick={() => {
                            if (it.thumb) setPreviewImage(it.thumb);
                          }}
                          title={it.thumb ? "点击查看大图" : undefined}
                        >
                          {it.thumb ? (
                            <img
                              src={it.thumb}
                              alt={it.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-110"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex items-center justify-center w-full h-full text-muted-foreground/50">
                              <ShoppingBag size={18} />
                            </div>
                          )}
                        </div>

                        {/* 商品名称与货号 */}
                        <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                          <div
                            className="text-xs font-semibold text-foreground leading-snug line-clamp-2"
                            title={it.name}
                          >
                            {it.name}
                          </div>
                          {it.productNo && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/4 dark:bg-white/8 text-muted-foreground font-semibold">
                                货号: {it.productNo}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* 数量 */}
                        <div className="font-mono text-xs font-bold text-foreground px-2 py-1 rounded-lg bg-black/3 dark:bg-white/6 shrink-0">
                          x{it.quantity}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 商品大图预览模态框 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-90000 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-sm sm:max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl p-2 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black/5">
              <img
                src={previewImage}
                alt="商品大图"
                className="w-full h-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-all cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
