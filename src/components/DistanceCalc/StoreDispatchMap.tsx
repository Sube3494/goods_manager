/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { BareAmapTest } from "@/components/DistanceCalc/BareAmapTest";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ImportModal } from "@/components/Goods/ImportModal";
import { StoreModal } from "@/components/DistanceCalc/StoreModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Shop = {
  id: string;
  name: string;
  externalId?: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isSource: boolean;
  contactName?: string | null;
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
  externalId?: string | null;
};

type ImportLocateFailure = {
  name: string;
  address: string;
  reason: string;
};

type PendingDeleteAction =
  | { type: "single"; shop: Shop }
  | { type: "bulk"; ids: string[] };

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
const ROUTE_CANDIDATE_LIMIT = 12;
const ROUTE_DISPLAY_LIMIT = 5;
const ROUTE_COLORS = ["#2563eb", "#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981"];
const CROSS_CITY_RADIUS_METERS = 80000;
const MAX_ROUTE_DISTANCE_METERS = 50000;
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
    transform: scale(1.14) translateY(-2px);
    filter: drop-shadow(0 10px 18px rgba(8, 47, 73, 0.35));
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
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.24);
    color: white;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 4px 10px rgba(2, 6, 23, 0.22);
    z-index: 10;
  }
  .target-marker-label::after {
    display: none;
  }
  .target-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
  }
  .target-dot::before {
    display: none;
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

function getResultDistance(result: DistanceResult) {
  return result.routeDist ?? result.airDist;
}

function getResultDistanceMeta(result: DistanceResult) {
  if (result.routeDist != null) {
    return {
      distanceText: `${(result.routeDist / 1000).toFixed(2)}km`,
      badgeText: "实际路线",
      badgeClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }

  return {
    distanceText: "计算中",
    badgeText: "等待路线",
    badgeClassName: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  };
}

function getRouteColor(index: number) {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

function getShopCoordinates(shop: Pick<Shop, "longitude" | "latitude">): [number, number] | null {
  if (typeof shop.longitude !== "number" || typeof shop.latitude !== "number") {
    return null;
  }

  return [shop.longitude, shop.latitude];
}

function getDistanceMeters(from: [number, number], to: [number, number]) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortDistanceResults(results: DistanceResult[]) {
  return [...results]
    .sort((a, b) => {
      const aHasRoute = a.routeDist != null;
      const bHasRoute = b.routeDist != null;

      if (aHasRoute !== bHasRoute) {
        return aHasRoute ? -1 : 1;
      }

      const distanceDiff = getResultDistance(a) - getResultDistance(b);
      if (distanceDiff !== 0) return distanceDiff;
      return a.airDist - b.airDist;
    })
    .map((item, idx) => ({ ...item, rank: idx + 1 }));
}

function extractRoutePath(route: any, fallbackPath: [number, number][]) {
  const routePath = route?.rides?.flatMap((ride: any) =>
    ride.path.map((point: any) => [point.lng, point.lat] as [number, number])
  );

  return routePath?.length ? routePath : fallbackPath;
}

function extractRidingResult(result: any) {
  const route = result?.routes?.[0] ?? result?.rides?.[0] ?? null;
  if (!route) return null;

  return {
    routeDist: route.distance ?? result?.distance ?? null,
    duration: route.time ?? result?.time ?? null,
    path: extractRoutePath(route, []),
  };
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
  const routePathsRef = useRef<any[]>([]);
  const spiderLinesRef = useRef<any[]>([]);
  const spiderLabelsRef = useRef<any[]>([]);
  const geocoderRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const mapInteractionHandlerRef = useRef<(() => void) | null>(null);
  const routeBatchIdRef = useRef(0);
  const lastMarkerFocusRef = useRef<{ shopId: string | null; at: number }>({ shopId: null, at: 0 });
  const resultsRef = useRef<DistanceResult[]>([]);

  const [shops, setShops] = useState<Shop[]>(initialStores);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportingShops, setIsImportingShops] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importLocateFailures, setImportLocateFailures] = useState<ImportLocateFailure[]>([]);
  const [isShopListOpen, setIsShopListOpen] = useState(false);
  const [shopSearchQuery, setShopSearchQuery] = useState("");
  const [shopLocationFilter, setShopLocationFilter] = useState<"all" | "resolved" | "pending">("all");
  const [isBulkManageMode, setIsBulkManageMode] = useState(false);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [isDeletingShops, setIsDeletingShops] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetPoint, setTargetPoint] = useState<TargetPoint | null>(null);
  const [results, setResults] = useState<DistanceResult[]>([]);
  const [isResolvingRoutes, setIsResolvingRoutes] = useState(false);
  const [isSearchingTarget, setIsSearchingTarget] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("可直接解析地址并预览最近店铺。");
  const [activeProvince, setActiveProvince] = useState<string>(ALL_REGIONS);
  const [activeCity, setActiveCity] = useState<string>(ALL_REGIONS);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);
  const [mapTheme] = useState<string>("grey");
  
  const [isShopModalOpen, setIsShopModalOpen] = useState(false);
  const [editingShop, setEditingShop] = useState<EditableShop | null>(null);

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
    resultsRef.current = results;
  }, [results]);

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

  const importButtonLabel = useMemo(() => {
    if (!isImportingShops) return "导入店铺";
    if (!importProgress || importProgress.total <= 0) return "导入店铺中...";
    return `导入中 ${Math.min(importProgress.current, importProgress.total)}/${importProgress.total}`;
  }, [importProgress, isImportingShops]);

  const searchedShops = useMemo(() => {
    const keyword = shopSearchQuery.trim().toLowerCase();
    return shops.filter((shop) => {
      const hasResolvedLocation = typeof shop.longitude === "number" && typeof shop.latitude === "number";
      const matchesLocationFilter =
        shopLocationFilter === "all" ||
        (shopLocationFilter === "resolved" && hasResolvedLocation) ||
        (shopLocationFilter === "pending" && !hasResolvedLocation);

      if (!matchesLocationFilter) return false;
      if (!keyword) return true;

      const region = extractRegionParts(shop);
      return [
        shop.name,
        shop.externalId,
        shop.address,
        region.province,
        region.city,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [shopLocationFilter, shopSearchQuery, shops]);

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
    setSelectedShopIds((prev) => prev.filter((id) => shops.some((shop) => shop.id === id)));
  }, [shops]);

  useEffect(() => {
    if (!isShopListOpen) {
      setIsBulkManageMode(false);
      setSelectedShopIds([]);
    }
  }, [isShopListOpen]);

  const provinceScopedStores = useMemo(() => {
    if (!activeProvince || activeProvince === ALL_REGIONS) return shops;

    return shops.filter((shop) => {
      const parts = extractRegionParts(shop);
      return parts.province !== UNKNOWN_PROVINCE && parts.province === activeProvince;
    });
  }, [activeProvince, shops]);

  const deliveryScopedStores = useMemo(() => {
    if (!targetPoint || !activeCity || activeCity === ALL_REGIONS) {
      return cityScopedStores;
    }

    return provinceScopedStores.filter((shop) => {
      const parts = extractRegionParts(shop);
      if (parts.city === activeCity) return true;

      const shopCoordinates = getShopCoordinates(shop);
      if (!shopCoordinates) return false;

      return getDistanceMeters(shopCoordinates, targetPoint.location) <= CROSS_CITY_RADIUS_METERS;
    });
  }, [activeCity, cityScopedStores, provinceScopedStores, targetPoint]);

  useEffect(() => {
    if (!cityScopedStores.length) {
      setTargetPoint(null);
      setResults([]);
      setTargetQuery("");
      setSearchFeedback("当前地区暂无门店，请先切换省市。");
    } else if (!targetPoint) {
      setSearchFeedback("可直接解析地址并预览最近店铺。");
    }
  }, [activeCity, activeProvince, cityScopedStores, targetPoint]);

  const activeRegionKeyword = useMemo(
    () => [activeProvince, activeCity].filter(Boolean).join(""),
    [activeCity, activeProvince]
  );

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

  const mapScopedStores = useMemo(
    () => (targetPoint ? deliveryScopedStores : cityScopedStores),
    [cityScopedStores, deliveryScopedStores, targetPoint]
  );

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
    if (mapRef.current && routePathsRef.current.length) {
      mapRef.current.remove(routePathsRef.current);
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
    routePathsRef.current = [];
    spiderLinesRef.current = [];
    spiderLabelsRef.current = [];
  }, []);

  const ensureRidingPlugin = useCallback(async () => {
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

    return true;
  }, []);

  const requestRidingRoute = useCallback(
    async (start: [number, number], end: [number, number]) => {
      const AMap = AMapRef.current;
      const pluginReady = await ensureRidingPlugin();
      if (!AMap || !pluginReady || typeof AMap.Riding !== "function") {
        return null;
      }

      const runSearch = () =>
        new Promise<Pick<DistanceResult, "routeDist" | "duration" | "path"> | null>((resolve) => {
          const riding = new AMap.Riding({ map: null, hideMarkers: true });
          riding.search(start, end, (status: string, result: any) => {
            if (status !== "complete") {
              resolve(null);
              return;
            }

            const resolved = extractRidingResult(result);
            if (!resolved) {
              resolve(null);
              return;
            }

            resolve({
              routeDist: resolved.routeDist,
              duration: resolved.duration,
              path: resolved.path.length ? resolved.path : [start, end],
            });
          });
        });

      const primaryResult = await runSearch();
      if (primaryResult) return primaryResult;

      return runSearch();
    },
    [ensureRidingPlugin]
  );

  const drawPrimaryPath = useCallback((path: [number, number][], color = "#2563eb", strokeStyle: "solid" | "dashed" = "solid") => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) return;

    if (pathRef.current) {
      map.remove(pathRef.current);
    }

    const polyline = new AMap.Polyline({
      path,
      strokeColor: color,
      strokeOpacity: strokeStyle === "solid" ? 0.9 : 0.6,
      strokeWeight: strokeStyle === "solid" ? 6 : 5,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 70,
      strokeStyle,
    });

    pathRef.current = polyline;
    map.add(polyline);

    const overlays = targetMarkerRef.current ? [polyline, targetMarkerRef.current] : [polyline];
    map.setFitView(overlays, false, [90, 90, 90, 90]);
  }, []);

  const drawRoutePaths = useCallback((resolvedResults: DistanceResult[], activeShopId?: string) => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) return;

    if (routePathsRef.current.length) {
      map.remove(routePathsRef.current);
      routePathsRef.current = [];
    }

    const secondaryPolylines = resolvedResults
      .filter((item) => item.routeDist != null && item.path.length > 1 && item.shopId !== activeShopId)
      .map((item) => {
        const routeIndex = resolvedResults.findIndex((result) => result.shopId === item.shopId);
        return (
        new AMap.Polyline({
          path: item.path,
          strokeColor: getRouteColor(routeIndex),
          strokeOpacity: 0.38,
          strokeWeight: 4,
          lineJoin: "round",
          lineCap: "round",
          zIndex: 60,
        })
      );
      });

    routePathsRef.current = secondaryPolylines;
    if (secondaryPolylines.length) {
      map.add(secondaryPolylines);
    }
  }, []);

  const resetToGlobalView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }

    const resolvedResults = results.filter((item) => item.routeDist != null);
    const bestResolved = resolvedResults[0];

    if (bestResolved) {
      drawRoutePaths(resolvedResults, bestResolved.shopId);
      drawPrimaryPath(bestResolved.path, getRouteColor(0), "solid");
    } else if (pathRef.current) {
      map.remove(pathRef.current);
      pathRef.current = null;
    }

    const overlays = targetMarkerRef.current
      ? [...markersRef.current, targetMarkerRef.current, ...routePathsRef.current, ...(pathRef.current ? [pathRef.current] : [])]
      : [...markersRef.current, ...routePathsRef.current, ...(pathRef.current ? [pathRef.current] : [])];

    if (overlays.length) {
      map.setFitView(overlays, false, [80, 80, 80, 80]);
    } else if (regionCenter) {
      map.setZoomAndCenter(12, regionCenter);
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(11);
    }
  }, [drawPrimaryPath, drawRoutePaths, regionCenter, results]);

  const closePreviewInfoWindow = useCallback(() => {
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  }, []);

  const handlePreviewResult = useCallback(async (result: DistanceResult) => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    const matchedShop = shops.find((shop) => shop.id === result.shopId);
    const shopCoordinates = matchedShop ? getShopCoordinates(matchedShop) : null;
    if (
      !map ||
      !AMap ||
      !matchedShop ||
      !shopCoordinates ||
      !targetPoint
    ) {
      return;
    }
    setActiveShopId(result.shopId);

    // 构造高级预览气泡 (InfoWindow)
    const distStr = result.routeDist != null ? `${(result.routeDist / 1000).toFixed(2)}km` : "计算中";
    const timeStr = result.duration != null ? `${Math.ceil(result.duration / 60)}分钟` : "计算中";

    const infoContent = `
      <div style="
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.94);
        color: #fff;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 10px 24px rgba(0,0,0,0.42);
        backdrop-filter: blur(10px);
        min-width: 168px;
        max-width: 196px;
        pointer-events: none;
      ">
        <div style="display: flex; align-items: center; gap: 7px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 7px;">
          <span style="background: ${result.rank === 1 ? "#f97316" : "#3b82f6"}; min-width: 18px; height: 18px; padding: 0 4px; display: flex; align-items: center; justify-content: center; border-radius: 999px; font-size: 10px; font-weight: 900;">${result.rank}</span>
          <span style="font-weight: 800; font-size: 12px; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${simplifyShopName(matchedShop.name)}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: rgba(255,255,255,0.46); font-weight: 600;">距离</span>
            <span style="font-size: 12px; font-weight: 800; color: #60a5fa;">${distStr}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: rgba(255,255,255,0.46); font-weight: 600;">时长</span>
            <span style="font-size: 12px; font-weight: 800; color: #fbbf24;">${timeStr}</span>
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
    infoWindowRef.current.open(map, shopCoordinates);
    if (result.routeDist != null) {
      const resolvedResults = resultsRef.current.filter((item) => item.routeDist != null);
      const routeIndex = Math.max(0, resolvedResults.findIndex((item) => item.shopId === result.shopId));
      drawRoutePaths(resolvedResults, result.shopId);
      drawPrimaryPath(result.path, getRouteColor(routeIndex), "solid");
    }

    // 如果还没有实际路线，调用 API 计算
    if (result.routeDist == null) {
      const activeBatchId = routeBatchIdRef.current;
      try {
        const resolvedRoute = await requestRidingRoute(shopCoordinates, targetPoint.location);
        if (activeBatchId !== routeBatchIdRef.current || !targetMarkerRef.current) return;
        if (!resolvedRoute) return;

        setResults((current) => {
          const merged = sortDistanceResults(
            current.map((item) =>
              item.shopId === matchedShop.id
                ? { ...item, ...resolvedRoute }
                : item
            )
          );
          const eligibleMerged = merged.filter(
            (item) => item.routeDist == null || item.routeDist <= MAX_ROUTE_DISTANCE_METERS
          );
          const resolvedMerged = eligibleMerged.filter((item) => item.routeDist != null);
          const routeIndex = Math.max(0, resolvedMerged.findIndex((item) => item.shopId === matchedShop.id));
          drawRoutePaths(resolvedMerged, matchedShop.id);
          if (resolvedRoute.routeDist != null && resolvedRoute.routeDist <= MAX_ROUTE_DISTANCE_METERS) {
            drawPrimaryPath(resolvedRoute.path, getRouteColor(routeIndex), "solid");
          }
          return eligibleMerged.slice(0, ROUTE_DISPLAY_LIMIT);
        });
      } catch (error) {
        console.error("Resolve riding route failed:", error);
      }
    }
  }, [drawPrimaryPath, drawRoutePaths, requestRidingRoute, shops, targetPoint]);

  const drawShopMarkers = useCallback(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) return;

    clearMarkers();

    const markers = mapScopedStores
      .filter((shop) => typeof shop.longitude === "number" && typeof shop.latitude === "number")
      .map((shop) => {
        const isActive = activeShopId === shop.id;
        const resultIndex = results && results.length > 0 ? results.findIndex(r => r.shopId === shop.id) : -1;
        const rank = resultIndex !== -1 ? resultIndex + 1 : null;
        const isTop5 = rank !== null && rank <= 5;
        const shouldShowMarkerLabel = Boolean((targetPoint && isTop5) || isActive);

        let pinFill = "#5b8def";
        if (isTop5) {
          pinFill = rank === 1 ? "#0ea5e9" : "#3b82f6";
        } else if (isActive) {
          pinFill = "#2563eb";
        }

        // AMap.Marker 支持完整 HTML content（LabelMarker 在 v2.0 中不支持 content 属性）
        const marker = new AMap.Marker({
          position: [shop.longitude, shop.latitude],
          zIndex: isTop5 ? 200 : (isActive ? 180 : 100),
          offset: new AMap.Pixel(-10, -24),
          content: `
            <div class="marker-wrapper ${isTop5 ? "is-top" : ""} ${isActive ? "active" : ""}" style="position: relative;">
              ${shouldShowMarkerLabel ? `
              <div class="marker-label" style="
                position: absolute;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                padding: 4px 8px;
                background: rgba(37, 99, 235, 0.92);
                color: #fff;
                font-size: ${isTop5 ? "12px" : "11px"};
                font-weight: ${isTop5 ? "800" : "600"};
                border-radius: 999px;
                border: 1px solid rgba(255,255,255,0.18);
                box-shadow: 0 8px 18px rgba(2,6,23,0.22);
                white-space: nowrap;
                display: flex !important;
                opacity: 1 !important;
                visibility: visible !important;
                align-items: center;
                gap: 5px;
                z-index: 2;
                pointer-events: none;
              ">
                ${rank ? `<span style="background: rgba(37,99,235,0.95); min-width: 16px; height: 16px; padding: 0 4px; display: flex; align-items: center; justify-content: center; border-radius: 999px; font-size: 10px; box-shadow: 0 6px 16px rgba(2,6,23,0.24);">${rank}</span>` : ""}
                ${simplifyShopName(shop.name)}
              </div>` : ""}
              <svg class="marker-pin" width="20" height="24" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg"
                style="filter: drop-shadow(0 6px 14px rgba(15,23,42,0.24)); transition: transform 0.2s;">
                <path d="M11 28C11 28 22 17.5 22 11C22 4.92487 17.0751 0 11 0C4.92487 0 0 4.92487 0 11C0 17.5 11 28 11 28Z" fill="${pinFill}" />
                <circle cx="11" cy="11" r="5" fill="white"/>
                <circle cx="11" cy="11" r="2.6" fill="rgba(15,23,42,0.16)"/>
              </svg>
            </div>
          `,
        });

        marker.on("click", () => {
          const now = Date.now();
          const isRepeatToggle =
            activeShopId === shop.id &&
            lastMarkerFocusRef.current.shopId === shop.id &&
            now - lastMarkerFocusRef.current.at > 250;

          if (isRepeatToggle) {
            setActiveShopId(null);
            lastMarkerFocusRef.current = { shopId: null, at: 0 };
            resetToGlobalView();
            return;
          }

          lastMarkerFocusRef.current = { shopId: shop.id, at: now };
          setActiveShopId(shop.id);
          const result = results && results.length > 0 ? results.find(r => r.shopId === shop.id) : null;
          if (result) {
            handlePreviewResult(result);
          } else if (typeof shop.longitude === "number" && typeof shop.latitude === "number") {
            map.setZoomAndCenter(15, [shop.longitude, shop.latitude]);
          }
        });

        return marker;
      });

    markersRef.current = markers;
    if (markers.length) {
      map.add(markers);
    }

    // 仅在无选中态时自动回全图，避免点击聚焦后又被重绘拉回去
    if (!targetPoint && !activeShopId && markers.length) {
      map.setFitView(markers, false, [80, 80, 80, 80]);
    } else if (!markers.length && !targetPoint && !activeShopId) {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(11);
    }
  }, [activeShopId, clearMarkers, mapScopedStores, targetPoint, results, handlePreviewResult, resetToGlobalView]);

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
    const dismissPreview = () => {
      closePreviewInfoWindow();
    };
    mapInteractionHandlerRef.current = dismissPreview;
    map.on("zoomstart", dismissPreview);
    map.on("dragstart", dismissPreview);
    drawShopMarkers();
  }, [closePreviewInfoWindow, drawShopMarkers]);

  const handleMapDestroy = useCallback(() => {
    if (mapRef.current && mapInteractionHandlerRef.current) {
      mapRef.current.off("zoomstart", mapInteractionHandlerRef.current);
      mapRef.current.off("dragstart", mapInteractionHandlerRef.current);
    }
    clearMarkers();
    clearTargetArtifacts();
    mapRef.current = null;
    AMapRef.current = null;
    geocoderRef.current = null;
    mapInteractionHandlerRef.current = null;
    routeBatchIdRef.current += 1;
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
          externalId: shop.externalId,
          address: shop.address,
          province: components?.province || null,
          city: (typeof components?.city === "string" ? components.city : components?.province) || null,
          latitude: location[1],
          longitude: location[0],
          isSource: shop.isSource,
          contactName: shop.contactName,
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
                regionCenter ?? mapRef.current?.getCenter?.() ?? DEFAULT_CENTER,
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
      const nearbyStoreCount =
        !activeCity || activeCity === ALL_REGIONS
          ? 0
          : provinceScopedStores.filter((shop) => {
              const parts = extractRegionParts(shop);
              if (parts.city === UNKNOWN_CITY || parts.city === activeCity) return false;
              const coordinates = getShopCoordinates(shop);
              if (!coordinates) return false;
              return getDistanceMeters(coordinates, match.location) <= CROSS_CITY_RADIUS_METERS;
            }).length;
      setSearchFeedback(
        nearbyStoreCount > 0
          ? `已在 ${regionLabel} 范围内定位：${match.name}，并自动纳入邻近城市门店参与调货。`
          : `已在 ${regionLabel} 范围内定位：${match.name}`
      );
    } catch (error) {
      console.error("Resolve target failed:", error);
      setSearchFeedback("搜索失败，请确认地图已加载完成后再试。");
      showToast("地址解析失败", "error");
    } finally {
      setIsSearchingTarget(false);
    }
  }, [activeCity, activeProvince, activeRegionKeyword, cityScopedStores.length, clearTargetArtifacts, drawShopMarkers, ensureSearchServices, provinceScopedStores, regionCenter, showToast, targetQuery]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;

    if (!map || !AMap) return;

    const batchId = ++routeBatchIdRef.current;

    clearTargetArtifacts();

    if (!targetPoint) {
      setResults([]);
      setIsResolvingRoutes(false);
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
          <div class="target-dot">
            <svg width="18" height="22" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 10px rgba(37,99,235,0.22));">
              <path d="M11 28C11 28 22 17.5 22 11C22 4.92487 17.0751 0 11 0C4.92487 0 0 4.92487 0 11C0 17.5 11 28 11 28Z" fill="#2563eb" />
              <circle cx="11" cy="11" r="5" fill="white"/>
              <circle cx="11" cy="11" r="2.4" fill="rgba(15,23,42,0.16)"/>
            </svg>
          </div>
        </div>
      `,
    });

    targetMarkerRef.current = marker;
    map.add(marker);

    const nextResults = sortDistanceResults(
      deliveryScopedStores
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
    );

    const routeCandidates = nextResults.slice(0, ROUTE_CANDIDATE_LIMIT);
    setResults([]);
    setIsResolvingRoutes(true);

    const nearest = routeCandidates[0];
    if (!nearest) {
      setIsResolvingRoutes(false);
      map.setCenter(targetPoint.location);
      map.setZoom(13);
      return;
    }

    const matchedShop = shops.find((shop) => shop.id === nearest.shopId);
    const nearestCoordinates = matchedShop ? getShopCoordinates(matchedShop) : null;
    if (!nearestCoordinates) {
      setIsResolvingRoutes(false);
      return;
    }

    void (async () => {
      try {
        const resolvedEntries = await Promise.all(
          routeCandidates.map(async (candidate) => {
            const candidateShop = shops.find((shop) => shop.id === candidate.shopId);
            const candidateCoordinates = candidateShop ? getShopCoordinates(candidateShop) : null;
            if (!candidateCoordinates) {
              return null;
            }

            const resolvedRoute = await requestRidingRoute(candidateCoordinates, targetPoint.location);
            if (!resolvedRoute) {
              return null;
            }

            return {
              shopId: candidate.shopId,
              ...resolvedRoute,
            };
          })
        );

        if (batchId !== routeBatchIdRef.current) return;

        const resolvedMap = new Map(
          resolvedEntries
            .filter((entry): entry is { shopId: string; routeDist: number | null; duration: number | null; path: [number, number][] } => entry !== null)
            .map((entry) => [entry.shopId, entry])
        );

        if (!resolvedMap.size) {
          setResults([]);
          setIsResolvingRoutes(false);
          return;
        }

        const mergedResults = sortDistanceResults(
          routeCandidates.map((item) =>
            resolvedMap.has(item.shopId)
              ? { ...item, ...resolvedMap.get(item.shopId)! }
              : item
          )
        );

        const eligibleResults = mergedResults.filter(
          (item) => item.routeDist == null || item.routeDist <= MAX_ROUTE_DISTANCE_METERS
        );
        const resolvedResults = eligibleResults.filter((item) => item.routeDist != null);
        const displayResults = eligibleResults.slice(0, ROUTE_DISPLAY_LIMIT);

        setResults(displayResults);
        setIsResolvingRoutes(false);

        const bestResult = resolvedResults[0];
        if (bestResult) {
          drawRoutePaths(resolvedResults, bestResult.shopId);
          drawPrimaryPath(bestResult.path, getRouteColor(0), "solid");
        }
      } catch (error) {
        console.error("Resolve riding route failed:", error);
        setResults([]);
        setIsResolvingRoutes(false);
      }
    })();
  }, [clearTargetArtifacts, deliveryScopedStores, drawPrimaryPath, drawRoutePaths, regionCenter, requestRidingRoute, shops, targetPoint]);

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
        const locateFailures: ImportLocateFailure[] = [];
        let autoLocated = 0;

        setImportProgress({ current: 0, total: createdShops.length });

        for (const shop of createdShops) {
          const keyword = String(shop.address || shop.name || "").trim();
          if (!keyword) {
            locateFailures.push({
              name: shop.name,
              address: shop.address || "",
              reason: "缺少可解析地址",
            });
            setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
            continue;
          }

          const matched = await resolveShopCoordinates(keyword);
          if (!matched) {
            locateFailures.push({
              name: shop.name,
              address: shop.address || "",
              reason: "地址未匹配到坐标",
            });
            setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
            continue;
          }

          const { location, components } = matched;

          const updateRes = await fetch(`/api/shops/${shop.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: shop.name,
              externalId: shop.externalId,
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
          } else {
            locateFailures.push({
              name: shop.name,
              address: shop.address || "",
              reason: "坐标保存失败",
            });
          }
          setImportProgress((prev) => prev ? { ...prev, current: prev.current + 1 } : null);
        }

        await fetchShops();
        setImportLocateFailures(locateFailures);
        showToast(
          `导入完成：新增 ${result.created ?? 0} 条，自动定位 ${autoLocated} 条，跳过 ${result.skipped ?? 0} 条${locateFailures.length > 0 ? `，另有 ${locateFailures.length} 条待处理` : ""}`,
          locateFailures.length > 0 ? "info" : "success"
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

  const executeDeleteShops = useCallback(async (ids: string[]) => {
    if (!ids.length || isDeletingShops) return;
    setIsDeletingShops(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/shops/${id}`, {
            method: "DELETE",
          })
        )
      );

      const successCount = results.filter(
        (result) => result.status === "fulfilled" && result.value.ok
      ).length;
      const failedCount = results.length - successCount;

      await fetchShops();
      setSelectedShopIds((prev) => prev.filter((id) => !ids.includes(id)));

      if (successCount > 0) {
        showToast(
          failedCount > 0
            ? `已删除 ${successCount} 家店铺，${failedCount} 家删除失败`
            : `已删除 ${successCount} 家店铺`,
          failedCount > 0 ? "info" : "success"
        );
      } else {
        showToast("批量删除失败", "error");
      }

      if (successCount > 0 && failedCount === 0 && ids.length > 1) {
        setIsBulkManageMode(false);
      }
    } catch (error) {
      console.error("Failed to bulk delete shops:", error);
      showToast("批量删除失败", "error");
    } finally {
      setIsDeletingShops(false);
    }
  }, [fetchShops, isDeletingShops, showToast]);

  const handleBulkDeleteShops = useCallback(() => {
    if (!selectedShopIds.length || isDeletingShops) return;
    setPendingDeleteAction({ type: "bulk", ids: [...selectedShopIds] });
  }, [isDeletingShops, selectedShopIds]);

  const handleDeleteSingleShop = useCallback(async (shop: Shop) => {
    if (isDeletingShops) return;
    setPendingDeleteAction({ type: "single", shop });
  }, [isDeletingShops]);

  const renderRouteResults = (mobile = false) => (
    <section
      className={cn(
        mobile
          ? "sm:hidden"
          : "pointer-events-none absolute right-3 top-3 z-20 hidden w-[172px] sm:block"
      )}
    >
      <div className={cn(mobile ? "" : "pointer-events-auto relative")}>
        <div className={cn("min-h-0 overflow-hidden", mobile && "rounded-[20px] border border-border/70 bg-card/95 shadow-sm")}>
          <div
            className={cn(
              mobile
                ? "grid grid-cols-2 gap-2 px-2 py-2 min-[360px]:grid-cols-3"
                : "flex max-h-[28dvh] flex-col gap-1 overflow-y-auto p-0.5"
            )}
          >
            {results.map((result, index) => {
              const shop = shops.find((item) => item.id === result.shopId);
              if (!shop) return null;

              const isSelected = activeShopId === result.shopId;
              const distanceMeta = getResultDistanceMeta(result);

              return (
                <button
                  key={result.shopId}
                  onClick={() => handlePreviewResult(result)}
                  className={cn(
                    "group relative overflow-hidden border text-left transition-all backdrop-blur-sm",
                    mobile
                      ? "w-full min-w-0 rounded-[16px] px-2 py-1.5"
                      : "w-full rounded-[16px] px-1.5 py-1.5",
                    isSelected
                      ? "border-primary/70 bg-slate-950/96 ring-1 ring-inset ring-primary/35"
                      : index === 0
                        ? "border-white/25 bg-slate-950/88"
                        : "border-white/12 bg-slate-950/82 hover:border-white/20"
                  )}
                >
                  <div className={cn("flex items-center", mobile ? "gap-1.5" : "gap-1.5")}>
                    <div className="min-w-0 flex-1">
                      <div className={cn("flex items-center", mobile ? "gap-1" : "gap-1.5")}>
                        <span
                          className={cn(
                            "flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : index === 0
                                ? "bg-amber-500 text-white"
                                : "bg-muted text-muted-foreground"
                          )}
                        >
                          {index + 1}
                        </span>
                        <div
                          className={cn(
                            "truncate font-bold tracking-tight text-white",
                            mobile ? "text-[10px]" : "text-[10px]"
                          )}
                          title={shop.name}
                        >
                          {simplifyShopName(shop.name)}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "mt-1 overflow-hidden",
                          mobile ? "flex items-center gap-1.5" : "flex items-center gap-2"
                        )}
                      >
                        <div
                          className={cn(
                            "flex min-w-0 items-center gap-1 font-medium whitespace-nowrap",
                            mobile ? "text-[9px]" : "text-[9px]",
                            isSelected ? "text-white" : "text-white/92"
                          )}
                        >
                          <Truck size={mobile ? 10 : 11} className="shrink-0 text-primary" />
                          {distanceMeta.distanceText}
                        </div>
                        {result.duration && (
                          <div className={cn("flex min-w-0 items-center gap-1 text-white/72 whitespace-nowrap", mobile ? "text-[9px]" : "text-[9px]")}>
                            <Clock size={mobile ? 10 : 11} className="shrink-0" />
                            {Math.max(1, Math.ceil(result.duration / 60))}分
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {!results.length && (
              <div
                className={cn(
                  "rounded-[18px] border border-dashed border-white/10 bg-slate-950/88 text-center text-[11px] text-white/72",
                  mobile ? "col-span-full px-3 py-4" : "w-full px-3 py-4"
                )}
              >
                <div className="mb-2 flex justify-center text-primary/40">
                  {isResolvingRoutes ? <Loader2 size={24} className="animate-spin" /> : <Navigation size={24} />}
                </div>
                {isResolvingRoutes ? (
                  <>
                    正在计算实际路线
                    <br />
                    稍后展示真实配送距离
                  </>
                ) : (
                  <>
                    暂未获取到可用路线
                    <br />
                    请尝试更换目标地址或缩小区域
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <>
    <div className="flex h-full min-h-0 w-full flex-col bg-background text-foreground">
      <style>{markerStyles}</style>
      <div className="shrink-0 border-b border-border/60 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:min-w-[128px] sm:flex-none">
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
              placeholder="省份"
              triggerClassName="h-10 rounded-2xl border-border bg-card px-3 text-sm font-medium text-foreground"
            />
          </div>

          <div className="min-w-0 flex-1 sm:min-w-[128px] sm:flex-none">
            <CustomSelect
              value={activeCity}
              options={citySelectOptions}
              onChange={setActiveCity}
              placeholder="城市"
              triggerClassName="h-10 rounded-2xl border-border bg-card px-3 text-sm font-medium text-foreground"
            />
          </div>

          <div className="order-3 w-full min-w-0 sm:order-none sm:min-w-[280px] sm:flex-1">
            <div className="relative">
              <Search
                size={15}
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
                className="h-10 w-full rounded-2xl border border-border bg-card px-10 pr-24 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
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
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
            <button
              onClick={() => setIsShopListOpen((prev) => !prev)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border px-3.5 text-sm font-medium transition-all max-sm:flex-1",
                isShopListOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:bg-muted"
              )}
            >
              店铺列表
            </button>
            <button
              onClick={() => {
                setEditingShop(null);
                setIsShopModalOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 text-sm font-medium transition-all hover:bg-muted max-sm:flex-1"
            >
              <Plus size={14} />
              新增店铺
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              disabled={isImportingShops}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 text-sm font-medium transition-all hover:bg-muted disabled:opacity-60 max-sm:flex-1"
            >
              {isImportingShops ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {importButtonLabel}
            </button>
          </div>
        </div>

        {searchFeedback && (
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <MapPin size={14} />
            <span className="truncate">{searchFeedback}</span>
          </div>
        )}

        {(targetPoint || results.length > 0 || isResolvingRoutes) && renderRouteResults(true)}

      </div>

      <div className="min-h-0 flex-1 p-3 pt-3 sm:p-5 sm:pt-4">
        <div className="relative h-full min-h-[520px] overflow-hidden rounded-[24px] border border-border/70 bg-card shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:min-h-[620px] sm:rounded-[28px]">
          <BareAmapTest
            showDebug={false}
            center={DEFAULT_CENTER}
            zoom={11}
            showDefaultMarker={false}
            onReady={handleMapReady}
            onDestroy={handleMapDestroy}
            mapStyle={`amap://styles/${mapTheme}`}
            className="h-full min-h-[520px] overflow-hidden rounded-[24px] border-0 bg-white sm:min-h-[620px] sm:rounded-[28px]"
          />
          {isShopListOpen &&
            createPortal(
              <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                  onClick={() => setIsShopListOpen(false)}
                />
                <aside className="relative z-10 flex h-[min(78dvh,760px)] w-full max-w-[420px] flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-2xl backdrop-blur-xl sm:rounded-[28px]">
              <div className="border-b border-border/60 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-foreground">店铺列表</div>
                    <div className="mt-1 text-xs text-muted-foreground">搜索、定位并修改店铺信息</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isBulkManageMode && (
                      <button
                        onClick={() => setIsBulkManageMode(true)}
                        className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card px-3 text-[11px] font-bold text-foreground transition-all hover:bg-muted"
                      >
                        批量删除
                      </button>
                    )}
                    <button
                      onClick={() => setIsShopListOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="relative mt-3">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={shopSearchQuery}
                    onChange={(event) => setShopSearchQuery(event.target.value)}
                    placeholder="搜索店名 / POI_ID / 地址"
                    className="h-10 w-full rounded-2xl border border-border bg-card px-9 pr-3 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {[
                    { value: "all", label: "全部" },
                    { value: "resolved", label: "已定位" },
                    { value: "pending", label: "待处理" },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setShopLocationFilter(filter.value as "all" | "resolved" | "pending")}
                      className={cn(
                        "inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-bold transition-all",
                        shopLocationFilter === filter.value
                          ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                          : "border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  {isBulkManageMode && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          const visibleIds = searchedShops.map((shop) => shop.id);
                          const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedShopIds.includes(id));
                          setSelectedShopIds(allVisibleSelected ? [] : visibleIds);
                        }}
                        className={cn(
                          "inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-bold transition-all",
                          searchedShops.length > 0 && searchedShops.every((shop) => selectedShopIds.includes(shop.id))
                            ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                            : "border border-border bg-card text-foreground hover:bg-muted"
                        )}
                      >
                        {searchedShops.length > 0 && searchedShops.every((shop) => selectedShopIds.includes(shop.id)) ? "取消全选" : "全选当前列表"}
                      </button>
                      <div className="inline-flex h-9 items-center justify-center rounded-full bg-white/[0.04] px-4 text-xs font-medium text-muted-foreground">
                        已选 <span className="mx-1 font-bold text-foreground">{selectedShopIds.length}</span> / 当前 {searchedShops.length}
                      </div>
                      <button
                        onClick={() => {
                          setIsBulkManageMode(false);
                          setSelectedShopIds([]);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-medium text-muted-foreground transition-all hover:text-foreground"
                      >
                        退出
                      </button>
                      <button
                        onClick={() => void handleBulkDeleteShops()}
                        disabled={selectedShopIds.length === 0 || isDeletingShops}
                        className="ml-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-destructive/85 px-4 text-xs font-bold text-white transition-all hover:bg-destructive disabled:cursor-not-allowed disabled:bg-destructive/35 disabled:text-white/60"
                      >
                        {isDeletingShops ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        删除 ({selectedShopIds.length})
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/70 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    已定位
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                    </span>
                    待处理
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-2">
                  {searchedShops.map((shop) => {
                    const region = extractRegionParts(shop);
                    const isSelected = selectedShopIds.includes(shop.id);
                    const hasResolvedLocation = typeof shop.longitude === "number" && typeof shop.latitude === "number";
                    return (
                      <div
                        key={shop.id}
                        className={cn(
                          "rounded-3xl border bg-card p-4 transition-all",
                          isSelected ? "border-primary ring-2 ring-primary/15" : "border-border"
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                            {isBulkManageMode && (
                              <button
                                onClick={() => {
                                  setSelectedShopIds((prev) =>
                                    prev.includes(shop.id)
                                      ? prev.filter((id) => id !== shop.id)
                                      : [...prev, shop.id]
                                  );
                                }}
                                className={cn(
                                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                                  isSelected
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/30 bg-background text-transparent"
                                )}
                              >
                                <Check size={12} />
                              </button>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5 shrink-0">
                                  <span
                                    className={cn(
                                      "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                                      hasResolvedLocation ? "bg-emerald-500/70" : "bg-red-500/70"
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "relative inline-flex h-2.5 w-2.5 rounded-full",
                                      hasResolvedLocation ? "bg-emerald-500" : "bg-red-500"
                                    )}
                                  />
                                </span>
                                <div className="truncate text-base font-bold text-foreground" title={shop.name}>
                                  {shop.name}
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {region.regionLabel || "未分类"}
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-bold",
                                  hasResolvedLocation
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-red-500/10 text-red-500"
                                )}>
                                  {hasResolvedLocation ? "定位正常" : "待定位"}
                                </span>
                              </div>
                              {shop.externalId && (
                                <div className="mt-2 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                                  POI_ID: {shop.externalId}
                                </div>
                              )}
                              {shop.address && (
                                <div className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                                  {shop.address}
                                </div>
                              )}
                            </div>
                        </div>
                        {!isBulkManageMode && (
                          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                            <button
                              onClick={() => {
                                void handleLocateShop(shop);
                              }}
                              className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted"
                            >
                              定位
                            </button>
                            <button
                              onClick={() => {
                                setEditingShop(shop);
                                setIsShopModalOpen(true);
                              }}
                              className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition-all hover:bg-white/90"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => {
                                void handleDeleteSingleShop(shop);
                              }}
                              disabled={isDeletingShops}
                              className="rounded-full px-3 py-2 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!searchedShops.length && (
                    <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                      没有找到匹配的店铺
                    </div>
                  )}
                </div>
              </div>
                </aside>
              </div>,
              document.body
            )}
          {(targetPoint || results.length > 0 || isResolvingRoutes) && renderRouteResults()}
        </div>
      </div>
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
      description="支持 Excel 或 CSV 导入。请至少包含“门店名称 / POI_ID / 详细地址”三列，也兼容 `POI ID`、`poi_id` 这类写法。"
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
    <ConfirmModal
      isOpen={!!pendingDeleteAction}
      onClose={() => setPendingDeleteAction(null)}
      onConfirm={() => {
        if (!pendingDeleteAction) return;
        if (pendingDeleteAction.type === "single") {
          void executeDeleteShops([pendingDeleteAction.shop.id]);
          return;
        }
        void executeDeleteShops(pendingDeleteAction.ids);
      }}
      title={pendingDeleteAction?.type === "single" ? "确认删除店铺" : "确认批量删除"}
      message={
        pendingDeleteAction?.type === "single"
          ? <>确认删除店铺“{pendingDeleteAction.shop.name}”吗？此操作不可撤销。</>
          : <>确认删除已选中的 {pendingDeleteAction?.type === "bulk" ? pendingDeleteAction.ids.length : 0} 家店铺吗？此操作不可撤销。</>
      }
      confirmLabel="确认删除"
      cancelLabel="取消"
      variant="danger"
    />
    <ConfirmModal
      isOpen={importLocateFailures.length > 0}
      onClose={() => setImportLocateFailures([])}
      onConfirm={() => setImportLocateFailures([])}
      title="部分店铺未定位"
      message={
        <div className="space-y-3 text-left">
          <p>以下店铺本次导入后没有自动定位成功，你可以按名称逐个点“定位”继续处理。</p>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm">
            {importLocateFailures.map((item, index) => (
              <div key={`${item.name}-${index}`} className="rounded-xl border border-border/50 bg-background/80 p-3">
                <div className="font-bold text-foreground">{item.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.reason}</div>
                {item.address && (
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.address}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      }
      confirmLabel="知道了"
      cancelLabel="关闭"
      variant="info"
    />
  </>
  );
}
