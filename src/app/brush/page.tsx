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
  BarChart3,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Package,
  PenSquare,
  RotateCcw,
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
  brushProductCountByShop: Array<{ shopName: string; count: number }>;
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
  icon: Icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: typeof Activity;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "group relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-4 shadow-sm backdrop-blur-md transition-all hover:border-border/80 dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:rounded-[32px] sm:p-6",
        className
      )}
    >
      {/* 保持与上方卡片一致的微妙环境光晕 */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/6 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-sky-500/4 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {Icon && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-2xs">
                <Icon size={14} />
              </div>
            )}
            <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          </div>
          {subtitle && <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="relative mt-4 sm:mt-5">{children}</div>
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
  value: React.ReactNode;
  hint: string;
  icon: typeof Package;
  accent?: "default" | "success";
  href?: string;
}) {
  const content = (
    <div className="rounded-[22px] border border-border/60 bg-black/[0.015] px-4 py-3.5 backdrop-blur-xs transition-all hover:border-primary/30 dark:bg-white/[0.025] sm:rounded-[24px] sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/70 shadow-2xs sm:h-9 sm:w-9">
          <Icon size={16} className="text-muted-foreground" />
        </div>
      </div>
      <div
        className={cn(
          "mt-2.5 text-xl font-black tracking-tight sm:mt-3 sm:text-[30px]",
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
    <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-6 text-center text-sm text-muted-foreground sm:rounded-[26px]">
      {message}
    </div>
  );
}

function ChartLoadingState({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[22px] border border-dashed border-border/60 bg-muted/10 px-4 text-sm text-muted-foreground sm:rounded-[26px]",
        compact ? "h-[220px]" : "h-[360px]"
      )}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <div>{message}</div>
      </div>
    </div>
  );
}

function InlineLegend({
  items,
  compact = false,
}: {
  items: Array<{ label: string; color: string; dashed?: boolean }>;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-muted-foreground",
        compact ? "mb-2 text-[11px]" : "mb-3 text-xs"
      )}
    >
      {items.map((item) => (
        <div key={`${item.label}-${item.color}`} className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-block rounded-full",
              compact ? "h-[3px] w-5" : "h-[4px] w-6",
              item.dashed && "bg-transparent"
            )}
            style={
              item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 6px, transparent 6px 10px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          <span>{item.label}</span>
        </div>
      ))}
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
    <div className="min-w-[156px] rounded-[18px] border border-white/10 bg-slate-950/92 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
      <div className="text-sm font-semibold text-white">{label}</div>
      <div className="mt-2 space-y-1.5 text-xs">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-slate-300">{item.name}</span>
            </div>
            <span className="font-medium text-white">{formatExpenseCurrency(Number(item.value))}</span>
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
    brushProductCountByShop: [],
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
  const [selectedShopMetric, setSelectedShopMetric] = useState<"count" | "payment" | "expense">("count");
  const [selectedShopView, setSelectedShopView] = useState("all");
  const [isShopMetricChartOpen, setIsShopMetricChartOpen] = useState(false);
  const [isViewportReady, setIsViewportReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 767px)");
    const updateView = () => {
      const compact = media.matches;
      setIsCompactView(compact);
      setIsViewportReady(true);
      setIsExpenseChartOpen((current) => (compact ? false : current || true));
      setIsShopMetricChartOpen((current) => (compact ? false : current));
    };

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
            brushProductCountByShop: Array.isArray(data?.brushProductCountByShop) ? data.brushProductCountByShop : [],
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
    if (isLoading || userLoading || !isViewportReady) {
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
  }, [isCompactView, isLoading, isViewportReady, userLoading]);

  const stats = dashboardData.stats;
  const brushProductShopSummary = useMemo(() => {
    const counts = dashboardData.brushProductCountByShop;
    if (counts.length <= 1) {
      return {
        value: String(stats.brushProductCount),
        hint: "已挑入专用商品池",
        compact: null as React.ReactNode,
      };
    }

    return {
      value: (
        <div className="space-y-1 text-base leading-tight sm:text-lg">
          {counts.map((item) => (
            <div key={item.shopName} className="break-all">
              {item.shopName} {item.count}
            </div>
          ))}
        </div>
      ),
      hint: "按店铺分别统计刷单商品数",
      compact: (
        <div className="flex flex-wrap gap-1.5">
          {counts.map((item) => (
            <span
              key={item.shopName}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs"
            >
              <span className="max-w-[110px] truncate">{item.shopName}</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">{item.count}</span>
            </span>
          ))}
        </div>
      ),
    };
  }, [dashboardData.brushProductCountByShop, stats.brushProductCount]);

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

  const selectedRangeLimit = useMemo(() => {
    if (selectedRange === "all") return undefined;
    const days = Number(selectedRange);
    return Number.isFinite(days) ? days : undefined;
  }, [selectedRange]);

  const orderTrendData = useMemo(
    () => (selectedRangeLimit ? filteredOrderDaily.slice(-selectedRangeLimit) : filteredOrderDaily),
    [filteredOrderDaily, selectedRangeLimit]
  );

  const countTrendByShop = useMemo(() => {
    const source =
      selectedShopView === "all"
        ? dashboardData.orderDailyByShop
        : dashboardData.orderDailyByShop.filter((item) => item.shopName === selectedShopView);

    const topShops = selectedShopView === "all"
      ? Array.from(
          source.reduce((map, item) => {
            map.set(item.shopName, (map.get(item.shopName) || 0) + item.count);
            return map;
          }, new Map<string, number>())
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name]) => name)
      : [selectedShopView];

    const byDate = new Map<string, Record<string, string | number>>();

    source.forEach((item) => {
      if (!topShops.includes(item.shopName)) return;
      const current = byDate.get(item.dateKey) || { label: item.label };
      current[item.shopName] = Number(current[item.shopName] || 0) + item.count;
      byDate.set(item.dateKey, current);
    });

    return {
      shops: topShops,
      data: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(selectedRangeLimit ? -selectedRangeLimit : undefined)
        .map(([, value]) => value),
    };
  }, [dashboardData.orderDailyByShop, selectedRangeLimit, selectedShopView]);

  const paymentTrendByShopView = useMemo(() => {
    const source =
      selectedShopView === "all"
        ? dashboardData.orderDailyByShop
        : dashboardData.orderDailyByShop.filter((item) => item.shopName === selectedShopView);

    const topShops = selectedShopView === "all"
      ? Array.from(
          source.reduce((map, item) => {
            map.set(item.shopName, (map.get(item.shopName) || 0) + item.payment);
            return map;
          }, new Map<string, number>())
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name]) => name)
      : [selectedShopView];

    const byDate = new Map<string, Record<string, string | number>>();

    source.forEach((item) => {
      if (!topShops.includes(item.shopName)) return;
      const current = byDate.get(item.dateKey) || { label: item.label };
      current[item.shopName] = Number(current[item.shopName] || 0) + item.payment;
      byDate.set(item.dateKey, current);
    });

    return {
      shops: topShops,
      data: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(selectedRangeLimit ? -selectedRangeLimit : undefined)
        .map(([, value]) => value),
    };
  }, [dashboardData.orderDailyByShop, selectedRangeLimit, selectedShopView]);

  const expenseTrendByShopView = useMemo(() => {
    const source =
      selectedShopView === "all"
        ? dashboardData.orderDailyByShop
        : dashboardData.orderDailyByShop.filter((item) => item.shopName === selectedShopView);

    const topShops = selectedShopView === "all"
      ? Array.from(
          source.reduce((map, item) => {
            map.set(item.shopName, (map.get(item.shopName) || 0) + item.expense);
            return map;
          }, new Map<string, number>())
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name]) => name)
      : [selectedShopView];

    const byDate = new Map<string, Record<string, string | number>>();

    source.forEach((item) => {
      if (!topShops.includes(item.shopName)) return;
      const current = byDate.get(item.dateKey) || { label: item.label };
      current[item.shopName] = Number(current[item.shopName] || 0) + item.expense;
      byDate.set(item.dateKey, current);
    });

    return {
      shops: topShops,
      data: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(selectedRangeLimit ? -selectedRangeLimit : undefined)
        .map(([, value]) => value),
    };
  }, [dashboardData.orderDailyByShop, selectedRangeLimit, selectedShopView]);

  const shopMetricOptions = useMemo(
    () => [
      { value: "count", label: "刷单量" },
      { value: "payment", label: "刷单实付" },
      { value: "expense", label: "店铺支出" },
    ] as const,
    []
  );

  const shopMetricConfig = useMemo(() => {
    if (selectedShopMetric === "payment") {
      return {
        title: "分店铺走势",
        subtitle: "按店铺切换查看刷单实付、店铺支出和单量变化。",
        empty: "还没有足够的订单数据，后续这里会按店铺展示刷单实付走势。",
        collapsed: "已收起店铺刷单实付走势，展开后再看各店最近刷单实付。",
        loading: isCompactView ? "正在准备店铺刷单实付..." : "正在加载店铺刷单实付...",
        data: paymentTrendByShopView.data,
        shops: paymentTrendByShopView.shops,
        formatter: (value: number) => formatCurrency(value),
        tooltipName: "刷单实付",
        yAxisWidth: 56,
      };
    }
    if (selectedShopMetric === "expense") {
      return {
        title: "分店铺走势",
        subtitle: "按店铺切换查看刷单实付、店铺支出和单量变化。",
        empty: "还没有足够的订单数据，后续这里会按店铺展示支出走势。",
        collapsed: "已收起店铺支出走势，展开后再看各店最近支出。",
        loading: isCompactView ? "正在准备店铺支出走势..." : "正在加载店铺支出走势...",
        data: expenseTrendByShopView.data,
        shops: expenseTrendByShopView.shops,
        formatter: (value: number) => formatExpenseCurrency(value),
        tooltipName: "店铺支出",
        yAxisWidth: 56,
      };
    }
    return {
      title: "分店铺走势",
      subtitle: "按店铺切换查看刷单实付、店铺支出和刷单量变化。",
      empty: "还没有足够的订单数据，后续这里会按店铺展示刷单量走势。",
      collapsed: "已收起店铺刷单量走势，展开后再看各店最近刷单量。",
      loading: isCompactView ? "正在准备店铺刷单量走势..." : "正在加载店铺刷单量走势...",
      data: countTrendByShop.data,
      shops: countTrendByShop.shops,
      formatter: (value: number) => `${Math.round(value)} 笔`,
      tooltipName: "店铺刷单量",
      yAxisWidth: 40,
    };
  }, [countTrendByShop.data, countTrendByShop.shops, expenseTrendByShopView.data, expenseTrendByShopView.shops, isCompactView, paymentTrendByShopView.data, paymentTrendByShopView.shops, selectedShopMetric]);

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

  const orderExpenseCompositionData = useMemo(
    () =>
      orderTrendData.map((item) => ({
        ...item,
        platformCommission: item.payment - item.received,
      })),
    [orderTrendData]
  );

  const summaryItems = useMemo(
    () => [
      {
        label: "商品池",
        value: dashboardData.brushProductCountByShop.length <= 1 ? `${stats.brushProductCount}` : null,
        detail:
          dashboardData.brushProductCountByShop.length <= 1
            ? "当前商品数"
            : null,
        custom: brushProductShopSummary.compact,
        icon: Tags,
        iconColor: "text-violet-500 bg-violet-500/10 dark:text-violet-400 dark:bg-violet-500/15",
        badge: "商品库存",
      },
      {
        label: "今日刷单",
        value: `${stats.todayShopCount} 店 / ${stats.todayPlanItemCount} 单`,
        detail:
          stats.todayShopCount > 0
            ? `每店 ${Number.isInteger(stats.averageItemsPerShop) ? stats.averageItemsPerShop : stats.averageItemsPerShop.toFixed(1)} 单`
            : "今天还没安排刷单",
        icon: Sparkles,
        iconColor: "text-amber-500 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-500/15",
        badge: "安排计划",
      },
      {
        label: "今日录单",
        value: `${stats.todayOrderCount} 笔`,
        detail: stats.todayOrderCount > 0 ? "今天已录入的刷单订单" : "今天还没有录单",
        icon: ShoppingBag,
        iconColor: "text-sky-500 bg-sky-500/10 dark:text-sky-400 dark:bg-sky-500/15",
        badge: "订单核销",
      },
      {
        label: "今日支出",
        value: formatExpenseCurrency(stats.todayExpense),
        detail: `差额 ${formatExpenseCurrency(stats.todayPayment - stats.todayReceived)} / 佣金 ${formatExpenseCurrency(stats.todayCommission)}`,
        icon: CreditCard,
        iconColor: "text-rose-500 bg-rose-500/10 dark:text-rose-400 dark:bg-rose-500/15",
        badge: "资金成本",
      },
    ],
    [brushProductShopSummary.compact, dashboardData.brushProductCountByShop.length, stats]
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
    <div className="space-y-5 sm:space-y-6">
      {/* 顶部 Hero 统计与工作流导航 */}
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:rounded-[32px] sm:px-6 sm:py-5">
        {/* 背景轻微氛围光晕 */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-sky-500/5 blur-3xl" />

        <div className="relative flex flex-col gap-3.5 sm:gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] font-black tracking-tight text-foreground sm:text-[34px]">刷单中心</h1>
              <p className="mt-1 max-w-[56ch] text-xs leading-relaxed text-muted-foreground sm:text-sm">
                先看今天节奏，再决定排单和录单。多店信息合并到一条状态带里，首页只保留真正会用到的入口。
              </p>

              {/* 今日快报微胶囊 */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3.5 py-1 text-xs font-semibold text-foreground/85 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>今日计划 {stats.todayPlanItemCount} 单</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3.5 py-1 text-xs font-semibold text-foreground/85 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                  <span>今日录单 {stats.todayOrderCount} 笔</span>
                </div>
                {stats.todayShopCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3.5 py-1 text-xs font-semibold text-foreground/85 shadow-2xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>覆盖 {stats.todayShopCount} 家店铺</span>
                  </div>
                )}
              </div>
            </div>

            {/* 顶部操作按钮组：向胶囊靠齐 */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <Link
                href="/brush-products"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/85 px-4 text-xs font-bold text-foreground shadow-2xs backdrop-blur-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95 sm:h-10.5 sm:px-5 sm:text-sm"
              >
                <Tags size={15} className="text-primary" />
                <span>商品池</span>
              </Link>
              <Link
                href="/brush-plans"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/85 px-4 text-xs font-bold text-foreground shadow-2xs backdrop-blur-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95 sm:h-10.5 sm:px-5 sm:text-sm"
              >
                <CalendarCheck size={15} className="text-primary" />
                <span>安排表</span>
              </Link>
              <Link
                href="/brush-orders"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 active:scale-95 sm:h-10.5 sm:px-6 sm:text-sm"
              >
                <PenSquare size={15} />
                <span>去录单</span>
              </Link>
            </div>
          </div>

          {/* 4组指标概览卡片 */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
            {summaryItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <div
                  key={item.label}
                  className="group relative overflow-hidden rounded-[20px] border border-border/60 bg-background/60 p-3.5 shadow-2xs backdrop-blur-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xs sm:rounded-[22px] sm:p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{item.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border border-border/50 bg-background/80 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        {item.badge}
                      </span>
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-full transition-transform group-hover:scale-110", item.iconColor)}>
                        <ItemIcon size={14} />
                      </div>
                    </div>
                  </div>
                  {item.custom ? (
                    <div className="mt-2.5">{item.custom}</div>
                  ) : (
                    <>
                      <div className="mt-2 text-xl font-black tracking-tight text-foreground sm:mt-2.5 sm:text-2xl">{item.value}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{item.detail}</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 核心工作流入口卡片 */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 sm:mt-5 sm:gap-3.5">
          <Link
            href="/brush-plans"
            className="group relative overflow-hidden rounded-[22px] border border-border/60 bg-linear-to-br from-background/90 via-background/60 to-primary/5 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:rounded-[26px] sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground sm:text-base">去排今日任务</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">计划编排</span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground sm:text-sm">按店铺安排任务，确认今天的刷单商品与节奏。</div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                <CalendarCheck size={18} />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-border/40 pt-3">
              <div>
                <div className="text-xl font-black text-foreground sm:text-2xl">{stats.todayPlanItemCount}</div>
                <div className="text-[11px] text-muted-foreground sm:text-xs">今天计划单量</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/25">
                <span>进入排单</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>

          <Link
            href="/brush-orders"
            className="group relative overflow-hidden rounded-[22px] border border-border/60 bg-linear-to-br from-background/90 via-background/60 to-sky-500/5 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md sm:rounded-[26px] sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground sm:text-base">去录入订单</span>
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-400">实付核销</span>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground sm:text-sm">同步实付金额、返款状态及佣金支出变化。</div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 transition-transform group-hover:scale-110 dark:text-sky-400">
                <PenSquare size={18} />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between border-t border-border/40 pt-3">
              <div>
                <div className="text-xl font-black text-foreground sm:text-2xl">{stats.todayOrderCount}</div>
                <div className="text-[11px] text-muted-foreground sm:text-xs">今日已录单</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-4 py-1.5 text-xs font-bold text-sky-600 transition-all group-hover:bg-sky-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-sky-500/25 dark:text-sky-400">
                <span>开始录单</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* 图表展示区 */}
      <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.9fr)] 2xl:grid-cols-[minmax(0,1.34fr)_minmax(460px,0.86fr)]">
        <div className="space-y-4 sm:space-y-5">
          {canManageBrush && (
            <DashboardCard
              title={selectedRange === "all" ? "全部支出走势" : `近 ${selectedRange} 天支出走势`}
              subtitle="先选店铺，再切换最近时间范围，直接看这一段总支出的构成变化。"
              icon={TrendingUp}
              action={
                isCompactView ? (
                  <button
                    type="button"
                    onClick={() => setIsExpenseChartOpen((prev) => !prev)}
                    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/80 px-3.5 py-1.5 text-xs font-bold text-muted-foreground shadow-2xs transition-all hover:border-primary/30 hover:text-foreground active:scale-95"
                  >
                    <span>{isExpenseChartOpen ? "收起" : "展开"}</span>
                    {isExpenseChartOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  <Link
                    href="/brush-orders"
                    className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3.5 py-1.5 text-xs font-bold text-foreground shadow-2xs transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95"
                  >
                    <span>订单明细</span>
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                )
              }
            >
              {(!isCompactView || isExpenseChartOpen) && orderChartHighlights.length > 0 && (
                <div className="mb-3 grid grid-cols-1 gap-2 sm:mb-4 md:grid-cols-3">
                  {orderChartHighlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-border/50 bg-background/50 p-3 shadow-2xs backdrop-blur-xs transition-all hover:border-border sm:rounded-[20px] sm:p-3.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</span>
                      </div>
                      <div className="mt-1.5 text-base font-black text-foreground sm:text-lg">{item.value}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground sm:text-xs">{item.hint}</div>
                    </div>
                  ))}
                </div>
              )}

              {!isCompactView || isExpenseChartOpen ? (
                <>
                  {/* 胶囊化筛选栏 */}
                  <div className="mb-3 rounded-[20px] border border-border/60 bg-background/50 p-2.5 shadow-2xs backdrop-blur-xs sm:mb-4 sm:rounded-[22px] sm:p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                        <div className="w-full sm:w-[136px] shrink-0">
                          <CustomSelect
                            options={shopOptions}
                            value={selectedShop}
                            onChange={setSelectedShop}
                            triggerClassName="h-8.5 sm:h-9 rounded-full border-border/70 bg-background/90 px-3.5 text-xs sm:text-sm font-bold shadow-2xs w-full"
                            className="w-full sm:w-[136px]"
                          />
                        </div>

                        {/* 胶囊药丸时间分段器 */}
                        <div className="inline-flex max-w-full items-center rounded-full border border-border/60 bg-background/60 p-0.5 shadow-2xs backdrop-blur-xs shrink-0">
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
                                "inline-flex h-7.5 sm:h-8 items-center justify-center rounded-full px-2.5 sm:px-3 text-xs font-bold whitespace-nowrap shrink-0 transition-all active:scale-95",
                                selectedRange === range.value
                                  ? "bg-primary text-primary-foreground shadow-xs"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {range.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {(selectedShop !== "all" || selectedRange !== "14") && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedShop("all");
                            setSelectedRange("14");
                          }}
                          className="inline-flex h-7.5 sm:h-8 items-center justify-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 text-xs font-bold whitespace-nowrap shrink-0 text-muted-foreground transition-all hover:border-border hover:bg-background hover:text-foreground active:scale-95 shadow-2xs"
                        >
                          <RotateCcw size={12} />
                          <span>重置</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {orderExpenseCompositionData.length > 0 ? (
                    showCharts ? (
                      <>
                        {isCompactView ? (
                          <InlineLegend
                            compact
                            items={[
                              { label: "总支出", color: "#fb7185" },
                              { label: "平台佣金", color: "#5ba7ff" },
                              { label: "刷单佣金", color: "#f3b34c", dashed: true },
                            ]}
                          />
                        ) : null}
                        <div className={cn("h-[360px]", isCompactView && "h-[220px]")}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={orderExpenseCompositionData} margin={{ top: 20, right: 18, left: 8, bottom: 0 }}>
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
                                formatter={(value, name) => [
                                  formatCurrency(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0)),
                                  name ?? "",
                                ]}
                              />
                              {!isCompactView && <Legend />}
                              <Area
                                type="monotone"
                                dataKey="expense"
                                name="总支出"
                                stroke="#fb7185"
                                strokeWidth={2.2}
                                fill="url(#expenseFill)"
                                dot={{ r: 2.5, fill: "#fb7185", strokeWidth: 0 }}
                                activeDot={{ r: 4, strokeWidth: 0, fill: "#fb7185" }}
                              />
                              <Line
                                type="monotone"
                                dataKey="platformCommission"
                                name="平台佣金"
                                stroke="#5ba7ff"
                                strokeWidth={1.8}
                                strokeDasharray="0"
                                dot={{ r: 2.2, fill: "#5ba7ff", strokeWidth: 0 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="commission"
                                name="刷单佣金"
                                stroke="#f3b34c"
                                strokeWidth={1.6}
                                strokeDasharray="6 6"
                                dot={false}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </>
                    ) : (
                      <ChartLoadingState
                        compact={isCompactView}
                        message={isCompactView ? "正在准备趋势图..." : "正在加载趋势图..."}
                      />
                    )
                  ) : (
                    <EmptyState message="当前筛选条件下没有订单数据，换个店铺或日期范围试试。" />
                  )}
                </>
              ) : (
                <div className="rounded-[22px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground sm:rounded-[26px]">
                  已收起趋势图，展开后再看筛选和曲线。
                </div>
              )}
            </DashboardCard>
          )}
        </div>

        {/* 分店铺走势卡片 */}
        <DashboardCard
          title={shopMetricConfig.title}
          subtitle={shopMetricConfig.subtitle}
          icon={BarChart3}
          className="flex h-full flex-col"
          action={
            isCompactView ? (
              <button
                type="button"
                onClick={() => setIsShopMetricChartOpen((prev) => !prev)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/80 px-3.5 py-1.5 text-xs font-bold text-muted-foreground shadow-2xs transition-all hover:border-primary/30 hover:text-foreground active:scale-95"
              >
                <span>{isShopMetricChartOpen ? "收起" : "展开"}</span>
                {isShopMetricChartOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            ) : undefined
          }
        >
          {!isCompactView || isShopMetricChartOpen ? (
            <>
              {/* 胶囊化分店铺与指标控制栏 */}
              <div className="mb-3 rounded-[22px] border border-border/60 bg-background/50 p-2.5 shadow-2xs backdrop-blur-xs sm:mb-4 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="w-full sm:w-auto min-w-[130px] flex-1 sm:flex-none">
                    <CustomSelect
                      options={[{ value: "all", label: "全部店铺" }, ...dashboardData.shops.map((shop) => ({ value: shop, label: shop }))]}
                      value={selectedShopView}
                      onChange={setSelectedShopView}
                      triggerClassName="h-9 rounded-full border-border/70 bg-background/90 px-3.5 text-xs sm:text-sm font-bold shadow-2xs w-full sm:w-[150px]"
                      className="w-full sm:w-[150px]"
                    />
                  </div>

                  {/* 胶囊药丸指标选择器 */}
                  <div className="inline-flex max-w-full items-center overflow-x-auto rounded-full border border-border/60 bg-background/60 p-0.5 shadow-2xs backdrop-blur-xs shrink-0">
                    {shopMetricOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSelectedShopMetric(option.value)}
                        className={cn(
                          "inline-flex h-8 items-center justify-center rounded-full px-3 sm:px-3.5 text-xs font-bold whitespace-nowrap shrink-0 transition-all active:scale-95",
                          selectedShopMetric === option.value
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {canManageBrush ? (
                shopMetricConfig.data.length > 0 ? (
                  showCharts ? (
                    <>
                      {isCompactView ? (
                        <InlineLegend
                          compact
                          items={shopMetricConfig.shops.map((shop, index) => ({
                            label: shop,
                            color: PLATFORM_COLORS[index % PLATFORM_COLORS.length],
                          }))}
                        />
                      ) : null}
                      <div className={cn("mt-2 h-[360px] w-full xl:h-[440px]", isCompactView && "h-[220px]")}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={shopMetricConfig.data} margin={{ top: 14, right: 20, left: 8, bottom: 0 }}>
                            <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "currentColor", fontSize: 12 }} />
                            <YAxis
                              width={shopMetricConfig.yAxisWidth}
                              tickLine={false}
                              axisLine={false}
                              allowDecimals={selectedShopMetric !== "count"}
                              tick={{ fill: "currentColor", fontSize: 12 }}
                              tickFormatter={selectedShopMetric === "count" ? undefined : formatYAxisAmount}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: 18,
                                border: "1px solid rgba(148,163,184,0.18)",
                                background: "rgba(15,23,42,0.92)",
                              }}
                              isAnimationActive={false}
                              formatter={(value, name) => [shopMetricConfig.formatter(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0)), name ?? shopMetricConfig.tooltipName]}
                            />
                            {!isCompactView && <Legend />}
                            {shopMetricConfig.shops.map((shop, index) => (
                              <Line
                                key={`${selectedShopMetric}-${shop}`}
                                type="monotone"
                                dataKey={shop}
                                name={shop}
                                stroke={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 2.5, fill: PLATFORM_COLORS[index % PLATFORM_COLORS.length], strokeWidth: 0 }}
                                activeDot={{ r: 4, strokeWidth: 0, fill: PLATFORM_COLORS[index % PLATFORM_COLORS.length] }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : (
                    <ChartLoadingState compact={isCompactView} message={shopMetricConfig.loading} />
                  )
                ) : (
                  <EmptyState message={shopMetricConfig.empty} />
                )
              ) : null}
            </>
          ) : (
            <div className="rounded-[22px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground sm:rounded-[26px]">
              {shopMetricConfig.collapsed}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
