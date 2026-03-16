"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Plus, Trash2, Search, CheckCircle2, Circle, Store, ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import Image from "next/image";
import { BrushOrderPlan, BrushOrderPlanItem, Product, AddressItem } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProductSelectionModal } from "../Purchases/ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<BrushOrderPlan>) => void;
  initialData?: BrushOrderPlan | null;
  readOnly?: boolean;
}

const PLATFORMS = ["美团", "淘宝", "京东"];

export function PlanModal({ isOpen, onClose, onSubmit, initialData, readOnly = false }: PlanModalProps) {
    const { showToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);

    const { user } = useUser();
    const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
        "美团": true,
        "淘宝": true,
        "京东": true,
        "其他": true
    });

    // Initial state
    const [formData, setFormData] = useState<Partial<BrushOrderPlan>>(() => ({
        id: initialData?.id || "",
        title: initialData?.title || "",
        shopName: initialData?.shopName || "",
        date: initialData?.date || new Date().toISOString(),
        items: initialData?.items || [],
        note: initialData?.note || "",
        status: initialData?.status || "Draft",
    }));

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    // 默认选择第一个店铺
    useEffect(() => {
        if (!initialData && !formData.shopName && user?.shippingAddresses && user.shippingAddresses.length > 0) {
            // 使用 setTimeout 避免同步触发 cascading renders 警告
            const timeoutId = setTimeout(() => {
                setFormData((prev: Partial<BrushOrderPlan>) => ({ 
                    ...prev, 
                    shopName: user.shippingAddresses![0].label
                }));
            }, 0);
            return () => clearTimeout(timeoutId);
        }
    }, [user, initialData, formData.shopName]);

    const handleBatchAdd = (selectedProducts: Product[], platform: string) => {
        const newItems = [...(formData.items || [])];

        selectedProducts.forEach(product => {
            const platformKey = platform || "美团";
            const isDuplicate = (formData.items || []).some(
                (item: BrushOrderPlanItem) => item.productId === product.id && (item.platform || "美团") === platformKey
            );
            
            if (!isDuplicate) {
                newItems.push({
                    productId: product.id,
                    product: product,
                    productName: product.name,
                    quantity: 1,
                    searchKeyword: product.brushKeyword || "",
                    platform: platform || "美团",
                    done: false,
                });
            }
        });
        setFormData({ ...formData, items: newItems });
    };

    const removeItem = (index: number) => {
        setFormData({
            ...formData,
            items: (formData.items || []).filter((_: BrushOrderPlanItem, i: number) => i !== index)
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
        
        const hasEmptyKeyword = (formData.items || []).some((item: BrushOrderPlanItem) => !item.searchKeyword || item.searchKeyword.trim() === "");
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
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-500 flex items-center gap-1.5 pl-1">
                                                <Circle size={10} className="text-primary/50" /> 日期
                                            </label>
                                            <DatePicker
                                                value={formData.date || ""}
                                                onChange={(val) => setFormData({ ...formData, date: val })}
                                                className="h-11 w-full"
                                                triggerClassName="rounded-xl h-full font-medium"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-500 flex items-center gap-1.5 pl-1">
                                                <Store size={14} className="text-primary/50" /> 所属店铺
                                            </label>
                                            <CustomSelect
                                                options={[
                                                    ...(user?.shippingAddresses?.map((addr: AddressItem) => ({
                                                        value: addr.label,
                                                        label: addr.label
                                                    })) || [])
                                                ]}
                                                value={formData.shopName || ""}
                                                onChange={(val) => setFormData({ ...formData, shopName: val })}
                                                className="h-11 w-full"
                                                triggerClassName="rounded-xl h-full font-medium"
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

                                        <div className="space-y-6">
                                            {PLATFORMS.concat("其他").map(platform => {
                                                const platformItems = (formData.items || []).filter((item: BrushOrderPlanItem) => {
                                                    const itemPlatform = item.platform || "美团";
                                                    if (platform === "其他") {
                                                        return !PLATFORMS.includes(itemPlatform);
                                                    }
                                                    return itemPlatform === platform;
                                                });
                                                
                                                if (platformItems.length === 0) return null;
                                                
                                                const isExpanded = expandedPlatforms[platform] !== false;
                                                
                                                return (
                                                    <div key={platform} className="space-y-3">
                                                        <div 
                                                            onClick={() => setExpandedPlatforms(prev => ({ ...prev, [platform]: !isExpanded }))}
                                                            className="flex items-center justify-between w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border border-gray-100 dark:border-white/5 cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isExpanded ? <ChevronDown size={18} className="text-muted-foreground" /> : <ChevronRight size={18} className="text-muted-foreground" />}
                                                                <LayoutGrid size={16} className="text-primary" />
                                                                <span className="font-bold text-sm">{platform}</span>
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{platformItems.length}</span>
                                                            </div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div className="space-y-4 pl-0 sm:pl-4">
                                                                {platformItems.map((item: BrushOrderPlanItem) => {
                                                                    // Find the original index in formData.items
                                                                    const originalIndex = (formData.items || []).findIndex(i => i === item);
                                                                    return (
                                                                            <div key={`${platform}-${originalIndex}`} className="flex flex-col gap-2.5 p-3 sm:p-4 rounded-[20px] sm:rounded-[24px] border border-border bg-white dark:bg-white/5 hover:border-primary/30 transition-all shadow-sm">
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <button 
                                                                                        type="button"
                                                                                        onClick={() => updateItem(originalIndex, 'done', !item.done)}
                                                                                        className={`shrink-0 transition-colors ${item.done ? 'text-primary' : 'text-muted-foreground/30'}`}
                                                                                    >
                                                                                        {item.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                                                                    </button>
 
                                                                                    <div className="w-10 h-10 rounded-lg bg-muted border border-border/50 overflow-hidden shrink-0">
                                                                                        {item.product?.image ? (
                                                                                            <Image src={item.product.image} width={40} height={40} className="w-full h-full object-cover" alt={item.product.name} unoptimized />
                                                                                        ) : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-muted-foreground/30" /></div>}
                                                                                    </div>
                                                                                    
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className={`font-bold text-[13px] sm:text-sm truncate ${item.done ? 'text-muted-foreground line-through italic opacity-50' : ''}`} title={item.productName || item.product?.name}>
                                                                                            {item.productName || item.product?.name}
                                                                                        </div>
                                                                                        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">{item.product?.sku || "NO SKU"}</div>
                                                                                    </div>
 
                                                                                    <button 
                                                                                        type="button" 
                                                                                        onClick={() => removeItem(originalIndex)}
                                                                                        className="p-1.5 text-muted-foreground/30 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all shrink-0"
                                                                                    >
                                                                                        <Trash2 size={16} />
                                                                                    </button>
                                                                                </div>
 
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="flex items-center gap-2 bg-muted/30 dark:bg-white/5 rounded-lg px-2 h-9 border border-transparent focus-within:border-primary/20 focus-within:bg-background transition-all w-[70px] shrink-0">
                                                                                        <span className="text-[9px] font-black text-muted-foreground uppercase opacity-40 shrink-0">份</span>
                                                                                        <input
                                                                                            type="number"
                                                                                            className="w-full bg-transparent text-xs text-center outline-none font-black text-foreground"
                                                                                            value={item.quantity}
                                                                                            min="1"
                                                                                            onChange={e => updateItem(originalIndex, 'quantity', parseInt(e.target.value) || 1)}
                                                                                        />
                                                                                    </div>
 
                                                                                    <div className="relative flex-1 flex items-center h-9">
                                                                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground pointer-events-none opacity-40">
                                                                                            <Search size={12} />
                                                                                            <span className="text-red-500 font-bold text-[10px]">*</span>
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="关键词..."
                                                                                            className={`w-full h-full pl-8 pr-3 rounded-lg border text-[12px] outline-none transition-all font-bold text-foreground ${
                                                                                                !item.searchKeyword || item.searchKeyword.trim() === "" 
                                                                                                ? "bg-red-500/5 border-red-500/20 focus:border-red-500/40" 
                                                                                                : "bg-muted/30 dark:bg-white/5 border-transparent focus:border-primary/20 focus:bg-background"
                                                                                            }`}
                                                                                            value={item.searchKeyword || ""}
                                                                                            onChange={e => updateItem(originalIndex, 'searchKeyword', e.target.value)}
                                                                                            required
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

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
                onSelect={(products, platform) => handleBatchAdd(products, platform)}
                selectedIds={(formData.items || []).map(i => i.productId!).filter(Boolean)}
            />
        </>
    );
}
