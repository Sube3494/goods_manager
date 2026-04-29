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
        "rounded-[24px] border border-border/70 bg-white/95 p-4 shadow-sm dark:bg-white/[0.04] sm:rounded-[28px] sm:p-6",
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
      <div className="mt-4 sm:mt-5">{children}</div>
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
    <div className="rounded-[20px] border border-border/60 bg-black/[0.015] px-3.5 py-3.5 dark:bg-white/[0.025] sm:rounded-[24px] sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/50 bg-background/60 sm:h-9 sm:w-9 sm:rounded-2xl">
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
    <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-muted/10 px-6 text-sm text-muted-foreground">
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
        "flex items-center justify-center rounded-[20px] border border-dashed border-border/60 bg-muted/10 px-4 text-sm text-muted-foreground",
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
    <div className="min-w-[156px] rounded-[16px] border border-white/10 bg-slate-950/92 px-3 py-2.5 shadow-xl backdrop-blur-xl">
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
  const isInitialCompactView = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

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
  const [isCompactView, setIsCompactView] = useState(isInitialCompactView);
  const [showCharts, setShowCharts] = useState(false);
  const [isExpenseChartOpen, setIsExpenseChartOpen] = useState(!isInitialCompactView);
  const [selectedShopMetric, setSelectedShopMetric] = useState<"count" | "payment" | "expense">("count");
  const [selectedShopView, setSelectedShopView] = useState("all");
  const [isShopMetricChartOpen, setIsShopMetricChartOpen] = useState(false);
  const [isViewportReady, setIsViewportReady] = useState(typeof window === "undefined");

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
        <div className="flex flex-wrap gap-2">
          {counts.map((item) => (
            <span
              key={item.shopName}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <span className="max-w-[120px] truncate">{item.shopName}</span>
              <span className="text-muted-foreground">{item.count}</span>
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
        .slice(selectedRangeLimit ? -selectedRangeLimit : undefined)
        .map(([, value]) => value),
    };
  }, [dashboardData.orderDailyByShop, selectedRangeLimit]);
  const paymentTrendByShop = useMemo(() => {
    const topShops = Array.from(
      dashboardData.orderDailyByShop.reduce((map, item) => {
        map.set(item.shopName, (map.get(item.shopName) || 0) + item.payment);
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
  }, [dashboardData.orderDailyByShop, selectedRangeLimit]);
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
      },
      {
        label: "今日刷单",
        value: `${stats.todayShopCount} 店 / ${stats.todayPlanItemCount} 单`,
        detail:
          stats.todayShopCount > 0
            ? `每店 ${Number.isInteger(stats.averageItemsPerShop) ? stats.averageItemsPerShop : stats.averageItemsPerShop.toFixed(1)} 单`
            : "今天还没安排刷单",
      },
      {
        label: "今日录单",
        value: `${stats.todayOrderCount} 笔`,
        detail: stats.todayOrderCount > 0 ? "今天已录入的刷单订单" : "今天还没有录单",
      },
      {
        label: "今日支出",
        value: formatExpenseCurrency(stats.todayExpense),
        detail: `差额 ${formatExpenseCurrency(stats.todayPayment - stats.todayReceived)} / 佣金 ${formatExpenseCurrency(stats.todayCommission)}`,
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
      <section className="rounded-[26px] border border-border/60 bg-linear-to-br from-white/95 via-white/90 to-white/80 p-4 shadow-sm dark:from-white/[0.05] dark:via-white/[0.035] dark:to-transparent sm:rounded-[32px] sm:p-7">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/6 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-primary/80">
                <Activity size={12} />
                Brush Dashboard
              </div>
              <h1 className="mt-3 text-[34px] font-black tracking-tight sm:mt-4 sm:text-[40px]">刷单中心</h1>
              <p className="mt-2 max-w-[50ch] text-[13px] leading-6 text-muted-foreground sm:mt-3 sm:text-base">
                先看今天节奏，再决定排单和录单。多店信息合并到一条状态带里，首页只保留真正会用到的入口。
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  今日计划 {stats.todayPlanItemCount} 单
                </div>
                <div className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  今日录单 {stats.todayOrderCount} 笔
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <Link
                href="/brush-products"
                className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 text-sm font-bold text-foreground transition-all hover:border-primary/30 hover:bg-primary/[0.06] sm:h-11 sm:w-auto sm:rounded-2xl sm:px-5"
              >
                <Tags size={16} className="text-primary" />
                商品池
              </Link>
              <Link
                href="/brush-orders"
                className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-black text-primary-foreground transition-all hover:-translate-y-0.5 sm:h-11 sm:w-auto sm:rounded-2xl sm:px-5"
              >
                <PenSquare size={16} />
                去录单
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-[18px] border border-border/60 bg-black/[0.02] px-3.5 py-3 dark:bg-white/[0.02] sm:rounded-[20px] sm:px-4 sm:py-4"
              >
                <div className="text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase">{item.label}</div>
                {item.custom ? (
                  <div className="mt-2.5">{item.custom}</div>
                ) : (
                  <>
                    <div className="mt-2 text-lg font-black tracking-tight sm:mt-3 sm:text-2xl">{item.value}</div>
                    <div className="mt-1 text-[11px] leading-4.5 text-muted-foreground sm:text-xs">{item.detail}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 sm:mt-5 sm:gap-3">
          <Link
            href="/brush-plans"
            className="group rounded-[18px] border border-border/60 bg-black/[0.02] px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.06] dark:bg-white/[0.02] sm:rounded-[22px] sm:px-4 sm:py-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">去排今日任务</div>
                <div className="mt-1 text-[13px] text-muted-foreground sm:text-sm">按店铺安排任务，确认今天的节奏。</div>
              </div>
              <ShoppingBag size={16} className="text-primary" />
            </div>
            <div className="mt-3 flex items-end justify-between sm:mt-4">
              <div>
                <div className="text-lg font-black sm:text-xl">{stats.todayPlanItemCount}</div>
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
            className="group rounded-[18px] border border-border/60 bg-black/[0.02] px-3.5 py-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.06] dark:bg-white/[0.02] sm:rounded-[22px] sm:px-4 sm:py-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">去录入订单</div>
                <div className="mt-1 text-[13px] text-muted-foreground sm:text-sm">同步实付、返款和佣金变化。</div>
              </div>
              <PenSquare size={16} className="text-primary" />
            </div>
            <div className="mt-3 flex items-end justify-between sm:mt-4">
              <div>
                <div className="text-lg font-black sm:text-xl">{stats.todayOrderCount}</div>
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

      <div className="grid grid-cols-1 items-stretch gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.9fr)] 2xl:grid-cols-[minmax(0,1.34fr)_minmax(460px,0.86fr)]">
        <div className="space-y-4 sm:space-y-5">
          {canManageBrush && (
            <DashboardCard
              title={selectedRange === "all" ? "全部支出走势" : `近 ${selectedRange} 天支出走势`}
              subtitle="先选店铺，再切换最近时间范围，直接看这一段总支出的构成变化。"
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
                <div className="mb-3 grid grid-cols-1 gap-2 sm:mb-4 md:grid-cols-3">
                  {orderChartHighlights.map((item) => (
                    <div key={item.label} className="rounded-[14px] border border-border/50 bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02] sm:rounded-[16px] sm:py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                      <div className="mt-1 text-[15px] font-black sm:mt-1.5 sm:text-base">{item.value}</div>
                      <div className="mt-1 text-[11px] leading-4.5 text-muted-foreground sm:text-xs">{item.hint}</div>
                    </div>
                  ))}
                </div>
              )}

              {!isCompactView || isExpenseChartOpen ? (
                <>
                  <div className="mb-3 flex flex-col gap-2 rounded-[16px] border border-border/60 bg-muted/10 px-3 py-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:rounded-[18px] sm:px-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">筛选</div>

                    <div className="flex items-center gap-2">
                      <CustomSelect
                        options={shopOptions}
                        value={selectedShop}
                        onChange={setSelectedShop}
                        triggerClassName="h-9 rounded-xl border-border/70 bg-background/80 px-3 text-sm font-semibold sm:h-10"
                        className="w-full sm:w-[144px]"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center">
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
                            "inline-flex h-9 items-center justify-center rounded-xl border px-2 text-sm font-semibold transition-all sm:h-10 sm:px-3",
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
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-border/70 px-3 text-sm font-semibold text-muted-foreground transition-all hover:bg-background hover:text-foreground sm:h-10"
                      >
                        重置
                      </button>
                    )}
                  </div>

                  {orderExpenseCompositionData.length > 0 ? (
                    showCharts ? (
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
                <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                  已收起趋势图，展开后再看筛选和曲线。
                </div>
              )}
            </DashboardCard>
          )}

        </div>

        <DashboardCard
          title={shopMetricConfig.title}
          subtitle={shopMetricConfig.subtitle}
          className="flex h-full flex-col"
          action={
            isCompactView ? (
              <button
                type="button"
                onClick={() => setIsShopMetricChartOpen((prev) => !prev)}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border/60 px-3 py-1.5 text-xs font-bold text-muted-foreground"
              >
                {isShopMetricChartOpen ? "收起" : "展开"}
                {isShopMetricChartOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : undefined
          }
        >
          {!isCompactView || isShopMetricChartOpen ? (
            <>
              <div className="mb-3 rounded-[16px] border border-border/60 bg-muted/10 px-3 py-3 sm:mb-4 sm:rounded-[18px] sm:px-4">
                <div className="flex flex-col gap-3 xl:gap-4">
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:gap-3">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">分店铺</div>
                    <CustomSelect
                      options={[{ value: "all", label: "全部店铺" }, ...dashboardData.shops.map((shop) => ({ value: shop, label: shop }))]}
                      value={selectedShopView}
                      onChange={setSelectedShopView}
                      triggerClassName="h-9 rounded-xl border-border/70 bg-background/80 px-3 text-sm font-semibold sm:h-10"
                      className="w-full sm:w-[180px] xl:w-[196px]"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
                  {shopMetricOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSelectedShopMetric(option.value)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center rounded-xl border px-2 text-sm font-semibold transition-all sm:h-10 sm:px-3 xl:min-w-[84px]",
                        selectedShopMetric === option.value
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/70 bg-background/80 text-muted-foreground hover:bg-background hover:text-foreground"
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
                  ) : (
                    <ChartLoadingState compact={isCompactView} message={shopMetricConfig.loading} />
                  )
                ) : (
                  <EmptyState message={shopMetricConfig.empty} />
                )
              ) : null}
            </>
          ) : (
            <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
              {shopMetricConfig.collapsed}
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
