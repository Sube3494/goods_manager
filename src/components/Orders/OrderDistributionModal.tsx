"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { loadBareAmap } from "@/components/DistanceCalc/BareAmapTest";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";

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
  items: Array<{
    name: string;
    quantity: number;
  }>;
}

interface DistributionSummary {
  totalOrders: number;
  totalPaid: number;
  avgDistanceKm: number;
  platformStats: Record<string, { count: number; amount: number }>;
}

interface CurrentShopInfo {
  id: string;
  name: string;
  address: string;
  longitude: number | null;
  latitude: number | null;
}

interface OrderDistributionModalProps {
  onClose: () => void;
  initialShopName?: string;
  localShops?: Array<{ id: string; name: string; address?: string }>;
  userId?: string | null;
}

const PLATFORM_COLOR_MAP: Record<string, { bg: string; border: string; text: string; pinBg: string }> = {
  美团: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", pinBg: "#f59e0b" },
  京东: { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-600 dark:text-rose-400", pinBg: "#ef4444" },
  淘宝: { bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-600 dark:text-orange-400", pinBg: "#f97316" },
  抖店: { bg: "bg-sky-500/15", border: "border-sky-500/30", text: "text-sky-600 dark:text-sky-400", pinBg: "#0ea5e9" },
  饿了么: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", pinBg: "#2563eb" },
  线下交易: { bg: "bg-slate-500/15", border: "border-slate-500/30", text: "text-slate-600 dark:text-slate-400", pinBg: "#64748b" },
};

export function OrderDistributionModal({ onClose, initialShopName, localShops, userId }: OrderDistributionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // 筛选状态：优先采用由父组件传入的个人资料门店列表
  const [availableShops, setAvailableShops] = useState<Array<{ id: string; name: string; address: string }>>(() => {
    if (Array.isArray(localShops) && localShops.length > 0) {
      return localShops.map((s) => ({ id: s.id, name: s.name, address: s.address || "" }));
    }
    return [];
  });
  const [selectedShop, setSelectedShop] = useState<string>(initialShopName || "");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<"today" | "yesterday" | "7d" | "30d" | "custom">("today");
  const [startDate, setStartDate] = useState<string>(() => formatLocalDate(new Date()));
  const [endDate, setEndDate] = useState<string>(() => formatLocalDate(new Date()));

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

  // 初始化弹窗焦点
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.showModal();
    return () => prev?.focus();
  }, []);

  // 预设日期切换
  const handleDatePresetChange = (preset: "today" | "yesterday" | "7d" | "30d" | "custom") => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "today") {
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
      if (selectedShop) params.set("shop", selectedShop);
      if (selectedPlatform && selectedPlatform !== "all") params.set("platform", selectedPlatform);
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

      if (!selectedShop) {
        if (initialShopName && nextShops.some((s: any) => s.name === initialShopName)) {
          setSelectedShop(initialShopName);
        } else if (data.currentShop?.name) {
          setSelectedShop(data.currentShop.name);
        } else if (nextShops[0]?.name) {
          setSelectedShop(nextShops[0].name);
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
  }, [selectedShop, selectedPlatform, startDate, endDate, userId, initialShopName]);

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

        const isDark = document.documentElement.classList.contains("dark");

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new sdk.Map(mapContainerRef.current, {
            zoom: 13,
            resizeEnable: true,
            mapStyle: isDark ? "amap://styles/dark" : "amap://styles/normal",
          });
        } else {
          // 清除原有标记
          if (markersRef.current.length > 0) {
            mapInstanceRef.current.remove(markersRef.current);
            markersRef.current = [];
          }
        }

        const map = mapInstanceRef.current;
        const newMarkers: any[] = [];

        // 1. 如果有门店坐标或门店地址，添加门店标记
        let shopCoord: [number, number] | null = null;
        if (
          currentShop?.longitude &&
          currentShop?.latitude &&
          currentShop.longitude > 0 &&
          currentShop.latitude > 0
        ) {
          shopCoord = [currentShop.longitude, currentShop.latitude];
        } else if (currentShop?.address) {
          // 通过 Geocoder 尝试定位门店
          try {
            await new Promise<void>((resolve) => sdk.plugin(["AMap.Geocoder"], resolve));
            const geocoder = new sdk.Geocoder();
            shopCoord = await new Promise<[number, number] | null>((resolve) => {
              geocoder.getLocation(currentShop.address, (status: string, result: any) => {
                const loc = result?.geocodes?.[0]?.location;
                if (status === "complete" && loc) {
                  resolve([loc.lng, loc.lat]);
                } else {
                  resolve(null);
                }
              });
            });
          } catch {
            shopCoord = null;
          }
        }

        if (shopCoord && !isDisposed) {
          const shopDom = document.createElement("div");
          shopDom.className = "group relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110";
          shopDom.innerHTML = `
            <div style="background: #1e40af; color: white; border: 2px solid white; border-radius: 9999px; padding: 6px 12px; font-size: 12px; font-weight: bold; box-shadow: 0 4px 12px rgba(30,64,175,0.4); display: flex; align-items: center; gap: 4px; white-space: nowrap;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#60a5fa;"></span>
              <span>门店: ${currentShop?.name || "本铺"}</span>
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid #1e40af;"></div>
          `;
          const shopMarker = new sdk.Marker({
            position: shopCoord,
            content: shopDom,
            offset: new sdk.Pixel(-40, -32),
            zIndex: 300,
            title: `门店：${currentShop?.name || ""}`,
          });
          map.add(shopMarker);
          newMarkers.push(shopMarker);
        }

        // 2. 添加所有订单的 Marker
        for (const order of orders) {
          if (!order.lng || !order.lat) continue;
          const platformTheme = PLATFORM_COLOR_MAP[order.platform] || {
            pinBg: "#3b82f6",
            text: "text-blue-500",
          };

          const markerDom = document.createElement("div");
          markerDom.className = "flex flex-col items-center cursor-pointer transition-transform hover:scale-125 select-none";
          markerDom.style.zIndex = "100";

          const seqText = order.seq ? `#${order.seq}` : "";
          markerDom.innerHTML = `
            <div style="
              background: ${platformTheme.pinBg};
              color: #ffffff;
              font-size: 11px;
              font-weight: 700;
              padding: 2px 7px;
              border-radius: 9999px;
              border: 1.5px solid #ffffff;
              box-shadow: 0 2px 8px rgba(0,0,0,0.28);
              line-height: 14px;
              white-space: nowrap;
              display: flex;
              align-items: center;
              gap: 2px;
            ">
              <span>${order.platform.slice(0, 2)}</span>
              ${seqText ? `<span>${seqText}</span>` : ""}
            </div>
            <div style="
              width: 0; height: 0;
              border-left: 4px solid transparent;
              border-right: 4px solid transparent;
              border-top: 5px solid ${platformTheme.pinBg};
            "></div>
          `;

          const marker = new sdk.Marker({
            position: [order.lng, order.lat],
            content: markerDom,
            offset: new sdk.Pixel(-16, -20),
            zIndex: 100,
            extData: order,
          });

          marker.on("click", () => {
            setSelectedOrder(order);
            map.panTo([order.lng, order.lat]);
          });

          map.add(marker);
          newMarkers.push(marker);
        }

        markersRef.current = newMarkers;

        // 3. 自动视野调整
        if (newMarkers.length > 0) {
          map.setFitView(newMarkers, false, [60, 60, 60, 60], 16);
        } else if (shopCoord) {
          map.setCenter(shopCoord);
          map.setZoom(14);
        }
      } catch (e) {
        console.error("高德地图渲染失败:", e);
      }
    }

    void initMap();

    return () => {
      isDisposed = true;
    };
  }, [orders, currentShop]);

  const shopOptions = useMemo(() => {
    return availableShops.map((s) => ({
      value: s.name,
      label: s.name,
    }));
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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="backdrop:bg-black/60 backdrop:backdrop-blur-xs fixed inset-0 m-0 h-full w-full max-h-none max-w-none bg-transparent p-2 sm:p-4 z-50 flex items-center justify-center outline-none border-none"
    >
      <div className="relative flex flex-col w-full h-full max-w-[96vw] max-h-[92vh] rounded-[28px] border border-black/10 bg-background dark:border-white/10 dark:bg-zinc-950 overflow-hidden shadow-2xl">
        {/* 顶部控制栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 px-4 py-3 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/80 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MapPin size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground sm:text-lg">订单地点分布</h2>
                <span className="rounded-full border border-black/10 bg-black/4 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  单店聚焦分析
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                基于订单经纬度实时呈现门店外卖收货辐射网络
              </p>
            </div>
          </div>

          {/* 筛选控制器 */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* 店铺筛选（强制单选，单店查看） */}
            <div className="w-36 sm:w-44">
              <CustomSelect
                value={selectedShop}
                onChange={(val) => setSelectedShop(val)}
                options={shopOptions}
                placeholder="选择店铺"
                className="w-full text-xs sm:text-sm"
              />
            </div>

            {/* 平台筛选 */}
            <div className="w-28 sm:w-32">
              <CustomSelect
                value={selectedPlatform}
                onChange={(val) => setSelectedPlatform(val)}
                options={platformOptions}
                placeholder="全部平台"
                className="w-full text-xs sm:text-sm"
              />
            </div>

            {/* 日期预设切换 */}
            <div className="hidden lg:inline-flex rounded-xl border border-black/8 bg-black/3 p-1 dark:border-white/10 dark:bg-white/4">
              <button
                type="button"
                onClick={() => handleDatePresetChange("today")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  datePreset === "today" ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("yesterday")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  datePreset === "yesterday" ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                昨日
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("7d")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  datePreset === "7d" ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                近7天
              </button>
              <button
                type="button"
                onClick={() => handleDatePresetChange("30d")}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  datePreset === "30d" ? "bg-white dark:bg-zinc-800 text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                近30天
              </button>
            </div>

            {/* 日期选择器 */}
            <div className="flex items-center gap-1.5 text-xs">
              <DatePicker
                value={startDate}
                onChange={(val) => {
                  setStartDate(val);
                  setDatePreset("custom");
                }}
                className="w-28 sm:w-32"
              />
              <span className="text-muted-foreground">至</span>
              <DatePicker
                value={endDate}
                onChange={(val) => {
                  setEndDate(val);
                  setDatePreset("custom");
                }}
                className="w-28 sm:w-32"
              />
            </div>

            {/* 刷新与关闭 */}
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-zinc-800"
              title="刷新地图数据"
            >
              <RefreshCw size={15} className={cn(isLoading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/8 bg-white text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-zinc-800"
              title="关闭弹窗"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 地图主体与悬浮覆盖层 */}
        <div className="relative flex-1 w-full h-full overflow-hidden bg-muted/20">
          {/* 高德地图 DOM 挂载容器 */}
          <div ref={mapContainerRef} className="w-full h-full" />

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

          {/* 未配置个人资料门店的明确友好指引 */}
          {!isLoading && !error && availableShops.length === 0 && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-sm">
                <Store size={28} />
              </div>
              <h3 className="mt-4 text-base font-bold text-foreground sm:text-lg">
                暂未在【个人中心】维护收货地址库门店
              </h3>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                订单分布功能以【个人中心 - 收货地址库】维护的门店作为排他归属来源。请先前往个人中心维护门店地址，以便系统将外卖订单精准匹配到对应门店。
              </p>
              <a
                href="/profile#address-library"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-95"
              >
                前往个人中心添加门店地址
                <ExternalLink size={14} />
              </a>
            </div>
          )}

          {/* 无订单提示浮层（仅在已选门店但无订单时展示） */}
          {!isLoading && !error && availableShops.length > 0 && orders.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-xl border border-black/8 bg-white/90 px-4 py-2.5 text-xs font-medium text-muted-foreground shadow-md backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/90">
              <MapPin size={14} className="text-muted-foreground" />
              当前门店【{currentShop?.name || selectedShop}】在所选筛选条件下暂无有效定位订单
            </div>
          )}

          {/* 左侧悬浮统计面板 */}
          <div className="absolute top-4 left-4 z-10 hidden sm:flex flex-col gap-2.5 max-w-xs rounded-2xl border border-black/10 bg-white/88 p-4 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/88 pointer-events-auto">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Store size={14} className="text-primary" />
              <span className="truncate">{currentShop?.name || "未选择店铺"}</span>
            </div>
            {currentShop?.address && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2" title={currentShop.address}>
                {currentShop.address}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/6 dark:border-white/6">
              <div className="rounded-xl border border-black/5 bg-black/2 p-2 dark:border-white/5 dark:bg-white/3">
                <div className="text-[10px] text-muted-foreground">订单点位</div>
                <div className="text-sm font-bold text-foreground mt-0.5">{summary.totalOrders} 笔</div>
              </div>
              <div className="rounded-xl border border-black/5 bg-black/2 p-2 dark:border-white/5 dark:bg-white/3">
                <div className="text-[10px] text-muted-foreground">总实付金额</div>
                <div className="text-sm font-bold text-foreground mt-0.5">¥{(summary.totalPaid / 100).toFixed(2)}</div>
              </div>
            </div>

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
                  const theme = PLATFORM_COLOR_MAP[plat] || { pinBg: "#3b82f6" };
                  return (
                    <span
                      key={plat}
                      className="inline-flex items-center gap-1 rounded-md border border-black/6 bg-black/3 px-1.5 py-0.5 text-[10px] font-medium text-foreground dark:border-white/6 dark:bg-white/4"
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: theme.pinBg }} />
                      {plat} {stat.count}
                    </span>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/80 mt-1">
              💡 提示：点击地图图钉可查看订单详情
            </p>
          </div>

          {/* 右下角/底部选中的订单卡片浮层 */}
          {selectedOrder && (
            <div className="absolute bottom-4 right-4 z-20 w-80 sm:w-96 rounded-2xl border border-black/10 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95 animate-in fade-in slide-in-from-bottom-3 duration-200">
              <div className="flex items-start justify-between gap-2 border-b border-black/6 pb-2.5 dark:border-white/6">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white shadow-xs"
                      style={{ background: PLATFORM_COLOR_MAP[selectedOrder.platform]?.pinBg || "#3b82f6" }}
                    >
                      {selectedOrder.platform}
                    </span>
                    {selectedOrder.seq ? (
                      <span className="text-xs font-bold text-foreground">#{selectedOrder.seq}</span>
                    ) : null}
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
                <div className="mt-3 flex flex-col gap-1 border-t border-black/6 pt-2.5 dark:border-white/6">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">包含商品</div>
                  <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                    {selectedOrder.items.map((it, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-foreground/90">
                        <span className="truncate flex-1 pr-2">{it.name}</span>
                        <span className="font-mono text-muted-foreground shrink-0">x{it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
