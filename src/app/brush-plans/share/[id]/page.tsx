"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Package, Calendar, Store } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";
import { BrushOrderPlan } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SharedPlanPage() {
    const params = useParams();
    const id = params.id as string;
    const [plan, setPlan] = useState<BrushOrderPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const fetchSharedPlan = async () => {
            try {
                const res = await fetch(`/api/brush-plans/public/${id}`);
                if (res.ok) {
                    const data = await res.json();
                    setPlan(data);
                } else if (res.status === 410) {
                    setIsExpired(true);
                }
            } catch {
                console.error("Failed to fetch plan");
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchSharedPlan();
    }, [id]);

    if (loading) return (
        <div className="min-h-dynamic-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 safe-x safe-y">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    if (isExpired) return (
        <div className="min-h-dynamic-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 safe-x safe-y text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4 opacity-70">
                <Calendar size={32} />
            </div>
            <h1 className="text-xl font-black mb-2 text-zinc-800 dark:text-zinc-200">链接已失效</h1>
            <p className="text-muted-foreground text-sm max-w-xs">为保证数据安全，分享链接已超过 12 小时有效期。请联系创建者重新生成分享链接。</p>
        </div>
    );

    if (!plan) return (
        <div className="min-h-dynamic-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 safe-x safe-y text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-100 flex items-center justify-center text-red-500 mb-4 opacity-70">
                <Package size={32} />
            </div>
            <h1 className="text-xl font-black mb-2 text-zinc-800 dark:text-zinc-200">未找到该分享计划</h1>
            <p className="text-muted-foreground text-sm">链接可能已过期或计划已被创建者删除</p>
        </div>
    );

    return (
        <div className="min-h-dynamic-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col no-scrollbar">
            {/* Optimized Shared Header */}
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 px-4 sm:px-6 pb-4 sm:pb-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
                <div className="max-w-6xl mx-auto w-full">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Calendar size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <h1 className="text-xl font-black tracking-tight truncate">{plan.title || "刷单任务清单"}</h1>
                                <ThemeToggle />
                            </div>
                            <div className="flex items-center flex-wrap gap-2 text-[11px] font-bold text-muted-foreground opacity-70">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {formatLocalDate(plan.date)}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1"><Store size={12} /> {plan.shopName || "通用店铺"}</span>
                                <span>•</span>
                                <span>共 {groupPlanItemsByOrder(plan.items).length} 单 · {plan.items.length} 项，合计 {plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} 份</span>
                            </div>
                        </div>
                    </div>
                    {plan.note && (
                        <div className="mt-2 p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm font-medium">
                            <span className="font-bold opacity-70 mr-2">备注:</span>
                            {plan.note}
                        </div>
                    )}
                </div>
            </header>

            {/* Grouped View */}
            <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 pb-6">
                {(() => {
                    const platforms = ["美团", "淘宝", "京东", "其他"];
                    
                    // Standardize platform mapping for grouping
                    const getStandardPlatform = (p?: string | null) => {
                        const trimmed = (p || "").trim();
                        if (trimmed === "美团") return "美团";
                        if (trimmed === "淘宝") return "淘宝";
                        if (trimmed === "京东") return "京东";
                        return "其他";
                    };

                    const existingPlatforms = platforms.filter(p => 
                        plan.items.some(item => getStandardPlatform(item.platform) === p)
                    );

                    if (existingPlatforms.length > 0) {
                        return (
                            <div className="space-y-12">
                                {existingPlatforms.map((platformName: string) => {
                                    const platformItems = plan.items.filter(item => getStandardPlatform(item.platform) === platformName);
                                    
                                    let bgColor = "bg-zinc-100 dark:bg-white/5";
                                    let textColor = "text-zinc-500";
                                    let dotColor = "bg-zinc-400";
                                    
                                    if (platformName === "美团") {
                                        bgColor = "bg-[#FFD000]/10";
                                        textColor = "text-[#222222] dark:text-[#FFD000]";
                                        dotColor = "bg-[#FFD000]";
                                    } else if (platformName === "淘宝") {
                                        bgColor = "bg-[#FF5000]/10";
                                        textColor = "text-[#FF5000]";
                                        dotColor = "bg-[#FF5000]";
                                    } else if (platformName === "京东") {
                                        bgColor = "bg-[#E1251B]/10";
                                        textColor = "text-[#E1251B]";
                                        dotColor = "bg-[#E1251B]";
                                    }

                                    return (
                                        <section key={platformName} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center justify-between mb-6 sticky top-[92px] sm:top-[108px] z-10 py-2 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("px-4 py-1.5 rounded-2xl text-sm font-black border border-transparent shadow-sm", bgColor, textColor)}>
                                                        <span className={cn("inline-block w-2 h-2 rounded-full mr-2", dotColor)} />
                                                        {platformName}
                                                    </div>
                                                    <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                                                        {groupPlanItemsByOrder(platformItems).length} 单 · {platformItems.length} 项
                                                    </span>
                                                </div>
                                                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/5 mx-6 hidden sm:block" />
                                                <div className="hidden sm:block text-[10px] font-black text-slate-500/60 dark:text-slate-400/60 uppercase tracking-[0.2em]">
                                                    {platformName === "美团" ? "美团订单" : platformName === "淘宝" ? "淘宝订单" : platformName === "京东" ? "京东订单" : "其他任务"}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                                                {groupPlanItemsByOrder(platformItems).map((orderGroup, pIdx) => (
                                                    <ItemCard
                                                        key={`${platformName}-${orderGroup.group}-${pIdx}`}
                                                        items={orderGroup.items}
                                                        index={pIdx} 
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        );
                    } else {
                        return (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                                {groupPlanItemsByOrder(plan.items).map((orderGroup, index) => (
                                    <ItemCard
                                        key={`fallback-${orderGroup.group}-${index}`}
                                        items={orderGroup.items}
                                        index={index}
                                    />
                                ))}
                            </div>
                        );
                    }
                })()}
            </main>

        </div>
    );
}

function ItemCard({ items, index }: { items: BrushOrderPlan["items"]; index: number }) {
    const title = items.length > 1 ? `${items.length} 种商品` : "";
    const orderKeyword = items.find((item) => item.searchKeyword?.trim())?.searchKeyword || "暂无关键字";

    return (
        <div className={cn(
            "group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300 cursor-default",
            "bg-white dark:bg-zinc-900",
            "border border-zinc-200/80 dark:border-white/10 shadow-sm hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1"
        )}>
            <div className="px-3.5 pb-2 pt-3.5 sm:px-4 sm:pt-4">
                <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="shrink-0 text-[10px] font-black text-emerald-600 dark:text-emerald-400">第 {index + 1} 单</span>
                    {title ? <span className="min-w-0 truncate text-right text-[13px] font-black text-zinc-900 dark:text-zinc-100">
                        {title}
                    </span> : null}
                </div>
            </div>
            <div className="relative aspect-square w-full overflow-hidden p-1.5">
                <div className={cn(
                    "grid h-full w-full gap-1.5",
                    items.length === 2 ? "grid-cols-1 grid-rows-2" : items.length > 2 ? "grid-cols-2" : "grid-cols-1"
                )}>
                    {items.slice(0, 4).map((item, itemIndex) => (
                        <ProductImageTile key={`${item.id || itemIndex}-image`} item={item} compact={items.length > 1} />
                    ))}
                </div>
                {items.length > 4 ? (
                    <div className="absolute bottom-2.5 left-2.5 z-20 rounded-full bg-black/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md">
                        +{items.length - 4}
                    </div>
                ) : null}
            </div>

            <div className="flex min-h-[64px] flex-col p-3.5 sm:p-4">
                <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-2.5 py-2 dark:bg-white/6">
                    <Search size={12} className="shrink-0 text-primary opacity-70" />
                    <span className="shrink-0 text-[10px] font-black text-zinc-500 dark:text-zinc-400">搜索词</span>
                    <span className="truncate text-[13px] font-black text-zinc-900 dark:text-zinc-100">{orderKeyword}</span>
                </div>
                {items.length > 4 ? (
                    <div className="text-[10px] font-black text-muted-foreground">另 {items.length - 4} 项未显示图片</div>
                ) : null}
            </div>
        </div>
    );
}

function ProductImageTile({ item, compact = false }: { item: BrushOrderPlan["items"][number]; compact?: boolean }) {
    const image = item.product?.image;
    const src = image
        ? image.startsWith("http") || image.startsWith("/")
            ? image
            : `/api/uploads/${image.replace(/^\/?uploads\//, "")}`
        : "";

    return (
        <div className="relative isolate overflow-hidden rounded-md bg-zinc-200 dark:bg-zinc-800">
            {src ? (
                <Image src={src} fill className="object-cover" alt="" unoptimized />
            ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                    <Package size={24} />
                </div>
            )}
            <div className="absolute right-1.5 top-1.5 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-black text-zinc-900 shadow-sm dark:bg-zinc-900/90 dark:text-white">
                x{item.quantity || 1}
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-zinc-900/80 px-2 py-1 text-[10px] font-black leading-3.5 text-white">
                <div className="truncate">{item.productName || item.product?.name || "未绑定商品"}</div>
            </div>
        </div>
    );
}

function groupPlanItemsByOrder(items: BrushOrderPlan["items"]) {
    const groups = new Map<number, BrushOrderPlan["items"]>();
    items.forEach((item, index) => {
        const group = item.orderGroup || index + 1;
        const current = groups.get(group) || [];
        current.push(item);
        groups.set(group, current);
    });
    return Array.from(groups.entries()).map(([group, groupItems]) => ({ group, items: groupItems }));
}
