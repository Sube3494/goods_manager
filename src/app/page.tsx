"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Package,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OverviewData = {
  inventory: {
    productCount: number;
    totalStock: number;
    lowStockCount: number;
    zeroStockCount: number;
    totalValue: number;
    lowStockThreshold: number;
    lowStockItems: Array<{ id: string; name: string; sku: string; stock: number; image: string }>;
  };
  purchases: {
    totalCount: number;
    pendingCount: number;
    receivedCount: number;
    pendingAmount: number;
    totalQuantity: number;
    recent: Array<{ id: string; date: string; status: string; totalAmount: number; firstItemName: string; itemCount: number }>;
  };
  shipments: {
    totalCount: number;
    pendingCount: number;
    partialCount: number;
    shippedCount: number;
    unpaidCount: number;
    partialPaidCount: number;
    paidCount: number;
    pendingCompensationCount: number;
    totalQuantity: number;
    receivableAmount: number;
    recent: Array<{
      id: string;
      date: string;
      status: string;
      paymentStatus: string;
      compensationStatus: string;
      recipientName: string;
      quantity: number;
      amount: number;
      firstItemName: string;
    }>;
  };
  customers: {
    count: number;
    recent: Array<{ id: string; name: string; phone: string; address: string; usageCount: number }>;
  };
  logistics: {
    count: number;
    names: string[];
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    subtitle: string;
    date: string;
    amount: number;
    image: string;
    productName: string;
    quantity: number;
  }>;
};

const numberText = (value: number) => Number(value || 0).toLocaleString("zh-CN");
const moneyText = (value: number) =>
  `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getShipmentTone(status: string) {
  if (status === "已发货") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-500";
  if (status === "部分发货") return "border-sky-500/25 bg-sky-500/10 text-sky-500";
  return "border-rose-500/25 bg-rose-500/10 text-rose-500";
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-white/80 p-3.5 shadow-sm dark:border-white/10 dark:bg-white/[0.045] sm:rounded-[24px] sm:p-4">
      <div className="flex items-start justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className="mt-1.5 truncate text-[24px] font-black leading-none tracking-tight text-foreground sm:mt-2 sm:text-[28px]">{value}</div>
          <p className="mt-1.5 truncate text-[11px] leading-5 text-muted-foreground sm:mt-2 sm:line-clamp-2 sm:text-xs">{hint}</p>
        </div>
        <div className={cn("rounded-[18px] border p-1.5 sm:rounded-2xl sm:p-2.5", tone)}>{icon}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  href,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col h-full min-w-0 overflow-hidden rounded-[26px] border border-border/70 bg-white/78 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.045] sm:p-5", className)}>
      <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black tracking-tight text-foreground sm:text-lg">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {href ? (
          <Link href={href} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-white px-3 text-xs font-bold text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:border-white/10 dark:bg-white/5">
            进入
            <ArrowRight size={14} />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-normal", className)}>
      {children}
    </span>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activityTab, setActivityTab] = useState<"全部" | "发货" | "采购">("全部");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/overview")
      .then((res) => {
        if (!res.ok) throw new Error("概述数据加载失败");
        return res.json();
      })
      .then((nextData) => {
        if (!cancelled) {
          setData(nextData);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "概述数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const workQueue = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "待入库采购",
        value: data.purchases.pendingCount,
        href: "/purchases",
        tone: "text-blue-500",
      },
      {
        label: "待/部分发货",
        value: data.shipments.pendingCount + data.shipments.partialCount,
        href: "/factory-shipments",
        tone: "text-rose-500",
      },
      {
        label: "待收货款",
        value: data.shipments.unpaidCount + data.shipments.partialPaidCount,
        href: "/factory-shipments",
        tone: "text-amber-500",
      },
      {
        label: "待补偿",
        value: data.shipments.pendingCompensationCount,
        href: "/factory-shipments",
        tone: "text-violet-500",
      },
    ];
  }, [data]);

  const filteredRecentActivity = useMemo(() => {
    if (!data) return [];
    return data.recentActivity.filter((item) => (
      activityTab === "全部" ? true : item.type === activityTab
    ));
  }, [activityTab, data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-4">
        <div className="rounded-[24px] border border-rose-500/20 bg-rose-500/8 px-5 py-4 text-sm font-bold text-rose-500">
          {error || "概述数据加载失败"}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden animate-in fade-in zoom-in-95 duration-500 sm:space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-border/70 bg-linear-to-br from-white/92 via-white/72 to-sky-500/8 p-4 shadow-xl shadow-black/5 dark:border-white/10 dark:from-white/[0.08] dark:via-white/[0.045] dark:to-cyan-500/10 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-500">业务概述</div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">运营概览</h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              汇总当前采购、发货、回款与补偿等关键环节，帮助快速识别当日需要优先处理的业务事项。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]">
            {workQueue.map((item) => (
              <Link key={item.label} href={item.href} className="rounded-2xl border border-border/60 bg-white/75 px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/30 dark:border-white/10 dark:bg-white/[0.055]">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{item.label}</div>
                <div className={cn("mt-2 text-2xl font-black leading-none", item.tone)}>{numberText(item.value)}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="货品库存"
          value={numberText(data.inventory.totalStock)}
          hint={`${numberText(data.inventory.productCount)} 个货品，库存价值 ${moneyText(data.inventory.totalValue)}`}
          icon={<Package size={18} className="text-emerald-500" />}
          tone="border-emerald-500/20 bg-emerald-500/10"
        />
        <MetricCard
          label="采购待入库"
          value={numberText(data.purchases.pendingCount)}
          hint={`待入库金额 ${moneyText(data.purchases.pendingAmount)}`}
          icon={<ShoppingBag size={18} className="text-blue-500" />}
          tone="border-blue-500/20 bg-blue-500/10"
        />
        <MetricCard
          label="发货件数"
          value={numberText(data.shipments.totalQuantity)}
          hint={`待发 ${data.shipments.pendingCount}，部分发货 ${data.shipments.partialCount}`}
          icon={<Truck size={18} className="text-sky-500" />}
          tone="border-sky-500/20 bg-sky-500/10"
        />
        <MetricCard
          label="待收货款"
          value={moneyText(data.shipments.receivableAmount)}
          hint={`${numberText(data.shipments.unpaidCount + data.shipments.partialPaidCount)} 张发货单未结清`}
          icon={<Wallet size={18} className="text-amber-500" />}
          tone="border-amber-500/20 bg-amber-500/10"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Panel title="发货与回款" subtitle="按快递单号自动判断发货状态，货款和补偿单独跟踪。" href="/factory-shipments">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold text-muted-foreground">待发货</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-rose-500">{numberText(data.shipments.pendingCount)}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold text-muted-foreground">部分发货</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-sky-500">{numberText(data.shipments.partialCount)}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold text-muted-foreground">待补偿</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-violet-500">{numberText(data.shipments.pendingCompensationCount)}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {data.shipments.recent.length > 0 ? data.shipments.recent.map((item) => (
              <div key={item.id} className="overflow-hidden rounded-2xl border border-border/50 bg-white/60 px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.035]">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-normal text-foreground">{item.recipientName} · {item.firstItemName}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(item.date)} · {numberText(item.quantity)} 件</div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:flex-col sm:items-end sm:gap-1">
                    <StatusPill className={getShipmentTone(item.status)}>{item.status}</StatusPill>
                    <span className="text-[11px] font-bold text-muted-foreground">{item.paymentStatus}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无发货记录</div>
            )}
          </div>
        </Panel>

        <Panel title="库存预警" subtitle={`低于或等于 ${data.inventory.lowStockThreshold} 件会进入预警。`} href="/goods">
          {data.inventory.lowStockItems.length > 0 ? (
            <div className="space-y-2">
              {data.inventory.lowStockItems.map((item) => (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-border/50 bg-white/60 px-3 py-2 dark:border-white/8 dark:bg-white/[0.035]">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/40 text-muted-foreground dark:border-white/8">
                        {item.image ? (
                          <Image src={item.image} alt={item.name} width={40} height={40} className="h-full w-full object-cover" />
                        ) : (
                          <Package size={16} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-foreground">{item.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{item.sku || "无编号"}</div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <StatusPill className={item.stock <= 0 ? "border-rose-500/25 bg-rose-500/10 text-rose-500" : "border-amber-500/25 bg-amber-500/10 text-amber-500"}>
                        库存 {numberText(item.stock)}
                      </StatusPill>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-5 text-sm font-bold text-emerald-500">
              暂无低库存货品，库存状态健康。
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Panel title="采购进度" subtitle="关注已下单但还没入库的采购单。" href="/purchases">
          <div className="mt-auto grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold text-muted-foreground">已下单</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-blue-500">{numberText(data.purchases.pendingCount)}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="text-[10px] font-bold text-muted-foreground">已入库</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-emerald-500">{numberText(data.purchases.receivedCount)}</div>
            </div>
          </div>
        </Panel>

        <Panel title="客户沉淀" subtitle="发货单收件人会自动沉淀到客户管理。" href="/customers">
          <div className="mt-auto flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-muted-foreground">客户数量</div>
              <div className="mt-1.5 text-[30px] font-black leading-none text-foreground">{numberText(data.customers.count)}</div>
            </div>
            <Users className="text-cyan-500 shrink-0" size={26} />
          </div>
        </Panel>

        <Panel title="基础资料" subtitle="物流公司与基础资料是否已准备好。" href="/logistics">
          <div className="mt-auto flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="text-[10px] font-bold text-muted-foreground">物流公司</div>
                <div className="mt-1.5 text-[30px] font-black leading-none text-foreground">{numberText(data.logistics.count)}</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="text-[10px] font-bold text-muted-foreground">零库存</div>
                <div className="mt-1.5 text-[30px] font-black leading-none text-rose-500">{numberText(data.inventory.zeroStockCount)}</div>
              </div>
            </div>
            {data.logistics.count === 0 ? (
              <div className="mt-1 flex items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs font-bold text-amber-500">
                <AlertTriangle size={14} />
                还没有物流公司，发货单下拉会为空。
              </div>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel title="最近动态" subtitle="采购和发货按时间合并，快速回看最近动作。">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["全部", "发货", "采购"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActivityTab(tab)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-full border px-3 text-[12px] font-bold transition-all",
                activityTab === tab
                  ? "border-primary/25 bg-primary/12 text-primary"
                  : "border-border/60 bg-white/70 text-muted-foreground hover:border-primary/20 hover:text-foreground dark:border-white/10 dark:bg-white/[0.04]",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="grid gap-2.5 md:grid-cols-2">
          {filteredRecentActivity.length > 0 ? filteredRecentActivity.map((item) => (
            <div key={item.id} className="flex flex-col justify-between overflow-hidden rounded-2xl border border-border/50 bg-white/60 px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.035]">
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusPill className={item.type === "采购" ? "border-blue-500/20 bg-blue-500/10 text-blue-500" : "border-sky-500/20 bg-sky-500/10 text-sky-500"}>
                      {item.type}
                    </StatusPill>
                    {item.type === "发货" && item.title ? (
                      <span className="truncate text-xs font-normal text-foreground">{item.title}</span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(item.date)}</span>
                </div>
                <div className="mt-2.5 flex min-w-0 items-center gap-2 overflow-hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-border/60 bg-white/75 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border/60 bg-white/80 dark:border-white/10 dark:bg-white/[0.05]">
                      {item.image ? (
                        <Image src={item.image} alt={String(item.productName || "货品图片")} fill sizes="28px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package size={12} className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-[13px] font-bold text-foreground">
                      {item.productName || item.title}
                    </div>
                    <div className="shrink-0 pl-1 text-[13px] font-black text-foreground">x{numberText(item.quantity)}</div>
                  </div>
                </div>
                <div className="mt-auto pt-2.5 flex items-center justify-between gap-3">
                  <div className="text-xs font-bold text-muted-foreground">{item.subtitle}</div>
                  <div className="shrink-0 text-sm font-black text-foreground">{moneyText(item.amount)}</div>
                </div>
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground md:col-span-2">当前分类暂无动态</div>
          )}
        </div>
      </Panel>
    </div>
  );
}
