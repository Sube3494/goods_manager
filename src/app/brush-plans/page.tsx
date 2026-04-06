"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Calendar, Share2, Edit2, Trash2, ShieldAlert, RotateCcw, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn, copyToClipboard } from "@/lib/utils";
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
    const canManage = hasPermission(user as SessionUser | null, "brush:manage");
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
        <div className="space-y-6 sm:space-y-8">
            <div className="mb-5 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <Link
                        href="/brush"
                        className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground dark:bg-white/5"
                    >
                        <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
                        <span>返回刷单中心</span>
                    </Link>
                    <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">刷单安排表</h1>
                    <p className="text-muted-foreground mt-1 text-[10px] sm:text-sm font-medium truncate">规划及管理刷单任务</p>
                </div>
                {canManage && (
                    <button
                        onClick={handleCreate}
                        className="h-11 sm:h-12 w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black px-4 sm:px-6 text-xs sm:text-sm font-black shadow-xl hover:-translate-y-0.5 transition-all shrink-0 active:scale-95"
                    >
                        <Plus size={16} />
                        <span className="hidden sm:inline">新建计划</span>
                        <span className="inline sm:hidden">新建</span>
                    </button>
                )}
            </div>

            <div className="space-y-3">
                <div className="h-12 px-5 min-w-0 rounded-full bg-white dark:bg-white/5 border border-border flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜索标题、商品名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-sm font-medium"
                    />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
                    <div className="h-12 min-w-0">
                        <DatePicker
                            value={filterDate}
                            onChange={setFilterDate}
                            placeholder="日期筛选"
                            className="h-full w-full"
                            triggerClassName="rounded-full h-full text-sm"
                        />
                    </div>
                    {user?.shippingAddresses && user.shippingAddresses.length > 0 && (
                        <div className="h-12 min-w-0">
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
                    <div className="h-12 min-w-0">
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
                            className="h-12 px-5 flex items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                        >
                            <RotateCcw size={14} /> 重置
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredPlans.map(plan => {
                    const platforms = Array.from(new Set(plan.items.map((i: BrushOrderPlanItem) => i.platform).filter((p): p is string => !!p)));

                    return (
                        <div key={plan.id} className="group relative flex flex-col rounded-[20px] sm:rounded-[24px] border border-border bg-white dark:bg-gray-900/60 p-3.5 sm:p-4 shadow-sm hover:border-primary/25 hover:shadow-xl transition-all duration-300">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 shadow-sm border border-transparent",
                                        "bg-primary/10 text-primary border-primary/20"
                                    )}>
                                        <Calendar className="w-5 h-5" strokeWidth={2} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base sm:text-lg font-black tracking-tight text-foreground leading-tight truncate">
                                                {plan.shopName || "通用店铺"}
                                            </h3>
                                            <span className="text-xs font-bold text-muted-foreground">·</span>
                                            <span className="text-sm font-bold text-muted-foreground">
                                                {formatLocalDate(plan.date)}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] font-bold text-muted-foreground">
                                                {plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} 份任务
                                            </span>
                                            <span className="text-[11px] font-bold text-muted-foreground/50">·</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {platforms.map((platform: string) => {
                                                    let platformStyle = "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:border-white/10";
                                                    if (platform === "美团") platformStyle = "bg-[#FFD000]/10 text-[#222222] border-[#FFD000]/20 dark:text-[#FFD000]";
                                                    if (platform === "淘宝") platformStyle = "bg-[#FF5000]/10 text-[#FF5000] border-[#FF5000]/20";
                                                    if (platform === "京东") platformStyle = "bg-[#E1251B]/10 text-[#E1251B] border-[#E1251B]/20";
                                                    
                                                    return (
                                                        <div key={platform} className={cn("px-2 py-0.5 rounded-lg text-[10px] font-black border", platformStyle)}>
                                                            {platform}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                                    <button 
                                        onClick={() => { 
                                            const shareUrl = `${window.location.origin}/brush-plans/share/${plan.id}`;
                                            copyToClipboard(shareUrl).then((success) => {
                                                if (success) showToast("链接已复制，去发给刷单员吧", "success");
                                                else showToast("复制失败，请尝试长按并手动复制", "error");
                                            });
                                        }}
                                        className="p-2 rounded-xl bg-muted/70 text-foreground hover:bg-primary hover:text-white dark:hover:bg-white dark:hover:text-zinc-950 transition-all shadow-sm"
                                        title="分享链接"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>
                                    {canManage && (
                                        <>
                                            <button onClick={() => handleEdit(plan)} className="p-2 rounded-xl bg-muted/70 text-foreground hover:bg-zinc-800 hover:text-white dark:hover:bg-white dark:hover:text-black transition-all shadow-sm">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(plan.id)} className="p-2 rounded-xl bg-muted/70 text-foreground hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
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
