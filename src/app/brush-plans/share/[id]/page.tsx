"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Package, Calendar } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";
import { BrushOrderPlan } from "@/lib/types";

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
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 p-4 sm:p-6 safe-top">
                <div className="max-w-6xl mx-auto w-full">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Calendar size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <h1 className="text-xl font-black tracking-tight truncate">{plan.title || "刷单任务清单"}</h1>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground opacity-60">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {formatLocalDate(plan.date)}</span>
                                <span>•</span>
                                <span>共 {plan.items.length} 项，合计 {plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} 份</span>
                            </div>
                        </div>
                    </div>
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
                                                    <span className="text-xs font-black text-muted-foreground opacity-40">
                                                        {platformItems.length} 项
                                                    </span>
                                                </div>
                                                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/5 mx-6 hidden sm:block" />
                                                <div className="hidden sm:block text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em]">
                                                    {platformName === "美团" ? "美团订单" : platformName === "淘宝" ? "淘宝订单" : platformName === "京东" ? "京东订单" : "其他任务"}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                                                {platformItems.map((item, pIdx) => (
                                                    <ItemCard 
                                                        key={item.id} 
                                                        item={item} 
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
                                {plan.items.map((item, index) => (
                                    <ItemCard 
                                        key={item.id} 
                                        item={item} 
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

function ItemCard({ item, index }: { item: BrushOrderPlan["items"][number]; index: number }) {
    return (
        <div className={cn(
            "group relative flex flex-col glass-panel rounded-2xl overflow-hidden transition-all duration-500 cursor-default bg-white dark:bg-zinc-900 border shadow-sm hover:shadow-xl",
            "border-zinc-200 dark:border-white/5 hover:-translate-y-1.5"
        )}>
            <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800/50 overflow-hidden">
                {/* ID Badge */}
                <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-white text-[10px] font-black shadow-sm flex items-center justify-center pointer-events-none tracking-tighter">
                    #{index + 1}
                </div>
                
                {/* Quantity Badge - Condensed */}
                <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 rounded-lg bg-emerald-500 text-white text-[10px] font-black shadow-lg flex items-center justify-center pointer-events-none tracking-tighter">
                    {item.quantity}份
                </div>

                {item.product?.image ? (
                    <Image 
                        src={item.product.image.startsWith('http') || item.product.image.startsWith('/') 
                            ? item.product.image 
                            : `/api/uploads/${item.product.image.replace(/^\/?uploads\//, '')}`} 
                        fill 
                        className={cn(
                            "object-cover transition-all duration-700 ease-out",
                            "group-hover:scale-110"
                        )} 
                        alt="" 
                        unoptimized 
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                        <Package size={24} />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-1.5 p-2 sm:p-3 transition-opacity duration-500">
                {/* Keyword area - Condensed */}
                <div className="flex items-start gap-2 min-h-11 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 text-zinc-700 dark:text-zinc-200 font-bold text-[14px] leading-snug w-full border border-zinc-100 dark:border-white/5">
                    <Search size={14} className="shrink-0 mt-0.5 opacity-35" />
                    <span className="line-clamp-2 break-all">{item.searchKeyword || "暂无关键字"}</span>
                </div>
            </div>
        </div>
    );
}
