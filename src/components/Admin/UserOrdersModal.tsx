"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ShoppingBag,
  RotateCcw,
  Maximize,
  Minimize,
  Shield,
  Store,
  TrendingUp,
  TrendingDown,
  Calendar,
  Loader2,
  Package,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { cn, getPlatformMeta } from "@/lib/utils";
import { simplifyShopName } from "@/lib/shopIdentity";
import { toCurrency, getPlatformBadgeMeta } from "@/app/orders/OrderCard";
import { TodayOrdersView } from "@/app/orders/TodayOrdersView";
import { AllOrdersView } from "@/app/orders/AllOrdersView";
import { PromotionCalendarModal } from "@/app/orders/PromotionCalendarModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { StatsData } from "@/lib/types";

interface UserOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  roleName?: string | null;
}

const money = (val: number | undefined | null) => {
  const num = Number(val || 0);
  return `¥${num.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const int = (val: number | undefined | null) => Number(val || 0).toLocaleString("zh-CN");

const SHOP_PROFIT_PLATFORMS = ["美团", "京东", "淘宝", "抖店", "线下交易"] as const;

const SHOP_PROFIT_PLATFORM_ICONS: Record<(typeof SHOP_PROFIT_PLATFORMS)[number], string> = {
  美团: "/platform/美团.svg",
  京东: "/platform/京东.svg",
  淘宝: "/platform/淘宝.svg",
  抖店: "/platform/doudian.svg",
  线下交易: "/platform/线下交易.svg",
};

const CustomizedDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload || payload.netProfit === undefined) return null;
  const isPositive = payload.netProfit >= 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3}
      fill={isPositive ? "#22c55e" : "#ef4444"}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  );
};

const CustomizedActiveDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload || payload.netProfit === undefined) return null;
  const isPositive = payload.netProfit >= 0;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={isPositive ? "#22c55e" : "#ef4444"}
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
};

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
    <div className="relative z-[9999] -translate-y-1/2 pointer-events-none min-w-[200px] max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto rounded-[22px] border border-black/8 bg-white p-3 shadow-[0_18px_50px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-900 font-normal sm:min-w-[210px] sm:p-3.5">
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
                  <span className="max-w-[130px] truncate text-slate-700 dark:text-slate-300 font-normal">{shop}</span>
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
    <div className="relative z-[9999] -translate-y-1/2 pointer-events-none min-w-[180px] max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto rounded-[22px] border border-black/8 bg-white p-3.5 shadow-[0_18px_50px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-slate-900 font-normal">
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
        <div className="flex items-center justify-between gap-4 text-xs border-t border-dashed border-black/10 dark:border-white/10 pt-2.5 mt-2 font-normal">
          <span className="text-slate-600 dark:text-slate-400 font-normal">
            {isTrueScope ? "真单总量:" : "订单总量:"}
          </span>
          <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400">
            {total} 单
          </span>
        </div>
        {!isTrueScope && (brushCount > 0 || otherCount > 0) && (
          <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <span>含刷单 {brushCount} 单</span>
            {otherCount > 0 && <span>取消 {otherCount} 单</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function UserProfitTrendView({
  userId,
  userName,
  localShops,
  refreshTrigger = 0,
}: {
  userId: string;
  userName?: string | null;
  localShops: Array<{ id: string; name: string; address: string }>;
  refreshTrigger?: number;
}) {
  const today = useMemo(() => new Date(), []);
  const initialEnd = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const initialStart = useMemo(() => format(subDays(today, 6), "yyyy-MM-dd"), [today]);

  const [rangePreset, setRangePreset] = useState("7d");
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [selectedShopName, setSelectedShopName] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [orderScope, setOrderScope] = useState<"all" | "true">("all");

  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      query.set("userId", userId);
      if (rangePreset === "all") {
        query.set("range", "all");
      }
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      if (selectedShopName) query.set("shopName", selectedShopName);

      const res = await fetch(`/api/stats?${query.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
        if (rangePreset === "all" && data?.rangeStart && data?.rangeEnd) {
          setStartDate(data.rangeStart);
          setEndDate(data.rangeEnd);
        }
      }
    } catch (err) {
      console.error("Failed to load user profit trend:", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, rangePreset, startDate, endDate, selectedShopName]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      void fetchStats();
    }
  }, [refreshTrigger, fetchStats]);

  const timeRangeOptions = [
    { value: "7d", label: "近 7 天" },
    { value: "15d", label: "近 15 天" },
    { value: "30d", label: "近 30 天" },
    { value: "month", label: "本月" },
    { value: "all", label: "全部时间" },
    { value: "custom", label: "自定义区间" },
  ];

  const handleRangePresetChange = (preset: string) => {
    setRangePreset(preset);
    if (preset === "7d") {
      setStartDate(format(subDays(today, 6), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (preset === "15d") {
      setStartDate(format(subDays(today, 14), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (preset === "30d") {
      setStartDate(format(subDays(today, 29), "yyyy-MM-dd"));
      setEndDate(format(today, "yyyy-MM-dd"));
    } else if (preset === "month") {
      setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
    }
  };

  const businessTrend = statsData?.businessTrend || [];
  const platformBusinessTrend = statsData?.platformBusinessTrend || {};
  const profitTrend = selectedPlatform === "all" ? businessTrend : (platformBusinessTrend[selectedPlatform] || []);
  const orderTrend = selectedPlatform === "all" ? businessTrend : (platformBusinessTrend[selectedPlatform] || []);

  const profitGradientOffset = useMemo(() => {
    if (!profitTrend || profitTrend.length === 0) return 0;
    const values = profitTrend.map((i) => Number(i.netProfit || 0));
    const dataMax = Math.max(...values, 0);
    const dataMin = Math.min(...values, 0);
    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;
    return dataMax / (dataMax - dataMin);
  }, [profitTrend]);

  const platformOptions = [
    { value: "all", label: "全部平台" },
    { value: "美团", label: "美团" },
    { value: "京东", label: "京东" },
    { value: "淘宝", label: "淘宝" },
    { value: "抖店", label: "抖店" },
    { value: "线下交易", label: "线下交易" },
  ];

  const shopSelectOptions = useMemo(() => [
    { value: "", label: "全部店铺" },
    ...localShops.map((s) => ({ value: s.name, label: s.name })),
  ], [localShops]);

  const totalNetProfit = Number(statsData?.netProfit || 0);
  const totalUserPaid = Number(statsData?.userPaid || 0);
  const totalTrueOrders = Number(statsData?.platformMatrix?.trueOrderTotal || 0);
  const totalOrders = Number(statsData?.platformMatrix?.grandTotal || 0);
  const totalBrushOrders = Number(statsData?.platformMatrix?.brushOrderTotal || 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 顶部控制栏与筛选器：三个下拉列表一行（先店铺、后平台、后日子） */}
      <div className="rounded-2xl border border-black/8 bg-white/70 p-2.5 sm:p-3 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4 space-y-2.5">
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {/* 下拉 1：店铺筛选 */}
          <CustomSelect
            value={selectedShopName}
            onChange={setSelectedShopName}
            options={shopSelectOptions}
            className="h-8.5 sm:h-9 w-full"
            triggerClassName="h-full rounded-xl text-xs sm:text-sm border border-black/8 bg-white px-2 sm:px-3 text-center justify-center dark:border-white/10 dark:bg-white/5 font-medium"
          />

          {/* 下拉 2：平台筛选 */}
          <CustomSelect
            value={selectedPlatform}
            onChange={setSelectedPlatform}
            options={platformOptions}
            className="h-8.5 sm:h-9 w-full"
            triggerClassName="h-full rounded-xl text-xs sm:text-sm border border-black/8 bg-white px-2 sm:px-3 text-center justify-center dark:border-white/10 dark:bg-white/5 font-medium"
          />

          {/* 下拉 3：时间范围（日子） */}
          <CustomSelect
            value={rangePreset}
            onChange={handleRangePresetChange}
            options={timeRangeOptions}
            className="h-8.5 sm:h-9 w-full"
            triggerClassName="h-full rounded-xl text-xs sm:text-sm border border-black/8 bg-white px-2 sm:px-3 text-center justify-center dark:border-white/10 dark:bg-white/5 font-medium"
          />
        </div>

        {/* 当选择自定义区间时，优雅展开日期选择 */}
        {rangePreset === "custom" && (
          <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-black/5 dark:border-white/5 text-xs animate-in fade-in duration-200">
            <span className="text-[11px] text-muted-foreground shrink-0">自定义区间:</span>
            <DatePicker
              value={startDate}
              onChange={(val) => setStartDate(val)}
              className="flex-1 min-w-0"
              triggerClassName="h-8 rounded-xl text-xs border border-black/8 dark:border-white/10 bg-white dark:bg-white/5"
            />
            <span className="text-muted-foreground shrink-0 text-xs">至</span>
            <DatePicker
              value={endDate}
              onChange={(val) => setEndDate(val)}
              className="flex-1 min-w-0"
              triggerClassName="h-8 rounded-xl text-xs border border-black/8 dark:border-white/10 bg-white dark:bg-white/5"
            />
          </div>
        )}
      </div>

      {isLoading && !statsData ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm font-medium">正在计算 {userName || "成员"} 的麦芽田利润曲线...</p>
        </div>
      ) : (
        <>
          {/* 四项核心统计指标 */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-black/8 bg-white/76 p-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>区间纯利润</span>
                <TrendingUp size={13} className={totalNetProfit >= 0 ? "text-emerald-500" : "text-rose-500"} />
              </div>
              <div className={cn(
                "mt-1.5 text-xl sm:text-2xl font-black tabular-nums tracking-tight",
                totalNetProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                {money(totalNetProfit)}
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
                {totalNetProfit >= 0 ? "麦芽田订单净收益为正" : "麦芽田订单净利润承压"}
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/76 p-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>实收营业额</span>
                <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">去刷单</span>
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-black tabular-nums tracking-tight text-foreground">
                {money(totalUserPaid)}
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
                真实到手收入汇总
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/76 p-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>真单总量</span>
                <Package size={13} className="text-sky-500" />
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-black tabular-nums tracking-tight text-foreground">
                {int(totalTrueOrders)} <span className="text-xs font-normal text-muted-foreground">单</span>
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
                总订单 {totalOrders} 单 {totalBrushOrders > 0 ? `(刷单 ${totalBrushOrders})` : ""}
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/76 p-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>配送与支出</span>
                <Layers size={13} className="text-amber-500" />
              </div>
              <div className="mt-1.5 text-xl sm:text-2xl font-black tabular-nums tracking-tight text-foreground">
                {money(Number(statsData?.deliveryExpense || 0))}
              </div>
              <div className="mt-1 text-[10px] sm:text-[11px] text-muted-foreground truncate">
                平台佣金 {money(Number(statsData?.platformCommission || 0))}
              </div>
            </div>
          </div>

          {/* 主图表 1：每日净利润走势（AreaChart 渐变曲线） */}
          <div className="relative z-20 rounded-[22px] border border-black/8 bg-white/76 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/6 pb-3 dark:border-white/8">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
                  <TrendingUp size={16} className="text-emerald-500" />
                  <span>每日净利润走势曲线</span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  反映各日期真实纯收益（已扣除抽点、配送费、商品成本及支出）
                </p>
              </div>

              <CustomSelect
                value={selectedPlatform}
                onChange={setSelectedPlatform}
                options={platformOptions}
                className="h-8 min-w-[110px]"
                triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white px-2.5 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="h-[250px] sm:h-[280px] w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-tooltip-wrapper]:!z-[9999] [&_.recharts-tooltip-wrapper]:!pointer-events-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none [&_svg]:outline-none">
              {profitTrend.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  所选区间暂无利润数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart accessibilityLayer={false} data={profitTrend} margin={{ top: 12, right: 10, left: 0, bottom: 0 }} style={{ outline: "none" }}>
                    <defs>
                      <linearGradient id="userModalProfitStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={profitGradientOffset} stopColor="#22c55e" stopOpacity={1} />
                        <stop offset={profitGradientOffset} stopColor="#ef4444" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="userModalProfitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                        <stop offset={profitGradientOffset} stopColor="#22c55e" stopOpacity={0.03} />
                        <stop offset={profitGradientOffset} stopColor="#ef4444" stopOpacity={0.03} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={45} tickFormatter={(val) => `¥${val}`} />
                    <Tooltip
                      isAnimationActive={false}
                      allowEscapeViewBox={{ x: false, y: true }}
                      wrapperStyle={{ zIndex: 9999, outline: "none", pointerEvents: "none" }}
                      content={<ChartTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="netProfit"
                      name="净利润"
                      stroke="url(#userModalProfitStroke)"
                      fill="url(#userModalProfitFill)"
                      strokeWidth={2.5}
                      dot={<CustomizedDot />}
                      activeDot={<CustomizedActiveDot />}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 主图表 2：每日订单波动走势 */}
          <div className="relative z-10 rounded-[22px] border border-black/8 bg-white/76 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-black/6 pb-3 dark:border-white/8">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
                  <Package size={16} className="text-sky-500" />
                  <span>每日订单波动走势</span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  按日期查看麦芽田订单单量起伏与平台分布
                </p>
              </div>

              <div className="flex items-center gap-2">
                <CustomSelect
                  value={orderScope}
                  onChange={(val) => setOrderScope(val as "all" | "true")}
                  options={[
                    { value: "all", label: "全部订单" },
                    { value: "true", label: "去除刷单" },
                  ]}
                  className="h-8 min-w-[95px]"
                  triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white px-2.5 dark:border-white/10 dark:bg-white/5"
                />
                <CustomSelect
                  value={selectedPlatform}
                  onChange={setSelectedPlatform}
                  options={platformOptions}
                  className="h-8 min-w-[100px]"
                  triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white px-2.5 dark:border-white/10 dark:bg-white/5"
                />
              </div>
            </div>

            <div className="h-[220px] sm:h-[250px] w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-tooltip-wrapper]:!z-[9999] [&_.recharts-tooltip-wrapper]:!pointer-events-none [&_*:focus]:outline-none [&_*:focus-visible]:outline-none [&_svg]:outline-none">
              {orderTrend.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  所选区间暂无订单波动数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart accessibilityLayer={false} data={orderTrend} margin={{ top: 12, right: 10, left: 0, bottom: 0 }} style={{ outline: "none" }}>
                    <defs>
                      <linearGradient id="userModalOrderFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={35} />
                    <Tooltip
                      isAnimationActive={false}
                      allowEscapeViewBox={{ x: false, y: true }}
                      wrapperStyle={{ zIndex: 9999, outline: "none", pointerEvents: "none" }}
                      content={<OrderTooltip orderScope={orderScope} />}
                    />
                    <Area
                      type="monotone"
                      dataKey={orderScope === "true" ? "trueOrderCount" : "orderCount"}
                      name="单量"
                      stroke="#0ea5e9"
                      fill="url(#userModalOrderFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function UserOrdersModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  roleName,
}: UserOrdersModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeTab, setActiveTab] = useState<"today-orders" | "all-orders" | "profit-trend">("today-orders");
  const [allOrdersMounted, setAllOrdersMounted] = useState(false);

  const todayDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [promotionAmount, setPromotionAmount] = useState(0);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);

  const fetchPromotionExpense = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/promotion?date=${todayDate}&userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPromotionAmount(Number(data.amount) || 0);
      }
    } catch (err) {
      console.warn("Failed to fetch user promotion expense:", err);
    }
  }, [userId, todayDate]);

  useEffect(() => {
    if (isOpen && userId) {
      void fetchPromotionExpense();
    }
  }, [isOpen, userId, fetchPromotionExpense]);

  const handleHeaderRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
    void fetchPromotionExpense();
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 700);
  }, [fetchPromotionExpense]);

  useEffect(() => {
    if (activeTab === "all-orders" && !allOrdersMounted) {
      setAllOrdersMounted(true);
    }
  }, [activeTab, allOrdersMounted]);

  // 顶部看板数据状态（直接由 TodayOrdersView / AllOrdersView 回调供给，与订单主页面完全对齐）
  const [todaySummary, setTodaySummary] = useState<{
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
    realReceivedAmount?: number;
    brushReceivedAmount?: number;
    realPaidAmount?: number;
    brushPaidAmount?: number;
    platformReceived?: Record<string, { amount: number; count: number }>;
    platformDelivery?: Record<string, number>;
    pureProfit: number;
    platformProfit?: Record<string, { amount: number; count: number }>;
    shopProfit?: Record<string, {
      name: string;
      amount: number;
      count: number;
      receivedAmount?: number;
      realReceivedAmount?: number;
      brushReceivedAmount?: number;
      brushPaidAmount?: number;
      realOrderCount?: number;
      brushOrderCount?: number;
      deliveryFee: number;
      productCost: number;
      platformCommission: number;
      platformProfit?: Record<string, number>;
      platformCount?: Record<string, number>;
    }>;
  }>({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
    pureProfit: 0,
  });

  const [todayOverview, setTodayOverview] = useState<{
    totalCount: number;
    trueOrderCount: number;
    brushCount: number;
    cancelledCount: number;
    platformBreakdown?: {
      truePlatformCounts: Record<string, number>;
      brushPlatformCounts: Record<string, number>;
      cancelledPlatformCounts: Record<string, number>;
    };
  }>({
    totalCount: 0,
    trueOrderCount: 0,
    brushCount: 0,
    cancelledCount: 0,
    platformBreakdown: {
      truePlatformCounts: {},
      brushPlatformCounts: {},
      cancelledPlatformCounts: {},
    },
  });

  const [allSummary, setAllSummary] = useState<typeof todaySummary>({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
    pureProfit: 0,
  });

  const [allOverview, setAllOverview] = useState<typeof todayOverview>({
    totalCount: 0,
    trueOrderCount: 0,
    brushCount: 0,
    cancelledCount: 0,
    platformBreakdown: {
      truePlatformCounts: {},
      brushPlatformCounts: {},
      cancelledPlatformCounts: {},
    },
  });

  const activeSummary = activeTab === "all-orders" ? allSummary : todaySummary;
  const activeOverview = activeTab === "all-orders" ? allOverview : todayOverview;

  const [isIncomeDetailsOpen, setIsIncomeDetailsOpen] = useState(false);
  const incomeContainerRef = useRef<HTMLDivElement>(null);
  const incomeModalRef = useRef<HTMLDivElement>(null);
  const [isProfitDetailsOpen, setIsProfitDetailsOpen] = useState(false);
  const profitContainerRef = useRef<HTMLDivElement>(null);
  const profitModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isIncomeDetailsOpen && !isProfitDetailsOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (incomeContainerRef.current && incomeContainerRef.current.contains(target)) {
        return;
      }
      if (incomeModalRef.current && incomeModalRef.current.contains(target)) {
        return;
      }
      if (profitContainerRef.current && profitContainerRef.current.contains(target)) {
        return;
      }
      if (profitModalRef.current && profitModalRef.current.contains(target)) {
        return;
      }
      setIsIncomeDetailsOpen(false);
      setIsProfitDetailsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isIncomeDetailsOpen, isProfitDetailsOpen]);

  const shopReceivedEntries = useMemo(() => {
    return Object.entries(activeSummary.shopProfit || {})
      .map(([key, info]) => ({ key, ...info }))
      .filter((info) => (info.receivedAmount || 0) > 0 || (info.realReceivedAmount || 0) > 0 || (info.brushReceivedAmount || 0) > 0 || info.count > 0 || (info.realOrderCount || 0) > 0 || (info.brushOrderCount || 0) > 0 || info.amount !== 0)
      .sort((a, b) => {
        const aReceived = a.receivedAmount ?? a.amount ?? 0;
        const bReceived = b.receivedAmount ?? b.amount ?? 0;
        return bReceived - aReceived;
      });
  }, [activeSummary.shopProfit]);

  const shopProfitEntries = useMemo(() => {
    return Object.entries(activeSummary.shopProfit || {})
      .map(([key, info]) => ({ key, ...info }))
      .filter((info) => info.amount !== 0 || info.count > 0 || (info.realOrderCount || 0) > 0 || (info.brushOrderCount || 0) > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [activeSummary.shopProfit]);

  const platformProfitEntries = useMemo(() => {
    return Object.entries(activeSummary.platformProfit || {})
      .filter(([, info]) => info.amount !== 0 || info.count > 0)
      .sort(([, a], [, b]) => b.amount - a.amount);
  }, [activeSummary.platformProfit]);

  const [localShops, setLocalShops] = useState<Array<{ id: string; name: string; address: string }>>([]);

  const handleTodayDataLoad = useCallback((data: {
    summary: typeof todaySummary;
    overview: typeof todayOverview;
  }) => {
    if (data.summary) setTodaySummary(data.summary);
    if (data.overview) setTodayOverview(data.overview);
  }, []);

  const handleAllDataLoad = useCallback((data: {
    summary: typeof todaySummary;
    overview: typeof todayOverview;
  }) => {
    if (data.summary) setAllSummary(data.summary);
    if (data.overview) setAllOverview(data.overview);
  }, []);

  useEffect(() => {
    if (!isOpen || !userId) return;
    const fetchShops = async () => {
      try {
        const res = await fetch(`/api/orders/integration/local-shops?userId=${encodeURIComponent(userId)}`);
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.shops)) {
          setLocalShops(data.shops);
        }
      } catch (err) {
        console.warn("Failed to load user shops:", err);
      }
    };
    void fetchShops();
  }, [isOpen, userId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-85000 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className={`fixed left-1/2 top-1/2 z-85001 -translate-x-1/2 -translate-y-1/2 bg-background border border-border/80 shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen
                ? "w-screen h-dynamic-screen max-w-none max-h-none rounded-none border-none"
                : "w-full h-full sm:w-[calc(100%-40px)] max-w-6xl sm:h-[90vh] max-h-safe-modal rounded-none sm:rounded-3xl"
            }`}
          >
            {/* 顶部标题栏 */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3.5 sm:px-7 py-2.5 sm:py-4 border-b border-border/60 shrink-0 bg-muted/25 gap-2.5 sm:gap-4">
              {/* 顶部第一行：用户信息与移动端操作按钮 */}
              <div className="flex items-center justify-between gap-3 min-w-0 w-full sm:w-auto">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {activeTab === "profit-trend" ? (
                      <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : activeTab === "all-orders" ? (
                      <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <h2 className="text-sm sm:text-lg font-bold text-foreground truncate">
                        {userName || "成员"}
                        <span className="hidden sm:inline">
                          {" "}的
                          {activeTab === "profit-trend"
                            ? "麦芽田利润走势"
                            : activeTab === "all-orders"
                            ? "全部订单看板"
                            : "今日订单看板"}
                        </span>
                      </h2>
                      {roleName && (
                        <span className="inline-flex items-center gap-0.5 sm:gap-1 rounded-md border border-primary/15 bg-primary/5 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-primary shrink-0">
                          <Shield size={9} />
                          {roleName}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        麦芽田已接入
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-mono mt-0.5 truncate">
                      {userEmail || userId}
                    </p>
                  </div>
                </div>

                {/* 移动端右侧快捷操作（刷新 + 关闭） */}
                <div className="flex items-center gap-1.5 sm:hidden shrink-0">
                  <button
                    onClick={handleHeaderRefresh}
                    className="h-8 w-8 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95"
                    title="刷新数据"
                  >
                    <RotateCcw size={14} className={cn(isSpinning && "animate-spin text-primary")} />
                  </button>
                  <button
                    onClick={onClose}
                    className="h-8 w-8 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center active:scale-95"
                    title="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* 核心 Tab 切换与桌面端操作按钮组 */}
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-end">
                {/* 视图 Tab 切换：移动端全宽等分三列，桌面端行内胶囊 */}
                <div className="grid grid-cols-3 w-full sm:w-auto sm:flex sm:items-center rounded-xl border border-black/8 bg-black/3 p-1 dark:border-white/10 dark:bg-white/4 gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("today-orders")}
                    className={cn(
                      "flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs transition-all active:scale-95",
                      activeTab === "today-orders"
                        ? "bg-foreground text-background dark:bg-white dark:text-black font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ShoppingBag size={13} className="shrink-0" />
                    <span className="truncate">今日看板</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("all-orders")}
                    className={cn(
                      "flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs transition-all active:scale-95",
                      activeTab === "all-orders"
                        ? "bg-foreground text-background dark:bg-white dark:text-black font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Layers size={13} className="shrink-0" />
                    <span className="truncate">全部订单</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("profit-trend")}
                    className={cn(
                      "flex items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 sm:px-3 py-1.5 text-xs transition-all active:scale-95",
                      activeTab === "profit-trend"
                        ? "bg-foreground text-background dark:bg-white dark:text-black font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <TrendingUp size={13} className="shrink-0" />
                    <span className="truncate">利润曲线</span>
                  </button>
                </div>

                {/* 桌面端独立操作按钮（刷新 + 全屏 + 关闭） */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleHeaderRefresh}
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95"
                    title="刷新数据"
                  >
                    <RotateCcw size={14} className={cn(isSpinning && "animate-spin text-primary")} />
                  </button>

                  <button
                    onClick={() => setIsFullscreen((prev) => !prev)}
                    className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95"
                    title={isFullscreen ? "退出全屏" : "全屏查看"}
                  >
                    {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                  </button>

                  <button
                    onClick={onClose}
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center active:scale-95"
                    title="关闭"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* 弹窗内容区 */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-6 overscroll-contain">
              {activeTab === "profit-trend" ? (
                userId ? (
                  <UserProfitTrendView
                    userId={userId}
                    userName={userName}
                    localShops={localShops}
                    refreshTrigger={refreshTrigger}
                  />
                ) : (
                  <div className="py-20 text-center text-sm text-muted-foreground">
                    缺少有效的用户 ID
                  </div>
                )
              ) : (
                <>
                  {/* 今日/全部 指标看板：与订单页面顶部 1:1 完全对齐 */}
                  <div className="grid items-stretch gap-2.5 sm:gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {/* 1. 总订单 / 商家实收 合并卡片 */}
                    <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 md:col-span-2 lg:col-span-2">
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="shrink-0">
                            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground whitespace-nowrap">总订单</div>
                            <div className="mt-2 text-2xl sm:text-[30px] font-black leading-none tracking-tight text-foreground">{activeOverview.totalCount}</div>
                          </div>
                          <div
                            ref={incomeContainerRef}
                            onClick={() => setIsIncomeDetailsOpen((prev) => !prev)}
                            className="relative group/income min-w-0 text-right cursor-pointer select-none"
                          >
                            <div className="flex items-center justify-end gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                              <span className="leading-none">商家实收</span>
                              <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center -translate-y-[1px]">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 duration-1000" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)] transition-transform duration-200 group-hover/income:scale-125" />
                              </span>
                            </div>
                            <div className="mt-2 text-2xl sm:text-[30px] font-black leading-none tracking-tight text-emerald-600 dark:text-emerald-400 decoration-dotted underline-offset-4 group-hover/income:underline">
                              {toCurrency(activeSummary.receivedAmount || 0)}
                            </div>

                            {/* 桌面端：收入明细气泡浮窗（仅 sm: 显示，支持悬停与点击） */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className={cn(
                                "hidden sm:block absolute right-0 top-full z-50 mt-2 w-[360px] transition-all duration-200 ease-out",
                                isIncomeDetailsOpen
                                  ? "pointer-events-auto opacity-100 translate-y-0 scale-100"
                                  : "pointer-events-none opacity-0 translate-y-1 scale-95 group-hover/income:pointer-events-auto group-hover/income:opacity-100 group-hover/income:translate-y-0 group-hover/income:scale-100"
                              )}
                            >
                              <div className="flex flex-col gap-2.5 rounded-2xl border border-black/8 bg-white/94 p-3 text-left shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-white/12 dark:bg-[#0b111e]/95 dark:shadow-[0_20px_48px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.06)]">
                                <div className="flex items-center justify-between border-b border-black/6 pb-2 text-xs text-muted-foreground dark:border-white/8">
                                  <span className="flex items-center gap-1.5 font-medium text-foreground dark:text-white">
                                    <Store size={14} className="text-emerald-500 shrink-0" />
                                    <span>各店铺实收明细</span>
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    共 {shopReceivedEntries.length} 店
                                  </span>
                                </div>

                                <div className="flex flex-col gap-1.5 max-h-[230px] overflow-y-auto pr-1">
                                  {shopReceivedEntries.length > 0 ? (
                                    shopReceivedEntries.map((shop, idx) => {
                                      const displayShopName = shop.name === "未匹配店铺" ? shop.name : simplifyShopName(shop.name) || shop.name;
                                      const shopReceived = shop.receivedAmount ?? shop.amount ?? 0;
                                      const totalShopOrders = (shop.realOrderCount || 0) + (shop.brushOrderCount || 0) || shop.count;
                                      const hasBrush = (shop.brushOrderCount || 0) > 0 || (shop.brushReceivedAmount || 0) > 0;

                                      return (
                                        <div
                                          key={shop.key || idx}
                                          className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.025] border border-black/4 px-3 py-2 text-xs dark:bg-white/[0.035] dark:border-white/6 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                                              <span className="truncate text-sm font-semibold text-foreground dark:text-white" title={shop.name}>
                                                {displayShopName}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 pl-3">
                                              <span>{totalShopOrders}单</span>
                                              {hasBrush ? (
                                                <>
                                                  <span className="opacity-40">·</span>
                                                  <span className="text-sky-600 dark:text-sky-400 font-medium">真{shop.realOrderCount || 0}</span>
                                                  <span className="opacity-40">·</span>
                                                  <span className="text-rose-500 dark:text-rose-400 font-medium">刷{shop.brushOrderCount || 0}</span>
                                                </>
                                              ) : null}
                                            </div>
                                          </div>

                                          <div className="text-right shrink-0">
                                            <div className="text-sm font-semibold text-foreground dark:text-white tabular-nums">
                                              {toCurrency(shopReceived)}
                                            </div>
                                            {hasBrush ? (
                                              <div className="flex items-center justify-end gap-1.5 text-[11px] mt-0.5 tabular-nums">
                                                {(shop.brushReceivedAmount || 0) > 0 && (
                                                  <span className="text-rose-500 dark:text-rose-400 font-medium">
                                                    刷收 {toCurrency(shop.brushReceivedAmount || 0)}
                                                  </span>
                                                )}
                                                {(shop.brushPaidAmount || 0) > 0 && (
                                                  <span className="text-muted-foreground">
                                                    实付 {toCurrency(shop.brushPaidAmount || 0)}
                                                  </span>
                                                )}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="py-4 text-center text-xs text-muted-foreground/60">
                                      暂无分店铺实收数据
                                    </div>
                                  )}
                                </div>

                                <div className="border-t border-black/6 pt-2.5 dark:border-white/8 flex flex-col gap-2">
                                  <div className="flex items-baseline justify-between px-0.5">
                                    <span className="text-xs font-semibold text-foreground dark:text-white">实收总计</span>
                                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                      {toCurrency(activeSummary.receivedAmount || 0)}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                                    <div className="flex flex-col justify-between rounded-xl bg-sky-500/8 border border-sky-500/12 px-3 py-2 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium">真单实收</span>
                                        <span className="font-bold tabular-nums">{toCurrency(activeSummary.realReceivedAmount || 0)}</span>
                                      </div>
                                      <div className="text-[11px] text-muted-foreground mt-0.5">
                                        {activeOverview.trueOrderCount} 笔真单
                                      </div>
                                    </div>

                                    <div className="flex flex-col justify-between rounded-xl bg-rose-500/8 border border-rose-500/12 px-3 py-2 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium">刷单实收</span>
                                        <span className="font-bold tabular-nums">{toCurrency(activeSummary.brushReceivedAmount || 0)}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] text-rose-600/80 dark:text-rose-300/80 mt-0.5 font-medium">
                                        <span>实付支出</span>
                                        <span className="tabular-nums">{toCurrency(activeSummary.brushPaidAmount || 0)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* 移动端：真正的全屏居中弹窗（Portal 挂载，带遮罩与右上角关闭按钮） */}
                            {typeof document !== "undefined" && isIncomeDetailsOpen && createPortal(
                              <div
                                className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:hidden animate-in fade-in duration-200"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsIncomeDetailsOpen(false);
                                }}
                              >
                                <div
                                  ref={incomeModalRef}
                                  onClick={(e) => e.stopPropagation()}
                                  className="relative flex w-full max-w-[340px] max-h-[85vh] flex-col rounded-3xl border border-black/10 bg-white text-left shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#0c1220] animate-in zoom-in-95 duration-200 overflow-hidden"
                                >
                                  <div className="flex items-center justify-between border-b border-black/6 px-4 py-3 dark:border-white/8">
                                    <div className="flex items-center gap-2 font-semibold text-foreground dark:text-white">
                                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                        <Store size={15} />
                                      </div>
                                      <span className="text-sm font-bold">各店铺实收明细</span>
                                      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground dark:bg-white/10 dark:text-white/70">
                                        共 {shopReceivedEntries.length} 店
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsIncomeDetailsOpen(false);
                                      }}
                                      className="flex h-7 w-7 items-center justify-center rounded-full bg-black/5 text-muted-foreground transition-all hover:bg-black/10 hover:text-foreground active:scale-95 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20 dark:hover:text-white"
                                      aria-label="关闭"
                                    >
                                      <X size={15} />
                                    </button>
                                  </div>

                                  <div className="flex-1 flex flex-col gap-1.5 p-3.5 max-h-[42vh] overflow-y-auto">
                                    {shopReceivedEntries.length > 0 ? (
                                      shopReceivedEntries.map((shop, idx) => {
                                        const displayShopName = shop.name === "未匹配店铺" ? shop.name : simplifyShopName(shop.name) || shop.name;
                                        const shopReceived = shop.receivedAmount ?? shop.amount ?? 0;
                                        const totalShopOrders = (shop.realOrderCount || 0) + (shop.brushOrderCount || 0) || shop.count;
                                        const hasBrush = (shop.brushOrderCount || 0) > 0 || (shop.brushReceivedAmount || 0) > 0;

                                        return (
                                          <div
                                            key={shop.key || idx}
                                            className="flex items-center justify-between gap-3 rounded-2xl bg-black/[0.025] border border-black/4 px-3 py-2 text-xs dark:bg-white/[0.035] dark:border-white/6"
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                                                <span className="truncate text-sm font-semibold text-foreground dark:text-white" title={shop.name}>
                                                  {displayShopName}
                                                </span>
                                              </div>
                                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5 pl-3">
                                                <span>{totalShopOrders}单</span>
                                                {hasBrush ? (
                                                  <>
                                                    <span className="opacity-40">·</span>
                                                    <span className="text-sky-600 dark:text-sky-400 font-medium">真{shop.realOrderCount || 0}</span>
                                                    <span className="opacity-40">·</span>
                                                    <span className="text-rose-500 dark:text-rose-400 font-medium">刷{shop.brushOrderCount || 0}</span>
                                                  </>
                                                ) : null}
                                              </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                              <div className="text-sm font-semibold text-foreground dark:text-white tabular-nums">
                                                {toCurrency(shopReceived)}
                                              </div>
                                              {hasBrush ? (
                                                <div className="flex items-center justify-end gap-1.5 text-[11px] mt-0.5 tabular-nums">
                                                  {(shop.brushReceivedAmount || 0) > 0 && (
                                                    <span className="text-rose-500 dark:text-rose-400 font-medium">
                                                      刷收 {toCurrency(shop.brushReceivedAmount || 0)}
                                                    </span>
                                                  )}
                                                  {(shop.brushPaidAmount || 0) > 0 && (
                                                    <span className="text-muted-foreground">
                                                      实付 {toCurrency(shop.brushPaidAmount || 0)}
                                                    </span>
                                                  )}
                                                </div>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="py-6 text-center text-xs text-muted-foreground/60">
                                        暂无分店铺实收数据
                                      </div>
                                    )}
                                  </div>

                                  <div className="border-t border-black/6 bg-black/[0.015] p-3.5 dark:border-white/8 dark:bg-white/[0.02] flex flex-col gap-2.5">
                                    <div className="flex items-baseline justify-between px-0.5">
                                      <span className="text-xs font-semibold text-foreground dark:text-white">实收总计</span>
                                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                        {toCurrency(activeSummary.receivedAmount || 0)}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                                      <div className="flex flex-col justify-between rounded-xl bg-sky-500/8 border border-sky-500/12 px-3 py-2 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="font-medium">真单实收</span>
                                          <span className="font-bold tabular-nums">{toCurrency(activeSummary.realReceivedAmount || 0)}</span>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                          {activeOverview.trueOrderCount} 笔真单
                                        </div>
                                      </div>

                                      <div className="flex flex-col justify-between rounded-xl bg-rose-500/8 border border-rose-500/12 px-3 py-2 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="font-medium">刷单实收</span>
                                          <span className="font-bold tabular-nums">{toCurrency(activeSummary.brushReceivedAmount || 0)}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px] text-rose-600/80 dark:text-rose-300/80 mt-0.5 font-medium">
                                          <span>实付支出</span>
                                          <span className="tabular-nums">{toCurrency(activeSummary.brushPaidAmount || 0)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>,
                              document.body
                            )}
                          </div>
                        </div>

                        {/* 看板网格（移动端自适应为流式横条卡片，零截断无空白，0单项自动隐藏；桌面端保持三竖列大看板） */}
                        <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 mt-1 border-t border-black/4 pt-3 dark:border-white/5 text-[10px]">
                          {/* 第一列：真单 */}
                          <div className={cn(
                            "flex flex-col gap-2 min-w-0 rounded-2xl bg-sky-500/5 border border-sky-500/12 p-2.5 sm:p-3 dark:bg-sky-500/8 dark:border-sky-500/15",
                            activeOverview.trueOrderCount === 0 && (activeOverview.brushCount > 0 || activeOverview.cancelledCount > 0) && "hidden sm:flex"
                          )}>
                            {/* 移动端横向流式布局（< sm） */}
                            <div className="flex flex-col gap-1.5 sm:hidden">
                              <div className="flex items-baseline justify-between border-b border-sky-500/15 pb-1 px-0.5 text-sky-600 dark:text-sky-300 font-bold text-xs">
                                <span className="tracking-wide">真单</span>
                                <span className="text-xs font-black text-foreground dark:text-white tabular-nums">{activeOverview.trueOrderCount}单</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {activeOverview.platformBreakdown?.truePlatformCounts && Object.keys(activeOverview.platformBreakdown.truePlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.truePlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                      const meta = getPlatformBadgeMeta(platform);
                                      return (
                                        <div key={platform} className="inline-flex items-center gap-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] border border-black/4 dark:border-white/6 px-2 py-0.5 text-[11px] text-foreground/90 dark:text-white/90">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="font-medium">{platform}</span>
                                          <span className="font-bold text-foreground dark:text-white tabular-nums">{count}单</span>
                                        </div>
                                      );
                                    })
                                ) : (
                                  <span className="text-muted-foreground/40 text-[11px] py-0.5">-</span>
                                )}
                              </div>
                            </div>

                            {/* 桌面端垂直布局（sm: 及以上） */}
                            <div className="hidden sm:flex sm:flex-col sm:gap-2">
                              <div className="flex items-baseline justify-between border-b border-sky-500/15 pb-1.5 px-0.5 text-sky-600 dark:text-sky-300 font-bold text-[11px]">
                                <span className="truncate tracking-wide">真单</span>
                                <span className="text-[13px] font-black text-foreground dark:text-white shrink-0">{activeOverview.trueOrderCount}单</span>
                              </div>
                              <div className="flex flex-col gap-1.5 px-0.5 mt-0.5">
                                {activeOverview.platformBreakdown?.truePlatformCounts && Object.keys(activeOverview.platformBreakdown.truePlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.truePlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                    const meta = getPlatformBadgeMeta(platform);
                                    return (
                                      <div key={platform} className="flex items-center justify-between text-foreground/90 dark:text-white/90 text-[10px]">
                                        <span className="flex items-center gap-1 min-w-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="truncate font-medium">{platform}</span>
                                        </span>
                                        <span className="shrink-0 font-semibold">{count}单</span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-muted-foreground/40 text-center py-1 text-[9px]">-</div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 第二列：刷单 */}
                          <div className={cn(
                            "flex flex-col gap-2 min-w-0 rounded-2xl bg-rose-500/5 border border-rose-500/12 p-2.5 sm:p-3 dark:bg-rose-500/8 dark:border-rose-500/15",
                            activeOverview.brushCount === 0 && "hidden sm:flex"
                          )}>
                            {/* 移动端横向流式布局（< sm） */}
                            <div className="flex flex-col gap-1.5 sm:hidden">
                              <div className="flex items-baseline justify-between border-b border-rose-500/15 pb-1 px-0.5 text-rose-600 dark:text-rose-300 font-bold text-xs">
                                <span className="tracking-wide">刷单</span>
                                <span className="text-xs font-black text-foreground dark:text-white tabular-nums">{activeOverview.brushCount}单</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {activeOverview.platformBreakdown?.brushPlatformCounts && Object.keys(activeOverview.platformBreakdown.brushPlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.brushPlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                      const meta = getPlatformBadgeMeta(platform);
                                      return (
                                        <div key={platform} className="inline-flex items-center gap-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] border border-black/4 dark:border-white/6 px-2 py-0.5 text-[11px] text-foreground/90 dark:text-white/90">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="font-medium">{platform}</span>
                                          <span className="font-bold text-foreground dark:text-white tabular-nums">{count}单</span>
                                        </div>
                                      );
                                    })
                                ) : (
                                  <span className="text-muted-foreground/40 text-[11px] py-0.5">-</span>
                                )}
                              </div>
                            </div>

                            {/* 桌面端垂直布局（sm: 及以上） */}
                            <div className="hidden sm:flex sm:flex-col sm:gap-2">
                              <div className="flex items-baseline justify-between border-b border-rose-500/15 pb-1.5 px-0.5 text-rose-600 dark:text-rose-300 font-bold text-[11px]">
                                <span className="truncate tracking-wide">刷单</span>
                                <span className="text-[13px] font-black text-foreground dark:text-white shrink-0">{activeOverview.brushCount}单</span>
                              </div>
                              <div className="flex flex-col gap-1.5 px-0.5 mt-0.5">
                                {activeOverview.platformBreakdown?.brushPlatformCounts && Object.keys(activeOverview.platformBreakdown.brushPlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.brushPlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                    const meta = getPlatformBadgeMeta(platform);
                                    return (
                                      <div key={platform} className="flex items-center justify-between text-foreground/90 dark:text-white/90 text-[10px]">
                                        <span className="flex items-center gap-1 min-w-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="truncate font-medium">{platform}</span>
                                        </span>
                                        <span className="shrink-0 font-semibold">{count}单</span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-muted-foreground/40 text-center py-1 text-[9px]">-</div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 第三列：取消 */}
                          <div className={cn(
                            "flex flex-col gap-2 min-w-0 rounded-2xl bg-amber-500/5 border border-amber-500/12 p-2.5 sm:p-3 dark:bg-amber-500/8 dark:border-amber-500/15",
                            activeOverview.cancelledCount === 0 && "hidden sm:flex"
                          )}>
                            {/* 移动端横向流式布局（< sm） */}
                            <div className="flex flex-col gap-1.5 sm:hidden">
                              <div className="flex items-baseline justify-between border-b border-amber-500/15 pb-1 px-0.5 text-amber-600 dark:text-amber-300 font-bold text-xs">
                                <span className="tracking-wide">取消</span>
                                <span className="text-xs font-black text-foreground dark:text-white tabular-nums">{activeOverview.cancelledCount}单</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {activeOverview.platformBreakdown?.cancelledPlatformCounts && Object.keys(activeOverview.platformBreakdown.cancelledPlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.cancelledPlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                      const meta = getPlatformBadgeMeta(platform);
                                      return (
                                        <div key={platform} className="inline-flex items-center gap-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] border border-black/4 dark:border-white/6 px-2 py-0.5 text-[11px] text-foreground/90 dark:text-white/90">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="font-medium">{platform}</span>
                                          <span className="font-bold text-foreground dark:text-white tabular-nums">{count}单</span>
                                        </div>
                                      );
                                    })
                                ) : (
                                  <span className="text-muted-foreground/40 text-[11px] py-0.5">-</span>
                                )}
                              </div>
                            </div>

                            {/* 桌面端垂直布局（sm: 及以上） */}
                            <div className="hidden sm:flex sm:flex-col sm:gap-2">
                              <div className="flex items-baseline justify-between border-b border-amber-500/15 pb-1.5 px-0.5 text-amber-600 dark:text-amber-300 font-bold text-[11px]">
                                <span className="truncate tracking-wide">取消</span>
                                <span className="text-[13px] font-black text-foreground dark:text-white shrink-0">{activeOverview.cancelledCount}单</span>
                              </div>
                              <div className="flex flex-col gap-1.5 px-0.5 mt-0.5">
                                {activeOverview.platformBreakdown?.cancelledPlatformCounts && Object.keys(activeOverview.platformBreakdown.cancelledPlatformCounts).length > 0 ? (
                                  Object.entries(activeOverview.platformBreakdown.cancelledPlatformCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([platform, count]) => {
                                    const meta = getPlatformBadgeMeta(platform);
                                    return (
                                      <div key={platform} className="flex items-center justify-between text-foreground/90 dark:text-white/90 text-[10px]">
                                        <span className="flex items-center gap-1 min-w-0">
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                          <span className="truncate font-medium">{platform}</span>
                                        </span>
                                        <span className="shrink-0 font-semibold">{count}单</span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-muted-foreground/40 text-center py-1 text-[9px]">-</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. 平台纯利润分布卡片 */}
                    <div
                      role="button"
                      tabIndex={0}
                      ref={profitContainerRef}
                      onClick={() => setIsProfitDetailsOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setIsProfitDetailsOpen(true);
                        }
                      }}
                      title="查看利润明细"
                      className="group min-w-0 h-full rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 text-left shadow-xs transition hover:border-emerald-400/40 hover:bg-emerald-50/60 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-300/35 dark:hover:bg-emerald-400/8 flex flex-col gap-2.5 cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between sm:block">
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <span>纯利润</span>
                              <Store className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 group-hover:underline font-bold">
                              <span>查看明细</span>
                              <ArrowUpRight size={11} />
                            </span>
                          </div>
                          <div className={cn(
                            "sm:hidden text-[22px] font-bold leading-none tracking-tight",
                            activeSummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {toCurrency(activeSummary.pureProfit || 0)}
                          </div>
                        </div>
                        <div className={cn(
                          "hidden sm:block mt-2 text-[26px] font-bold leading-none tracking-tight",
                          activeSummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                        )}>
                          {toCurrency(activeSummary.pureProfit || 0)}
                        </div>
                        <div className="mt-1.5 text-xs text-muted-foreground">
                          {activeTab === "all-orders" ? "当前筛选各平台纯利润汇总" : "今日各平台纯利润汇总"}
                        </div>
                      </div>
                      {activeSummary.platformProfit && Object.entries(activeSummary.platformProfit).some(([, info]) => info.amount !== 0) ? (
                        <div className="grid grid-cols-2 gap-2 border-t border-black/4 pt-3 dark:border-white/5">
                          {Object.entries(activeSummary.platformProfit)
                            .sort((a, b) => b[1].amount - a[1].amount)
                            .map(([platform, info]) => {
                            if (info.amount === 0) return null;
                            const meta = getPlatformBadgeMeta(platform);
                            return (
                              <div key={platform} className="flex items-center justify-between min-w-0 rounded-xl bg-black/1.5 px-2.5 py-1.5 dark:bg-white/1.5 text-[11px] text-foreground/80 dark:text-white/80">
                                <span className="flex items-center gap-1.5 min-w-0 shrink">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                  <span className="truncate font-medium">{platform}</span>
                                </span>
                                <span className={cn(
                                  "font-bold shrink-0 tabular-nums ml-1",
                                  info.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {toCurrency(info.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {typeof document !== "undefined" && isProfitDetailsOpen && createPortal(
                        <div
                          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/45 p-2 backdrop-blur-sm sm:p-4"
                          onMouseDown={(event) => {
                            event.stopPropagation();
                            setIsProfitDetailsOpen(false);
                          }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div
                            ref={profitModalRef}
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white text-slate-950 shadow-2xl dark:border-white/10 dark:bg-[#111827] dark:text-white sm:max-h-[88vh] sm:rounded-[20px]"
                          >
                            <div className="flex items-start justify-between gap-3 border-b border-black/8 px-4 py-3 dark:border-white/10 sm:gap-4 sm:px-5 sm:py-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-lg font-bold sm:text-xl">
                                  <Store className="h-5 w-5 text-emerald-500" />
                                  <span className="truncate">店铺利润</span>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                                  {activeTab === "today-orders" ? "今日订单纯利润按店铺汇总" : "当前筛选订单纯利润按店铺汇总"}
                                </div>
                              </div>
                              <button
                                type="button"
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setIsProfitDetailsOpen(false);
                                }}
                                className="rounded-full p-2 text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                                aria-label="关闭"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 border-b border-black/8 px-4 py-2.5 dark:border-white/10 sm:grid-cols-4 sm:px-5 sm:py-3">
                              {[
                                { label: "总纯利润", value: toCurrency(activeSummary.pureProfit), tone: activeSummary.pureProfit < 0 ? "text-rose-500" : "text-emerald-500" },
                                { label: "店铺", value: `${shopProfitEntries.length} 家`, tone: "text-foreground" },
                                { label: "订单", value: `${activeSummary.validOrderCount} 单`, tone: "text-foreground" },
                                { label: "配送费", value: toCurrency(activeSummary.totalDeliveryFee), tone: "text-foreground" },
                              ].map((item) => (
                                <div key={item.label} className="rounded-xl border border-black/6 bg-slate-100/80 px-3 py-2 dark:border-white/8 dark:bg-white/6">
                                  <div className="text-[10px] font-bold text-muted-foreground">{item.label}</div>
                                  <div className={cn("mt-0.5 text-base font-black tabular-nums leading-tight sm:text-lg", item.tone)}>
                                    {item.value}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="overflow-y-auto px-3 py-3 sm:px-5">
                              {shopProfitEntries.length > 0 ? (
                                <div className="overflow-hidden rounded-xl border border-black/8 bg-slate-50/80 text-sm dark:border-white/10 dark:bg-white/[0.035]">
                                  <div className="overflow-x-auto">
                                    <div className="hidden min-w-[1040px] grid-cols-[2.75rem_6.5rem_4.25rem_6.75rem_5.75rem_5.75rem_5.75rem_repeat(5,5.75rem)] border-b border-black/6 bg-slate-100/80 px-3 py-2 text-[11px] font-bold text-muted-foreground dark:border-white/8 dark:bg-white/5 xl:grid">
                                      <div className="text-center">#</div>
                                      <div className="text-center">店铺</div>
                                      <div className="text-center">订单</div>
                                      <div className="text-center">纯利润</div>
                                      <div className="text-center">货品</div>
                                      <div className="text-center">配送</div>
                                      <div className="text-center">佣金</div>
                                      {SHOP_PROFIT_PLATFORMS.map((platform) => (
                                        <div key={platform} className="flex items-center justify-center gap-1.5">
                                          <Image
                                            src={SHOP_PROFIT_PLATFORM_ICONS[platform]}
                                            alt=""
                                            width={16}
                                            height={16}
                                            className="h-3.5 w-3.5 shrink-0 rounded"
                                          />
                                          <span>{platform}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {shopProfitEntries.map((shop, idx) => {
                                      const averageProfit = shop.count > 0 ? shop.amount / shop.count : 0;
                                  const displayShopName = shop.name === "未匹配店铺" ? shop.name : simplifyShopName(shop.name) || shop.name;
                                  return (
                                    <div key={shop.key || idx} className="border-b border-black/6 px-3 py-2.5 last:border-b-0 dark:border-white/8 xl:grid xl:min-w-[1040px] xl:grid-cols-[2.75rem_6.5rem_4.25rem_6.75rem_5.75rem_5.75rem_5.75rem_repeat(5,5.75rem)] xl:items-center xl:px-3 xl:py-2">
                                      <div className="hidden text-center text-xs font-black tabular-nums text-muted-foreground xl:block">
                                        #{idx + 1}
                                      </div>

                                      <div className="flex min-w-0 items-center gap-2 xl:justify-center xl:px-2">
                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-black tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300 xl:hidden">
                                          {idx + 1}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-base font-black leading-5 xl:text-center xl:text-sm" title={shop.name}>
                                            {displayShopName}
                                          </div>
                                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground xl:hidden">
                                            <span>{shop.count} 单</span>
                                            <span>均利 {toCurrency(averageProfit)}</span>
                                          </div>
                                        </div>
                                        <div className={cn("shrink-0 text-lg font-black tabular-nums leading-none xl:hidden", shop.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                                          {toCurrency(shop.amount)}
                                        </div>
                                      </div>

                                      <div className="hidden text-center font-bold tabular-nums xl:block">{shop.count}</div>
                                      <div className={cn("hidden text-center text-base font-black tabular-nums xl:block", shop.amount < 0 ? "text-rose-500" : "text-emerald-500")}>
                                        {toCurrency(shop.amount)}
                                      </div>
                                      <div className="hidden text-center font-bold tabular-nums xl:block">{toCurrency(shop.productCost)}</div>
                                      <div className="hidden text-center font-bold tabular-nums xl:block">{toCurrency(shop.deliveryFee)}</div>
                                      <div className="hidden text-center font-bold tabular-nums xl:block">{toCurrency(shop.platformCommission)}</div>
                                      {SHOP_PROFIT_PLATFORMS.map((platform) => {
                                        const amount = shop.platformProfit?.[platform] || 0;
                                        const count = shop.platformCount?.[platform] || 0;
                                        return (
                                          <div
                                            key={platform}
                                            className={cn(
                                              "hidden text-center text-xs font-black tabular-nums leading-tight xl:block",
                                              amount < 0 ? "text-rose-500" : amount > 0 ? "text-emerald-500" : "text-muted-foreground/55"
                                            )}
                                          >
                                            {amount !== 0 || count > 0 ? (
                                              <>
                                                <div className="truncate">{toCurrency(amount)}</div>
                                                <div className="mt-0.5 text-[10px] font-bold text-muted-foreground">{count} 单</div>
                                              </>
                                            ) : (
                                              <span className="text-muted-foreground/35">-</span>
                                            )}
                                          </div>
                                        );
                                      })}

                                      <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs xl:hidden">
                                        <div className="rounded-lg bg-slate-200/50 px-2 py-1.5 dark:bg-white/6">
                                          <div className="text-muted-foreground">货品</div>
                                          <div className="font-bold tabular-nums">{toCurrency(shop.productCost)}</div>
                                        </div>
                                        <div className="rounded-lg bg-slate-200/50 px-2 py-1.5 dark:bg-white/6">
                                          <div className="text-muted-foreground">配送</div>
                                          <div className="font-bold tabular-nums">{toCurrency(shop.deliveryFee)}</div>
                                        </div>
                                        <div className="rounded-lg bg-slate-200/50 px-2 py-1.5 dark:bg-white/6">
                                          <div className="text-muted-foreground">佣金</div>
                                          <div className="font-bold tabular-nums">{toCurrency(shop.platformCommission)}</div>
                                        </div>
                                        <div className="rounded-lg bg-slate-200/50 px-2 py-1.5 dark:bg-white/6">
                                          <div className="text-muted-foreground">均利</div>
                                          <div className={cn("font-bold tabular-nums", averageProfit < 0 ? "text-rose-500" : "text-emerald-500")}>{toCurrency(averageProfit)}</div>
                                        </div>
                                      </div>

                                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-5 xl:hidden">
                                        {SHOP_PROFIT_PLATFORMS.map((platform) => {
                                          const amount = shop.platformProfit?.[platform] || 0;
                                          const count = shop.platformCount?.[platform] || 0;
                                          return (
                                            <div key={platform} className="flex min-w-0 items-center justify-between gap-1 rounded-lg bg-slate-200/50 px-2 py-1.5 dark:bg-white/6">
                                              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                                                <Image
                                                  src={SHOP_PROFIT_PLATFORM_ICONS[platform]}
                                                  alt=""
                                                  width={16}
                                                  height={16}
                                                  className="h-3.5 w-3.5 shrink-0 rounded"
                                                />
                                                <span className="truncate">{platform}</span>
                                              </span>
                                              <span className="shrink-0 text-right tabular-nums">
                                                <span className={cn("font-black", amount < 0 ? "text-rose-500" : amount > 0 ? "text-emerald-500" : "text-muted-foreground/55")}>{toCurrency(amount)}</span>
                                                <span className="ml-1 rounded-md border border-white/10 bg-white/8 px-1 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">{count}单</span>
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-2xl border border-dashed border-black/12 py-12 text-center text-sm text-muted-foreground dark:border-white/12">
                                  暂无店铺利润明细
                                </div>
                              )}
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}
                    </div>

                    {/* 3. 最右侧：总配送费与推广费垂直组合列（严格对齐 orders/page.tsx，填满第4列，杜绝突出折行） */}
                    <div className={cn(
                      "h-full lg:col-span-1",
                      activeTab === "today-orders" ? "grid grid-cols-2 gap-2.5 sm:gap-3 lg:flex lg:flex-col" : "flex flex-col gap-3"
                    )}>
                      {activeTab === "today-orders" ? (
                        <>
                          <div className="flex-1 min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between">
                            <div>
                              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">总配送费</div>
                              <div className="mt-2 text-2xl sm:text-[30px] font-bold leading-none tracking-tight text-foreground">
                                {toCurrency(activeSummary.totalDeliveryFee || 0)}
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">今日订单汇总</p>
                          </div>

                          <div
                            onClick={() => setIsPromotionModalOpen(true)}
                            className="flex-1 min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between cursor-pointer group hover:border-amber-400/40 hover:bg-amber-50/60 dark:hover:border-amber-400/30 dark:hover:bg-amber-400/8 transition active:scale-[0.99]"
                            title="点击查看历史推广费日历与趋势图"
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">推广费</div>
                              <span className="flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 opacity-80 group-hover:opacity-100 transition-opacity">
                                <span>历史日历</span>
                                <ArrowUpRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                              </span>
                            </div>
                            <div className="mt-2 text-2xl sm:text-[30px] font-bold leading-none tracking-tight text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                              {toCurrency(promotionAmount)}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">今日推广费录入</p>
                          </div>
                        </>
                      ) : (
                        <div className="min-w-0 h-full rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col gap-2.5">
                          <div className="flex flex-col w-full">
                            <div className="flex items-center justify-between sm:block">
                              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">总配送费</div>
                              <div className="sm:hidden text-[22px] font-bold leading-none tracking-tight text-foreground">
                                {toCurrency(activeSummary.totalDeliveryFee || 0)}
                              </div>
                            </div>
                            <div className="hidden sm:block mt-2 text-[26px] font-bold leading-none tracking-tight text-foreground">
                              {toCurrency(activeSummary.totalDeliveryFee || 0)}
                            </div>
                            <div className="mt-1.5 text-xs text-muted-foreground">
                              全部订单配送费汇总
                            </div>
                          </div>
                          {activeSummary.platformDelivery && Object.keys(activeSummary.platformDelivery).length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 border-t border-black/4 pt-3 dark:border-white/5">
                              {Object.entries(activeSummary.platformDelivery)
                                .sort(([, a], [, b]) => b - a)
                                .map(([platform, fee]) => {
                                  const meta = getPlatformBadgeMeta(platform);
                                  return (
                                    <div key={platform} className="flex items-center justify-between min-w-0 rounded-xl bg-black/1.5 px-2.5 py-1.5 dark:bg-white/1.5 text-[11px] text-foreground/80 dark:text-white/80">
                                      <span className="flex items-center gap-1.5 min-w-0 shrink">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        <span className="truncate font-medium">{platform}</span>
                                      </span>
                                      <span className="font-bold shrink-0 tabular-nums ml-1 text-foreground/90 dark:text-white/90">
                                        {toCurrency(fee)}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 今日订单视图 */}
                  <div className={activeTab === "today-orders" ? "block pt-1 sm:pt-2" : "hidden"}>
                    <TodayOrdersView
                      userId={userId}
                      refreshTrigger={refreshTrigger}
                      onOpenCostBackfill={() => {}}
                      onOpenMatchEditor={() => {}}
                      onDataLoad={handleTodayDataLoad}
                      localShops={localShops}
                      readOnly={true}
                    />
                  </div>

                  {/* 全部订单视图 */}
                  {allOrdersMounted && (
                    <div className={activeTab === "all-orders" ? "block pt-1 sm:pt-2" : "hidden"}>
                      <AllOrdersView
                        userId={userId}
                        refreshTrigger={refreshTrigger}
                        onOpenCostBackfill={() => {}}
                        onOpenMatchEditor={() => {}}
                        onDataLoad={handleAllDataLoad}
                        localShops={localShops}
                        readOnly={true}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* 查看成员的历史推广费日历与趋势弹窗 */}
      {isPromotionModalOpen && (
        <PromotionCalendarModal
          initialDate={todayDate}
          localShops={localShops}
          userId={userId || undefined}
          userName={userName || undefined}
          readOnly={true}
          onClose={() => {
            setIsPromotionModalOpen(false);
            void fetchPromotionExpense();
          }}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}
