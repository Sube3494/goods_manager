"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Search, Package, Calendar, CheckCircle2, Circle } from "lucide-react";
import Image from "next/image";
import { formatLocalDate } from "@/lib/dateUtils";
import { BrushOrderPlan, BrushOrderPlanItem } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export default function SharedPlanPage() {
    const params = useParams();
    const id = params.id as string;
    const { showToast } = useToast();
    const [plan, setPlan] = useState<BrushOrderPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
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
                } else {
                    setError(true);
                }
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchSharedPlan();
    }, [id]);

    const handleToggle = async (itemId: string, currentDone: boolean) => {
        if (!plan) return;

        const newDone = !currentDone;
        
        // 乐观更新
        setPlan({
            ...plan,
            items: plan.items.map(item => 
                item.id === itemId ? { ...item, done: newDone } : item
            )
        });

        try {
            const res = await fetch(`/api/brush-plans/public/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId, done: newDone })
            });

            if (!res.ok) {
                // 如果失败则回滚
                setPlan(plan);
                if (res.status === 410) {
                    setIsExpired(true);
                    showToast("链接已过期，操作无法保存", "error");
                } else if (res.status === 401) {
                    showToast("操作未授权，请尝试刷新页面", "error");
                } else {
                    showToast("操作失败，请稍后重试", "error");
                }
            } else {
                showToast(newDone ? "已标记为完成" : "已取消完成标记", "success");
            }
        } catch (err) {
            console.error('Failed to toggle item:', err);
            setPlan(plan);
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
            <p className="text-muted-foreground text-sm max-w-xs">为保证数据安全，分享链接已超过 12 小时有效期感。请联系创建者重新生成分享链接。</p>
        </div>
    );

    if (error || !plan) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-red-100 flex items-center justify-center text-red-500 mb-4 opacity-70">
                <Package size={32} />
            </div>
            <h1 className="text-xl font-black mb-2">未找到该分享计划</h1>
            <p className="text-muted-foreground text-sm">链接可能已过期或计划已被创建者删除</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col no-scrollbar">
            {/* Optimized Shared Header */}
            <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-white/5 p-4 sm:p-6">
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

            {/* Gallery Grid */}
            <main className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 pb-20">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
                    {plan.items.map((item: BrushOrderPlanItem, index: number) => (
                        <div key={index} className="group relative flex flex-col glass-panel rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1.5 cursor-default">
                            <div className="relative aspect-4/3 w-full bg-secondary/30 overflow-hidden">
                                <div className="absolute top-2 left-2 z-10 px-2.5 py-0.5 rounded-lg bg-black/40 backdrop-blur-md text-white text-[12px] font-black shadow-sm flex items-center justify-center pointer-events-none">
                                    #{index + 1}
                                </div>
                                {item.product?.image ? (
                                    <Image 
                                        src={item.product.image.startsWith('http') || item.product.image.startsWith('/') 
                                            ? item.product.image 
                                            : `/api/uploads/${item.product.image.replace(/^\/?uploads\//, '')}`} 
                                        fill 
                                        className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out" 
                                        alt="" 
                                        unoptimized 
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                                        <Package size={28} />
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 p-3 sm:p-4">
                                <div className="flex items-start gap-1 p-2 rounded-lg bg-emerald-500/5 text-emerald-600 font-black text-[12px] leading-snug w-full">
                                    <Search size={12} className="shrink-0 mt-[2px]" />
                                    <span className="line-clamp-2 break-all">{item.searchKeyword || "暂无关键字"}</span>
                                </div>
                                <div className="flex items-center justify-between mt-1 pl-1">
                                    <span className="text-zinc-500 text-[12px] font-black">x{item.quantity}</span>
                                    <button 
                                        onClick={() => handleToggle(item.id!, !!item.done)}
                                        className={`transition-all active:scale-90 p-1 -m-1 rounded-full ${
                                            item.done ? 'text-emerald-500' : 'text-zinc-300 hover:text-zinc-400'
                                        }`}
                                    >
                                        {item.done ? <CheckCircle2 size={20} fill="currentColor" className="text-emerald-500 fill-white dark:fill-zinc-900" /> : <Circle size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
