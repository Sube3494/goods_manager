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
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 px-4 sm:px-6 pb-4 sm:pb-5" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
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
            "group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-500 cursor-default",
            "bg-white dark:bg-zinc-900",
            "border border-zinc-200/80 dark:border-white/10 shadow-sm hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1"
        )}>
            {/* Image Area */}
            <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800/40 overflow-hidden">
                {/* 悬浮暗色渐变蒙层，确保即使是白色商品图，也能看清白色文字徽章 */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30 z-10 opacity-50 mix-blend-multiply pointer-events-none transition-opacity group-hover:opacity-30" />

                {/* Number Badge: 圆形毛玻璃 */}
                <div className="absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-full bg-white/20 dark:bg-black/40 backdrop-blur-md border border-white/20 text-white text-[11px] font-black shadow-sm flex items-center justify-center pointer-events-none">
                    {index + 1}
                </div>
                
                {/* Quantity Badge: 药丸型高对比度毛玻璃 */}
                <div className="absolute bottom-2.5 right-2.5 z-20 px-2.5 py-1 rounded-full bg-white/95 dark:bg-zinc-900/90 backdrop-blur-md border border-black/5 dark:border-white/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-black shadow-lg flex items-center gap-1 pointer-events-none tracking-tight">
                    <span className="opacity-60">x</span> {item.quantity} 份
                </div>

                {item.product?.image ? (
                    <Image 
                        src={item.product.image.startsWith('http') || item.product.image.startsWith('/') 
                            ? item.product.image 
                            : `/api/uploads/${item.product.image.replace(/^\/?uploads\//, '')}`} 
                        fill 
                        className={cn(
                            "object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                            "group-hover:scale-105"
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

            {/* Content Area - 清新极简排版 */}
            <div className="flex flex-col p-3.5 sm:p-4 bg-white dark:bg-zinc-900/30">
                <div className="flex items-start gap-2.5">
                    <Search className="w-3.5 h-3.5 mt-[3px] text-primary opacity-60 shrink-0" strokeWidth={3} />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground opacity-50 uppercase tracking-widest leading-none">
                            搜索词
                        </span>
                        <span className="text-[13px] sm:text-[14px] font-black text-zinc-800 dark:text-zinc-100 leading-snug line-clamp-2 break-all group-hover:text-primary transition-colors">
                            {item.searchKeyword || "暂无关键字"}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
