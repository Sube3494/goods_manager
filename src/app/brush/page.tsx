"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
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
  CreditCard,
  Package,
  ShoppingBag,
  Sparkles,
  Tags,
  TrendingUp,
} from "lucide-react";
import { BrushOrder, BrushOrderPlan, BrushProduct } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { formatLocalDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";

const PLATFORM_COLORS = ["#41d18d", "#5ba7ff", "#f3b34c", "#fb7185"];

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

  const [brushProducts, setBrushProducts] = useState<BrushProduct[]>([]);
  const [plans, setPlans] = useState<BrushOrderPlan[]>([]);
  const [orders, setOrders] = useState<BrushOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShop, setSelectedShop] = useState("all");
  const [selectedRange, setSelectedRange] = useState("14");

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
        const tasks: Promise<Response | null>[] = [
          canManageBrush ? fetch("/api/brush-products?page=1&pageSize=120") : Promise.resolve(null),
          canManageBrush ? fetch("/api/brush-plans?page=1&limit=90") : Promise.resolve(null),
          canManageBrush ? fetch("/api/brush-orders?page=1&limit=90") : Promise.resolve(null),
        ];

        const [productsRes, plansRes, ordersRes] = await Promise.all(tasks);
        if (cancelled) return;

        if (productsRes?.ok) {
          const data = await productsRes.json();
          setBrushProducts(Array.isArray(data.items) ? data.items : []);
        }

        if (plansRes?.ok) {
          const data = await plansRes.json();
          setPlans(Array.isArray(data.items) ? data.items : []);
        }

        if (ordersRes?.ok) {
          const data = await ordersRes.json();
          setOrders(Array.isArray(data.data) ? data.data : []);
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

  const stats = useMemo(() => {
    const today = formatLocalDate(new Date());
    const totalPlanItems = plans.reduce(
      (sum, plan) => sum + plan.items.reduce((itemSum, item) => itemSum + (item.quantity || 1), 0),
      0
    );
    const todayPlans = plans.filter((plan) => formatLocalDate(plan.date) === today);
    const todayPlanItems = todayPlans.reduce(
      (sum, plan) => sum + plan.items.reduce((itemSum, item) => itemSum + (item.quantity || 1), 0),
      0
    );
    const todayShopCount = new Set(
      todayPlans.map((plan) => plan.shopName?.trim()).filter((shop): shop is string => Boolean(shop))
    ).size;
    const averageItemsPerShop = todayShopCount > 0 ? todayPlanItems / todayShopCount : 0;
    const totalPayment = orders.reduce((sum, order) => sum + order.paymentAmount, 0);
    const totalReceived = orders.reduce((sum, order) => sum + order.receivedAmount, 0);
    const totalCommission = orders.reduce((sum, order) => sum + order.commission, 0);
    const totalExpense = orders.reduce(
      (sum, order) => sum + (order.paymentAmount - order.receivedAmount) + order.commission,
      0
    );
    const todayOrders = orders.filter((order) => String(order.date).slice(0, 10) === today);
    const todayOrderCount = todayOrders.length;
    const todayPayment = todayOrders.reduce((sum, order) => sum + order.paymentAmount, 0);
    const todayReceived = todayOrders.reduce((sum, order) => sum + order.receivedAmount, 0);
    const todayCommission = todayOrders.reduce((sum, order) => sum + order.commission, 0);
    const todayExpense = todayOrders.reduce(
      (sum, order) => sum + (order.paymentAmount - order.receivedAmount) + order.commission,
      0
    );

    return {
      brushProductCount: brushProducts.length,
      planCount: plans.length,
      planItemCount: totalPlanItems,
      todayPlanItemCount: todayPlanItems,
      todayShopCount,
      averageItemsPerShop,
      orderCount: orders.length,
      payment: totalPayment,
      received: totalReceived,
      commission: totalCommission,
      expense: totalExpense,
      todayOrderCount,
      todayPayment,
      todayReceived,
      todayCommission,
      todayExpense,
    };
  }, [brushProducts, orders, plans]);

  const shopOptions = useMemo(() => {
    const shops = Array.from(
      new Set(orders.map((order) => order.shopName?.trim()).filter((name): name is string => Boolean(name)))
    ).sort((a, b) => a.localeCompare(b, "zh-CN"));

    return [
      { value: "all", label: "全部店铺" },
      ...shops.map((shop) => ({ value: shop, label: shop })),
    ];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const latestDate = orders.reduce<string | null>((max, order) => {
      const current = String(order.date).slice(0, 10);
      return !max || current > max ? current : max;
    }, null);

    let startBoundary = "";
    if (latestDate && selectedRange !== "all") {
      const end = new Date(`${latestDate}T00:00:00`);
      const days = Number(selectedRange);
      const start = new Date(end);
      start.setDate(end.getDate() - (days - 1));
      startBoundary = start.toISOString().slice(0, 10);
    }

    return orders.filter((order) => {
      const shopName = order.shopName?.trim() || "";
      const orderDate = String(order.date).slice(0, 10);

      if (selectedShop !== "all" && shopName !== selectedShop) return false;
      if (startBoundary && orderDate < startBoundary) return false;
      return true;
    });
  }, [orders, selectedRange, selectedShop]);

  const orderTrendData = useMemo(() => {
    const byDay = new Map<
      string,
      { label: string; payment: number; received: number; commission: number; expense: number; count: number }
    >();

    filteredOrders.forEach((order) => {
      const dateKey = String(order.date).slice(0, 10);
      const current = byDay.get(dateKey) || {
        label: formatLocalDate(order.date),
        payment: 0,
        received: 0,
        commission: 0,
        expense: 0,
        count: 0,
      };
      current.payment += order.paymentAmount;
      current.received += order.receivedAmount;
      current.commission += order.commission;
      current.expense += (order.paymentAmount - order.receivedAmount) + order.commission;
      current.count += 1;
      byDay.set(dateKey, current);
    });

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([, value]) => value);
  }, [filteredOrders]);

  const expenseTrendByShop = useMemo(() => {
    const topShops = Array.from(
      orders.reduce((map, order) => {
        const name = order.shopName?.trim() || "未分店铺";
        const expense = (order.paymentAmount - order.receivedAmount) + order.commission;
        map.set(name, (map.get(name) || 0) + expense);
        return map;
      }, new Map<string, number>())
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const byDate = new Map<string, Record<string, string | number>>();

    orders.forEach((order) => {
      const shopName = order.shopName?.trim() || "未分店铺";
      if (!topShops.includes(shopName)) return;

      const key = String(order.date).slice(0, 10);
      const current = byDate.get(key) || { label: formatLocalDate(order.date) };
      current[shopName] = Number(current[shopName] || 0) + (order.paymentAmount - order.receivedAmount) + order.commission;
      byDate.set(key, current);
    });

    return {
      shops: topShops,
      data: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([, value]) => value),
    };
  }, [orders]);

  const scheduleHeatData = useMemo(() => {
    const byDate = new Map<string, { date: string; tasks: number; items: number }>();

    plans.forEach((plan) => {
      const key = String(plan.date).slice(0, 10);
      const current = byDate.get(key) || { date: formatLocalDate(plan.date), tasks: 0, items: 0 };
      current.tasks += 1;
      current.items += plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      byDate.set(key, current);
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
      .map(([, value]) => value);
  }, [plans]);

  const analysisHighlights = useMemo(() => {
    const busiestDate = scheduleHeatData.reduce<{ date: string; items: number } | null>((max, current) => {
      if (!max || current.items > max.items) {
        return { date: current.date, items: current.items };
      }
      return max;
    }, null);
    const avgExpensePerOrder = stats.orderCount > 0 ? stats.expense / stats.orderCount : 0;

    return [
      {
        label: "已排任务日",
        value: `${stats.planCount} 天`,
        hint: stats.planCount > 0 ? "当前已有任务排期的日期数" : "暂时还没有排任务",
      },
      {
        label: "主支出店铺",
        value: expenseTrendByShop.shops[0] || "--",
        hint: expenseTrendByShop.shops[0] ? "按近期开支规模排序" : "等待订单沉淀",
      },
      {
        label: "单笔平均支出",
        value: formatExpenseCurrency(avgExpensePerOrder),
        hint: stats.orderCount > 0 ? `${stats.orderCount} 笔订单均值` : "等待订单沉淀",
      },
      {
        label: "最密集日期",
        value: busiestDate?.date || "--",
        hint: busiestDate ? `${busiestDate.items} 份任务` : "等待任务沉淀",
      },
    ];
  }, [expenseTrendByShop.shops, scheduleHeatData, stats]);

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
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/6 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-primary/80">
              <Activity size={12} />
              Brush Dashboard
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-[42px]">刷单中心</h1>
            <p className="mt-3 max-w-[44ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
              这里更适合直接看安排密度、店铺分布和金额走势，入口只保留成辅助操作。
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {canManageBrush && (
            <>
              <MetricCard
                label="刷单商品"
                value={String(stats.brushProductCount)}
                hint="已挑入专用商品池"
                icon={Tags}
                href="/brush-products"
              />
              <MetricCard
                label="今日刷单"
                value={`${stats.todayShopCount} 店`}
                hint={
                  stats.todayShopCount > 0
                    ? `每店 ${Number.isInteger(stats.averageItemsPerShop) ? stats.averageItemsPerShop : stats.averageItemsPerShop.toFixed(1)} 单`
                    : "今天还没安排刷单"
                }
                icon={ShoppingBag}
                href="/brush-plans"
              />
            </>
          )}
          {canManageBrush && (
            <>
              <MetricCard
                label="今日录单"
                value={`${stats.todayOrderCount} 笔`}
                hint={stats.todayOrderCount > 0 ? "今天已录入的刷单订单" : "今天还没有录单"}
                icon={CreditCard}
                href="/brush-orders"
              />
              <MetricCard
                label="今日支出"
                value={formatExpenseCurrency(stats.todayExpense)}
                hint={`差额 ${formatExpenseCurrency(stats.todayPayment - stats.todayReceived)} / 佣金 ${formatExpenseCurrency(stats.todayCommission)}`}
                icon={TrendingUp}
                href="/brush-orders"
              />
            </>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <div className="space-y-5">
          {canManageBrush && (
            <DashboardCard
              title={selectedRange === "all" ? "全部支出走势" : `近 ${selectedRange} 天支出走势`}
              subtitle="先选店铺，再切换最近时间范围，直接看这一段的支出变化。"
              action={
                <Link
                  href="/brush-orders"
                  className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-colors hover:text-primary/80"
                >
                  订单明细
                  <ArrowRight size={15} />
                </Link>
              }
            >
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
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={orderTrendData} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
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
                      <Legend />
                      <Line type="monotone" dataKey="expense" name="总支出" stroke="#fb7185" strokeWidth={3.2} dot={false} />
                      <Line type="monotone" dataKey="payment" name="实付" stroke="#5ba7ff" strokeWidth={2.6} dot={false} />
                      <Line type="monotone" dataKey="commission" name="佣金" stroke="#f3b34c" strokeWidth={2.4} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="当前筛选条件下没有订单数据，换个店铺或日期范围试试。" />
              )}
            </DashboardCard>
          )}

        </div>

        <div className="space-y-5">
          {canManageBrush && (
            <DashboardCard
              title="店铺支出曲线"
              subtitle="看不同店铺最近支出变化，能更直接判断哪家在持续放量。"
            >
              {expenseTrendByShop.data.length > 0 ? (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={expenseTrendByShop.data} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
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
                      <Legend />
                      {expenseTrendByShop.shops.map((shop, index) => (
                        <Line
                          key={shop}
                          type="monotone"
                          dataKey={shop}
                          name={shop}
                          stroke={PLATFORM_COLORS[index % PLATFORM_COLORS.length]}
                          strokeWidth={3}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="还没有足够的订单数据，后续这里会按店铺展示支出曲线。" />
              )}
            </DashboardCard>
          )}

          <DashboardCard
            title="分析摘要"
            subtitle="把图里的重点先翻成结论，省得每次自己再做一次心算。"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {analysisHighlights.map((item) => (
                <div key={item.label} className="rounded-[22px] border border-border/50 bg-muted/15 px-4 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-xl font-black tracking-tight">{item.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

        </div>
      </div>
    </div>
  );
}
