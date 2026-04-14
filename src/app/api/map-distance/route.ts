import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Coord = {
  lng: number;
  lat: number;
};

type GeocodeResult = {
  formattedAddress: string;
  location: Coord;
};

type RouteMode = "bicycling" | "driving" | "walking";

const AMAP_WEB_SERVICE_KEY = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";
const MAP_DISTANCE_API_KEY = process.env.MAP_DISTANCE_API_KEY || "";
const IS_DEV = process.env.NODE_ENV !== "production";

function toLocationText(coord: Coord) {
  return `${coord.lng},${coord.lat}`;
}

function parseCoordinateText(value: string) {
  const match = String(value || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lng = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return { lng, lat };
}

async function amapFetch<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams({
    key: AMAP_WEB_SERVICE_KEY,
    ...params,
  });

  const response = await fetch(`https://restapi.amap.com${path}?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AMap request failed with status ${response.status}`);
  }

  return await response.json() as T;
}

async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const coordinate = parseCoordinateText(address);
  if (coordinate) {
    return {
      formattedAddress: address.trim(),
      location: coordinate,
    };
  }

  const data = await amapFetch<{
    status?: string;
    info?: string;
    geocodes?: Array<{
      formatted_address?: string;
      location?: string;
    }>;
  }>("/v3/geocode/geo", {
    address: address.trim(),
  });

  if (data.status !== "1" || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
    throw new Error(data.info || `无法解析地址: ${address}`);
  }

  const first = data.geocodes[0];
  const locationText = String(first.location || "");
  const [lngText, latText] = locationText.split(",");
  const lng = Number(lngText);
  const lat = Number(latText);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`地址坐标无效: ${address}`);
  }

  return {
    formattedAddress: String(first.formatted_address || address).trim(),
    location: { lng, lat },
  };
}

async function getRouteDistance(origin: Coord, destination: Coord, mode: RouteMode) {
  if (mode === "driving") {
    const data = await amapFetch<{
      status?: string;
      info?: string;
      route?: {
        paths?: Array<{
          distance?: string;
          duration?: string;
        }>;
      };
    }>("/v3/direction/driving", {
      origin: toLocationText(origin),
      destination: toLocationText(destination),
      strategy: "0",
    });

    const firstPath = data.route?.paths?.[0];
    if (data.status !== "1" || !firstPath) {
      throw new Error(data.info || "驾车路线获取失败");
    }

    return {
      mode,
      distance: Number(firstPath.distance || 0),
      duration: Number(firstPath.duration || 0),
    };
  }

  if (mode === "walking") {
    const data = await amapFetch<{
      status?: string;
      info?: string;
      route?: {
        paths?: Array<{
          distance?: string;
          duration?: string;
        }>;
      };
    }>("/v3/direction/walking", {
      origin: toLocationText(origin),
      destination: toLocationText(destination),
    });

    const firstPath = data.route?.paths?.[0];
    if (data.status !== "1" || !firstPath) {
      throw new Error(data.info || "步行路线获取失败");
    }

    return {
      mode,
      distance: Number(firstPath.distance || 0),
      duration: Number(firstPath.duration || 0),
    };
  }

  const data = await amapFetch<{
    errcode?: number;
    errmsg?: string;
    data?: {
      paths?: Array<{
        distance?: number;
        duration?: number;
      }>;
    };
  }>("/v4/direction/bicycling", {
    origin: toLocationText(origin),
    destination: toLocationText(destination),
  });

  const firstPath = data.data?.paths?.[0];
  if (data.errcode !== 0 || !firstPath) {
    throw new Error(data.errmsg || "骑行路线获取失败");
  }

  return {
    mode,
    distance: Number(firstPath.distance || 0),
    duration: Number(firstPath.duration || 0),
  };
}

function haversineDistance(origin: Coord, destination: Coord) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6378137;
  const latDiff = toRadians(destination.lat - origin.lat);
  const lngDiff = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);

  return Math.round(2 * earthRadius * Math.asin(Math.sqrt(a)));
}

function formatDistance(distance: number) {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)}km`;
  }

  return `${Math.round(distance)}m`;
}

function formatDuration(duration: number) {
  if (duration >= 3600) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.round((duration % 3600) / 60);
    return `${hours}小时${minutes}分钟`;
  }

  if (duration >= 60) {
    return `${Math.round(duration / 60)}分钟`;
  }

  return `${Math.max(1, Math.round(duration))}秒`;
}

async function resolvePayload(request: NextRequest) {
  if (request.method === "GET") {
    const start = request.nextUrl.searchParams.get("start") || "";
    const end = request.nextUrl.searchParams.get("end") || "";
    const mode = request.nextUrl.searchParams.get("mode") || "bicycling";
    return { start, end, mode };
  }

  const body = await request.json().catch(() => ({}));
  return {
    start: String(body?.start || ""),
    end: String(body?.end || ""),
    mode: String(body?.mode || "bicycling"),
  };
}

function getRequestApiKey(request: NextRequest) {
  const headerKey = request.headers.get("x-api-key") || request.headers.get("x-map-distance-key");
  if (headerKey) return headerKey.trim();

  const authorization = request.headers.get("authorization") || "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }

  return request.nextUrl.searchParams.get("key")?.trim() || "";
}

function buildDebugMeta(requestApiKey: string) {
  if (!IS_DEV) return undefined;

  return {
    hasConfiguredMapDistanceKey: Boolean(MAP_DISTANCE_API_KEY),
    configuredMapDistanceKeyLength: MAP_DISTANCE_API_KEY.length,
    receivedApiKeyLength: requestApiKey.length,
    receivedApiKeyPreview: requestApiKey ? `${requestApiKey.slice(0, 2)}***${requestApiKey.slice(-2)}` : "",
    hasAmapServiceKey: Boolean(AMAP_WEB_SERVICE_KEY),
    amapServiceKeyLength: AMAP_WEB_SERVICE_KEY.length,
  };
}

async function handleRequest(request: NextRequest) {
  try {
    if (!MAP_DISTANCE_API_KEY) {
      return NextResponse.json({
        error: "MAP_DISTANCE_API_KEY is not configured",
        debug: buildDebugMeta(""),
      }, { status: 500 });
    }

    const requestApiKey = getRequestApiKey(request);
    if (!requestApiKey || requestApiKey !== MAP_DISTANCE_API_KEY) {
      return NextResponse.json({
        error: "Unauthorized",
        debug: buildDebugMeta(requestApiKey),
      }, { status: 401 });
    }

    if (!AMAP_WEB_SERVICE_KEY) {
      return NextResponse.json({
        error: "AMAP_WEB_SERVICE_KEY is not configured",
        debug: buildDebugMeta(requestApiKey),
      }, { status: 500 });
    }

    const { start, end, mode } = await resolvePayload(request);
    const routeMode = (["bicycling", "driving", "walking"].includes(mode) ? mode : "bicycling") as RouteMode;

    if (!start.trim() || !end.trim()) {
      return NextResponse.json({ error: "start and end are required" }, { status: 400 });
    }

    const [origin, destination] = await Promise.all([
      geocodeAddress(start),
      geocodeAddress(end),
    ]);

    const lineDistance = haversineDistance(origin.location, destination.location);
    const route = await getRouteDistance(origin.location, destination.location, routeMode);

    return NextResponse.json({
      start: {
        input: start,
        resolved: origin.formattedAddress,
        location: origin.location,
      },
      end: {
        input: end,
        resolved: destination.formattedAddress,
        location: destination.location,
      },
      route: {
        mode: route.mode,
        distance: route.distance,
        distanceText: formatDistance(route.distance),
        duration: route.duration,
        durationText: formatDuration(route.duration),
      },
      lineDistance: {
        distance: lineDistance,
        distanceText: formatDistance(lineDistance),
      },
    });
  } catch (error) {
    console.error("Failed to calculate map distance:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to calculate map distance",
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return await handleRequest(request);
}

export async function POST(request: NextRequest) {
  return await handleRequest(request);
}
