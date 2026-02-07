"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Truck, Calendar, Plus, Trash2, DollarSign, ListOrdered, FileText } from "lucide-react";
import { PurchaseOrder, PurchaseOrderItem, Product, Supplier } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "./ProductSelectionModal";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PurchaseOrder) => void;
  initialData?: PurchaseOrder | null;
}

export function PurchaseOrderModal({ isOpen, onClose, onSubmit, initialData }: PurchaseOrderModalProps) {
  const [formData, setFormData] = useState<PurchaseOrder>(() => ({
    id: initialData?.id || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    supplierId: initialData?.supplierId || "",
    status: initialData?.status || "Draft",
    date: initialData?.date || new Date().toISOString().slice(0, 10),
    items: initialData?.items || [],
    totalAmount: initialData?.totalAmount || 0
  }));

  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    
    const fetchData = async () => {
      try {
        const [sRes, pRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/products")
        ]);
        if (sRes.ok && pRes.ok) {
          setSuppliers(await sRes.json());
          setProducts(await pRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch modal data:", error);
      }
    };

    if (isOpen) fetchData();
    return () => cancelAnimationFrame(handle);
  }, [isOpen]);

  const availableGoodsFiltered = products.filter(g => !formData.supplierId || g.supplierId === formData.supplierId);

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
  };

  const addItem = () => {
    setIsSelectionModalOpen(true);
  };

  const handleBatchAdd = (selectedProducts: Product[]) => {
    const currentProductIds = formData.items.map(item => item.productId);
    const newItems = [...formData.items];

    selectedProducts.forEach(product => {
      if (!currentProductIds.includes(product.id)) {
        newItems.push({
          productId: product.id,
          quantity: 1,
          costPrice: product.price * 0.7 // Default cost 70%
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

   const updateItem = (index: number, field: keyof PurchaseOrderItem, value: string | number) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Auto-fill cost price if product changes
    if (field === "productId") {
        const product = products.find(g => g.id === value);
        if (product) {
            newItems[index].costPrice = product.price * 0.7; // Mock cost price at 70% of retail
        }
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.supplierId || formData.items.length === 0) return;
    
    onSubmit({
      ...formData,
      totalAmount: calculateTotal()
    });
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">
                {initialData ? "编辑采购单" : "新建采购单"}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-secondary/20 p-6 rounded-2xl border border-border/50">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <FileText size={16} /> 采购单号
                            </label>
                            <input 
                                disabled
                                type="text" 
                                value={formData.id}
                                className="w-full rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent opacity-70 font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Truck size={16} /> 供应商
                            </label>
                            <CustomSelect 
                                value={formData.supplierId}
                                onChange={(val) => setFormData({...formData, supplierId: val, items: []})}
                                options={suppliers.map(s => ({ label: s.name, value: s.id }))}
                                placeholder="选择供应商"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Calendar size={16} /> 日期
                            </label>
                            <DatePicker 
                                value={formData.date}
                                onChange={(val) => setFormData({...formData, date: val})}
                                placeholder="选择日期"
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <ListOrdered size={16} /> 采购项目
                            </label>
                            {formData.items.length > 0 && (
                                <button 
                                    type="button"
                                    onClick={addItem}
                                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                                >
                                    <Plus size={14} /> 继续添加
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {formData.items.map((item, index) => (
                                <div key={index} className="group flex gap-3 items-end p-3 rounded-xl bg-secondary/20 border border-border/50 hover:border-primary/30 transition-all animate-in fade-in slide-in-from-top-2">
                                    <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-background border border-border/50 self-center mt-4">
                                        {products.find(g => g.id === item.productId)?.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img 
                                                src={products.find(g => g.id === item.productId)?.image} 
                                                alt="product" 
                                                className="h-full w-full object-cover" 
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                                                <Package size={16} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-2 space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">商品项目</label>
                                        <CustomSelect 
                                            value={item.productId}
                                            onChange={(val) => updateItem(index, "productId", val)}
                                            options={availableGoodsFiltered.map(g => ({ label: g.name, value: g.id }))}
                                            placeholder="选择商品"
                                        />
                                    </div>
                                    <div className="w-24 space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">数量</label>
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value) || 0)}
                                            className="w-full rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-3 py-2 text-foreground outline-none ring-1 ring-transparent text-center focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                                            placeholder="数量"
                                        />
                                    </div>
                                    <div className="w-32 space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">进货单价</label>
                                        <div className="relative">
                                            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                value={item.costPrice}
                                                onChange={(e) => updateItem(index, "costPrice", parseFloat(e.target.value) || 0)}
                                                className="w-full rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-8 pr-3 py-2 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono dark:hover:bg-white/10"
                                                placeholder="单价"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-32 space-y-1.5">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">小计</label>
                                        <div className="h-[38px] flex items-center px-3 rounded-xl bg-muted/50 text-foreground font-bold text-sm">
                                            ￥{(item.quantity * item.costPrice).toLocaleString()}
                                        </div>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        className="h-[38px] p-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                            
                            <button
                                type="button"
                                onClick={addItem}
                                className={cn(
                                    "w-full flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group",
                                    formData.items.length === 0 ? "h-48" : "h-20"
                                )}
                            >
                                <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                    <Plus size={20} />
                                </div>
                                <div className="flex flex-col text-center">
                                    <span className="text-sm font-bold">添加采购项目</span>
                                    {formData.items.length === 0 && (
                                        <span className="text-xs opacity-60">点击开始为这张采购单添加商品项目</span>
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-12 border-t border-white/10 px-8 py-6 shrink-0">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">总计金额:</span>
                        <span className="text-2xl font-bold text-foreground font-mono">
                            ￥{calculateTotal().toLocaleString()}
                        </span>
                    </div>
                    <div className="flex gap-4 items-center">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={formData.items.length === 0 || !formData.supplierId}
                            className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <CheckCircle size={18} />
                            {initialData ? "确认保存" : "确认创建"}
                        </button>
                    </div>
                </div>
            </form>
          </motion.div>
          <ProductSelectionModal 
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            onSelect={handleBatchAdd}
            selectedIds={formData.items.map(i => i.productId)}
            supplierId={formData.supplierId}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
