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

    const summary = useMemo(() => {
        const items = groupedPreview.flatMap((shop) => shop.platforms.flatMap((platform) => platform.items));
        return {
            shopCount: groupedPreview.length,
            taskCount: items.length,
            quantityCount: items.reduce((sum, item) => sum + (item.quantity || 1), 0),
            platformCount: new Set(items.map((item) => item.__platform)).size,
        };
    }, [groupedPreview]);

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

                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">当天全店安排</h1>
                            <p className="text-sm font-medium text-muted-foreground">按店铺分开，再按平台整理，直接一页看完当天所有安排。</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                            <SummaryCard label="店铺" value={summary.shopCount} />
                            <SummaryCard label="平台" value={summary.platformCount} />
                            <SummaryCard label="任务" value={summary.taskCount} />
                            <SummaryCard label="份数" value={summary.quantityCount} />
                        </div>
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
                    <div className="space-y-5">
                        {groupedPreview.map((shopGroup) => (
                            <section
                                key={shopGroup.shopName}
                                className="overflow-hidden rounded-[24px] border border-border/50 bg-white/90 shadow-sm dark:bg-white/5"
                            >
                                <div className="border-b border-border/40 px-4 py-4 sm:px-5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                                                    <Store size={18} />
                                                </div>
                                                <h2 className="truncate text-lg font-black text-foreground">{shopGroup.shopName}</h2>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                                                <span>{shopGroup.platforms.length} 个平台</span>
                                                <span className="opacity-40">•</span>
                                                <span>{shopGroup.platforms.reduce((sum, platform) => sum + platform.items.length, 0)} 个任务</span>
                                                <span className="opacity-40">•</span>
                                                <span>{shopGroup.totalQuantity} 份安排</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 p-4 sm:p-5">
                                    {shopGroup.platforms.map((platformGroup) => {
                                        const meta = getPlatformMeta(platformGroup.platform);
                                        return (
                                            <div
                                                key={`${shopGroup.shopName}-${platformGroup.platform}`}
                                                className="rounded-[22px] border border-border/60 bg-black/[0.02] p-3 sm:p-4 dark:bg-white/[0.03]"
                                            >
                                                <div className="mb-3 flex flex-wrap items-center gap-2">
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
                                                    <span className="text-xs font-bold text-muted-foreground">
                                                        {platformGroup.items.length} 个任务
                                                    </span>
                                                </div>

                                                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                    {platformGroup.items.map((item, index) => (
                                                        <CompactItemCard
                                                            key={`${shopGroup.shopName}-${platformGroup.platform}-${item.id || index}`}
                                                            item={item}
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

function SummaryCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-2xl border border-border/70 bg-white/90 px-3 py-2 shadow-sm dark:bg-white/5">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
            <div className="mt-1 text-xl font-black text-foreground">{value}</div>
        </div>
    );
}

function CompactItemCard({
    item,
    index,
    accentClassName,
}: {
    item: PreviewItem;
    index: number;
    accentClassName: string;
}) {
    const imageUrl = resolveProductImage(item.product?.image);
    const keyword = item.searchKeyword || item.productName || item.product?.name || "未设置关键词";
    const productName = item.productName || item.product?.name || "未绑定商品";

    return (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-white px-3 py-2.5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10">
            <div className="flex items-center gap-2 self-start">
                <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full text-[10px] font-black", accentClassName)}>
                    {index + 1}
                </span>
                <div className="relative h-11 w-11 overflow-hidden rounded-2xl bg-muted/50">
                    {imageUrl ? (
                        <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/35">
                            <Package size={18} />
                        </div>
                    )}
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-black/[0.04] px-2 py-1 text-[11px] font-bold text-foreground dark:bg-white/[0.08]">
                            <Search size={12} className="shrink-0 text-muted-foreground" />
                            <span className="truncate">{keyword}</span>
                        </div>
                        <div className="mt-1.5 truncate text-[12px] font-medium text-muted-foreground">
                            {productName}
                        </div>
                    </div>
                    <div className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                        x{item.quantity || 1}
                    </div>
                </div>

                {item.note ? (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <ChevronRight size={12} />
                        <span className="truncate">{item.note}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );
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
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-xs font-black text-foreground dark:border-white/10 dark:bg-white/5",
            accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
        };
    }
    if (platform === "淘宝") {
        return {
            iconSrc: "/platform/淘宝.svg",
            iconAlt: "淘宝",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-xs font-black text-foreground dark:border-white/10 dark:bg-white/5",
            accentClassName: "bg-black/[0.06] text-foreground dark:bg-white/[0.12]",
        };
    }
    if (platform === "京东") {
        return {
            iconSrc: "/platform/京东.svg",
            iconAlt: "京东",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-1 text-xs font-black text-foreground dark:border-white/10 dark:bg-white/5",
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
