"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Calendar, Share2, Edit2, Trash2, Store, Package, ShieldAlert, RotateCcw, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { PlanModal } from "@/components/BrushPlans/PlanModal";
import { BrushOrderPlan, BrushOrderPlanItem } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";


export default function BrushPlansPage() {
    const { user } = useUser();
    const canManage = hasPermission(user as SessionUser | null, "brush_plan:manage");
    const { showToast } = useToast();
    const [plans, setPlans] = useState<BrushOrderPlan[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<BrushOrderPlan | null>(null);
    const [mounted, setMounted] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterDate, setFilterDate] = useState("");
    const [filterShop, setFilterShop] = useState("");
    const [filterPlatform, setFilterPlatform] = useState("");

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: "danger" | "warning" | "info";
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
    });

    const fetchPlans = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            // Original code had limit=1000, adding it back
            params.append('limit', '1000');
            if (filterShop) params.append('shopName', filterShop);
            if (filterPlatform) params.append('platform', filterPlatform);
            const res = await fetch(`/api/brush-plans?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setPlans(data.items || []);
            }
        } catch (error) {
            console.error("Failed to fetch plans:", error);
            showToast("加载计划失败", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast, filterShop, filterPlatform]); // Added filterShop, filterPlatform to dependencies

    useEffect(() => {
        setMounted(true);
        fetchPlans();
    }, [fetchPlans]);

    const resetFilters = () => {
        setSearchQuery("");
        setFilterDate("");
        setFilterShop("");
        setFilterPlatform("");
    };

    const handleCreate = () => {
        setEditingPlan(null);
        setIsModalOpen(true);
    };

    const handleEdit = (plan: BrushOrderPlan) => {
        setEditingPlan(plan);
        setIsModalOpen(true);
    };

    const handleSave = async (data: Partial<BrushOrderPlan>) => {
        try {
            const isEdit = !!editingPlan;
            const url = isEdit ? `/api/brush-plans/${editingPlan.id}` : "/api/brush-plans";
            const method = isEdit ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });

            if (res.ok) {
                showToast(isEdit ? "计划已更新" : "计划已创建", "success");
                setIsModalOpen(false);
                fetchPlans();
            } else {
                showToast("保存失败", "error");
            }
        } catch {
            showToast("保存失败", "error");
        }
    };

    const handleDelete = (id: string) => {
        setConfirmConfig({
            isOpen: true,
            title: "确认删除",
            message: "确定要删除这条刷单安排吗？删除后不可恢复。",
            variant: "danger",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/brush-plans/${id}`, { method: "DELETE" });
                    if (res.ok) {
                        showToast("删除成功", "success");
                        fetchPlans();
                    }
                } catch {
                    showToast("删除失败", "error");
                }
                setConfirmConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            const matchesSearch = !searchQuery || (
                (p.title && p.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
                p.items.some((i: BrushOrderPlanItem) => i.productName?.toLowerCase().includes(searchQuery.toLowerCase()) || i.product?.name.toLowerCase().includes(searchQuery.toLowerCase()))
            );
            const matchesDate = !filterDate || formatLocalDate(p.date) === filterDate;
            const matchesShop = !filterShop || p.shopName === filterShop;
            const matchesPlatform = !filterPlatform || p.items.some((item: BrushOrderPlanItem) => item.platform === filterPlatform);
            return matchesSearch && matchesDate && matchesShop && matchesPlatform;
        });
    }, [plans, searchQuery, filterDate, filterShop, filterPlatform]);

    if (!mounted) return null;

    if (!canManage && !isLoading && plans.length === 0) {
        return (
            <div className="py-24 text-center">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldAlert size={48} className="text-red-500 opacity-50" />
                </div>
                <h3 className="text-2xl font-black mb-2">暂无访问权限</h3>
                <p className="text-muted-foreground text-sm font-medium">您没有管理刷单安排的权限，请联系管理员分配权限。</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-row items-center justify-between gap-4 mb-6 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">刷单安排表</h1>
                    <p className="text-muted-foreground mt-1 text-[10px] sm:text-sm font-medium truncate">规划及管理刷单任务</p>
                </div>
                {canManage && (
                    <button
                        onClick={handleCreate}
                        className="h-10 sm:h-12 flex items-center gap-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black px-4 sm:px-6 text-xs sm:text-sm font-black shadow-xl hover:-translate-y-0.5 transition-all shrink-0 active:scale-95"
                    >
                        <Plus size={16} />
                        <span className="hidden sm:inline">新建计划</span>
                        <span className="inline sm:hidden">新建</span>
                    </button>
                )}
            </div>

            <div className="flex flex-row flex-wrap items-center gap-2">
                <div className="h-12 px-5 flex-1 min-w-[200px] rounded-full bg-white dark:bg-white/5 border border-border flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜索标题、商品名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-sm font-medium"
                    />
                </div>
                <div className="w-auto flex-1 sm:flex-none sm:w-44 h-12 min-w-[120px]">
                    <DatePicker
                        value={filterDate}
                        onChange={setFilterDate}
                        placeholder="日期筛选"
                        className="h-full w-full"
                        triggerClassName="rounded-full h-full text-sm"
                    />
                </div>
                {user?.shippingAddresses && user.shippingAddresses.length > 0 && (
                    <div className="w-auto flex-1 sm:flex-none sm:w-44 h-12 min-w-[120px]">
                        <CustomSelect
                            options={[
                                { value: "", label: "所有店铺" },
                                ...user.shippingAddresses.map(addr => ({ value: addr.label, label: addr.label }))
                            ]}
                            value={filterShop}
                            onChange={(val) => setFilterShop(val)}
                            className="h-full w-full"
                            triggerClassName="rounded-full h-full text-sm font-medium"
                        />
                    </div>
                )}
                <div className="w-auto flex-1 sm:flex-none sm:w-44 h-12 min-w-[120px]">
                    <CustomSelect
                        options={[
                            { value: "", label: "所有平台" },
                            { value: "美团", label: "美团" },
                            { value: "淘宝", label: "淘宝" },
                            { value: "京东", label: "京东" },
                        ]}
                        value={filterPlatform}
                        onChange={(val) => setFilterPlatform(val)}
                        className="h-full w-full"
                        triggerClassName="rounded-full h-full text-sm font-medium"
                    />
                </div>
                {(searchQuery || filterDate || filterShop || filterPlatform) && (
                    <button
                        onClick={resetFilters}
                        className="h-12 px-5 flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                    >
                        <RotateCcw size={14} /> 重置
                    </button>
                )}
            </div>

            <div className="grid grid-cols-[repeat(auto_fill,minmax(280px,1fr))] gap-5">
                {filteredPlans.map(plan => {
                    const totalItems = plan.items.length;
                    const doneItems = plan.items.filter((i: BrushOrderPlanItem) => i.done).length;
                    const isAllDone = totalItems > 0 && doneItems === totalItems;

                    const totalPrincipal = plan.items.reduce((sum, item) => sum + ((item.principal || 0) * (item.quantity || 1)), 0);

                    return (
                        <div key={plan.id} className="group relative flex flex-col rounded-[24px] sm:rounded-[32px] border border-border bg-white dark:bg-gray-900/60 p-4 sm:p-6 shadow-sm hover:shadow-2xl hover:border-primary/30 transition-all duration-300">
                            {/* Row 1: Date & Actions */}
                            <div className="flex items-start justify-between mb-4 sm:mb-5">
                                <div className="flex items-center gap-3 sm:gap-4">
                                    <div className={cn(
                                        "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-all duration-500 group-hover:rotate-12 shadow-sm border border-transparent",
                                        isAllDone ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20'
                                    )}>
                                        <Calendar className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                            <h3 className="text-lg sm:text-2xl font-black tracking-tight sm:tracking-tighter text-foreground leading-tight truncate">
                                                {formatLocalDate(plan.date)}
                                            </h3>
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full animate-pulse shadow-[0_0_8px]",
                                                    isAllDone ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-500 shadow-amber-500/50"
                                                )} />
                                                <span className={cn(
                                                    "text-[9px] sm:text-[10px] font-black uppercase tracking-widest",
                                                    isAllDone ? "text-emerald-500" : "text-amber-500"
                                                )}>
                                                    {isAllDone ? '已完成' : '进行中'}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-[10px] sm:text-xs font-bold text-muted-foreground/60 uppercase tracking-widest mt-0.5 sm:mt-1">
                                            {plan.items.length} 个订单项
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:translate-x-2 sm:group-hover:translate-x-0 ml-2">
                                    <button 
                                        onClick={() => { 
                                            const shareUrl = `${window.location.origin}/brush-plans/share/${plan.id}`;
                                            navigator.clipboard.writeText(shareUrl).then(() => {
                                                showToast("链接已复制，去发给刷单员吧", "success");
                                            });
                                        }}
                                        className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-muted/60 sm:bg-muted/80 text-foreground hover:bg-primary hover:text-white transition-all shadow-sm"
                                        title="分享链接"
                                    >
                                        <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                    {canManage && (
                                        <>
                                            <button onClick={() => handleEdit(plan)} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-muted/60 sm:bg-muted/80 text-foreground hover:bg-zinc-800 hover:text-white dark:hover:bg-white dark:hover:text-black transition-all shadow-sm">
                                                <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(plan.id)} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-muted/60 sm:bg-muted/80 text-foreground hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Row 2: Metadata Badges (Merged Store, Platforms, Principal) */}
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
                                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-wider">
                                    <Store className="w-2.5 h-2.5 opacity-50" />
                                    <span className="truncate max-w-[80px] sm:max-w-none">{plan.shopName || "通用"}</span>
                                </div>
                                {totalPrincipal > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20 text-[9px] sm:text-[10px] font-black uppercase tracking-wider">
                                        <Wallet className="w-2.5 h-2.5 opacity-70" />
                                        <span>¥{totalPrincipal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                    </div>
                                )}
                                {Array.from(new Set(plan.items.map((i: BrushOrderPlanItem) => i.platform).filter((p): p is string => !!p))).map((platform: string) => {
                                    let platformStyle = "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10";
                                    if (platform === "美团") platformStyle = "bg-[#FFD000]/10 text-[#222222] border-[#FFD000]/20 dark:text-[#FFD000]";
                                    if (platform === "淘宝") platformStyle = "bg-[#FF5000]/10 text-[#FF5000] border-[#FF5000]/20";
                                    if (platform === "京东") platformStyle = "bg-[#E1251B]/10 text-[#E1251B] border-[#E1251B]/20";
                                    
                                    return (
                                        <div key={platform} className={cn("px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-black border", platformStyle)}>
                                            {platform}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Progress Area */}
                            <div className="mt-auto pt-4 sm:pt-6 border-t border-zinc-100 dark:border-white/5 space-y-2 sm:space-y-3">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] sm:text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5 sm:mb-1">完成进度</span>
                                        <div className="flex items-baseline gap-0.5 sm:gap-1">
                                            <span className="text-xl sm:text-2xl font-black text-foreground">{Math.round((doneItems / totalItems) * 100) || 0}</span>
                                            <span className="text-[10px] sm:text-xs font-black text-muted-foreground">%</span>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <span className="text-[9px] sm:text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest mb-0.5 sm:mb-1">商品数</span>
                                        <div className="flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm font-black text-foreground">
                                            <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-20" />
                                            {doneItems} <span className="text-[9px] sm:text-[10px] opacity-20 px-0.5">/</span> <span className="opacity-40">{totalItems}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full h-1.5 sm:h-2 bg-zinc-100 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className={cn(
                                            "h-full transition-all duration-1000 ease-out rounded-full shadow-lg",
                                            isAllDone ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-primary shadow-primary/20'
                                        )}
                                        style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!isLoading && filteredPlans.length === 0 && (
                <div className="py-24 text-center">
                    <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar size={40} className="text-muted-foreground opacity-20" />
                    </div>
                    <h3 className="text-xl font-black mb-2">暂无刷单安排</h3>
                    <p className="text-muted-foreground text-sm font-medium">点击右上角的按钮开始规划第一次刷单任务吧</p>
                </div>
            )}

            {isLoading && (
                <div className="py-24 text-center text-muted-foreground font-medium animate-pulse">
                    加载计算中...
                </div>
            )}

            <PlanModal
                key={isModalOpen ? (editingPlan?.id || "new") : "closed"}
                isOpen={isModalOpen}
                initialData={editingPlan}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSave}
            />

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                variant={confirmConfig.variant}
                onConfirm={confirmConfig.onConfirm}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
