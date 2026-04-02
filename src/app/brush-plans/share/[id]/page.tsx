"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Package, Calendar, CheckCircle2, Circle, Wallet } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/dateUtils";
import { BrushOrderPlan, BrushOrderPlanItem } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export default function SharedPlanPage() {
    const params = useParams();
    const id = params.id as string;
    const { showToast } = useToast();
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

    const handleUpdate = async (itemId: string, updates: Partial<BrushOrderPlanItem>) => {
        if (!plan) return;

        const oldPlan = { ...plan };
        
        // 乐观更新
        setPlan({
            ...plan,
            items: plan.items.map(item => 
                item.id === itemId ? { ...item, ...updates } : item
            )
        });

        try {
            const res = await fetch(`/api/brush-plans/public/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, ...updates })
            });

            if (!res.ok) {
                setPlan(oldPlan);
                const errorData = await res.json();
                showToast(errorData.error || "更新失败", "error");
            } else {
                if (updates.done !== undefined) {
                    showToast(updates.done ? "已标记为完成" : "已取消完成标记", "success");
                } else if (updates.principal !== undefined) {
                    showToast("本金已保存", "success");
                }
            }
        } catch (err) {
            console.error('Failed to update item:', err);
            setPlan(oldPlan);
            showToast("网络请求失败", "error");
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    if (isExpired) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4 opacity-70">
                <Calendar size={32} />
            </div>
            <h1 className="text-xl font-black mb-2 text-zinc-800 dark:text-zinc-200">链接已失效</h1>
            <p className="text-muted-foreground text-sm max-w-xs">为保证数据安全，分享链接已超过 12 小时有效期。请联系创建者重新生成分享链接。</p>
        </div>
    );

    if (!plan) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-100 flex items-center justify-center text-red-500 mb-4 opacity-70">
                <Package size={32} />
            </div>
            <h1 className="text-xl font-black mb-2 text-zinc-800 dark:text-zinc-200">未找到该分享计划</h1>
            <p className="text-muted-foreground text-sm">链接可能已过期或计划已被创建者删除</p>
        </div>
    );

    const totals = plan.items.reduce((acc, item) => {
        const principal = item.principal || 0;
        const qty = item.quantity || 1;
        acc.total += principal * qty;
        return acc;
    }, { total: 0 });

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col no-scrollbar">
            {/* Optimized Shared Header */}
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 p-4 sm:p-6">
                <div className="max-w-6xl mx-auto w-full">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Calendar size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-4 mb-2">
                                <h1 className="text-xl font-black tracking-tight truncate">{plan.title || "刷单任务清单"}</h1>
                                {plan.items.length > 0 && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                            plan.items.filter(i => i.done).length > 0 
                                                ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10' 
                                                : 'text-zinc-500 bg-zinc-100 dark:bg-white/5'
                                        }`}>
                                            {Math.round((plan.items.filter(i => i.done).length / plan.items.length) * 100)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-bold text-muted-foreground opacity-60">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {formatLocalDate(plan.date)}</span>
                                <span>•</span>
                                <span>
                                    {plan.items.filter(i => i.done).length === 0 
                                        ? `共 ${plan.items.length} 项 (未开始)` 
                                        : plan.items.filter(i => i.done).length === plan.items.length 
                                            ? `${plan.items.length} 项已全部完成` 
                                            : `${plan.items.filter(i => i.done).length} / ${plan.items.length} 进行中`
                                    }
                                </span>
                            </div>
                            {/* Progress Bar */}
                            <div className="mt-3 h-1.5 w-full bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out ${
                                        plan.items.filter(i => i.done).length > 0 ? 'shadow-[0_0_8px_rgba(16,185,129,0.3)]' : ''
                                    }`}
                                    style={{ width: `${(plan.items.filter(i => i.done).length / plan.items.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Grouped View */}
            <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 pb-32">
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
                                    const platformDone = platformItems.filter(i => i.done).length;
                                    
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
                                                        {platformDone} / {platformItems.length}
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
                                                        onUpdate={handleUpdate} 
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
                                        onUpdate={handleUpdate} 
                                    />
                                ))}
                            </div>
                        );
                    }
                })()}
            </main>

            {/* Sticky Summary Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-30 p-4 sm:p-6 bg-linear-to-t from-zinc-50 dark:from-zinc-950 via-zinc-50/90 dark:via-zinc-950/90 to-transparent pointer-events-none">
                <div className="max-w-4xl mx-auto w-full pointer-events-auto">
                    <div className="glass-panel p-4 rounded-3xl border border-white/20 dark:border-white/5 shadow-2xl bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl flex items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                                <Wallet size={24} />
                            </div>
                            <div>
                                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50 mb-0.5">任务预计总本金</div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-[10px] font-black text-amber-500/70">¥</span>
                                    <span className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-500">
                                        {totals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-6 py-2 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                            <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-40">总件数</div>
                            <div className="text-lg font-black text-zinc-600 dark:text-zinc-300 leading-none">
                                {plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} <span className="text-xs opacity-50">份</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ItemCard({ item, index, onUpdate }: { item: BrushOrderPlanItem; index: number; onUpdate: (id: string, updates: Partial<BrushOrderPlanItem>) => void }) {
    const [prevPrincipal, setPrevPrincipal] = useState(item.principal);
    const [inputValue, setInputValue] = useState(item.principal?.toString() || "");

    if (item.principal !== prevPrincipal) {
        setPrevPrincipal(item.principal);
        setInputValue(item.principal?.toString() || "");
    }

    const handleBlur = () => {
        const newVal = parseFloat(inputValue);
        if (newVal !== item.principal) {
            onUpdate(item.id!, { principal: isNaN(newVal) ? 0 : newVal });
        }
    };

    return (
        <div className={cn(
            "group relative flex flex-col glass-panel rounded-2xl overflow-hidden transition-all duration-500 cursor-default bg-white dark:bg-zinc-900 border shadow-sm hover:shadow-xl",
            item.done 
                ? "border-emerald-500/30 dark:border-emerald-500/20 translate-y-0 opacity-80" 
                : "border-zinc-200 dark:border-white/5 hover:-translate-y-1.5"
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
                            item.done ? "grayscale blur-[2px] scale-105 opacity-40" : "group-hover:scale-110"
                        )} 
                        alt="" 
                        unoptimized 
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                        <Package size={24} />
                    </div>
                )}
                
                {/* Completion Overlay - Enhanced */}
                {item.done && (
                    <div className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                        <div className="relative">
                            {/* Pulse Ring */}
                            <div className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping opacity-75" />
                            <div className="relative bg-emerald-500 text-white p-2.5 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)] scale-110 border-2 border-white/20">
                                <CheckCircle2 size={24} strokeWidth={3} />
                            </div>
                        </div>
                        <div className="mt-4 text-[11px] font-black text-white/90 uppercase tracking-[0.2em] drop-shadow-md">任务已完成</div>
                    </div>
                )}
            </div>

            <div className={cn("flex flex-col gap-1.5 p-2 sm:p-3 transition-opacity duration-500", item.done && "opacity-40 grayscale-[0.5]")}>
                {/* Keyword area - Condensed */}
                <div className="flex items-start gap-1 p-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 font-bold text-[11px] leading-tight w-full border border-zinc-100 dark:border-white/5">
                    <Search size={10} className="shrink-0 mt-px opacity-30" />
                    <span className="line-clamp-1 break-all">{item.searchKeyword || "暂无关键字"}</span>
                </div>

                {/* Principal Input area */}
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-amber-500/5 border border-amber-500/10 focus-within:border-amber-500/30 transition-all">
                    <span className="text-[10px] font-black text-amber-600 dark:text-amber-500/70 ml-1 shrink-0">本金￥</span>
                    <input
                        type="number"
                        placeholder="输入金额"
                        className="w-full bg-transparent border-none outline-none text-[11px] font-black text-amber-600 placeholder:text-amber-500/30 placeholder:font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        readOnly={item.done}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onBlur={handleBlur}
                    />
                </div>
                
                <div className="flex items-center justify-between px-0.5">
                    <div className="flex flex-col min-w-0">
                        <span className="text-[11px] font-black text-foreground truncate max-w-[100px] leading-none">
                            {item.productName || item.product?.name || "未知商品"}
                        </span>
                        {item.product?.sku && (
                            <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-tighter mt-0.5">
                                {item.product.sku}
                            </span>
                        )}
                    </div>
                    
                    <button 
                        onClick={() => onUpdate(item.id!, { done: !item.done })}
                        className={cn(
                            "transition-all active:scale-75 p-1 rounded-full",
                            item.done ? 'text-emerald-500' : 'text-zinc-200 dark:text-zinc-800 hover:text-primary transition-colors'
                        )}
                    >
                        {item.done ? (
                            <CheckCircle2 size={24} fill="currentColor" className="text-emerald-500 fill-white dark:fill-zinc-950 shadow-md" />
                        ) : (
                            <Circle size={24} strokeWidth={2} />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
