"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Truck, Calendar, Plus, Trash2, ListOrdered, FileText } from "lucide-react";
import { PurchaseOrder, PurchaseOrderItem, Product, Supplier } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "./ProductSelectionModal";
import { ImageGallery } from "@/components/ui/ImageGallery";

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PurchaseOrder) => void;
  initialData?: PurchaseOrder | null;
  readOnly?: boolean;
}

export function PurchaseOrderModal({ isOpen, onClose, onSubmit, initialData, readOnly = false }: PurchaseOrderModalProps) {
  const [formData, setFormData] = useState<PurchaseOrder>(() => ({
    id: initialData?.id || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    status: initialData?.status || "Draft",
    date: initialData?.date || new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
    items: initialData?.items || [],
    shippingFees: initialData?.shippingFees || 0,
    extraFees: initialData?.extraFees || 0,
    totalAmount: initialData?.totalAmount || 0,
    trackingData: initialData?.trackingData
  }));

  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0
  });
  const prevInitialDataRef = useRef<PurchaseOrder | undefined>(undefined);

  const selectedProductIds = useMemo(() => {
    return formData.items.map(item => item.productId);
  }, [formData.items]);


  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    
    const fetchData = async () => {
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/suppliers")
        ]);
        
        if (pRes.ok) {
          const pData = await pRes.json();
          setProducts(pData);
        }
        
        if (sRes.ok) {
          const sData = await sRes.json();
          setSuppliers(sData);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };

    if (isOpen) fetchData();
    return () => cancelAnimationFrame(handle);
  }, [isOpen]);

  // Reset formData when modal opens with new data
  useEffect(() => {
    if (!isOpen) return;
    
    // Use a transition to batch state updates
    const timeoutId = setTimeout(() => {
      if (initialData && initialData !== prevInitialDataRef.current) {
        prevInitialDataRef.current = initialData;
        setFormData(initialData);
      } else if (!initialData && prevInitialDataRef.current) {
        prevInitialDataRef.current = undefined;
        setFormData({
          id: `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
          status: "Draft",
          date: new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
          items: [],
          shippingFees: 0,
          extraFees: 0,
          totalAmount: 0,
          trackingData: undefined
        });
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [isOpen, initialData]);


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
    
    // Convert string inputs from numeric fields back to numbers for the state if they are valid numbers
    let processedValue = value;
    if (field === "quantity" || field === "costPrice") {
        if (value === "") {
            processedValue = 0;
        } else {
            processedValue = field === "quantity" ? parseInt(value as string) : parseFloat(value as string);
            if (isNaN(processedValue as number)) processedValue = 0;
        }
    }

    newItems[index] = { ...newItems[index], [field]: processedValue };
    
    // Auto-fill cost price if product changes
    if (field === "productId") {
        const product = products.find(g => g.id === value);
        if (product) {
            newItems[index].costPrice = product.price * 0.7; // Mock cost price at 70% of retail
        }
    }
    
    setFormData({ ...formData, items: newItems });
  };

  const handleAction = (status: PurchaseStatus) => {
    if (formData.items.length === 0) return;
    onSubmit({
      ...formData,
      totalAmount: calculateTotal(),
      status
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAction(formData.status === "Draft" ? "Ordered" : formData.status);
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
                {readOnly ? "查看采购详情" : (initialData ? "编辑采购单" : "新建采购单")}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 bg-muted/20 dark:bg-white/5 p-3 sm:p-6 rounded-2xl border border-border/50">
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
                                <Calendar size={14} /> {readOnly ? "订单时间" : "时间"}
                            </label>
                            <div className={`h-9 sm:h-auto ${readOnly ? "pointer-events-none opacity-80" : ""}`}>
                                <DatePicker 
                                    value={formData.date}
                                    onChange={(val) => setFormData({...formData, date: val})}
                                    placeholder="选择日期"
                                    showClear={false}
                                />
                            </div>
                        </div>
                    </div>








                    {/* Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <ListOrdered size={16} className="text-primary" /> 采购项目 {formData.items.length > 0 && `(${formData.items.length})`}
                            </label>
                            {formData.items.length > 0 && !readOnly && (
                                <button 
                                    type="button"
                                    onClick={addItem}
                                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                                >
                                    <Plus size={14} /> 继续添加
                                </button>
                            )}
                        </div>

                        <div className="space-y-3 bg-muted/20 dark:bg-white/5 p-2 sm:p-4 rounded-3xl border border-border/50">
                            {/* Desktop Header */}
                            {formData.items.length > 0 && (
                                <div className={`hidden sm:grid ${readOnly ? 'grid-cols-[1fr_100px_120px_120px]' : 'grid-cols-[1fr_80px_120px_120px_40px]'} gap-4 px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/10 mb-2`}>
                                    <div className="pl-12">商品信息</div>
                                    <div className="text-center">数量</div>
                                    <div className="text-center">单价</div>
                                    <div className="text-right pr-4">小计</div>
                                    {!readOnly && <div></div>}
                                </div>
                            )}

                            {formData.items.map((item, index) => (
                                <div key={index} className={`group relative flex flex-col sm:grid ${readOnly ? 'sm:grid-cols-[1fr_100px_120px_120px]' : 'sm:grid-cols-[1fr_80px_120px_120px_40px]'} items-center gap-4 p-4 rounded-2xl bg-white dark:bg-white/10 border border-border dark:border-white/5 shadow-sm transition-all animate-in fade-in slide-in-from-top-2`}>
                                    {/* Product Info Column */}
                                    <div className="flex w-full items-center gap-3">
                                        <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-background border border-border/50">
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
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                <span className="text-xs sm:text-sm font-bold text-foreground line-clamp-2">
                                                    {products.find(g => g.id === item.productId)?.name}
                                                </span>
                                                 <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                        #{products.find(g => g.id === item.productId)?.sku || products.find(g => g.id === item.productId)?.id || "N/A"}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                        • {suppliers.find(s => s.id === (products.find(p => p.id === item.productId)?.supplierId || item.supplierId))?.name || "未知供应商"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {!readOnly && (
                                            <button 
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="sm:hidden p-2 rounded-xl bg-destructive/10 text-destructive active:scale-90"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                     </div>
                                    
                                    {/* Mobile Stats Row / Desktop Columns */}
                                    <div className="grid grid-cols-3 sm:contents gap-2 w-full pt-3 sm:pt-0 border-t border-border/10 sm:border-0">
                                        {/* Quantity Column */}
                                        <div className="flex flex-col sm:block items-center justify-center">
                                            <label className="sm:hidden text-[9px] text-muted-foreground/60 font-bold uppercase tracking-tighter mb-0.5">数量</label>
                                            {readOnly ? (
                                                <div className="w-full h-[34px] flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm font-mono font-bold text-foreground">
                                                    {item.quantity}
                                                </div>
                                            ) : (
                                                <input 
                                                    type="number" 
                                                    min="1"
                                                    value={item.quantity || ""}
                                                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                                                    className="w-full h-[34px] rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 px-2 py-1.5 text-foreground outline-none ring-1 ring-transparent text-center focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs no-spinner"
                                                />
                                            )}
                                        </div>

                                        {/* Price Column */}
                                        <div className="flex flex-col sm:block items-center justify-center">
                                            <label className="sm:hidden text-[9px] text-muted-foreground/60 font-bold uppercase tracking-tighter mb-0.5">单价</label>
                                            {readOnly ? (
                                                <div className="relative w-full h-[34px] flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm font-mono text-foreground">
                                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">￥</span>
                                                    {item.costPrice.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                                                </div>
                                            ) : (
                                                <div className="relative w-full">
                                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">￥</span>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        value={item.costPrice || ""}
                                                        onChange={(e) => updateItem(index, "costPrice", e.target.value)}
                                                        className="w-full h-[34px] rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-5 pr-1 py-1.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-[10px] sm:text-xs no-spinner"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Total Column */}
                                        <div className="flex flex-col sm:block items-end justify-center">
                                            <label className="sm:hidden text-[9px] text-muted-foreground/60 font-bold uppercase tracking-tighter mb-0.5">小计</label>
                                            <div className="h-[34px] flex items-center justify-end px-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-border dark:border-white/10 text-foreground font-bold text-xs sm:text-sm overflow-hidden whitespace-nowrap">
                                                <span className="text-muted-foreground mr-0.5 font-normal text-[10px]">￥</span>
                                                {(item.quantity * item.costPrice).toLocaleString(undefined, { minimumFractionDigits: 1 })}
                                            </div>
                                        </div>
                                    </div>

                                     {/* Delete Button (Desktop) & Mobile Delete Wrapper */}
                                    {!readOnly && (
                                        <div className="absolute right-4 top-4 sm:static flex items-center justify-center">
                                            <button 
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="flex items-center justify-center h-9 w-9 sm:h-8 sm:w-8 rounded-xl sm:rounded-lg bg-destructive/10 sm:bg-transparent text-destructive sm:text-muted-foreground/40 hover:bg-destructive/15 sm:hover:bg-destructive/10 sm:hover:text-destructive transition-all sm:opacity-0 sm:group-hover:opacity-100"
                                            >
                                                <Trash2 size={readOnly ? 0 : 18} className="sm:size-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            
                            {formData.items.length === 0 && (
                                <button
                                    type="button"
                                    onClick={addItem}
                                    className="w-full h-48 flex flex-col items-center justify-center gap-2 p-8 rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group bg-white dark:bg-transparent"
                                >
                                    <div className="h-10 w-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                        <Plus size={20} />
                                    </div>
                                    <div className="flex flex-col text-center">
                                        <span className="text-sm font-bold">{readOnly ? "暂无采购项目" : "添加采购项目"}</span>
                                        <span className="text-xs opacity-60">
                                            {readOnly ? "该采购单中不包含任何商品明细" : "点击开始为这张采购单添加商品项目"}
                                        </span>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>







                    {/* Tracking Info Section - Only visible if tracking data exists */}
                    {formData.trackingData && formData.trackingData.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                    <Truck size={16} className="text-primary" /> 物流追踪信息 ({formData.trackingData.length})
                                </label>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/20 dark:bg-white/5 p-2 sm:p-4 rounded-3xl border border-border/50">
                                {formData.trackingData.map((track, idx) => (
                                    <div key={idx} className="bg-white dark:bg-white/10 p-4 rounded-2xl border border-border dark:border-white/5 shadow-sm flex flex-col gap-3 transition-all">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-foreground bg-muted dark:bg-white/10 px-2 py-1 rounded-md border border-border/50">
                                                    {track.courier}
                                                </span>
                                                <span className="text-xs font-mono text-muted-foreground select-all font-medium">
                                                    {track.number}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-tight">包裹 #{idx + 1}</span>
                                        </div>
                                        
                                        {/* Waybill Images Preview */}
                                        {(track.waybillImage || (track.waybillImages && track.waybillImages.length > 0)) && (
                                            <div className="flex gap-2 overflow-x-auto pb-1 mt-1">
                                                {(track.waybillImages && track.waybillImages.length > 0 ? track.waybillImages : (track.waybillImage ? [track.waybillImage] : [])).map((img, imgIdx) => (
                                                    <div key={imgIdx} className="relative h-12 w-16 shrink-0 rounded-lg overflow-hidden border border-border/50 bg-white group cursor-zoom-in">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img 
                                                            src={img} 
                                                            alt={`waybill-${idx}-${imgIdx}`} 
                                                            className="h-full w-full object-cover transition-transform group-hover:scale-110"
                                                            onClick={() => {
                                                                // Collect all images from all tracking entries for a complete gallery
                                                                const allImages: string[] = [];
                                                                let clickedIndex = 0;
                                                                
                                                                 formData.trackingData?.forEach((t) => {
                                                                    const imgs = t.waybillImages && t.waybillImages.length > 0 
                                                                        ? t.waybillImages 
                                                                        : (t.waybillImage ? [t.waybillImage] : []);
                                                                    
                                                                    allImages.push(...imgs);
                                                                });

                                                                // Re-calculate index based on flattened array is hard inside map.
                                                                // Simpler approach: build array first or just pass tracking's own images?
                                                                // User asked for "switch left and right", implying global navigation.
                                                                // Let's make it simpler: just pass the current tracking's images for now, OR better:
                                                                
                                                                // Better approach:
                                                                const flatImages = formData.trackingData?.flatMap(t => 
                                                                    t.waybillImages && t.waybillImages.length > 0 
                                                                        ? t.waybillImages 
                                                                        : (t.waybillImage ? [t.waybillImage] : [])
                                                                ) || [];
                                                                
                                                                const targetIndex = flatImages.indexOf(img);
                                                                
                                                                setGalleryState({
                                                                    isOpen: true,
                                                                    images: flatImages,
                                                                    currentIndex: targetIndex
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                </div>

                {/* Footer Totals & Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-6 bg-white dark:bg-white/5 border-t border-border/10 shrink-0 z-10">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                        <div className="flex items-center gap-2 min-w-fit pr-0 sm:pr-4 border-r-0 sm:border-r border-border/50">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-2">附加金额</span>
                        </div>
                        <div className="grid grid-cols-2 sm:flex items-center gap-4 w-full sm:w-auto">
                            <div className="flex items-center gap-2 group flex-1 sm:flex-initial">
                                <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 group-hover:text-foreground transition-colors shrink-0">
                                    <Truck size={12} /> 运费
                                </label>
                                {readOnly ? (
                                    <div className="relative flex-1 sm:flex-initial h-[34px] w-full sm:w-20 flex items-center justify-center rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs font-mono font-bold text-foreground">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground opacity-50">￥</span>
                                        {formData.shippingFees.toLocaleString()}
                                    </div>
                                ) : (
                                    <div className="relative flex-1 sm:flex-initial">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground opacity-50">￥</span>
                                        <input 
                                            type="number" 
                                            min="0"
                                            step="0.01"
                                            value={formData.shippingFees || ""}
                                            onChange={(e) => setFormData({...formData, shippingFees: parseFloat(e.target.value) || 0})}
                                            className="w-full sm:w-20 rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-6 pr-2 py-1.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs no-spinner"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 group flex-1 sm:flex-initial">
                                <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 group-hover:text-foreground transition-colors shrink-0">
                                    <Plus size={12} /> 其它
                                </label>
                                {readOnly ? (
                                    <div className="relative flex-1 sm:flex-initial h-[34px] w-full sm:w-20 flex items-center justify-center rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs font-mono font-bold text-foreground">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground opacity-50">￥</span>
                                        {formData.extraFees.toLocaleString()}
                                    </div>
                                ) : (
                                    <div className="relative flex-1 sm:flex-initial">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground opacity-50">￥</span>
                                        <input 
                                            type="number" 
                                            min="0"
                                            step="0.01"
                                            value={formData.extraFees || ""}
                                            onChange={(e) => setFormData({...formData, extraFees: parseFloat(e.target.value) || 0})}
                                            className="w-full sm:w-20 rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-6 pr-2 py-1.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs no-spinner"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-6 w-full sm:w-auto mt-4 sm:mt-0 text-right">
                        <div className="flex flex-col items-end gap-0.5 ml-auto">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1 sm:pl-0">合计结算</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm font-bold text-primary">￥</span>
                                <span className="text-3xl font-black text-foreground font-mono tracking-tighter">
                                    {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                            </div>
                        </div>

                        {!readOnly && (
                            <div className="flex items-center gap-2">
                                {formData.status === "Draft" && (
                                    <button
                                        type="button"
                                        onClick={() => handleAction("Draft")}
                                        disabled={formData.items.length === 0}
                                        className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 sm:px-5 py-3 sm:py-2.5 text-xs sm:text-sm font-bold text-foreground border border-border/50 transition-all hover:bg-secondary/80 active:scale-[0.98] disabled:opacity-50"
                                    >
                                        暂存
                                    </button>
                                )}

                                <button
                                    type="submit"
                                    disabled={formData.items.length === 0}
                                    className="flex-2 sm:flex-initial flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 sm:px-8 py-3.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:-translate-y-px active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
                                >
                                    <CheckCircle size={18} />
                                    <span>{formData.status === "Draft" ? (
                                        <><span className="hidden sm:inline">确认</span>下单</>
                                    ) : "保存修改"}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </form>
          </motion.div>
          <ProductSelectionModal 
            isOpen={isSelectionModalOpen}
            onClose={() => setIsSelectionModalOpen(false)}
            onSelect={handleBatchAdd}
            showPrice={true}
            selectedIds={selectedProductIds}
          />

          {/* Image Gallery Preview */}
          <ImageGallery 
            isOpen={galleryState.isOpen}
            images={galleryState.images}
            initialIndex={galleryState.currentIndex}
            onClose={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
