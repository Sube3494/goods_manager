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

function normalizeSearchText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function extractSpecificKeywordHints(keyword: string) {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return [];

  const genericTerms = [
    "广东省", "广州市", "深圳市", "北京市", "上海市", "天河区", "白云区", "越秀区", "海珠区",
    "商务公寓", "公寓", "酒店", "小区", "大厦", "广场", "花园", "大楼", "写字楼", "中心",
    "国际", "一期", "二期", "三期", "一栋", "二栋", "三栋", "1栋", "2栋", "3栋"
  ];

  let compact = normalized;
  for (const term of genericTerms) {
    compact = compact.split(normalizeSearchText(term)).join(" ");
  }

  const hints = compact
    .split(/[\s,，()（）\-_/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  if (hints.length > 0) {
    return Array.from(new Set(hints));
  }

  return normalized.length >= 2 ? [normalized] : [];
}

function candidateContainsSpecificHint(candidateText: string, keyword: string) {
  const hints = extractSpecificKeywordHints(keyword);
  if (hints.length === 0) return true;

  const normalizedCandidate = normalizeSearchText(candidateText);
  return hints.some((hint) => normalizedCandidate.includes(hint));
}

function scoreGeocodeCandidate(
  geocode: {
    formatted_address?: string;
    location?: string;
    addressComponent?: {
      province?: string;
      city?: string | string[];
      district?: string;
      township?: string;
      neighborhood?: { name?: string };
      building?: { name?: string };
    };
  },
  keyword: string
) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const cityText = Array.isArray(geocode.addressComponent?.city)
    ? geocode.addressComponent?.city.join("")
    : geocode.addressComponent?.city;
  const candidateText = [
    geocode.formatted_address,
    geocode.addressComponent?.province,
    cityText,
    geocode.addressComponent?.district,
    geocode.addressComponent?.township,
    geocode.addressComponent?.neighborhood?.name,
    geocode.addressComponent?.building?.name,
  ].filter(Boolean).join(" ");
  const normalizedCandidate = normalizeSearchText(candidateText);

  let score = 0;
  if (normalizedKeyword) {
    if (normalizedCandidate === normalizedKeyword) score += 100;
    else if (normalizedCandidate.includes(normalizedKeyword)) score += 60;
  }
  if (candidateContainsSpecificHint(candidateText, keyword)) score += 40;
  if (geocode.addressComponent?.building?.name) score += 12;
  if (geocode.addressComponent?.neighborhood?.name) score += 8;
  if (geocode.addressComponent?.district) score += 5;

  return score;
}

function pickBestGeocode(
  geocodes: Array<{
    formatted_address?: string;
    location?: string;
    addressComponent?: {
      province?: string;
      city?: string | string[];
      district?: string;
      township?: string;
      neighborhood?: { name?: string };
      building?: { name?: string };
    };
  }>,
  keyword: string
) {
  const ranked = (Array.isArray(geocodes) ? geocodes : [])
    .filter((item) => typeof item?.location === "string" && item.location.includes(","))
    .map((item) => ({
      item,
      score: scoreGeocodeCandidate(item, keyword),
      hasHint: candidateContainsSpecificHint([
        item.formatted_address,
        item.addressComponent?.building?.name,
        item.addressComponent?.neighborhood?.name,
        item.addressComponent?.district,
      ].filter(Boolean).join(" "), keyword),
    }))
    .sort((a, b) => b.score - a.score);

  const hinted = ranked.filter((item) => item.hasHint);
  return (hinted[0] || ranked[0] || null)?.item || null;
}

export function canGeocodeAddress() {
  return Boolean(AMAP_WEB_SERVICE_KEY);
}

export async function geocodeAddressDetailed(address: string): Promise<Coord & { formattedAddress: string }> {
  const text = String(address || "").trim();
  if (!text) {
    throw new Error("Address is required");
  }

  const coordinate = parseCoordinateText(text);
  if (coordinate) {
    return {
      ...coordinate,
      formattedAddress: text,
    };
  }

  if (!AMAP_WEB_SERVICE_KEY) {
    throw new Error("AMAP_WEB_SERVICE_KEY is not configured");
  }

  const data = await amapFetch<{
    status?: string;
    info?: string;
    geocodes?: Array<{
      formatted_address?: string;
      location?: string;
      addressComponent?: {
        province?: string;
        city?: string | string[];
        district?: string;
        township?: string;
        neighborhood?: { name?: string };
        building?: { name?: string };
      };
    }>;
  }>("/v3/geocode/geo", {
    address: text,
  });

  if (data.status !== "1" || !Array.isArray(data.geocodes) || data.geocodes.length === 0) {
    throw new Error(data.info || `无法解析地址: ${text}`);
  }

  const best = pickBestGeocode(data.geocodes, text);
  if (!best || !candidateContainsSpecificHint([
    best.formatted_address,
    best.addressComponent?.building?.name,
    best.addressComponent?.neighborhood?.name,
    best.addressComponent?.district,
  ].filter(Boolean).join(" "), text)) {
    throw new Error(`无法精确解析地址: ${text}`);
  }

  const locationText = String(best.location || "");
  const [lngText, latText] = locationText.split(",");
  const longitude = Number(lngText);
  const latitude = Number(latText);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error(`地址坐标无效: ${text}`);
  }

  return {
    longitude,
    latitude,
    formattedAddress: String(best.formatted_address || text).trim() || text,
  };
}

export async function geocodeAddress(address: string): Promise<Coord> {
  const result = await geocodeAddressDetailed(address);
  return {
    longitude: result.longitude,
    latitude: result.latitude,
  };
}
