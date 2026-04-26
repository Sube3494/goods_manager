type Coord = {
  longitude: number;
  latitude: number;
};

const AMAP_WEB_SERVICE_KEY = process.env.AMAP_WEB_SERVICE_KEY || process.env.NEXT_PUBLIC_AMAP_KEY || "";

function parseCoordinateText(value: string) {
  const match = String(value || "").trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return { longitude, latitude };
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

export function canGeocodeAddress() {
  return Boolean(AMAP_WEB_SERVICE_KEY);
}

export async function geocodeAddress(address: string): Promise<Coord> {
  const text = String(address || "").trim();
  if (!text) {
    throw new Error("Address is required");
  }

  const coordinate = parseCoordinateText(text);
  if (coordinate) {
    return coordinate;
  }

  if (!AMAP_WEB_SERVICE_KEY) {
    throw new Error("AMAP_WEB_SERVICE_KEY is not configured");
  }

  const data = await amapFetch<{
    status?: string;
    info?: string;
    geocodes?: Array<{
      location?: string;
    }>;
  }>("/v3/geocode/geo", {
    address: text,
  });

  if (data.status !== "1" || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
    throw new Error(data.info || `无法解析地址: ${text}`);
  }

  const locationText = String(data.geocodes[0]?.location || "");
  const [lngText, latText] = locationText.split(",");
  const longitude = Number(lngText);
  const latitude = Number(latText);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`地址坐标无效: ${text}`);
  }

  return { longitude, latitude };
}
