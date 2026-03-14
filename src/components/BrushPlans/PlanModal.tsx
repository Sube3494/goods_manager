"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Plus, Trash2, Search, CheckCircle2, Circle } from "lucide-react";
import Image from "next/image";
import { BrushOrderPlan, BrushOrderPlanItem, Product } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "../Purchases/ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<BrushOrderPlan>) => void;
  initialData?: BrushOrderPlan | null;
  readOnly?: boolean;
}

export function PlanModal({ isOpen, onClose, onSubmit, initialData, readOnly = false }: PlanModalProps) {
    const { showToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);

    // Initial state is handle by the useState initializer because parent uses 'key' prop to remount
    const [formData, setFormData] = useState<Partial<BrushOrderPlan>>(() => ({
        id: initialData?.id || "",
        title: initialData?.title || "",
        date: initialData?.date || new Date().toISOString(),
        items: initialData?.items || [],
        note: initialData?.note || "",
        status: initialData?.status || "Draft",
    }));

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    const handleBatchAdd = (selectedProducts: Product[]) => {
        const currentItemProductIds = (formData.items || []).map(item => item.productId);
        const newItems = [...(formData.items || [])];

        selectedProducts.forEach(product => {
            if (!currentItemProductIds.includes(product.id)) {
                newItems.push({
                    productId: product.id,
                    product: product,
                    productName: product.name,
                    quantity: 1,
                    searchKeyword: product.brushKeyword || "",
                    done: false,
                });
            }
        });
        setFormData({ ...formData, items: newItems });
    };

    const removeItem = (index: number) => {
        setFormData({
            ...formData,
            items: (formData.items || []).filter((_, i) => i !== index)
        });
    };

    const updateItem = (index: number, field: keyof BrushOrderPlanItem, value: string | number | boolean) => {
        const newItems = [...(formData.items || [])];
        newItems[index] = { ...newItems[index], [field]: value } as BrushOrderPlanItem;
        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) return;
        
        if (!formData.items || formData.items.length === 0) {
            showToast("请至少添加一个商品安排", "error");
            return;
        }

        const hasEmptyKeyword = formData.items.some(item => !item.searchKeyword || item.searchKeyword.trim() === "");
        if (hasEmptyKeyword) {
            showToast("请填写所有商品的搜索关键词", "error");
            return;
        }

        onSubmit(formData);
    };

    if (!mounted || !isOpen) return null;

    return (
        <>
            {createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                                onClick={onClose}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="fixed left-1/2 top-1/2 z-60 w-[calc(100%-32px)] sm:w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
                            >
                                <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 p-5 sm:p-8">
                                    <div>
                                        <h2 className="text-2xl font-bold">{initialData ? "编辑刷单安排" : "新建刷单安排"}</h2>
                                        <p className="text-xs text-muted-foreground mt-1">规划需要刷单的商品、数量及搜索关键词</p>
                                    </div>
                                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors">
                                        <X size={24} />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-muted-foreground">日期</label>
                                            <DatePicker
                                                value={typeof formData.date === 'string' ? formData.date : formData.date?.toISOString() || ""}
                                                onChange={(val) => setFormData({ ...formData, date: val })}
                                                className="h-12 w-full"
                                                triggerClassName="rounded-full h-full"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-bold flex items-center gap-2">
                                                <Package size={18} className="text-primary" /> 商品安排
                                            </h3>
                                            <button 
                                                type="button" 
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="text-xs sm:text-sm font-bold text-primary flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-all"
                                            >
                                                <Plus size={16} /> 选择商品
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {(formData.items || []).map((item, index) => (
                                                <div key={index} className="group relative flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-2xl border border-border bg-white dark:bg-white/5 hover:border-primary/30 transition-all shadow-sm">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                       <button 
                                                            type="button"
                                                            onClick={() => updateItem(index, 'done', !item.done)}
                                                            className={`shrink-0 transition-colors ${item.done ? 'text-primary' : 'text-muted-foreground/30'}`}
                                                       >
                                                            {item.done ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                                       </button>

                                                        <div className="w-12 h-12 rounded-xl bg-muted border border-border/50 overflow-hidden shrink-0">
                                                            {item.product?.image ? (
                                                                <Image src={item.product.image} width={48} height={48} className="w-full h-full object-cover" alt={item.product.name} unoptimized />
                                                            ) : <div className="w-full h-full flex items-center justify-center"><Package size={20} className="text-muted-foreground/30" /></div>}
                                                        </div>
                                                        
                                                        <div className="flex-1 min-w-0">
                                                            <div className={`font-bold text-sm sm:text-base truncate ${item.done ? 'text-muted-foreground line-through italic opacity-50' : ''}`} title={item.productName || item.product?.name}>
                                                                {item.productName || item.product?.name}
                                                            </div>
                                                            <div className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">{item.product?.sku || "NO SKU"}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                                                        <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-1.5 border border-transparent focus-within:border-primary/20 focus-within:bg-background transition-all">
                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">数量</span>
                                                            <input
                                                                type="number"
                                                                className="w-10 bg-transparent text-sm text-center outline-none font-bold text-foreground"
                                                                value={item.quantity}
                                                                min="1"
                                                                onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                                            />
                                                        </div>

                                                        <div className="relative flex-1 md:w-56">
                                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
                                                                <Search size={14} />
                                                                <span className="text-red-500 font-bold text-xs">*</span>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                placeholder="关键词（必填）..."
                                                                className={`w-full h-10 pl-10 pr-4 rounded-xl border text-sm outline-none transition-all font-medium text-foreground ${
                                                                    !item.searchKeyword || item.searchKeyword.trim() === "" 
                                                                    ? "bg-red-500/5 border-red-500/20 focus:border-red-500/40" 
                                                                    : "bg-muted/50 border-transparent focus:border-primary/20 focus:bg-background"
                                                                }`}
                                                                value={item.searchKeyword || ""}
                                                                onChange={e => updateItem(index, 'searchKeyword', e.target.value)}
                                                                required
                                                            />
                                                        </div>

                                                        <button 
                                                            type="button" 
                                                            onClick={() => removeItem(index)}
                                                            className="p-2 text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all shrink-0"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            {(!formData.items || formData.items.length === 0) && (
                                                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl border-gray-100 dark:border-white/5 text-muted-foreground">
                                                    <Package size={48} className="opacity-10 mb-4" />
                                                    <p className="text-sm font-bold opacity-40">点击右上角“选择商品”开始规划</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-muted-foreground">备注</label>
                                        <textarea
                                            placeholder="补充其他说明..."
                                            className="w-full min-h-[100px] p-4 rounded-3xl border bg-transparent border-gray-200 dark:border-white/10 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                            value={formData.note || ""}
                                            onChange={e => setFormData({ ...formData, note: e.target.value })}
                                        />
                                    </div>
                                </form>

                                <div className="border-t border-gray-100 dark:border-white/10 p-5 sm:p-6 flex items-center justify-end gap-3 sm:gap-4 bg-gray-50/50 dark:bg-white/5">
                                    <button 
                                        type="button" 
                                        onClick={onClose}
                                        className="px-6 py-3 rounded-full font-bold text-muted-foreground hover:text-foreground transition-colors text-sm"
                                    >
                                        取消
                                    </button>
                                    <button 
                                        onClick={handleSubmit}
                                        className="flex-1 sm:flex-none px-10 py-3 rounded-full bg-primary text-primary-foreground font-black shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all text-sm"
                                    >
                                        保存安排
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
            <ProductSelectionModal
                isOpen={isSelectionModalOpen}
                onClose={() => setIsSelectionModalOpen(false)}
                onSelect={handleBatchAdd}
                selectedIds={(formData.items || []).map(i => i.productId!).filter(Boolean)}
            />
        </>
    );
}
