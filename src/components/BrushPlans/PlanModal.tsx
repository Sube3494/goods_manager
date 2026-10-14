"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Plus, Trash2, Search, Circle, Store, ChevronDown, ChevronRight, LayoutGrid, Copy, ArrowUp, ArrowDown } from "lucide-react";
import Image from "next/image";
import { BrushOrderPlan, BrushOrderPlanItem, Product, AddressItem } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProductSelectionModal } from "../Purchases/ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { isAddressDisabled } from "@/lib/addressBook";
import { reorderBrushPlanItems, type PlanSortTarget } from "@/lib/brushPlanSort";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<BrushOrderPlan>) => void;
  initialData?: BrushOrderPlan | null;
  readOnly?: boolean;
}

const PLATFORMS = ["美团", "淘宝", "京东"];
type BrushSelectableProduct = Product & { brushKeyword?: string };

export function PlanModal({ isOpen, onClose, onSubmit, initialData, readOnly = false }: PlanModalProps) {
    const { showToast } = useToast();
    const [mounted, setMounted] = useState(false);
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [draggingItem, setDraggingItem] = useState<PlanSortTarget | null>(null);
    const [dropTarget, setDropTarget] = useState<PlanSortTarget | null>(null);
    const clearDrag = () => {
        setDraggingItem(null);
        setDropTarget(null);
    };

    const handleItemDrop = (target: PlanSortTarget, source = draggingItem) => {
        if (readOnly || !source || source.platform !== target.platform) {
            clearDrag();
            return;
        }
        const items = formData.items || [];
        const platformItems = items.filter(item => {
            const platform = item.platform || "美团";
            return target.platform === "其他" ? !PLATFORMS.includes(platform) : platform === target.platform;
        });
        const visibleIndexes = groupItemsByOrder(platformItems, items).flatMap(group => group.items.map(entry => entry.originalIndex));
        const after = visibleIndexes.indexOf(source.id) < visibleIndexes.indexOf(target.id);
        setFormData(prev => ({ ...prev, items: reorderBrushPlanItems(prev.items || [], source, target, after) }));
        clearDrag();
    };

    const moveItemByButton = (index: number, platform: string, direction: -1 | 1) => {
        if (readOnly) return;
        setFormData(prev => {
            const items = prev.items || [];
            const platformItems = items.filter(item => {
                const itemPlatform = item.platform || "美团";
                return platform === "其他" ? !PLATFORMS.includes(itemPlatform) : itemPlatform === platform;
            });
            const visibleIndexes = groupItemsByOrder(platformItems, items).flatMap(group => group.items.map(entry => entry.originalIndex));
            const targetIndex = visibleIndexes[visibleIndexes.indexOf(index) + direction];
            if (targetIndex === undefined) return prev;
            return { ...prev, items: reorderBrushPlanItems(items,
                { kind: "item", platform, id: index }, { kind: "item", platform, id: targetIndex }, direction === 1) };
        });
    };

    const { user } = useUser();
    const activeShippingAddresses = useMemo(
        () => (user?.shippingAddresses || []).filter((address: AddressItem) => !isAddressDisabled(address)),
        [user?.shippingAddresses]
    );
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

    const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
        "美团": true,
        "淘宝": true,
        "京东": true,
        "其他": true
    });

    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 0);
        return () => clearTimeout(timer);
    }, []);

    // 默认选择第一个店铺
    useEffect(() => {
        if (!initialData && !formData.shopName && activeShippingAddresses.length > 0) {
            // 使用 setTimeout 避免同步触发 cascading renders 警告
            const timeoutId = setTimeout(() => {
                setFormData((prev: Partial<BrushOrderPlan>) => ({ 
                    ...prev, 
                    shopName: activeShippingAddresses[0].label
                }));
            }, 0);
            return () => clearTimeout(timeoutId);
        }
    }, [activeShippingAddresses, initialData, formData.shopName]);

    const handleBatchAdd = (selectedProducts: Product[], platform: string) => {
        setFormData(prev => {
            const newItems = [...(prev.items || [])];
            let maxGroup = newItems.reduce((max, item, index) => Math.max(max, item.orderGroup || index + 1), 0);
            selectedProducts.forEach(product => {
                const brushProduct = product as BrushSelectableProduct;
                newItems.push({
                    productId: product.id,
                    product: product,
                    productName: product.name,
                    quantity: 1,
                    searchKeyword: brushProduct.brushKeyword || "",
                    platform: platform || "美团",
                    done: false,
                    orderGroup: ++maxGroup,
                });
            });
            return { ...prev, items: newItems };
        });
    };

    const duplicateItem = (index: number) => {
        setFormData(prev => {
            const items: BrushOrderPlanItem[] = (prev.items || []).map((entry, entryIndex) => ({
                ...entry,
                orderGroup: entry.orderGroup || entryIndex + 1,
            }));
            const item = items[index];
            if (!item) return prev;
            const maxGroup = items.reduce((max, entry, entryIndex) => Math.max(max, entry.orderGroup || entryIndex + 1), 0);
            const orderStartIndex = items.findIndex(entry =>
                entry.orderGroup === item.orderGroup && (entry.platform || "美团") === (item.platform || "美团")
            );
            const duplicate: BrushOrderPlanItem = {
                ...item,
                id: undefined,
                planId: undefined,
                sortOrder: undefined,
                done: false,
                orderGroup: maxGroup + 1,
            };
            // 按订单首次出现的位置插入，组合商品仍归在原单，新单紧随其后。
            items.splice(orderStartIndex + 1, 0, duplicate);
            return { ...prev, items };
        });
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

    const getItemOrderGroup = (item: BrushOrderPlanItem, index: number) => item.orderGroup || index + 1;

    const updateOrderGroup = (index: number, orderGroup: number) => {
        const newItems = [...(formData.items || [])];
        newItems[index] = { ...newItems[index], orderGroup };
        setFormData({ ...formData, items: newItems });
    };

    const splitToNewOrder = (index: number) => {
        const items = formData.items || [];
        const maxGroup = items.reduce((max, item, itemIndex) => Math.max(max, getItemOrderGroup(item, itemIndex)), 0);
        updateOrderGroup(index, maxGroup + 1);
    };

    const normalizeQuantity = (value: unknown) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

        const normalizedItems = (formData.items || []).map((item: BrushOrderPlanItem, index) => ({
            ...item,
            quantity: normalizeQuantity(item.quantity),
            orderGroup: getItemOrderGroup(item, index),
            sortOrder: index,
        }));
        if (normalizedItems.some((item) => item.quantity === null)) {
            showToast("请填写有效的商品份数", "error");
            return;
        }

        onSubmit({
            ...formData,
            items: normalizedItems.map((item) => ({
                ...item,
                quantity: item.quantity as number,
            })),
        });
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
                                className="fixed left-1/2 top-1/2 z-60 w-[calc(100%-16px)] sm:w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-safe-modal"
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

                                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
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
                                                    ...(activeShippingAddresses.map((addr: AddressItem) => ({
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
                                        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                                            <h3 className="font-bold flex items-center gap-2">
                                                <Package size={18} className="text-primary" /> 商品安排
                                            </h3>
                                            <button 
                                                type="button" 
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="text-xs sm:text-sm font-bold text-primary flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/10 hover:bg-primary/20 transition-all"
                                            >
                                                <Plus size={16} /> 从刷单商品库选择
                                            </button>
                                        </div>

                                        {!readOnly && (formData.items?.length || 0) > 1 && (
                                            <p className="text-xs text-muted-foreground"><span className="sm:hidden">点击商品下方的上移、下移按钮调整顺序</span><span className="hidden sm:inline">拖动商品左侧的 :: 调整顺序</span></p>
                                        )}

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
                                                const groupedOrders = groupItemsByOrder(platformItems, formData.items || []);
                                                const visibleIndexes = groupedOrders.flatMap(group => group.items.map(entry => entry.originalIndex));
                                                
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
                                                                {groupedOrders.map((orderGroup, orderIndex) => (
                                                                    <div key={`${platform}-order-${orderGroup.group}`} className="rounded-[22px] border border-primary/10 bg-primary/[0.03] p-2 sm:p-3 dark:bg-white/[0.03]">
                                                                        <div className="mb-3 flex items-center justify-between gap-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-600 dark:text-emerald-400">第 {orderIndex + 1} 单</span>
                                                                                {orderGroup.items.length > 1 ? (
                                                                                    <span className="text-[11px] font-black text-muted-foreground">{orderGroup.items.length} 种商品</span>
                                                                                ) : null}
                                                                            </div>
                                                                        </div>
                                                                        <div className="space-y-2.5">
                                                                            {orderGroup.items.map(({ item, originalIndex }) => {
                                                                                const isFirstInOrder = orderGroup.items[0]?.originalIndex === originalIndex;
                                                                                const canMergeToPreviousOrder = isFirstInOrder && orderIndex > 0;
                                                                                const canSplitOrder = !readOnly && orderGroup.items.length > 1;
                                                                                return (
                                                                            <div
                                                                                key={`${platform}-${originalIndex}`}
                                                                                data-sort-item={originalIndex}
                                                                                data-sort-platform={platform}
                                                                                onDragOver={event => {
                                                                                    if (readOnly || draggingItem?.platform !== platform || draggingItem.id === originalIndex) return;
                                                                                    event.preventDefault();
                                                                                    event.dataTransfer.dropEffect = "move";
                                                                                    setDropTarget({ kind: "item", platform, id: originalIndex });
                                                                                }}
                                                                                onDragLeave={event => {
                                                                                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
                                                                                }}
                                                                                onDrop={event => {
                                                                                    event.preventDefault();
                                                                                    handleItemDrop({ kind: "item", platform, id: originalIndex });
                                                                                }}
                                                                                className={`flex flex-col gap-2.5 p-3 sm:p-4 rounded-[18px] border bg-white dark:bg-white/5 transition-colors shadow-sm ${
                                                                                    dropTarget?.platform === platform && dropTarget.id === originalIndex ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                                                                                } ${draggingItem?.platform === platform && draggingItem.id === originalIndex ? "opacity-60" : ""}`}
                                                                            >
                                                                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                                                                    {!readOnly && (
                                                                                        <button
                                                                                            type="button"
                                                                                            draggable
                                                                                            onDragStart={event => {
                                                                                                event.dataTransfer.effectAllowed = "move";
                                                                                                event.dataTransfer.setData("text/plain", String(originalIndex));
                                                                                                const card = event.currentTarget.closest<HTMLElement>("[data-sort-item]");
                                                                                                if (card) {
                                                                                                    const bounds = card.getBoundingClientRect();
                                                                                                    event.dataTransfer.setDragImage(card, event.clientX - bounds.left, event.clientY - bounds.top);
                                                                                                }
                                                                                                setDraggingItem({ kind: "item", platform, id: originalIndex });
                                                                                            }}
                                                                                            onDragEnd={clearDrag}
                                                                                            className="hidden sm:inline-flex sm:items-center sm:justify-center select-none h-8 w-6 shrink-0 cursor-grab rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
                                                                                            title="拖动调整商品顺序"
                                                                                            aria-label={`拖动调整${item.productName || item.product?.name || "商品"}顺序`}
                                                                                        >
                                                                                            ::
                                                                                        </button>
                                                                                    )}
                                                                                    <div className="w-10 h-10 rounded-lg bg-muted border border-border/50 overflow-hidden shrink-0">
                                                                                        {item.product?.image ? (
                                                                                            <Image src={item.product.image} width={40} height={40} className="w-full h-full object-cover" alt={item.product.name} unoptimized />
                                                                                        ) : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-muted-foreground/30" /></div>}
                                                                                    </div>
                                                                                    
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <div className="font-bold text-[13px] sm:text-sm truncate" title={item.productName || item.product?.name}>
                                                                                            {item.productName || item.product?.name}
                                                                                        </div>
                                                                                        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-wider">{item.product?.sku || "NO SKU"}</div>
                                                                                    </div>

                                                                                    <div className="contents sm:flex sm:items-center sm:gap-1 sm:shrink-0">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => duplicateItem(originalIndex)}
                                                                                            className="inline-flex h-11 w-11 sm:h-8 sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-lg sm:px-2.5 text-xs sm:text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                                                                                            title="复制商品为新的一单"
                                                                                            aria-label="复制商品"
                                                                                        >
                                                                                            <Copy size={14} /><span className="hidden sm:inline">复制</span>
                                                                                        </button>
                                                                                        {canMergeToPreviousOrder && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => {
                                                                                                    const previousGroupItems = groupItemsByOrder(platformItems, formData.items || [])[orderIndex - 1]?.items || [];
                                                                                                    const previousItem = previousGroupItems[0];
                                                                                                    if (previousItem) {
                                                                                                        updateOrderGroup(originalIndex, getItemOrderGroup(previousItem.item, previousItem.originalIndex));
                                                                                                    }
                                                                                                }}
                                                                                                className="hidden sm:inline-flex h-8 items-center px-2 text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors whitespace-nowrap"
                                                                                                title="合并到上一单"
                                                                                            >
                                                                                                合并到上一单
                                                                                            </button>
                                                                                        )}
                                                                                        {canSplitOrder && (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => splitToNewOrder(originalIndex)}
                                                                                                className="hidden sm:inline-flex h-8 items-center px-2 text-[10px] font-bold text-muted-foreground bg-muted/60 hover:bg-muted rounded-lg transition-colors whitespace-nowrap"
                                                                                                title="拆成单独一单"
                                                                                            >
                                                                                                拆单
                                                                                            </button>
                                                                                        )}
                                                                                    <button 
                                                                                        type="button" 
                                                                                        onClick={() => removeItem(originalIndex)}
                                                                                        className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                                                                        aria-label="删除商品"
                                                                                    >
                                                                                        <Trash2 size={16} />
                                                                                    </button>
                                                                                    </div>
                                                                                </div>
 
                                                                                <div className="flex flex-row items-center gap-2">
                                                                                    <div className="flex items-center gap-1.5 bg-muted/30 dark:bg-white/5 rounded-lg px-2 h-11 sm:h-9 border border-transparent focus-within:border-primary/20 focus-within:bg-background transition-all w-[65px] shrink-0">
                                                                                        <span className="text-[9px] font-black text-muted-foreground uppercase opacity-40 shrink-0">份</span>
                                                                                        <input
                                                                                            type="number"
                                                                                            className="w-full bg-transparent text-base sm:text-xs text-center outline-none font-black text-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                                            value={item.quantity ?? ""}
                                                                                            min="1"
                                                                                            onChange={e => {
                                                                                                const value = e.target.value;
                                                                                                updateItem(originalIndex, 'quantity', value === "" ? "" : Math.max(1, parseInt(value, 10) || 1));
                                                                                            }}
                                                                                        />
                                                                                    </div>
 
                                                                                    <div className="relative min-w-0 flex-1 flex items-center h-11 sm:h-9">
                                                                                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground pointer-events-none opacity-40">
                                                                                            <Search size={12} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="关键词..."
                                                                                            className={`w-full h-full pl-8 pr-3 rounded-lg border text-base sm:text-[12px] outline-none transition-all font-bold text-foreground ${
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
                                                                                {!readOnly && (
                                                                                    <div className="flex items-center justify-between gap-2 sm:hidden">
                                                                                        <div className="flex items-center gap-1">
                                                                                            <button type="button" onClick={() => moveItemByButton(originalIndex, platform, -1)} disabled={visibleIndexes[0] === originalIndex} aria-label="上移商品" title="上移商品" className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:bg-primary/10 disabled:opacity-25">
                                                                                                <ArrowUp size={16} />
                                                                                            </button>
                                                                                            <button type="button" onClick={() => moveItemByButton(originalIndex, platform, 1)} disabled={visibleIndexes[visibleIndexes.length - 1] === originalIndex} aria-label="下移商品" title="下移商品" className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:bg-primary/10 disabled:opacity-25">
                                                                                                <ArrowDown size={16} />
                                                                                            </button>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-1">
                                                                                            {canMergeToPreviousOrder && (
                                                                                                <button type="button" onClick={() => {
                                                                                                    const previous = groupedOrders[orderIndex - 1]?.items[0];
                                                                                                    if (previous) updateOrderGroup(originalIndex, getItemOrderGroup(previous.item, previous.originalIndex));
                                                                                                }} title="合并到上一单" className="h-11 min-w-11 rounded-lg bg-primary/10 px-2 text-xs font-bold text-primary">合并</button>
                                                                                            )}
                                                                                            {canSplitOrder && (
                                                                                                <button type="button" onClick={() => splitToNewOrder(originalIndex)} title="拆成单独一单" className="h-11 min-w-11 rounded-lg bg-muted/50 px-2 text-xs font-bold text-muted-foreground">拆单</button>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {formData.items && formData.items.length > 0 ? (
                                                <div className="mt-4 p-4 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                                                    <div>
                                                        <div className="text-[10px] font-black text-primary/50 uppercase tracking-widest">商品数</div>
                                                        <div className="text-xl font-black text-primary tracking-tight mt-1">
                                                            {formData.items.length} <span className="text-xs">项</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right border-l border-primary/10 pl-6">
                                                        <div className="text-[10px] font-black text-primary/50 uppercase tracking-widest">总件数</div>
                                                        <div className="text-lg font-black text-primary leading-none mt-1">
                                                            {formData.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} <span className="text-xs">份</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl border-gray-100 dark:border-white/5 text-muted-foreground">
                                                    <Package size={48} className="opacity-10 mb-4" />
                                                    <p className="text-sm font-bold opacity-40">点击右上角“从刷单商品库选择”开始规划</p>
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
                selectedIds={[]}
                fetchPath="/api/brush-products/products"
                query={{
                    ...(formData.shopName ? { shopName: formData.shopName } : {}),
                }}
                allowLibrarySwitch={false}
                title="选择刷单商品"
                showStock={false}
                showCategory={false}
                hideUnselectedOnlyToggle
                imageOnly
            />
        </>
    );
}

function groupItemsByOrder(platformItems: BrushOrderPlanItem[], allItems: BrushOrderPlanItem[]) {
    const groups = new Map<number, Array<{ item: BrushOrderPlanItem; originalIndex: number; platformIndex: number }>>();
    platformItems.forEach((item, platformIndex) => {
        const originalIndex = allItems.findIndex((candidate) => candidate === item);
        const group = item.orderGroup || originalIndex + 1;
        const current = groups.get(group) || [];
        current.push({ item, originalIndex, platformIndex });
        groups.set(group, current);
    });
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
}
