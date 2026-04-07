/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Navigation2,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { BareAmapTest } from "@/components/DistanceCalc/BareAmapTest";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ImportModal } from "@/components/Goods/ImportModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type Shop = {
  id: string;
  name: string;
  address: string | null;
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

type DistanceResult = {
  shopId: string;
  straightDist: number;
  routeDist: number | null;
  duration: number | null;
  path: Array<[number, number]>;
};

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

function extractRegionParts(shop: Pick<Shop, "address" | "name">) {
  const text = `${shop.address || ""} ${shop.name || ""}`.replace(/\s+/g, "");
  const municipalityMatch = text.match(/(北京市|上海市|天津市|重庆市)/);
  if (municipalityMatch) {
    const province = municipalityMatch[1];
    return {
      province,
      city: province,
      regionLabel: [province, province].join(" / "),
    };
  }

  const provinceMatch = text.match(
    /([\u4e00-\u9fa5]{2,}?(?:省|自治区|特别行政区))/
  );
  const province = provinceMatch?.[1] || UNKNOWN_PROVINCE;
  const textAfterProvince = provinceMatch
    ? text.slice((provinceMatch.index || 0) + provinceMatch[1].length)
    : text;
  const cityMatch = textAfterProvince.match(/([\u4e00-\u9fa5]{2,}?(?:市|州|地区|盟))/);
  const city = cityMatch?.[1] || UNKNOWN_CITY;

  return {
    province,
    city,
    regionLabel: [province, city].filter(Boolean).join(" / "),
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
  const geocoderRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const ridingRef = useRef<any>(null);

  const [shops, setShops] = useState<Shop[]>(initialStores);
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [editingShop, setEditingShop] = useState<EditableShop | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImportingShops, setIsImportingShops] = useState(false);
  const [shopSearch, setShopSearch] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetPoint, setTargetPoint] = useState<TargetPoint | null>(null);
  const [results, setResults] = useState<DistanceResult[]>([]);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSearchingTarget, setIsSearchingTarget] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState("可直接解析地址并预览最近店铺。");
  const [activeProvince, setActiveProvince] = useState<string>(ALL_REGIONS);
  const [activeCity, setActiveCity] = useState<string>(ALL_REGIONS);

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
      if (parts.province === UNKNOWN_PROVINCE || parts.city === UNKNOWN_CITY) return false;
      if (activeProvince && activeProvince !== ALL_REGIONS && parts.province !== activeProvince) return false;
      if (activeCity && activeCity !== ALL_REGIONS && parts.city !== activeCity) return false;
      return true;
    });
  }, [activeCity, activeProvince, shops]);

  useEffect(() => {
    if (!cityScopedStores.length) {
      setTargetPoint(null);
      setResults([]);
      setTargetQuery("");
      setSearchFeedback("当前地区暂无门店，请先切换省市。");
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
    targetMarkerRef.current = null;
    pathRef.current = null;
  }, []);

  const drawShopMarkers = useCallback(() => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    if (!map || !AMap) return;

    clearMarkers();

    const markers = cityScopedStores
      .filter((shop) => typeof shop.longitude === "number" && typeof shop.latitude === "number")
      .map((shop) => {
        const marker = new AMap.Marker({
          position: [shop.longitude, shop.latitude],
          title: shop.name,
        });

        marker.setLabel({
          direction: "top",
          offset: new AMap.Pixel(0, -8),
          content: `<div style="padding:4px 8px;border-radius:999px;background:rgba(17,24,39,.92);color:#fff;font-size:12px;line-height:1;border:1px solid rgba(255,255,255,.1);">${shop.name}</div>`,
        });

        return marker;
      });

    markersRef.current = markers;
    if (markers.length && !targetPoint) {
      map.add(markers);
      map.setFitView(markers, false, [80, 80, 80, 80]);
    } else if (markers.length) {
      map.add(markers);
    } else {
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(11);
    }
  }, [cityScopedStores, clearMarkers, targetPoint]);

  useEffect(() => {
    drawShopMarkers();
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
  }, [clearMarkers, clearTargetArtifacts]);

  useEffect(() => {
    if (targetPoint) return;

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

      const geocoderMatch = await withTimeout(
        () =>
          new Promise<[number, number] | null>((resolve) => {
            geocoder.getLocation(keyword, (status: string, result: any) => {
              if (status === "complete" && result?.geocodes?.length) {
                const first = result.geocodes[0];
                resolve([first.location.lng, first.location.lat]);
                return;
              }
              resolve(null);
            });
          }),
        4000,
        null
      );

      if (geocoderMatch) {
        return geocoderMatch;
      }

      if (!placeSearch) {
        return null;
      }

      return withTimeout(
        () =>
          new Promise<[number, number] | null>((resolve) => {
            placeSearch.search(keyword, (status: string, result: any) => {
              if (status === "complete" && result?.poiList?.pois?.length) {
                const poi = result.poiList.pois[0];
                if (poi?.location) {
                  resolve([poi.location.lng, poi.location.lat]);
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
      const location = await resolveShopCoordinates(keyword);

      if (!location) {
        showToast("这个地址暂时解析不到坐标", "error");
        return;
      }

      const res = await fetch(`/api/shops/${shop.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: shop.name,
          address: shop.address,
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
      setSearchFeedback(`已在 ${activeProvince}${activeCity} 范围内定位：${match.name}`);
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
      title: targetPoint.name,
    });

    marker.setLabel({
      direction: "top",
      offset: new AMap.Pixel(0, -8),
      content: `<div style="padding:4px 8px;border-radius:999px;background:rgba(220,38,38,.92);color:#fff;font-size:12px;line-height:1;border:1px solid rgba(255,255,255,.18);">目标: ${targetPoint.name}</div>`,
    });

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
        straightDist: Math.round(
          AMap.GeometryUtil.distance([shop.longitude as number, shop.latitude as number], targetPoint.location)
        ),
        routeDist: null,
        duration: null,
        path: [
          [shop.longitude as number, shop.latitude as number] as [number, number],
          targetPoint.location as [number, number],
        ],
      }))
      .sort((a, b) => a.straightDist - b.straightDist);

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

  const handlePreviewResult = useCallback((result: DistanceResult) => {
    const map = mapRef.current;
    const AMap = AMapRef.current;
    const matchedShop = shops.find((shop) => shop.id === result.shopId);
    if (!map || !AMap || !matchedShop?.longitude || !matchedShop?.latitude || !targetPoint) return;

    clearTargetArtifacts();

    const marker = new AMap.Marker({
      position: targetPoint.location,
      title: targetPoint.name,
    });
    targetMarkerRef.current = marker;
    map.add(marker);

    const polyline = new AMap.Polyline({
      path: result.path,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeWeight: 6,
      lineJoin: "round",
      lineCap: "round",
      zIndex: 30,
      strokeStyle: result.routeDist ? "solid" : "dashed",
    });

    pathRef.current = polyline;
    map.add(polyline);
    map.setFitView([polyline, marker], false, [90, 90, 90, 90]);
  }, [clearTargetArtifacts, shops, targetPoint]);

  const handleSaveShop = useCallback(async () => {
    if (!editingShop?.name?.trim()) {
      showToast("请填写店铺名称", "error");
      return;
    }

    setIsSavingShop(true);
    try {
      const method = editingShop.id ? "PUT" : "POST";
      const url = editingShop.id ? `/api/shops/${editingShop.id}` : "/api/shops";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingShop.name,
          address: editingShop.address,
          latitude: editingShop.latitude ?? null,
          longitude: editingShop.longitude ?? null,
          isSource: editingShop.isSource ?? true,
          contactPhone: editingShop.contactPhone,
        }),
      });

      if (!res.ok) throw new Error("save failed");

      showToast(editingShop.id ? "店铺已更新" : "店铺已新增", "success");
      setEditingShop(null);
      await fetchShops();
    } catch (error) {
      console.error("Failed to save shop:", error);
      showToast("保存店铺失败", "error");
    } finally {
      setIsSavingShop(false);
    }
  }, [editingShop, fetchShops, showToast]);

  const handleDeleteShop = useCallback(
    async (shopId: string) => {
      if (!confirm("确定删除这个店铺吗？")) return;

      try {
        const res = await fetch(`/api/shops/${shopId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
        showToast("店铺已删除", "success");
        await fetchShops();
      } catch (error) {
        console.error("Failed to delete shop:", error);
        showToast("删除店铺失败", "error");
      }
    },
    [fetchShops, showToast]
  );

  const handleImportShops = useCallback(
    async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
      const importedRows = Array.isArray(rows) ? rows : [];
      if (!importedRows.length) {
        showToast("导入文件里没有可用数据", "info");
        return;
      }

      setIsImportingShops(true);
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

        for (const shop of createdShops) {
          const keyword = String(shop.address || shop.name || "").trim();
          if (!keyword) continue;

          const location = await resolveShopCoordinates(keyword);
          if (!location) continue;

          const updateRes = await fetch(`/api/shops/${shop.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: shop.name,
              address: shop.address,
              latitude: location[1],
              longitude: location[0],
              isSource: true,
            }),
          });

          if (updateRes.ok) {
            autoLocated += 1;
          }
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
      }
    },
    [fetchShops, resolveShopCoordinates, showToast]
  );

  return (
    <>
    <div className="relative h-full min-h-[720px] overflow-hidden rounded-[32px] bg-background">
      <div className="absolute inset-0 z-0 p-4">
        <BareAmapTest
          showDebug={false}
          center={DEFAULT_CENTER}
          zoom={11}
          showDefaultMarker={false}
          onReady={handleMapReady}
          onDestroy={handleMapDestroy}
          className="h-full min-h-[680px] overflow-hidden rounded-[28px] border border-border bg-white"
        />
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
                    onClick={() => setEditingShop({ name: "", address: "", isSource: true })}
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
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                <MapPin size={14} />
                <span>
                  {activeProvince && activeCity
                    ? `${searchFeedback} 当前地区：${activeProvince === ALL_REGIONS ? ALL_REGIONS : [activeProvince, activeCity].filter((value) => value && value !== ALL_REGIONS).join(" / ")}`
                    : "请先选择省市。"}
                </span>
              </div>
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-foreground">本地区店铺</h3>
                <div className="text-[11px] font-medium text-muted-foreground">
                  当前省市下参与调货计算的门店
                </div>
              </div>

              <div className="relative mb-3">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={shopSearch}
                  onChange={(event) => setShopSearch(event.target.value)}
                  placeholder="搜索本地区店铺"
                  className="h-10 w-full rounded-2xl border border-border bg-card px-9 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                />
              </div>

              {editingShop && (
                <div className="mb-3 space-y-3 rounded-2xl border border-primary/20 bg-primary/4 p-3">
                  <input
                    value={editingShop.name || ""}
                    onChange={(event) => setEditingShop((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="店铺名称"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none"
                  />
                  <input
                    value={editingShop.address || ""}
                    onChange={(event) => setEditingShop((prev) => ({ ...prev, address: event.target.value }))}
                    placeholder="详细地址"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none"
                  />
                  <input
                    value={editingShop.contactPhone || ""}
                    onChange={(event) => setEditingShop((prev) => ({ ...prev, contactPhone: event.target.value }))}
                    placeholder="联系电话"
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none"
                  />
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={editingShop.isSource ?? true}
                      onChange={(event) => setEditingShop((prev) => ({ ...prev, isSource: event.target.checked }))}
                    />
                    作为调货店铺
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveShop}
                      disabled={isSavingShop}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-black text-primary-foreground disabled:opacity-60"
                    >
                      {isSavingShop ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      保存
                    </button>
                    <button
                      onClick={() => setEditingShop(null)}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-border px-4 text-sm font-bold transition-all hover:bg-muted"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div className="max-h-[300px] space-y-2 overflow-y-auto custom-scrollbar pr-1">
                {currentCityStores.map((shop) => (
                  <div
                    key={shop.id}
                    className="rounded-2xl border border-border bg-card p-3 transition-all hover:border-primary/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Store size={14} className="text-primary" />
                          <div className="truncate text-sm font-bold text-foreground">{shop.name}</div>
                        </div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {shop.address || "未设置地址"}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5",
                              shop.isSource
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted"
                            )}
                          >
                            门店
                          </span>
                          {shop.latitude && shop.longitude ? <span>已定位</span> : <span>待定位</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleLocateShop(shop)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                        >
                          <MapPin size={14} />
                        </button>
                        <button
                          onClick={() => setEditingShop(shop)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => void handleDeleteShop(shop.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!currentCityStores.length && (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    当前地区暂无店铺
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-foreground">店铺路线预览</h3>
                <div className="text-[11px] font-medium text-muted-foreground">
                  当前地区全部店铺的距离结果
                </div>
              </div>
              <div className="max-h-[140px] space-y-2 overflow-y-auto custom-scrollbar pr-1">
                {results.map((result, index) => {
                  const shop = shops.find((item) => item.id === result.shopId);
                  if (!shop) return null;
                  return (
                    <button
                      key={result.shopId}
                      onClick={() => handlePreviewResult(result)}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-all",
                        index === 0
                          ? "border-primary/30 bg-primary/6"
                          : "border-border bg-card hover:border-primary/20"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-foreground">{shop.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {result.routeDist
                              ? `路线距离 ${(result.routeDist / 1000).toFixed(2)} km · 直线 ${(result.straightDist / 1000).toFixed(2)} km`
                              : `直线距离 ${(result.straightDist / 1000).toFixed(2)} km`}
                          </div>
                          {result.duration ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              预计耗时 {Math.max(1, Math.ceil(result.duration / 60))} 分钟
                            </div>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right text-[11px] font-bold text-primary">
                          {result.routeDist ? "实际路线" : "直线预估"}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {!results.length && (
                  <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    先选地区，再搜索收货地址。
                    <br />
                    这里会按距离列出当前地区全部店铺的结果。
                  </div>
                )}
              </div>
            </section>
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
    </>
  );
}
