"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Truck, Calendar, Plus, Trash2, ListOrdered, FileText, Camera, Copy, ExternalLink, ShoppingBag, AlertCircle } from "lucide-react";
import { PurchaseOrder, Product, Supplier, PurchaseOrderItem, PurchaseStatus } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "./ProductSelectionModal";
import { ImageGallery } from "@/components/ui/ImageGallery";
import { useToast } from "@/components/ui/Toast";

const COURIER_CODES: Record<string, string> = {
  "顺丰速运": "shunfeng",
  "圆通速递": "yuantong",
  "中通快递": "zhongtong",
  "申通快递": "shentong",
  "韵达快递": "yunda",
  "极兔速递": "jtexpress",
  "EMS": "ems",
  "邮政快递": "youzhengguonei",
  "京东快递": "jd",
  "德邦快递": "debangwuliu",
  "安能物流": "annengwuliu",
  "跨越速运": "kuayue"
};

const getTrackingUrl = (num: string, courierName?: string) => {
  const code = courierName ? COURIER_CODES[courierName] : "";
  if (!num || !code) return null;
  return `https://www.kuaidi100.com/chaxun?com=${code}&nu=${num.trim()}`;
};

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PurchaseOrder) => void;
  initialData?: PurchaseOrder | null;
  readOnly?: boolean;
}

export function PurchaseOrderModal({ isOpen, onClose, onSubmit, initialData, readOnly = false }: PurchaseOrderModalProps) {
  const { showToast } = useToast();
  
  // A record is effectively read-only if explicitly set, or if it's a system-generated return
  const isSystemGenerated = useMemo(() => {
    return initialData?.type === "Return" || initialData?.type === "InternalReturn" || (initialData?.id?.startsWith("IN-") && initialData?.type !== "Purchase");
  }, [initialData]);

  const effectiveReadOnly = readOnly || isSystemGenerated;
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
  
  // Local state for fee inputs to allow typing "0." or decimals comfortably
  const [shippingFeeInput, setShippingFeeInput] = useState(initialData?.shippingFees?.toString() || "0");
  const [extraFeeInput, setExtraFeeInput] = useState(initialData?.extraFees?.toString() || "0");

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
          // Backend now returns paginated object with { items, total, ... }
          const items = Array.isArray(pData.items) ? pData.items : (Array.isArray(pData) ? pData : []);
          setProducts(items);
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

  // Sync data and reset form when modal opens or initialData changes
  useEffect(() => {
    if (!isOpen) return;

    // Use setTimeout to avoid the "cascading renders" lint error while 
    // keeping initialization out of the render path (fixing the Math.random error)
    const timeoutId = setTimeout(() => {
        if (initialData) {
            setFormData(initialData);
            setShippingFeeInput(initialData.shippingFees?.toString() || "0");
            setExtraFeeInput(initialData.extraFees?.toString() || "0");
        } else {
            const newId = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
            setFormData(prev => ({
                id: newId,
                status: "Draft",
                date: new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
                items: [],
                type: prev.type === "Inbound" ? "Inbound" : "Purchase",
                shippingFees: 0,
                extraFees: 0,
                totalAmount: 0,
                trackingData: undefined,
                paymentVouchers: []
            }));
            setShippingFeeInput("0");
            setExtraFeeInput("0");
        }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [isOpen, initialData]);


  const calculateTotal = () => {
    const itemsTotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
    return itemsTotal + (Number(formData.shippingFees) || 0) + (Number(formData.extraFees) || 0);
  };

  const addTrackingRow = () => {
      const current = formData.trackingData || [];
      setFormData({
          ...formData,
          trackingData: [...current, { courier: "顺丰速运", number: "", waybillImages: [] }]
      });
  };

  const removeTrackingRow = (index: number) => {
      const current = formData.trackingData || [];
      setFormData({
          ...formData,
          trackingData: current.filter((_, i) => i !== index)
      });
  };

  const updateTrackingData = (index: number, field: string, value: string | string[]) => {
      const current = [...(formData.trackingData || [])];
      current[index] = { ...current[index], [field]: value };
      setFormData({ ...formData, trackingData: current });
  };

  const addItem = () => {
    setIsSelectionModalOpen(true);
  };

  const handleBatchAdd = (selectedProducts: Product[]) => {
    setFormData(prev => {
      const newItems = [...prev.items];
      
      selectedProducts.forEach(product => {
        // Check against the growing newItems list to prevent duplicates within the same batch
        if (!newItems.some(item => item.productId === product.id)) {
          newItems.push({
            productId: product.id,
            product: product, // Store snapshot for stable name display
            image: product.image,
            supplierId: product.supplierId,
            quantity: 1,
            costPrice: product.costPrice
          });
        }
      });

      return { ...prev, items: newItems };
    });
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
            newItems[index].costPrice = product.costPrice; // Use exact cost price
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

  const isShippedAndReady = useMemo(() => {
    return formData.status === "Shipped" && 
           formData.trackingData && 
           formData.trackingData.length > 0 && 
           formData.trackingData.every(td => (td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)));
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly && formData.status !== "Confirmed" && formData.status !== "Shipped") return; // Prevent normal form submit if read-only, unless it's for tracking updates
    handleAction(formData.status === "Draft" ? "Confirmed" : formData.status);
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
            className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-32px)] sm:w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                  {formData.type === "Inbound" || formData.type === "Return" || formData.type === "InternalReturn" ? (
                      <div className="flex items-center gap-2">
                          <Package size={24} className="text-primary" />
                          <span>{effectiveReadOnly ? "单据详情" : (initialData ? "编辑单据" : "新增入库")}</span>
                      </div>
                  ) : (
                      <div className="flex items-center gap-2">
                          <ShoppingBag size={24} className="text-secondary" />
                          <span>{effectiveReadOnly ? "采购详情" : (initialData ? "编辑采购单" : "新建采购单")}</span>
                      </div>
                  )}
                </h2>
                {isSystemGenerated && (
                  <p className="text-[10px] font-bold text-orange-500/80 tracking-wider flex items-center gap-1">
                    <AlertCircle size={10} strokeWidth={3} /> 系统自动生成的退库记录，不支持手动修改
                  </p>
                )}
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 bg-muted/20 dark:bg-white/5 p-3 sm:p-6 rounded-2xl border border-border/50">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center justify-between uppercase tracking-wider">
                                <span className="flex items-center gap-1.5"><ListOrdered size={14} /> 业务类型</span>
                                <span className="text-red-500">*</span>
                            </label>
                            <select 
                                disabled={effectiveReadOnly}
                                value={formData.type || "Purchase"}
                                onChange={(e) => setFormData({...formData, type: e.target.value})}
                                className="w-full h-10 sm:h-[42px] rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-xs sm:text-sm text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-bold appearance-none cursor-pointer"
                            >
                                <option value="Purchase">采购入库 (常规进货)</option>
                                <option value="Return">销售退回 (售后入库)</option>
                                <option value="InternalReturn">领用退回 (物料归还)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <FileText size={14} /> 单据编号
                            </label>
                            <input 
                                disabled
                                type="text" 
                                value={formData.id}
                                className="w-full h-10 sm:h-[42px] rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-xs sm:text-sm text-foreground outline-none ring-1 ring-transparent opacity-70 font-mono"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <Calendar size={14} /> {formData.type === "Inbound" ? "入库时间" : (readOnly ? "订单时间" : "时间")}
                            </label>
                            <div className={`w-full h-10 sm:h-[42px] ${readOnly ? "pointer-events-none opacity-80" : ""}`}>
                                <DatePicker 
                                    value={formData.date}
                                    onChange={(val) => setFormData({...formData, date: val})}
                                    placeholder="选择日期"
                                    showClear={false}
                                    className="h-full"
                                />
                            </div>
                        </div>
                    </div>








                    {/* Items Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <ListOrdered size={16} className="text-primary" /> {formData.type === "Inbound" ? "入库项目" : "采购项目"} {formData.items.length > 0 && `(${formData.items.length})`}
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
                                    <div className="pl-12">商品信息 <span className="text-red-500">*</span></div>
                                    <div className="text-center">数量 <span className="text-red-500">*</span></div>
                                    <div className="text-center">单价 <span className="text-red-500">*</span></div>
                                    <div className="text-right pr-4">小计</div>
                                    {!readOnly && <div></div>}
                                </div>
                            )}

                            {formData.items.map((item, index) => (
                                <div key={index} className={`group relative flex flex-col sm:grid ${readOnly ? 'sm:grid-cols-[1fr_100px_120px_120px]' : 'sm:grid-cols-[1fr_80px_120px_120px_40px]'} items-center gap-4 p-4 rounded-2xl bg-white dark:bg-white/10 border border-border dark:border-white/5 shadow-sm transition-all animate-in fade-in slide-in-from-top-2`}>
                                    {/* Product Info Column */}
                                    <div className="flex w-full items-center gap-3">
                                        <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-background border border-border/50">
                                            {(Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.image ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img 
                                                    src={(Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.image} 
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
                                                    {item.product?.name || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.name || "加载中..."}
                                                </span>
                                                 <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                        #{item.product?.sku || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.sku || "..."}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                        • {suppliers.find(s => s.id === (item.product?.supplierId || item.supplierId))?.name || "未知供应商"}
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







                    {/* Payment Voucher Section - Only for Purchases and not in Draft status and NOT system generated (returns) */}
                    {formData.type !== "Inbound" && formData.status !== "Draft" && !isSystemGenerated && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <label className="text-xs font-black uppercase tracking-widest text-muted-foreground/50 border-l-2 border-primary pl-2">
                                支付凭证
                            </label>
                        </div>
                        {formData.paymentVouchers && formData.paymentVouchers.length > 0 ? (
                            <div className="bg-muted/10 dark:bg-white/5 p-3 rounded-2xl border border-border/40 flex flex-wrap gap-3">
                                {formData.paymentVouchers.map((url, idx) => (
                                    <div key={url || idx} className="relative group w-28 sm:w-48 aspect-square sm:aspect-3/2 rounded-xl overflow-hidden border border-border/60 shadow-sm transition-all hover:ring-2 hover:ring-primary/20">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img 
                                            src={url} 
                                            alt={`payment voucher ${idx + 1}`} 
                                            className="h-full w-full object-cover sm:object-contain bg-black/5 dark:bg-white/5 cursor-zoom-in"
                                            onClick={() => setGalleryState({
                                                isOpen: true,
                                                images: formData.paymentVouchers || [],
                                                currentIndex: idx
                                            })}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 rounded-2xl border-2 border-dashed border-border/40 flex flex-col items-center justify-center gap-2 opacity-40">
                                <FileText size={24} className="text-muted-foreground" />
                                <p className="text-[10px] font-bold">暂无支付凭证</p>
                            </div>
                        )}
                    </div>
                    )}
                    
                    {/* Tracking Info Section - Only visible if not in Draft and not Inbound and NOT system generated */}
                    {formData.type !== "Inbound" && formData.status !== "Draft" && !isSystemGenerated && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <label className="text-xs font-black uppercase tracking-widest text-muted-foreground/50 border-l-2 border-orange-500 pl-2">
                                    物流包裹 & 进货凭证
                                </label>
                                {!readOnly && formData.status !== "Received" && (
                                    <button
                                        type="button"
                                        onClick={addTrackingRow}
                                        className="text-[10px] font-bold text-orange-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                                    >
                                        <Plus size={12} />
                                        添加包裹
                                    </button>
                                )}
                            </div>
                            
                            <div className="space-y-4">
                                {(formData.trackingData || [])
                                  .filter(tracking => !readOnly || (tracking.number || (tracking.waybillImages && tracking.waybillImages.length > 0) || tracking.waybillImage))
                                  .map((tracking, index) => (
                                        readOnly ? (
                                            /* Enhanced Compact Parcel Card for ReadOnly */
                                            <div key={index} className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-muted/20 dark:bg-white/5 p-3 sm:p-4 rounded-2xl border border-border/40 group/parcel">
                                                {/* Left: Tracking Info */}
                                                <div className="flex-1 space-y-2 sm:space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                                                                <Package size={12} />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase text-muted-foreground/40 tracking-widest">包裹 #{index + 1}</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2 sm:gap-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-muted-foreground/60 w-12 shrink-0">快递公司</span>
                                                            <span className="text-xs font-black text-foreground">{tracking.courier}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-muted-foreground/60 w-12 shrink-0">运单号</span>
                                                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                                <span className="text-xs font-mono font-bold bg-background px-2 py-0.5 rounded border border-border/50 truncate">
                                                                    {tracking.number || "暂无单号"}
                                                                </span>
                                                                {tracking.number && (
                                                                    <div className="flex items-center gap-1 shrink-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(tracking.number);
                                                                                showToast("单号已复制", "success");
                                                                            }}
                                                                            className="p-1 rounded-md text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                                                                            title="复制单号"
                                                                        >
                                                                            <Copy size={12} />
                                                                        </button>
                                                                        {(() => {
                                                                            const url = getTrackingUrl(tracking.number, tracking.courier);
                                                                            if (!url) return null;
                                                                            return (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => window.open(url, '_blank')}
                                                                                    className="p-1 rounded-md text-muted-foreground/40 hover:text-orange-500 hover:bg-orange-500/10 transition-all"
                                                                                    title="物流查询"
                                                                                >
                                                                                    <ExternalLink size={12} />
                                                                                </button>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right: Waybill Thumbnails */}
                                                <div className="flex flex-wrap gap-1.5 sm:gap-2 min-w-0 sm:min-w-[120px] justify-start sm:justify-end items-start pt-1">
                                                    {(tracking.waybillImages || (tracking.waybillImage ? [tracking.waybillImage] : [])).map((img, imgIdx) => (
                                                        <div key={imgIdx} className="relative h-12 w-16 sm:h-14 sm:w-20 rounded-lg overflow-hidden border border-border bg-muted/30 shadow-sm hover:ring-2 hover:ring-primary/40 transition-all">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img 
                                                                src={img} 
                                                                alt="" 
                                                                className="h-full w-full object-cover cursor-zoom-in" 
                                                                onClick={() => {
                                                                    const flatImages = formData.trackingData?.flatMap(t => 
                                                                        t.waybillImages && t.waybillImages.length > 0 
                                                                            ? t.waybillImages 
                                                                            : (t.waybillImage ? [t.waybillImage] : [])
                                                                    ) || [];
                                                                    const targetIndex = flatImages.indexOf(img);
                                                                    setGalleryState({ isOpen: true, images: flatImages, currentIndex: targetIndex });
                                                                }}
                                                            />
                                                        </div>
                                                    ))}
                                                    {(!tracking.waybillImages && !tracking.waybillImage) && (
                                                        <div className="h-14 w-20 rounded-lg border border-dashed border-border/60 flex items-center justify-center bg-muted/10">
                                                            <Camera size={14} className="text-muted-foreground/30" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            /* Input Mode */
                                            <div key={index} className="p-4 rounded-3xl bg-white dark:bg-white/5 border border-border/50 space-y-4 relative group">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                                                            <Package size={16} />
                                                        </div>
                                                        <span className="text-xs font-bold text-foreground">包裹 #{index + 1}</span>
                                                    </div>
                                                    {!readOnly && formData.status !== "Received" && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeTrackingRow(index)}
                                                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1.5 text-left">
                                                        <label className="text-[10px] font-black uppercase text-muted-foreground/40 ml-1">快递公司</label>
                                                        <select
                                                            disabled={readOnly || formData.status === "Received"}
                                                            value={tracking.courier}
                                                            onChange={(e) => updateTrackingData(index, "courier", e.target.value)}
                                                            className="w-full h-10 rounded-xl bg-background border border-border/50 px-3 text-xs outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60"
                                                        >
                                                            {["顺丰速运", "圆通速递", "中通快递", "申通快递", "韵达快递", "极兔速递", "EMS", "京东快递", "德邦快递", "其他"].map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-1.5 text-left">
                                                        <label className="text-[10px] font-black uppercase text-muted-foreground/40 ml-1">快递单号</label>
                                                        <input
                                                            readOnly={readOnly || formData.status === "Received"}
                                                            type="text"
                                                            value={tracking.number}
                                                            onChange={(e) => updateTrackingData(index, "number", e.target.value)}
                                                            className="w-full h-10 rounded-xl bg-background border border-border/50 px-3 text-xs font-mono outline-none focus:ring-2 focus:ring-orange-500/20 read-only:opacity-60"
                                                            placeholder={readOnly ? "暂无单号" : "请输入单号..."}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                 ))}
                                {(!formData.trackingData || formData.trackingData.length === 0 || (readOnly && (formData.trackingData || []).filter(t => t.number || (t.waybillImages && t.waybillImages.length > 0) || t.waybillImage).length === 0)) && (
                                    <div className="py-8 rounded-2xl border-2 border-dashed border-border/40 flex flex-col items-center justify-center gap-2 opacity-40">
                                        <Truck size={24} className="text-muted-foreground" />
                                        <p className="text-[10px] font-bold">暂无物流信息</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                {/* Footer Totals & Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-6 bg-white dark:bg-white/5 border-t border-border/10 shrink-0 z-10">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
                        {formData.type !== "Inbound" && !isSystemGenerated && (
                        <>
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
                                            value={shippingFeeInput}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setShippingFeeInput(val);
                                                setFormData({...formData, shippingFees: parseFloat(val) || 0});
                                            }}
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
                                            value={extraFeeInput}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setExtraFeeInput(val);
                                                setFormData({...formData, extraFees: parseFloat(val) || 0});
                                            }}
                                            className="w-full sm:w-20 rounded-lg bg-white dark:bg-white/5 border border-border dark:border-white/10 pl-6 pr-2 py-1.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-mono text-xs no-spinner"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        </>
                        )}
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
                            <div className="flex flex-1 sm:flex-initial items-center gap-2 sm:gap-3">
                                {/* Actions for Draft state */}
                                {formData.status === "Draft" && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => handleAction("Draft")}
                                            disabled={formData.items.length === 0}
                                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-bold text-foreground border border-border/50 transition-all hover:bg-secondary/80 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
                                        >
                                            暂存草稿
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={formData.items.length === 0}
                                            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 sm:px-8 py-3.5 text-xs sm:text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
                                        >
                                            <CheckCircle size={18} className="hidden sm:block" />
                                            <span>确认下单</span>
                                        </button>
                                    </>
                                )}

                                {/* Actions for Confirmed (Ordered) state */}
                                {(formData.status === "Confirmed" || (formData.status as string) === "Ordered") && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const hasTracking = formData.trackingData && formData.trackingData.length > 0;
                                            handleAction(hasTracking ? "Shipped" : "Confirmed");
                                        }}
                                        className="flex-1 sm:flex-initial flex items-center justify-center rounded-2xl bg-primary px-8 py-3.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 whitespace-nowrap"
                                    >
                                        保存物流资料
                                    </button>
                                )}

                                {/* Actions for Shipped state */}
                                {formData.status === "Shipped" && (
                                    <div className="flex flex-1 sm:flex-initial items-center gap-3">
                                        {!isShippedAndReady && (
                                            <p className="hidden md:block text-[10px] text-orange-500 font-bold max-w-[200px] text-right">请补全物流面单照片后即可入库</p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => handleAction("Received")}
                                            disabled={!isShippedAndReady}
                                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-black transition-all shadow-lg whitespace-nowrap ${isShippedAndReady ? 'bg-emerald-500 text-white shadow-emerald-500/25 hover:bg-emerald-600' : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'}`}
                                        >
                                            <CheckCircle size={18} />
                                            确认入库
                                        </button>
                                    </div>
                                )}
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
