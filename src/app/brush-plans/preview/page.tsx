"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Calendar, ChevronRight, Package, Search, Store } from "lucide-react";
import { BrushOrderPlan, BrushOrderPlanItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";
import { ThemeToggle } from "@/components/ThemeToggle";

type PreviewItem = BrushOrderPlanItem & {
    __shopName: string;
    __platform: string;
};

export default function BrushPlansPreviewPage() {
    const searchParams = useSearchParams();
    const date = (searchParams.get("date") || "").trim();
    const [plans, setPlans] = useState<BrushOrderPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!date) {
            setLoading(false);
            setError("缺少日期参数");
            return;
        }

        let active = true;

        const fetchPlans = async () => {
            setLoading(true);
            setError("");
            try {
                const params = new URLSearchParams();
                params.set("date", date);
                params.set("limit", "1000");
                const res = await fetch(`/api/brush-plans?${params.toString()}`);
                if (!res.ok) {
                    throw new Error("加载失败");
                }
                const data = await res.json();
                if (active) {
                    setPlans(Array.isArray(data.items) ? data.items : []);
                }
            } catch (fetchError) {
                console.error("Failed to fetch brush plan preview:", fetchError);
                if (active) {
                    setError("当天安排加载失败");
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        fetchPlans();
        return () => {
            active = false;
        };
    }, [date]);

    const groupedPreview = useMemo(() => {
        const flattenedItems: PreviewItem[] = plans.flatMap((plan) =>
            plan.items.map((item) => ({
                ...item,
                __shopName: String(plan.shopName || "").trim() || "通用店铺",
                __platform: normalizePlatform(item.platform),
            }))
        );

        return Array.from(
            flattenedItems.reduce((shopMap, item) => {
                const shopName = item.__shopName;
                const platform = item.__platform;
                const currentShop = shopMap.get(shopName) || new Map<string, PreviewItem[]>();
                const currentItems = currentShop.get(platform) || [];
                currentItems.push(item);
                currentShop.set(platform, currentItems);
                shopMap.set(shopName, currentShop);
                return shopMap;
            }, new Map<string, Map<string, PreviewItem[]>>())
        )
            .map(([shopName, platformMap]) => ({
                shopName,
                totalQuantity: Array.from(platformMap.values()).flat().reduce((sum, item) => sum + (item.quantity || 1), 0),
                platforms: sortPlatforms(
                    Array.from(platformMap.entries()).map(([platform, items]) => ({
                        platform,
                        items,
                    }))
                ),
            }))
            .sort((a, b) => a.shopName.localeCompare(b.shopName, "zh-CN"));
    }, [plans]);

    return (
        <div className="min-h-dynamic-screen bg-background text-foreground">
            <header className="sticky top-0 z-20 border-b border-border/60 bg-background/92 backdrop-blur-xl">
                <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-4 pt-6 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <Link
                                href="/brush-plans"
                                className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/90 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground dark:bg-white/5"
                            >
                                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
                                返回安排表
                            </Link>
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-black text-primary">
                                <Calendar size={14} />
                                {date || "未指定日期"}
                            </div>
                        </div>
                        <ThemeToggle className="h-10 w-10 shrink-0 rounded-full border border-border/70 bg-white/90 shadow-sm dark:bg-white/5" />
                    </div>

                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {loading ? (
                    <div className="rounded-[28px] border border-border/70 bg-white/90 px-6 py-20 text-center text-sm font-medium text-muted-foreground shadow-sm dark:bg-white/5">
                        正在整理当天安排...
                    </div>
                ) : error ? (
                    <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-20 text-center">
                        <div className="text-lg font-black text-red-600">{error}</div>
                    </div>
                ) : groupedPreview.length === 0 ? (
                    <div className="rounded-[28px] border border-border/70 bg-white/90 px-6 py-20 text-center shadow-sm dark:bg-white/5">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Calendar size={28} />
                        </div>
                        <div className="text-lg font-black text-foreground">这一天还没有安排</div>
                        <p className="mt-2 text-sm font-medium text-muted-foreground">回到安排表新增计划，或者换个日期再看。</p>
                    </div>
                ) : (
                    <div className="space-y-4 sm:space-y-5">
                        {groupedPreview.map((shopGroup) => (
                            <section
                                key={shopGroup.shopName}
                                className="overflow-hidden rounded-[22px] border border-border/50 bg-white/90 shadow-sm dark:bg-white/5 sm:rounded-[24px]"
                            >
                                <div className="border-b border-border/40 px-3.5 py-3.5 sm:px-5 sm:py-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                                                    <Store size={18} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h2 className="truncate text-[22px] font-black leading-none tracking-tight text-foreground sm:text-lg sm:leading-tight">{shopGroup.shopName}</h2>
                                                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-bold text-muted-foreground sm:hidden">
                                                        <span>{shopGroup.platforms.length} 个平台</span>
                                                        <span className="opacity-40">•</span>
                                                        <span>{shopGroup.platforms.reduce((sum, platform) => sum + platform.items.length, 0)} 个任务</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 hidden flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground sm:flex">
                                                <span>{shopGroup.platforms.length} 个平台</span>
                                                <span className="opacity-40">•</span>
                                                <span>{shopGroup.platforms.reduce((sum, platform) => sum + platform.items.length, 0)} 个任务</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                                    {shopGroup.platforms.map((platformGroup) => {
                                        const meta = getPlatformMeta(platformGroup.platform);
                                        return (
                                            <div
                                                key={`${shopGroup.shopName}-${platformGroup.platform}`}
                                                className="rounded-[20px] border border-border/60 bg-black/[0.02] p-2.5 sm:rounded-[22px] sm:p-4 dark:bg-white/[0.03]"
                                            >
                                                <div className="mb-2.5 flex flex-wrap items-center gap-2 sm:mb-3">
                                                    <span className={meta.badgeClassName}>
                                                        <Image
                                                            src={meta.iconSrc}
                                                            alt={meta.iconAlt}
                                                            width={16}
                                                            height={16}
                                                            className="h-4 w-4"
                                                            unoptimized
                                                        />
                                                        {platformGroup.platform}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                                    {groupPlanItemsByOrder(platformGroup.items).map((orderGroup, index) => (
                                                        <CompactOrderCard
                                                            key={`${shopGroup.shopName}-${platformGroup.platform}-${orderGroup.group}-${index}`}
                                                            items={orderGroup.items}
                                                            index={index}
                                                            accentClassName={meta.accentClassName}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function CompactOrderCard({
    items,
    index,
    accentClassName,
}: {
    items: PreviewItem[];
    index: number;
    accentClassName: string;
}) {
    const title = items.length > 1 ? `${items.length} 种商品` : "";
    const orderKeyword = items.find((item) => item.searchKeyword?.trim())?.searchKeyword || "未设置关键词";

    return (
        <div className="overflow-hidden rounded-[20px] border border-border/60 bg-white p-2 shadow-sm transition-all hover:border-primary/25 hover:shadow-md dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10 sm:rounded-2xl">
            <div className="mb-2 px-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                <div className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-black", accentClassName)}>
                    第 {index + 1} 单
                </div>
                {title ? <div className="min-w-0 truncate text-right text-[12px] font-black text-foreground">{title}</div> : null}
                </div>
            </div>
            <div className="relative aspect-square overflow-hidden rounded-[18px] p-1.5">
                <div className={cn(
                    "grid h-full w-full gap-1.5",
                    items.length === 2 ? "grid-cols-1 grid-rows-2" : items.length > 2 ? "grid-cols-2" : "grid-cols-1"
                )}>
                    {items.slice(0, 4).map((item, itemIndex) => (
                        <ProductImageTile key={`${item.id || itemIndex}-image`} item={item} compact={items.length > 1} />
                    ))}
                </div>
                {items.length > 4 ? (
                    <div className="absolute bottom-1.5 left-1.5 z-10 rounded-full bg-black/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md">
                        +{items.length - 4}
                    </div>
                ) : null}
            </div>

            <div className="mt-2.5 min-h-[48px]">
                <div className="mb-1.5 flex items-center gap-1.5 rounded-xl bg-black/[0.04] px-2 py-1.5 dark:bg-white/[0.08]">
                    <Search size={11} className="shrink-0 text-muted-foreground" />
                    <span className="shrink-0 text-[10px] font-black text-muted-foreground">搜索词</span>
                    <span className="truncate text-[12px] font-black text-foreground">{orderKeyword}</span>
                </div>
                {items.length > 4 ? (
                    <div className="mt-1.5 text-[10px] font-black text-muted-foreground">另 {items.length - 4} 项未显示图片</div>
                ) : null}
            </div>
        </div>
    );
}

function ProductImageTile({ item }: { item: PreviewItem; compact?: boolean }) {
    const imageUrl = resolveProductImage(item.product?.image);

    return (
        <div className="relative isolate overflow-hidden rounded-md bg-muted/50">
            {imageUrl ? (
                <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/35">
                    <Package size={18} />
                </div>
            )}
            <div className="absolute right-1 top-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-black leading-none text-zinc-900 shadow-sm dark:bg-zinc-900/90 dark:text-white">
                x{item.quantity || 1}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-zinc-900/80 px-1.5 py-0.5 text-[9px] font-black leading-3 text-white">
                <div className="truncate">{item.productName || item.product?.name || "未绑定商品"}</div>
            </div>
        </div>
    );
}
function groupPlanItemsByOrder(items: PreviewItem[]) {
    const groups = new Map<number, PreviewItem[]>();
    items.forEach((item, index) => {
        const group = item.orderGroup || index + 1;
        const current = groups.get(group) || [];
        current.push(item);
        groups.set(group, current);
    });
    return Array.from(groups.entries()).map(([group, groupItems]) => ({ group, items: groupItems }));
}

function normalizePlatform(platform?: string | null) {
    const text = String(platform || "").trim();
    if (!text) return "其他";
    if (text.includes("美团")) return "美团";
    if (text.includes("淘宝")) return "淘宝";
    if (text.includes("京东")) return "京东";
    return "其他";
}

function sortPlatforms<T extends { platform: string }>(items: T[]) {
    const order = ["美团", "淘宝", "京东", "其他"];
    return [...items].sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
}

function getPlatformMeta(platform: string) {
    if (platform === "美团") {
        return {
            iconSrc: "/platform/美团.svg",
            iconAlt: "美团",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-[11px] font-black text-foreground dark:border-white/10 dark:bg-white/5 sm:text-xs",
            accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
        };
    }
    if (platform === "淘宝") {
        return {
            iconSrc: "/platform/淘宝.svg",
            iconAlt: "淘宝",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-[11px] font-black text-foreground dark:border-white/10 dark:bg-white/5 sm:text-xs",
            accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
        };
    }
    if (platform === "京东") {
        return {
            iconSrc: "/platform/京东.svg",
            iconAlt: "京东",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-[11px] font-black text-foreground dark:border-white/10 dark:bg-white/5 sm:text-xs",
            accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
        };
    }
    return {
        iconSrc: "/platform/其他.svg",
        iconAlt: "其他",
        badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-xs font-black text-muted-foreground dark:border-white/10 dark:bg-white/5",
        accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
    };
}

function resolveProductImage(image?: string | null) {
    if (!image) return null;
    if (image.startsWith("http") || image.startsWith("/")) return image;
    return `/api/uploads/${image.replace(/^\/?uploads\//, "")}`;
}
