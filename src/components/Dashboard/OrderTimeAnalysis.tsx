"use client";

import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, ChevronDown, Clock3, Flame, ShoppingBag, TrendingUp } from "lucide-react";
import { summarizeOrderTime, type OrderTimeBucket, type OrderTimeScope } from "@/lib/orderTimeAnalysis";
import { cn } from "@/lib/utils";

const chartTicks = [0, 4, 8, 12, 16, 20, 23];
const scopeLabels: Record<OrderTimeScope, string> = { real: "真实来单", brush: "刷单", count: "全部来单" };
const number = (value: number) => value.toLocaleString("zh-CN");

function HourTooltip({ active, payload, total, days, scope }: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: OrderTimeBucket }>;
  total: number;
  days: number;
  scope: OrderTimeScope;
}) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;
  const count = bucket[scope];
  return (
    <div className="min-w-44 rounded-2xl border border-border/70 bg-popover/95 p-3.5 text-popover-foreground shadow-xl backdrop-blur-md">
      <p className="text-xs font-semibold text-muted-foreground">{bucket.label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-5">
        <span className="text-xs">{scopeLabels[scope]}</span>
        <span className="text-xl font-black tabular-nums">{number(count)}<span className="ml-1 text-xs font-medium text-muted-foreground">单</span></span>
      </div>
      <div className="mt-2 flex justify-between gap-4 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span>占比 {total > 0 ? (count / total * 100).toFixed(1) : "0.0"}%</span>
        <span>日均 {(count / days).toFixed(1)} 单</span>
      </div>
    </div>
  );
}

export function OrderTimeAnalysis({ buckets, rangeDays, brushWithoutTime = 0 }: { buckets: OrderTimeBucket[]; rangeDays: number; brushWithoutTime?: number }) {
  const [scope, setScope] = useState<OrderTimeScope>("real");
  const gradientId = useId().replace(/:/g, "");
  const days = Math.max(1, rangeDays);
  const summary = summarizeOrderTime(buckets, days, scope);
  const unlinkedCount = scope === "real" ? 0 : brushWithoutTime;
  const total = summary.total + unlinkedCount;
  const hasOrders = summary.total > 0;

  return (
    <section aria-label="来单时段分析" className="min-w-0 overflow-hidden rounded-[28px] border border-black/8 bg-white/75 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/4">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sky-500/15 bg-sky-500/10 text-sky-600 dark:text-sky-400"><Clock3 size={20} aria-hidden="true" /></div>
            <div>
              <h2 className="text-base font-black tracking-tight sm:text-lg">来单时段分析</h2>
              <p className="mt-1 text-xs text-muted-foreground">按下单时间 · 北京时间 · 汇总所选日期</p>
            </div>
          </div>
          <div role="group" aria-label="来单类型" className="grid grid-cols-3 gap-1 rounded-2xl border border-black/5 bg-black/3 p-1 dark:border-white/5 dark:bg-white/4 lg:min-w-64">
            {Object.entries(scopeLabels).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value as OrderTimeScope)} className={cn("min-h-9 whitespace-nowrap rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500", scope === value ? "bg-white text-foreground shadow-sm ring-1 ring-black/5 dark:bg-white/12 dark:ring-white/10" : "text-muted-foreground hover:bg-white/60 hover:text-foreground dark:hover:bg-white/6")}>{label}</button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1.4fr]">
          <div className="rounded-[20px] border border-sky-500/15 bg-gradient-to-br from-sky-500/8 to-sky-500/2 p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>来单总量</span><ShoppingBag size={15} className="text-sky-500" aria-hidden="true" /></div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5"><span className="text-3xl font-black tracking-tight tabular-nums sm:text-4xl">{number(total)}</span><span className="text-xs text-muted-foreground">单</span></p>
            <p className="mt-2 text-[11px] text-muted-foreground">{scopeLabels[scope]} · {days} 天累计</p>
          </div>
          <div className="rounded-[20px] border border-black/6 bg-white/60 p-3.5 dark:border-white/8 dark:bg-white/3 sm:p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>日均来单</span><TrendingUp size={15} className="text-muted-foreground/70" aria-hidden="true" /></div>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5"><span className="text-3xl font-black tracking-tight tabular-nums sm:text-4xl">{(total / days).toFixed(1)}</span><span className="text-xs text-muted-foreground">单 / 天</span></p>
            <p className="mt-2 text-[11px] text-muted-foreground">含无订单日期</p>
          </div>
          <div className="col-span-2 rounded-[20px] border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/3 p-3.5 lg:col-span-1 sm:p-4">
            <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400"><span className="flex items-center gap-1.5"><Flame size={15} aria-hidden="true" />来单高峰</span>{summary.peaks.length > 1 ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px]">{summary.peaks.length} 个并列</span> : <ArrowUpRight size={15} aria-hidden="true" />}</div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {hasOrders ? summary.peaks.slice(0, 2).map((bucket) => <span key={bucket.hour} className="rounded-lg bg-white/70 px-2.5 py-1 text-sm font-black tracking-tight tabular-nums text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 sm:text-base">{bucket.label}</span>) : <span className="py-1 text-base font-bold text-muted-foreground">暂无高峰</span>}
              {summary.peaks.length > 2 ? <span title={summary.peaks.slice(2).map((bucket) => bucket.label).join("、")} className="text-xs font-semibold text-amber-700 dark:text-amber-400">+{summary.peaks.length - 2} 个</span> : null}
            </div>
            <p className="mt-2 text-[11px] text-amber-800/75 dark:text-amber-300/75">{hasOrders ? `每个高峰时段 ${number(summary.peakCount)} 单，占 ${(summary.peakCount / total * 100).toFixed(1)}%` : unlinkedCount > 0 ? "关联下单时间后可识别高峰" : "有订单后自动识别高峰时段"}</p>
          </div>
        </div>

        {unlinkedCount > 0 ? <p role="status" className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">有 {number(unlinkedCount)} 条刷单记录未关联下单时间，已计入总量和日均，暂不归入小时分布。</p> : null}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-foreground">24 小时来单分布<span className="ml-2 font-normal text-muted-foreground">单位：单</span></p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-sky-500" />普通时段</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />高峰时段</span></div>
        </div>
        {hasOrders ? (
          <div className="mt-3 h-56 w-full min-w-0 sm:h-72 [&_:focus:not(:focus-visible)]:outline-none [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-sky-500">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={buckets} accessibilityLayer margin={{ top: 12, right: 8, left: -10, bottom: 0 }} barCategoryGap="25%">
                <defs>
                  <linearGradient id={`${gradientId}-normal`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#0284c7" stopOpacity={0.65} /></linearGradient>
                  <linearGradient id={`${gradientId}-peak`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0.7} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="hour" ticks={chartTicks} tickFormatter={(hour: number) => `${String(hour).padStart(2, "0")}时`} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} minTickGap={8} tickMargin={10} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={38} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)", radius: 6 }} isAnimationActive={false} content={<HourTooltip total={total} days={days} scope={scope} />} />
                <Bar dataKey={scope} name={scopeLabels[scope]} radius={[5, 5, 0, 0]} maxBarSize={32} isAnimationActive={false}>
                  {buckets.map((bucket) => <Cell key={bucket.hour} fill={`url(#${gradientId}-${bucket[scope] === summary.peakCount ? "peak" : "normal"})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div role="status" className="mt-3 flex min-h-56 flex-col items-center justify-center rounded-[20px] border border-dashed border-border/70 bg-muted/15 px-5 text-center sm:min-h-72">
            <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground/70"><Clock3 size={24} aria-hidden="true" /></div>
            <p className="text-sm font-bold">{unlinkedCount > 0 ? "刷单记录尚未关联下单时间" : `暂无${scopeLabels[scope]}`}</p>
            <p className="mt-1.5 max-w-64 text-xs leading-relaxed text-muted-foreground">{unlinkedCount > 0 ? "已有记录计入总量，关联订单后才能展示准确的来单时段。" : "调整日期、门店、平台或来单类型，查看来单时段分布。"}</p>
          </div>
        )}
      </div>

      <details className="group border-t border-black/6 dark:border-white/8">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-xs font-bold transition-colors hover:bg-black/2 focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-white/3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>各时段明细<span className="ml-2 font-normal text-muted-foreground">订单数 / 占比 / 日均</span></span><ChevronDown size={15} className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="max-h-80 overflow-auto px-4 pb-4 sm:px-5">
          <table className="w-full min-w-96 border-separate border-spacing-0 text-left text-xs tabular-nums">
            <caption className="sr-only">{scopeLabels[scope]}每小时订单数、占比和日均订单数</caption>
            <thead className="sticky top-0 z-10 bg-background text-[11px] text-muted-foreground"><tr><th scope="col" className="border-b border-border py-2.5 pl-3 font-medium">时段</th><th scope="col" className="border-b border-border py-2.5 text-right font-medium">订单数</th><th scope="col" className="border-b border-border py-2.5 text-right font-medium">占比</th><th scope="col" className="border-b border-border py-2.5 pr-3 text-right font-medium">日均</th></tr></thead>
            <tbody>{buckets.map((bucket) => {
              const isPeak = hasOrders && bucket[scope] === summary.peakCount;
              return <tr key={bucket.hour} className={cn("transition-colors hover:bg-muted/30", isPeak && "bg-amber-500/6 text-amber-800 dark:text-amber-300")}><th scope="row" className="border-b border-border/40 py-3 pl-3 font-medium"><span className="inline-flex items-center gap-2"><span className={cn("size-1.5 rounded-full", isPeak ? "bg-amber-500" : "bg-muted-foreground/25")} />{bucket.label}</span></th><td className="border-b border-border/40 text-right font-bold">{number(bucket[scope])}</td><td className="border-b border-border/40 text-right">{total > 0 ? (bucket[scope] / total * 100).toFixed(1) : "0.0"}%</td><td className="border-b border-border/40 pr-3 text-right">{(bucket[scope] / days).toFixed(1)}</td></tr>;
            })}
              {unlinkedCount > 0 ? <tr className="bg-amber-500/5 text-amber-800 dark:text-amber-300"><th scope="row" className="py-3 pl-3 font-medium">未关联下单时间</th><td className="text-right font-bold">{number(unlinkedCount)}</td><td className="text-right">{(unlinkedCount / total * 100).toFixed(1)}%</td><td className="pr-3 text-right">{(unlinkedCount / days).toFixed(1)}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </details>
      <details className="group border-t border-black/6 dark:border-white/8">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-sky-500 sm:px-5 [&::-webkit-details-marker]:hidden"><span>统计口径说明</span><ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <p className="px-4 pb-4 text-[11px] leading-relaxed text-muted-foreground sm:px-5">关联刷单管理记录与系统刷单标记，按平台及单号去重，全部来单为真实来单与刷单合计。按订单下单时间统计，后续取消或退款不改变分类。未关联下单时间的刷单按记录日期计入总量和日均，不归入小时分布；占比以总量计算。日均包含所选范围内无订单日期。</p>
      </details>
    </section>
  );
}
