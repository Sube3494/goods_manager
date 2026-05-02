"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, BadgePlus, Clock, Package, PackageOpen, Trophy, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { cn } from "@/lib/utils";
import { RecentInboundItem } from "@/lib/types";
import { useRouter } from "next/navigation";

type TabKey = "inbound" | "top";

interface TopOutboundProduct {
  productId: string;
  totalQuantity: number;
  latestOutboundAt?: string;
  product: {
    id: string;
    name: string;
    sku: string;
    image: string | null;
  };
}

interface Props {
  recentInboundItems: RecentInboundItem[];
  isLoading?: boolean;
  selectedShopName?: string;
}

const cardClass =
  "h-full w-full overflow-hidden rounded-[30px] border border-black/8 bg-white/75 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]";

const tabClass =
  "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors";

export function DashboardFeedPanel({ recentInboundItems, isLoading = false, selectedShopName = "" }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("inbound");
  const [topItems, setTopItems] = useState<TopOutboundProduct[]>([]);
  const [isTopLoading, setIsTopLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchTop = async () => {
      setIsTopLoading(true);
      try {
        const query = new URLSearchParams();
        if (selectedShopName) query.set("shopName", selectedShopName);
        const res = await fetch(`/api/stats/top-outbound?${query.toString()}`, { cache: "no-store" });
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        setTopItems(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch top outbound:", error);
      } finally {
        if (isMounted) setIsTopLoading(false);
      }
    };

    fetchTop();
    return () => {
      isMounted = false;
    };
  }, [selectedShopName]);

  const headerMeta =
    activeTab === "inbound"
      ? {
          icon: <BadgePlus size={14} />,
          title: "最近出库",
          subtitle: "最近出库商品",
          actionLabel: "历史记录",
          onAction: () => router.push("/inbound"),
        }
      : {
          icon: <TrendingUp size={14} />,
          title: "出库热销榜",
          subtitle: "最近热销商品",
          actionLabel: topItems.length > 0 ? `前 ${topItems.length} 名` : "热销榜",
          onAction: undefined,
        };

  const renderInbound = () => {
    if (isLoading) {
      return (
        <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-[16px] border border-black/6 bg-black/3 dark:border-white/8 dark:bg-white/5" />
          ))}
        </div>
      );
    }

    if (!recentInboundItems.length) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center opacity-35">
          <Package size={34} className="text-muted-foreground" />
          <p className="mt-3 text-[11px] font-bold tracking-widest text-muted-foreground">暂无出库记录</p>
        </div>
      );
    }

    return (
      <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
        {recentInboundItems.map((item) => {
          const productName = item.product?.name || "未知商品";
          const productSku = item.product?.sku;
          const productImage = item.product?.image;

          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-[16px] border border-black/6 bg-white/78 px-3 py-3 transition-colors hover:border-black/10 hover:bg-white dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/12 dark:hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5"
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-black/5 bg-black/5 dark:border-white/10 dark:bg-muted/20 sm:h-10 sm:w-10 sm:rounded-lg">
                  {productImage ? (
                    <Image src={productImage} alt={productName} fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                      <Package size={16} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-bold leading-5 tracking-tight text-foreground sm:truncate sm:leading-normal">
                    {productName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">编号</span>
                    <span className="h-1 w-1 rounded-full bg-black/10 dark:bg-white/12" />
                    <span className="max-w-full truncate font-mono">{productSku || "未填写"}</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-primary">数量 {item.quantity}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-black/6 pt-2 dark:border-white/8 sm:w-[88px] sm:shrink-0 sm:flex-col sm:items-end sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3 sm:text-right">
                <div className="text-[10px] font-bold text-muted-foreground sm:w-full sm:text-right">
                  最近出库
                </div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground sm:mt-1 sm:w-full sm:justify-end sm:text-[9px]">
                  <Clock size={10} strokeWidth={3} className="shrink-0" />
                  <span className="truncate">
                    {item.purchaseOrder.date
                      ? formatDistanceToNow(new Date(item.purchaseOrder.date), { addSuffix: true, locale: zhCN })
                      : "未知"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTopOutbound = () => {
    if (isTopLoading) {
      return (
        <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-[16px] border border-black/6 bg-white/75 px-3 py-2.5 animate-pulse dark:border-white/8 dark:bg-white/[0.04]">
              <div className="h-12 w-12 shrink-0 rounded-lg border border-black/3 bg-black/3 dark:border-white/5 dark:bg-white/5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded-full bg-black/3 dark:bg-white/5" />
                <div className="h-3 w-1/3 rounded-full bg-black/3 dark:bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (!topItems.length) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center opacity-35">
          <PackageOpen size={34} className="text-muted-foreground" />
          <p className="mt-3 text-[11px] font-bold tracking-widest text-muted-foreground">暂无热销数据</p>
        </div>
      );
    }

    return (
      <div className="grid gap-3 p-4 sm:p-5 xl:grid-cols-2">
        <AnimatePresence initial={false}>
          {topItems.map((item, index) => (
            <motion.div
              key={`${item.productId}-${item.latestOutboundAt || "unknown"}-${index}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, delay: index * 0.03 }}
              className="group flex flex-col gap-3 rounded-[16px] border border-black/6 bg-white/78 px-3 py-3 transition-colors hover:border-black/10 hover:bg-white dark:border-white/8 dark:bg-white/[0.03] dark:hover:border-white/12 dark:hover:bg-white/[0.05] sm:flex-row sm:items-center sm:gap-3 sm:py-2.5"
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-black tabular-nums shadow-inner",
                  index < 3
                    ? "border-amber-500/25 bg-amber-500/12 text-amber-500"
                    : "border-black/8 bg-black/[0.03] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]"
                )}>
                  {index + 1}
                </div>
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-black/5 bg-black/5 dark:border-white/10 dark:bg-muted/20">
                  {item.product.image ? (
                    <Image src={item.product.image} alt={item.product.name} fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/20">
                      <PackageOpen size={18} />
                    </div>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] font-bold leading-5 tracking-tight text-foreground transition-colors group-hover:text-primary sm:truncate sm:leading-normal">
                    {item.product.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">编号</span>
                    <span className="h-1 w-1 rounded-full bg-black/10 dark:bg-white/12" />
                    <span className="max-w-full truncate font-mono">{item.product.sku || "未填写"}</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-primary">数量 {item.totalQuantity}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-black/6 pt-2 dark:border-white/8 sm:w-[88px] sm:shrink-0 sm:flex-col sm:items-end sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3 sm:text-right">
                <div className="text-[10px] font-bold text-muted-foreground sm:w-full sm:text-right">
                  最近销售
                </div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground sm:mt-1 sm:w-full sm:justify-end sm:text-[9px]">
                  <Clock size={10} strokeWidth={3} className="shrink-0" />
                  <span className="truncate">
                    {item.latestOutboundAt
                      ? formatDistanceToNow(new Date(item.latestOutboundAt), { addSuffix: true, locale: zhCN })
                      : "未知"}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <section className={cardClass}>
      <div className="border-b border-black/6 px-4 py-4 dark:border-white/8 sm:px-5">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">现场动态</div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">入库与销售</h2>
          <p className="mt-1 text-sm text-muted-foreground">近期记录</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-black/6 px-4 py-3 dark:border-white/8 sm:px-5">
        <div className="min-w-0 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-black/8 bg-black/[0.03] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {headerMeta.icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black tracking-tight text-foreground sm:text-base">{headerMeta.title}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{headerMeta.subtitle}</p>
          </div>
        </div>

        {headerMeta.onAction ? (
          <button
            onClick={headerMeta.onAction}
            className="group inline-flex items-center gap-1 rounded-full border border-black/8 px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground dark:border-white/10"
          >
            {headerMeta.actionLabel}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            <Trophy size={11} />
            {headerMeta.actionLabel}
          </span>
        )}
      </div>

      <div className="border-b border-black/6 px-4 py-3 dark:border-white/8 sm:px-5">
        <div className="inline-flex max-w-full rounded-full border border-black/8 bg-black/[0.03] p-1 dark:border-white/10 dark:bg-white/[0.04]">
          <button
            type="button"
            onClick={() => setActiveTab("inbound")}
            className={cn(
              `${tabClass} min-w-[88px] justify-center`,
              activeTab === "inbound"
                ? "border-transparent bg-background text-foreground shadow-xs dark:bg-white/[0.08]"
                : "border-transparent bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            最近出库
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("top")}
            className={cn(
              `${tabClass} min-w-[88px] justify-center`,
              activeTab === "top"
                ? "border-transparent bg-background text-foreground shadow-xs dark:bg-white/[0.08]"
                : "border-transparent bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            热销榜
          </button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
        {activeTab === "inbound" ? renderInbound() : renderTopOutbound()}
      </div>
    </section>
  );
}
