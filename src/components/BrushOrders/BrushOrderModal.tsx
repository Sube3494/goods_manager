"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Plus, Trash2, AlertTriangle } from "lucide-react";
import { BrushOrder, Product } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProductSelectionModal } from "../Purchases/ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface BrushOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: BrushOrder) => void;
  onDelete?: (id: string) => void;
  initialData?: BrushOrder | null;
  readOnly?: boolean;
}

const BRUSH_TYPES = ["美团", "淘宝", "京东"];

export function BrushOrderModal({ isOpen, onClose, onSubmit, onDelete, initialData, readOnly = false }: BrushOrderModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<BrushOrder>(() => ({
    id: initialData?.id || "",
    status: initialData?.status || "Draft",
    date: initialData?.date || new Date().toISOString(),
    items: initialData?.items || [],
    type: initialData?.type || "美团",
    paymentAmount: initialData?.paymentAmount || 0,
    receivedAmount: initialData?.receivedAmount || 0,
    commission: initialData?.commission || 0,
    note: initialData?.note || "",
  }));

  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  
  // 1. Data Fetching
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    fetch("/api/products?pageSize=1000")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.items)) {
          setProducts(data.items);
        } else if (Array.isArray(data)) {
          setProducts(data);
        }
      })
      .catch(console.error);
    return () => clearTimeout(timer);
  }, []);

  // 2. Body Scroll logic
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // 3. Form Data Synchronization
  const [prevId, setPrevId] = useState<string | undefined>(undefined);
  const [isNewOrder, setIsNewOrder] = useState(true);

  // Sync data when opening
  if (isOpen && (initialData?.id !== prevId || (initialData === null && !isNewOrder))) {
    setPrevId(initialData?.id);
    setIsNewOrder(!initialData);
    
    setFormData(initialData ? {
      ...initialData,
      note: initialData.note || ""
    } : {
      id: "",
      status: "Draft",
      date: new Date().toISOString(),
      items: [],
      type: "美团",
      paymentAmount: 0,
      receivedAmount: 0,
      commission: 0,
      note: "",
    });
  }

  // Reset sync tracking during render when closed (avoids useEffect cascading render)
  if (!isOpen && (prevId !== undefined || isNewOrder !== false)) {
    setPrevId(undefined);
    setIsNewOrder(false);
  }

  const addItem = () => setIsSelectionModalOpen(true);

  const handleBatchAdd = (selectedProducts: Product[]) => {
    const currentProductIds = formData.items.map(item => item.productId);
    const newItems = [...formData.items];

    selectedProducts.forEach(product => {
      if (!currentProductIds.includes(product.id)) {
        newItems.push({
          productId: product.id,
          quantity: 1,
        });
      }
    });
    setFormData({ ...formData, items: newItems });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const updateItem = (index: number, val: string) => {
    const newItems = [...formData.items];
    const quantity = val === "" ? 0 : parseInt(val) || 0;
    newItems[index] = { ...newItems[index], quantity };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (!formData.paymentAmount || formData.paymentAmount <= 0) {
      showToast("请输入有效的实付金额", "error");
      return;
    }

    if (!formData.receivedAmount || formData.receivedAmount <= 0) {
      showToast("请输入有效的到手金额", "error");
      return;
    }

    if (formData.receivedAmount > formData.paymentAmount) {
      showToast("到手金额不能大于实付金额", "error");
      return;
    }

    if (formData.items.length === 0) {
      showToast("请关联至少一个商品", "error");
      return;
    }

    if (!formData.type.trim()) {
        showToast("请输入平台名称", "error");
        return;
    }

    onSubmit(formData);
  };

  if (!mounted) return null;

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
                className="fixed left-1/2 top-1/2 z-60 w-[calc(100%-32px)] sm:w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 p-5 sm:p-8">
                    <h2 className="text-2xl font-bold">{readOnly ? "刷单详情" : (initialData ? "编辑刷单" : "新建刷单")}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-red-500/10 dark:hover:text-red-500 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">日期</label>
                            <DatePicker
                                value={formData.date instanceof Date ? formData.date.toISOString() : (formData.date as string)}
                                onChange={(val) => setFormData({...formData, date: val})}
                                placeholder="选择日期"
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">平台 <span className="text-red-500">*</span></label>
                            {(() => {
                                const isStandard = BRUSH_TYPES.filter(t => t !== "其他").includes(formData.type);
                                
                                if (!isStandard) {
                                    return (
                                        <div className="relative group/custom animate-in zoom-in-95 duration-200">
                                            <input
                                                autoFocus={!readOnly}
                                                type="text"
                                                placeholder="输入平台名称"
                                                value={formData.type === "其他" ? "" : formData.type}
                                                disabled={readOnly}
                                                onChange={(e) => setFormData({...formData, type: e.target.value})}
                                                className="w-full h-10 px-3 pr-10 rounded-xl border bg-transparent border-gray-200 dark:bg-white/5 dark:border-white/10 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                            />
                                            {!readOnly && (
                                                <button 
                                                    type="button"
                                                    onClick={() => setFormData({...formData, type: "淘宝"})}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                                                    title="返回列表"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                }

                                return (
                                    <CustomSelect
                                        options={BRUSH_TYPES.map(t => ({ value: t, label: t }))}
                                        value={formData.type}
                                        onChange={(val) => setFormData({...formData, type: val})}
                                        className="w-full h-10"
                                    />
                                );
                            })()}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">实付 <span className="text-red-500">*</span></label>
                             <div className="relative flex items-center group">
                                <span className="absolute left-3.5 text-gray-400 font-medium select-none">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-11 pl-8 pr-4 rounded-2xl border bg-transparent dark:bg-white/5 dark:border-white/10 focus:ring-2 focus:ring-primary/20 transition-all outline-none [&::-webkit-inner-spin-button]:appearance-none font-mono text-sm leading-none"
                                    placeholder="0"
                                    value={formData.paymentAmount === 0 ? "" : formData.paymentAmount}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setFormData({...formData, paymentAmount: val === "" ? 0 : parseFloat(val) || 0});
                                    }}
                                    disabled={readOnly}
                                />
                             </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">到手 <span className="text-red-500">*</span></label>
                             <div className="relative flex flex-col group">
                                <div className="relative flex items-center">
                                    <span className={`absolute left-3.5 font-medium select-none transition-colors ${
                                        formData.receivedAmount > formData.paymentAmount && formData.paymentAmount > 0
                                        ? "text-red-500" 
                                        : "text-gray-400"
                                    }`}>¥</span>
                                    <input
                                        type="number"
                                        className={`w-full h-11 pl-8 pr-4 rounded-2xl border bg-transparent dark:bg-white/5 transition-all outline-none [&::-webkit-inner-spin-button]:appearance-none font-mono text-sm leading-none ${
                                            formData.receivedAmount > formData.paymentAmount && formData.paymentAmount > 0
                                            ? "border-red-500 ring-4 ring-red-500/10 text-red-500" 
                                            : "dark:border-white/10 focus:ring-2 focus:ring-primary/20"
                                        }`}
                                        placeholder="0"
                                        value={formData.receivedAmount === 0 ? "" : formData.receivedAmount}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setFormData({...formData, receivedAmount: val === "" ? 0 : parseFloat(val) || 0});
                                        }}
                                        disabled={readOnly}
                                    />
                                </div>
                                {formData.receivedAmount > formData.paymentAmount && formData.paymentAmount > 0 && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-red-500 mt-1.5 font-bold bg-red-500/5 px-2.5 py-1 rounded-lg border border-red-500/10 w-fit animate-in fade-in slide-in-from-top-1 duration-200">
                                        <AlertTriangle size={12} className="shrink-0" />
                                        <span>到手金额不应超过实付</span>
                                    </div>
                                )}
                             </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">佣金</label>
                             <div className="relative flex items-center group">
                                <span className="absolute left-3.5 text-gray-400 font-medium select-none">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-11 pl-8 pr-4 rounded-2xl border bg-transparent dark:bg-white/5 dark:border-white/10 focus:ring-2 focus:ring-primary/20 transition-all outline-none [&::-webkit-inner-spin-button]:appearance-none font-mono text-sm leading-none"
                                    placeholder="0"
                                    value={formData.commission === 0 ? "" : formData.commission}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setFormData({...formData, commission: val === "" ? 0 : parseFloat(val) || 0});
                                    }}
                                    disabled={readOnly}
                                />
                             </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold flex items-center gap-2">
                                <Package size={18} /> 关联商品 <span className="text-red-500">*</span>
                           </h3>
                           {!readOnly && (
                               <button type="button" onClick={addItem} className="text-sm text-primary font-bold flex items-center gap-1 hover:underline">
                                    <Plus size={16} /> 添加商品
                               </button>
                           )}
                        </div>

                        <div className="space-y-3">
                            {formData.items.map((item, index) => {
                                const product = item.product || products.find(p => p.id === item.productId);
                                return (
                                    <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border bg-gray-50/50 dark:bg-white/5 dark:border-white/10 backdrop-blur-md group hover:border-primary/30 transition-all shadow-sm">
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 border dark:border-white/10 overflow-hidden shrink-0 shadow-sm transition-transform group-hover:scale-105">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                {product?.image ? <img src={product.image} className="w-full h-full object-cover" alt={product.name}/> : <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800"><Package size={16} /></div>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold truncate text-sm text-foreground">{product?.name || "加载中..."}</div>
                                                <div className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate opacity-60 uppercase tracking-widest">{product?.sku || "NO SKU"}</div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-0 border-border/10">
                                            <div className="flex items-center gap-2 bg-white/50 dark:bg-white/10 rounded-xl p-1 border border-border/50">
                                                <span className="text-[10px] font-bold text-muted-foreground px-2 uppercase tracking-tight opacity-50">数量</span>
                                                <input
                                                    type="number"
                                                    className="w-14 h-8 bg-transparent text-sm text-center focus:outline-none font-mono font-medium"
                                                    value={item.quantity === 0 ? "" : item.quantity}
                                                    onChange={e => updateItem(index, e.target.value)}
                                                    disabled={readOnly}
                                                    min="1"
                                                />
                                            </div>
                                            {!readOnly && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => removeItem(index)} 
                                                    className="p-2.5 rounded-xl text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-transparent hover:border-red-500/20"
                                                    title="移除商品"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {formData.items.length === 0 && (
                                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-xl dark:border-gray-700">
                                    暂无关联商品
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-500">备注</label>
                        <textarea
                            className="w-full min-h-[80px] rounded-xl border p-3 bg-transparent dark:bg-white/5 dark:border-white/10 resize-y outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            value={formData.note || ""}
                            onChange={e => setFormData({...formData, note: e.target.value})}
                            disabled={readOnly}
                            placeholder="填写备注信息..."
                        />
                    </div>

                    {!readOnly && (
                        <div className="flex items-center justify-between gap-4 pt-8 border-t dark:border-white/10">
                            <div className="shrink-0">
                                {initialData?.id && (
                                    <button
                                        type="button"
                                        onClick={() => setIsConfirmOpen(true)}
                                        className="h-11 px-5 rounded-2xl text-red-500 font-bold hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 border border-red-500/10 hover:border-red-500/30 active:scale-95"
                                        title="删除此订单"
                                    >
                                        <Trash2 size={18} />
                                        <span className="hidden sm:inline">删除订单</span>
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3 ml-auto">
                                <button 
                                    type="button" 
                                    onClick={onClose} 
                                    className="h-11 px-6 sm:px-8 rounded-2xl font-medium text-muted-foreground hover:bg-gray-100 dark:hover:bg-white/5 dark:hover:text-foreground border border-transparent hover:border-border transition-all active:scale-95 whitespace-nowrap"
                                >
                                    取消
                                </button>
                                <button 
                                    type="submit" 
                                    className="h-11 px-8 sm:px-10 rounded-2xl bg-primary text-primary-foreground font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all whitespace-nowrap"
                                >
                                    保存订单
                                </button>
                            </div>
                        </div>
                    )}
                    {readOnly && initialData?.id && (
                         <div className="flex items-center justify-between gap-4 pt-6 border-t dark:border-gray-800">
                             <button
                                    type="button"
                                    onClick={() => setIsConfirmOpen(true)}
                                    className="h-10 px-4 rounded-xl text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 border border-red-500/10 hover:border-red-500/30"
                                >
                                    <Trash2 size={16} />
                                    删除订单
                                </button>
                             <button type="button" onClick={onClose} className="h-10 px-8 rounded-xl bg-secondary font-medium hover:bg-gray-100 dark:hover:bg-gray-800 border border-border/50 transition-colors">关闭</button>
                        </div>
                    )}
                </form>
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
        selectedIds={formData.items.map(i => i.productId)}
    />
    <ConfirmModal 
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
            if (initialData?.id) onDelete?.(initialData.id);
            setIsConfirmOpen(false);
        }}
        title="删除订单"
        message="确定要删除此订单吗？此操作不可恢复。"
        variant="danger"
        confirmLabel="确认删除"
    />
    </>
  );
}
