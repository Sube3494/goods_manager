"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shop, StatsData } from "@/lib/types";
import { PromotionCalendarModal } from "@/app/orders/PromotionCalendarModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { RefreshCw, Maximize2, Minimize2, X, Layers, ArrowUpRight, Award, Store, ShieldCheck, Package, UserPlus, UserCheck, HelpCircle } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { format } from "date-fns";
import { cn, getPlatformMeta } from "@/lib/utils";
import { OverviewAiPanel } from "@/components/Dashboard/OverviewAiPanel";

function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  actionMobileStack = false,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actionMobileStack?: boolean;
}) {
  return (
    <section className={cn("rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5", className)}>
      <div className={cn("mb-4 flex gap-4", actionMobileStack ? "flex-col sm:flex-row sm:items-start sm:justify-between" : "items-start justify-between")}>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeroMetric({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "success";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-[20px] border border-black/8 bg-white/80 px-3.5 py-3.5 dark:border-white/10 dark:bg-white/5 sm:px-4 sm:py-4", className)}>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 overflow-hidden text-[clamp(1.25rem,1.7vw,2rem)] font-black leading-none tracking-tight tabular-nums",
          tone === "danger" ? "text-red-500" : tone === "success" ? "text-emerald-500" : "text-foreground"
        )}
      >
        {value}
      </div>
      {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CompactMetric({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "min-w-0 overflow-hidden rounded-[18px] border border-black/8 bg-white/72 px-3 py-3 dark:border-white/10 dark:bg-white/4 sm:px-4 sm:py-3.5 transition-all duration-200",
        onClick ? "cursor-pointer hover:bg-black/3 active:scale-[0.98] dark:hover:bg-white/8" : "",
        className
      )}
    >
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-2 overflow-hidden text-[clamp(1.05rem,1.3vw,1.5rem)] font-black leading-none tracking-tight tabular-nums",
          tone === "danger" ? "text-red-500" : tone === "success" ? "text-emerald-500" : "text-foreground"
        )}
      >
        {value}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const money = (value: number | undefined) =>
  `${Number(value || 0) < 0 ? "-" : ""}¥${Math.abs(Number(value || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const int = (value: number | undefined) => Number(value || 0).toLocaleString();
const percent = (value: number) => `${value.toFixed(1)}%`;

function countDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function amountTooltip(value: unknown) {
  return money(typeof value === "number" ? value : Number(value || 0));
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    name?: string;
    color?: string;
    payload?: {
      pureProfit?: number;
      platformPureProfit?: Record<string, number>;
      shopPureProfit?: Record<string, number>;
      shopPlatformPureProfit?: Record<string, Record<string, number>>;
      promotionExpense?: number;
      brushExpense?: number;
      operatingExpense?: number;
      netProfit?: number;
    };
  }>;
  label?: string;
  valueFormatter?: (value: unknown) => string;
  nameMap?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;

  const dataPoint = payload[0]?.payload;
  const platformProfits = dataPoint?.platformPureProfit || {};
  const platformEntries = Object.entries(platformProfits)
    .filter(([, val]) => val !== 0 || Object.keys(platformProfits).length <= 1)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const shopProfits = dataPoint?.shopPureProfit || {};
  const shopPlatformProfits = dataPoint?.shopPlatformPureProfit || {};
  const shopEntries = Object.entries(shopProfits)
    .filter(([, val]) => val !== 0 || Object.keys(shopProfits).length <= 1)
    .sort(([, a], [, b]) => (b as number) - (a as number));
  const totalPureProfit = Number(dataPoint?.pureProfit ?? 0);
  const promotionExpense = Number(dataPoint?.promotionExpense ?? 0);
  const brushExpense = Number(dataPoint?.brushExpense ?? 0);
  const operatingExpense = Number(dataPoint?.operatingExpense ?? 0);
  const netProfit = Number(dataPoint?.netProfit ?? (totalPureProfit - promotionExpense - brushExpense - operatingExpense));
  
  const expectedNetProfit = totalPureProfit - promotionExpense - brushExpense - operatingExpense;
  const otherExpense = Number((expectedNetProfit - netProfit).toFixed(2));

  return (
    <div className="relative z-1000 -translate-y-1/2 pointer-events-none min-w-50 max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto rounded-[22px] border border-black/8 bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 font-normal sm:min-w-52.5 sm:p-3.5">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label} 盈亏明细</span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">数据拆分</span>
      </div>

      <div className="mt-2.5 space-y-2">
        {platformEntries.length > 0 ? (
          platformEntries.map(([platform, amount]) => {
            const meta = getPlatformMeta(platform);
            return (
              <div key={platform} className="flex items-center justify-between gap-4 text-xs font-normal">
                <span className="text-slate-700 dark:text-slate-300 font-normal">
                  {meta?.name || platform}订单纯利:
                </span>
                <span className={cn("font-normal tabular-nums", (amount as number) < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                  {money(amount as number)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-muted-foreground py-1 text-center font-normal">暂无订单纯利润明细</div>
        )}

        {shopEntries.length > 0 ? (
          <div className="space-y-1.5 rounded-2xl bg-slate-100/70 p-2 dark:bg-white/5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">店铺利润</div>
            {shopEntries.map(([shop, amount]) => (
              <div key={shop} className="rounded-xl bg-white/60 px-2 py-1.5 dark:bg-slate-950/30">
                <div className="flex items-center justify-between gap-4 text-xs font-normal">
                  <span className="max-w-32.5 truncate text-slate-700 dark:text-slate-300 font-normal">{shop}</span>
                  <span className={cn("font-normal tabular-nums", (amount as number) < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
                    {money(amount as number)}
                  </span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {["美团", "京东", "淘宝", "抖店", "线下交易"].map((platform) => {
                    const platformAmount = shopPlatformProfits[shop]?.[platform] || 0;
                    return (
                      <span key={platform} className="flex items-center justify-between gap-1">
                        <span>{platform}</span>
                        <span className={cn("tabular-nums", platformAmount < 0 ? "text-rose-500" : "text-slate-600 dark:text-slate-300")}>
                          {money(platformAmount)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 text-xs border-t border-dashed border-black/10 dark:border-white/10 pt-2.5 mt-2 font-normal">
          <span className="text-slate-600 dark:text-slate-400 font-normal">订单纯利润小计:</span>
          <span className={cn("tabular-nums font-semibold", totalPureProfit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
            {money(totalPureProfit)}
          </span>
        </div>

        {promotionExpense > 0 && (
          <div className="flex items-center justify-between gap-4 text-xs font-normal text-amber-600 dark:text-amber-400">
            <span>扣除推广费:</span>
            <span className="tabular-nums font-semibold">-{money(promotionExpense)}</span>
          </div>
        )}

        {brushExpense > 0 && (
          <div className="flex items-center justify-between gap-4 text-xs font-normal text-rose-500">
            <span>扣除刷单支出:</span>
            <span className="tabular-nums font-semibold">-{money(brushExpense)}</span>
          </div>
        )}

        {operatingExpense > 0 && (
          <div className="flex items-center justify-between gap-4 text-xs font-normal text-rose-500">
            <span>扣除经营成本:</span>
            <span className="tabular-nums font-semibold">-{money(operatingExpense)}</span>
          </div>
        )}

        {otherExpense > 0.009 && (
          <div className="flex items-center justify-between gap-4 text-xs font-normal text-rose-500">
            <span>扣除其他支出:</span>
            <span className="tabular-nums font-semibold">-{money(otherExpense)}</span>
          </div>
        )}

        {otherExpense < -0.009 && (
          <div className="flex items-center justify-between gap-4 text-xs font-normal text-emerald-600 dark:text-emerald-400">
            <span>其他收益补贴:</span>
            <span className="tabular-nums font-semibold">+{money(Math.abs(otherExpense))}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 text-xs border-t border-solid border-black/10 dark:border-white/10 pt-2 mt-2 font-bold">
          <span className="text-foreground">当日最终净利润:</span>
          <span className={cn("text-sm tabular-nums font-extrabold", netProfit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>
            {money(netProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}

// 订单波动图专属 tooltip：根据 orderScope（全部订单 / 去除刷单）显示准确单量拆分与总计
function OrderTooltip({
  active,
  payload,
  label,
  orderScope = "all",
}: {
  active?: boolean;
  payload?: Array<{ payload?: { platformOrderCount?: Record<string, number>; orderCount?: number; trueOrderCount?: number; brushOrderCount?: number; otherOrderCount?: number } }>;
  label?: string;
  orderScope?: "all" | "true";
}) {
  if (!active || !payload?.length) return null;
  const dataPoint = payload[0]?.payload;
  const platformCounts = dataPoint?.platformOrderCount || {};
  const entries = Object.entries(platformCounts)
    .filter(([, v]) => (v as number) > 0)
    .sort(([, a], [, b]) => (b as number) - (a as number));

  const isTrueScope = orderScope === "true";
  const total = isTrueScope
    ? (dataPoint?.trueOrderCount ?? 0)
    : (dataPoint?.orderCount ?? 0);

  const brushCount = dataPoint?.brushOrderCount ?? 0;
  const otherCount = dataPoint?.otherOrderCount ?? 0;

  return (
    <div className="relative z-1000 -translate-y-1/2 pointer-events-none min-w-45 max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto rounded-[22px] border border-black/8 bg-white/95 p-3.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 font-normal">
      <div className="flex items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label} 单量明细</span>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
          {isTrueScope ? "去除刷单" : "全部订单"}
        </span>
      </div>
      <div className="mt-2.5 space-y-2">
        {entries.length > 0 ? (
          entries.map(([platform, count]) => (
            <div key={platform} className="flex items-center justify-between gap-4 text-xs font-normal">
              <span className="text-slate-700 dark:text-slate-300 font-normal">{platform}:</span>
              <span className="font-normal tabular-nums text-sky-600 dark:text-sky-400">{count as number} 单</span>
            </div>
          ))
        ) : (
          <div className="text-xs text-muted-foreground py-1 text-center font-normal">暂无真单数据</div>
        )}
        {!isTrueScope && (brushCount > 0 || otherCount > 0) && (
          <>
            {brushCount > 0 && (
              <div className="flex items-center justify-between gap-4 text-xs font-normal">
                <span className="text-purple-600 dark:text-purple-400 font-normal">刷单:</span>
                <span className="font-normal tabular-nums text-purple-600 dark:text-purple-400">{brushCount} 单</span>
              </div>
            )}
            {otherCount > 0 && (
              <div className="flex items-center justify-between gap-4 text-xs font-normal">
                <span className="text-amber-600 dark:text-amber-400 font-normal">已取消/异常:</span>
                <span className="font-normal tabular-nums text-amber-600 dark:text-amber-400">{otherCount} 单</span>
              </div>
            )}
          </>
        )}
        <div className="flex items-center justify-between gap-4 text-xs border-t border-dashed border-black/10 dark:border-white/10 pt-2.5 mt-2 font-normal">
          <span className="text-foreground font-normal">当日总计:</span>
          <span className="text-sm tabular-nums font-bold text-foreground">{total} 单</span>
        </div>
      </div>
    </div>
  );
}

interface CustomizedDotProps {
  cx?: number;
  cy?: number;
  payload?: {
    netProfit?: number;
  };
}

function CustomizedDot(props: CustomizedDotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const val = payload.netProfit;
  const isNegative = typeof val === "number" && val < 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={isNegative ? "#ef4444" : "#22c55e"}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
}

function CustomizedActiveDot(props: CustomizedDotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const val = payload.netProfit;
  const isNegative = typeof val === "number" && val < 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={isNegative ? "#ef4444" : "#22c55e"}
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
}

export function DataOverview({
  data,
  rangePreset,
  onRangePresetChange,
  selectedShopName,
  shopOptions,
  onSelectedShopNameChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  isLoading = false,
  lastSynced = null,
  onRefresh,
}: {
  data: StatsData | null;
  rangePreset: string;
  onRangePresetChange: (value: string) => void;
  selectedShopName: string;
  shopOptions: Shop[];
  onSelectedShopNameChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  isLoading?: boolean;
  lastSynced?: Date | null;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const todayDate = new Date().toISOString().slice(0, 10);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const mappedLocalShops = useMemo(() => {
    return shopOptions.map((shop) => ({
      id: shop.id || shop.name,
      name: shop.name,
      address: shop.address || "",
    }));
  }, [shopOptions]);

  const [profitPlatform, setProfitPlatform] = useState("all");
  const [orderPlatform, setOrderPlatform] = useState("all");
  const [orderScope, setOrderScope] = useState<"all" | "true">("all");
  const [isChartsFullWidth, setIsChartsFullWidth] = useState(false);
  const [isCustomerDetailOpen, setIsCustomerDetailOpen] = useState(false);
  const [activeBreakdown, setActiveBreakdown] = useState<{
    label: string;
    items: { label: string; value: number }[];
  } | null>(null);

  // 弹窗打开时彻底锁定底层背景页面滚动，杜绝移动端滑动手势穿透
  useEffect(() => {
    if (isCustomerDetailOpen || activeBreakdown) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isCustomerDetailOpen, activeBreakdown]);

  const businessTrend = data?.businessTrend || [];
  const rangeDays = useMemo(() => countDays(startDate, endDate), [endDate, startDate]);
  const matrix = data?.platformMatrix;
  const platformBusinessTrend = data?.platformBusinessTrend || {};
  const platformOptions = [
    { value: "all", label: "全部平台" },
    { value: "美团", label: "美团" },
    { value: "京东", label: "京东" },
    { value: "淘宝", label: "淘宝" },
    { value: "抖店", label: "抖店" },
    { value: "线下交易", label: "线下交易" },
  ];

  const profitTrend = useMemo(
    () => profitPlatform === "all" ? (data?.businessTrend || []) : (data?.platformBusinessTrend?.[profitPlatform] || []),
    [data?.businessTrend, data?.platformBusinessTrend, profitPlatform],
  );
  
  const profitGradientOffset = useMemo(() => {
    if (!profitTrend || profitTrend.length === 0) return 0;
    const values = profitTrend.map((i) => i.netProfit);
    const dataMax = Math.max(...values);
    const dataMin = Math.min(...values);

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

    return dataMax / (dataMax - dataMin);
  }, [profitTrend]);
  const orderTrend = orderPlatform === "all" ? businessTrend : (platformBusinessTrend[orderPlatform] || []);
  const orderSeriesKey = orderScope === "true" ? "trueOrderCount" : "orderCount";
  const orderSeriesColor = orderScope === "true" ? "#10b981" : "#0ea5e9";
  const totalOrders = matrix?.grandTotal || 0;
  const trueOrders = matrix?.trueOrderTotal || 0;
  const brushOrders = matrix?.brushOrderTotal || 0;
  const cancelledLikeGap = Math.max(0, totalOrders - trueOrders - brushOrders);
  const trueShare = totalOrders > 0 ? (trueOrders / totalOrders) * 100 : 0;
  const brushShare = totalOrders > 0 ? (brushOrders / totalOrders) * 100 : 0;
  const contextLabel = selectedShopName ? `${selectedShopName} · ${int(rangeDays)} 天` : `全部店铺 · ${int(rangeDays)} 天`;
  const customerAnalysis = data?.customerAnalysis;
  const customerKnownTotal = customerAnalysis?.totalKnownOrders || 0;
  const customerTotal = customerKnownTotal + (customerAnalysis?.unknownCustomerOrders || 0);
  const newCustomerShare = (customerAnalysis?.newRate || 0) * 100;
  const returningCustomerShare = (customerAnalysis?.returningRate || 0) * 100;
  const newCustomerTotalShare = customerTotal > 0 ? ((customerAnalysis?.newCustomerOrders || 0) / customerTotal) * 100 : 0;
  const returningCustomerTotalShare = customerTotal > 0 ? ((customerAnalysis?.returningCustomerOrders || 0) / customerTotal) * 100 : 0;
  const unknownCustomerShare = customerTotal > 0 ? ((customerAnalysis?.unknownCustomerOrders || 0) / customerTotal) * 100 : 0;
  const customerDaily = customerAnalysis?.daily || [];
  const platformProfitSummary = useMemo(() => {
    return platformOptions
      .filter((option) => option.value !== "all")
      .map((option) => {
        const points = platformBusinessTrend[option.value] || [];
        const profit = points.reduce((sum, point) => sum + Number(point.netProfit || 0), 0);
        // 统计口径与平台结构保持完全一致（真单 + 刷单），排除已取消/作废的订单
        const orders = points.reduce((sum, point) => sum + Number(point.trueOrderCount || 0) + Number(point.brushOrderCount || 0), 0);
        return {
          platform: option.value,
          profit,
          orders,
          averageProfit: orders > 0 ? profit / orders : 0,
        };
      })
      .filter((item) => item.orders > 0 || item.profit !== 0)
      .sort((a, b) => b.profit - a.profit);
  }, [platformBusinessTrend, platformOptions]);

  const extraPlatformProfitSummary = useMemo(() => {
    const extraItems = platformProfitSummary.slice(3);
    const profit = extraItems.reduce((sum, item) => sum + item.profit, 0);
    const orders = extraItems.reduce((sum, item) => sum + item.orders, 0);
    return {
      count: extraItems.length,
      profit,
      orders,
      averageProfit: orders > 0 ? profit / orders : 0,
    };
  }, [platformProfitSummary]);

  const grossProfit = Number(data?.userPaid || 0) - Number(data?.productCost || 0);
  const commissionTotal = Number(data?.platformCommission || 0) + Number(data?.companyCommission || 0);
  const extraExpenseTotal =
    Number(data?.deliveryExpense || 0) +
    Number(data?.promotionExpense || 0) +
    Number(data?.brushExpense || 0) +
    Number(data?.operatingExpense || 0) +
    Number(data?.otherExpense || 0);
  const netMargin = Number(data?.userPaid || 0) > 0 ? (Number(data?.netProfit || 0) / Number(data?.userPaid || 0)) * 100 : 0;
  const profitableChannelsCount = platformProfitSummary.filter((p) => p.profit > 0).length;
  const lossChannelsCount = platformProfitSummary.filter((p) => p.profit < 0).length;
  const totalPlatformOrders = platformProfitSummary.reduce((sum, p) => sum + p.orders, 0);
  const avgNetProfitPerOrder = totalPlatformOrders > 0 ? Number(data?.netProfit || 0) / totalPlatformOrders : 0;
  const topPlatform = platformProfitSummary[0];
  const topPlatformShare = totalPlatformOrders > 0 && topPlatform ? ((topPlatform.orders / totalPlatformOrders) * 100).toFixed(1) : "0.0";
  const avgOrderValue = totalPlatformOrders > 0 ? Number(data?.userPaid || 0) / totalPlatformOrders : 0;

  return (
    <div className="space-y-5 sm:space-y-8">
      <OverviewAiPanel />
      <section className="overflow-hidden rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-black/6 pb-3.5 dark:border-white/8">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-black leading-none tracking-tight text-foreground sm:text-3xl">概览</h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              经营结果与趋势
            </p>
          </div>

          {onRefresh ? (
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="group relative flex h-10 shrink-0 items-center gap-2 rounded-full border border-black/8 bg-white/75 px-4 transition-all hover:border-primary/30 hover:bg-white sm:gap-2.5 sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-95 shadow-2xs"
            >
              <div className={`flex h-5 w-5 items-center justify-center rounded-full ${isLoading ? "bg-primary/20" : "bg-black/5 transition-colors group-hover:bg-primary/15 dark:bg-white/10"}`}>
                <RefreshCw
                  size={12}
                  className={cn(
                    "transition-all duration-700",
                    isLoading ? "animate-spin text-primary" : "text-muted-foreground group-hover:rotate-180 group-hover:text-primary"
                  )}
                />
              </div>

              <div className="flex flex-col items-start leading-none">
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isLoading ? "同步中..." : "系统同步"}
                </span>
                <span className="mt-0.5 text-[10px] font-mono tabular-nums text-foreground/80 sm:text-[11px]">
                  {lastSynced && !isLoading ? format(lastSynced, "HH:mm:ss") : "点击刷新"}
                </span>
              </div>
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="col-span-1 space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">店铺范围</label>
            <CustomSelect
              value={selectedShopName}
              onChange={onSelectedShopNameChange}
              options={[{ value: "", label: "全部店铺" }, ...shopOptions.map((shop) => ({ value: shop.name, label: shop.name }))]}
              className="h-10"
              triggerClassName="h-full rounded-full border border-black/8 bg-white px-4 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
            />
          </div>
          <div className="col-span-1 space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">时间范围</label>
            <CustomSelect
              value={rangePreset}
              onChange={onRangePresetChange}
              options={[
                { value: "all", label: "全部" },
                { value: "7d", label: "最近 7 天" },
                { value: "15d", label: "最近 15 天" },
                { value: "30d", label: "最近 30 天" },
                { value: "90d", label: "最近 90 天" },
                { value: "custom", label: "自定义" },
              ]}
              className="h-10"
              triggerClassName="h-full rounded-full border border-black/8 bg-white px-4 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
            />
          </div>
          <div className="col-span-1 space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">起始日期</label>
            <DatePicker
              value={startDate}
              onChange={onStartDateChange}
              maxDate={endDate || todayDate}
              showClear={false}
              className="h-10 w-full"
              triggerClassName="h-full rounded-full border border-black/8 bg-white px-4 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
            />
          </div>
          <div className="col-span-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">结束日期</label>
              <span className="text-[11px] font-bold text-primary">共 {int(rangeDays)} 天</span>
            </div>
            <DatePicker
              value={endDate}
              onChange={onEndDateChange}
              minDate={startDate}
              maxDate={todayDate}
              showClear={false}
              className="h-10 w-full"
              triggerClassName="h-full rounded-full border border-black/8 bg-white px-4 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
            />
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        {/* 左侧：经营概况核心卡片 */}
        <section className="flex h-full min-w-0 flex-col justify-between rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5 lg:p-6">
            {/* 顶部净利润核心指标 */}
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Layers className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">经营概况</span>
                </div>

                <div className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
                  Number(data?.netProfit || 0) >= 0
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-rose-500/25 bg-rose-500/10 text-rose-500 dark:text-rose-400"
                )}>
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    Number(data?.netProfit || 0) >= 0 ? "bg-emerald-500 animate-pulse" : "bg-rose-500 animate-pulse"
                  )} />
                  {Number(data?.netProfit || 0) >= 0 ? "净利润为正" : "净利润承压"}
                </div>
              </div>
              
              <div className="mt-2 sm:mt-2.5">
                <div className="flex items-baseline gap-1">
                  <span className={cn(
                    "text-2xl font-black sm:text-3xl",
                    Number(data?.netProfit || 0) < 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground"
                  )}>
                    {Number(data?.netProfit || 0) < 0 ? "-" : ""}¥
                  </span>
                  <h2 className={cn(
                    "overflow-hidden text-[clamp(2.2rem,3.8vw,3.6rem)] font-black leading-none tracking-tight tabular-nums",
                    Number(data?.netProfit || 0) < 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground"
                  )}>
                    {Math.abs(Number(data?.netProfit || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h2>
                </div>

                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                  {contextLabel}
                </p>
              </div>
            </div>

            {/* 中间收支流水三要素 */}
            <div className="my-2.5 grid grid-cols-3 gap-1.5 rounded-2xl border border-black/5 bg-black/[0.02] p-2.5 dark:border-white/6 dark:bg-white/[0.025] sm:my-3 sm:gap-3 sm:p-3.5">
              {[
                { label: "用户实付", value: money(data?.userPaid), hint: "全渠道实付流水", tone: "text-foreground" },
                { label: "商品成本", value: money(data?.productCost), hint: "货品出库总成本", tone: "text-foreground" },
                {
                  label: "刷单支出",
                  value: money(data?.brushExpense),
                  hint: "营销补单支出",
                  tone: Number(data?.brushExpense || 0) > 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground",
                },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="text-[10px] font-bold text-muted-foreground sm:text-[11px]">{item.label}</div>
                  <div className={cn("mt-0.5 truncate text-sm font-black tabular-nums tracking-tight sm:mt-1 sm:text-xl", item.tone)}>
                    {item.value}
                  </div>
                  <div className="mt-0.5 truncate text-[9px] font-medium text-muted-foreground/80 sm:text-[11px]">{item.hint}</div>
                </div>
              ))}
            </div>

            {/* 底部利润构成 4 拆解项 */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2.5">
              {[
                {
                  label: "商品毛利",
                  value: money(grossProfit),
                  hint: "实付 - 成本",
                  tone: grossProfit < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400",
                  breakdown: null,
                },
                {
                  label: "渠道与扣点",
                  value: money(commissionTotal),
                  hint: "平台佣金与技术费",
                  tone: "text-foreground",
                  breakdown: [
                    { label: "平台佣金", value: Number(data?.platformCommission || 0) },
                    { label: "公司扣点", value: Number(data?.companyCommission || 0) },
                  ].filter((b) => b.value !== 0),
                },
                {
                  label: "运营与支出",
                  value: money(extraExpenseTotal),
                  hint: "配送/推广/经营成本",
                  tone: extraExpenseTotal > 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground",
                  breakdown: [
                    { label: "配送费", value: Number(data?.deliveryExpense || 0) },
                    { label: "推广费", value: Number(data?.promotionExpense || 0) },
                    { label: "刷单支出", value: Number(data?.brushExpense || 0) },
                    { label: "经营成本", value: Number(data?.operatingExpense || 0) },
                    { label: "其他支出", value: Number(data?.otherExpense || 0) },
                  ].filter((b) => b.value !== 0),
                },
                {
                  label: "百元净利",
                  value: `${netMargin.toFixed(1)}元`,
                  hint: "综合净利润率",
                  tone: netMargin < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400",
                  breakdown: null,
                },
              ].map((item) => {
                const hasBreakdown = Boolean(item.breakdown && item.breakdown.length > 0);
                return (
                  <div
                    key={item.label}
                    className="relative group/breakdown min-w-0 z-10 hover:z-30"
                  >
                    <div
                      onClick={() => {
                        if (hasBreakdown && typeof window !== "undefined" && window.innerWidth < 768) {
                          setActiveBreakdown({ label: item.label, items: item.breakdown! });
                        }
                      }}
                      className={cn(
                        "relative min-w-0 rounded-2xl border border-black/5 bg-black/[0.02] p-2 transition-colors duration-150 dark:border-white/6 dark:bg-white/[0.025] sm:p-3",
                        hasBreakdown && "cursor-default sm:cursor-pointer hover:border-black/15 hover:bg-black/[0.04] dark:hover:border-white/15 dark:hover:bg-white/[0.05]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="truncate text-[11px] font-bold text-muted-foreground sm:text-xs">{item.label}</div>
                        {hasBreakdown ? (
                          <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-bold text-primary/80 transition-colors group-hover/breakdown:text-primary">
                            明细 <ArrowUpRight className="h-2.5 w-2.5" />
                          </span>
                        ) : null}
                      </div>
                      <div className={cn("mt-1 truncate text-base font-black tabular-nums tracking-tight sm:text-lg", item.tone)}>
                        {item.value}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground/75 sm:text-[11px]">{item.hint}</div>
                    </div>

                    {/* PC 端原生 120fps 丝滑悬停浮层：锚定在当前卡片正上方，绝对不可能双卡片重叠 */}
                    {hasBreakdown ? (
                      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-50 w-56 rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl opacity-0 translate-y-1 invisible group-hover/breakdown:opacity-100 group-hover/breakdown:translate-y-0 group-hover/breakdown:visible transition-all duration-150 ease-out hidden sm:block ring-1 ring-foreground/5">
                        <div className="flex items-center justify-between border-b border-border/70 pb-2">
                          <span className="text-xs font-black tracking-tight text-foreground">{item.label}明细</span>
                          <span className="font-mono text-[10px] font-bold text-muted-foreground">共 {item.breakdown!.length} 项</span>
                        </div>
                        <div className="my-2 space-y-1.5">
                          {item.breakdown!.map((b) => (
                            <div key={b.label} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground font-medium">{b.label}</span>
                              <span className="font-mono font-bold tabular-nums text-foreground">{money(b.value)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between border-t border-border/70 pt-2 text-xs">
                          <span className="font-bold text-muted-foreground">合计</span>
                          <span className="font-mono font-black tabular-nums text-foreground">
                            {money(item.breakdown!.reduce((sum, b) => sum + b.value, 0))}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 右侧：平台利润核心卡片 */}
          <section className="flex h-full min-w-0 flex-col justify-between rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 sm:p-5 lg:p-6">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                    <Store className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">平台利润</span>
                </div>

                {platformProfitSummary[0] ? (
                  <div className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold backdrop-blur-sm",
                    platformProfitSummary[0].profit < 0
                      ? "border-rose-500/20 bg-rose-500/10 text-rose-500"
                      : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  )}>
                    <Award className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-[10px] text-muted-foreground font-normal">首位</span>
                    <span className="max-w-[4.5rem] truncate font-black sm:max-w-[5.5rem]">
                      {getPlatformMeta(platformProfitSummary[0].platform)?.name || platformProfitSummary[0].platform}
                    </span>
                  </div>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs font-medium text-muted-foreground">{contextLabel}</p>
            </div>

            {platformProfitSummary.length > 0 ? (
              <div className="my-2.5 overflow-hidden rounded-2xl border border-black/6 bg-white/50 shadow-2xs backdrop-blur-sm dark:border-white/8 dark:bg-white/[0.02] sm:my-3">
                {/* 表头 Header */}
                <div className="grid grid-cols-[minmax(0,1.2fr)_3.2rem_4.2rem_4.8rem] items-center gap-1.5 border-b border-black/6 bg-black/[0.02] px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 dark:border-white/8 dark:bg-white/[0.02] sm:grid-cols-[minmax(0,1.2fr)_3.8rem_4.5rem_5.2rem] sm:gap-2 sm:px-3.5 sm:py-2.5">
                  <div>渠道平台</div>
                  <div className="text-right">订单量</div>
                  <div className="text-right">单均利润</div>
                  <div className="text-right">累计净利</div>
                </div>

                {/* 平台列表 */}
                <div className="divide-y divide-black/5 dark:divide-white/6">
                  {platformProfitSummary.slice(0, 4).map((item, index) => {
                    const meta = getPlatformMeta(item.platform);
                    const rankStyle = index === 0
                      ? "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                      : index === 1
                      ? "bg-slate-400/15 text-slate-400 border border-slate-400/30"
                      : "bg-amber-700/15 text-amber-600 border border-amber-700/30";

                    return (
                      <div
                        key={item.platform}
                        className="grid grid-cols-[minmax(0,1.2fr)_3.2rem_4.2rem_4.8rem] items-center gap-1.5 px-2.5 py-2 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.035] sm:grid-cols-[minmax(0,1.2fr)_3.8rem_4.5rem_5.2rem] sm:gap-2 sm:px-3.5 sm:py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                          <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-black sm:h-4 sm:w-4 sm:text-[9px]", rankStyle)}>
                            {index + 1}
                          </span>
                          {meta?.iconSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={meta.iconSrc} alt={meta.name || item.platform} className="h-3.5 w-3.5 shrink-0 object-contain rounded-xs sm:h-4 sm:w-4" />
                          ) : null}
                          <div className="truncate text-[11px] font-black text-foreground sm:text-xs">{meta?.name || item.platform}</div>
                        </div>
                        <div className="text-right text-[11px] font-bold text-muted-foreground tabular-nums sm:text-xs">
                          {int(item.orders)}单
                        </div>
                        <div className={cn("text-right text-[11px] font-black tabular-nums font-mono sm:text-xs", item.averageProfit < 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground")}>
                          {money(item.averageProfit)}
                        </div>
                        <div className={cn("text-right text-xs font-black tabular-nums font-mono sm:text-sm", item.profit < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400")}>
                          {money(item.profit)}
                        </div>
                      </div>
                    );
                  })}

                  {platformProfitSummary.length > 4 ? (
                    <div className="grid grid-cols-[minmax(0,1.2fr)_3.2rem_4.2rem_4.8rem] items-center gap-1.5 bg-black/[0.01] px-2.5 py-2 dark:bg-white/[0.015] sm:grid-cols-[minmax(0,1.2fr)_3.8rem_4.5rem_5.2rem] sm:gap-2 sm:px-3.5 sm:py-2.5">
                      <div className="flex items-center gap-1.5 truncate text-[11px] font-bold text-muted-foreground sm:text-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                        其余 {platformProfitSummary.length - 4} 个平台
                      </div>
                      <div className="text-right text-[11px] font-bold text-muted-foreground tabular-nums sm:text-xs">
                        {int(platformProfitSummary.slice(4).reduce((sum, i) => sum + i.orders, 0))}单
                      </div>
                      <div className="text-right text-[11px] font-black tabular-nums font-mono text-foreground sm:text-xs">
                        -
                      </div>
                      <div className={cn("text-right text-xs font-black tabular-nums font-mono sm:text-sm", platformProfitSummary.slice(4).reduce((sum, i) => sum + i.profit, 0) < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400")}>
                        {money(platformProfitSummary.slice(4).reduce((sum, i) => sum + i.profit, 0))}
                      </div>
                    </div>
                  ) : null}

                  {/* 全渠道合计汇总行 */}
                  <div className="grid grid-cols-[minmax(0,1.2fr)_3.2rem_4.2rem_4.8rem] items-center gap-1.5 border-t border-black/8 bg-black/[0.025] px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.035] sm:grid-cols-[minmax(0,1.2fr)_3.8rem_4.5rem_5.2rem] sm:gap-2 sm:px-3.5 sm:py-2.5">
                    <div className="flex items-center gap-1.5 truncate text-[11px] font-black text-foreground sm:text-xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      全渠道合计
                    </div>
                    <div className="text-right text-[11px] font-black text-foreground tabular-nums sm:text-xs">
                      {int(totalPlatformOrders)}单
                    </div>
                    <div className={cn("text-right text-[11px] font-black tabular-nums font-mono sm:text-xs", avgNetProfitPerOrder < 0 ? "text-rose-500 dark:text-rose-400" : "text-foreground")}>
                      {money(avgNetProfitPerOrder)}
                    </div>
                    <div className={cn("text-right text-xs font-black tabular-nums font-mono sm:text-sm", Number(data?.netProfit || 0) < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400")}>
                      {money(data?.netProfit)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 py-6 text-center text-xs text-muted-foreground dark:border-white/10 sm:py-8">
                当前范围暂无平台利润数据
              </div>
            )}

            {/* 底部 3 项渠道核心洞察指标 */}
            {platformProfitSummary.length > 0 ? (
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                {[
                  {
                    label: "渠道平均客单",
                    value: money(avgOrderValue),
                    hint: "全渠道单均实付",
                    tone: "text-foreground",
                  },
                  {
                    label: "主力渠道贡献",
                    value: `${topPlatformShare}%`,
                    hint: `${getPlatformMeta(topPlatform?.platform)?.name || topPlatform?.platform || "-"} · ${int(topPlatform?.orders || 0)}单`,
                    tone: "text-foreground",
                  },
                  {
                    label: "综合单均净利",
                    value: money(avgNetProfitPerOrder),
                    hint: "全渠道每单实得",
                    tone: avgNetProfitPerOrder < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="group relative min-w-0 rounded-2xl border border-black/5 bg-black/[0.02] p-2 transition-all duration-200 dark:border-white/6 dark:bg-white/[0.025] sm:p-3"
                  >
                    <div className="truncate text-[10px] font-bold text-muted-foreground sm:text-[11px]">{item.label}</div>
                    <div className={cn("mt-0.5 truncate text-sm font-black tabular-nums tracking-tight sm:mt-1 sm:text-lg", item.tone)}>
                      {item.value}
                    </div>
                    <div className="mt-0.5 truncate text-[9px] font-medium text-muted-foreground/80 sm:text-[10px]">{item.hint}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

      <Panel
        title="客户分析"
        subtitle="新老客占比与老客常买商品"
        action={
          <button
            type="button"
            onClick={() => setIsCustomerDetailOpen(true)}
            className="h-9 shrink-0 rounded-full border border-black/8 bg-white/80 px-4 text-xs font-bold text-foreground transition-all hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-white/5 active:scale-95 cursor-pointer shadow-2xs"
          >
            每日明细
          </button>
        }
      >
        <div className="grid gap-3.5 lg:gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          {/* 左侧：客户画像与新老客结构（顶级仪表盘科技感设计） */}
          <div className="flex flex-col justify-between gap-4 rounded-[26px] border border-black/6 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/8 dark:bg-white/[0.02] sm:p-5">
            {/* 顶栏 Header */}
            <div className="flex items-center justify-between border-b border-black/6 pb-3 dark:border-white/8">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                <span className="text-xs font-black tracking-wider uppercase text-foreground">客户画像结构</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]">
                  覆盖率 {customerTotal > 0 ? ((customerKnownTotal / customerTotal) * 100).toFixed(0) : 0}%
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  共 {int(customerTotal)} 单
                </span>
              </div>
            </div>

            {/* 中间核心：科技感 SVG 柔光双弧环图 + 极光数据 Pod */}
            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[148px_minmax(0,1fr)]">
              {/* 左：动态发光圆环 */}
              <div className="relative flex h-[148px] w-[148px] mx-auto shrink-0 items-center justify-center">
                {(() => {
                  const radius = 56;
                  const circumference = 2 * Math.PI * radius; // ~351.86
                  const hasKnown = customerKnownTotal > 0;
                  const newShareNorm = hasKnown ? (customerAnalysis?.newCustomerOrders || 0) / customerKnownTotal : 0;
                  const retShareNorm = hasKnown ? (customerAnalysis?.returningCustomerOrders || 0) / customerKnownTotal : 0;
                  
                  const hasBoth = hasKnown && newShareNorm > 0 && retShareNorm > 0;
                  const gapAngle = hasBoth ? 4 : 0;
                  const totalGaps = hasBoth ? 2 * gapAngle : 0;
                  const availableCircumference = circumference - (totalGaps * Math.PI * radius / 180);

                  const newLength = hasKnown ? Math.max(0, newShareNorm * availableCircumference) : 0;
                  const retLength = hasKnown ? Math.max(0, retShareNorm * availableCircumference) : 0;
                  const gapLength = (gapAngle * Math.PI * radius) / 180;
                  const retOffset = -(newLength + gapLength);

                  return (
                    <>
                      <svg width="148" height="148" viewBox="0 0 148 148" className="overflow-visible">
                        <defs>
                          {/* 新客：清澈纯净的天青蓝渐变 */}
                          <linearGradient id="skyAura" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#38bdf8" />
                            <stop offset="100%" stopColor="#0284c7" />
                          </linearGradient>
                          {/* 老客：深邃高贵的星轨靛紫渐变 */}
                          <linearGradient id="indigoAura" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#a78bfa" />
                            <stop offset="100%" stopColor="#6366f1" />
                          </linearGradient>
                          <filter id="glowSkyAura" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.35" />
                          </filter>
                          <filter id="glowIndigoAura" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#818cf8" floodOpacity="0.35" />
                          </filter>
                        </defs>

                        {/* 底环轨道 */}
                        <circle
                          cx="74"
                          cy="74"
                          r={radius}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8.5"
                          className="text-black/5 dark:text-white/[0.06]"
                        />

                        {/* 新客圆弧（天青蓝） */}
                        {hasKnown && newLength > 0 ? (
                          <circle
                            cx="74"
                            cy="74"
                            r={radius}
                            fill="none"
                            stroke="url(#skyAura)"
                            strokeWidth="9"
                            strokeDasharray={`${newLength} ${circumference}`}
                            strokeDashoffset="0"
                            strokeLinecap="round"
                            transform="rotate(-90 74 74)"
                            filter="url(#glowSkyAura)"
                            className="transition-all duration-700 ease-out"
                          />
                        ) : null}

                        {/* 老客复购圆弧（星轨靛紫） */}
                        {hasKnown && retLength > 0 ? (
                          <circle
                            cx="74"
                            cy="74"
                            r={radius}
                            fill="none"
                            stroke="url(#indigoAura)"
                            strokeWidth="9"
                            strokeDasharray={`${retLength} ${circumference}`}
                            strokeDashoffset={retOffset}
                            strokeLinecap="round"
                            transform="rotate(-90 74 74)"
                            filter="url(#glowIndigoAura)"
                            className="transition-all duration-700 ease-out"
                          />
                        ) : null}
                      </svg>

                      {/* 环心沉浸数据（纯白纯净大字） */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="text-xl font-black tabular-nums tracking-tight text-foreground sm:text-2xl">
                          {percent(newCustomerShare)}
                        </span>
                        <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                          新客占比
                        </span>
                        <span className="mt-0.5 text-[9px] font-mono font-medium text-muted-foreground/70">
                          {int(customerKnownTotal)} 单已识别
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* 右：两个高质感沉稳中性 Pod（告别大红大绿） */}
              <div className="flex flex-col gap-2.5">
                {/* 新客 Pod */}
                <div className="relative overflow-hidden rounded-2xl border border-black/6 bg-white/60 p-2.5 sm:p-3 transition-colors hover:border-black/12 hover:bg-white/80 dark:border-white/8 dark:bg-white/[0.025] dark:hover:border-white/14 dark:hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]" />
                      新客首购
                    </div>
                    <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-600 dark:text-sky-300">
                      {percent(newCustomerShare)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black tabular-nums tracking-tight text-foreground sm:text-xl">
                        {int(customerAnalysis?.newCustomerOrders)}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">单</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70">首次下单转化</span>
                  </div>
                </div>

                {/* 老客复购 Pod */}
                <div className="relative overflow-hidden rounded-2xl border border-black/6 bg-white/60 p-2.5 sm:p-3 transition-colors hover:border-black/12 hover:bg-white/80 dark:border-white/8 dark:bg-white/[0.025] dark:hover:border-white/14 dark:hover:bg-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]" />
                      老客复购
                    </div>
                    <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-300">
                      复购率 {percent(returningCustomerShare)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black tabular-nums tracking-tight text-foreground sm:text-xl">
                        {int(customerAnalysis?.returningCustomerOrders)}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">单</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70">核心留存复购</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 底栏：极简未识别画像状态条 */}
            <div className="flex items-center justify-between rounded-xl border border-black/6 bg-black/[0.02] px-3 py-1.5 text-[11px] text-muted-foreground dark:border-white/8 dark:bg-white/[0.02]">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <span>未识别客户 <strong className="font-mono text-foreground font-bold">{int(customerAnalysis?.unknownCustomerOrders)}</strong> 单</span>
              </div>
              <span className="text-[10px] text-muted-foreground/70">部分平台买家匿名保护待回传</span>
            </div>
          </div>

          {/* 右侧：老客常买商品 Top 5 */}
          <div className="min-w-0 rounded-[22px] border border-black/6 bg-black/[0.015] p-3.5 dark:border-white/8 dark:bg-white/[0.025] sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">老客常买</div>
                <div className="mt-0.5 text-sm font-black text-foreground">商品 Top 5</div>
              </div>
              <div className="rounded-full border border-black/6 bg-black/[0.02] px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground dark:border-white/8 dark:bg-white/3">
                按件数排序
              </div>
            </div>

            <div className="space-y-2">
              {(customerAnalysis?.returningCustomerTopProducts || []).length > 0 ? (
                customerAnalysis!.returningCustomerTopProducts.map((item, index) => {
                  const rankColors = [
                    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 shadow-xs",
                    "bg-slate-400/15 text-slate-600 dark:text-slate-300 border-slate-400/25",
                    "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25",
                  ];
                  const rankClass = rankColors[index] || "bg-black/5 text-muted-foreground border-black/6 dark:bg-white/5 dark:border-white/8";

                  return (
                    <div
                      key={`${item.sku || item.productName}-${index}`}
                      className="group flex items-center gap-2.5 rounded-2xl border border-black/6 bg-white/70 p-2 transition-all hover:border-black/12 hover:bg-white dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06] sm:gap-3 sm:p-2.5"
                    >
                      {/* 排名徽章 */}
                      <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-black tabular-nums", rankClass)}>
                        {index + 1}
                      </div>

                      {/* 商品缩略图 */}
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-black/8 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.04] sm:h-12 sm:w-12">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image}
                            alt={item.productName}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground/35">
                            <Package className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      {/* 商品名称与货号信息 */}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-foreground sm:text-sm" title={item.productName}>
                          {item.productName}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {item.sku ? (
                            <span className="font-mono font-medium text-muted-foreground/80">#{item.sku}</span>
                          ) : (
                            <span className="text-muted-foreground/60">标准商品</span>
                          )}
                        </div>
                      </div>

                      {/* 右侧：件数与订单数一体化排版 */}
                      <div className="shrink-0 text-right pl-2">
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-base font-black tabular-nums text-foreground sm:text-lg">
                            {int(item.quantity)}
                          </span>
                          <span className="text-xs font-bold text-muted-foreground">件</span>
                        </div>
                        <div className="mt-0.5 text-[10px] font-medium text-muted-foreground/70 tabular-nums">
                          共 {int(item.orderCount)} 单
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/10">
                  当前范围还没有可统计的老客商品
                </div>
              )}
            </div>
          </div>
        </div>

      </Panel>

      <Panel
        title="平台结构"
        subtitle="按平台查看真单与刷单的订单构成"
        action={(
          <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full border border-black/8 bg-black/[0.025] p-0.5 text-xs font-bold dark:border-white/10 dark:bg-white/[0.04]">
            <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span><span className="hidden sm:inline">全渠道</span>真单率 {matrix?.grandTotal ? ((matrix.trueOrderTotal / matrix.grandTotal) * 100).toFixed(1) : "100.0"}%</span>
            </div>
            <div className="px-2.5 py-0.5 text-muted-foreground">
              <span><span className="hidden sm:inline">有效</span>{int(matrix?.grandTotal)} 单</span>
            </div>
          </div>
        )}
      >
        {/* 移动端展示 */}
        <div className="space-y-2.5 sm:hidden">
          {[
            {
              key: "true",
              label: "真单 (实销履约)",
              total: matrix?.trueOrderTotal,
              tone: "text-emerald-500",
              dot: "bg-emerald-500",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.trueOrderCount })) || [],
            },
            {
              key: "brush",
              label: "刷单 (营销补单)",
              total: matrix?.brushOrderTotal,
              tone: "text-rose-500",
              dot: "bg-rose-500",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.brushOrderCount })) || [],
            },
            {
              key: "all",
              label: "渠道合计",
              total: matrix?.grandTotal,
              tone: "text-foreground",
              dot: "bg-primary",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.totalCount })) || [],
            },
          ].map((row) => (
            <div key={row.key} className="rounded-2xl border border-black/6 bg-black/2 p-3 dark:border-white/10 dark:bg-white/3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", row.dot)} />
                  <span className="text-xs font-black text-foreground">{row.label}</span>
                </div>
                <span className={cn("text-base font-black tabular-nums", row.tone)}>{int(row.total)}</span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {row.values.map((item) => {
                  const meta = getPlatformMeta(item.platform);
                  return (
                    <div
                      key={`${row.key}-${item.platform}`}
                      className="flex items-center justify-between rounded-xl border border-black/6 bg-white/70 px-2 py-1.5 dark:border-white/10 dark:bg-white/4"
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        {meta?.iconSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={meta.iconSrc} alt={item.platform} className="h-3.5 w-3.5 shrink-0 object-contain rounded-xs" />
                        ) : null}
                        <div className="truncate text-[11px] font-bold text-muted-foreground">{item.platform}</div>
                      </div>
                      <div className={cn("text-xs font-black tabular-nums shrink-0 ml-1", row.tone)}>
                        {item.value > 0 ? int(item.value) : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* 桌面端高质感表格 */}
        <div className="hidden overflow-hidden rounded-[22px] border border-black/6 bg-white/40 shadow-2xs backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.02] sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-black/6 bg-black/[0.025] text-muted-foreground dark:border-white/8 dark:bg-white/[0.03]">
                <th className="w-36 px-4 py-3.5 text-left font-bold">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground/80">渠道构成</div>
                </th>
                {matrix?.columns.map((col) => {
                  const meta = getPlatformMeta(col.platform);
                  const grandTotal = matrix?.grandTotal || 0;
                  const share = grandTotal > 0 && col.totalCount > 0 ? ((col.totalCount / grandTotal) * 100).toFixed(1) : null;
                  const hasOrders = col.totalCount > 0;

                  return (
                    <th key={col.platform} className="px-3 py-3.5 text-center font-bold">
                      <div className={cn("flex flex-col items-center gap-1", !hasOrders && "opacity-45")}>
                        <div className="flex items-center gap-1.5">
                          {meta?.iconSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={meta.iconSrc} alt={col.platform} className="h-4.5 w-4.5 shrink-0 object-contain rounded-xs" />
                          ) : null}
                          <span className="text-xs font-black text-foreground">{col.platform}</span>
                        </div>
                        {share ? (
                          <span className="inline-block rounded-full bg-black/5 px-2 py-0.2 text-[10px] font-bold text-muted-foreground dark:bg-white/8">
                            {share}%
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-muted-foreground/60">-</span>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="w-32 px-4 py-3.5 text-center font-bold">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 text-xs font-black text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      全渠道合计
                    </div>
                    <span className="inline-block rounded-full bg-primary/10 px-2 py-0.2 text-[10px] font-bold text-primary">
                      100%
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/6">
              {/* 真单行 */}
              <tr className="transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3.5 font-black text-foreground">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
                    <span>真单</span>
                    <span className="text-[10px] font-medium text-muted-foreground">履约</span>
                  </div>
                </td>
                {matrix?.columns.map((col) => (
                  <td key={`true-${col.platform}`} className="px-3 py-3.5 text-center font-mono font-black tabular-nums">
                    {col.trueOrderCount > 0 ? (
                      <span className="inline-block rounded-lg bg-emerald-500/10 px-2.5 py-1 text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {int(col.trueOrderCount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 font-normal">-</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3.5 text-center font-mono font-black tabular-nums">
                  <span className="inline-block rounded-lg bg-emerald-500/15 px-3 py-1 text-base font-black text-emerald-600 dark:text-emerald-400">
                    {int(matrix?.trueOrderTotal)}
                  </span>
                </td>
              </tr>

              {/* 刷单行 */}
              <tr className="transition-colors hover:bg-black/[0.015] dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3.5 font-black text-foreground">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500/70" />
                    <span>刷单</span>
                    <span className="text-[10px] font-medium text-muted-foreground">补单</span>
                  </div>
                </td>
                {matrix?.columns.map((col) => (
                  <td key={`brush-${col.platform}`} className="px-3 py-3.5 text-center font-mono font-bold tabular-nums">
                    {col.brushOrderCount > 0 ? (
                      <span className="inline-block rounded-lg bg-rose-500/10 px-2.5 py-1 text-sm font-black text-rose-500 dark:text-rose-400">
                        {int(col.brushOrderCount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 font-normal">-</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3.5 text-center font-mono font-bold tabular-nums">
                  {Number(matrix?.brushOrderTotal || 0) > 0 ? (
                    <span className="inline-block rounded-lg bg-rose-500/15 px-3 py-1 text-base font-black text-rose-500 dark:text-rose-400">
                      {int(matrix?.brushOrderTotal)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 font-normal">-</span>
                  )}
                </td>
              </tr>

              {/* 渠道总单量合计行 */}
              <tr className="border-t border-black/8 bg-black/[0.02] font-black dark:border-white/10 dark:bg-white/[0.025]">
                <td className="px-4 py-3.5 text-foreground">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span>合计</span>
                    <span className="text-[10px] font-medium text-muted-foreground">总单量</span>
                  </div>
                </td>
                {matrix?.columns.map((col) => (
                  <td key={`total-${col.platform}`} className="px-3 py-3.5 text-center font-mono font-black tabular-nums text-foreground">
                    {col.totalCount > 0 ? (
                      <span className="text-sm">{int(col.totalCount)}</span>
                    ) : (
                      <span className="text-muted-foreground/40 font-normal">-</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-3.5 text-center font-mono text-base font-black tabular-nums text-foreground">
                  {int(matrix?.grandTotal)}
                </td>
              </tr>

              {/* 平台健康度 / 真实率行 */}
              <tr className="bg-black/[0.01] text-xs dark:bg-white/[0.01]">
                <td className="px-4 py-2.5 font-bold text-muted-foreground">
                  <span>真实率</span>
                </td>
                {matrix?.columns.map((col) => {
                  const trueRate = col.totalCount > 0 ? ((col.trueOrderCount / col.totalCount) * 100).toFixed(0) : null;
                  return (
                    <td key={`rate-${col.platform}`} className="px-3 py-2.5 text-center font-bold tabular-nums text-muted-foreground">
                      {trueRate ? (
                        <span className={cn(Number(trueRate) === 100 ? "text-emerald-500/90" : "text-amber-500")}>
                          {trueRate}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-center font-bold tabular-nums text-emerald-500/90">
                  {matrix?.grandTotal ? ((matrix.trueOrderTotal / matrix.grandTotal) * 100).toFixed(0) : "100"}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className={cn("grid gap-6", isChartsFullWidth ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2")}>
        <Panel
          className="relative z-20 transition-all duration-200"
          title="每日盈亏"
          subtitle="每日净利润走势"
          action={(
            <div className="flex items-center gap-2">
              <CustomSelect
                value={profitPlatform}
                onChange={setProfitPlatform}
                options={platformOptions}
                className="h-9 min-w-29"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <button
                type="button"
                onClick={() => setIsChartsFullWidth((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white text-muted-foreground hover:text-foreground hover:bg-black/3 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/10 transition-all active:scale-95 cursor-pointer shadow-2xs"
                title={isChartsFullWidth ? "收起为单行并排" : "独占整行全宽展示"}
              >
                {isChartsFullWidth ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          )}
        >
          <div className={cn(
            "w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-tooltip-wrapper]:transition-none! [&_*:focus]:outline-none",
            isChartsFullWidth ? "h-85 sm:h-97.5" : "h-65 sm:h-72.5"
          )}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart accessibilityLayer={false} data={profitTrend} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netProfitStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={profitGradientOffset} stopColor="#22c55e" stopOpacity={1} />
                    <stop offset={profitGradientOffset} stopColor="#ef4444" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="netProfitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset={profitGradientOffset} stopColor="#22c55e" stopOpacity={0.03} />
                    <stop offset={profitGradientOffset} stopColor="#ef4444" stopOpacity={0.03} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
                <Tooltip
                  isAnimationActive={false}
                  animationDuration={0}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ zIndex: 1000, outline: "none", pointerEvents: "none", transition: "none" }}
                  content={<ChartTooltip valueFormatter={amountTooltip} nameMap={{ netProfit: "净利润" }} />}
                />
                <Area type="monotone" dataKey="netProfit" name="netProfit" stroke="url(#netProfitStroke)" fill="url(#netProfitFill)" strokeWidth={2.5} dot={<CustomizedDot />} activeDot={<CustomizedActiveDot />} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          className="relative z-10 transition-all duration-200"
          title="订单波动"
          subtitle={orderScope === "true" ? "按日期查看真单变化" : "按日期查看订单变化"}
          actionMobileStack
          action={(
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <CustomSelect
                value={orderScope}
                onChange={(value) => setOrderScope(value as "all" | "true")}
                options={[
                  { value: "all", label: "全部订单" },
                  { value: "true", label: "去除刷单" },
                ]}
                className="h-9 min-w-0 sm:min-w-29"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <CustomSelect
                value={orderPlatform}
                onChange={setOrderPlatform}
                options={platformOptions}
                className="h-9 min-w-0 sm:min-w-29"
                triggerClassName="h-full rounded-full border border-black/8 bg-white px-3.5 text-xs font-bold shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <button
                type="button"
                onClick={() => setIsChartsFullWidth((prev) => !prev)}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white text-muted-foreground hover:text-foreground hover:bg-black/3 dark:border-white/10 dark:bg-white/3 dark:hover:bg-white/10 transition-all active:scale-95 cursor-pointer shrink-0 shadow-2xs"
                title={isChartsFullWidth ? "收起为单行并排" : "独占整行全宽展示"}
              >
                {isChartsFullWidth ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          )}
        >
          <div className={cn(
            "w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-tooltip-wrapper]:transition-none! [&_*:focus]:outline-none",
            isChartsFullWidth ? "h-85 sm:h-97.5" : "h-65 sm:h-72.5"
          )}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart accessibilityLayer={false} data={orderTrend} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} allowDecimals={false} />
                <Tooltip
                  isAnimationActive={false}
                  animationDuration={0}
                  allowEscapeViewBox={{ x: false, y: true }}
                  wrapperStyle={{ zIndex: 1000, outline: "none", pointerEvents: "none", transition: "none" }}
                  content={<OrderTooltip orderScope={orderScope} />}
                />
                <Line type="monotone" dataKey={orderSeriesKey} name={orderSeriesKey} stroke={orderSeriesColor} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      {isCalendarOpen && (
        <PromotionCalendarModal
          initialDate={todayDate}
          localShops={mappedLocalShops}
          onClose={() => setIsCalendarOpen(false)}
        />
      )}
      {isCustomerDetailOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 touch-none overscroll-contain"
          onClick={() => setIsCustomerDetailOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[26px] border border-border bg-popover p-4 sm:p-6 text-popover-foreground shadow-2xl backdrop-blur-xl ring-1 ring-foreground/5 sm:rounded-[28px] animate-in zoom-in-95 duration-200 touch-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏标题与关闭按钮 */}
            <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
              <div>
                <h3 className="text-base font-black tracking-tight text-foreground sm:text-lg">客户每日明细</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{contextLabel} · 新老客订单结构</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerDetailOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer active:scale-95"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 周期全局汇总胶囊区（一眼看懂全局） */}
            {(() => {
              const sumNew = customerDaily.reduce((s, i) => s + i.newCustomerOrders, 0);
              const sumRet = customerDaily.reduce((s, i) => s + i.returningCustomerOrders, 0);
              const sumUnk = customerDaily.reduce((s, i) => s + i.unknownCustomerOrders, 0);
              const sumTotal = sumNew + sumRet + sumUnk;
              const sumKnown = sumNew + sumRet;
              const retRate = sumKnown > 0 ? (sumRet / sumKnown) * 100 : 0;
              const newRate = sumKnown > 0 ? (sumNew / sumKnown) * 100 : 0;

              return (
                <div className="my-3 grid grid-cols-4 gap-1.5 sm:gap-2 rounded-2xl border border-border/60 bg-muted/30 p-2.5 sm:p-3 text-center">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">总订单</div>
                    <div className="mt-0.5 text-sm sm:text-base font-black tabular-nums text-foreground">{int(sumTotal)} 单</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-rose-500/90 uppercase">新客订单</div>
                    <div className="mt-0.5 text-sm sm:text-base font-black tabular-nums text-rose-500">{int(sumNew)} 单</div>
                    <div className="text-[9px] font-medium text-muted-foreground tabular-nums">{newRate.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">老客复购</div>
                    <div className="mt-0.5 text-sm sm:text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{int(sumRet)} 单</div>
                    <div className="text-[9px] font-medium text-emerald-600/80 dark:text-emerald-400/80 tabular-nums">{retRate.toFixed(1)}% 复购率</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">待识别</div>
                    <div className="mt-0.5 text-sm sm:text-base font-black tabular-nums text-muted-foreground">{int(sumUnk)} 单</div>
                  </div>
                </div>
              );
            })()}

            {/* 每日明细列表（清晰紧凑有洞察，支持滚动） */}
            <div className="max-h-[58dvh] overflow-y-auto space-y-2 pr-1">
              {customerDaily.length > 0 ? (
                [...customerDaily].reverse().map((item) => {
                  const total = item.newCustomerOrders + item.returningCustomerOrders + item.unknownCustomerOrders;
                  const knownTotal = item.newCustomerOrders + item.returningCustomerOrders;
                  const newRate = knownTotal > 0 ? (item.newCustomerOrders / knownTotal) * 100 : 0;
                  const returningRate = knownTotal > 0 ? (item.returningCustomerOrders / knownTotal) * 100 : 0;

                  if (total === 0) {
                    return (
                      <div
                        key={item.date}
                        className="flex items-center justify-between rounded-xl border border-border/30 bg-muted/15 px-3 py-2 text-xs text-muted-foreground/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-muted-foreground/80">{item.label}</span>
                          <span className="text-[10px] font-mono text-muted-foreground/50">{item.date}</span>
                        </div>
                        <span className="text-[11px] font-medium">无交易记录</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.date}
                      className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-muted/20 p-2.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:border-border/80 hover:bg-muted/30"
                    >
                      {/* 左侧：日期与总单量 */}
                      <div className="flex items-center justify-between sm:justify-start gap-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black tabular-nums text-foreground">{item.label}</span>
                          <span className="text-[10px] text-muted-foreground/70 font-mono">{item.date}</span>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-xs font-black text-foreground tabular-nums">
                          {int(total)} 单
                        </span>
                      </div>

                      {/* 右侧：新客与老客复购明细标签 */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* 新客 */}
                        <div className="inline-flex items-center gap-1 rounded-xl border border-rose-500/15 bg-rose-500/10 px-2 py-0.5 text-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                          <span className="font-bold text-rose-500">新客 {int(item.newCustomerOrders)}</span>
                          {knownTotal > 0 ? (
                            <span className="text-[10px] font-medium text-rose-500/80">({newRate.toFixed(0)}%)</span>
                          ) : null}
                        </div>

                        {/* 老客复购 - 有复购时高亮 */}
                        {item.returningCustomerOrders > 0 ? (
                          <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/25 bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 shadow-2xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            <span>老客 {int(item.returningCustomerOrders)}</span>
                            <span className="text-[10px] font-medium text-emerald-600/80 dark:text-emerald-400/80">({returningRate.toFixed(0)}%)</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 rounded-xl border border-border/40 bg-muted/25 px-2 py-0.5 text-xs text-muted-foreground/60">
                            <span>老客 0</span>
                          </div>
                        )}

                        {/* 待识别 */}
                        {item.unknownCustomerOrders > 0 ? (
                          <div className="inline-flex items-center rounded-xl border border-border/40 bg-muted/25 px-1.5 py-0.5 text-[11px] text-muted-foreground/80">
                            <span>待查 {int(item.unknownCustomerOrders)}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[18px] border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                  当前范围暂无客户明细数据
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 费用与扣点明细弹窗（严格继承系统标准的 bg-popover 与 border-border 语义配色） */}
      {activeBreakdown ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 touch-none overscroll-contain"
          onClick={() => setActiveBreakdown(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-[26px] border border-border bg-popover p-5 text-popover-foreground shadow-2xl backdrop-blur-xl ring-1 ring-foreground/5 sm:rounded-[28px] animate-in zoom-in-95 duration-200 touch-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/70 pb-3.5">
              <div>
                <h3 className="text-base font-black tracking-tight text-foreground">{activeBreakdown.label}明细</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">共 {activeBreakdown.items.length} 个拆解项目</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveBreakdown(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-muted/50 text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="my-3.5 space-y-2 max-h-60 overflow-y-auto">
              {activeBreakdown.items.map((b) => (
                <div
                  key={b.label}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/30 px-3.5 py-2.5"
                >
                  <span className="text-xs font-semibold text-muted-foreground">{b.label}</span>
                  <span className="font-mono text-sm font-black tabular-nums text-foreground">{money(b.value)}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border/70 pt-3.5">
              <span className="text-xs font-bold text-muted-foreground">合计金额</span>
              <span className="font-mono text-base font-black tabular-nums text-foreground">
                {money(activeBreakdown.items.reduce((sum, i) => sum + i.value, 0))}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
