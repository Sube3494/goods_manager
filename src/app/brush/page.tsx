"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Package,
  PenSquare,
  ShoppingBag,
  Sparkles,
  Tags,
  TrendingUp,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";

const PLATFORM_COLORS = ["#41d18d", "#5ba7ff", "#f3b34c", "#fb7185"];

type DashboardStats = {
  brushProductCount: number;
  todayPlanItemCount: number;
  todayShopCount: number;
  averageItemsPerShop: number;
  todayOrderCount: number;
  todayPayment: number;
  todayReceived: number;
  todayCommission: number;
  todayExpense: number;
  orderCount: number;
  payment: number;
  received: number;
  commission: number;
  expense: number;
};

type DailyAggregate = {
  dateKey: string;
  label: string;
  payment: number;
  received: number;
  commission: number;
  expense: number;
  count: number;
};

type DailyShopAggregate = DailyAggregate & {
  shopName: string;
};

type BrushDashboardPayload = {
  stats: DashboardStats;
  shops: string[];
  orderDaily: DailyAggregate[];
  orderDailyByShop: DailyShopAggregate[];
};

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  brushProductCount: 0,
  todayPlanItemCount: 0,
  todayShopCount: 0,
  averageItemsPerShop: 0,
  todayOrderCount: 0,
  todayPayment: 0,
  todayReceived: 0,
  todayCommission: 0,
  todayExpense: 0,
  orderCount: 0,
  payment: 0,
  received: 0,
  commission: 0,
  expense: 0,
};

function DashboardCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-border/70 bg-white/95 p-5 shadow-sm dark:bg-white/[0.04] sm:p-6",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-black tracking-tight sm:text-lg">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "default",
  href,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Package;
  accent?: "default" | "success";
  href?: string;
}) {
  const content = (
    <div className="rounded-[24px] border border-border/60 bg-black/[0.015] px-4 py-4 dark:bg-white/[0.025] sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/50 bg-background/60">
          <Icon size={16} className="text-muted-foreground" />
        </div>
      </div>
      <div
        className={cn(
          "mt-3 text-2xl font-black tracking-tight sm:text-[30px]",
          accent === "success" && "text-emerald-500"
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      className="block transition-transform duration-200 hover:-translate-y-0.5"
    >
      {content}
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function formatCurrency(value: number) {
  return `￥${value.toFixed(2)}`;
}

function formatExpenseCurrency(value: number) {
  return `-￥${Math.abs(value).toFixed(2)}`;
}

function formatYAxisAmount(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function PointValueDot({
  cx,
  cy,
  value,
  color,
  labelOffset = 18,
  formatter = formatYAxisAmount,
  showLabel = true,
}: {
  cx?: number;
  cy?: number;
  value?: number | string;
  color: string;
  labelOffset?: number;
  formatter?: (value: number) => string;
  showLabel?: boolean;
}) {
  if (typeof cx !== "number" || typeof cy !== "number" || typeof value !== "number") return null;

  const label = formatter(value);
  const y = cy - labelOffset;

  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      {showLabel && (
        <text
          x={cx}
          y={y}
          textAnchor="middle"
          fill="#f8fafc"
          fontSize="10"
          fontWeight="700"
          stroke="rgba(15,23,42,0.9)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ExpenseTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color?: string; payload?: { roi: number; received: number; payment: number } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[200px] rounded-[22px] border border-white/10 bg-slate-950/92 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <div className="text-lg font-black text-white">{label}</div>
      <div className="mt-3 space-y-2 text-sm">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-slate-300">{item.name}</span>
            </div>
            <span className="font-bold text-white">{formatExpenseCurrency(Number(item.value))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BrushCenterPage() {
  const { user, isLoading: userLoading } = useUser();
  const canManageBrush = hasPermission(user as SessionUser | null, "brush:manage");
  const hasAnyAccess = canManageBrush;

  const [dashboardData, setDashboardData] = useState<BrushDashboardPayload>({
    stats: EMPTY_DASHBOARD_STATS,
    shops: [],
    orderDaily: [],
    orderDailyByShop: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState("all");
  const [selectedRange, setSelectedRange] = useState("14");
  const [isCompactView, setIsCompactView] = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [isExpenseChartOpen, setIsExpenseChartOpen] = useState(true);
  const [isShopChartOpen, setIsShopChartOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const updateView = () => setIsCompactView(media.matches);

    updateView();
    media.addEventListener("change", updateView);
    return () => media.removeEventListener("change", updateView);
  }, []);

  useEffect(() => {
    if (userLoading) return;
    if (!hasAnyAccess) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      try {
        const dashboardRes = canManageBrush ? await fetch("/api/brush/dashboard") : null;
        if (cancelled) return;

        if (dashboardRes?.ok) {
          const data = await dashboardRes.json();
          setDashboardData({
            stats: data?.stats || EMPTY_DASHBOARD_STATS,
            shops: Array.isArray(data?.shops) ? data.shops : [],
            orderDaily: Array.isArray(data?.orderDaily) ? data.orderDaily : [],
            orderDailyByShop: Array.isArray(data?.orderDailyByShop) ? data.orderDailyByShop : [],
          });
        }
      } catch (error) {
        console.error("Failed to fetch brush center data:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [canManageBrush, hasAnyAccess, userLoading]);

  useEffect(() => {
    if (isLoading || userLoading) {
      setShowCharts(false);
      return;
    }

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (!cancelled) setShowCharts(true);
      }, isCompactView ? 120 : 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [isCompactView, isLoading, userLoading]);

  const stats = dashboardData.stats;

  const shopOptions = useMemo(() => {
    return [
      { value: "all", label: "全部店铺" },
      ...dashboardData.shops.map((shop) => ({ value: shop, label: shop })),
    ];
  }, [dashboardData.shops]);

  const filteredOrderDaily = useMemo(() => {
    const source = selectedShop === "all"
      ? dashboardData.orderDaily
      : dashboardData.orderDailyByShop.filter((item) => item.shopName === selectedShop);
    const latestDate = source.reduce<string | null>((max, item) => {
      return !max || item.dateKey > max ? item.dateKey : max;
    }, null);

    let startBoundary = "";
    if (latestDate && selectedRange !== "all") {
      const end = new Date(`${latestDate}T00:00:00`);
      const days = Number(selectedRange);
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1));
      startBoundary = start.toISOString().slice(0, 10);
    }

    return source.filter((item) => !startBoundary || item.dateKey >= startBoundary);
  }, [dashboardData.orderDaily, dashboardData.orderDailyByShop, selectedRange, selectedShop]);

  const orderTrendData = useMemo(
    () => filteredOrderDaily.slice(-14),
    [filteredOrderDaily]
  );

  const expenseTrendByShop = useMemo(() => {
    const topShops = Array.from(
      dashboardData.orderDailyByShop.reduce((map, item) => {
        map.set(item.shopName, (map.get(item.shopName) || 0) + item.expense);
        return map;
      }, new Map<string, number>())
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const byDate = new Map<string, Record<string, string | number>>();

    dashboardData.orderDailyByShop.forEach((item) => {
      if (!topShops.includes(item.shopName)) return;
      const current = byDate.get(item.dateKey) || { label: item.label };
      current[item.shopName] = Number(current[item.shopName] || 0) + item.expense;
      byDate.set(item.dateKey, current);
    });

    return {
      shops: topShops,
      data: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([, value]) => value),
    };
  }, [dashboardData.orderDailyByShop]);

  const orderChartHighlights = useMemo(() => {
    if (orderTrendData.length === 0) return [];

    const latest = orderTrendData[orderTrendData.length - 1];
    const peak = orderTrendData.reduce((max, current) => (current.expense > max.expense ? current : max), orderTrendData[0]);
    const total = orderTrendData.reduce((sum, current) => sum + current.expense, 0);
    const rangeHint =
      selectedRange === "all"
        ? `全部时间，实际 ${orderTrendData.length} 天有数据`
        : `近 ${selectedRange} 天内，实际 ${orderTrendData.length} 天有数据`;

    return [
      { label: "最新支出", value: formatExpenseCurrency(latest.expense), hint: latest.label },
      { label: "峰值日期", value: formatExpenseCurrency(peak.expense), hint: peak.label },
      { label: "区间总支出", value: formatExpenseCurrency(total), hint: rangeHint },
    ];
  }, [orderTrendData, selectedRange]);

  const latestShopExpense = useMemo(() => {
    if (expenseTrendByShop.data.length === 0) return [];

    const latest = expenseTrendByShop.data[expenseTrendByShop.data.length - 1];
    return expenseTrendByShop.shops
      .map((shop, index) => ({
        shop,
        value: Number(latest[shop] || 0),
        color: PLATFORM_COLORS[index % PLATFORM_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenseTrendByShop.data, expenseTrendByShop.shops]);

  const shouldShowShopExpenseLabel = useCallback((shop: string, index: number) => {
    const series = expenseTrendByShop.data.map((item) => Number(item[shop] || 0));

    if (series.length <= 2) return true;
    if (index === 0 || index === series.length - 1) return true;

    const current = series[index];
    const prev = series[index - 1];
    const next = series[index + 1];
    const min = Math.min(...series);
    const max = Math.max(...series);

    if (current === min || current === max) return true;

    const isLocalPeak = current > prev && current > next;
    const isLocalValley = current < prev && current < next;

    return !isCompactView && (isLocalPeak || isLocalValley);
  }, [expenseTrendByShop.data, isCompactView]);

  const metricCards = useMemo(
    () => [
      {
        label: "刷单商品",
        value: String(stats.brushProductCount),
        hint: "已挑入专用商品池",
        icon: Tags,
        href: "/brush-products",
      },
      {
        label: "今日刷单",
        value: `${stats.todayShopCount} 店`,
        hint:
          stats.todayShopCount > 0
            ? `每店 ${Number.isInteger(stats.averageItemsPerShop) ? stats.averageItemsPerShop : stats.averageItemsPerShop.toFixed(1)} 单`
            : "今天还没安排刷单",
        icon: ShoppingBag,
        href: "/brush-plans",
      },
      {
        label: "今日录单",
        value: `${stats.todayOrderCount} 笔`,
        hint: stats.todayOrderCount > 0 ? "今天已录入的刷单订单" : "今天还没有录单",
        icon: CreditCard,
        href: "/brush-orders",
      },
      {
        label: "今日支出",
        value: formatExpenseCurrency(stats.todayExpense),
        hint: `差额 ${formatExpenseCurrency(stats.todayPayment - stats.todayReceived)} / 佣金 ${formatExpenseCurrency(stats.todayCommission)}`,
        icon: TrendingUp,
        href: "/brush-orders",
      },
    ],
    [stats]
  );

  if (userLoading || isLoading) {
    return <div className="py-24 text-center text-muted-foreground">正在生成刷单看板...</div>;
  }

  if (!hasAnyAccess) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted/30">
          <Sparkles size={36} className="text-muted-foreground/40" />
        </div>
        <h1 className="mb-2 text-2xl font-black">暂无刷单权限</h1>
        <p className="text-sm text-muted-foreground">您当前没有刷单中心相关权限，请联系管理员开通。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-border/60 bg-linear-to-br from-white/95 via-white/90 to-white/80 p-6 shadow-sm dark:from-white/[0.05] dark:via-white/[0.035] dark:to-transparent sm:p-7">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)] xl:items-stretch">
          <div className="rounded-[28px] border border-border/50 bg-black/[0.02] p-5 dark:bg-white/[0.02] sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/6 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-primary/80">
              <Activity size={12} />
              Brush Dashboard
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-[40px]">刷单中心</h1>
            <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
              这里先看排单密度、金额走势和店铺表现；常用操作直接放在左下，不用再先找入口。
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                今日计划 {stats.todayPlanItemCount} 单
              </div>
              <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                今日录单 {stats.todayOrderCount} 笔
              </div>
              <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                主支出店铺 {expenseTrendByShop.shops[0] || "--"}
              </div>
            </div>
          </div>

          {canManageBrush && (
            <>
              <div className="hidden self-stretch md:grid md:grid-cols-2 md:gap-3">
                {metricCards.map((card) => (
                  <MetricCard key={card.label} {...card} />
                ))}
              </div>

              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 md:hidden">
                {metricCards.map((card) => (
                  <div key={card.label} className="min-w-[220px] shrink-0">
                    <MetricCard {...card} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Link
            href="/brush-products"
            className="group rounded-[22px] border border-border/60 bg-black/[0.02] px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.06] dark:bg-white/[0.02]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">去选刷单商品</div>
                <div className="mt-1 text-sm text-muted-foreground">维护商品池，排单时直接取用。</div>
              </div>
              <Tags size={16} className="text-primary" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-xl font-black">{stats.brushProductCount}</div>
                <div className="text-xs text-muted-foreground">当前商品数</div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                商品池
                <ArrowRight size={14} />
              </span>
            </div>
          </Link>

          <Link
            href="/brush-plans"
            className="group rounded-[22px] border border-border/60 bg-black/[0.02] px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.06] dark:bg-white/[0.02]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">去排今日任务</div>
                <div className="mt-1 text-sm text-muted-foreground">按店铺安排任务，确认今天的节奏。</div>
              </div>
              <ShoppingBag size={16} className="text-primary" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-xl font-black">{stats.todayPlanItemCount}</div>
                <div className="text-xs text-muted-foreground">今天计划单量</div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                排单
                <ArrowRight size={14} />
              </span>
            </div>
          </Link>

          <Link
            href="/brush-orders"
            className="group rounded-[22px] border border-border/60 bg-black/[0.02] px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.06] dark:bg-white/[0.02]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">去录入订单</div>
                <div className="mt-1 text-sm text-muted-foreground">同步实付、返款和佣金变化。</div>
              </div>
              <PenSquare size={16} className="text-primary" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                <div className="text-xl font-black">{stats.todayOrderCount}</div>
                <div className="text-xs text-muted-foreground">今日已录单</div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                录单
                <ArrowRight size={14} />
              </span>
            </div>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-5 2xl:grid-cols-[minmax(0,1.28fr)_minmax(360px,0.72fr)]">
        <div className="space-y-5">
          {canManageBrush && (
            <DashboardCard
              title={selectedRange === "all" ? "全部支出走势" : `近 ${selectedRange} 天支出走势`}
              subtitle="先选店铺，再切换最近时间范围，直接看这一段的支出变化。"
              action={
                isCompactView ? (
                  <button
                    type="button"
                    onClick={() => setIsExpenseChartOpen((prev) => !prev)}
                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border/60 px-3 py-1.5 text-xs font-bold text-muted-foreground"
                  >
                    {isExpenseChartOpen ? "收起" : "展开"}
                    {isExpenseChartOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                ) : (
                  <Link
                    href="/brush-orders"
                    className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-primary/80"
                  >
                    订单明细
                    <ArrowRight size={15} />
                  </Link>
                )
              }
            >
              {(!isCompactView || isExpenseChartOpen) && orderChartHighlights.length > 0 && (
                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {orderChartHighlights.map((item) => (
                    <div key={item.label} className="rounded-[20px] border border-border/50 bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                      <div className="mt-2 text-lg font-black">{item.value}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
                    </div>
                  ))}
                </div>
              )}

              {!isCompactView || isExpenseChartOpen ? (
                <>
                  <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[22px] border border-border/60 bg-muted/10 px-3 py-3 sm:px-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">筛选</div>

                    <CustomSelect
                      options={shopOptions}
                      value={selectedShop}
                      onChange={setSelectedShop}
                      triggerClassName="h-10 min-w-[144px] rounded-2xl border-border/70 bg-background/80 px-3 text-sm font-semibold"
                      className="w-[144px]"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { value: "7", label: "7天" },
                        { value: "14", label: "14天" },
                        { value: "30", label: "30天" },
                        { value: "all", label: "全部" },
                      ].map((range) => (
                        <button
                          key={range.value}
                          type="button"
                          onClick={() => setSelectedRange(range.value)}
                          className={cn(
                            "inline-flex h-10 items-center rounded-2xl border px-3 text-sm font-semibold transition-all",
                            selectedRange === range.value
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border/70 bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground"
                          )}
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>

                    {(selectedShop !== "all" || selectedRange !== "14") && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShop("all");
                          setSelectedRange("14");
                        }}
                        className="inline-flex h-10 items-center rounded-2xl border border-border/70 px-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-background hover:text-foreground"
                      >
                        重置
                      </button>
                    )}
                  </div>

                  {orderTrendData.length > 0 ? (
                    showCharts ? (
                    <div className={cn("h-[320px]", isCompactView && "h-[240px]")}>
                      <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={orderTrendData} margin={{ top: 28, right: 18, left: 8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#fb7185" stopOpacity={0.24} />
                              <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "currentColor", fontSize: 12 }} />
                          <YAxis
                            width={56}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: "currentColor", fontSize: 12 }}
                            tickFormatter={formatYAxisAmount}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 18,
                              border: "1px solid rgba(148,163,184,0.18)",
                              background: "rgba(15,23,42,0.92)",
                            }}
                            isAnimationActive={false}
                            formatter={(value: number | string | undefined, name: string | undefined) => [
                              formatCurrency(Number(value ?? 0)),
                              name ?? "",
                            ]}
                          />
                          {!isCompactView && <Legend />}
                          <Area
                            type="monotone"
                            dataKey="expense"
                            name="总支出"
                            stroke="#fb7185"
                            strokeWidth={3.2}
                            fill="url(#expenseFill)"
                            dot={(props) => (
                              <PointValueDot
                                {...props}
                                color="#fb7185"
                                labelOffset={isCompactView ? 10 : 16}
                                formatter={formatExpenseCurrency}
                              />
                            )}
                            activeDot={{ r: 5, strokeWidth: 0, fill: "#fb7185" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="payment"
                            name="实付"
                            stroke="#5ba7ff"
                            strokeWidth={2.6}
                            strokeDasharray="0"
                            dot={(props) => (
                              <PointValueDot
                                {...props}
                                color="#5ba7ff"
                                labelOffset={isCompactView ? 14 : 20}
                                formatter={formatCurrency}
                              />
                            )}
                          />
                          <Line
                            type="monotone"
                            dataKey="commission"
                            name="佣金"
                            stroke="#f3b34c"
                            strokeWidth={2.4}
                            strokeDasharray="6 6"
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    ) : (
                      <div className={cn("h-[320px] rounded-[22px] border border-border/50 bg-muted/10", isCompactView && "h-[240px]")} />
                    )
                  ) : (
                    <EmptyState message="当前筛选条件下没有订单数据，换个店铺或日期范围试试。" />
                  )}
                </>
              ) : (
                <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  已收起趋势图，展开后再看筛选和曲线。
                </div>
              )}
            </DashboardCard>
          )}

        </div>

        <DashboardCard
          title="店铺支出曲线"
          subtitle="看不同店铺最近支出变化，能更直接判断哪家在持续放量。"
          className="flex h-full flex-col"
          action={
            isCompactView ? (
              <button
                type="button"
                onClick={() => setIsShopChartOpen((prev) => !prev)}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border/60 px-3 py-1.5 text-xs font-bold text-muted-foreground"
              >
                {isShopChartOpen ? "收起" : "展开"}
                {isShopChartOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : undefined
          }
        >
          {canManageBrush && latestShopExpense.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {latestShopExpense.map((item) => (
                <div key={item.shop} className="rounded-[18px] border border-border/50 bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.shop}
                    </div>
                    <div className="text-base font-black">{formatExpenseCurrency(item.value)}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">最新一天支出</div>
                </div>
              ))}
            </div>
          )}

          {!isCompactView || isShopChartOpen ? (
            canManageBrush ? (
              expenseTrendByShop.data.length > 0 ? (
                showCharts ? (
                <div className={cn("mt-2 h-[320px] w-full", isCompactView && "h-[240px]")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={expenseTrendByShop.data} margin={{ top: 18, right: 62, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "currentColor", fontSize: 12 }}
                      />
                      <YAxis
                        width={56}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "currentColor", fontSize: 12 }}
                        tickFormatter={formatYAxisAmount}
                      />
                      <Tooltip content={<ExpenseTooltip />} isAnimationActive={false} />
                      {!isCompactView && <Legend />}
                      {expenseTrendByShop.shops.map((shop, index) => (
                        <Line
                          key={shop}
                          type="monotone"
                          dataKey={shop}
                          name={shop}
                          stroke={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                          strokeWidth={3}
                          dot={(props) => (
                            <PointValueDot
                              {...props}
                              color={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                              labelOffset={isCompactView ? 10 : 14}
                              formatter={formatExpenseCurrency}
                              showLabel={shouldShowShopExpenseLabel(shop, props.index ?? -1)}
                            />
                          )}
                          activeDot={{ r: 5, strokeWidth: 0, fill: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                ) : (
                  <div className={cn("mt-2 h-[320px] rounded-[22px] border border-border/50 bg-muted/10", isCompactView && "h-[240px]")} />
                )
              ) : (
                <EmptyState message="还没有足够的订单数据，后续这里会按店铺展示支出曲线。" />
              )
            ) : null
          ) : (
            <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
              已收起店铺曲线，展开后再看各店最近支出。
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
