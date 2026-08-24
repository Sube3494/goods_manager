"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { toCurrency, getPlatformBadgeMeta } from "@/app/orders/OrderCard";
import { TodayOrdersView } from "@/app/orders/TodayOrdersView";
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

function TrendProfitTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload?: any }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const netProfit = Number(item.netProfit || 0);
  const platformProfits = item.platformProfits || {};
  const platformEntries = Object.entries(platformProfits).filter(([, v]) => Number(v || 0) !== 0);
  const orderCount = Number(item.orderCount || 0);
  const trueOrderCount = Number(item.trueOrderCount || 0);
  const brushOrderCount = Number(item.brushOrderCount || 0);
  const userPaid = Number(item.userPaid || 0);
  const commission = Number(item.commission || 0);
  const deliveryExpense = Number(item.deliveryExpense || 0);
  const productCost = Number(item.productCost || 0);

  return (
    <div className="relative z-50 -translate-y-1/2 pointer-events-none min-w-[210px] max-w-[calc(100vw-32px)] max-h-[75vh] overflow-y-auto rounded-2xl border border-black/10 bg-white/95 p-3.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-black/6 pb-2 dark:border-white/8">
        <span className="font-bold text-slate-800 dark:text-zinc-200">{label} 经营盈亏</span>
        <span className={cn(
          "px-2 py-0.5 rounded-md font-bold text-[10px]",
          netProfit >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        )}>
          {netProfit >= 0 ? "盈利" : "承压"}
        </span>
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-4 font-bold text-sm">
          <span className="text-foreground">当日净利润:</span>
          <span className={cn("tabular-nums", netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {money(netProfit)}
          </span>
        </div>

        {platformEntries.length > 0 && (
          <div className="my-1.5 space-y-1 rounded-xl bg-black/2.5 p-2 dark:bg-white/4">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">各平台纯利润</div>
            {platformEntries.map(([platform, amount]) => {
              const meta = getPlatformMeta(platform);
              return (
                <div key={platform} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-foreground truncate">{meta?.name || platform}:</span>
                  <span className={cn("font-medium tabular-nums", Number(amount) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {money(Number(amount))}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-1 border-t border-dashed border-black/8 dark:border-white/8 pt-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>实收营业额:</span>
            <span className="tabular-nums font-medium text-foreground">{money(userPaid)}</span>
          </div>
          {commission > 0 && (
            <div className="flex items-center justify-between">
              <span>平台佣金扣点:</span>
              <span className="tabular-nums font-medium text-rose-500">-{money(commission)}</span>
            </div>
          )}
          {deliveryExpense > 0 && (
            <div className="flex items-center justify-between">
              <span>配送费支出:</span>
              <span className="tabular-nums font-medium text-rose-500">-{money(deliveryExpense)}</span>
            </div>
          )}
          {productCost > 0 && (
            <div className="flex items-center justify-between">
              <span>货品成本:</span>
              <span className="tabular-nums font-medium text-rose-500">-{money(productCost)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-black/4 dark:border-white/4">
            <span>当日单量:</span>
            <span className="tabular-nums font-semibold text-foreground">
              共 {orderCount} 单 (真单 {trueOrderCount}{brushOrderCount > 0 ? ` · 刷单 ${brushOrderCount}` : ""})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendOrderTooltip({
  active,
  payload,
  label,
  orderScope = "all",
}: {
  active?: boolean;
  payload?: Array<{ payload?: any }>;
  label?: string;
  orderScope?: "all" | "true";
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  const isTrue = orderScope === "true";
  const total = isTrue ? Number(item.trueOrderCount || 0) : Number(item.orderCount || 0);
  const platformCounts = item.platformOrderCount || {};
  const entries = Object.entries(platformCounts).filter(([, v]) => Number(v || 0) > 0);

  return (
    <div className="relative z-50 -translate-y-1/2 pointer-events-none min-w-[190px] rounded-2xl border border-black/10 bg-white/95 p-3.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-black/6 pb-2 dark:border-white/8">
        <span className="font-bold text-slate-800 dark:text-zinc-200">{label} 单量拆分</span>
        <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold text-[10px]">
          {isTrue ? "去除刷单" : "全部订单"}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {entries.map(([platform, count]) => (
          <div key={platform} className="flex items-center justify-between text-muted-foreground text-[11px]">
            <span>{platform}:</span>
            <span className="font-semibold tabular-nums text-sky-600 dark:text-sky-400">{count as number} 单</span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-black/8 dark:border-white/8 font-bold text-sm text-foreground">
          <span>当日总单量:</span>
          <span className="tabular-nums text-sky-600 dark:text-sky-400">{total} 单</span>
        </div>
      </div>
    </div>
  );
}

function UserProfitTrendView({
  userId,
  userName,
  localShops,
}: {
  userId: string;
  userName?: string | null;
  localShops: Array<{ id: string; name: string; address: string }>;
}) {
  const today = useMemo(() => new Date(), []);
  const initialEnd = useMemo(() => format(today, "yyyy-MM-dd"), [today]);
  const initialStart = useMemo(() => format(subDays(today, 6), "yyyy-MM-dd"), [today]);

  const [rangePreset, setRangePreset] = useState("7d");
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [selectedShopName, setSelectedShopName] = useState("");
  const [profitPlatform, setProfitPlatform] = useState("all");
  const [orderPlatform, setOrderPlatform] = useState("all");
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
  const profitTrend = profitPlatform === "all" ? businessTrend : (platformBusinessTrend[profitPlatform] || []);
  const orderTrend = orderPlatform === "all" ? businessTrend : (platformBusinessTrend[orderPlatform] || []);

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
      {/* 顶部控制栏与筛选器 */}
      <div className="rounded-2xl border border-black/8 bg-white/70 p-3 sm:p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* 时间预设快捷按钮 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "7d", label: "近7天" },
              { key: "15d", label: "近15天" },
              { key: "30d", label: "近30天" },
              { key: "month", label: "本月" },
              { key: "all", label: "全部" },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handleRangePresetChange(p.key)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
                  rangePreset === p.key
                    ? "bg-primary text-white shadow-xs"
                    : "border border-black/8 bg-white/80 text-muted-foreground hover:bg-black/4 hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* 日期选择与店铺筛选 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <DatePicker
                value={startDate}
                onChange={(val) => {
                  setRangePreset("custom");
                  setStartDate(val);
                }}
                className="w-[125px]"
                triggerClassName="h-8.5 rounded-xl text-xs border border-black/8 dark:border-white/10 bg-white dark:bg-white/5"
              />
              <span className="text-muted-foreground">至</span>
              <DatePicker
                value={endDate}
                onChange={(val) => {
                  setRangePreset("custom");
                  setEndDate(val);
                }}
                className="w-[125px]"
                triggerClassName="h-8.5 rounded-xl text-xs border border-black/8 dark:border-white/10 bg-white dark:bg-white/5"
              />
            </div>

            {shopSelectOptions.length > 1 && (
              <CustomSelect
                value={selectedShopName}
                onChange={setSelectedShopName}
                options={shopSelectOptions}
                className="h-8.5 min-w-[130px]"
                triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white dark:border-white/10 dark:bg-white/5"
              />
            )}

            <button
              onClick={() => void fetchStats()}
              disabled={isLoading}
              className="inline-flex h-8.5 items-center gap-1 rounded-xl border border-black/8 bg-white px-2.5 text-xs font-bold text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground active:scale-95 dark:border-white/10 dark:bg-white/5 disabled:opacity-50"
              title="刷新数据"
            >
              <RotateCcw size={12} className={cn(isLoading && "animate-spin text-primary")} />
              <span>刷新</span>
            </button>
          </div>
        </div>
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
          <div className="rounded-[22px] border border-black/8 bg-white/76 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
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
                value={profitPlatform}
                onChange={setProfitPlatform}
                options={platformOptions}
                className="h-8 min-w-[110px]"
                triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white px-2.5 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="h-[250px] sm:h-[280px] w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none">
              {profitTrend.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  所选区间暂无利润数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={profitTrend} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="userModalProfitStroke" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={profitGradientOffset} stopColor="#10b981" stopOpacity={1} />
                        <stop offset={profitGradientOffset} stopColor="#f43f5e" stopOpacity={1} />
                      </linearGradient>
                      <linearGradient id="userModalProfitFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                        <stop offset={profitGradientOffset} stopColor="#10b981" stopOpacity={0.03} />
                        <stop offset={profitGradientOffset} stopColor="#f43f5e" stopOpacity={0.03} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.28} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={45} tickFormatter={(val) => `¥${val}`} />
                    <Tooltip
                      isAnimationActive={false}
                      allowEscapeViewBox={{ x: false, y: true }}
                      content={<TrendProfitTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="netProfit"
                      name="净利润"
                      stroke="url(#userModalProfitStroke)"
                      fill="url(#userModalProfitFill)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 主图表 2：每日订单波动走势 */}
          <div className="rounded-[22px] border border-black/8 bg-white/76 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
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
                  value={orderPlatform}
                  onChange={setOrderPlatform}
                  options={platformOptions}
                  className="h-8 min-w-[100px]"
                  triggerClassName="h-full rounded-xl text-xs border border-black/8 bg-white px-2.5 dark:border-white/10 dark:bg-white/5"
                />
              </div>
            </div>

            <div className="h-[220px] sm:h-[250px] w-full [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none">
              {orderTrend.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  所选区间暂无订单波动数据
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={orderTrend} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
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
                      content={<TrendOrderTooltip orderScope={orderScope} />}
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
  const [activeTab, setActiveTab] = useState<"today-orders" | "profit-trend">("today-orders");

  // 顶部看板数据状态（直接由 TodayOrdersView 回调供给，与订单主页面完全对齐）
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

  const [localShops, setLocalShops] = useState<Array<{ id: string; name: string; address: string }>>([]);

  const handleDataLoad = useCallback((data: {
    summary: typeof todaySummary;
    overview: typeof todayOverview;
  }) => {
    if (data.summary) setTodaySummary(data.summary);
    if (data.overview) setTodayOverview(data.overview);
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
            <div className="flex items-center justify-between px-3.5 sm:px-7 py-3 sm:py-4 border-b border-border/60 shrink-0 bg-muted/25 gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="h-8 w-8 sm:h-11 sm:w-11 rounded-xl sm:rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {activeTab === "profit-trend" ? <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <ShoppingBag className="h-4 w-4 sm:h-5 sm:w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-lg font-bold text-foreground truncate">
                      {userName || "成员"} 的{activeTab === "profit-trend" ? "麦芽田利润走势" : "今日订单看板"}
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

              {/* 核心 Tab 切换与操作按钮组 */}
              <div className="flex items-center gap-2 shrink-0">
                {/* 视图 Tab 切换 */}
                <div className="flex items-center rounded-xl bg-black/5 p-1 dark:bg-white/8">
                  <button
                    type="button"
                    onClick={() => setActiveTab("today-orders")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold transition-all active:scale-95",
                      activeTab === "today-orders"
                        ? "bg-white text-foreground shadow-xs dark:bg-zinc-800 dark:text-white"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ShoppingBag size={13} />
                    <span>今日看板</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("profit-trend")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-bold transition-all active:scale-95",
                      activeTab === "profit-trend"
                        ? "bg-primary text-white shadow-xs dark:bg-primary dark:text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-black/4 dark:hover:bg-white/5"
                    )}
                  >
                    <TrendingUp size={13} />
                    <span>利润曲线</span>
                  </button>
                </div>

                {activeTab === "today-orders" && (
                  <button
                    onClick={() => setRefreshTrigger((prev) => prev + 1)}
                    className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95"
                    title="刷新数据"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}

                <button
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95 hidden sm:flex"
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

            {/* 弹窗内容区 */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-6 overscroll-contain">
              {activeTab === "profit-trend" ? (
                userId ? (
                  <UserProfitTrendView
                    userId={userId}
                    userName={userName}
                    localShops={localShops}
                  />
                ) : (
                  <div className="py-20 text-center text-sm text-muted-foreground">
                    缺少有效的用户 ID
                  </div>
                )
              ) : (
                <>
                  {/* 今日指标看板：与订单页面顶部 1:1 完全对齐 */}
                  <div className="grid items-stretch gap-2.5 sm:gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {/* 1. 总订单 / 商家实收 合并卡片 */}
                    <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 md:col-span-2 lg:col-span-2">
                      <div className="flex flex-col gap-2 sm:gap-2.5">
                        <div className="flex items-baseline justify-between gap-2 sm:gap-3">
                          <div className="shrink-0">
                            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground whitespace-nowrap">总订单</div>
                            <div className="mt-1 sm:mt-2 text-xl sm:text-[30px] font-black leading-none tracking-tight text-foreground">{todayOverview.totalCount}</div>
                          </div>
                          <div className="min-w-0 text-right">
                            <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商家实收</div>
                            <div className="mt-1 sm:mt-2 text-xl sm:text-[30px] font-black leading-none tracking-tight text-emerald-600 dark:text-emerald-400">{toCurrency(todaySummary.receivedAmount || 0)}</div>
                            <div className="mt-1 sm:mt-1.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[10px] sm:text-[11px] font-semibold">
                              <span className="whitespace-nowrap text-sky-600 dark:text-sky-400">真实收入 {toCurrency(todaySummary.realReceivedAmount || 0)}</span>
                              {(todaySummary.brushReceivedAmount || 0) > 0 || (todaySummary.brushPaidAmount || 0) > 0 ? (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="whitespace-nowrap text-rose-500">刷单收入 {toCurrency(todaySummary.brushReceivedAmount || 0)} <span className="text-rose-500/80 dark:text-rose-400/80 font-normal">(实付 {toCurrency(todaySummary.brushPaidAmount || 0)})</span></span>
                                </>
                              ) : (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="whitespace-nowrap text-rose-500/60 dark:text-rose-400/60 font-normal">无刷单</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 订单成分比例进度条 */}
                        {todayOverview.totalCount > 0 && (
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
                            {todayOverview.trueOrderCount > 0 && (
                              <div
                                style={{ width: `${(todayOverview.trueOrderCount / todayOverview.totalCount) * 100}%` }}
                                className="bg-sky-500 transition-all duration-500"
                                title={`真单 ${todayOverview.trueOrderCount}单`}
                              />
                            )}
                            {todayOverview.brushCount > 0 && (
                              <div
                                style={{ width: `${(todayOverview.brushCount / todayOverview.totalCount) * 100}%` }}
                                className="bg-rose-500 transition-all duration-500"
                                title={`刷单 ${todayOverview.brushCount}单`}
                              />
                            )}
                            {todayOverview.cancelledCount > 0 && (
                              <div
                                style={{ width: `${(todayOverview.cancelledCount / todayOverview.totalCount) * 100}%` }}
                                className="bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                                title={`取消 ${todayOverview.cancelledCount}单`}
                              />
                            )}
                          </div>
                        )}

                        {/* 三列看板网格：真单 / 刷单 / 取消 */}
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-5 mt-1.5 sm:mt-2 border-t border-black/4 pt-2.5 sm:pt-3 dark:border-white/5 text-[10px]">
                          {/* 第一列：真单 */}
                          <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-1.5 sm:p-0 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent">
                            <div className="flex items-center justify-between rounded-lg bg-sky-500/8 px-1 sm:px-1.5 py-0.5 text-sky-700 dark:bg-sky-500/12 dark:text-sky-400 font-medium text-[8.5px] sm:text-[9px]">
                              <span className="truncate">真单</span>
                              <span className="shrink-0">{todayOverview.trueOrderCount}单</span>
                            </div>
                            <div className="flex flex-col gap-0.5 sm:gap-1 px-0.5">
                              {todayOverview.platformBreakdown?.truePlatformCounts && Object.keys(todayOverview.platformBreakdown.truePlatformCounts).length > 0 ? (
                                Object.entries(todayOverview.platformBreakdown.truePlatformCounts)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([platform, count]) => {
                                  const meta = getPlatformBadgeMeta(platform);
                                  return (
                                    <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[8.5px] sm:text-[9px] gap-1">
                                      <span className="flex items-center gap-0.5 min-w-0 truncate">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={meta.iconSrc} alt={meta.iconAlt} className="h-2.5 w-2.5 sm:h-3 sm:w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        <span className="truncate">{platform}</span>
                                      </span>
                                      <span className="shrink-0">{count}单</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-muted-foreground/30 text-center py-0.5 text-[8.5px] sm:text-[9px]">-</div>
                              )}
                            </div>
                          </div>

                          {/* 第二列：刷单 */}
                          <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-1.5 sm:p-0 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent">
                            <div className="flex items-center justify-between rounded-lg bg-rose-500/8 px-1 sm:px-1.5 py-0.5 text-rose-700 dark:bg-rose-500/12 dark:text-rose-400 font-medium text-[8.5px] sm:text-[9px]">
                              <span className="truncate">刷单</span>
                              <span className="shrink-0">{todayOverview.brushCount}单</span>
                            </div>
                            <div className="flex flex-col gap-0.5 sm:gap-1 px-0.5">
                              {todayOverview.platformBreakdown?.brushPlatformCounts && Object.keys(todayOverview.platformBreakdown.brushPlatformCounts).length > 0 ? (
                                Object.entries(todayOverview.platformBreakdown.brushPlatformCounts)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([platform, count]) => {
                                  const meta = getPlatformBadgeMeta(platform);
                                  return (
                                    <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[8.5px] sm:text-[9px] gap-1">
                                      <span className="flex items-center gap-0.5 min-w-0 truncate">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={meta.iconSrc} alt={meta.iconAlt} className="h-2.5 w-2.5 sm:h-3 sm:w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        <span className="truncate">{platform}</span>
                                      </span>
                                      <span className="shrink-0">{count}单</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-muted-foreground/30 text-center py-0.5 text-[8.5px] sm:text-[9px]">-</div>
                              )}
                            </div>
                          </div>

                          {/* 第三列：取消 */}
                          <div className="flex flex-col gap-1 sm:gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-1.5 sm:p-0 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent">
                            <div className="flex items-center justify-between rounded-lg bg-slate-500/8 px-1 sm:px-1.5 py-0.5 text-slate-600 dark:bg-slate-500/12 dark:text-slate-400 font-medium text-[8.5px] sm:text-[9px]">
                              <span className="truncate">取消</span>
                              <span className="shrink-0">{todayOverview.cancelledCount}单</span>
                            </div>
                            <div className="flex flex-col gap-0.5 sm:gap-1 px-0.5">
                              {todayOverview.platformBreakdown?.cancelledPlatformCounts && Object.keys(todayOverview.platformBreakdown.cancelledPlatformCounts).length > 0 ? (
                                Object.entries(todayOverview.platformBreakdown.cancelledPlatformCounts)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([platform, count]) => {
                                  const meta = getPlatformBadgeMeta(platform);
                                  return (
                                    <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[8.5px] sm:text-[9px] gap-1">
                                      <span className="flex items-center gap-0.5 min-w-0 truncate">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={meta.iconSrc} alt={meta.iconAlt} className="h-2.5 w-2.5 sm:h-3 sm:w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                        <span className="truncate">{platform}</span>
                                      </span>
                                      <span className="shrink-0">{count}单</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-muted-foreground/30 text-center py-0.5 text-[8.5px] sm:text-[9px]">-</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. 平台纯利润分布卡片 */}
                    <div className="group min-w-0 h-full rounded-[20px] border border-black/8 bg-white/76 px-3.5 py-3 sm:px-4 sm:py-3.5 text-left shadow-xs transition hover:border-emerald-400/40 hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-300/35 dark:hover:bg-emerald-400/8 flex flex-col gap-2 sm:gap-2.5">
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between sm:block">
                          <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <span>纯利润</span>
                              <Store className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTab("profit-trend");
                              }}
                              className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                            >
                              <span>查看曲线</span>
                              <ArrowUpRight size={11} />
                            </button>
                          </div>
                          <div className={cn(
                            "sm:hidden text-xl font-black leading-none tracking-tight",
                            todaySummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {toCurrency(todaySummary.pureProfit || 0)}
                          </div>
                        </div>
                        <div className={cn(
                          "hidden sm:block mt-2 text-[26px] font-bold leading-none tracking-tight",
                          todaySummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                        )}>
                          {toCurrency(todaySummary.pureProfit || 0)}
                        </div>
                        <div className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                          今日各平台纯利润汇总
                        </div>
                      </div>
                      {todaySummary.platformProfit && Object.entries(todaySummary.platformProfit).some(([, info]) => info.amount !== 0) ? (
                        <div className="flex flex-col gap-1.5 sm:gap-2 border-t border-black/4 pt-2.5 sm:pt-3 dark:border-white/5">
                          {Object.entries(todaySummary.platformProfit)
                            .sort((a, b) => b[1].amount - a[1].amount)
                            .map(([platform, info]) => {
                            if (info.amount === 0) return null;
                            const meta = getPlatformBadgeMeta(platform);
                            return (
                              <div key={platform} className="flex items-center justify-between rounded-xl bg-black/1.5 px-2.5 py-1.5 sm:px-3 dark:bg-white/1.5 text-[10px] sm:text-[11px] text-foreground/80 dark:text-white/80">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3 w-3 sm:h-3.5 sm:w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                  <span className="truncate font-medium">{platform}</span>
                                </span>
                                <span className={cn(
                                  "font-bold shrink-0",
                                  info.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                                )}>
                                  {toCurrency(info.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    {/* 3. 最右侧：总配送费与推广费 */}
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:flex lg:flex-col">
                      <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">总配送费</div>
                          <div className="mt-1 sm:mt-2 text-lg sm:text-[26px] font-bold leading-none tracking-tight text-foreground">
                            {toCurrency(todaySummary.totalDeliveryFee || 0)}
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground">今日订单汇总</div>
                      </div>

                      <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">推广费</div>
                          <div className="mt-1 sm:mt-2 text-lg sm:text-[26px] font-bold leading-none tracking-tight text-foreground">
                            ¥0.00
                          </div>
                        </div>
                        <div className="mt-1 text-[10px] sm:text-xs text-muted-foreground">今日推广费录入</div>
                      </div>
                    </div>
                  </div>

                  {/* 完整的今日订单视图：直接复用 TodayOrdersView */}
                  <div className="pt-1 sm:pt-2">
                    <TodayOrdersView
                      userId={userId}
                      refreshTrigger={refreshTrigger}
                      onOpenCostBackfill={() => {}}
                      onOpenMatchEditor={() => {}}
                      onDataLoad={handleDataLoad}
                      localShops={localShops}
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

