"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Truck, Calendar, Plus, Minus, Trash2, ListOrdered, FileText, Camera, Copy, ShoppingBag, Download, AlertCircle, MapPin } from "lucide-react";
import { PurchaseOrder, Product, PurchaseOrderItem, PurchaseStatus, User as UserType, Supplier } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { ProductSelectionModal } from "./ProductSelectionModal";
import { ImageGallery } from "@/components/ui/ImageGallery";
import { useToast } from "@/components/ui/Toast";
import { sortPurchaseItems } from "@/lib/pinyin";
import { useUser } from "@/hooks/useUser";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PurchaseOrder) => void;
  onExport?: (po: PurchaseOrder) => void;
  onOverview?: (po: PurchaseOrder) => void;
  initialData?: PurchaseOrder | null;
  readOnly?: boolean;
}

export function PurchaseOrderModal({ isOpen, onClose, onSubmit, onExport, onOverview, initialData, readOnly = false }: PurchaseOrderModalProps) {
  const { showToast } = useToast();
  const { user } = useUser();
  const router = useRouter();
  const typedUser = user as unknown as UserType;
  
  const [formData, setFormData] = useState<PurchaseOrder>(() => ({
    id: initialData?.id || `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`,
    status: initialData?.status || "Draft",
    // New orders are always 'Purchase'; only existing records can have other types
    type: initialData?.type || "Purchase",
    date: initialData?.date || new Date().toLocaleString('sv-SE').slice(0, 16).replace('T', ' '),
    items: initialData?.items || [],
    shippingFees: initialData?.shippingFees || 0,
    extraFees: initialData?.extraFees || 0,
    totalAmount: initialData?.totalAmount || 0,
    trackingData: initialData?.trackingData,
    shippingAddress: initialData?.shippingAddress || ""
  }));

  const addressList = useMemo(() => {
    return typedUser?.shippingAddresses || [];
  }, [typedUser]);


  // Only 'Received' status or system-generated records are truly read-only for core product/price info
  const effectiveReadOnly = readOnly || formData.status === "Received" || (initialData?.status === "Received");
  
  // Derived: system-generated records (auto-created from outbound returns) are always locked
  const isSystemGenerated = formData.type === "Return" || formData.type === "InternalReturn";



  
  // Local state for fee inputs to allow typing "0." or decimals comfortably
  const [shippingFeeInput, setShippingFeeInput] = useState(initialData?.shippingFees?.toString() || "0");
  const [extraFeeInput, setExtraFeeInput] = useState(initialData?.extraFees?.toString() || "0");
  const [discountInput, setDiscountInput] = useState(initialData?.discountAmount?.toString() || "0");


  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isUploadingVoucher, setIsUploadingVoucher] = useState(false);
  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0
  });

  // State for two-step inline delete confirmations
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [confirmingDeleteIndex, setConfirmingDeleteIndex] = useState<number | null>(null);

  useEffect(() => {
      let clearTba: NodeJS.Timeout;
      if (isConfirmingClear) {
          clearTba = setTimeout(() => setIsConfirmingClear(false), 3000);
      }
      return () => clearTimeout(clearTba);
  }, [isConfirmingClear]);

  useEffect(() => {
      let deleteTba: NodeJS.Timeout;
      if (confirmingDeleteIndex !== null) {
          deleteTba = setTimeout(() => setConfirmingDeleteIndex(null), 3000);
      }
      return () => clearTimeout(deleteTba);
  }, [confirmingDeleteIndex]);

  const selectedProductIds = useMemo(() => {
    return formData.items.map(item => item.productId);
  }, [formData.items]);


  // Robust scroll lock logic: standard overflow hidden on both body and html to prevent leakage
  useEffect(() => {
    if (isOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isOpen]);

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
            const sortedItems = sortPurchaseItems(
                initialData.items,
                (item) => item.product?.sku,
                (item) => item.product?.name
            );
            setFormData({ ...initialData, items: sortedItems });
            setShippingFeeInput(initialData.shippingFees?.toString() || "0");
            setExtraFeeInput(initialData.extraFees?.toString() || "0");
        } else {
            const newId = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
            
            const defaultAddr = (typedUser?.shippingAddresses || []).find(a => a.isDefault)?.address || "";

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
                paymentVouchers: [],
                shippingAddress: defaultAddr
            }));
            setShippingFeeInput("0");
            setExtraFeeInput("0");
        }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [isOpen, initialData, user, typedUser?.shippingAddresses]);

  // Auto-select default address if empty and list is available
  useEffect(() => {
    if (formData.type === "Purchase" && !formData.shippingAddress && addressList.length > 0) {
      const defaultAddr = addressList.find(a => a.isDefault)?.address || addressList[0].address;
      if (defaultAddr && defaultAddr !== formData.shippingAddress) {
        // Using a microtask or next tick to avoid cascading render warning in some React versions/environments
        const handle = requestAnimationFrame(() => {
          setFormData(prev => prev.shippingAddress ? prev : { ...prev, shippingAddress: defaultAddr });
        });
        return () => cancelAnimationFrame(handle);
      }
    }
  }, [formData.type, formData.shippingAddress, addressList]);


  const calculateTotal = () => {
    const itemsTotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
    const gross = itemsTotal + (Number(formData.shippingFees) || 0) + (Number(formData.extraFees) || 0);
    return Math.max(0, gross - (Number(formData.discountAmount) || 0));
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
      let newItems = [...prev.items];
      
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

      newItems = sortPurchaseItems(
        newItems,
        (item) => item.product?.sku,
        (item) => item.product?.name
      );

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

  const inferStatus = (currentData: PurchaseOrder): PurchaseStatus => {
    // If it's already received, don't auto-downgrade status
    if (currentData.status === "Received") return "Received";

    const hasTracking = currentData.trackingData && 
                       currentData.trackingData.length > 0 && 
                       currentData.trackingData.some(td => td.number.trim());
    
    // If there's tracking info, it should be Shipped
    if (hasTracking) return "Shipped";
    
    // If there are items but no tracking, it's at least Confirmed (Ordered)
    if (currentData.items.length > 0) return "Confirmed";
    
    // Otherwise keep as Draft
    return "Draft";
  };

  const handleAction = (status: PurchaseStatus, isDraftManual: boolean = false) => {
    if (formData.items.length === 0) return;

    let targetStatus = status;
    
    // Logic for "Draft" button:
    // If user explicitly clicks "Save as Draft" (isDraftManual)
    if (isDraftManual) {
        // Only allow status to be "Draft" if it was already "Draft" or it's a new order
        // Otherwise, keep the current status (e.g., if it's "Shipped", keep it "Shipped")
        if (formData.status !== "Draft") {
            targetStatus = formData.status;
        } else {
            targetStatus = "Draft";
        }
    } else if (status !== "Received") {
        // Normal "Submit/Save" button: auto-infer status unless it's formal receipt
        targetStatus = inferStatus(formData);
    }

    if (formData.type === "Purchase" && targetStatus !== "Draft") {
      if (!formData.shippingAddress) {
        showToast("请先选择或配置收货地址，才可提交采购单", "error");
        return;
      }
    }

    onSubmit({
      ...formData,
      totalAmount: calculateTotal(),
      status: targetStatus
    });
  };

  const handleFileUpload = useCallback(async (files: FileList | File[], type: 'payment' | 'waybill', rowIndex?: number) => {
    if (!files || files.length === 0) return;

    if (type === 'payment') setIsUploadingVoucher(true);

    const uploadPromises = Array.from(files).map(async (file) => {
      const uploadData = new FormData();
      uploadData.append("file", file);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
          headers: {
            "x-folder": type === 'payment' ? "vouchers" : "labels",
            "x-use-timestamp": "true"
          }
        });
        if (res.ok) {
          const { url } = await res.json();
          return url as string;
        }
        console.error(`${type} upload failed with status: ${res.status}`);
      } catch (error) {
        console.error(`${type} upload failed:`, error);
      }
      return null;
    });

    try {
      const results = await Promise.all(uploadPromises);
      const urls = results.filter((url): url is string => !!url);
      
      if (urls.length > 0) {
        if (type === 'payment') {
          setFormData(prev => ({
            ...prev,
            paymentVouchers: [...(prev.paymentVouchers || []), ...urls]
          }));
          showToast(`成功上传 ${urls.length} 张支付凭证`, "success");
        } else if (type === 'waybill' && typeof rowIndex === 'number') {
          setFormData(prev => {
            const current = [...(prev.trackingData || [])];
            if (current[rowIndex]) {
              const images = current[rowIndex].waybillImages || (current[rowIndex].waybillImage ? [current[rowIndex].waybillImage] : []);
            const newImages = [...images, ...urls].filter((url): url is string => url !== undefined);
            current[rowIndex] = { ...current[rowIndex], waybillImages: newImages };
            }
            return { ...prev, trackingData: current };
          });
          showToast(`成功上传 ${urls.length} 张物流面单`, "success");
        }
      } else {
        showToast("上传文件失败，请重试", "error");
      }
    } catch (error) {
      console.error("File upload failed:", error);
      showToast("上传过程中发生错误", "error");
    } finally {
      if (type === 'payment') setIsUploadingVoucher(false);
    }
  }, [showToast]);

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
            className="fixed left-1/2 top-1/2 z-10000 w-[calc(100%-32px)] sm:w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
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
              <div className="flex items-center gap-2">
                {readOnly && initialData && (
                  <div className="flex items-center gap-1 sm:gap-2 mr-2 border-r border-border/50 pr-2 sm:pr-4">
                    {onOverview && (
                      <button 
                        type="button"
                        onClick={() => onOverview(initialData)}
                        className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all flex items-center gap-2"
                        title="总览商品汇总"
                      >
                        <ShoppingBag size={20} />
                        <span className="hidden sm:inline text-xs font-bold">汇总</span>
                      </button>
                    )}
                    {onExport && (
                      <button 
                        type="button"
                        onClick={() => onExport(initialData)}
                        className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all flex items-center gap-2"
                        title="导出采购明细"
                      >
                        <Download size={20} />
                        <span className="hidden sm:inline text-xs font-bold">导出</span>
                      </button>
                    )}
                  </div>
                )}
                <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-8 space-y-4 sm:space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 bg-muted/20 dark:bg-white/5 p-3 sm:p-6 rounded-2xl border border-border/50">


                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <FileText size={14} /> 单据编号
                            </label>
                            <input 
                                disabled
                                type="text" 
                                value={formData.id}
                                className="w-full h-[42px] rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-xs sm:text-sm text-foreground outline-none ring-1 ring-transparent opacity-70 font-mono"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <Calendar size={14} /> {formData.type === "Inbound" ? "入库时间" : (readOnly ? "订单时间" : "时间")}
                            </label>
                            <div className={`w-full h-[42px] ${readOnly ? "pointer-events-none opacity-80" : ""}`}>
                                <DatePicker 
                                    value={formData.date}
                                    onChange={(val) => setFormData({...formData, date: val})}
                                    placeholder="选择日期"
                                    showClear={false}
                                    className="h-full"
                                    triggerClassName="h-[42px] rounded-xl"
                                />
                            </div>
                        </div>

                        {formData.type === "Purchase" && (
                            <div className="flex flex-col gap-2 md:col-span-2">
                                <label className="text-[10px] sm:text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                    <MapPin size={14} /> 收货地址 <span className="text-red-500">*</span>
                                </label>
                                {readOnly ? (
                                    <div className="w-full min-h-[42px] rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2 text-xs sm:text-sm text-foreground opacity-80 flex items-center">
                                        {formData.shippingAddress || "未设置收货地址"}
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <CustomSelect 
                                            value={formData.shippingAddress || ""}
                                            onChange={(val) => setFormData({...formData, shippingAddress: val})}
                                            options={addressList.map(addr => ({
                                                value: addr.address,
                                                label: addr.label ? `[${addr.label}] ${addr.address}` : addr.address
                                            }))}
                                            placeholder="选择收货地址..."
                                            className="flex-1 h-[42px]"
                                            triggerClassName="h-[42px] rounded-xl"
                                            onAddNew={() => router.push("/profile")}
                                            addNewLabel="管理地址"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
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
                                    <div className="text-left pl-2">商品信息 <span className="text-red-500">*</span></div>
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
                                            {(() => {
                                                const imageUrl = item.image || item.product?.image || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.image;
                                                return imageUrl ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img 
                                                        src={imageUrl} 
                                                        alt="product" 
                                                        className="h-full w-full object-cover" 
                                                    />
                                                ) : (
                                                    <div className="h-full w-full flex items-center justify-center text-muted-foreground/40">
                                                        <Package size={14} />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                    <span className="text-xs sm:text-sm font-medium text-foreground line-clamp-2">
                                                        {item.product?.name || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.name || "加载中..."}
                                                    </span>
                                                    {!readOnly && (
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeItem(index);
                                                            }}
                                                            className="sm:hidden shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all active:scale-90"
                                                            title="移除商品"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                                 <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                    {(item.product?.sku || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.sku) && (
                                                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                          #{item.product?.sku || (Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.sku}
                                                      </span>
                                                    )}
                                                    {(() => {
                                                      const supplierId = item.product?.supplierId || item.supplierId;
                                                      const supplierName = suppliers.find(s => s.id === supplierId)?.name;
                                                      return supplierName ? (
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                                                            • {supplierName}
                                                        </span>
                                                      ) : null;
                                                     })()}
                                                       
                                                     {/* Remarks Display in purchase rows */}
                                                     {((Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.remark || item.product?.remark) && (
                                                        <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded w-fit max-w-full truncate">
                                                            <span className="font-bold opacity-70 shrink-0">注:</span>
                                                            <span className="truncate leading-none">{(Array.isArray(products) ? products : []).find(g => g.id === item.productId)?.remark || item.product?.remark}</span>
                                                        </span>
                                                     )}
                                                 </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Mobile Stats Row / Desktop Columns */}
                                    <div className="grid grid-cols-3 sm:contents gap-2 w-full pt-3 sm:pt-0 border-t border-border/10 sm:border-0 items-center">
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
                                        {!readOnly && (
                                            <div className="hidden sm:flex w-full sm:w-auto pt-2 sm:pt-0 justify-end">
                                                <button 
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeItem(index);
                                                    }}
                                                    className="flex items-center justify-center h-8 w-8 rounded-lg bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all active:scale-90"
                                                    title="移除商品"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
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
                        {((formData.paymentVouchers && formData.paymentVouchers.length > 0) || !readOnly) ? (
                            <div className="bg-muted/10 dark:bg-white/5 p-3 rounded-2xl border border-border/40 flex flex-wrap gap-3">
                                {formData.paymentVouchers?.map((url, idx) => (
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
                                        {!readOnly && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newVouchers = (formData.paymentVouchers || []).filter((_, i) => i !== idx);
                                                    setFormData({ ...formData, paymentVouchers: newVouchers });
                                                }}
                                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {!readOnly && (
                                    <label 
                                        className="w-28 sm:w-48 aspect-square sm:aspect-3/2 rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group/up active:scale-95"
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.add('border-primary', 'bg-primary/10');
                                        }}
                                        onDragLeave={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                                            const files = e.dataTransfer.files;
                                            if (files && files.length > 0) {
                                                handleFileUpload(files, 'payment');
                                            }
                                        }}
                                    >
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => handleFileUpload(e.target.files!, 'payment')}
                                            disabled={isUploadingVoucher}
                                        />
                                        <Camera size={24} className={`${isUploadingVoucher ? 'animate-spin' : 'text-muted-foreground group-hover/up:text-primary'} transition-colors`} />
                                        <div className="flex flex-col items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground group-hover/up:text-primary">
                                                {isUploadingVoucher ? "上传中..." : "上传凭证"}
                                            </span>
                                            <span className="text-[10px] scale-90 text-muted-foreground/40">支持拖拽</span>
                                        </div>
                                    </label>
                                )}
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
                                    <div className="flex items-center gap-3">
                                        {formData.trackingData && formData.trackingData.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isConfirmingClear) {
                                                        setFormData({ ...formData, trackingData: [] });
                                                        setIsConfirmingClear(false);
                                                    } else {
                                                        setIsConfirmingClear(true);
                                                    }
                                                }}
                                                className={cn(
                                                    "text-[10px] font-bold transition-all flex items-center gap-1 rounded-md px-2 py-1",
                                                    isConfirmingClear 
                                                        ? "bg-destructive text-white hover:bg-destructive/90" 
                                                        : "text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                                                )}
                                            >
                                                <Trash2 size={12} />
                                                {isConfirmingClear ? "确认清空?" : "清空包裹"}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={addTrackingRow}
                                            className="text-[10px] font-bold text-orange-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                                        >
                                            <Plus size={12} />
                                            添加包裹
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="space-y-4">
                                {(formData.trackingData || [])
                                  .filter(tracking => !readOnly || (tracking.number || (tracking.waybillImages && tracking.waybillImages.length > 0) || tracking.waybillImage))
                                  .map((tracking, index) => {
                                      const isEditable = !readOnly && formData.status !== "Received";
                                      return (
                                          /* Responsive Tracking Bar */
                                          <div key={index} className="group/tbar relative flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-3 sm:p-2.5 rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/40 hover:bg-muted/40 dark:hover:bg-white/10 transition-all duration-300 shadow-sm backdrop-blur-sm">
                                              
                                              {/* Mobile Top Row / Desktop Flex Items */}
                                              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 w-full sm:w-auto sm:flex-1 min-w-0">
                                                  {/* 1. Package Label */}
                                                  <div className="flex items-center gap-1.5 shrink-0 pl-1 w-auto sm:w-[80px]">
                                                      <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary shrink-0">
                                                          <Package size={12} />
                                                      </div>
                                                      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60 truncate">#{index + 1}</span>
                                                  </div>

                                                  {/* Courier Select */}
                                                  <div className="flex-1 sm:flex-none sm:w-[120px] min-w-[100px] shrink-0">
                                                      <div className="relative">
                                                          {isEditable ? (
                                                              <CustomSelect
                                                                  className="h-9 w-full"
                                                                  value={tracking.courier}
                                                                  onChange={(val) => updateTrackingData(index, "courier", val)}
                                                                  options={["顺丰速运", "圆通速递", "中通快递", "申通快递", "韵达快递", "极兔速递", "EMS", "京东快递", "德邦快递", "安能物流", "顺心捷达"].map(opt => ({
                                                                      value: opt,
                                                                      label: opt
                                                                  }))}
                                                                  triggerClassName="bg-white dark:bg-white/5 border-border dark:border-white/10 rounded-xl text-xs font-bold text-foreground hover:bg-muted dark:hover:bg-white/10 transition-all px-3"
                                                              />
                                                          ) : (
                                                              <div className="h-9 flex items-center px-3 bg-white/50 dark:bg-white/2 border border-border/50 dark:border-white/3 rounded-xl text-xs font-bold text-foreground/60">
                                                                  {tracking.courier}
                                                              </div>
                                                          )}
                                                      </div>
                                                  </div>

                                                  {/* Tracking Number Input */}
                                                  <div className="w-full sm:w-[160px] md:w-[220px] shrink-0">
                                                      <div className="relative group/input">
                                                          {isEditable ? (
                                                              <input
                                                                  type="text"
                                                                  value={tracking.number}
                                                                  onChange={(e) => updateTrackingData(index, "number", e.target.value)}
                                                                  className="w-full h-9 bg-white dark:bg-white/5 border border-border dark:border-white/10 rounded-xl px-3 text-xs font-mono font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/30"
                                                                  placeholder="输入物流单号"
                                                              />
                                                          ) : (
                                                              <div className="h-9 flex items-center px-3 bg-white/50 dark:bg-white/2 border border-border/50 dark:border-white/3 rounded-xl text-xs font-mono font-bold text-foreground/60 min-w-0">
                                                                  <span className="flex-1 truncate tracking-wider">{tracking.number || "无单号"}</span>
                                                                  {tracking.number && (
                                                                      <button
                                                                          type="button"
                                                                          onClick={() => {
                                                                              navigator.clipboard.writeText(tracking.number);
                                                                              showToast("单号已复制", "success");
                                                                          }}
                                                                          className="p-1.5 rounded-md bg-background/50 dark:bg-white/5 text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all ml-2 shrink-0"
                                                                      >
                                                                          <Copy size={12} />
                                                                      </button>
                                                                  )}
                                                              </div>
                                                          )}
                                                      </div>
                                                  </div>
                                              </div>

                                              {/* 3. Horizontal Waybills List & Delete */}
                                              <div className="flex flex-row items-center gap-2 w-full sm:flex-1 sm:min-w-[80px] shrink-0 sm:justify-end mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-border/20 sm:border-0 border-dashed">
                                                  <div 
                                                      className="flex items-center sm:justify-end gap-2 flex-1 overflow-x-auto no-scrollbar scroll-smooth h-10"
                                                      onDragOver={(e) => {
                                                          if (!isEditable) return;
                                                          e.preventDefault();
                                                      }}
                                                      onDrop={(e) => {
                                                          if (!isEditable) return;
                                                          e.preventDefault();
                                                          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                                              handleFileUpload(e.dataTransfer.files, 'waybill', index);
                                                          }
                                                      }}
                                                  >
                                                      {(() => {
                                                          const images = tracking.waybillImages || (tracking.waybillImage ? [tracking.waybillImage] : []);
                                                          return (
                                                              <>
                                                                  {/* Render existing images horizontally */}
                                                                  {images.map((img, imgIndex) => (
                                                                      <div key={imgIndex} className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shrink-0 group/thumbnail border border-border/20 shadow-sm">
                                                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                          <img 
                                                                              src={img} 
                                                                              alt={`Waybill ${imgIndex + 1}`} 
                                                                              className="w-full h-full object-cover cursor-zoom-in hover:scale-110 transition-transform"
                                                                              onClick={() => {
                                                                                  const flatImages = formData.trackingData?.flatMap(t => 
                                                                                      t.waybillImages && t.waybillImages.length > 0 ? t.waybillImages : (t.waybillImage ? [t.waybillImage] : [])
                                                                                  ) || [];
                                                                                  const targetIndex = flatImages.indexOf(img);
                                                                                  setGalleryState({ isOpen: true, images: flatImages, currentIndex: targetIndex });
                                                                              }}
                                                                          />
                                                                          {isEditable && (
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={(e) => {
                                                                                      e.stopPropagation();
                                                                                      const current = [...(formData.trackingData || [])];
                                                                                      const originalImages = current[index].waybillImages || (current[index].waybillImage ? [current[index].waybillImage as string] : []);
                                                                                      const newImages = [...originalImages];
                                                                                      newImages.splice(imgIndex, 1);
                                                                                      current[index] = { ...current[index], waybillImages: newImages };
                                                                                      if (newImages.length === 0) current[index].waybillImage = undefined;
                                                                                      setFormData({ ...formData, trackingData: current });
                                                                                  }}
                                                                                  className="absolute top-0.5 right-0.5 bg-red-500/90 text-white flex items-center justify-center p-0.5 rounded-md opacity-0 group-hover/thumbnail:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                                                                  title="删除此面单"
                                                                              >
                                                                                  <X size={12} />
                                                                              </button>
                                                                          )}
                                                                      </div>
                                                                  ))}

                                                                  {/* Upload Dropzone / Trigger */}
                                                                  {isEditable && (
                                                                      <label 
                                                                          className={cn(
                                                                              "flex items-center justify-center shrink-0 h-9 sm:h-10 rounded-xl transition-all duration-300 cursor-pointer group/up bg-muted/30",
                                                                              images.length > 0 
                                                                                  ? "w-9 sm:w-10 border border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5" 
                                                                                  : "flex-1 max-w-[120px] border border-dashed border-border/80 hover:border-primary/50 hover:bg-primary/5"
                                                                          )}
                                                                          title="点击或拖拽上传面单"
                                                                      >
                                                                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files!, 'waybill', index)} />
                                                                          <div className="flex items-center justify-center gap-1.5 px-2">
                                                                              <Camera size={14} className="text-muted-foreground/40 group-hover/up:text-primary transition-colors shrink-0" />
                                                                              {images.length === 0 && (
                                                                                  <span className="text-[10px] font-bold text-muted-foreground/40 group-hover/up:text-primary/70 truncate hidden sm:inline-block">面单凭证</span>
                                                                              )}
                                                                          </div>
                                                                      </label>
                                                                  )}
                                                                  
                                                                  {/* Read-only empty state */}
                                                                  {!isEditable && images.length === 0 && (
                                                                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-muted/50 border border-border/20 shrink-0">
                                                                          <Camera size={14} className="text-muted-foreground/20" />
                                                                      </div>
                                                                  )}
                                                              </>
                                                          );
                                                      })()}
                                                  </div>

                                                  {isEditable && (
                                                      <div className="shrink-0 flex items-center justify-center absolute sm:relative top-2 sm:top-0 right-2 sm:right-0">
                                                          <button
                                                              type="button"
                                                              onClick={() => {
                                                                  if (confirmingDeleteIndex === index) {
                                                                      removeTrackingRow(index);
                                                                      setConfirmingDeleteIndex(null);
                                                                  } else {
                                                                      setConfirmingDeleteIndex(index);
                                                                  }
                                                              }}
                                                              className={cn(
                                                                  "w-auto min-w-[32px] h-8 px-2 rounded-xl transition-all flex items-center justify-center gap-1",
                                                                  confirmingDeleteIndex === index
                                                                      ? "bg-red-500 text-white shadow-sm opacity-100"
                                                                      : "text-red-500/40 hover:text-red-500 hover:bg-red-500/10 sm:opacity-0 group-hover/tbar:opacity-100"
                                                              )}
                                                              title={confirmingDeleteIndex === index ? "点击确定删除" : "移除包裹"}
                                                          >
                                                              <Trash2 size={14} />
                                                              {confirmingDeleteIndex === index && <span className="text-[10px] font-bold">确认删除</span>}
                                                          </button>
                                                      </div>
                                                  )}
                                              </div>
                                          </div>
                                      );
                                  })
                                }
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

                {/* Modern Footer Summary Panel */}
                <div className="bg-muted/30 dark:bg-white/5 border-t border-border/10 p-3 sm:p-4 px-4 sm:px-8 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-6">
                        {/* Fee Pills Group - Horizontal Scroll on Mobile */}
                        {!isSystemGenerated && formData.type !== "Inbound" && (
                            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 py-0.5 sm:mx-0 sm:px-0 sm:py-0">
                                {/* Shipping Pill */}
                                <div className="flex shrink-0 items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-border/50 shadow-sm transition-all hover:border-orange-500/30 group">
                                    <div className="p-1 rounded-full bg-orange-500/10 text-orange-500">
                                        <Truck size={10} />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground/60">运费</span>
                                    {readOnly ? (
                                        <span className="text-xs font-mono font-black text-foreground">￥{formData.shippingFees}</span>
                                    ) : (
                                        <div className="flex items-center text-xs font-mono font-black border-none outline-none">
                                            <span className="text-[9px] opacity-40">￥</span>
                                            <input 
                                                type="number" 
                                                value={shippingFeeInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setShippingFeeInput(val);
                                                    setFormData({...formData, shippingFees: parseFloat(val) || 0});
                                                }}
                                                className="w-10 sm:w-12 bg-transparent text-foreground outline-none no-spinner p-0 h-auto"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Extra Pill */}
                                <div className="flex shrink-0 items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/50 dark:bg-white/5 border border-border/50 shadow-sm transition-all hover:border-blue-500/30 group">
                                    <div className="p-1 rounded-full bg-blue-500/10 text-blue-500">
                                        <Plus size={10} />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground/60">其它</span>
                                    {readOnly ? (
                                        <span className="text-xs font-mono font-black text-foreground">￥{formData.extraFees}</span>
                                    ) : (
                                        <div className="flex items-center text-xs font-mono font-black border-none outline-none">
                                            <span className="text-[9px] opacity-40">￥</span>
                                            <input 
                                                type="number" 
                                                value={extraFeeInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setExtraFeeInput(val);
                                                    setFormData({...formData, extraFees: parseFloat(val) || 0});
                                                }}
                                                className="w-10 sm:w-12 bg-transparent text-foreground outline-none no-spinner p-0 h-auto"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Discount Pill */}
                                <div className="flex shrink-0 items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-amber-500/5 border border-amber-500/20 shadow-sm transition-all hover:border-amber-500/40 group">
                                    <div className="p-1 rounded-full bg-amber-500/10 text-amber-500">
                                        <Minus size={10} />
                                    </div>
                                    <span className="text-[10px] font-bold text-amber-600/60 dark:text-amber-400/40">折扣</span>
                                    {readOnly ? (
                                        <span className="text-xs font-mono font-black text-amber-600 dark:text-amber-400">￥{formData.discountAmount || 0}</span>
                                    ) : (
                                        <div className="flex items-center text-xs font-mono font-black border-none outline-none">
                                            <span className="text-[9px] opacity-40 text-amber-500/50">￥</span>
                                            <input 
                                                type="number" 
                                                value={discountInput}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setDiscountInput(val);
                                                    setFormData({...formData, discountAmount: parseFloat(val) || 0});
                                                }}
                                                className="w-10 sm:w-12 bg-transparent text-amber-700 dark:text-amber-300 outline-none no-spinner p-0 h-auto"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Total & Primary Action Container */}
                        <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8">
                            {/* Final Total */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-0 sm:gap-3">
                                <span className="text-[8px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">实付总计</span>
                                <div className="flex items-baseline gap-0.5 sm:gap-1">
                                    <span className="text-[10px] sm:text-xs font-bold text-primary">￥</span>
                                    <span className="text-xl sm:text-2xl font-black text-foreground font-mono tabular-nums leading-none">
                                        {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </span>
                                </div>
                            </div>

                            {/* Actions Container */}
                            {!readOnly && (
                                <div className="flex items-center gap-2 sm:border-l sm:border-border/10 sm:pl-6 h-9 sm:h-10">
                                    {(formData.status === "Draft" || (formData.status as string) === "Confirmed" || (formData.status as string) === "Ordered" || formData.status === "Shipped") && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleAction("Draft", true)}
                                                className="px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-xl transition-all"
                                            >
                                                {formData.status === "Draft" ? "暂存草稿" : "保存修改"}
                                            </button>
                                            
                                            {formData.status === "Shipped" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAction("Received")}
                                                    disabled={!isShippedAndReady}
                                                    className={cn(
                                                        "px-6 sm:px-8 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-black transition-all shadow-lg",
                                                        isShippedAndReady 
                                                            ? "bg-emerald-500 text-white shadow-emerald-500/20 hover:scale-[1.02]" 
                                                            : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
                                                    )}
                                                >
                                                    确认入库
                                                </button>
                                            ) : (
                                                <button
                                                    type="submit"
                                                    className="px-4 sm:px-6 py-2 sm:py-2.5 bg-primary text-primary-foreground text-[10px] sm:text-xs font-black rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5 sm:gap-2"
                                                >
                                                    <CheckCircle size={14} className="hidden sm:block" />
                                                    {(() => {
                                                        const inferred = inferStatus(formData);
                                                        if (inferred === "Shipped") return "保存并完成发货";
                                                        if (inferred === "Confirmed") return "确认下单";
                                                        return "保存修改";
                                                    })()}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
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
