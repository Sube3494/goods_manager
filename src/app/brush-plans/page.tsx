"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Calendar, Share2, Edit2, Trash2, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PlanModal } from "@/components/BrushPlans/PlanModal";
import { BrushOrderPlan } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";


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
            const res = await fetch("/api/brush-plans?limit=1000");
            if (res.ok) {
                const data = await res.json();
                setPlans(data.data || []);
            }
        } catch {
            console.error("Failed to fetch plans");
            showToast("加载计划失败", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        setMounted(true);
        fetchPlans();
    }, [fetchPlans]);

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
                p.items.some(i => i.productName?.toLowerCase().includes(searchQuery.toLowerCase()) || i.product?.name.toLowerCase().includes(searchQuery.toLowerCase()))
            );
            const matchesDate = !filterDate || formatLocalDate(p.date) === filterDate;
            return matchesSearch && matchesDate;
        });
    }, [plans, searchQuery, filterDate]);

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

            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
                <div className="h-12 px-5 flex-1 w-full rounded-full bg-white dark:bg-white/5 border border-border flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                    <Search size={18} className="text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="搜索标题、商品名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-sm font-medium"
                    />
                </div>
                <div className="w-full sm:w-44 h-12">
                    <DatePicker
                        value={filterDate}
                        onChange={setFilterDate}
                        placeholder="日期筛选"
                        className="h-full w-full"
                        triggerClassName="rounded-full h-full text-sm"
                    />
                </div>
                {(searchQuery || filterDate) && (
                    <button 
                        onClick={() => { setSearchQuery(""); setFilterDate(""); }}
                        className="h-12 w-12 flex items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:text-foreground transition-all active:-rotate-45"
                    >
                        <RotateCcw size={18} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-[repeat(auto_fill,minmax(280px,1fr))] gap-5">
                {filteredPlans.map(plan => {
                    const totalItems = plan.items.length;
                    const doneItems = plan.items.filter(i => i.done).length;
                    const isAllDone = totalItems > 0 && doneItems === totalItems;

                    return (
                        <div key={plan.id} className="group relative flex flex-col rounded-[24px] border border-border bg-white dark:bg-gray-900/40 p-4 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all">
                            {/* Header Info */}
                                <div className="flex flex-wrap items-center justify-between gap-y-3 mb-3">
                                    <div className="flex items-center gap-3 text-left min-w-0">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${isAllDone ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'}`}>
                                            <Calendar size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-base sm:text-lg font-black tracking-tight truncate">{formatLocalDate(plan.date)}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                                    isAllDone ? 'bg-emerald-500/10 text-emerald-500' :
                                                    'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                    {isAllDone ? '已完成' : '进行中'}
                                                </div>
                                                <span className="text-[9px] font-bold text-muted-foreground opacity-50 uppercase shrink-0">{doneItems} / {totalItems}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity ml-auto sm:ml-0">
                                        <button 
                                            onClick={() => { 
                                                const shareUrl = `${window.location.origin}/brush-plans/share/${plan.id}`;
                                                navigator.clipboard.writeText(shareUrl).then(() => {
                                                    showToast("链接已复制，去发给刷单员吧", "success");
                                                });
                                            }}
                                            className="p-2 rounded-xl bg-primary/5 text-primary hover:bg-primary/10 transition-all font-bold text-[10px] flex items-center gap-1.5"
                                            title="复制分享链接"
                                        >
                                            <Share2 size={13} />
                                            <span>分享</span>
                                        </button>
                                        {canManage && (
                                            <>
                                                <button onClick={() => handleEdit(plan)} className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                                                    <Edit2 size={15} />
                                                </button>
                                                <button onClick={() => handleDelete(plan.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all">
                                                    <Trash2 size={14} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                            {/* Progress Footer */}
                            <div className="pt-3 border-t border-zinc-100 dark:border-white/5">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-[10px] font-black text-muted-foreground uppercase opacity-50">完成度 {Math.round((doneItems / totalItems) * 100) || 0}%</span>
                                    <span className="text-sm font-black text-foreground">
                                            {doneItems} <span className="text-[10px] opacity-30 text-muted-foreground">/ {totalItems}</span>
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-700 ease-out rounded-full ${isAllDone ? 'bg-emerald-500' : 'bg-primary'}`}
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
