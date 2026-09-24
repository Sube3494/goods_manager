"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { format, subDays } from "date-fns";
import {
  BadgeDollarSign,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Loader2,
  Megaphone,
  PackageOpen,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import type { AutoPickOrder, DashboardBusinessTrendPoint, DashboardProductSalesItem, Shop, StatsData } from "@/lib/types";
import { cn, getPlatformMeta } from "@/lib/utils";
import { OrderCard, OrderCardErrorBoundary } from "@/app/orders/OrderCard";

const money = (value: number) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const integer = (value: number) => Math.round(Number(value || 0)).toLocaleString("zh-CN");
const percent = (value: number) => `${Number.isFinite(value) ? (value * 100).toFixed(1) : "0.0"}%`;

const resolvePlatformMeta = (platform?: string | null) => {
  return (
    getPlatformMeta(platform) || {
      name: platform || "其他",
      iconSrc: "/platform/其他.svg",
      className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20",
    }
  );
};

type MetricCardProps = {
  label: string;
  value: string;
  hint: string;
  badge?: { label: string; tone: "positive" | "caution" | "neutral" };
  icon: ReactNode;
  tone: "sky" | "violet" | "emerald" | "amber" | "rose" | "indigo";
};

const tones = {
  sky: {
    bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20",
    glow: "dark:from-sky-500/5",
    border: "hover:border-sky-500/30",
  },
  violet: {
    bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20",
    glow: "dark:from-violet-500/5",
    border: "hover:border-violet-500/30",
  },
  emerald: {
    bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    glow: "dark:from-emerald-500/5",
    border: "hover:border-emerald-500/30",
  },
  amber: {
    bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    glow: "dark:from-amber-500/5",
    border: "hover:border-amber-500/30",
  },
  rose: {
    bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
    glow: "dark:from-rose-500/5",
    border: "hover:border-rose-500/30",
  },
  indigo: {
    bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20",
    glow: "dark:from-indigo-500/5",
    border: "hover:border-indigo-500/30",
  },
};

function MetricValueDisplay({ value }: { value: string }) {
  if (value.startsWith("¥")) {
    const raw = value.slice(1);
    const [intPart, decPart] = raw.split(".");
    return (
      <div className="flex items-baseline font-mono tracking-tight text-foreground">
        <span className="mr-0.5 text-[11px] font-bold text-muted-foreground/80 sm:text-sm">¥</span>
        <span className="text-[19px] font-black tabular-nums sm:text-[22px] xl:text-[21px]">{intPart}</span>
        {decPart !== undefined ? (
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground/70 sm:text-xs">.{decPart}</span>
        ) : null}
      </div>
    );
  }

  if (value.endsWith("x")) {
    const num = value.slice(0, -1);
    return (
      <div className="flex items-baseline font-mono tracking-tight text-foreground">
        <span className="text-[19px] font-black tabular-nums sm:text-[22px] xl:text-[21px]">{num}</span>
        <span className="ml-0.5 text-[11px] font-bold text-muted-foreground/80 sm:text-sm">x</span>
      </div>
    );
  }

  if (value.endsWith("%")) {
    const num = value.slice(0, -1);
    return (
      <div className="flex items-baseline font-mono tracking-tight text-foreground">
        <span className="text-[19px] font-black tabular-nums sm:text-[22px] xl:text-[21px]">{num}</span>
        <span className="ml-0.5 text-[11px] font-bold text-muted-foreground/80 sm:text-sm">%</span>
      </div>
    );
  }

  return <span className="text-[19px] font-black tabular-nums text-foreground sm:text-[22px] xl:text-[21px]">{value}</span>;
}

function MetricCard({ label, value, hint, badge, icon, tone }: MetricCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-[18px] sm:rounded-[20px] border border-black/8 bg-white/80 p-3 sm:p-4 shadow-xs backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5 bg-linear-to-b from-transparent to-transparent",
        tones[tone].border,
        tones[tone].glow
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] sm:text-[11px] sm:tracking-[0.12em] text-muted-foreground">{label}</span>
            {badge ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.2 text-[9px] font-bold shadow-2xs",
                  badge.tone === "positive"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : badge.tone === "caution"
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    : "bg-black/5 text-muted-foreground dark:bg-white/10 border border-black/6 dark:border-white/10"
                )}
              >
                {badge.label}
              </span>
            ) : null}
          </div>
          <div className={cn("flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 shadow-2xs", tones[tone].bg)}>
            {icon}
          </div>
        </div>

        <div className="mt-2 sm:mt-2.5 flex items-baseline" title={value}>
          <MetricValueDisplay value={value} />
        </div>
      </div>

      <p className="mt-2 sm:mt-2.5 truncate text-[10px] sm:text-[11px] font-medium text-muted-foreground" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-6", className)}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
        </div>
        {action ? <div className="w-full shrink-0 sm:w-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default function MarketingAnalysisPage() {
  const { showToast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const [preset, setPreset] = useState("30d");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(today);
  const [shopName, setShopName] = useState("");
  const [shops, setShops] = useState<Shop[]>([]);
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(10);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<DashboardProductSalesItem | null>(null);
  const [relatedOrders, setRelatedOrders] = useState<AutoPickOrder[]>([]);
  const [relatedOrdersLoading, setRelatedOrdersLoading] = useState(false);
  const [relatedOrdersError, setRelatedOrdersError] = useState("");
  const [expandedRelatedOrderIds, setExpandedRelatedOrderIds] = useState<string[]>([]);
  const [isRelatedContentReady, setIsRelatedContentReady] = useState(false);
  const [relatedOrderPlatform, setRelatedOrderPlatform] = useState("");

  useEffect(() => {
    fetch("/api/shops?source=shipping-addresses", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("shops"))))
      .then((result) => setShops(Array.isArray(result?.shops) ? result.shops : []))
      .catch(() => setShops([]));
  }, []);

  const loadData = useCallback(
    async (quiet = true) => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ startDate, endDate });
        if (shopName) query.set("shopName", shopName);
        const response = await fetch(`/api/stats?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("stats");
        setData(await response.json());
        setLastUpdated(new Date());
        if (!quiet) showToast("营销数据已更新", "success");
      } catch {
        showToast("营销数据加载失败，请稍后重试", "error");
      } finally {
        setLoading(false);
      }
    },
    [endDate, shopName, showToast, startDate]
  );

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  const applyPreset = (value: string) => {
    setPreset(value);
    if (value === "custom") return;
    const days = Number(value.replace("d", ""));
    setEndDate(today);
    setStartDate(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
  };

  const channelRows = useMemo(() => {
    return Object.entries(data?.platformBusinessTrend || {})
      .map(([platform, points]) => {
        const list = points as DashboardBusinessTrendPoint[];
        const orders = list.reduce((sum, point) => sum + Number(point.trueOrderCount || 0), 0);
        const profit = list.reduce((sum, point) => sum + Number(point.pureProfit ?? point.netProfit ?? 0), 0);
        const promotion = list.reduce((sum, point) => sum + Number(point.promotionExpense || 0), 0);
        return { platform, orders, profit, promotion };
      })
      .filter((row) => row.orders > 0 || row.profit !== 0)
      .sort((a, b) => b.orders - a.orders);
  }, [data]);

  const shopRows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const point of data?.businessTrend || []) {
      for (const [name, value] of Object.entries(point.shopPureProfit || {})) {
        totals.set(name, (totals.get(name) || 0) + Number(value || 0));
      }
    }
    return Array.from(totals, ([name, profit]) => ({ name, profit }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 6);
  }, [data]);

  const customer = data?.customerAnalysis;
  const trueOrders = Number(data?.platformMatrix?.trueOrderTotal || 0);
  const revenue = Number(data?.userPaid || 0);
  const promotion = Number(data?.promotionExpense || 0);
  const roas = promotion > 0 ? revenue / promotion : 0;
  const averageOrder = trueOrders > 0 ? revenue / trueOrders : 0;
  const hasData = Boolean(data && (trueOrders > 0 || revenue > 0 || (data.businessTrend?.length || 0) > 0));
  const maxShopProfit = Math.max(...shopRows.map((item) => Math.abs(item.profit)), 1);
  const productSales = data?.productSales;
  const productRows = useMemo(() => productSales?.items || [], [productSales]);

  const filteredProductRows = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return productRows;
    return productRows.filter((item) =>
      [item.productName, item.sku, item.shopName, ...Object.keys(item.platformQuantities || {})].some((value) =>
        String(value || "").toLowerCase().includes(keyword)
      )
    );
  }, [productRows, productSearch]);

  const productTotalPages = Math.max(1, Math.ceil(filteredProductRows.length / productPageSize));
  const visibleProductRows = filteredProductRows.slice((productPage - 1) * productPageSize, productPage * productPageSize);

  useEffect(() => {
    setProductPage(1);
    setSelectedProduct(null);
  }, [startDate, endDate, shopName, productSearch]);

  useEffect(() => {
    if (productPage > productTotalPages) setProductPage(productTotalPages);
  }, [productPage, productTotalPages]);

  useEffect(() => {
    if (!selectedProduct) {
      setRelatedOrders([]);
      setRelatedOrdersError("");
      setExpandedRelatedOrderIds([]);
      setRelatedOrderPlatform("");
      return;
    }
    const orderIds = Array.from(new Set(selectedProduct.orders.map((order) => order.id).filter(Boolean)));
    let cancelled = false;
    setRelatedOrdersLoading(true);
    setRelatedOrdersError("");
    setExpandedRelatedOrderIds([]);
    Promise.all(
      Array.from({ length: Math.ceil(orderIds.length / 100) }, (_, index) => {
        const ids = orderIds.slice(index * 100, (index + 1) * 100);
        return fetch(`/api/orders?ids=${encodeURIComponent(ids.join(","))}&pageSize=${ids.length}&_lite=1&_marketing=1`, { cache: "no-store" }).then(
          async (response) => {
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error || "读取关联订单失败");
            return Array.isArray(result?.items) ? (result.items as AutoPickOrder[]) : [];
          }
        );
      })
    )
      .then((groups) => {
        if (!cancelled) {
          const uniqueOrders = Array.from(new Map(
            groups.flat().map((order) => [String(order.orderNo || order.sourceId || order.id), order])
          ).values());
          setRelatedOrders(uniqueOrders.sort((a, b) => new Date(b.orderTime).getTime() - new Date(a.orderTime).getTime()));
        }
      })
      .catch((error) => {
        if (!cancelled) setRelatedOrdersError(error instanceof Error ? error.message : "读取关联订单失败");
      })
      .finally(() => {
        if (!cancelled) setRelatedOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProduct]);

  const relatedOrderPlatformOptions = useMemo(() => Array.from(new Set(relatedOrders.map((order) => order.platform).filter(Boolean))).sort(), [relatedOrders]);
  const visibleRelatedOrders = useMemo(() => relatedOrderPlatform
    ? relatedOrders.filter((order) => order.platform === relatedOrderPlatform)
    : relatedOrders, [relatedOrderPlatform, relatedOrders]);

  useEffect(() => {
    if (!selectedProduct) {
      setIsRelatedContentReady(false);
      return;
    }
    const timer = window.setTimeout(() => setIsRelatedContentReady(true), 150);
    return () => window.clearTimeout(timer);
  }, [selectedProduct]);

  // 支持键盘 ESC 退出弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedProduct) {
        setSelectedProduct(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct]);

  return (
    <div className="relative min-w-0 space-y-5 px-1 pb-10 sm:space-y-6">
      {/* 顶部全局控制栏：标题 + 数据同步指示 + 快捷周期 + 日期范围 + 店铺筛选 + 刷新 */}
      <div className="rounded-[24px] sm:rounded-[28px] border border-black/8 bg-white/75 p-3.5 sm:p-5 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          {/* 第一行：标题 + 图标 + 更新状态指示 + 移动端专属快捷刷新按钮 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 shadow-xs dark:bg-sky-500/20 dark:text-sky-400">
                <ChartNoAxesCombined size={20} className="sm:h-[22px] sm:w-[22px]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-black tracking-tight text-foreground sm:text-2xl">营销分析</h1>
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-black/6 bg-black/3 px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-white/8 dark:bg-white/5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", loading ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
                    <span>{loading ? "同步中..." : lastUpdated ? `更新于 ${format(lastUpdated, "HH:mm")}` : "等待数据"}</span>
                  </div>
                </div>
                <p className="hidden sm:block mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">商品销量走势、各平台投放转化与客户复购全景洞察</p>
                <div className="sm:hidden flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", loading ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
                  <span>{loading ? "同步中..." : lastUpdated ? `${format(lastUpdated, "HH:mm")} 更新` : "等待数据"}</span>
                </div>
              </div>
            </div>

            {/* 移动端紧凑圆纽刷新按钮 */}
            <button
              onClick={() => loadData(false)}
              disabled={loading}
              className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-foreground shadow-2xs transition-all hover:bg-black/4 active:scale-95 disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
              title="刷新数据"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-primary" : ""} />
            </button>
          </div>

          {/* 全局筛选工具条：移动端流式规整排列，桌面端水平展开 */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            {/* 快捷周期切换胶囊：移动端全宽 3 等分 */}
            <div className="grid grid-cols-3 sm:flex h-9 items-center rounded-full border border-black/8 bg-white/80 p-0.5 shadow-2xs dark:border-white/10 dark:bg-white/5" aria-label="快捷周期">
              {[
                { value: "7d", label: "7天" },
                { value: "30d", label: "30天" },
                { value: "90d", label: "90天" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyPreset(option.value)}
                  className={cn(
                    "flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold transition-all duration-150",
                    preset === option.value
                      ? "bg-foreground text-background shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-black/3 dark:hover:bg-white/5"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* 移动端两列并排：店铺筛选 + 日期范围 */}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
              {/* 店铺筛选下拉框 */}
              <div className="relative min-w-0">
                <Store size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" />
                <CustomSelect
                  value={shopName}
                  onChange={setShopName}
                  options={[{ value: "", label: "全部店铺" }, ...shops.map((shop) => ({ value: shop.name, label: shop.name }))]}
                  className="h-9 w-full sm:w-38"
                  triggerClassName="h-9 rounded-full border-black/8 bg-white/80 pl-8 pr-3 text-xs shadow-2xs dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                />
              </div>

              {/* 日期选择器胶囊：无多余✕，不截断 */}
              <div className="flex h-9 items-center rounded-full border border-black/8 bg-white/80 px-2 shadow-2xs dark:border-white/10 dark:bg-white/5 min-w-0" aria-label="日期范围">
                <CalendarDays size={13} className="shrink-0 text-muted-foreground ml-0.5" />
                <DatePicker
                  value={startDate}
                  onChange={(value) => {
                    setPreset("custom");
                    setStartDate(value);
                  }}
                  maxDate={endDate}
                  isCompact
                  showClear={false}
                  className="min-w-0 flex-1"
                  triggerClassName="h-7 border-0 bg-transparent px-1 text-xs shadow-none font-medium dark:bg-transparent"
                />
                <span className="text-[10px] text-muted-foreground/60 shrink-0">—</span>
                <DatePicker
                  value={endDate}
                  onChange={(value) => {
                    setPreset("custom");
                    setEndDate(value);
                  }}
                  minDate={startDate}
                  maxDate={today}
                  isCompact
                  showClear={false}
                  className="min-w-0 flex-1"
                  triggerClassName="h-7 border-0 bg-transparent px-1 text-xs shadow-none font-medium dark:bg-transparent"
                />
                {preset === "custom" ? (
                  <span className="ml-1 hidden sm:inline-block rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-bold text-primary shrink-0">自定义</span>
                ) : null}
              </div>
            </div>

            {/* 桌面端刷新按钮 */}
            <button
              onClick={() => loadData(false)}
              disabled={loading}
              className="hidden lg:inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-black/8 bg-white/80 px-4 text-xs font-bold text-foreground shadow-2xs transition-all duration-150 hover:bg-black/4 active:scale-95 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span>刷新</span>
            </button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex min-h-100 flex-col items-center justify-center gap-3 rounded-[28px] border border-black/8 bg-white/75 p-12 text-muted-foreground shadow-xs dark:border-white/10 dark:bg-white/4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <p className="text-xs font-medium">正在深度分析全渠道营销数据...</p>
        </div>
      ) : !hasData ? (
        <Panel title="营销数据看板" subtitle="按所选周期与店铺汇总分析">
          <div className="flex min-h-72 flex-col items-center justify-center rounded-[20px] border border-dashed border-black/10 p-8 text-center dark:border-white/10">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/3 text-muted-foreground dark:bg-white/5">
              <Megaphone size={26} />
            </div>
            <h2 className="mt-4 text-base font-bold text-foreground">所选周期内暂无营销数据</h2>
            <p className="mt-1.5 text-xs text-muted-foreground">可尝试切换时间跨度至 90 天，或选择“全部店铺”查看。</p>
          </div>
        </Panel>
      ) : (
        <>
          {/* 6 大核心 KPI 概览指标卡片 */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
            <MetricCard
              label="销售实收"
              value={money(revenue)}
              hint={`共 ${integer(trueOrders)} 笔真实订单`}
              icon={<CircleDollarSign size={16} />}
              tone="sky"
            />
            <MetricCard
              label="推广投入"
              value={money(promotion)}
              hint="活动投放与平台推广"
              icon={<Megaphone size={16} />}
              tone="violet"
            />
            <MetricCard
              label="营销投产比"
              value={promotion > 0 ? `${roas >= 100 ? roas.toFixed(1) : roas.toFixed(2)}x` : "—"}
              hint={promotion > 0 ? "实收 ÷ 推广费" : "暂无推广费用"}
              badge={promotion > 0 ? { label: roas >= 3 ? "高效" : "偏低", tone: roas >= 3 ? "positive" : "caution" } : undefined}
              icon={<Target size={16} />}
              tone="emerald"
            />
            <MetricCard
              label="平均客单价"
              value={money(averageOrder)}
              hint="实收 ÷ 真实订单数"
              icon={<ShoppingBag size={16} />}
              tone="amber"
            />
            <MetricCard
              label="新客占比"
              value={percent(customer?.newRate || 0)}
              hint={`${integer(customer?.newCustomerOrders || 0)} 笔新客订单`}
              icon={<Users size={16} />}
              tone="rose"
            />
            <MetricCard
              label="复购率"
              value={percent(customer?.returningRate || 0)}
              hint={`${integer(customer?.returningCustomerOrders || 0)} 笔老客复购`}
              badge={customer && customer.totalKnownOrders > 0 ? { label: customer.returningRate >= 0.3 ? "稳定" : "待提升", tone: customer.returningRate >= 0.3 ? "positive" : "neutral" } : undefined}
              icon={<BadgeDollarSign size={16} />}
              tone="indigo"
            />
          </div>

          {/* 商品销售分析：排行榜 + 专属搜索框 + 关联订单查看 */}
          <Panel
            title="商品销售分析"
            subtitle={`累计售出 ${integer(productSales?.totalQuantity || 0)} 件 · 覆盖 ${integer(productSales?.productCount || 0)} 个门店商品 · 按真实销售出库统计`}
            action={
              <div className="relative w-full sm:w-84 md:w-96">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/75" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="搜索商品名称、货号..."
                  className="h-10 sm:h-11 w-full rounded-full border border-black/8 bg-white/90 pl-10 pr-9 text-xs sm:text-sm text-foreground shadow-2xs outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/6 dark:focus:bg-white/10 dark:focus:border-white/20"
                />
                {productSearch ? (
                  <button
                    type="button"
                    onClick={() => setProductSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    title="清空搜索"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            }
          >
            {productRows.length ? (
              <div className="min-w-0">
                {filteredProductRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-160 text-left">
                      <thead>
                        <tr className="border-b border-black/6 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground dark:border-white/8">
                          <th className="w-12 pb-3 pl-2">排名</th>
                          <th className="pb-3">商品档案</th>
                          <th className="pb-3 text-center">销量 (件)</th>
                          <th className="pb-3 text-center">订单数</th>
                          <th className="pb-3 text-center">当前库存</th>
                          <th className="w-16 pb-3 text-right pr-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProductRows.map((item, visibleIndex) => {
                          const index = (productPage - 1) * productPageSize + visibleIndex;
                          return (
                            <tr
                              key={item.shopProductId || `${item.shopName}-${item.sku || ""}-${item.productName}`}
                              tabIndex={0}
                              role="button"
                              onClick={() => setSelectedProduct(item)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") setSelectedProduct(item);
                              }}
                              className="group cursor-pointer border-b border-black/4 transition-colors duration-150 last:border-0 hover:bg-black/3 dark:border-white/6 dark:hover:bg-white/4"
                            >
                              {/* 排名列：Top 3 荣耀金属质感微徽章 */}
                              <td className="py-3.5 pl-2">
                                <span
                                  className={cn(
                                    "inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black tabular-nums transition-transform duration-150 group-hover:scale-105",
                                    index === 0
                                      ? "bg-linear-to-br from-amber-400 to-amber-600 text-white shadow-xs shadow-amber-500/30"
                                      : index === 1
                                      ? "bg-linear-to-br from-slate-400 to-slate-600 text-white shadow-xs shadow-slate-500/20"
                                      : index === 2
                                      ? "bg-linear-to-br from-amber-700 to-amber-900 text-white shadow-xs shadow-amber-800/20"
                                      : "bg-black/4 text-muted-foreground dark:bg-white/8"
                                  )}
                                >
                                  {index + 1}
                                </span>
                              </td>

                              {/* 商品档案 */}
                              <td className="max-w-105 py-3.5 pr-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-black/2 dark:border-white/10 dark:bg-white/4">
                                    {item.image ? (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img
                                        src={item.image}
                                        alt=""
                                        loading="lazy"
                                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                        onError={(e) => {
                                          e.currentTarget.style.display = "none";
                                        }}
                                      />
                                    ) : (
                                      <PackageOpen size={18} className="text-muted-foreground/40" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary" title={item.productName}>
                                      {item.productName}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      {item.sku ? (
                                        <span className="inline-flex items-center rounded-md border border-black/6 bg-black/3 px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground dark:border-white/8 dark:bg-white/6">
                                          {item.sku}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground/60">未绑定货号</span>
                                      )}
                                      <span className="inline-flex items-center rounded-md border border-sky-500/15 bg-sky-500/8 px-1.5 py-0.2 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                                        {item.shopName}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 销量 */}
                              <td className="py-3.5 text-center text-sm font-black tabular-nums text-sky-600 dark:text-sky-400">
                                {integer(item.quantity)} <span className="text-[11px] font-normal text-muted-foreground">件</span>
                              </td>

                              {/* 订单数 */}
                              <td className="py-3.5 text-center text-sm font-bold tabular-nums text-foreground">
                                {integer(item.orderCount)} <span className="text-[11px] font-normal text-muted-foreground">单</span>
                              </td>

                              {/* 当前库存 */}
                              <td className={cn(
                                "py-3.5 text-center text-sm font-bold tabular-nums",
                                item.stock === 0
                                  ? "text-rose-500"
                                  : item.stock != null && item.stock <= 10
                                  ? "text-amber-500"
                                  : "text-foreground"
                              )}>
                                {item.stock == null ? "—" : <>{integer(item.stock)} <span className="text-[11px] font-normal text-muted-foreground">件</span></>}
                              </td>

                              {/* 操作/查看指示 */}
                              <td className="py-3.5 text-right pr-2">
                                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/60 transition-all duration-150 group-hover:bg-black/5 group-hover:text-foreground group-hover:translate-x-0.5 dark:group-hover:bg-white/10">
                                  <ChevronRight size={15} />
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex h-44 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <Search size={22} className="mb-2 opacity-40" />
                    <p>没有找到与“{productSearch}”匹配的商品</p>
                    <button
                      type="button"
                      onClick={() => setProductSearch("")}
                      className="mt-2 text-xs font-bold text-primary hover:underline"
                    >
                      清空搜索条件
                    </button>
                  </div>
                )}

                {filteredProductRows.length ? (
                  <Pagination
                    currentPage={productPage}
                    totalPages={productTotalPages}
                    totalItems={filteredProductRows.length}
                    pageSize={productPageSize}
                    onPageChange={setProductPage}
                    onPageSizeChange={(size) => {
                      setProductPageSize(size);
                      setProductPage(1);
                    }}
                    pageSizeOptions={[10, 20, 50, 100]}
                  />
                ) : null}
              </div>
            ) : (
              <div className="flex h-52 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                <PackageOpen className="mb-3 opacity-40" size={32} />
                当前筛选范围暂无已出库的商品销售记录
              </div>
            )}
          </Panel>

          {/* 下半部分三栏：客户构成 + 渠道表现 + 店铺排行 */}
          <div className="grid gap-5 xl:grid-cols-3">
            {/* 1. 客户构成 */}
            <Panel
              title="客户构成"
              subtitle="已识别订单中新客与老客复购分布"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
                <div className="relative mx-auto h-40 w-40 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "新客", value: customer?.newCustomerOrders || 0, color: "#f43f5e" },
                          { name: "老客", value: customer?.returningCustomerOrders || 0, color: "#10b981" },
                          { name: "待识别", value: customer?.unknownCustomerOrders || 0, color: "#94a3b8" },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={46}
                        outerRadius={66}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {["#f43f5e", "#10b981", "#94a3b8"].map((color) => (
                          <Cell key={color} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const p = payload[0];
                            return (
                              <div className="rounded-xl border border-black/8 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/95">
                                <span className="font-bold text-foreground">{p.name}：</span>
                                <span className="font-mono font-bold">{integer(Number(p.value))} 单</span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black tabular-nums text-foreground">{integer(customer?.totalKnownOrders || 0)}</span>
                    <span className="text-[10px] text-muted-foreground">已识别订单</span>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  {[
                    { label: "新客订单", value: customer?.newCustomerOrders || 0, total: customer?.totalKnownOrders || 1, color: "text-rose-500", barColor: "bg-rose-500" },
                    { label: "老客复购", value: customer?.returningCustomerOrders || 0, total: customer?.totalKnownOrders || 1, color: "text-emerald-500", barColor: "bg-emerald-500" },
                    { label: "待识别客户", value: customer?.unknownCustomerOrders || 0, total: trueOrders || 1, color: "text-slate-400", barColor: "bg-slate-400" },
                  ].map((item) => {
                    const rate = item.total > 0 ? (item.value / item.total) * 100 : 0;
                    return (
                      <div key={item.label} className="rounded-[16px] border border-black/6 bg-black/2 p-2.5 dark:border-white/8 dark:bg-white/4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className={cn("font-bold tabular-nums", item.color)}>
                            {integer(item.value)} 单 <span className="text-[10px] font-normal text-muted-foreground">({rate.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                          <div className={cn("h-full rounded-full transition-all duration-300", item.barColor)} style={{ width: `${Math.min(100, Math.max(2, rate))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            {/* 2. 渠道经营表现 */}
            <Panel
              title="渠道经营表现"
              subtitle="按真实订单排序，利润计入履约与推广"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/6 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground dark:border-white/8">
                      <th className="pb-2.5">渠道</th>
                      <th className="pb-2.5 text-right">真实订单</th>
                      <th className="pb-2.5 text-right">渠道利润</th>
                      <th className="pb-2.5 text-right">单均利润</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelRows.map((row) => {
                      const meta = resolvePlatformMeta(row.platform);
                      return (
                        <tr key={row.platform} className="border-b border-black/4 last:border-0 dark:border-white/6">
                          <td className="py-2.5">
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold", meta.className)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={meta.iconSrc}
                                alt={meta.name}
                                className="h-3 w-3 shrink-0 object-contain"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                              <span>{meta.name}</span>
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-xs font-bold tabular-nums text-foreground">{integer(row.orders)} 单</td>
                          <td className={cn("py-2.5 text-right text-xs font-black tabular-nums", row.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                            {row.profit >= 0 ? `+${money(row.profit)}` : money(row.profit)}
                          </td>
                          <td className="py-2.5 text-right text-xs font-bold tabular-nums text-muted-foreground">
                            {money(row.orders ? row.profit / row.orders : 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>

            {/* 3. 店铺利润贡献 */}
            <Panel title="店铺利润贡献" subtitle="周期内各经营店铺产生的纯利润排行">
              {shopRows.length ? (
                <div className="space-y-3">
                  {shopRows.map((shop, index) => {
                    const ratio = Math.max(3, (Math.abs(shop.profit) / maxShopProfit) * 100);
                    return (
                      <div key={shop.name} className="group">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md bg-black/4 font-mono text-[10px] font-bold text-muted-foreground dark:bg-white/8">
                              {index + 1}
                            </span>
                            <span className="truncate font-bold text-foreground" title={shop.name}>
                              {shop.name}
                            </span>
                          </div>
                          <span className={cn("font-black tabular-nums text-xs", shop.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                            {shop.profit >= 0 ? `+${money(shop.profit)}` : money(shop.profit)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                          <div
                            className={cn("h-full rounded-full transition-all duration-300", shop.profit >= 0 ? "bg-linear-to-r from-sky-500 to-emerald-500" : "bg-rose-500")}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-44 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                  <Store className="mb-2 opacity-40" size={24} />
                  暂无匹配的店铺利润明细
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      {/* 商品关联订单弹窗：遵循系统 Dialog 规范 */}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {selectedProduct ? (
                <div className="fixed inset-0 z-80 flex items-center justify-center p-3 sm:p-4">
                  {/* 背景半透明遮罩 */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/45 backdrop-blur-sm"
                    onClick={() => setSelectedProduct(null)}
                  />

                  {/* 弹窗主体 */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    className="relative z-10 flex h-[min(90dvh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-black/10 bg-white text-foreground shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-[#111827]"
                  >
                    {/* 弹窗头部：商品概览 */}
                    <div className="flex items-center justify-between gap-4 border-b border-black/8 px-5 py-4 dark:border-white/10 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/5">
                          {selectedProduct.image ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={selectedProduct.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <PackageOpen size={20} className="text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-bold text-foreground" title={selectedProduct.productName}>
                            {selectedProduct.productName}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {selectedProduct.sku ? (
                              <span className="inline-flex items-center rounded-md border border-black/6 bg-black/3 px-1.5 py-0.2 font-mono text-[10px] text-foreground dark:border-white/8 dark:bg-white/6">
                                {selectedProduct.sku}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center rounded-md border border-sky-500/15 bg-sky-500/8 px-1.5 py-0.2 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                              {selectedProduct.shopName}
                            </span>
                            <span>·</span>
                            <span>{selectedProduct.orders.length} 笔关联订单</span>
                            <span>·</span>
                            <span className="font-bold text-sky-600 dark:text-sky-400">共售出 {integer(selectedProduct.quantity)} 件</span>
                          </div>
                        </div>
                      </div>

                      {/* 关闭按钮 */}
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(null)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                        aria-label="关闭"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* 订单卡片列表区 */}
                    <div className="overflow-y-auto overscroll-contain bg-black/2 p-4 dark:bg-black/20 sm:p-6">
                      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 font-bold text-foreground">
                          <FileText size={14} className="text-sky-500" />
                          <span>相关销售订单（{relatedOrdersLoading ? "读取中..." : relatedOrderPlatform ? `${visibleRelatedOrders.length} / ${relatedOrders.length} 笔` : `${relatedOrders.length} 笔`}）</span>
                        </div>
                        <CustomSelect
                          value={relatedOrderPlatform}
                          onChange={setRelatedOrderPlatform}
                          options={[{ value: "", label: "全部渠道" }, ...relatedOrderPlatformOptions.map((platform) => ({ value: platform, label: platform }))]}
                          className="h-8 w-32"
                          triggerClassName="h-full rounded-full bg-background px-3 text-[11px] shadow-none dark:border-white/10 dark:bg-white/5"
                        />
                      </div>

                      {relatedOrdersLoading || !isRelatedContentReady ? (
                        <div className="flex h-52 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Loader2 size={20} className="animate-spin text-primary" />
                          <span>正在同步读取完整订单详情...</span>
                        </div>
                      ) : relatedOrdersError ? (
                        <div className="rounded-[20px] border border-dashed border-rose-500/30 bg-rose-500/5 py-12 text-center text-xs text-rose-500">
                          {relatedOrdersError}
                        </div>
                      ) : visibleRelatedOrders.length ? (
                        <div className="grid gap-4">
                          {visibleRelatedOrders.map((order) => (
                            <OrderCardErrorBoundary key={order.id} orderNo={order.orderNo || order.id}>
                              <OrderCard
                                order={order}
                                expanded={expandedRelatedOrderIds.includes(order.id)}
                                actingId=""
                                readOnly
                                showFullOrderNo
                                onToggleExpanded={(orderId) =>
                                  setExpandedRelatedOrderIds((current) =>
                                    current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
                                  )
                                }
                                onRunAction={() => {}}
                                onOpenCostBackfill={() => {}}
                                onOpenMatchEditor={() => {}}
                              />
                            </OrderCardErrorBoundary>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-[20px] border border-dashed border-black/10 py-12 text-center text-xs text-muted-foreground dark:border-white/10">
                          {relatedOrderPlatform ? `当前商品没有 ${relatedOrderPlatform} 订单` : "暂无可读取的关联订单记录"}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  );
}
