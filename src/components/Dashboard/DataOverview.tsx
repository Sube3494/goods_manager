"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shop, StatsData } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";

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
    <section className={cn("rounded-[28px] border border-black/8 bg-white/75 p-4 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04] sm:p-5", className)}>
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
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] border border-black/8 bg-white/80 px-3.5 py-3.5 dark:border-white/10 dark:bg-white/[0.05] sm:px-4 sm:py-4">
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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[18px] border border-black/8 bg-white/72 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04] sm:px-4 sm:py-3.5">
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

function countTooltip(value: unknown) {
  return int(typeof value === "number" ? value : Number(value || 0));
}

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  nameMap,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; color?: string }>;
  label?: string;
  valueFormatter: (value: unknown) => string;
  nameMap?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[148px] rounded-[18px] border border-black/8 bg-white/92 px-3.5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92 dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2.5 space-y-2">
        {payload.map((item) => {
          const rawName = String(item.name || "");
          const displayName = nameMap?.[rawName] || rawName;
          return (
            <div key={rawName} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#60a5fa" }} />
                <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">{displayName}</span>
              </div>
              <span className="shrink-0 text-sm font-black tabular-nums text-slate-900 dark:text-white">{valueFormatter(item.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
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
}) {
  const todayDate = new Date().toISOString().slice(0, 10);
  const [profitPlatform, setProfitPlatform] = useState("all");
  const [orderPlatform, setOrderPlatform] = useState("all");
  const [orderScope, setOrderScope] = useState<"all" | "true">("all");
  const businessTrend = data?.businessTrend || [];
  const rangeDays = useMemo(() => countDays(startDate, endDate), [endDate, startDate]);
  const matrix = data?.platformMatrix;
  const platformBusinessTrend = data?.platformBusinessTrend || {};
  const platformOptions = [
    { value: "all", label: "全部平台" },
    { value: "美团", label: "美团" },
    { value: "京东", label: "京东" },
    { value: "淘宝", label: "淘宝" },
    { value: "其他", label: "其他" },
  ];
  const profitTrend = profitPlatform === "all" ? businessTrend : (platformBusinessTrend[profitPlatform] || []);
  const orderTrend = orderPlatform === "all" ? businessTrend : (platformBusinessTrend[orderPlatform] || []);
  const orderSeriesKey = orderScope === "true" ? "trueOrderCount" : "orderCount";
  const orderSeriesColor = orderScope === "true" ? "#10b981" : "#0ea5e9";
  const orderTooltipNameMap: Record<string, string> = orderScope === "true"
    ? { trueOrderCount: "真单数" }
    : { orderCount: "订单数" };
  const totalOrders = matrix?.grandTotal || 0;
  const trueOrders = matrix?.trueOrderTotal || 0;
  const brushOrders = matrix?.brushOrderTotal || 0;
  const cancelledLikeGap = Math.max(0, totalOrders - trueOrders - brushOrders);
  const trueShare = totalOrders > 0 ? (trueOrders / totalOrders) * 100 : 0;
  const brushShare = totalOrders > 0 ? (brushOrders / totalOrders) * 100 : 0;
  const contextLabel = selectedShopName ? `${selectedShopName} · ${int(rangeDays)} 天` : `全部店铺 · ${int(rangeDays)} 天`;

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="rounded-[24px] border border-black/8 bg-zinc-50/45 px-4 py-3 shadow-xs dark:border-white/10 dark:bg-white/[0.04]">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="col-span-1 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">店铺范围</label>
            <CustomSelect
              value={selectedShopName}
              onChange={onSelectedShopNameChange}
              options={[{ value: "", label: "全部店铺" }, ...shopOptions.map((shop) => ({ value: shop.name, label: shop.name }))]}
              className="h-11"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">时间范围</label>
            <CustomSelect
              value={rangePreset}
              onChange={onRangePresetChange}
              options={[
                { value: "all", label: "全部" },
                { value: "7d", label: "最近 7 天" },
                { value: "30d", label: "最近 30 天" },
                { value: "90d", label: "最近 90 天" },
                { value: "custom", label: "自定义" },
              ]}
              className="h-11"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">起始日期</label>
            <DatePicker
              value={startDate}
              onChange={onStartDateChange}
              maxDate={endDate || todayDate}
              showClear={false}
              className="h-11 w-full"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            />
          </div>
          <div className="col-span-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">结束日期</label>
              <span className="text-[11px] font-bold text-primary">共 {int(rangeDays)} 天</span>
            </div>
            <DatePicker
              value={endDate}
              onChange={onEndDateChange}
              minDate={startDate}
              maxDate={todayDate}
              showClear={false}
              className="h-11 w-full"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-black/8 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.97),rgba(244,244,245,0.82)_45%,rgba(240,253,244,0.72)_100%)] p-3.5 shadow-sm dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),rgba(255,255,255,0.04)_40%,rgba(16,185,129,0.06)_100%)] sm:p-5 lg:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
          <div className="min-w-0 rounded-[24px] border border-black/8 bg-white/86 p-4 shadow-xs dark:border-white/10 dark:bg-white/[0.05] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">经营概述</div>
                <h2 className="mt-2 overflow-hidden text-[clamp(2rem,3.5vw,3.4rem)] font-black leading-none tracking-tight text-foreground">
                  {money(data?.netProfit)}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {contextLabel}
                </p>
              </div>
              <div className={cn(
                "inline-flex self-start rounded-full px-3 py-1 text-xs font-black",
                Number(data?.netProfit || 0) >= 0
                  ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/12 text-red-500"
              )}>
                {Number(data?.netProfit || 0) >= 0 ? "净利润为正" : "净利润承压"}
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
              <HeroMetric label="用户实付" value={money(data?.userPaid)} hint="当前范围收入" />
              <HeroMetric label="商品成本" value={money(data?.productCost)} hint="已出库商品成本" />
              <HeroMetric label="刷单支出" value={money(data?.brushExpense)} hint="刷单相关支出" tone={Number(data?.brushExpense || 0) > 0 ? "danger" : "default"} />
            </div>
          </div>

          <div className="min-w-0 rounded-[24px] border border-black/8 bg-black/[0.02] p-4 shadow-xs dark:border-white/10 dark:bg-white/[0.04] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">订单结构</div>
                <div className="mt-2 overflow-hidden text-[clamp(1.8rem,2.8vw,2.7rem)] font-black leading-none tracking-tight text-foreground">{int(totalOrders)}</div>
                <p className="mt-2 text-sm text-muted-foreground">当前范围累计订单</p>
              </div>
              <div className="rounded-2xl border border-black/8 bg-white/85 px-3 py-2 text-right dark:border-white/10 dark:bg-white/[0.05]">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">真单占比</div>
                <div className="mt-1 text-lg font-black text-emerald-500">{percent(trueShare)}</div>
              </div>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
              <div className="flex h-full">
                <div className="bg-emerald-500" style={{ width: `${trueShare}%` }} />
                <div className="bg-rose-500" style={{ width: `${brushShare}%` }} />
                <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${Math.max(0, 100 - trueShare - brushShare)}%` }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <CompactMetric label="真单" value={int(trueOrders)} hint={`占比 ${percent(trueShare)}`} tone="success" />
              <CompactMetric label="刷单" value={int(brushOrders)} hint={`占比 ${percent(brushShare)}`} tone="danger" />
              <CompactMetric label="其他" value={int(cancelledLikeGap)} hint="取消/未归类" />
            </div>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <CompactMetric label="平台扣费" value={money(data?.platformCommission)} hint="平台佣金与扣点" />
          <CompactMetric label="配送支出" value={money(data?.deliveryExpense)} hint="配送相关成本" />
          <CompactMetric label="推广支出" value={money(data?.promotionExpense)} hint="活动与推广消耗" />
          <CompactMetric label="活跃店铺" value={int(data?.activeShopCount)} hint="当前范围有动销的店铺" />
        </div>
      </section>

      <Panel title="平台结构" subtitle="按平台查看真单与刷单的订单构成">
        <div className="space-y-3 sm:hidden">
          {[
            {
              key: "true",
              label: "真单",
              total: matrix?.trueOrderTotal,
              tone: "text-emerald-500",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.trueOrderCount })) || [],
            },
            {
              key: "brush",
              label: "刷单",
              total: matrix?.brushOrderTotal,
              tone: "text-red-500",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.brushOrderCount })) || [],
            },
            {
              key: "all",
              label: "合计",
              total: matrix?.grandTotal,
              tone: "text-foreground",
              values: matrix?.columns.map((col) => ({ platform: col.platform, value: col.totalCount })) || [],
            },
          ].map((row) => (
            <div key={row.key} className="rounded-[18px] border border-black/6 bg-black/[0.02] px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-foreground">{row.label}</span>
                <span className={cn("text-lg font-black tabular-nums", row.tone)}>{int(row.total)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {row.values.map((item) => (
                  <div key={`${row.key}-${item.platform}`} className="rounded-[14px] border border-black/6 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.platform}</div>
                    <div className={cn("mt-1 text-base font-black tabular-nums", row.tone)}>{int(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-[22px] border border-black/6 dark:border-white/10 sm:block">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-black/[0.025] dark:bg-white/[0.03]">
              <tr className="text-muted-foreground">
                <th className="px-3 py-3 text-left font-bold">类型</th>
                {matrix?.columns.map((col) => (
                  <th key={col.platform} className="px-2 py-3 text-center font-bold">
                    {col.platform}
                  </th>
                ))}
                <th className="px-2 py-3 text-center font-bold">合计</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-black/6 dark:border-white/10">
                <td className="px-3 py-4 font-black">真单</td>
                {matrix?.columns.map((col) => (
                  <td key={`true-${col.platform}`} className="px-2 py-4 text-center font-black tabular-nums text-emerald-500">
                    {int(col.trueOrderCount)}
                  </td>
                ))}
                <td className="px-2 py-4 text-center font-black tabular-nums text-emerald-500">{int(matrix?.trueOrderTotal)}</td>
              </tr>
              <tr className="border-t border-black/6 dark:border-white/10">
                <td className="px-3 py-4 font-black">刷单</td>
                {matrix?.columns.map((col) => (
                  <td key={`brush-${col.platform}`} className="px-2 py-4 text-center font-black tabular-nums text-red-500">
                    {int(col.brushOrderCount)}
                  </td>
                ))}
                <td className="px-2 py-4 text-center font-black tabular-nums text-red-500">{int(matrix?.brushOrderTotal)}</td>
              </tr>
              <tr className="border-t border-black/6 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                <td className="px-3 py-4 font-black">合计</td>
                {matrix?.columns.map((col) => (
                  <td key={`total-${col.platform}`} className="px-2 py-4 text-center font-black tabular-nums">
                    {int(col.totalCount)}
                  </td>
                ))}
                <td className="px-2 py-4 text-center font-black tabular-nums">{int(matrix?.grandTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="每日盈亏"
          subtitle="净利润与刷单支出"
          action={(
            <CustomSelect
              value={profitPlatform}
              onChange={setProfitPlatform}
              options={platformOptions}
              className="h-9 min-w-[116px]"
              triggerClassName="h-full rounded-xl border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
            />
          )}
        >
          <div className="h-[260px] sm:h-[290px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart accessibilityLayer={false} data={profitTrend} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netProfitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={52} />
                <Tooltip content={<ChartTooltip valueFormatter={amountTooltip} nameMap={{ netProfit: "净利润", brushExpense: "刷单支出" }} />} />
                <Area type="monotone" dataKey="netProfit" name="netProfit" stroke="#22c55e" fill="url(#netProfitFill)" strokeWidth={2.5} />
                <Line type="monotone" dataKey="brushExpense" name="brushExpense" stroke="#ef4444" strokeWidth={2.2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          title="订单波动"
          subtitle={orderScope === "true" ? "按日期查看真单变化" : "按日期查看订单变化"}
          actionMobileStack
          action={(
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm.items-center">
              <CustomSelect
                value={orderScope}
                onChange={(value) => setOrderScope(value as "all" | "true")}
                options={[
                  { value: "all", label: "全部订单" },
                  { value: "true", label: "去除刷单" },
                ]}
                className="h-9 min-w-0 sm:min-w-[116px]"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />
              <CustomSelect
                value={orderPlatform}
                onChange={setOrderPlatform}
                options={platformOptions}
                className="h-9 min-w-0 sm:min-w-[116px]"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/[0.03]"
              />
            </div>
          )}
        >
          <div className="h-[260px] sm:h-[290px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart accessibilityLayer={false} data={orderTrend} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} allowDecimals={false} />
                <Tooltip content={<ChartTooltip valueFormatter={countTooltip} nameMap={orderTooltipNameMap} />} />
                <Line type="monotone" dataKey={orderSeriesKey} name={orderSeriesKey} stroke={orderSeriesColor} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
