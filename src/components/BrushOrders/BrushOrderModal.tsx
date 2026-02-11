"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Plus, Trash2 } from "lucide-react";
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

const BRUSH_TYPES = ["淘宝", "京东", "拼多多", "抖音", "快手", "美团"];

export function BrushOrderModal({ isOpen, onClose, onSubmit, onDelete, initialData, readOnly = false }: BrushOrderModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<BrushOrder>(() => ({
    id: initialData?.id || "",
    status: initialData?.status || "Draft",
    date: initialData?.date || new Date().toISOString(),
    items: initialData?.items || [],
    type: initialData?.type || "淘宝",
    principalAmount: initialData?.principalAmount || 0,
    paymentAmount: initialData?.paymentAmount || 0,
    receivedAmount: initialData?.receivedAmount || 0,
    commission: initialData?.commission || 0,
    note: initialData?.note || "",
  }));





  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const prevInitialDataRef = useRef<BrushOrder | undefined>(undefined);
  


  useEffect(() => {
    // Avoid setting state immediately if not needed or handle via generic loading state
    // But here we just need to ensure hydration match
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(data => {
        setMounted(true);
        setProducts(data);
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    
    // reset form when opening with new data
    if (initialData?.id !== prevInitialDataRef.current?.id) {
       prevInitialDataRef.current = initialData || undefined;
       
       // Use setTimeout to avoid synchronous state update warning during render
       setTimeout(() => {
           if (initialData) {
               setFormData({
                 ...initialData,
                 note: initialData.note || "" // Ensure note is string
               });
           } else {
               setFormData({
                id: "",
                status: "Draft",
                date: new Date().toISOString(),
                items: [],
                type: "淘宝",
                principalAmount: 0,
                paymentAmount: 0,
                receivedAmount: 0,
                commission: 0,
                note: "",
            });
           }
       }, 0);
    }
  }, [isOpen, initialData]);

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

  const updateItem = (index: number, quantity: number) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], quantity };
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (!formData.paymentAmount) {
      showToast("请输入实付金额", "error");
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
                className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] sm:w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 p-6">
                    <h2 className="text-xl font-bold">{readOnly ? "刷单详情" : (initialData ? "编辑刷单" : "新建刷单")}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
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
                                    // Custom Input Mode
                                    return (
                                        <div className="relative group/custom animate-in zoom-in-95 duration-200">
                                            <input
                                                autoFocus={!readOnly}
                                                type="text"
                                                placeholder="输入平台名称"
                                                value={formData.type === "其他" ? "" : formData.type}
                                                disabled={readOnly}
                                                onChange={(e) => setFormData({...formData, type: e.target.value})}
                                                className="w-full h-10 px-3 pr-10 rounded-xl border bg-transparent border-gray-200 dark:bg-gray-800 dark:border-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
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

                                // Standard Select Mode
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

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">本金</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-10 pl-7 pr-3 rounded-xl border bg-transparent dark:border-gray-700 [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                    value={formData.principalAmount || ""}
                                    onChange={e => setFormData({...formData, principalAmount: parseFloat(e.target.value) || 0})}
                                    disabled={readOnly}
                                />
                             </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">实付 <span className="text-red-500">*</span></label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-10 pl-7 pr-3 rounded-xl border bg-transparent dark:border-gray-700 [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                    value={formData.paymentAmount || ""}
                                    onChange={e => setFormData({...formData, paymentAmount: parseFloat(e.target.value) || 0})}
                                    disabled={readOnly}
                                />
                             </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">到手</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-10 pl-7 pr-3 rounded-xl border bg-transparent dark:border-gray-700 [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                    value={formData.receivedAmount || ""}
                                    onChange={e => setFormData({...formData, receivedAmount: parseFloat(e.target.value) || 0})}
                                    disabled={readOnly}
                                />
                             </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-500">佣金</label>
                             <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">¥</span>
                                <input
                                    type="number"
                                    className="w-full h-10 pl-7 pr-3 rounded-xl border bg-transparent dark:border-gray-700 [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="0"
                                    value={formData.commission || ""}
                                    onChange={e => setFormData({...formData, commission: parseFloat(e.target.value) || 0})}
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

                        <div className="space-y-2">
                            {formData.items.map((item, index) => {
                                const product = products.find(p => p.id === item.productId);
                                return (
                                    <div key={index} className="flex items-center gap-4 p-3 rounded-xl border bg-gray-50 dark:bg-gray-800/20 dark:border-gray-700">
                                        <div className="w-12 h-12 rounded-lg bg-white border overflow-hidden shrink-0">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            {product?.image ? <img src={product.image} className="w-full h-full object-cover" alt={product.name}/> : <div className="w-full h-full flex items-center justify-center bg-gray-100"><Package size={16} /></div>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate text-sm">{product?.name || "加载中..."}</div>
                                            <div className="text-xs text-gray-500">{product?.sku}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">数量:</span>
                                            <input
                                                type="number"
                                                className="w-16 h-8 rounded-lg border text-center bg-white dark:bg-black/20 dark:border-gray-700 [&::-webkit-inner-spin-button]:appearance-none"
                                                value={item.quantity}
                                                onChange={e => updateItem(index, parseInt(e.target.value) || 1)}
                                                disabled={readOnly}
                                                min="1"
                                            />
                                        </div>
                                        {!readOnly && (
                                            <button type="button" onClick={() => removeItem(index)} className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
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
                            className="w-full min-h-[80px] rounded-xl border p-3 bg-transparent dark:bg-gray-800 dark:border-gray-700 resize-y"
                            value={formData.note || ""}
                            onChange={e => setFormData({...formData, note: e.target.value})}
                            disabled={readOnly}
                            placeholder="填写备注信息..."
                        />
                    </div>

                    {!readOnly && (
                        <div className="flex justify-between items-center pt-4 border-t dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setIsConfirmOpen(true)}
                                    className="px-4 py-2.5 rounded-xl text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    删除订单
                                </button>
                            <div className="flex gap-4">
                                <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">取消</button>
                                <button type="submit" className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity">保存订单</button>
                            </div>
                        </div>
                    )}
                    {readOnly && initialData?.id && (
                         <div className="flex justify-between items-center pt-4 border-t dark:border-gray-800">
                             <button
                                    type="button"
                                    onClick={() => setIsConfirmOpen(true)}
                                    className="px-4 py-2.5 rounded-xl text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                >
                                    <Trash2 size={18} />
                                    删除订单
                                </button>
                             <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl bg-secondary font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">关闭</button>
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
