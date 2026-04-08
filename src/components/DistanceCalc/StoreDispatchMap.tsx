/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Navigation2,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  Trophy,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { BareAmapTest } from "@/components/DistanceCalc/BareAmapTest";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ImportModal } from "@/components/Goods/ImportModal";
import { StoreModal } from "@/components/DistanceCalc/StoreModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Shop = {
  id: string;
  name: string;
  address: string | null;
  province: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isSource: boolean;
  contactPhone: string | null;
  remark?: string | null;
};

type EditableShop = Partial<Shop>;
type TargetPoint = {
  name: string;
  location: [number, number];
};

type ImportedShopPayload = {
  id: string;
  name: string;
  address: string;
};

interface DistanceResult {
  shopId: string;
  airDist: number; // 直线距离单位为米
  rank: number; // 排名
  routeDist: number | null; // 骑行路径距离
  duration: number | null; // 骑行预计时间
  path: [number, number][]; // 路径点
}

const DEFAULT_CENTER: [number, number] = [106.5516, 29.563];
const ALL_REGIONS = "全国";
const UNKNOWN_PROVINCE = "未分省";
const UNKNOWN_CITY = "未分市";
const SHOP_IMPORT_TEMPLATE = [
  {
    门店名称: "私人订制轻奢礼品店（白云店）",
    POI_ID: "27678090",
    详细地址: "广东省广州市白云区棠祥南东街2号423房",
  },
];

function withTimeout<T>(promiseFactory: () => Promise<T>, timeoutMs = 5000, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fallback);
    }, timeoutMs);

    promiseFactory()
      .then((value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

function isTooBroadLocationName(name: string, keyword: string, areaHint: string) {
  const normalized = name.replace(/\s+/g, "");
  const rawKeyword = keyword.replace(/\s+/g, "");
  const normalizedHint = areaHint.replace(/\s+/g, "");

  if (!normalized) return true;
  if (normalized === rawKeyword) return false;
  if (rawKeyword && normalized.includes(rawKeyword)) return false;

  const broadSuffixes = ["省", "市", "区", "县"];
  const looksLikeBroadArea = broadSuffixes.some((suffix) => normalized.endsWith(suffix));

  if (!looksLikeBroadArea) return false;
  if (normalizedHint && normalized === normalizedHint) return true;
  if (normalized.length <= 8 && !normalized.includes(rawKeyword)) return true;

  return false;
}

function extractRegionParts(shop: Pick<Shop, "address" | "name" | "province" | "city">) {
  if (shop.province && shop.city) {
    return {
      province: shop.province,
      city: shop.city,
      regionLabel: [shop.province, shop.city].filter(Boolean).join(" / "),
    };
  }

  const text = `${shop.address || ""} ${shop.name || ""}`.replace(/\s+/g, "");

  const municipalityMatch = text.match(/(北京市|上海市|天津市|重庆市)/);
  if (municipalityMatch) {
    const province = municipalityMatch[1];
    const city = province;
    return {
      province,
      city,
      regionLabel: [province, city].join(" / "),
    };
  }

  const commonProvincesRegex = /(黑龙江省|内蒙古自治区|新疆维吾尔自治区|宁夏回族自治区|广西壮族自治区|香港特别行政区|澳门特别行政区|[\u4e00-\u9fa5]{2,3}?(?:省|自治区|特别行政区|省份))/;
  const provinceMatch = text.match(commonProvincesRegex);

  let province = provinceMatch?.[1] || UNKNOWN_PROVINCE;
  let textAfterProvince = text;

  if (!provinceMatch) {
    const shortProvinces = [
      "广东", "山东", "河南", "四川", "江苏", "河北", "湖南", "安徽", "湖北", "浙江", "广西", "云南", "江西", "辽宁", "福建", "陕西", "黑龙江", "山西", "贵州", "吉林", "甘肃", "海南", "青海", "台湾", "西藏", "宁夏", "新疆", "内蒙"
    ];
    for (const sp of shortProvinces) {
      if (text.startsWith(sp)) {
        province = sp.includes("内蒙") ? "内蒙古自治区" : (sp.length === 2 ? sp + (sp === "西藏" ? "" : "省") : sp);
        if (sp === "广东") province = "广东省";
        if (sp === "山东") province = "山东省";
        if (sp === "河南") province = "河南省";
        if (sp === "四川") province = "四川省";
        if (sp === "江苏") province = "江苏省";
        if (sp === "河北") province = "河北省";
        if (sp === "湖南") province = "湖南省";
        if (sp === "安徽") province = "安徽省";
        if (sp === "湖北") province = "湖北省";
        if (sp === "浙江") province = "浙江省";
        if (sp === "云南") province = "云南省";
        if (sp === "江西") province = "江西省";
        if (sp === "辽宁") province = "辽宁省";
        if (sp === "福建") province = "福建省";
        if (sp === "陕西") province = "陕西省";
        if (sp === "吉林") province = "吉林省";
        if (sp === "山西") province = "山西省";
        if (sp === "贵州") province = "贵州省";
        if (sp === "黑龙江") province = "黑龙江省";
        if (sp === "广西") province = "广西壮族自治区";
        if (sp === "宁夏") province = "宁夏回族自治区";
        if (sp === "新疆") province = "新疆维吾尔自治区";

        textAfterProvince = text.slice(sp.length);
        break;
      }
    }
  } else {
    textAfterProvince = text.slice((provinceMatch.index || 0) + provinceMatch[1].length);
  }

  const cityMatch = textAfterProvince.match(/([\u4e00-\u9fa5]{2,6}?(?:市|州|地区|盟|特别行政区))/);
  let city = cityMatch?.[1] || UNKNOWN_CITY;

  if (!cityMatch && province !== UNKNOWN_PROVINCE) {
    const commonCities = ["广州", "深圳", "成都", "杭州", "武汉", "西安", "南京", "长沙", "郑州", "福州", "济南", "沈阳", "昆明", "南宁", "南昌", "合肥", "筑", "贵阳", "海口", "石家庄", "太原", "哈尔滨", "长春", "兰州", "西宁", "银川", "拉萨", "呼和浩特", "乌鲁木齐"];
    for (const sc of commonCities) {
      if (textAfterProvince.startsWith(sc)) {
        city = sc + (sc.length === 2 ? "市" : "");
        break;
      }
    }
  }

  return {
    province,
    city,
    regionLabel: [province, city].filter((v) => v && v !== UNKNOWN_PROVINCE && v !== UNKNOWN_CITY).join(" / ") || "未分类",
  };
}

// 注入地图标记悬停样式的样式表 - 移出组件外部以避免重复注入
const MARKER_STYLES = `
  .marker-wrapper .marker-label {
    opacity: 0;
    transform: translateY(5px);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }
  .marker-wrapper:hover .marker-pin,
  .marker-wrapper.active .marker-pin {
    transform: scale(1.2) translateY(-2px);
    filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.6));
    z-index: 100;
  }
  .marker-wrapper:hover .marker-label,
  .marker-wrapper.active .marker-label {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .marker-pin {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  /* 目的地 Marker 专用样式 */
  .target-marker-wrapper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 0;
    height: 0;
  }
  .target-marker-label {
    position: absolute;
    bottom: 20px;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(15, 23, 42, 0.82);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    padding: 5px 10px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    z-index: 10;
  }
  .target-marker-label::after {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid rgba(15, 23, 42, 0.82);
  }
  .target-dot {
    width: 12px;
    height: 12px;
    background: #3b82f6;
    border: 2.5px solid white;
    border-radius: 50%;
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
    position: relative;
    z-index: 5;
  }
  .target-dot::before {
    content: '';
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border: 2px solid #3b82f6;
    border-radius: 50%;
    animation: target-pulse 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
  }
  @keyframes target-pulse {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(2.8); opacity: 0; }
  }
  @keyframes target-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
`;

function simplifyShopName(name: string) {
  if (!name) return "";
  // 1. 优先提取括号内的内容（如：哈尔滨店）
  const match = name.match(/[\(（](.*)[\)）]$/);
  if (match && match[1]) return match[1];

  // 2. 极其激进的切割：只要不是中文、字母或数字，统统作为分隔符
  const parts = name
    .replace(/^私人订制轻奢礼品店/, "")
    .split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/)
    .filter(Boolean);

  const lastPart = parts.pop() || "";

  // 3. 如果切割后最后一段只是“店”一个字，尝试合并前一段（例如：成华+店）
  if (lastPart === "店" && parts.length > 0) {
    return parts.pop() + lastPart;
  }

  return lastPart || name;
}

export function StoreDispatchMap({
  initialStores = [],
}: {
  initialStores?: Shop[];
}) {
  const { showToast } = useToast();
  const mapRef = useRef<any>(null);
  const AMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const targetMarkerRef = useRef<any>(null);
  const pathRef = useRef<any>(null);
  const spiderLinesRef = useRef<any[]>([]);
  const spiderLabelsRef = useRef<any[]>([]);
  const geocoderRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const ridingRef = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);

  const [shops, setShops] = useState<Shop[]>(initialStores);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportingShops, setIsImportingShops] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [shopSearch, setShopSearch] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetPoint, setTargetPoint] = useState<TargetPoint | null>(null);
  const [results, setResults] = useState<DistanceResult[]>([]);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchingTarget, setIsSearchingTarget] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("可直接解析地址并预览最近店铺。");
  const [activeProvince, setActiveProvince] = useState<string>(ALL_REGIONS);
  const [activeCity, setActiveCity] = useState<string>(ALL_REGIONS);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<"shops" | "results">("shops");
  const [mapTheme, setMapTheme] = useState<string>("darkblue");
  
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<EditableShop | null>(null);

  const MAP_THEMES = [
    { id: "normal", label: "标准", color: "bg-[#2b85e4]" },
    { id: "dark", label: "幻影黑", color: "bg-[#1f1f1f]" },
    { id: "light", label: "月光银", color: "bg-[#e0e0e0]" },
    { id: "darkblue", label: "极夜蓝", color: "bg-[#001630]" },
    { id: "macaron", label: "马卡龙", color: "bg-[#f5c4ce]" },
  ];

  // 注入地图标记悬停样式的样式表
  const markerStyles = MARKER_STYLES;

  const locationTree = useMemo(() => {
    const provinceMap = new Map<string, Set<string>>();

    shops.forEach((shop) => {
      const { province, city } = extractRegionParts(shop);
      if (province === UNKNOWN_PROVINCE || city === UNKNOWN_CITY) return;
      if (!provinceMap.has(province)) provinceMap.set(province, new Set());
      provinceMap.get(province)!.add(city);
    });

    return provinceMap;
  }, [shops]);

  useEffect(() => {
    if (!activeProvince) {
      setActiveProvince(ALL_REGIONS);
    }
    if (!activeCity) {
      setActiveCity(ALL_REGIONS);
    }
  }, [activeCity, activeProvince]);

  const provinceOptions = useMemo(
    () => [ALL_REGIONS, ...Array.from(locationTree.keys()).sort((a, b) => a.localeCompare(b, "zh-CN"))],
    [locationTree]
  );

  const provinceSelectOptions = useMemo(
    () => provinceOptions.map((province) => ({ value: province, label: province })),
    [provinceOptions]
  );

  const cityOptions = useMemo(() => {
    if (!activeProvince || activeProvince === ALL_REGIONS) return [ALL_REGIONS];
    return Array.from(locationTree.get(activeProvince) || []).sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );
  }, [activeProvince, locationTree]);

  const citySelectOptions = useMemo(
    () => cityOptions.map((city) => ({ value: city, label: city })),
    [cityOptions]
  );

  useEffect(() => {
    if (activeProvince === ALL_REGIONS) {
      if (activeCity !== ALL_REGIONS) {
        setActiveCity(ALL_REGIONS);
      }
      return;
    }

    if (!cityOptions.length) {
      if (activeCity !== "") {
        setActiveCity("");
      }
      return;
    }

    if (!cityOptions.includes(activeCity)) {
      setActiveCity(cityOptions[0]);
    }
  }, [activeCity, activeProvince, cityOptions]);

  const cityScopedStores = useMemo(() => {
    return shops.filter((shop) => {
      const parts = extractRegionParts(shop);
      // 选了具体省份时，才排除省份未知的店铺
      if (activeProvince && activeProvince !== ALL_REGIONS) {
        if (parts.province === UNKNOWN_PROVINCE || parts.province !== activeProvince) return false;
      }
      // 选了具体城市时，才排除城市未知的店铺
      if (activeCity && activeCity !== ALL_REGIONS) {
        if (parts.city === UNKNOWN_CITY || parts.city !== activeCity) return false;
      }
      return true;
    });
  }, [activeCity, activeProvince, shops]);

  useEffect(() => {
    if (!cityScopedStores.length) {
      setTargetPoint(null);
      setResults([]);
      setTargetQuery("");
      setSearchFeedback("当前地区暂无门店，请先切换省市。");
    } else {
      // 如果有门店，清除掉之前的错误提示
      setSearchFeedback("");
    }
  }, [activeCity, activeProvince, cityScopedStores]);

  const activeRegionKeyword = useMemo(
    () => [activeProvince, activeCity].filter(Boolean).join(""),
    [activeCity, activeProvince]
  );

  const filteredShops = useMemo(() => {
    const keyword = shopSearch.trim().toLowerCase();
    if (!keyword) return cityScopedStores;
    return cityScopedStores.filter((shop) =>
      [shop.name, shop.address, shop.contactPhone].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      )
    );
  }, [cityScopedStores, shopSearch]);

  const currentCityStores = useMemo(() => filteredShops, [filteredShops]);
  const regionCenter = useMemo<[number, number] | null>(() => {
    const located = cityScopedStores.filter(
      (shop) => typeof shop.longitude === "number" && typeof shop.latitude === "number"
    );
    if (!located.length) return null;
    const totals = located.reduce(
      (acc, shop) => {
        acc.lng += shop.longitude as number;
        acc.lat += shop.latitude as number;
        return acc;
      },
      { lng: 0, lat: 0 }
    );
    return [totals.lng / located.length, totals.lat / located.length];
  }, [cityScopedStores]);

  const fetchShops = useCallback(async () => {
    try {
      const res = await fetch("/api/shops");
      if (!res.ok) throw new Error("fetch shops failed");
      const data = await res.json();
      setShops(Array.isArray(data.shops) ? data.shops : []);
    } catch (error) {
      console.error("Failed to fetch shops:", error);
      showToast("加载店铺失败", "error");
    }
  }, [showToast]);

  useEffect(() => {
    void fetchShops();
  }, [fetchShops]);

  const clearMarkers = useCallback(() => {
    if (labelsLayerRef.current) {
      labelsLayerRef.current.clear();
    }
    if (mapRef.current && markersRef.current.length) {
      mapRef.current.remove(markersRef.current);
    }
    markersRef.current = [];
  }, []);

  const clearTargetArtifacts = useCallback(() => {
    if (mapRef.current && targetMarkerRef.current) {
      mapRef.current.remove(targetMarkerRef.current);
    }
    if (mapRef.current && pathRef.current) {
      mapRef.current.remove(pathRef.current);
    }
    if (mapRef.current && spiderLinesRef.current.length) {
      mapRef.current.remove(spiderLinesRef.current);
    }
    if (mapRef.current && spiderLabelsRef.current.length) {
      mapRef.current.remove(spiderLabelsRef.current);
    }
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
    targetMarkerRef.current = null;
    pathRef.current = null;
    spiderLinesRef.current = [];
    spiderLabelsRef.current = [];
  }, []);

  const ensureRidingService = useCallback(async () => {
    if (ridingRef.current) return ridingRef.current;

    const AMap = AMapRef.current;
    if (!AMap) throw new Error("地图服务尚未就绪");

    await new Promise<void>((resolve) => {
      if (typeof AMap.plugin !== "function") {
        resolve();
        return;
      }
      AMap.plugin(["AMap.Riding"], () => resolve());
    });

    if (typeof AMap.Riding !== "function") {
      return null;
    }

    ridingRef.current = new AMap.Riding({ map: null, hideMarkers: true });
    return ridingRef.current;
  }, []);

  const handlePreviewResult = useCallback(async (result: DistanceResult) => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    const matchedShop = shops.find((shop) => shop.id === result.shopId);
    if (!map || !AMap || !matchedShop?.longitude || !matchedShop?.latitude || !targetPoint) return;

    // 构造高级预览气泡 (InfoWindow)
    const distStr = result.routeDist != null ? `${(result.routeDist / 1000).toFixed(2)}km` : `${(result.airDist / 1000).toFixed(2)}km (直线)`;
    const timeStr = result.duration != null ? `${Math.ceil(result.duration / 60)}分钟` : "--";

    const infoContent = `
      <div style="
        padding: 14px;
        background: rgba(15, 23, 42, 0.96);
        color: #fff;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 12px 32px rgba(0,0,0,0.6);
        backdrop-filter: blur(12px);
        min-width: 200px;
        pointer-events: none;
      ">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
          <span style="background: ${result.rank === 1 ? "#f97316" : "#3b82f6"}; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 6px; font-size: 11px; font-weight: 900;">${result.rank}</span>
          <span style="font-weight: 800; font-size: 14px; letter-spacing: -0.01em;">${matchedShop.name}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 600; text-transform: uppercase;">配送距离</span>
            <span style="font-size: 14px; font-weight: 800; color: #60a5fa;">${distStr}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: rgba(255,255,255,0.5); font-weight: 600; text-transform: uppercase;">预估时长</span>
            <span style="font-size: 14px; font-weight: 800; color: #fbbf24;">${timeStr}</span>
          </div>
        </div>
      </div>
    `;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new AMap.InfoWindow({
        isCustom: true,
        autoMove: true,
        offset: new AMap.Pixel(0, -45), // 确保悬浮在大头针上方
      });
    }

    infoWindowRef.current.setContent(infoContent);
    infoWindowRef.current.open(map, [matchedShop.longitude, matchedShop.latitude]);

    // 不进行全局清理，保留背景辐射线和目的地 Marker
    if (pathRef.current) {
      map.remove(pathRef.current);
    }

    // 先用直线路径绘制虚线，让用户有即时反馈
    const tempPolyline = new AMap.Polyline({
      path: result.path,
      strokeColor: "#2563eb",
      strokeOpacity: 0.6,
      strokeWeight: 5,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 70, // 提升层级，确保在全城信号网之上
      strokeStyle: "dashed",
    });
    pathRef.current = tempPolyline;
    map.add(tempPolyline);
    map.setFitView([tempPolyline], false, [90, 90, 90, 90]);

    // 如果还没有实际路线，调用 API 计算
    if (result.routeDist == null) {
      try {
        const riding = await ensureRidingService();
        if (!riding) return;
        riding.search(
          [matchedShop.longitude, matchedShop.latitude],
          targetPoint.location,
          (status: string, rideResult: any) => {
            if (status !== "complete" || !rideResult?.routes?.length) return;
            const route = rideResult.routes[0];
            const routePath = route.rides?.flatMap((ride: any) =>
              ride.path.map((point: any) => [point.lng, point.lat] as [number, number])
            );
            const resolvedPath =
              routePath?.length
                ? routePath
                : [[matchedShop.longitude as number, matchedShop.latitude as number], targetPoint.location];

            // 更新结果数据（显示实际距离/时间）
            setResults((current) =>
              current.map((item) =>
                item.shopId === matchedShop.id
                  ? { ...item, routeDist: route.distance ?? null, duration: route.time ?? null, path: resolvedPath }
                  : item
              )
            );

            // 更新地图路线为实线
            if (mapRef.current && pathRef.current) {
              mapRef.current.remove(pathRef.current);
              const realPolyline = new AMap.Polyline({
                path: resolvedPath,
                strokeColor: "#2563eb",
                strokeOpacity: 0.9,
                strokeWeight: 6,
                lineJoin: "round",
                lineCap: "round",
                zIndex: 70, // 确保实线盖在虚线辐射网之上
                strokeStyle: "solid",
              });
              pathRef.current = realPolyline;
              mapRef.current.add(realPolyline);
              mapRef.current.setFitView([realPolyline], false, [90, 90, 90, 90]);
            }
          }
        );
      } catch (error) {
        console.error("Resolve riding route failed:", error);
      }
    } else {
      // 如果已经有路线数据了，直接绘制实线
      if (pathRef.current && map) {
        map.remove(pathRef.current);
        const realPolyline = new AMap.Polyline({
          path: result.path,
          strokeColor: "#2563eb",
          strokeOpacity: 0.9,
          strokeWeight: 6,
          lineJoin: "round",
          lineCap: "round",
          zIndex: 70, // 确保实线盖在虚线辐射网之上
          strokeStyle: "solid",
        });
        pathRef.current = realPolyline;
        map.add(realPolyline);
        map.setFitView([realPolyline], false, [90, 90, 90, 90]);
      }
    }
  }, [ensureRidingService, shops, targetPoint]);

  const drawShopMarkers = useCallback(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) return;

    clearMarkers();

    // 如果还没有 LabelsLayer，初始化一个
    if (!labelsLayerRef.current) {
      labelsLayerRef.current = new AMap.LabelsLayer({
        zooms: [3, 20],
        zIndex: 1000,
        collision: false, // 门店名称较短，关闭碰撞检测以便全部显示
        animation: true,
      });
      map.add(labelsLayerRef.current);
    }

    const labelMarkers = cityScopedStores
      .filter((shop) => shop.longitude && shop.latitude)
      .map((shop) => {
        const isActive = activeShopId === shop.id;
        const resultIndex = results && results.length > 0 ? results.findIndex(r => r.shopId === shop.id) : -1;
        const rank = resultIndex !== -1 ? resultIndex + 1 : null;
        const isTop5 = rank !== null && rank <= 5;

        let bubbleBg = "rgba(17,24,39,0.95)";
        if (isTop5) {
          bubbleBg = rank === 1 ? "#f97316" : "#3b82f6";
        } else if (isActive) {
          bubbleBg = "#2563eb";
        }

        // 使用 LabelMarker 以获得更高性能
        const labelMarker = new AMap.LabelMarker({
          name: shop.name,
          position: [shop.longitude, shop.latitude],
          zIndex: isTop5 ? 200 : (isActive ? 180 : 100),
          rank: isTop5 ? 10 : 1, // LabelsLayer 的权值
          // 仍然使用 HTML Content 以保持细腻的视觉效果，但在 LabelsLayer 中它的性能表现优于独立 Marker
          content: `
            <div class="marker-wrapper ${isTop5 ? "is-top" : ""} ${isActive ? "active" : ""}" style="position: relative;">
              ${(targetPoint && isTop5) || isActive ? `
              <div class="marker-label" style="
                position: absolute;
                bottom: 34px;
                left: 50%;
                transform: translateX(-50%);
                padding: 4px 10px;
                background: ${bubbleBg};
                color: #fff;
                font-size: ${isTop5 ? "12px" : "11px"};
                font-weight: ${isTop5 ? "800" : "600"};
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.25);
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                white-space: nowrap;
                display: flex !important;
                opacity: 1 !important;
                visibility: visible !important;
                align-items: center;
                gap: 5px;
                z-index: 2;
                pointer-events: none;
                ${isTop5 ? "animation: bounce-subtle 2s infinite" : ""}
              ">
                ${rank ? `<span style="background: rgba(255,255,255,0.25); width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 10px;">${rank}</span>` : ""}
                ${simplifyShopName(shop.name)}
              </div>` : ""}
              <svg class="marker-pin" width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg" 
                style="position: absolute; top: -28px; left: -11px; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4)); z-index: 1; transition: transform 0.2s;">
                <path d="M11 28C11 28 22 17.5 22 11C22 4.92487 17.0751 0 11 0C4.92487 0 0 4.92487 0 11C0 17.5 11 28 11 28Z" fill="${isActive || rank === 1 ? "#f97316" : (isTop5 ? "#3b82f6" : "#4b5563")}" fill-opacity="1"/>
                <circle cx="11" cy="11" r="5" fill="white"/>
              </svg>
            </div>
          `,
        });

        labelMarker.on("click", () => {
          setActiveShopId(shop.id);
          const result = results && results.length > 0 ? results.find(r => r.shopId === shop.id) : null;
          if (result) {
            handlePreviewResult(result);
          } else if (shop.longitude && shop.latitude) {
            map.setZoomAndCenter(15, [shop.longitude, shop.latitude]);
          }
        });

        return labelMarker;
      });

    labelsLayerRef.current.add(labelMarkers);
    
    // 如果是由于搜索结果导致的重绘，不改变视角，因为 handleResolveTarget 会处理视角
    if (!targetPoint && labelMarkers.length) {
      map.setFitView(labelMarkers, false, [80, 80, 80, 80]);
    } else if (!labelMarkers.length && !targetPoint) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(11);
    }
  }, [activeShopId, cityScopedStores, clearMarkers, targetPoint, results, handlePreviewResult]);

  useEffect(() => {
    // 使用 requestAnimationFrame 略微延迟渲染，避免交互卡顿
    const timer = requestAnimationFrame(() => {
      drawShopMarkers();
    });
    return () => cancelAnimationFrame(timer);
  }, [drawShopMarkers]);

  const handleMapReady = useCallback(({ map, AMap }: { map: any; AMap: any }) => {
    mapRef.current = map;
    AMapRef.current = AMap;
    drawShopMarkers();
  }, [drawShopMarkers]);

  const handleMapDestroy = useCallback(() => {
    clearMarkers();
    clearTargetArtifacts();
    mapRef.current = null;
    AMapRef.current = null;
    geocoderRef.current = null;
    ridingRef.current = null;
    labelsLayerRef.current = null;
  }, [clearMarkers, clearTargetArtifacts]);


  useEffect(() => {
    if (!targetPoint) return;

    const map = mapRef.current;
    if (!map) return;

    if (markersRef.current.length) {
      map.setFitView(markersRef.current, false, [80, 80, 80, 80]);
    } else if (regionCenter) {
      map.setZoomAndCenter(12, regionCenter);
    }
  }, [regionCenter, targetPoint]);

  const ensureSearchServices = useCallback(async () => {
    const AMap = AMapRef.current;
    if (!AMap) throw new Error("地图服务尚未就绪");

    await new Promise<void>((resolve) => {
      if (typeof AMap.plugin !== "function") {
        resolve();
        return;
      }
      AMap.plugin(["AMap.Geocoder", "AMap.PlaceSearch"], () => resolve());
    });

    if (!geocoderRef.current) {
      if (typeof AMap.Geocoder !== "function") {
        throw new Error("高德地理编码服务不可用");
      }
      geocoderRef.current = new AMap.Geocoder();
    }

    if (!placeSearchRef.current && typeof AMap.PlaceSearch === "function") {
      placeSearchRef.current = new AMap.PlaceSearch({
        pageSize: 5,
        pageIndex: 1,
        city: "全国",
        citylimit: false,
      });
    }

    return {
      geocoder: geocoderRef.current,
      placeSearch: placeSearchRef.current,
    };
  }, []);

  const resolveShopCoordinates = useCallback(
    async (keyword: string) => {
      const { geocoder, placeSearch } = await ensureSearchServices();

      const cleanKeyword = keyword
        .replace(/\(.*\)/g, "")
        .replace(/（.*）/g, "")
        .replace(/\d+房$/g, "")
        .replace(/\d+号$/g, "")
        .trim();

      const geocoderMatch = await withTimeout(
        () =>
          new Promise<{ location: [number, number]; components: any } | null>((resolve) => {
            geocoder.getLocation(keyword, (status: string, result: any) => {
              if (status === "complete" && result?.geocodes?.length) {
                const first = result.geocodes[0];
                resolve({
                  location: [first.location.lng, first.location.lat],
                  components: first.addressComponent,
                });
                return;
              }
              resolve(null);
            });
          }),
        4000,
        null
      );

      if (geocoderMatch) return geocoderMatch;

      const cleanedMatch =
        cleanKeyword !== keyword
          ? await withTimeout(
              () =>
                new Promise<{ location: [number, number]; components: any } | null>((resolve) => {
                  geocoder.getLocation(cleanKeyword, (status: string, result: any) => {
                    if (status === "complete" && result?.geocodes?.length) {
                      const first = result.geocodes[0];
                      resolve({
                        location: [first.location.lng, first.location.lat],
                        components: first.addressComponent,
                      });
                      return;
                    }
                    resolve(null);
                  });
                }),
              4000,
              null
            )
          : null;

      if (cleanedMatch) return cleanedMatch;

      if (!placeSearch) return null;

      return withTimeout(
        () =>
          new Promise<{ location: [number, number]; components: any } | null>((resolve) => {
            placeSearch.search(keyword, (status: string, result: any) => {
              if (status === "complete" && result?.poiList?.pois?.length) {
                const poi = result.poiList.pois[0];
                if (poi?.location) {
                  resolve({
                    location: [poi.location.lng, poi.location.lat],
                    components: {
                      province: poi.pname,
                      city: poi.cityname,
                      adcode: poi.adcode,
                    },
                  });
                  return;
                }
              }
              resolve(null);
            });
          }),
        4000,
        null
      );
    },
    [ensureSearchServices]
  );

  const handleLocateShop = useCallback(async (shop: Shop) => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) {
      showToast("地图尚未就绪", "info");
      return;
    }

    if (typeof shop.longitude === "number" && typeof shop.latitude === "number") {
      map.setZoomAndCenter(14, [shop.longitude, shop.latitude]);
      return;
    }

    const keyword = String(shop.address || shop.name || "").trim();
    if (!keyword) {
      showToast("该店铺缺少可定位地址", "info");
      return;
    }

    try {
      showToast("正在解析店铺位置...", "info");
      const matched = await resolveShopCoordinates(keyword);

      if (!matched) {
        showToast("这个地址暂时解析不到坐标", "error");
        return;
      }

      const { location, components } = matched;

      const res = await fetch(`/api/shops/${shop.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: shop.name,
          address: shop.address,
          province: components?.province || null,
          city: (typeof components?.city === "string" ? components.city : components?.province) || null,
          latitude: location[1],
          longitude: location[0],
          isSource: shop.isSource,
          contactPhone: shop.contactPhone,
          remark: shop.remark,
        }),
      });

      if (!res.ok) {
        throw new Error("保存店铺坐标失败");
      }

      await fetchShops();
      map.setZoomAndCenter(14, location);
      showToast("店铺已自动定位", "success");
    } catch (error) {
      console.error("Failed to locate shop:", error);
      showToast("店铺定位失败", "error");
    }
  }, [fetchShops, resolveShopCoordinates, showToast]);

  const handleResolveTarget = useCallback(async () => {
    const keyword = targetQuery.trim();
    if (!keyword) {
      setTargetPoint(null);
      setResults([]);
      setSearchFeedback("请先选地区，再搜索同城目的地。");
      clearTargetArtifacts();
      drawShopMarkers();
      return;
    }

    if (!activeProvince || !activeCity) {
      showToast("请先选择省市", "info");
      setSearchFeedback("请先选择省市后再搜索目的地。");
      return;
    }
    if (!cityScopedStores.length) {
      showToast("当前地区暂无可计算的店铺", "info");
      setSearchFeedback("当前地区暂无可计算的店铺。");
      return;
    }

    try {
      setIsSearchingTarget(true);
      setSearchFeedback(`正在 ${activeProvince}${activeCity} 搜索：${keyword}`);
      const { geocoder, placeSearch } = await ensureSearchServices();
      let match: TargetPoint | null = null;

      if (
        placeSearch &&
        regionCenter
      ) {
        match = await withTimeout(
          () =>
            new Promise<TargetPoint | null>((resolve) => {
              placeSearch.searchNearBy(
                keyword,
                regionCenter,
                30000,
                (status: string, result: any) => {
                  if (status === "complete" && result?.poiList?.pois?.length) {
                    const poi = result.poiList.pois[0];
                    if (poi?.location) {
                      resolve({
                        name: poi.name || keyword,
                        location: [poi.location.lng, poi.location.lat],
                      });
                      return;
                    }
                  }
                  resolve(null);
                }
              );
            }),
          4000,
          null
        );
      }

      if (!match) {
        const geocoderKeyword = activeRegionKeyword ? `${activeRegionKeyword}${keyword}` : keyword;
        const geocoderMatch = await withTimeout(
          () =>
            new Promise<TargetPoint | null>((resolve) => {
              geocoder.getLocation(geocoderKeyword, (status: string, result: any) => {
                if (status === "complete" && result?.geocodes?.length) {
                  const first = result.geocodes[0];
                  resolve({
                    name: first.formattedAddress || geocoderKeyword,
                    location: [first.location.lng, first.location.lat],
                  });
                  return;
                }

                resolve(null);
              });
            }),
          4000,
          null
        );

        if (
          geocoderMatch &&
          !isTooBroadLocationName(geocoderMatch.name, keyword, activeRegionKeyword)
        ) {
          match = geocoderMatch;
        }
      }

      if (!match && placeSearch) {
        const fallbackKeyword = activeRegionKeyword ? `${activeRegionKeyword}${keyword}` : keyword;
        match = await withTimeout(
          () =>
            new Promise<TargetPoint | null>((resolve) => {
              placeSearch.search(fallbackKeyword, (status: string, result: any) => {
                if (status === "complete" && result?.poiList?.pois?.length) {
                  const poi = result.poiList.pois[0];
                  if (poi?.location) {
                    resolve({
                      name: poi.name || fallbackKeyword,
                      location: [poi.location.lng, poi.location.lat],
                    });
                    return;
                  }
                }
                resolve(null);
              });
            }),
          4000,
          null
        );
      }

      if (!match && placeSearch) {
        match = await withTimeout(
          () =>
            new Promise<TargetPoint | null>((resolve) => {
              placeSearch.searchNearBy(
                keyword,
                DEFAULT_CENTER,
                50000,
                (status: string, result: any) => {
                  if (status === "complete" && result?.poiList?.pois?.length) {
                    const poi = result.poiList.pois[0];
                    if (poi?.location) {
                      resolve({
                        name: poi.name || keyword,
                        location: [poi.location.lng, poi.location.lat],
                      });
                      return;
                    }
                  }
                  resolve(null);
                }
              );
            }),
          4000,
          null
        );
      }

      if (!match) {
        setSearchFeedback(`在 ${activeProvince}${activeCity} 未找到“${keyword}”，请换更完整的商场名或地址。`);
        showToast("未找到该地址坐标", "error");
        return;
      }

      setTargetQuery(match.name);
      setTargetPoint(match);
      const regionLabel = activeProvince === ALL_REGIONS ? ALL_REGIONS : `${activeProvince}${activeCity}`;
      setSearchFeedback(`已在 ${regionLabel} 范围内定位：${match.name}`);
      setExpandedPanel("results");
    } catch (error) {
      console.error("Resolve target failed:", error);
      setSearchFeedback("搜索失败，请确认地图已加载完成后再试。");
      showToast("地址解析失败", "error");
    } finally {
      setIsSearchingTarget(false);
    }
  }, [activeCity, activeProvince, activeRegionKeyword, cityScopedStores.length, clearTargetArtifacts, drawShopMarkers, ensureSearchServices, regionCenter, showToast, targetQuery]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;

    if (!map || !AMap) return;

    clearTargetArtifacts();

    if (!targetPoint) {
      setResults([]);
      if (markersRef.current.length) {
        map.setFitView(markersRef.current, false, [80, 80, 80, 80]);
      } else if (regionCenter) {
        map.setZoomAndCenter(12, regionCenter);
      }
      return;
    }

    const marker = new AMap.Marker({
      position: targetPoint.location,
      zIndex: 300,
      offset: new AMap.Pixel(0, 0), // 中心对齐，样式内部已处理偏移
      content: `
        <div class="target-marker-wrapper">
          <div class="target-marker-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #60a5fa;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
            <span>${targetPoint.name}</span>
          </div>
          <div class="target-dot"></div>
        </div>
      `,
    });

    // 绘制辐射虚线及其距离标注 (Spider Lines & Labels)
    // 性能优化：仅显示距离最近的前 20 个店铺的辐射线，避免海量线段导致卡顿
    const spiderLines: any[] = [];
    const spiderLabels: any[] = [];

    // 先根据直线距离排序，取 Top 20
    const top20Shops = [...cityScopedStores]
      .filter(shop => typeof shop.longitude === "number" && typeof shop.latitude === "number")
      .sort((a, b) => {
        const distA = AMap.GeometryUtil.distance([a.longitude as number, a.latitude as number], targetPoint.location);
        const distB = AMap.GeometryUtil.distance([b.longitude as number, b.latitude as number], targetPoint.location);
        return distA - distB;
      })
      .slice(0, 20);

    top20Shops.forEach((shop) => {
      const shopPos = [shop.longitude as number, shop.latitude as number];
      const targetPos = targetPoint.location;
      
      // 创建连线
      const polyline = new AMap.Polyline({
        path: [shopPos, targetPos],
        strokeColor: "#60a5fa",
        strokeOpacity: 0.5,
        strokeWeight: 2,
        strokeStyle: "dashed",
        strokeDasharray: [10, 10],
        zIndex: 50,
        bubble: true,
      });
      spiderLines.push(polyline);
      
      // 计算直线距离
      const dist = AMap.GeometryUtil.distance(shopPos, targetPos);
      const labelText = dist > 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist)}m`;
      
      // 在中点创建距离文本
      const label = new AMap.Text({
        text: labelText,
        position: [(shopPos[0] + targetPos[0]) / 2, (shopPos[1] + targetPos[1]) / 2],
        anchor: "center",
        zIndex: 51,
        style: {
          "background-color": "rgba(2, 6, 23, 0.82)",
          "border": "1px solid rgba(148, 163, 184, 0.2)",
          "color": "#fff",
          "font-size": "11px",
          "font-weight": "800",
          "padding": "2px 5px",
          "border-radius": "4px",
          "box-shadow": "0 4px 10px rgba(0,0,0,0.4)",
          "pointer-events": "none",
        },
      });
      spiderLabels.push(label);
    });

    spiderLinesRef.current = spiderLines;
    spiderLabelsRef.current = spiderLabels;
    map.add(spiderLines);
    map.add(spiderLabels);

    targetMarkerRef.current = marker;
    map.add(marker);

    const nextResults: DistanceResult[] = cityScopedStores
      .filter(
        (shop) =>
          typeof shop.longitude === "number" &&
          typeof shop.latitude === "number"
      )
      .map((shop) => ({
        shopId: shop.id,
        airDist: Math.round(
          AMap.GeometryUtil.distance([shop.longitude as number, shop.latitude as number], targetPoint.location)
        ),
        rank: 0,
        routeDist: null,
        duration: null,
        path: [
          [shop.longitude as number, shop.latitude as number] as [number, number],
          targetPoint.location as [number, number],
        ],
      }))
      .sort((a, b) => a.airDist - b.airDist)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    setResults(nextResults);

    const nearest = nextResults[0];
    if (!nearest) {
      map.setCenter(targetPoint.location);
      map.setZoom(13);
      return;
    }

    const matchedShop = shops.find((shop) => shop.id === nearest.shopId);
    if (!matchedShop?.longitude || !matchedShop?.latitude) return;

    const polyline = new AMap.Polyline({
      path: nearest.path,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 6,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 30,
      strokeStyle: nearest.routeDist ? "solid" : "dashed",
    });

    pathRef.current = polyline;
    map.add(polyline);
    map.setFitView([polyline, marker], false, [90, 90, 90, 90]);
    void (async () => {
      try {
        const riding = await ensureRidingService();
        if (!riding || !matchedShop?.longitude || !matchedShop?.latitude) return;

        riding.search(
          [matchedShop.longitude, matchedShop.latitude],
          targetPoint.location,
          (status: string, result: any) => {
            if (status !== "complete" || !result?.routes?.length) return;

            const route = result.routes[0];
            const routePath = route.rides?.flatMap((ride: any) =>
              ride.path.map((point: any) => [point.lng, point.lat] as [number, number])
            );

            const resolvedPath =
              routePath && routePath.length
                ? routePath
                : [[matchedShop.longitude as number, matchedShop.latitude as number], targetPoint.location];

            setResults((current) =>
              current.map((item) =>
                item.shopId === matchedShop.id
                  ? {
                      ...item,
                      routeDist: route.distance ?? null,
                      duration: route.time ?? null,
                      path: resolvedPath,
                    }
                  : item
              )
            );

            if (pathRef.current && mapRef.current) {
              mapRef.current.remove(pathRef.current);
              const refreshed = new AMap.Polyline({
                path: resolvedPath,
                strokeColor: "#2563eb",
                strokeOpacity: 0.9,
                strokeWeight: 6,
                lineJoin: "round",
                lineCap: "round",
                zIndex: 30,
                strokeStyle: "solid",
              });
              pathRef.current = refreshed;
              mapRef.current.add(refreshed);
              mapRef.current.setFitView([refreshed, marker], false, [90, 90, 90, 90]);
            }
          }
        );
      } catch (error) {
        console.error("Resolve riding route failed:", error);
      }
    })();
  }, [cityScopedStores, clearTargetArtifacts, ensureRidingService, regionCenter, shops, targetPoint]);

  const handleImportShops = useCallback(
    async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
      const importedRows = Array.isArray(rows) ? rows : [];
      if (!importedRows.length) {
        showToast("导入文件里没有可用数据", "info");
        return;
      }

      setIsImportingShops(true);
      setImportProgress(null);
      try {
        const res = await fetch("/api/shops/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shops: importedRows }),
        });

        const result = await res.json();
        if (!res.ok) {
          throw new Error(result.error || "店铺导入失败");
        }

        const createdShops = Array.isArray(result.shops) ? (result.shops as ImportedShopPayload[]) : [];
        let autoLocated = 0;

        setImportProgress({ current: 0, total: createdShops.length });

        for (const shop of createdShops) {
          const keyword = String(shop.address || shop.name || "").trim();
          if (!keyword) {
            setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
            continue;
          }

          const matched = await resolveShopCoordinates(keyword);
          if (!matched) {
            setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
            continue;
          }

          const { location, components } = matched;

          const updateRes = await fetch(`/api/shops/${shop.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: shop.name,
              address: shop.address,
              province: components?.province || null,
              city: (typeof components?.city === "string" ? components.city : components?.province) || null,
              latitude: location[1],
              longitude: location[0],
              isSource: true,
            }),
          });

          if (updateRes.ok) {
            autoLocated += 1;
          }
          setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
        }

        await fetchShops();
        showToast(
          `导入完成：新增 ${result.created ?? 0} 条，自动定位 ${autoLocated} 条，跳过 ${result.skipped ?? 0} 条`,
          "success"
        );
      } catch (error) {
        console.error("Failed to import shops:", error);
        showToast(error instanceof Error ? error.message : "店铺导入失败", "error");
      } finally {
        setIsImportingShops(false);
        setImportProgress(null);
      }
    },
    [fetchShops, resolveShopCoordinates, showToast]
  );

  const handleSaveShop = useCallback(async (data: EditableShop) => {
    try {
      const isEditing = !!data.id;
      const url = isEditing ? `/api/shops/${data.id}` : "/api/shops";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "保存失败");
      }

      showToast(isEditing ? "修改成功" : "新增成功", "success");
      await fetchShops();
      
      // 如果是新增，尝试自动定位
      if (!isEditing) {
        const result = await res.json();
        const newShop = result.shop;
        if (newShop) {
          handleLocateShop(newShop);
        }
      }
    } catch (error) {
      console.error("Failed to save shop:", error);
      showToast(error instanceof Error ? error.message : "保存失败", "error");
    }
  }, [fetchShops, handleLocateShop, showToast]);

  const handleDeleteShop = useCallback(async (id: string) => {
    if (!confirm("确定要删除这家店铺吗？此核销无法撤销。")) return;

    try {
      const res = await fetch(`/api/shops/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      
      showToast("删除成功", "success");
      await fetchShops();
      if (activeShopId === id) setActiveShopId(null);
    } catch (error) {
      console.error("Failed to delete shop:", error);
      showToast("删除失败", "error");
    }
  }, [activeShopId, fetchShops, showToast]);

  return (
    <>
    <div className="relative flex h-dvh w-full flex-col bg-background text-foreground md:flex-row">
      <style>{markerStyles}</style>
      <div className={cn("absolute inset-0 z-0 p-4")}>
        <BareAmapTest
          showDebug={false}
          center={DEFAULT_CENTER}
          zoom={11}
          showDefaultMarker={false}
          onReady={handleMapReady}
          onDestroy={handleMapDestroy}
          mapStyle={`amap://styles/${mapTheme}`}
          className="h-full min-h-[680px] overflow-hidden rounded-[28px] border border-border bg-white"
        />

        {/* 悬浮主题切换器 */}
        <div className="absolute right-8 top-8 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 p-1.5 backdrop-blur-md shadow-2xl">
          {MAP_THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setMapTheme(theme.id)}
              title={theme.label}
              className={cn(
                "h-6 w-6 rounded-full border border-white/20 transition-all hover:scale-110",
                theme.color,
                mapTheme === theme.id ? "ring-2 ring-primary ring-offset-2 ring-offset-black/20" : "opacity-60"
              )}
            />
          ))}
        </div>
      </div>

      {isPanelCollapsed && (
        <button
          onClick={() => setIsPanelCollapsed(false)}
          className="absolute left-6 top-6 z-30 inline-flex h-11 items-center gap-2 rounded-2xl border border-white/15 bg-black/60 px-4 text-sm font-bold text-white backdrop-blur-xl transition-all hover:bg-black/75"
          title="展开侧栏"
        >
          <ChevronRight size={16} />
          展开面板
        </button>
      )}

      <aside
        className={cn(
          "absolute inset-y-4 left-4 z-20 flex flex-col rounded-[28px] border border-white/10 bg-slate-950/88 shadow-2xl backdrop-blur-2xl transition-all",
          isPanelCollapsed ? "w-0 overflow-hidden opacity-0" : "w-[420px] opacity-100"
        )}
      >
        <div className="border-b border-white/10 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Navigation2 size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-black text-foreground">智能调货测距</h2>
              <p className="text-xs text-muted-foreground">先稳定显示地图，再逐项接回业务功能</p>
            </div>
            <button
              onClick={() => setIsPanelCollapsed(true)}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white transition-all hover:bg-black/40"
              title="收起侧栏"
            >
              <ChevronLeft size={16} />
              收起面板
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <section className="rounded-3xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-bold text-muted-foreground">地区筛选</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingShop(null);
                      setIsShopModalOpen(true);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-[11px] font-bold transition-all hover:bg-muted"
                  >
                    <Plus size={13} />
                    新增店铺
                  </button>
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    disabled={isImportingShops}
                    className="inline-flex h-8 items-center gap-1.5 rounded-2xl border border-border bg-card px-3 text-[11px] font-bold transition-all hover:bg-muted disabled:opacity-60"
                  >
                    {isImportingShops ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    导入店铺
                  </button>
                </div>
              </div>
              <div className="mb-3 text-[11px] text-muted-foreground">先选省份，再选城市</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                    省份
                  </span>
                  <CustomSelect
                    value={activeProvince}
                    options={provinceSelectOptions}
                    onChange={(nextProvince) => {
                      const nextCity =
                        nextProvince === ALL_REGIONS
                          ? ALL_REGIONS
                          : Array.from(locationTree.get(nextProvince) || []).sort((a, b) =>
                              a.localeCompare(b, "zh-CN")
                            )[0] || ALL_REGIONS;
                      setActiveProvince(nextProvince);
                      setActiveCity(nextCity);
                    }}
                    placeholder="选择省份"
                    triggerClassName="h-11 rounded-2xl border-border bg-card px-4 text-sm font-medium text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                    城市
                  </span>
                  <CustomSelect
                    value={activeCity}
                    options={citySelectOptions}
                    onChange={setActiveCity}
                    placeholder="选择城市"
                    triggerClassName="h-11 rounded-2xl border-border bg-card px-4 text-sm font-medium text-foreground"
                  />
                </label>
              </div>
              <div className="mt-4">
                <label className="mb-2 block text-xs font-bold text-muted-foreground">目标送达地址</label>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={targetQuery}
                  onChange={(event) => setTargetQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleResolveTarget();
                    }
                  }}
                  placeholder="搜索目标送达地址"
                  className="h-11 w-full rounded-2xl border border-border bg-card px-10 pr-24 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                />
                <button
                  onClick={() => void handleResolveTarget()}
                  disabled={isSearchingTarget}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-xs font-bold text-primary transition-colors hover:text-primary/80 disabled:opacity-60"
                >
                  {isSearchingTarget ? "搜索中" : "搜索"}
                </button>
                {targetQuery && (
                  <button
                    onClick={() => {
                      setTargetQuery("");
                      setTargetPoint(null);
                      setResults([]);
                      clearTargetArtifacts();
                      drawShopMarkers();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
                {searchFeedback && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <MapPin size={14} />
                    <span className="truncate">{searchFeedback}</span>
                  </div>
                )}
              </div>
            </section>

            {/* 板块 1: 本地区店铺 (可折叠) */}
            <div className={cn("flex flex-col transition-all duration-300", expandedPanel === "shops" ? "flex-1 min-h-0" : "flex-none")}>
              <button
                onClick={() => setExpandedPanel(expandedPanel === "shops" ? "results" : "shops")}
                className="flex items-center justify-between gap-3 rounded-2xl bg-background p-3.5 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">本地区店铺</h3>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {currentCityStores.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isImportingShops && importProgress && (
                    <span className="text-[10px] text-muted-foreground animate-pulse">
                      正在定位 {importProgress.current}/{importProgress.total}
                    </span>
                  )}
                  <ChevronDown size={16} className={cn("text-muted-foreground transition-transform duration-300", expandedPanel === "shops" ? "rotate-180" : "rotate-0")} />
                </div>
              </button>

              <div className={cn("grid transition-all duration-300", expandedPanel === "shops" ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 overflow-hidden")}>
                <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
                  {isImportingShops && importProgress && (
                    <div className="px-1 space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${importProgress.total > 0 ? Math.round(importProgress.current / importProgress.total * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={shopSearch}
                      onChange={(event) => setShopSearch(event.target.value)}
                      placeholder="搜索本地区店铺"
                      className="h-10 w-full rounded-xl border border-border bg-card px-9 text-sm outline-none transition-all focus:border-primary/20"
                    />
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1 pb-4">
                    {currentCityStores.map((shop) => (
                      <div key={shop.id} className="rounded-2xl border border-border bg-card p-3 transition-all hover:border-primary/20">
                        <div className="flex items-start gap-2">
                          <Store size={14} className="mt-0.5 shrink-0 text-primary" />
                          <div className="text-sm font-bold leading-snug text-foreground">{shop.name}</div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">{shop.address || "未设置地址"}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <span className={cn("rounded-full px-2 py-0.5", shop.isSource ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted")}>门店</span>
                            {shop.latitude && shop.longitude ? <span>已定位</span> : <span>待定位</span>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button 
                              onClick={() => handleLocateShop(shop)} 
                              title="定位"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                            >
                              <MapPin size={13} />
                            </button>
                            <button 
                              onClick={() => {
                                setEditingShop(shop);
                                setIsShopModalOpen(true);
                              }} 
                              title="编辑"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500 transition-all"
                            >
                              <Pencil size={13} />
                            </button>
                            <button 
                              onClick={() => handleDeleteShop(shop.id)} 
                              title="删除"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {!currentCityStores.length && <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">当前地区暂无店铺</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* 板块 2: 测距结果预览 (可折叠) */}
            <div className={cn("flex flex-col transition-all duration-300 border-t border-white/5 pt-2", expandedPanel === "results" ? "flex-1 min-h-0" : "flex-none")}>
              <button
                onClick={() => setExpandedPanel(expandedPanel === "results" ? "shops" : "results")}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl p-3.5 transition-colors",
                  results.length > 0 ? "bg-primary/5 hover:bg-primary/10" : "bg-background hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">测距对比分析</h3>
                  {results.length > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                      TOP {results.length}
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className={cn("text-muted-foreground transition-transform duration-300", expandedPanel === "results" ? "rotate-0" : "rotate-180")} />
              </button>

              <div className={cn("grid transition-all duration-300", expandedPanel === "results" ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 overflow-hidden")}>
                <div className="min-h-0 flex flex-col gap-2 overflow-hidden">
                  <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1 pb-4">
                    {results.map((result, index) => {
                      const shop = shops.find((item) => item.id === result.shopId);
                      if (!shop) return null;
                      const isTop3 = index < 3;
                      return (
                        <button
                          key={result.shopId}
                          onClick={() => handlePreviewResult(result)}
                          className={cn(
                            "w-full rounded-2xl border p-3 text-left transition-all group relative overflow-hidden",
                            index === 0
                              ? "border-primary/40 bg-primary/8"
                              : "border-border bg-card hover:border-primary/20"
                          )}
                        >
                          {isTop3 && (
                            <div className={cn(
                              "absolute right-0 top-0 h-8 w-8 text-white/10 flex items-center justify-center translate-x-1 -translate-y-1",
                              index === 0 ? "text-amber-500/20" : index === 1 ? "text-slate-400/20" : "text-orange-600/20"
                            )}>
                              <Trophy size={32} />
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={cn(
                                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black",
                                  index === 0 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                                )}>
                                  {index + 1}
                                </span>
                                <div className="truncate text-sm font-bold text-foreground">{shop.name}</div>
                              </div>
                              
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                                  <Truck size={12} className="text-primary" />
                                  {(result.routeDist ? result.routeDist / 1000 : result.airDist / 1000).toFixed(2)}km
                                </div>
                                {result.duration && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock size={12} />
                                    {Math.max(1, Math.ceil(result.duration / 60))}分钟
                                  </div>
                                )}
                                {result.routeDist && (
                                  <div className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                    实际路线
                                  </div>
                                )}
                              </div>
                            </div>
                            <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                    {!results.length && (
                      <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                        <div className="mb-2 flex justify-center text-primary/40"><Navigation size={24} /></div>
                        输入收货地址后<br />这里将自动展示最优配送方案
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
      </aside>
    </div>
    <ImportModal
      isOpen={isImportModalOpen}
      onClose={() => {
        if (!isImportingShops) {
          setIsImportModalOpen(false);
        }
      }}
      onImport={handleImportShops}
      title="导入店铺"
      description="支持 Excel 或 CSV 导入。当前优先识别“门店名称 / POI_ID / 详细地址”这类表头，名称和地址会自动入库。"
      dropzoneText="点击上传或拖拽店铺表格"
      templateData={SHOP_IMPORT_TEMPLATE}
      templateFileName="店铺导入模板.xlsx"
    />
    <StoreModal
      isOpen={isShopModalOpen}
      onClose={() => setIsShopModalOpen(false)}
      onSave={handleSaveShop}
      initialData={editingShop}
    />
    </>
  );
}
