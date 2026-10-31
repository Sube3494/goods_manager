/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search,
  Plus,
  Trash2,
  X,
  Compass,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Upload,
  Download,
  Layers,
  ExternalLink,
  Loader2,
  Navigation,
  Sliders,
  Check,
  Pin,
  PinOff,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Disc,
  CircleDot,
  Map,
  Tag,
} from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { createLocationStorage } from "./locationStorage";
import {
  Point,
  CityConfig,
  DEFAULT_RADIUS_CITIES,
  MAP_THEMES,
  MapThemeConfig,
  POINT_COLORS,
  wgs84ToGcj02,
  gcj02ToWgs84,
  calculateCoverageAnalysis,
  getGaodeNavUrl,
  calculatePolygonCentroid,
} from "./locationUtils";

interface SearchCandidate {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export function StoreLocationMap({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const localStorage = useMemo(() => createLocationStorage(userId), [userId]);

  // 状态：城市、点位与存储
  const [cities, setCities] = useState<Record<string, CityConfig>>(DEFAULT_RADIUS_CITIES);
  const [activeCityId, setActiveCityId] = useState<string>("nationwide");
  const [points, setPoints] = useState<Point[]>([]);
  const [isAddingPoint, setIsAddingPoint] = useState<boolean>(false);

  // 状态：地点搜索
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchCandidate[]>([]);

  // 状态：图层与底图
  const [basemapType, setBasemapType] = useState<"vector" | "satellite">("vector");
  const [currentThemeId, setCurrentThemeId] = useState<string>("dark");
  const [markerIconStyle, setMarkerIconStyle] = useState<"airbnb" | "apple" | "dark">("airbnb");
  const [showRings, setShowRings] = useState(true);
  const [showPointNames, setShowPointNames] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem("store-location:show-point-names");
      return cached !== null ? cached === "true" : true;
    } catch {
      return true;
    }
  });
  const [showTraffic, setShowTraffic] = useState(false);
  const [showRoads, setShowRoads] = useState(false);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);

  // 状态：行政区划轮廓描边凸显
  const [availableDistricts, setAvailableDistricts] = useState<{ name: string; adcode: string; center: [number, number] }[]>([]);
  const [selectedDistrictCodes, setSelectedDistrictCodes] = useState<string[]>([]);
  const [isDistrictDropdownOpen, setIsDistrictDropdownOpen] = useState(false);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const districtDropdownRef = useRef<HTMLDivElement>(null);

  // 状态：布局与弹窗
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

  // 地图 DOM 与实例引用
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const amapSdkRef = useRef<any>(null);
  const layersRef = useRef<{
    satellite?: any;
    roadNet?: any;
    traffic?: any;
  }>({});
  const circlesRef = useRef<any[]>([]);
  const markersRef = useRef<any[]>([]);
  const previewMarkerRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const districtSearchRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const activeInfoWindowRef = useRef<any>(null);
  const districtPolygonsRef = useRef<any[]>([]);
  const districtLabelsRef = useRef<any[]>([]);
  const districtBoundaryCacheRef = useRef<Record<string, any[]>>({});

  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // 空间覆盖测算分析
  const analysis = useMemo(() => {
    return calculateCoverageAnalysis(points);
  }, [points]);

  const activeCity = cities[activeCityId] || cities.nationwide;

  // 城市选择项数据适配 CustomSelect
  const citySelectOptions = useMemo(() => {
    return Object.entries(cities).map(([key, item]) => ({
      value: key,
      label: item.name,
    }));
  }, [cities]);

  // 读取当前账号的城市缓存；旧版未归属账号的缓存保持原样，不自动迁移。
  useEffect(() => {
    try {
      const savedCities = JSON.parse(localStorage.getItem("store-location:custom-cities") || "[]");
      if (Array.isArray(savedCities) && savedCities.length > 0) {
        setCities((prev) => {
          const merged = { ...prev };
          savedCities.forEach((c) => {
            if (c.code && c.name) {
              merged[c.code] = {
                ...c,
                points: [],
              };
            }
          });
          return merged;
        });
      }
      const savedMarkerStyle = localStorage.getItem("store-location:marker-style") as any;
      if (["airbnb", "apple", "dark"].includes(savedMarkerStyle)) {
        setMarkerIconStyle(savedMarkerStyle);
      } else {
        setMarkerIconStyle("airbnb");
        localStorage.setItem("store-location:marker-style", "airbnb");
      }
      const lastCity = localStorage.getItem("store-location:last-city");
      if (lastCity && (DEFAULT_RADIUS_CITIES[lastCity] || savedCities.some((c: any) => c.code === lastCity))) {
        setActiveCityId(lastCity);
      }
    } catch {
      // 容错忽略
    }
  }, [localStorage]);

  // 切换城市时读取当前城市点位
  useEffect(() => {
    if (!activeCityId) return;
    try {
      localStorage.setItem("store-location:last-city", activeCityId);
      const saved = localStorage.getItem(`store-location:points:${activeCityId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setPoints(parsed);
          return;
        }
      }
    } catch {
      // 容错
    }
    const defaultCity = cities[activeCityId];
    setPoints(defaultCity ? [...defaultCity.points] : []);
  }, [activeCityId, cities, localStorage]);

  // 点位更新时自动持久化到当前城市
  useEffect(() => {
    if (!activeCityId) return;
    try {
      localStorage.setItem(`store-location:points:${activeCityId}`, JSON.stringify(points));
    } catch {
      // 容错
    }
  }, [points, activeCityId, localStorage]);

  // 点击外部自动收起搜索候选浮层
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 加载高德地图 SDK
  useEffect(() => {
    let canceled = false;

    async function initAMap() {
      try {
        const key = process.env.NEXT_PUBLIC_AMAP_KEY;
        const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
        if (!key) {
          setMapError("未配置高德地图 NEXT_PUBLIC_AMAP_KEY，请检查系统环境变量。");
          return;
        }

        (window as any)._AMapSecurityConfig = { securityJsCode: securityCode || "" };

        if (!(window as any).AMap) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-store-amap="1"]');
            if (existing) {
              existing.addEventListener("load", () => resolve());
              existing.addEventListener("error", () => reject(new Error("高德 SDK 加载失败")));
              return;
            }
            const script = document.createElement("script");
            script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
              key
            )}&plugin=AMap.ToolBar,AMap.Scale,AMap.PlaceSearch,AMap.DistrictSearch,AMap.Geocoder`;
            script.async = true;
            script.dataset.storeAmap = "1";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("高德地图连接超时，请检查网络。"));
            document.head.appendChild(script);
          });
        }

        if (canceled || !mapContainerRef.current) return;

        const AMap = (window as any).AMap;
        amapSdkRef.current = AMap;

        // 图层初始化（切记：绝不可添加 AMap.TileLayer() 栅格切片，否则会掩盖高德矢量底图及其暗色/自定义主题）
        const satellite = new AMap.TileLayer.Satellite();
        const roadNet = new AMap.TileLayer.RoadNet({ opacity: 0.5 });
        const traffic = new AMap.TileLayer.Traffic({ autoRefresh: true, interval: 180 });

        layersRef.current = { satellite, roadNet, traffic };

        const isDark = document.documentElement.classList.contains("dark");
        const savedTheme = localStorage.getItem("store-location:map-theme");
        const initialThemeId = savedTheme || (isDark ? "dark" : "normal");
        setCurrentThemeId(initialThemeId);
        const initialTheme = MAP_THEMES.find((t) => t.id === initialThemeId) || MAP_THEMES[0];

        const map = new AMap.Map(mapContainerRef.current, {
          viewMode: "2D",
          zoom: activeCity.zoom || 11,
          center: wgs84ToGcj02(activeCity.center[0], activeCity.center[1]),
          resizeEnable: true,
          mapStyle: initialTheme.style,
        });

        map.addControl(new AMap.ToolBar({ position: "RB", offset: new AMap.Pixel(18, 24) }));
        map.addControl(new AMap.Scale({ position: "LB" }));

        // 插件初始化
        placeSearchRef.current = new AMap.PlaceSearch({
          city: "全国",
          citylimit: false,
          pageSize: 10,
          extensions: "base",
        });
        districtSearchRef.current = new AMap.DistrictSearch({
          subdistrict: 0,
          extensions: "base",
        });
        geocoderRef.current = new AMap.Geocoder({
          extensions: "all",
          radius: 1000,
        });

        mapInstanceRef.current = map;
        setIsMapReady(true);
      } catch (err: any) {
        if (!canceled) {
          setMapError(err?.message || "无法加载地图服务，请稍后重试。");
        }
      }
    }

    initAMap();

    return () => {
      canceled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [localStorage]);

  // 监听系统主题变化并同步地图样式
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const observer = new MutationObserver(() => {
      if (basemapType !== "vector") return;
      const isDark = document.documentElement.classList.contains("dark");
      const userSelectedTheme = localStorage.getItem("store-location:map-theme");
      // 若用户没有手动锁定特定主题，则跟随系统深浅色自适应
      if (!userSelectedTheme) {
        const nextThemeId = isDark ? "dark" : "normal";
        setCurrentThemeId(nextThemeId);
        const targetTheme = MAP_THEMES.find((t) => t.id === nextThemeId);
        if (targetTheme) {
          mapInstanceRef.current.setMapStyle(targetTheme.style);
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, [basemapType, localStorage]);

  // 点击外部收起区域轮廓下拉列表
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        districtDropdownRef.current &&
        !districtDropdownRef.current.contains(e.target as Node)
      ) {
        setIsDistrictDropdownOpen(false);
      }
    };
    if (isDistrictDropdownOpen) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
    };
  }, [isDistrictDropdownOpen]);

  // 地图取点点击事件
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: any) => {
      // 点击地图空白处：若有打开的弹窗则自动关闭收起
      if (activeInfoWindowRef.current) {
        activeInfoWindowRef.current.close();
        activeInfoWindowRef.current = null;
      }

      if (!isAddingPoint) return;
      const { lng, lat } = gcj02ToWgs84(e.lnglat.getLat(), e.lnglat.getLng());
      if (points.length >= 20) {
        showToast("最多支持添加 20 个点位", "error");
        setIsAddingPoint(false);
        return;
      }
      const newPoint: Point = {
        name: `自选点位 ${points.length + 1}`,
        lat: Number(lat.toFixed(5)),
        lng: Number(lng.toFixed(5)),
        r: 10,
      };

      // 异步反向解析地址与 POI 地标
      if (geocoderRef.current) {
        geocoderRef.current.getAddress([e.lnglat.getLng(), e.lnglat.getLat()], (status: string, res: any) => {
          if (status === "complete" && res?.regeocode) {
            const formatted = res.regeocode.formattedAddress || "";
            const nearestPoi = res.regeocode.pois?.[0]?.name;
            const aoiName = res.regeocode.aois?.[0]?.name;
            const placeName = nearestPoi || aoiName;

            newPoint.address = formatted;
            const newName = placeName || formatted.split(/[市区县街道]/).filter(Boolean).pop();
            if (newName) {
              newPoint.name = newName;
            }
            setPoints((prev) => prev.map((p) => (p === newPoint ? { ...newPoint } : p)));
          }
        });
      }

      setPoints((prev) => [...prev, newPoint]);
      setIsAddingPoint(false);
      showToast("点位添加成功", "success");
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isAddingPoint, points, showToast]);

  // 重绘所有覆盖圈与标记点
  const redrawOverlays = useCallback(() => {
    const map = mapInstanceRef.current;
    const AMap = amapSdkRef.current;
    if (!map || !AMap) return;

    // 清空现有覆层与活动弹窗
    if (activeInfoWindowRef.current) {
      activeInfoWindowRef.current.close();
      activeInfoWindowRef.current = null;
    }
    circlesRef.current.forEach((c) => map.remove(c));
    markersRef.current.forEach((m) => map.remove(m));
    circlesRef.current = [];
    markersRef.current = [];

    const isSatellite = basemapType === "satellite";

    points.forEach((point, index) => {
      const position = wgs84ToGcj02(point.lat, point.lng);
      const color = POINT_COLORS[index % POINT_COLORS.length];
      const strokeColor = isSatellite
        ? ["#34d399", "#60a5fa", "#fbbf24", "#c084fc", "#f472b6", "#38bdf8"][index % 6]
        : color;

      // 覆盖圆圈
      const circle = new AMap.Circle({
        center: position,
        radius: point.r * 1000,
        strokeColor: strokeColor,
        strokeWeight: 2,
        strokeOpacity: 0.9,
        fillColor: strokeColor,
        fillOpacity: isSatellite ? 0.16 : 0.1,
        bubble: true,
        zIndex: 160,
      });

      const isRingVisible = showRings && !point.hideRing;
      if (isRingVisible) {
        map.add(circle);
      }
      circlesRef.current.push(circle);

      // 点位自定义 DOM Marker：参考 Airbnb / Apple Maps 等业界顶级商业地图标杆设计
      const markerContent = document.createElement("div");
      markerContent.className =
        "group relative flex flex-col items-center cursor-pointer select-none transition-all duration-200 hover:scale-105 active:scale-95";
      markerContent.style.transformOrigin = "bottom center";

      const isPointNameVisible = showPointNames && !point.hideRing;

      if (markerIconStyle === "apple") {
        // Apple Maps 经典黄金流线水滴图钉：饱满圆润、纯白反白数字、底部轻量毛玻璃名牌
        markerContent.innerHTML = `
          <div class="relative flex flex-col items-center filter drop-shadow-md">
            <!-- 黄金流线型水滴主体 -->
            <div class="relative flex items-center justify-center">
              <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="pin-grad-${index}" x1="0" y1="0" x2="28" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="${color}" />
                    <stop offset="100%" stop-color="${color}" stop-opacity="0.85" />
                  </linearGradient>
                </defs>
                <!-- 饱满流线水滴外壳 -->
                <path d="M14 1C7.37 1 2 6.37 2 13C2 21.8 14 34.5 14 34.5C14 34.5 26 21.8 26 13C26 6.37 20.63 1 14 1Z"
                      fill="url(#pin-grad-${index})"
                      stroke="#ffffff"
                      stroke-width="1.5"
                      stroke-linejoin="round"
                      style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" />
                <!-- 纯白反白序号数字：居中绝对同心，不带任何内部圆圈 -->
                <text x="14" y="13"
                      text-anchor="middle"
                      dominant-baseline="central"
                      fill="#ffffff"
                      font-size="12"
                      font-weight="900"
                      font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                      style="user-select: none;">
                  ${index + 1}
                </text>
              </svg>
            </div>
            <!-- 地面立体投影 -->
            <div class="w-3.5 h-1 bg-black/40 rounded-full blur-[1px] mt-0.5"></div>
            <!-- 底部精致轻量店名微胶囊名牌（支持自由显示/隐藏，单点隐藏时同步隐藏店名） -->
            ${
              isPointNameVisible
                ? `<div class="mt-1 flex items-center px-2 py-0.5 rounded-full bg-slate-950/85 text-white border border-white/15 shadow-md backdrop-blur-md whitespace-nowrap">
                    <span class="text-[11px] font-bold tracking-tight truncate max-w-[120px] leading-none">${point.name}</span>
                  </div>`
                : ""
            }
          </div>
        `;
      } else if (markerIconStyle === "dark") {
        // 曜石暗夜微胶囊（深色科技风）：一体式带针脚，深色半透明毛玻璃，与深色底图浑然一体
        markerContent.innerHTML = `
          <div class="flex flex-col items-center filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.4)]">
            <div class="flex items-center gap-1.5 ${isPointNameVisible ? 'pl-1.5 pr-2.5 py-1' : 'p-1'} rounded-full bg-slate-900/90 text-white border border-white/20 backdrop-blur-md transition-all group-hover:border-primary/50">
              <span class="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black text-white shrink-0 shadow-xs" style="background-color: ${color}">
                ${index + 1}
              </span>
              ${
                isPointNameVisible
                  ? `<span class="text-[11px] font-bold text-white truncate max-w-[130px] tracking-tight leading-none">${point.name}</span>`
                  : ""
              }
            </div>
            <div class="w-0 h-0 border-x-[4px] border-x-transparent border-t-[5px] border-t-slate-900/90 -mt-[0.5px]"></div>
            <div class="w-3 h-1 bg-black/40 rounded-full blur-[1px] mt-0.5"></div>
          </div>
        `;
      } else {
        // 默认 airbnb：Airbnb 黄金标杆一体化浮动白胶囊（高反差、极致高级、彻底消除上下割裂）
        markerContent.innerHTML = `
          <div class="flex flex-col items-center filter drop-shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
            <!-- 一体化纯白高质感胶囊 -->
            <div class="flex items-center gap-1.5 ${isPointNameVisible ? 'pl-1.5 pr-3 py-1.5' : 'p-1'} rounded-full bg-white text-slate-900 border border-black/10 shadow-sm transition-all group-hover:scale-105 group-hover:shadow-md">
              <!-- 左侧彩色数字徽章 -->
              <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white shrink-0 shadow-xs" style="background-color: ${color}">
                ${index + 1}
              </span>
              <!-- 右侧清晰加粗店名 -->
              ${
                isPointNameVisible
                  ? `<span class="text-[12px] font-bold text-slate-900 truncate max-w-[150px] tracking-tight leading-none">${point.name}</span>`
                  : ""
              }
            </div>
            <!-- 底部一体微型指向尖脚（与胶囊底色完全一致，无缝贴合） -->
            <div class="w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px] border-t-white -mt-[0.5px]"></div>
            <!-- 微地面阴影 -->
            <div class="w-3.5 h-1 bg-black/35 rounded-full blur-[1px] mt-0.5"></div>
          </div>
        `;
      }

      const isPinned = Boolean(point.isPinned);
      const marker = new AMap.Marker({
        position,
        content: markerContent,
        anchor: "bottom-center",
        draggable: !isPinned, // 钉住后禁止拖动，防止手抖误触
        title: isPinned ? `${point.name}（已锁定位置，禁止误拖）` : `${point.name}（可拖拽调整位置）`,
        bubble: false,
        zIndex: 180,
      });

      if (!isPinned) {
        // 实时拖拽点位：辐射覆盖圈实时流畅跟随
        marker.on("dragging", (e: any) => {
          circle.setCenter(e.lnglat);
        });

        // 拖拽释放：更新经纬度并自动逆地理反查新地址与商圈
        marker.on("dragend", (e: any) => {
          const { lat, lng } = gcj02ToWgs84(e.lnglat.getLat(), e.lnglat.getLng());
          const newLat = Number(lat.toFixed(5));
          const newLng = Number(lng.toFixed(5));

          // 立即更新点位经纬度坐标
          setPoints((prev) =>
            prev.map((p, i) =>
              i === index
                ? {
                    ...p,
                    lat: newLat,
                    lng: newLng,
                  }
                : p
            )
          );

          // 异步调用逆地理编码更新详细地址与地标名称
          if (geocoderRef.current) {
            geocoderRef.current.getAddress([e.lnglat.getLng(), e.lnglat.getLat()], (status: string, res: any) => {
              if (status === "complete" && res?.regeocode) {
                const formattedAddress = res.regeocode.formattedAddress || "";
                const nearestPoi = res.regeocode.pois?.[0]?.name;
                const aoiName = res.regeocode.aois?.[0]?.name;
                const placeName = nearestPoi || aoiName;

                setPoints((prev) =>
                  prev.map((p, i) => {
                    if (i !== index) return p;
                    // 拖动到新位置后，点位名称与详细地址同步更新为最新落点的地标商圈名
                    const newName = placeName || formattedAddress.split(/[市区县街道]/).filter(Boolean).pop() || p.name;
                    return {
                      ...p,
                      name: newName,
                      address: formattedAddress || p.address,
                    };
                  })
                );

                showToast(
                  `已重新定位点位 ${index + 1}：${placeName || formattedAddress || "位置已更新"}`,
                  "success"
                );
              }
            });
          }
        });
      }

      // 点击点位呼出专为商业选址打造的轻量现代卡片（告别反人类笨重弹窗，具备选址核心交互）
      marker.on("click", () => {
        if (activeInfoWindowRef.current) {
          activeInfoWindowRef.current.close();
        }

        const infoEl = document.createElement("div");
        infoEl.className =
          "relative rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#0f172a]/95 p-3.5 shadow-2xl backdrop-blur-2xl text-foreground text-xs min-w-[260px] max-w-[290px] select-text animate-in fade-in zoom-in-95 duration-150";

        infoEl.innerHTML = `
          <!-- 头部：序号徽章 + 点位名称 + 居中与删除操作 -->
          <div class="flex items-center justify-between gap-2 pb-2 border-b border-black/6 dark:border-white/8">
            <div class="flex items-center gap-2 min-w-0">
              <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white shrink-0 shadow-xs" style="background-color: ${color}">
                ${index + 1}
              </span>
              <span class="font-bold text-xs truncate text-foreground tracking-tight">${point.name}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <!-- 显隐当前点位覆盖圈与店名 -->
              <button id="toggle-ring-btn" title="${point.hideRing ? '点击显示此点位店名与覆盖圈' : '点击隐藏此点位店名与覆盖圈'}" type="button" class="h-6 w-6 rounded-lg flex items-center justify-center ${point.hideRing ? 'text-muted-foreground/40' : 'text-primary bg-primary/10'} transition-all cursor-pointer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20"/></svg>
              </button>
              <!-- 钉住 / 解锁锁定位置 -->
              <button id="pin-point-btn" title="${point.isPinned ? '已钉住锁定（点击解锁拖拽）' : '钉住锁定位置（防误触拖动）'}" type="button" class="h-6 w-6 rounded-lg flex items-center justify-center ${point.isPinned ? 'text-amber-500 bg-amber-500/15' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground'} transition-all cursor-pointer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="${point.isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${point.isPinned ? '-rotate-45' : ''}"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
              </button>
              <!-- 视野平移居中聚焦 -->
              <button id="focus-point-btn" title="居中聚焦视野" type="button" class="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all cursor-pointer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
              </button>
              <!-- 快捷删除点位 -->
              <button id="delete-point-btn" title="删除该点位" type="button" class="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-rose-500/15 hover:text-rose-500 transition-all cursor-pointer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          </div>

          <!-- 详细地址或地标商圈 -->
          <div class="py-2.5">
            <div class="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 font-medium">
              ${point.address || `坐标：${point.lat.toFixed(5)}° N, ${point.lng.toFixed(5)}° E`}
            </div>
          </div>

          <!-- 选址核心操作：辐射半径快捷选择 -->
          <div class="pt-2 border-t border-black/6 dark:border-white/8 flex items-center justify-between">
            <span class="text-[10px] font-semibold text-muted-foreground">覆盖半径</span>
            <div class="flex items-center gap-1">
              ${[1, 3, 5, 10]
                .map(
                  (rVal) => `
                <button data-radius="${rVal}" type="button" class="radius-quick-btn px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    point.r === rVal
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-black/4 dark:bg-white/6 border-transparent text-muted-foreground hover:text-foreground hover:bg-black/8 dark:hover:bg-white/10"
                  } transition-all cursor-pointer">
                  ${rVal}km
                </button>
              `
                )
                .join("")}
            </div>
          </div>

          <!-- 底部微指针：优雅衔接，不盖住 Marker -->
          <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r border-b border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#0f172a]/95"></div>
        `;

        const infoWindow = new AMap.InfoWindow({
          isCustom: true,
          content: infoEl,
          offset: new AMap.Pixel(0, -38),
          autoMove: true,
        });

        // 绑定事件：显隐当前点位辐射轮廓
        const toggleRingBtn = infoEl.querySelector("#toggle-ring-btn");
        if (toggleRingBtn) {
          toggleRingBtn.addEventListener("click", () => {
            const nextHide = !point.hideRing;
            setPoints((prev) =>
              prev.map((p, i) => (i === index ? { ...p, hideRing: nextHide } : p))
            );
            showToast(nextHide ? `已隐藏「${point.name}」的店名与覆盖圈` : `已恢复显示「${point.name}」的店名与覆盖圈`, "info");
            infoWindow.close();
            activeInfoWindowRef.current = null;
          });
        }

        // 绑定事件：钉住/解锁当前点位
        const pinBtn = infoEl.querySelector("#pin-point-btn");
        if (pinBtn) {
          pinBtn.addEventListener("click", () => {
            const nextPinned = !point.isPinned;
            setPoints((prev) =>
              prev.map((p, i) => (i === index ? { ...p, isPinned: nextPinned } : p))
            );
            showToast(nextPinned ? `已钉住锁定「${point.name}」，已禁止拖动` : `已解锁「${point.name}」拖动`, "info");
            infoWindow.close();
            activeInfoWindowRef.current = null;
          });
        }

        // 绑定事件：居中聚焦
        const focusBtn = infoEl.querySelector("#focus-point-btn");
        if (focusBtn) {
          focusBtn.addEventListener("click", () => {
            map.panTo(marker.getPosition());
          });
        }

        // 绑定事件：快速删除点位
        const deleteBtn = infoEl.querySelector("#delete-point-btn");
        if (deleteBtn) {
          deleteBtn.addEventListener("click", () => {
            infoWindow.close();
            activeInfoWindowRef.current = null;
            setPoints((prev) => prev.filter((_, i) => i !== index));
            showToast(`已删除点位：${point.name}`, "info");
          });
        }

        // 绑定事件：辐射半径快捷微调
        infoEl.querySelectorAll(".radius-quick-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const rVal = Number((e.currentTarget as HTMLElement).dataset.radius);
            if (rVal) {
              setPoints((prev) =>
                prev.map((p, i) => (i === index ? { ...p, r: rVal } : p))
              );
            }
          });
        });

        activeInfoWindowRef.current = infoWindow;
        infoWindow.open(map, marker.getPosition());
      });

      map.add(marker);
      markersRef.current.push(marker);
    });
  }, [points, basemapType, currentThemeId, markerIconStyle, showRings, showPointNames]);

  useEffect(() => {
    if (isMapReady) {
      redrawOverlays();
    }
  }, [isMapReady, redrawOverlays]);

  // 清除地图上所有已绘制的行政区轮廓多边形与中心标签
  const clearDistrictPolygons = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map) {
      districtPolygonsRef.current.forEach((p) => map.remove(p));
      districtLabelsRef.current.forEach((l) => map.remove(l));
    }
    districtPolygonsRef.current = [];
    districtLabelsRef.current = [];
  }, []);

  // 加载当前城市的下辖行政区列表
  const loadCityDistricts = useCallback(() => {
    const AMap = amapSdkRef.current;
    if (!AMap || !activeCity || activeCity.code === "nationwide") {
      setAvailableDistricts([]);
      setSelectedDistrictCodes([]);
      clearDistrictPolygons();
      return;
    }

    setIsLoadingDistricts(true);
    setSelectedDistrictCodes([]);
    clearDistrictPolygons();

    const searcher = new AMap.DistrictSearch({
      subdistrict: 1,
      extensions: "base",
      level: "city",
    });

    searcher.search(activeCity.name, (status: string, result: any) => {
      setIsLoadingDistricts(false);
      if (status === "complete" && result?.districtList?.[0]) {
        const subList = result.districtList[0].districtList || [];
        const items = subList
          .filter((d: any) => d.name && d.adcode)
          .map((d: any) => ({
            name: d.name,
            adcode: String(d.adcode),
            center: d.center ? [d.center.getLng(), d.center.getLat()] as [number, number] : activeCity.center,
          }));
        setAvailableDistricts(items);
      } else {
        setAvailableDistricts([]);
      }
    });
  }, [activeCity, clearDistrictPolygons]);

  // 城市变更或地图就绪时，自动拉取当前城市的下辖行政区
  useEffect(() => {
    if (isMapReady) {
      loadCityDistricts();
    }
  }, [isMapReady, activeCityId, loadCityDistricts]);

  // 渲染已勾选的行政区划轮廓多边形（Polygon）
  useEffect(() => {
    const map = mapInstanceRef.current;
    const AMap = amapSdkRef.current;
    if (!map || !AMap) return;

    clearDistrictPolygons();

    if (selectedDistrictCodes.length === 0) return;

    const colorPalette = [
      "#38bdf8", // 晴空海蓝
      "#10b981", // 薄荷翠绿
      "#f59e0b", // 琥珀金橙
      "#a855f7", // 极光雅紫
      "#ec4899", // 霓虹玫红
      "#06b6d4", // 科技青绿
      "#6366f1", // 经典靛蓝
      "#14b8a6", // 松石绿
    ];

    selectedDistrictCodes.forEach((code, index) => {
      const district = availableDistricts.find((d) => d.adcode === code);
      if (!district) return;

      const strokeColor = colorPalette[index % colorPalette.length];

      const drawBoundaries = (boundaries: any[]) => {
        boundaries.forEach((path: any) => {
          const polygon = new AMap.Polygon({
            path,
            strokeColor,
            strokeWeight: 2.5,
            strokeOpacity: 0.95,
            fillColor: strokeColor,
            fillOpacity: basemapType === "satellite" ? 0.22 : 0.14,
            zIndex: 65,
            bubble: true,
            cursor: "pointer",
          });

          polygon.on("mouseover", () => {
            polygon.setOptions({
              fillOpacity: 0.3,
              strokeWeight: 3.5,
            });
          });
          polygon.on("mouseout", () => {
            polygon.setOptions({
              fillOpacity: basemapType === "satellite" ? 0.22 : 0.14,
              strokeWeight: 2.5,
            });
          });

          map.add(polygon);
          districtPolygonsRef.current.push(polygon);
        });

        // 在行政区几何中心放置微型半透明区名标签（如“南山区”）
        // 关键改进：优先使用多边形面积质心算法计算真实轮廓中心，彻底解决区政府驻地（POI）偏向角落的问题
        const visualCenter = calculatePolygonCentroid(boundaries) || district.center;
        if (visualCenter) {
          const labelContent = document.createElement("div");
          labelContent.className =
            "pointer-events-none px-2.5 py-0.5 rounded-full bg-slate-900/90 text-white text-[11px] font-bold border border-white/20 backdrop-blur-md shadow-md select-none transform -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 whitespace-nowrap animate-in fade-in duration-200";
          labelContent.innerHTML = `
            <span class="w-2 h-2 rounded-full shrink-0 shadow-xs" style="background-color: ${strokeColor}"></span>
            <span>${district.name}</span>
          `;

          const labelMarker = new AMap.Marker({
            position: visualCenter,
            content: labelContent,
            anchor: "center",
            zIndex: 70,
          });
          map.add(labelMarker);
          districtLabelsRef.current.push(labelMarker);
        }
      };

      const cached = districtBoundaryCacheRef.current[code];
      if (cached) {
        drawBoundaries(cached);
      } else {
        const boundarySearcher = new AMap.DistrictSearch({
          subdistrict: 0,
          extensions: "all",
          level: "district",
        });
        boundarySearcher.search(district.adcode, (status: string, result: any) => {
          if (status === "complete" && result?.districtList?.[0]?.boundaries) {
            const boundaries = result.districtList[0].boundaries;
            districtBoundaryCacheRef.current[code] = boundaries;
            drawBoundaries(boundaries);
          }
        });
      }
    });
  }, [availableDistricts, selectedDistrictCodes, basemapType, clearDistrictPolygons]);

  // 切换城市视野
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeCity) return;
    clearPreviewMarker();
    map.setZoomAndCenter(activeCity.zoom, wgs84ToGcj02(activeCity.center[0], activeCity.center[1]));
  }, [activeCityId, cities]);

  // 切换底图模式（矢量地图 vs 卫星影像）
  const handleBasemapTypeChange = (type: "vector" | "satellite") => {
    const map = mapInstanceRef.current;
    const { satellite, roadNet } = layersRef.current;
    if (!map) return;
    setBasemapType(type);

    if (type === "satellite") {
      map.add(satellite);
      if (showRoads) map.add(roadNet);
      map.setMapStyle("amap://styles/normal");
    } else {
      map.remove([satellite, roadNet].filter(Boolean));
      const targetTheme = MAP_THEMES.find((t) => t.id === currentThemeId) || MAP_THEMES[0];
      map.setMapStyle(targetTheme.style);
    }
  };

  // 切换地图风格主题
  const handleThemeChange = (themeId: string) => {
    setCurrentThemeId(themeId);
    localStorage.setItem("store-location:map-theme", themeId);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (basemapType === "satellite") {
      const { satellite, roadNet } = layersRef.current;
      map.remove([satellite, roadNet].filter(Boolean));
      setBasemapType("vector");
    }

    const targetTheme = MAP_THEMES.find((t) => t.id === themeId);
    if (targetTheme) {
      map.setMapStyle(targetTheme.style);
    }
  };

  // 切换图层可见性
  const toggleLayer = (layerKey: "rings" | "traffic" | "roads") => {
    const map = mapInstanceRef.current;
    const { roadNet, traffic } = layersRef.current;
    if (!map) return;

    if (layerKey === "rings") {
      const next = !showRings;
      setShowRings(next);
      circlesRef.current.forEach((c) => (next ? map.add(c) : map.remove(c)));
    } else if (layerKey === "traffic") {
      const next = !showTraffic;
      setShowTraffic(next);
      next ? map.add(traffic) : map.remove(traffic);
    } else if (layerKey === "roads") {
      const next = !showRoads;
      setShowRoads(next);
      if (basemapType === "satellite") {
        next ? map.add(roadNet) : map.remove(roadNet);
      }
    }
  };

  // 地点检索与解析（支持搜索地点、商圈、城市名或经纬度）
  const handleSearchLocation = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const query = locationSearchQuery.trim();
    if (!query) return;

    setIsSearchingLocation(true);
    setSearchResults([]);

    // 经纬度识别
    const parts = query.split(/[,，]/).map((v) => Number(v.trim()));
    if (parts.length === 2 && parts.every((num) => Number.isFinite(num))) {
      const [lat, lng] = parts;
      if (Math.abs(lat) <= 85 && Math.abs(lng) <= 180) {
        setSearchResults([
          {
            name: "指定经纬度坐标",
            address: `纬度 ${lat}，经度 ${lng}`,
            lat,
            lng,
          },
        ]);
        setIsSearchingLocation(false);
        return;
      }
    }

    if (!placeSearchRef.current) {
      setIsSearchingLocation(false);
      return;
    }

    // 先用 PlaceSearch 搜索 POI
    placeSearchRef.current.search(query, (status: string, result: any) => {
      if (status === "complete" && result?.poiList?.pois?.length) {
        setIsSearchingLocation(false);
        const matches: SearchCandidate[] = result.poiList.pois.map((poi: any) => {
          const { lat, lng } = gcj02ToWgs84(poi.location.getLat(), poi.location.getLng());
          return {
            name: poi.name,
            address: poi.address || poi.cityname || "",
            lat,
            lng,
          };
        });
        setSearchResults(matches);
      } else {
        // 若 POI 无结果，尝试用 DistrictSearch 识别是否为省市/行政区
        if (districtSearchRef.current) {
          districtSearchRef.current.search(query, (dStatus: string, dResult: any) => {
            setIsSearchingLocation(false);
            if (dStatus === "complete" && dResult?.districtList?.length) {
              const district = dResult.districtList[0];
              const { lat, lng } = gcj02ToWgs84(district.center.getLat(), district.center.getLng());
              const code = district.adcode || String(Date.now());
              const name = district.name;

              // 自动将新城市加入列表并切换视野
              setCities((prev) => {
                if (prev[code]) return prev;
                const next = {
                  ...prev,
                  [code]: {
                    name,
                    shortName: name.replace(/[市县省区]/g, "") || name,
                    code,
                    center: [lat, lng] as [number, number],
                    zoom: 12,
                    points: [],
                  },
                };
                try {
                  const customOnly = (Object.values(next) as CityConfig[]).filter((c) => !DEFAULT_RADIUS_CITIES[c.code]);
                  localStorage.setItem("store-location:custom-cities", JSON.stringify(customOnly));
                } catch {
                  // 容错
                }
                return next;
              });

              setActiveCityId(code);
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setZoomAndCenter(12, [district.center.getLng(), district.center.getLat()]);
              }
              showToast(`已定位到地区：${name}`, "success");
            } else {
              showToast("未找到匹配地点，请补充详细省市信息", "error");
            }
          });
        } else {
          setIsSearchingLocation(false);
          showToast("未找到匹配地点，请补充详细省市信息", "error");
        }
      }
    });
  };

  // 清除搜索预览准星标记
  const clearPreviewMarker = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map && previewMarkerRef.current) {
      map.remove(previewMarkerRef.current);
      previewMarkerRef.current = null;
    }
  }, []);

  // 地点定位预览（仅在搜索候选中点击“定位”时临时展示，提供微型动画脉冲）
  const handlePreviewCandidate = (cand: SearchCandidate) => {
    const map = mapInstanceRef.current;
    const AMap = amapSdkRef.current;
    if (!map || !AMap) return;

    clearPreviewMarker();

    const pos = wgs84ToGcj02(cand.lat, cand.lng);
    const content = document.createElement("div");
    content.className =
      "flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border-2 border-primary text-primary font-bold shadow-lg animate-pulse pointer-events-none";
    content.textContent = "⌖";

    const marker = new AMap.Marker({
      position: pos,
      content,
      anchor: "center",
      zIndex: 300,
    });
    map.add(marker);
    previewMarkerRef.current = marker;
    map.setZoomAndCenter(15, pos);
  };

  // 添加候选地点为正式点位
  const handleAddCandidatePoint = (cand: SearchCandidate) => {
    if (points.length >= 20) {
      showToast("最多支持 20 个点位", "error");
      return;
    }

    // 重点：立即彻底清除搜索临时预览靶心，防止其重叠在正式点位下方一直不消失
    clearPreviewMarker();

    const newPoint: Point = {
      name: cand.name,
      address: cand.address,
      lat: cand.lat,
      lng: cand.lng,
      r: 10,
    };
    setPoints((prev) => [...prev, newPoint]);
    showToast(`已添加点位：${cand.name}`, "success");

    // 平移聚焦并关闭搜索结果弹层
    const map = mapInstanceRef.current;
    if (map) {
      map.panTo(wgs84ToGcj02(cand.lat, cand.lng));
    }
    setSearchResults([]);
    setLocationSearchQuery("");
  };

  // 导出分析 JSON
  const handleExportJson = () => {
    const payload = {
      city: activeCity.name,
      cityCode: activeCity.code,
      exportedAt: new Date().toISOString(),
      points,
      analysis,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeCity.shortName}_开店选址覆盖分析.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("选址分析文件已成功导出", "success");
  };

  // 导入点位 JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const importedPoints = Array.isArray(data) ? data : data.points;
        if (!Array.isArray(importedPoints)) {
          throw new Error("JSON 格式不符");
        }
        setPoints(importedPoints.slice(0, 20));
        showToast("点位数据导入成功", "success");
      } catch {
        showToast("导入失败，文件格式有误", "error");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground overflow-hidden">
      {/* 顶部主工具栏 Header（设定全局最高层级 z-50，确保搜索浮层完全覆盖下方工作区） */}
      <header className="relative z-50 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/8 dark:border-white/10 bg-white/80 dark:bg-white/4 px-3 py-2.5 backdrop-blur-xl sm:px-5">
        <div className="flex flex-1 flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
          {/* 地区切换选择器 */}
          <div className="min-w-[120px] sm:min-w-[130px] shrink-0">
            <CustomSelect
              value={activeCityId}
              options={citySelectOptions}
              onChange={(nextId) => {
                setActiveCityId(nextId);
                setSearchResults([]);
              }}
              searchable
              searchPlaceholder="输入城市名或拼音搜索..."
              placeholder="选择分析地区"
              triggerClassName="h-9 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 px-4 text-xs font-semibold text-foreground transition-all shadow-xs"
            />
          </div>

          {/* 行政区划轮廓下拉多选列表（与搜索框同处一行） */}
          <div ref={districtDropdownRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsDistrictDropdownOpen((prev) => !prev)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer",
                selectedDistrictCodes.length > 0
                  ? "bg-primary text-primary-foreground border-primary shadow-primary/20"
                  : isDistrictDropdownOpen
                  ? "bg-primary/10 text-primary border-primary/40"
                  : "border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/8 text-foreground"
              )}
            >
              <Map
                size={13}
                className={cn("shrink-0", selectedDistrictCodes.length > 0 ? "text-primary-foreground" : "text-primary")}
              />
              <span>行政区轮廓</span>
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold leading-tight",
                  selectedDistrictCodes.length > 0
                    ? "bg-white/20 text-white"
                    : "bg-black/5 dark:bg-white/10 text-muted-foreground"
                )}
              >
                {selectedDistrictCodes.length === 0
                  ? "未选"
                  : selectedDistrictCodes.length === 1
                  ? availableDistricts.find((d) => d.adcode === selectedDistrictCodes[0])?.name || "1区"
                  : `${selectedDistrictCodes.length}区已圈`}
              </span>
              <ChevronDown
                size={12}
                className={cn("transition-transform duration-200 opacity-60", isDistrictDropdownOpen && "rotate-180")}
              />
            </button>

            {/* 下拉列表浮层 */}
            {isDistrictDropdownOpen && (
              <div className="absolute left-0 top-[calc(100%+6px)] z-[120] w-64 rounded-2xl border border-black/8 bg-white dark:border-white/10 dark:bg-[#0b111e] p-2 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-150">
                {/* 顶部操作：全选、清空 */}
                <div className="flex items-center justify-between pb-1.5 mb-1 px-2 border-b border-black/6 dark:border-white/6">
                  <span className="text-[11px] font-bold text-muted-foreground">
                    {activeCity.name} · 下辖区 ({availableDistricts.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const allCodes = availableDistricts.map((d) => d.adcode);
                        setSelectedDistrictCodes(allCodes);
                        showToast(`已全选描边 ${activeCity.name} 全部行政区`, "info");
                      }}
                      className="text-[10px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      全选
                    </button>
                    <span className="text-[10px] text-muted-foreground/40">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDistrictCodes([]);
                        showToast("已清空描边", "info");
                      }}
                      className="text-[10px] font-semibold text-muted-foreground hover:text-rose-500 cursor-pointer"
                    >
                      清空
                    </button>
                  </div>
                </div>

                {/* 下拉列表项（多选/单选 Checkbox 列表） */}
                <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5 pr-0.5">
                  {availableDistricts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      {isLoadingDistricts ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Loader2 size={12} className="animate-spin text-primary" />
                          <span>加载行政区列表中...</span>
                        </div>
                      ) : (
                        <span>当前地区暂无下级行政区数据</span>
                      )}
                    </div>
                  ) : (
                    availableDistricts.map((district) => {
                      const isSelected = selectedDistrictCodes.includes(district.adcode);
                      return (
                        <button
                          key={district.adcode}
                          type="button"
                          onClick={() => {
                            setSelectedDistrictCodes((prev) =>
                              prev.includes(district.adcode)
                                ? prev.filter((c) => c !== district.adcode)
                                : [...prev, district.adcode]
                            );
                            if (!isSelected && district.center) {
                              const map = mapInstanceRef.current;
                              if (map) {
                                map.panTo(district.center);
                              }
                            }
                          }}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5 text-foreground transition-all cursor-pointer text-left select-none"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                "flex h-3.5 w-3.5 items-center justify-center rounded border transition-all shrink-0",
                                isSelected
                                  ? "border-primary bg-transparent text-primary"
                                  : "border-black/25 dark:border-white/25 bg-transparent text-transparent"
                              )}
                            >
                              {isSelected && <Check size={10} className="stroke-[2.5]" />}
                            </div>
                            <span className={cn("truncate", isSelected ? "font-bold text-foreground" : "font-normal text-muted-foreground")}>
                              {district.name}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-semibold text-primary shrink-0 flex items-center gap-1">
                              <span className="h-1 w-1 rounded-full bg-primary" />
                              <span>已描边</span>
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 系统标准全局地点搜索栏（支持搜城市、商圈、详细地址、经纬度） */}
          <div ref={searchContainerRef} className="relative z-50 flex-1 min-w-[240px] max-w-[480px]">
            <form onSubmit={handleSearchLocation} className="relative flex items-center">
              <Search
                size={14}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={locationSearchQuery}
                onChange={(e) => {
                  setLocationSearchQuery(e.target.value);
                  if (!e.target.value) {
                    setSearchResults([]);
                    clearPreviewMarker();
                  }
                }}
                placeholder="搜索地点、商圈、城市或经纬度"
                className="h-9 w-full rounded-full border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/4 pl-9 pr-20 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:bg-white dark:focus:bg-white/8 transition-all shadow-xs outline-none"
              />
              {locationSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setLocationSearchQuery("");
                    setSearchResults([]);
                    clearPreviewMarker();
                  }}
                  className="absolute right-14 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-full cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
              <button
                type="submit"
                disabled={isSearchingLocation || !locationSearchQuery.trim()}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-3.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 shadow-xs cursor-pointer"
              >
                {isSearchingLocation ? <Loader2 size={12} className="animate-spin" /> : "搜索"}
              </button>
            </form>

            {/* 搜索结果下拉浮层（最高层级置顶，100% 实底不透光，坚实遮蔽底层元素） */}
            {searchResults.length > 0 && (
              <div className="absolute top-[calc(100%+6px)] left-0 z-[100] w-full rounded-2xl border border-black/8 bg-white dark:border-white/10 dark:bg-[#0b111e] p-1.5 shadow-2xl backdrop-blur-2xl max-h-72 overflow-y-auto custom-scrollbar space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-bold text-muted-foreground border-b border-black/6 dark:border-white/6 flex items-center justify-between">
                  <span>搜索结果 ({searchResults.length})</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchResults([]);
                      clearPreviewMarker();
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    关闭
                  </button>
                </div>
                {searchResults.map((cand, idx) => (
                  <div
                    key={`${cand.name}-${idx}`}
                    className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-foreground truncate">{cand.name}</div>
                      {cand.address && (
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{cand.address}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePreviewCandidate(cand)}
                        className="h-6 px-2.5 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 text-[10px] font-medium transition-all active:scale-95 cursor-pointer"
                      >
                        定位
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddCandidatePoint(cand)}
                        className="h-6 px-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-[10px] font-medium transition-all active:scale-95 cursor-pointer shadow-xs"
                      >
                        ＋ 添加
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 顶部操作：覆盖对比、导出 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAnalysisModalOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 px-4 text-xs font-semibold text-foreground transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <Sliders size={13} className="text-primary" />
            <span>覆盖对比</span>
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 px-4 text-xs font-semibold text-foreground transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            <Download size={13} />
            <span>导出</span>
          </button>
        </div>
      </header>

      {/* 主工作区（设定 z-0 形成独立隔离层叠上下文，内部所有子元素绝对不会溢出覆盖 Header 及其下拉菜单） */}
      <div className="relative z-0 flex flex-1 min-h-0 w-full overflow-hidden">
        {/* 左侧点位面板 */}
        <aside
          className={cn(
            "flex flex-col border-r border-black/8 dark:border-white/10 bg-white/90 dark:bg-white/4 backdrop-blur-xl transition-all duration-300 z-20 shrink-0",
            isSidebarCollapsed ? "w-0 overflow-hidden border-r-0 p-0" : "w-[360px] p-4"
          )}
        >
          {/* 面板头部：标题与视图工具条 */}
          <div className="pb-3 mb-2.5 border-b border-black/6 dark:border-white/6 space-y-2">
            {/* 第一行：城市标题与侧栏收起 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-2 w-2 rounded-full bg-primary shrink-0" />
                <h3 className="text-sm font-bold text-foreground tracking-tight truncate">
                  {activeCity.name} · 选址分析
                </h3>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold font-mono text-primary whitespace-nowrap">
                  {points.length}/20 点位
                </span>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(true)}
                  title="收起侧栏面板"
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all cursor-pointer shrink-0"
                >
                  <PanelLeftClose size={15} />
                </button>
              </div>
            </div>

            {/* 第二行：微工具条（辐射覆盖轮廓圈显隐切换 + 点位名称显隐 + 清空） */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    const next = !showRings;
                    setShowRings(next);
                    showToast(next ? "已开启点位覆盖轮廓显示" : "已隐藏点位覆盖轮廓", "info");
                  }}
                  title={showRings ? "点击隐藏所有点位的辐射覆盖轮廓圈" : "点击显示所有点位的辐射覆盖轮廓圈"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all cursor-pointer select-none border",
                    showRings
                      ? "bg-primary/10 text-primary border-primary/25 hover:bg-primary/15"
                      : "bg-black/[0.03] dark:bg-white/[0.04] text-muted-foreground border-transparent hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8"
                  )}
                >
                  <Disc size={12} className={cn("shrink-0", showRings ? "text-primary" : "text-muted-foreground")} />
                  <span className="whitespace-nowrap">覆盖圈</span>
                  <span className={cn("h-1 w-1 rounded-full shrink-0", showRings ? "bg-primary" : "bg-muted-foreground/30")} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !showPointNames;
                    setShowPointNames(next);
                    try {
                      localStorage.setItem("store-location:show-point-names", String(next));
                    } catch {}
                    showToast(next ? "已显示点位名称名牌" : "已隐藏点位名称，仅保留图钉", "info");
                  }}
                  title={showPointNames ? "点击隐藏地图点位的店名胶囊名牌（更清爽）" : "点击显示地图点位的店名胶囊名牌"}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all cursor-pointer select-none border",
                    showPointNames
                      ? "bg-primary/10 text-primary border-primary/25 hover:bg-primary/15"
                      : "bg-black/[0.03] dark:bg-white/[0.04] text-muted-foreground border-transparent hover:text-foreground hover:bg-black/5 dark:hover:bg-white/8"
                  )}
                >
                  <Tag size={12} className={cn("shrink-0", showPointNames ? "text-primary" : "text-muted-foreground")} />
                  <span className="whitespace-nowrap">店名</span>
                  <span className={cn("h-1 w-1 rounded-full shrink-0", showPointNames ? "bg-primary" : "bg-muted-foreground/30")} />
                </button>
              </div>

              {points.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPoints([]);
                    try {
                      localStorage.setItem(`store-location:points:${activeCityId}`, "[]");
                    } catch {}
                    showToast("已清空当前城市的点位", "info");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer select-none whitespace-nowrap shrink-0"
                >
                  <RotateCcw size={11} className="shrink-0" />
                  <span>清空</span>
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            设定分析点位与辐射半径，测算去重覆盖面积与重叠率。
          </p>

          {/* “＋ 在地图上添加点位”胶囊按钮 */}
          <button
            type="button"
            onClick={() => setIsAddingPoint((prev) => !prev)}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer mb-3 shadow-xs",
              isAddingPoint
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "border border-dashed border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
            )}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>{isAddingPoint ? "点击地图任意位置放置 · 点击取消" : "在地图上添加点位"}</span>
          </button>

          {/* 点位卡片列表 */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5 custom-scrollbar">
            {points.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="h-12 w-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/8 dark:border-white/10 flex items-center justify-center mb-3 text-muted-foreground">
                  <MapPin size={22} className="opacity-60" />
                </div>
                <div className="text-xs font-semibold text-foreground mb-1">当前城市暂无选址点位</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed max-w-[220px]">
                  点击上方按钮在地图上选点，或在顶部搜索框检索商圈直接添加
                </div>
              </div>
            ) : (
              points.map((point, index) => {
              const color = POINT_COLORS[index % POINT_COLORS.length];
              return (
                <div
                  key={`point-${index}`}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName !== "INPUT" && target.tagName !== "BUTTON" && !target.closest("button")) {
                      const map = mapInstanceRef.current;
                      if (map) {
                        map.panTo(wgs84ToGcj02(point.lat, point.lng));
                      }
                    }
                  }}
                  className={cn(
                    "rounded-2xl border bg-white/80 dark:bg-white/4 p-2.5 shadow-xs transition-all hover:border-primary/40 group cursor-pointer",
                    point.isPinned
                      ? "border-amber-500/30 dark:border-amber-500/25 bg-amber-500/[0.02]"
                      : "border-black/8 dark:border-white/10"
                  )}
                >
                  {/* 点位标题行 */}
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: color }}
                    />
                    <input
                      value={point.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPoints((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, name: val || "未命名点位" } : p))
                        );
                      }}
                      className="flex-1 min-w-0 bg-transparent text-xs font-bold text-foreground border border-transparent hover:border-black/10 dark:hover:border-white/10 focus:border-primary focus:bg-white dark:focus:bg-white/8 rounded-md px-1.5 py-0.5 outline-none transition-all truncate"
                    />

                    {/* 单点显隐控制：同时控制店名与辐射覆盖圈 */}
                    <button
                      type="button"
                      title={point.hideRing ? "点击显示此点位店名与覆盖圈" : "点击隐藏此点位店名与覆盖圈"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextHide = !point.hideRing;
                        setPoints((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, hideRing: nextHide } : p))
                        );
                        showToast(nextHide ? `已隐藏「${point.name}」的店名与覆盖圈` : `已恢复显示「${point.name}」的店名与覆盖圈`, "info");
                      }}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg transition-all cursor-pointer shrink-0",
                        point.hideRing
                          ? "text-muted-foreground/35 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                          : "text-primary/80 hover:text-primary hover:bg-primary/10"
                      )}
                    >
                      {point.hideRing ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>

                    {/* 钉住 / 锁定位置按钮 */}
                    <button
                      type="button"
                      title={point.isPinned ? "已钉住锁定位置（点击解锁拖拽）" : "钉住锁定位置（防误触拖动）"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextPinned = !point.isPinned;
                        setPoints((prev) =>
                          prev.map((p, i) => (i === index ? { ...p, isPinned: nextPinned } : p))
                        );
                        showToast(nextPinned ? `已钉住锁定「${point.name}」，已禁止拖动防误触` : `已解锁「${point.name}」拖动`, "info");
                      }}
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-lg transition-all cursor-pointer shrink-0",
                        point.isPinned
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs"
                          : "text-muted-foreground/50 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                      )}
                    >
                      <Pin size={12} className={cn(point.isPinned && "fill-current -rotate-45")} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPoints((prev) => prev.filter((_, i) => i !== index));
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* 详细地址 */}
                  {point.address && (
                    <div className="mt-1 rounded-md bg-black/[0.025] dark:bg-white/[0.025] border border-black/4 dark:border-white/4 px-2 py-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2 select-all font-medium">
                      {point.address}
                    </div>
                  )}

                  {/* 经纬度坐标 */}
                  <div className="mt-1 text-[10px] font-mono text-muted-foreground/75 px-0.5">
                    {point.lat.toFixed(5)}° N, {point.lng.toFixed(5)}° E
                  </div>

                  {/* 辐射半径调节 */}
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                    <span>辐射半径</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0.1}
                        max={50}
                        step={0.1}
                        value={point.r}
                        onChange={(e) => {
                          const val = Math.max(0.1, Math.min(50, Number(e.target.value) || 0.1));
                          setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, r: val } : p)));
                        }}
                        className="h-6 w-[60px] rounded-full border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/5 text-center text-xs font-bold text-foreground font-number outline-none shadow-xs"
                      />
                      <span>km</span>
                    </div>
                  </div>

                  {/* 滑块 */}
                  <input
                    type="range"
                    min={0.1}
                    max={50}
                    step={0.1}
                    value={point.r}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, r: val } : p)));
                    }}
                    className="w-full h-1 mt-1.5 mb-1 accent-primary cursor-pointer"
                  />

                  {/* 底部操作：高德导航 */}
                  <div className="flex items-center justify-end pt-1 border-t border-black/4 dark:border-white/4">
                    <a
                      href={getGaodeNavUrl(point)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-0.5 text-[10px] font-semibold transition-colors"
                    >
                      <span>高德导航</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              );
            })
          )}
          </div>

          {/* 底部导入/重置操作栏 */}
          <div className="flex items-center gap-2 pt-2.5 border-t border-black/8 dark:border-white/10">
            <label className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 text-xs font-medium transition-all active:scale-95 shadow-xs cursor-pointer">
              <Upload size={12} />
              <span>导入点位</span>
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => {
                setPoints([]);
                try {
                  localStorage.setItem(`store-location:points:${activeCityId}`, "[]");
                } catch {}
                showToast(`已清空 ${activeCity.shortName} 点位`, "success");
              }}
              className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 text-xs font-medium transition-all active:scale-95 shadow-xs cursor-pointer"
            >
              <RotateCcw size={12} />
              <span>清空重置</span>
            </button>
          </div>
        </aside>

        {/* 侧栏收起时：贴在侧栏边缘的展开图标按钮（不再占用地图工具栏） */}
        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(false)}
            title="展开点位面板"
            className="absolute left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-xl border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 text-foreground shadow-md backdrop-blur-xl hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer pointer-events-auto active:scale-95"
          >
            <PanelLeftOpen size={16} className="text-primary" />
          </button>
        )}

        {/* 右侧地图区 */}
        <section className="relative flex-1 min-h-0 min-w-0 bg-muted/20">
          {/* 地图右上角悬浮工具栏（主题胶囊与地图图层面板右对齐，远离缩放控件杜绝遮挡） */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 pointer-events-auto">
            {/* 城市底图与主题状态胶囊（改到右侧） */}
            <button
              type="button"
              onClick={() => setIsLayerPanelOpen((prev) => !prev)}
              title="点击打开地图图层与主题面板"
              className="inline-flex h-8 items-center gap-2 rounded-full border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 px-3 text-xs font-semibold shadow-md backdrop-blur-xl transition-all hover:border-primary/40 active:scale-95 cursor-pointer"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-foreground">{activeCity.name}</span>
              <span className="text-[10px] text-muted-foreground/85 font-normal">
                {basemapType === "satellite"
                  ? "卫星影像"
                  : MAP_THEMES.find((t) => t.id === currentThemeId)?.name || "矢量地图"}
              </span>
            </button>

            {/* 图层面板浮动菜单 */}
            <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsLayerPanelOpen((prev) => !prev)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 px-3.5 text-xs font-semibold shadow-md backdrop-blur-xl transition-all active:scale-95 cursor-pointer"
                >
                  <Layers size={13} className="text-primary" />
                  <span>地图与图层</span>
                </button>

                {isLayerPanelOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 p-3.5 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-150">
                    {/* 底图模式 */}
                    <div className="text-[11px] font-bold text-muted-foreground mb-2">底图模式</div>
                    <div className="flex rounded-full bg-black/5 dark:bg-white/5 p-1 gap-1 border border-black/8 dark:border-white/8">
                      <button
                        type="button"
                        onClick={() => handleBasemapTypeChange("vector")}
                        className={cn(
                          "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
                          basemapType === "vector"
                            ? "bg-white dark:bg-white/10 text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        矢量地图
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBasemapTypeChange("satellite")}
                        className={cn(
                          "flex-1 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer",
                          basemapType === "satellite"
                            ? "bg-white dark:bg-white/10 text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        卫星影像
                      </button>
                    </div>

                    {/* 地图主题风格（仅在矢量地图下可切换） */}
                    {basemapType === "vector" && (
                      <div className="mt-3.5">
                        <div className="text-[11px] font-bold text-muted-foreground mb-2 flex items-center justify-between">
                          <span>地图主题配色</span>
                          <span className="text-[10px] font-normal text-muted-foreground/80">高德官方高清矢量</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {MAP_THEMES.map((theme) => {
                            const isSelected = currentThemeId === theme.id;
                            return (
                              <button
                                key={theme.id}
                                type="button"
                                onClick={() => handleThemeChange(theme.id)}
                                className={cn(
                                  "flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left",
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary shadow-xs"
                                    : "border-black/6 dark:border-white/6 bg-black/[0.02] dark:bg-white/[0.02] text-foreground hover:border-black/15 dark:hover:border-white/15"
                                )}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="h-3 w-3 rounded-full shrink-0 border border-black/10 dark:border-white/20 shadow-xs"
                                    style={{ backgroundColor: theme.dotColor }}
                                  />
                                  <span className="truncate text-[11px]">{theme.name}</span>
                                </div>
                                {isSelected && <Check size={12} className="shrink-0 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 标记图标风格 */}
                    <div className="text-[11px] font-bold text-muted-foreground mt-3.5 mb-1.5 flex items-center justify-between">
                      <span>点位标记风格</span>
                      <span className="text-[10px] font-normal text-muted-foreground/80">
                        {markerIconStyle === "airbnb" ? "Airbnb 标杆胶囊" : markerIconStyle === "apple" ? "Apple 水滴徽标" : "曜石暗夜胶囊"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { key: "airbnb", label: "标杆胶囊" },
                          { key: "apple", label: "水滴图钉" },
                          { key: "dark", label: "曜石胶囊" },
                        ] as const
                      ).map((item) => {
                        const isSelected = markerIconStyle === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setMarkerIconStyle(item.key);
                              localStorage.setItem("store-location:marker-style", item.key);
                            }}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left",
                              isSelected
                                ? "border-primary bg-primary/10 text-primary shadow-xs"
                                : "border-black/6 dark:border-white/6 bg-black/[0.02] dark:bg-white/[0.02] text-foreground hover:border-black/15 dark:hover:border-white/15"
                            )}
                          >
                            <span className="text-[11px] truncate">{item.label}</span>
                            {isSelected && <Check size={11} className="shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* 叠加图层 */}
                    <div className="text-[11px] font-bold text-muted-foreground mt-3.5 mb-1.5">叠加图层</div>
                    <div className="space-y-1 text-xs">
                      <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                        <span>辐射覆盖圈</span>
                        <input
                          type="checkbox"
                          checked={showRings}
                          onChange={() => toggleLayer("rings")}
                          className="accent-primary"
                        />
                      </label>
                      <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                        <span>点位店名名牌</span>
                        <input
                          type="checkbox"
                          checked={showPointNames}
                          onChange={() => {
                            const next = !showPointNames;
                            setShowPointNames(next);
                            try {
                              localStorage.setItem("store-location:show-point-names", String(next));
                            } catch {}
                            showToast(next ? "已显示点位店名名牌" : "已隐藏点位店名名牌", "info");
                          }}
                          className="accent-primary"
                        />
                      </label>
                      <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                        <span>实时路况</span>
                        <input
                          type="checkbox"
                          checked={showTraffic}
                          onChange={() => toggleLayer("traffic")}
                          className="accent-primary"
                        />
                      </label>
                      <label className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                        <span>卫星路网标注</span>
                        <input
                          type="checkbox"
                          checked={showRoads}
                          onChange={() => toggleLayer("roads")}
                          className="accent-primary"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

          {/* 地图真实 DOM 容器 */}
          <div ref={mapContainerRef} className="h-full w-full" />

          {/* 地图加载状态/错误提示 */}
          {mapError && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 text-center bg-background/80 backdrop-blur-md">
              <div className="text-base font-bold text-foreground mb-1">地图服务暂不可用</div>
              <div className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">{mapError}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="h-8 px-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold active:scale-95 transition-all shadow-xs"
              >
                刷新重试
              </button>
            </div>
          )}


          {/* 地图底部悬浮统计卡片 */}
          <div className="absolute bottom-5 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
            <div className="inline-block rounded-full border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-md backdrop-blur-xl pointer-events-auto">
              拖动点位可实时调整位置 · 半径以公里计算
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 p-3 shadow-xl backdrop-blur-xl pointer-events-auto min-w-[240px]">
              <div className="border-r border-black/6 dark:border-white/6 pr-3">
                <span className="text-[10px] font-semibold text-muted-foreground">去重覆盖面积</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-foreground font-number">
                    {analysis.union.toFixed(1)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">km²</span>
                </div>
              </div>
              <div className="pl-1">
                <span className="text-[10px] font-semibold text-muted-foreground">范围重叠率</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-xl font-extrabold text-foreground font-number">
                    {(analysis.union ? (analysis.multi / analysis.union) * 100 : 0).toFixed(1)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 覆盖对比详情弹窗 */}
      {isAnalysisModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl rounded-[28px] border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 p-5 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-black/8 dark:border-white/10">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                  Coverage Insights
                </span>
                <h3 className="text-base font-bold text-foreground">点位覆盖对比明细</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAnalysisModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/5 transition-all active:scale-95 cursor-pointer shadow-xs"
              >
                <X size={15} />
              </button>
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-black/8 dark:border-white/10 bg-white/50 dark:bg-white/[0.02]">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/[0.02] dark:bg-white/[0.03] border-b border-black/8 dark:border-white/10 text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-2.5 px-3.5">分析点位</th>
                    <th className="py-2.5 px-3.5">辐射半径</th>
                    <th className="py-2.5 px-3.5">理论覆盖面积</th>
                    <th className="py-2.5 px-3.5">独有覆盖占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/6 dark:divide-white/6 font-medium text-foreground">
                  {points.map((p, idx) => {
                    const row = analysis.rows[idx] || { area: 0, unique: 0 };
                    const color = POINT_COLORS[idx % POINT_COLORS.length];
                    return (
                      <tr key={`comp-${idx}`} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3.5 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-bold">{p.name}</span>
                        </td>
                        <td className="py-2.5 px-3.5">{p.r} km</td>
                        <td className="py-2.5 px-3.5">{row.area.toFixed(2)} km²</td>
                        <td className="py-2.5 px-3.5 text-primary font-bold">
                          {(row.unique * 100).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
              重叠率 = 至少两个点位重复覆盖的面积 / 联合去重覆盖面积。独有覆盖占比越高，说明该点位周围无冗余重叠。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
