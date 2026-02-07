"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Truck, Calendar, Plus, Trash2, ListOrdered, FileText } from "lucide-react";
import { PurchaseOrder, PurchaseOrderItem, Product, Supplier } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "./ProductSelectionModal";

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PurchaseOrder) => void;
  initialData?: PurchaseOrder | null;
}

export function PurchaseOrderModal({ isOpen, onClose, onSubmit, initialData }: PurchaseOrderModalProps) {
  const [formData, setFormData] = useState<PurchaseOrder>(() => ({
    id: initialData?.id || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    status: initialData?.status || "Draft",
    date: initialData?.date || new Date().toISOString().slice(0, 10),
    items: initialData?.items || [],
    shippingFees: initialData?.shippingFees || 0,
    extraFees: initialData?.extraFees || 0,
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
          const [sData, pData] = await Promise.all([sRes.json(), pRes.json()]);
          setSuppliers(sData);
          setProducts(pData);
        }
      } catch (error) {
        console.error("Failed to fetch modal data:", error);
      }
    };

    if (isOpen) fetchData();
    return () => cancelAnimationFrame(handle);
  }, [isOpen]);

  // Sync formData when initialData changes
  const [prevInitialData, setPrevInitialData] = useState(initialData);
  if (isOpen && initialData && initialData !== prevInitialData) {
    setPrevInitialData(initialData);
    setFormData(initialData);
  }


  const calculateTotal = () => {
    const itemsTotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
    return itemsTotal + (Number(formData.shippingFees) || 0) + (Number(formData.extraFees) || 0);
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
          supplierId: product.supplierId,
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
    if (formData.items.length === 0) return;
    
    onSubmit({
      ...formData,
      totalAmount: calculateTotal(),
      status: formData.status === "Draft" ? "Ordered" : formData.status
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
            className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-2rem)] sm:w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 bg-secondary/20 p-3 sm:p-6 rounded-2xl border border-border/50">
                        <div className="space-y-1.5">
                            <label className="text-[10px] sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <FileText size={14} /> 采购单号
                            </label>
                            <input 
                                disabled
                                type="text" 
                                value={formData.id}
                                className="w-full rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm text-foreground outline-none ring-1 ring-transparent opacity-70 font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <Calendar size={14} /> 日期
                            </label>
                            <div className="h-9 sm:h-auto">
                                <DatePicker 
                                    value={formData.date}
                                    onChange={(val) => setFormData({...formData, date: val})}
                                    placeholder="选择日期"
                                />
                            </div>
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
                                <div key={index} className="group relative flex flex-col sm:flex-row sm:items-end gap-3 p-3 rounded-xl bg-secondary/20 border border-border/50 hover:border-primary/30 transition-all animate-in fade-in slide-in-from-top-2">
                                    {/* Mobile: Top Row (Image + Product) */}
                                    <div className="flex w-full sm:w-auto items-center gap-2 sm:gap-3 flex-1">
                                        <div className="h-8 w-8 sm:h-10 sm:w-10 shrink-0 rounded-lg overflow-hidden bg-background border border-border/50">
                                            {products.find(g => g.id === item.productId)?.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img 
                                                    src={products.find(g => g.id === item.productId)?.image} 
                                                    alt="product" 
                                                    className="h-full w-full object-cover" 
                                                />
                                            ) : (
                                                <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                                                    <Package size={14} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                                                    {products.find(g => g.id === item.productId)?.name}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <Truck size={10} className="shrink-0" />
                                                    {suppliers.find(s => s.id === (item.supplierId || products.find(g => g.id === item.productId)?.supplierId))?.name || "未知供应商"}
                                                </span>
                                            </div>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            className="sm:hidden p-1.5 rounded-lg text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive active:scale-90"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Desktop & Mobile Inputs Grid */}
                                    <div className="grid grid-cols-12 sm:flex sm:items-end gap-2 sm:gap-4 w-full sm:w-auto">
                                        <div className="col-span-3 space-y-1 sm:w-24">
                                            <label className="text-[10px] sm:text-[10px] text-muted-foreground/70 font-bold uppercase tracking-wider ml-1 block sm:mb-0.5">数量</label>
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, "quantity", e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                                                className="w-full rounded-lg sm:rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-2 sm:px-3 py-1 sm:py-2 text-foreground outline-none ring-1 ring-transparent text-center sm:text-left focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                placeholder="数量"
                                            />
                                        </div>
                                        <div className="col-span-4 space-y-1 sm:w-32">
                                            <label className="text-[10px] sm:text-[10px] text-muted-foreground/70 font-bold uppercase tracking-wider ml-1 block sm:mb-0.5">单价</label>
                                            <div className="relative">
                                                <span className="absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 text-[10px] sm:text-xs text-muted-foreground">￥</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={item.costPrice}
                                                    onChange={(e) => updateItem(index, "costPrice", e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
                                                    className="w-full rounded-lg sm:rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-4 sm:pl-7 pr-1 sm:pr-3 py-1 sm:py-2 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs sm:text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="进价"
                                                />
                                            </div>
                                        </div>
                                        <div className="col-span-5 space-y-1 sm:w-32">
                                            <label className="text-[10px] sm:text-[10px] text-muted-foreground/70 font-bold uppercase tracking-wider ml-1 block sm:mb-0.5">小计</label>
                                            <div className="h-7 sm:h-[38px] flex items-center justify-end sm:justify-start px-2 sm:px-3 rounded-lg sm:rounded-xl bg-secondary/30 sm:bg-muted/50 text-foreground font-bold text-xs sm:text-sm overflow-hidden whitespace-nowrap">
                                                <span className="sm:hidden text-[9px] font-normal text-muted-foreground mr-auto uppercase">Total:</span>
                                                ￥{(item.quantity * item.costPrice).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <button 
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        className="hidden sm:inline-flex h-[38px] p-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            
                            {formData.items.length === 0 && (
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="w-full h-48 flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group"
                                >
                                    <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                        <Plus size={20} />
                                    </div>
                                    <div className="flex flex-col text-center">
                                        <span className="text-sm font-bold">添加采购项目</span>
                                        <span className="text-xs opacity-60">点击开始为这张采购单添加商品项目</span>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4 py-3 sm:px-8 sm:py-6 border-t border-border/50 shrink-0 bg-background/50 backdrop-blur-xl z-20">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col gap-1.5 min-w-[80px]">
                            <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">运费</span>
                            <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={formData.shippingFees}
                                onChange={(e) => setFormData({...formData, shippingFees: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0})}
                                className="w-24 rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-3 py-2 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="运费"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-[80px]">
                            <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">其它费用</span>
                            <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={formData.extraFees}
                                onChange={(e) => setFormData({...formData, extraFees: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0})}
                                className="w-24 rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-3 py-2 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="额外"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-6 ml-auto">
                        <div className="flex flex-row sm:flex-col items-baseline sm:items-end gap-2 sm:gap-0.5">
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">总计金额</span>
                            <span className="text-2xl font-bold text-foreground font-mono">
                                <span className="text-sm mr-0.5 opacity-70">￥</span>{calculateTotal().toLocaleString()}
                            </span>
                        </div>

                        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 sm:flex-none rounded-lg sm:rounded-xl px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all whitespace-nowrap border border-transparent hover:border-border/50"
                            >
                                取消
                            </button>
                            
                            {formData.status === "Draft" && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onSubmit({ ...formData, totalAmount: calculateTotal(), status: "Draft" });
                                    }}
                                    disabled={formData.items.length === 0}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-secondary px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-foreground border border-border/50 shadow-sm transition-all hover:bg-secondary/80 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                                >
                                    <FileText size={14} className="sm:size-5" />
                                    <span className="truncate">保存草稿</span>
                                </button>
                            )}

                            <button
                                type="submit"
                                disabled={formData.items.length === 0}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl bg-primary px-4 sm:px-8 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                            >
                                <CheckCircle size={14} className="sm:size-5" />
                                <span className="truncate">{formData.status === "Draft" ? "确认下单" : "保存修改"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </form>
          </motion.div>
          <ProductSelectionModal 
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            onSelect={handleBatchAdd}
            selectedIds={formData.items.map(i => i.productId)}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
