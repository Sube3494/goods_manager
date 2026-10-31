/**
 * 开店选址 - 空间坐标转换与覆盖算法工具
 */

export interface Point {
  id?: string;
  name: string;
  lat: number;
  lng: number;
  r: number; // 单位：公里
  address?: string;
  isPinned?: boolean; // 是否已钉住/锁定位置，禁止拖拽防误触
  hideRing?: boolean; // 是否隐藏此点位的辐射覆盖轮廓圈
}

export interface CityConfig {
  name: string;
  shortName: string;
  code: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  points: Point[];
}

export interface AnalysisRow {
  area: number;
  unique: number;
}

export interface CoverageAnalysis {
  union: number;
  multi: number;
  rows: AnalysisRow[];
}

export const DEFAULT_RADIUS_CITIES: Record<string, CityConfig> = {
  nationwide: {
    name: "全国",
    shortName: "全国",
    code: "100000",
    center: [35.8, 104.2],
    zoom: 5,
    points: [],
  },
  // 直辖市
  beijing: {
    name: "北京市",
    shortName: "北京",
    code: "110000",
    center: [39.9042, 116.4074],
    zoom: 12,
    points: [],
  },
  shanghai: {
    name: "上海市",
    shortName: "上海",
    code: "310000",
    center: [31.2304, 121.4737],
    zoom: 12,
    points: [],
  },
  guangzhou: {
    name: "广州市",
    shortName: "广州",
    code: "440100",
    center: [23.1291, 113.2644],
    zoom: 12,
    points: [],
  },
  shenzhen: {
    name: "深圳市",
    shortName: "深圳",
    code: "440300",
    center: [22.5431, 114.0579],
    zoom: 12,
    points: [],
  },
  chengdu: {
    name: "成都市",
    shortName: "成都",
    code: "510100",
    center: [30.5728, 104.0668],
    zoom: 12,
    points: [],
  },
  hangzhou: {
    name: "杭州市",
    shortName: "杭州",
    code: "330100",
    center: [30.2741, 120.1551],
    zoom: 12,
    points: [],
  },
  wuhan: {
    name: "武汉市",
    shortName: "武汉",
    code: "420100",
    center: [30.5928, 114.3055],
    zoom: 12,
    points: [],
  },
  nanjing: {
    name: "南京市",
    shortName: "南京",
    code: "320100",
    center: [32.0603, 118.7969],
    zoom: 12,
    points: [],
  },
  chongqing: {
    name: "重庆市",
    shortName: "重庆",
    code: "500000",
    center: [29.563, 106.5516],
    zoom: 12,
    points: [],
  },
  tianjin: {
    name: "天津市",
    shortName: "天津",
    code: "120000",
    center: [39.0842, 117.2009],
    zoom: 12,
    points: [],
  },
  suzhou: {
    name: "苏州市",
    shortName: "苏州",
    code: "320500",
    center: [31.303, 120.582],
    zoom: 12,
    points: [],
  },
  wuxi: {
    name: "无锡市",
    shortName: "无锡",
    code: "320200",
    center: [31.555, 120.303],
    zoom: 12,
    points: [],
  },
  nanchang: {
    name: "南昌市",
    shortName: "南昌",
    code: "360100",
    center: [28.682, 115.8579],
    zoom: 12,
    points: [],
  },
  changsha: {
    name: "长沙市",
    shortName: "长沙",
    code: "430100",
    center: [28.2282, 112.9388],
    zoom: 12,
    points: [],
  },
  zhengzhou: {
    name: "郑州市",
    shortName: "郑州",
    code: "410100",
    center: [34.7466, 113.6253],
    zoom: 12,
    points: [],
  },
  xian: {
    name: "西安市",
    shortName: "西安",
    code: "610100",
    center: [34.3416, 108.9398],
    zoom: 12,
    points: [],
  },
  hefei: {
    name: "合肥市",
    shortName: "合肥",
    code: "340100",
    center: [31.8206, 117.2272],
    zoom: 12,
    points: [],
  },
  fuzhou: {
    name: "福州市",
    shortName: "福州",
    code: "350100",
    center: [26.0745, 119.2965],
    zoom: 12,
    points: [],
  },
  xiamen: {
    name: "厦门市",
    shortName: "厦门",
    code: "350200",
    center: [24.4798, 118.0894],
    zoom: 12,
    points: [],
  },
  jinan: {
    name: "济南市",
    shortName: "济南",
    code: "370100",
    center: [36.6512, 117.1201],
    zoom: 12,
    points: [],
  },
  qingdao: {
    name: "青岛市",
    shortName: "青岛",
    code: "370200",
    center: [36.0671, 120.3826],
    zoom: 12,
    points: [],
  },
  kunming: {
    name: "昆明市",
    shortName: "昆明",
    code: "530100",
    center: [25.0406, 102.7123],
    zoom: 12,
    points: [],
  },
  guiyang: {
    name: "贵阳市",
    shortName: "贵阳",
    code: "520100",
    center: [26.6477, 106.6302],
    zoom: 12,
    points: [],
  },
  nanning: {
    name: "南宁市",
    shortName: "南宁",
    code: "450100",
    center: [22.817, 108.3665],
    zoom: 12,
    points: [],
  },
  haikou: {
    name: "海口市",
    shortName: "海口",
    code: "460100",
    center: [20.044, 110.354],
    zoom: 12,
    points: [],
  },
  sanya: {
    name: "三亚市",
    shortName: "三亚",
    code: "460200",
    center: [18.2528, 109.512],
    zoom: 12,
    points: [],
  },
  shenyang: {
    name: "沈阳市",
    shortName: "沈阳",
    code: "210100",
    center: [41.8057, 123.4315],
    zoom: 12,
    points: [],
  },
  dalian: {
    name: "大连市",
    shortName: "大连",
    code: "210200",
    center: [38.914, 121.6147],
    zoom: 12,
    points: [],
  },
  changchun: {
    name: "长春市",
    shortName: "长春",
    code: "220100",
    center: [43.8171, 125.3235],
    zoom: 12,
    points: [],
  },
  harbin: {
    name: "哈尔滨市",
    shortName: "哈尔滨",
    code: "230100",
    center: [45.8038, 126.535],
    zoom: 12,
    points: [],
  },
  shijiazhuang: {
    name: "石家庄市",
    shortName: "石家庄",
    code: "130100",
    center: [38.0428, 114.5149],
    zoom: 12,
    points: [],
  },
  taiyuan: {
    name: "太原市",
    shortName: "太原",
    code: "140100",
    center: [37.8706, 112.5489],
    zoom: 12,
    points: [],
  },
  huhehaote: {
    name: "呼和浩特市",
    shortName: "呼市",
    code: "150100",
    center: [40.8415, 111.7519],
    zoom: 12,
    points: [],
  },
  lanzhou: {
    name: "兰州市",
    shortName: "兰州",
    code: "620100",
    center: [36.0611, 103.8343],
    zoom: 12,
    points: [],
  },
  xining: {
    name: "西宁市",
    shortName: "西宁",
    code: "630100",
    center: [36.6232, 101.7789],
    zoom: 12,
    points: [],
  },
  yinchuan: {
    name: "银川市",
    shortName: "银川",
    code: "640100",
    center: [38.4872, 106.2309],
    zoom: 12,
    points: [],
  },
  wulumuqi: {
    name: "乌鲁木齐市",
    shortName: "乌鲁木齐",
    code: "650100",
    center: [43.8256, 87.6168],
    zoom: 12,
    points: [],
  },
  // 重点沿海及经济活力城市
  ningbo: {
    name: "宁波市",
    shortName: "宁波",
    code: "330200",
    center: [29.8683, 121.544],
    zoom: 12,
    points: [],
  },
  wenzhou: {
    name: "温州市",
    shortName: "温州",
    code: "330300",
    center: [27.9943, 120.6994],
    zoom: 12,
    points: [],
  },
  changzhou: {
    name: "常州市",
    shortName: "常州",
    code: "320400",
    center: [31.8112, 119.9741],
    zoom: 12,
    points: [],
  },
  nantong: {
    name: "南通市",
    shortName: "南通",
    code: "320600",
    center: [32.0162, 120.8646],
    zoom: 12,
    points: [],
  },
  dongguan: {
    name: "东莞市",
    shortName: "东莞",
    code: "441900",
    center: [23.0207, 113.7518],
    zoom: 12,
    points: [],
  },
  foshan: {
    name: "佛山市",
    shortName: "佛山",
    code: "440600",
    center: [23.0215, 113.1214],
    zoom: 12,
    points: [],
  },
  ganzhou: {
    name: "赣州市",
    shortName: "赣州",
    code: "360700",
    center: [25.8318, 114.9334],
    zoom: 12,
    points: [],
  },
  jiujiang: {
    name: "九江市",
    shortName: "九江",
    code: "360400",
    center: [29.7051, 115.9928],
    zoom: 12,
    points: [],
  },
};

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function isOutsideChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

/**
 * WGS-84 转 GCJ-02（高德坐标，返回 [lng, lat]）
 */
export function wgs84ToGcj02(lat: number, lng: number): [number, number] {
  if (isOutsideChina(lat, lng)) {
    return [lng, lat];
  }
  const x = lng - 105.0;
  const y = lat - 35.0;
  const dLat = transformLat(x, y);
  const dLng = transformLng(x, y);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const calculatedLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  const calculatedLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + calculatedLng, lat + calculatedLat];
}

/**
 * GCJ-02 转 WGS-84（返回 { lat, lng }）
 */
export function gcj02ToWgs84(gcjLat: number, gcjLng: number): { lat: number; lng: number } {
  if (isOutsideChina(gcjLat, gcjLng)) {
    return { lat: gcjLat, lng: gcjLng };
  }
  let p = { lat: gcjLat, lng: gcjLng };
  for (let i = 0; i < 8; i++) {
    const q = wgs84ToGcj02(p.lat, p.lng);
    p = {
      lat: p.lat + gcjLat - q[1],
      lng: p.lng + gcjLng - q[0],
    };
  }
  return p;
}

const rad = (x: number) => (x * Math.PI) / 180;

function calculateDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const q =
    Math.sin(rad(a.lat - b.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(a.lng - b.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, q)));
}

function calculateDestination(
  p: { lat: number; lng: number },
  km: number,
  angle: number
): { lat: number; lng: number } {
  const d = km / 6371;
  const l = rad(p.lat);
  const g = rad(p.lng);
  const lat = Math.asin(Math.sin(l) * Math.cos(d) + Math.cos(l) * Math.sin(d) * Math.cos(angle));
  const lng =
    g + Math.atan2(Math.sin(angle) * Math.sin(d) * Math.cos(l), Math.cos(d) - Math.sin(l) * Math.sin(lat));
  return {
    lat: (lat * 180) / Math.PI,
    lng: (((lng * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * 点位去重覆盖面积与重叠率多点蒙特卡洛球面测算
 */
export function calculateCoverageAnalysis(points: Point[]): CoverageAnalysis {
  if (!points.length) {
    return { union: 0, multi: 0, rows: [] };
  }

  let union = 0;
  let multi = 0;
  const rows: AnalysisRow[] = points.map((p) => ({
    area: 2 * Math.PI * 6371 ** 2 * (1 - Math.cos(p.r / 6371)),
    unique: 0,
  }));

  const N = 2400; // 每个圆等面积采样点数
  points.forEach((p, i) => {
    let unique = 0;
    const weight = rows[i].area / N;
    for (let j = 0; j < N; j++) {
      const q = calculateDestination(p, p.r * Math.sqrt((j + 0.5) / N), j * 2.3999632297);
      const hits = points.reduce((n, t) => n + (calculateDistanceKm(q, t) <= t.r ? 1 : 0), 0);
      union += weight / hits;
      if (hits > 1) {
        multi += weight / hits;
      } else {
        unique++;
      }
    }
    rows[i].unique = unique / N;
  });

  return { union, multi, rows };
}

export interface MapThemeConfig {
  id: string;
  name: string;
  style: string;
  dotColor: string;
  isDark?: boolean;
}

export const MAP_THEMES: MapThemeConfig[] = [
  { id: "dark", name: "幻影黑", style: "amap://styles/dark", dotColor: "#18181b", isDark: true },
  { id: "darkblue", name: "极光蓝", style: "amap://styles/darkblue", dotColor: "#0f172a", isDark: true },
  { id: "normal", name: "经典标准", style: "amap://styles/normal", dotColor: "#f1f5f9" },
  { id: "whitesmoke", name: "远山黛", style: "amap://styles/whitesmoke", dotColor: "#e2e8f0" },
  { id: "grey", name: "雅士灰", style: "amap://styles/grey", dotColor: "#cbd5e1" },
  { id: "fresh", name: "草色青", style: "amap://styles/fresh", dotColor: "#dcfce7" },
];

export function getGaodeNavUrl(point: Point): string {
  const [lng, lat] = wgs84ToGcj02(point.lat, point.lng);
  return `https://uri.amap.com/navigation?to=${encodeURIComponent(`${lng},${lat},${point.name}`)}&mode=car&coordinate=gaode&callnative=1`;
}

export const POINT_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

/**
 * 计算行政区多边形边界的视觉几何质心（Centroid）
 * 筛选点数最多或面积最大的主岛轮廓，按 Green 公式与加权质心算法计算
 * 完美解决区政府驻地（POI）偏离行政区几何正中心的问题
 */
export function calculatePolygonCentroid(boundaries: any[]): [number, number] | null {
  if (!boundaries || !Array.isArray(boundaries) || boundaries.length === 0) return null;

  // 1. 寻找点数最多的主多边形（避免取到离岛、飞地或细碎碎片）
  let mainPath: any[] = [];
  let maxPoints = -1;

  for (const b of boundaries) {
    if (!b) continue;
    const ring = Array.isArray(b) ? b : [];
    if (ring.length > maxPoints) {
      maxPoints = ring.length;
      mainPath = ring;
    }
  }

  if (mainPath.length < 3) return null;

  // 2. 统一提取标准经纬度坐标 [lng, lat]
  const coords: [number, number][] = [];
  for (const pt of mainPath) {
    if (!pt) continue;
    if (Array.isArray(pt) && pt.length >= 2) {
      coords.push([Number(pt[0]), Number(pt[1])]);
    } else if (typeof pt.getLng === "function" && typeof pt.getLat === "function") {
      coords.push([pt.getLng(), pt.getLat()]);
    } else if (typeof pt.lng === "number" && typeof pt.lat === "number") {
      coords.push([pt.lng, pt.lat]);
    }
  }

  if (coords.length < 3) return null;

  // 3. 计算多边形面积质心 (Polygon Centroid)
  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  const n = coords.length;

  for (let i = 0; i < n; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[(i + 1) % n];
    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }

  signedArea *= 0.5;

  // 计算包围盒供合理性校验或兜底
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  if (Math.abs(signedArea) > 1e-8) {
    cx /= (6 * signedArea);
    cy /= (6 * signedArea);

    // 检查质心是否在包围盒合理范围内
    if (cx >= minLng && cx <= maxLng && cy >= minLat && cy <= maxLat) {
      return [cx, cy];
    }
  }

  // 凹多边形极端情况或面积异常，采用包围盒中心
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}
