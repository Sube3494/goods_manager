"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Minus, Plus, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Product, OutboundOrder, Shop } from "@/lib/types";
import { createPortal } from "react-dom";
import Image from "next/image";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useDebounce } from "@/hooks/useDebounce";

interface SelectedOutboundItem {
  productId?: string | null;
  shopProductId?: string;
  shopName?: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  image: string;
  stock: number;
}

interface OutboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<OutboundOrder>) => void;
}

export function OutboundModal({ isOpen, onClose, onSubmit }: OutboundModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [selectedItems, setSelectedItems] = useState<SelectedOutboundItem[]>([]);
  const [type, setType] = useState("Sale");
  const [note, setNote] = useState("");
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const [mobileView, setMobileView] = useState<"selection" | "review">("selection");
  const getItemKey = useCallback(
    (item: { productId?: string | null; shopProductId?: string | null }) => item.shopProductId || item.productId || "",
    []
  );

  const fetchProducts = useCallback(async (mode: 'initial' | 'search' | 'next' = 'initial') => {
    if (mode === 'initial') {
      setIsLoadingProducts(true);
      pageRef.current = 1;
    } else if (mode === 'search') {
      setIsSearching(true);
      pageRef.current = 1;
    } else {
      setIsNextPageLoading(true);
    }

    try {
      const targetPage = pageRef.current;
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        pageSize: "20",
        search: debouncedSearch,
        sortBy: "stock-desc",
        ...(selectedShopId ? { shopId: selectedShopId } : {}),
      });

      const res = await fetch(`/api/purchase-products?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newItems = Array.isArray(data.items) ? data.items : [];
        
        if (mode === 'initial' || mode === 'search') {
          setProducts(newItems);
        } else {
          setProducts(prev => {
            const existingIds = new Set(prev.map(i => i.id));
            return [...prev, ...newItems.filter((i: Product) => !existingIds.has(i.id))];
          });
        }
        
        setHasMore(data.hasMore);
        pageRef.current = targetPage + 1;
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setIsLoadingProducts(false);
      setIsSearching(false);
      setIsNextPageLoading(false);
    }
  }, [debouncedSearch, selectedShopId]);

  useEffect(() => {
    if (isOpen) {
      fetchProducts('initial');
    } else {
      setSelectedItems([]);
      setShops([]);
      setSelectedShopId("");
      setSearchQuery("");
      setNote("");
      setType("Sale");
      setMobileView("selection");
    }
  }, [isOpen, fetchProducts]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops");
        if (!res.ok) return;
        const data = await res.json();
        const items = Array.isArray(data?.shops) ? data.shops : [];
        setShops(items);
        setSelectedShopId((prev) => {
          if (prev && items.some((shop: Shop) => shop.id === prev)) {
            return prev;
          }
          return items[0]?.id || "";
        });
      } catch (error) {
        console.error("Failed to fetch shops:", error);
      }
    };

    fetchShops();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isLoadingProducts) return;
    fetchProducts('search');
  }, [debouncedSearch, isOpen, isLoadingProducts, fetchProducts]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedItems([]);
  }, [selectedShopId, isOpen]);

  useEffect(() => {
    if (!isOpen || !hasMore || isLoadingProducts || isSearching || isNextPageLoading) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchProducts('next');
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [isOpen, hasMore, isLoadingProducts, isSearching, isNextPageLoading, fetchProducts]);

  const addItem = (product: Product) => {
    const itemKey = product.shopProductId || product.id;
    const existing = selectedItems.find(item => getItemKey(item) === itemKey);
    if (existing) {
      // If already exists, just show a hint or remove it to toggle? 
      // User said "above it should be selection", usually toggle is better for selection list
      removeItem(itemKey);
      return;
    }
    
    if (product.stock <= 0) {
        showToast("库存不足，无法出库", "error");
        return;
    }

    setSelectedItems([
      ...selectedItems,
      {
        productId: product.sourceProductId || product.productId || (product.sourceType === "shopProduct" ? null : product.id),
        shopProductId: product.shopProductId,
        shopName: product.shopName,
        name: product.name,
        sku: product.sku || "",
        quantity: 1,
        price: 0,
        image: product.image || "",
        stock: product.stock
      }
    ]);
  };

  const removeItem = (itemKey: string) => {
    setSelectedItems(selectedItems.filter(item => getItemKey(item) !== itemKey));
  };

  const updateQuantity = (itemKey: string, delta: number) => {
    setSelectedItems(selectedItems.map(item => {
      if (getItemKey(item) === itemKey) {
        const newQty = Math.max(1, Math.min(item.stock, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const handleManualQuantityChange = (itemKey: string, value: string) => {
    const qty = parseInt(value) || 0;
    setSelectedItems(selectedItems.map(item => {
      if (getItemKey(item) === itemKey) {
        return { ...item, quantity: Math.max(0, Math.min(item.stock, qty)) };
      }
      return item;
    }));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (selectedItems.length === 0) {
      showToast("请至少选择一个商品", "error");
      return;
    }

    if (shops.length > 0 && !selectedShopId) {
      showToast("请先选择出库门店", "error");
      return;
    }
    
    if (mobileView === "selection" && window.innerWidth < 768) {
        setMobileView("review");
        return;
    }

    const invalidItem = selectedItems.find(item => item.quantity <= 0);
    if (invalidItem) {
        showToast(`请检查 ${invalidItem.name} 的出库数量`, "error");
        return;
    }

    onSubmit({
      type,
      note: `${selectedShopId ? `[店铺:${shops.find((shop) => shop.id === selectedShopId)?.name || ""}] ` : ""}${note}`.trim(),
      items: selectedItems.map(item => ({
        productId: item.productId,
        shopProductId: item.shopProductId,
        quantity: item.quantity,
        price: item.price
      }))
    });
  };

  const displayProducts = products;

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-9999 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-[calc(100%-32px)] sm:w-full max-w-4xl h-[600px] max-h-safe-modal overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-white/10 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 p-4 sm:p-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10 text-primary hidden sm:block">
                <Plus size={24} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground">
                    {mobileView === "review" ? "确认出库清单" : "选择出库商品"}
                </h2>
                <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">记录销售、领用或库存损耗，并自动从账目中扣减余值。</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
                {mobileView === "review" && (
                    <button 
                        onClick={() => setMobileView("selection")}
                        className="text-xs font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/10 md:hidden"
                    >
                        继续选择
                    </button>
                )}
                <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-white/5 transition-colors">
                  <X size={20} />
                </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            {/* Left/Selection: Product Selection */}
            <div className={`w-full md:w-80 border-r border-border dark:border-white/5 flex flex-col justify-between bg-muted/10 ${mobileView === "review" ? "hidden md:flex" : "flex"}`}>
              <div className="p-4 sm:p-5">
                <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">快速查找</label>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="输入名称或 SKU..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-border dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-scroll p-2 space-y-1 relative scrollbar-none sm:scrollbar-thin">

                {(isLoadingProducts || isSearching) ? (
                    <div className="py-10 text-center flex flex-col items-center justify-center gap-3">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-muted-foreground font-medium">
                            {isSearching ? "正在搜索..." : "正在加载商品..."}
                        </span>
                    </div>
                ) : displayProducts.length > 0 ? (
                  <>
                    {displayProducts.map(p => {
                      const itemKey = p.shopProductId || p.id;
                      const isSelected = selectedItems.some(item => getItemKey(item) === itemKey);
                      return (
                          <button
                            key={itemKey}
                            onClick={() => addItem(p)}
                            className={`w-full text-left p-2 rounded-xl transition-all ${isSelected ? 'bg-primary/10 border-primary/20 ring-1 ring-primary/20 shadow-inner' : 'hover:bg-white dark:hover:bg-white/5 group'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="relative h-10 w-10 rounded-lg overflow-hidden border border-white/10 bg-muted shrink-0 shadow-sm">
                                 {p.image ? <Image src={p.image} alt={p.name} fill className="object-cover" /> : <Package className="w-full h-full p-2 text-muted-foreground/40" />}
                                 {isSelected && (
                                     <div className="absolute inset-0 bg-primary/10 ring-2 ring-inset ring-primary/20" />
                                 )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs truncate ${isSelected ? 'text-primary font-medium' : 'text-foreground'}`} title={p.name}>{p.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate font-mono uppercase tracking-tighter">{p.sku}</p>
                                {p.shopName && (
                                  <p className="text-[10px] text-blue-500/80 truncate mt-0.5">门店: {p.shopName}</p>
                                )}
                              </div>
                               <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-all ${isSelected ? 'bg-primary/20 text-primary border border-primary/20 shadow-sm' : 'bg-muted text-muted-foreground border border-transparent'}`}>
                                  库存 {p.stock}
                              </div>
                            </div>
                          </button>
                      );
                    })}
                    
                    {/* Infinite scroll trigger */}
                    <div ref={observerTarget} className="h-10 flex items-center justify-center">
                      {isNextPageLoading && (
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      )}
                    </div>
                  </>
                ) : (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                        <div className="p-4 rounded-full bg-muted/20 text-muted-foreground/20 border border-dashed border-border">
                            <Package size={32} />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-foreground">未找到匹配商品</p>
                            <p className="text-xs text-muted-foreground italic">换个关键词试试？</p>
                        </div>
                    </div>
                )}
              </div>

              {/* Left Side Footer - visible on desktop */}
              <div className={`p-4 sm:p-5 shrink-0 flex-col gap-0.5 border-t border-white/5 md:border-t-0 hidden md:flex`}>
                  <span className="text-xs sm:text-sm font-bold text-foreground">共选择 {selectedItems.length} 项商品</span>
                  <span className="text-[10px] text-muted-foreground">已选清单实时汇总</span>
              </div>


            </div>

            {/* Right: Selected List & Meta */}
            <div className={`flex-1 flex flex-col bg-white dark:bg-gray-900 ${mobileView === "selection" ? "hidden md:flex" : "flex"}`}>
                <div className="flex flex-col h-full overflow-hidden">

                    <div className="p-4 sm:p-5 grid grid-cols-2 gap-4 shrink-0">


                    <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">出库门店</label>
                        <CustomSelect
                            value={selectedShopId}
                            onChange={setSelectedShopId}
                            options={shops.map((shop) => ({
                              value: shop.id,
                              label: shop.name,
                            }))}
                            placeholder="选择门店"
                            triggerClassName="bg-white dark:bg-gray-800 border border-border dark:border-white/10 rounded-xl px-4 py-2 h-[38px] text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">出库业务类型</label>
                        <CustomSelect 
                            value={type}
                                onChange={(val) => setType(val)}
                                options={[
                                    { value: "Sale", label: "销售出库" },
                                    { value: "Sample", label: "样板/领用" },
                                    { value: "Loss", label: "库存损耗" },
                                    { value: "Return", label: "退货出库" }
                                ]}
                                triggerClassName="bg-white dark:bg-gray-800 border border-border dark:border-white/10 rounded-xl px-4 py-2 h-[38px] text-sm"
                            />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">备注信息</label>
                            <input 
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="选填..."
                                className="w-full bg-white dark:bg-gray-800 border border-border dark:border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>
                    </div>


                    <div className="flex-1 overflow-y-auto p-4 bg-muted/5">
                        <div className="space-y-3">
                            {selectedItems.length > 0 ? (
                                selectedItems.map(item => (
                                    <div key={getItemKey(item)} className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl border border-white/5 bg-white dark:bg-gray-800/40 group shadow-sm">
                                        <div className="relative h-12 w-12 rounded-xl overflow-hidden border border-white/10 bg-muted shrink-0 shadow-sm">
                                            {item.image ? <Image src={item.image} alt={item.name} fill className="object-cover" /> : <Package className="w-full h-full p-3 text-muted-foreground/40" />}
                                        </div>
                                        <div className="flex-1 min-w-0 py-0.5">
                                            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2" title={item.name}>
                                                {item.name}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 opacity-60">
                                                {item.sku}
                                            </p>
                                            {item.shopName && (
                                                <p className="text-[10px] text-blue-500/80 mt-0.5">{item.shopName}</p>
                                            )}
                                        </div>
                                         <div className="flex items-center bg-muted/30 rounded-lg border border-white/5 p-0.5 ml-auto">
                                             <button 
                                                 type="button"
                                                 onClick={() => updateQuantity(getItemKey(item), -1)}
                                                 className="p-1 rounded-md hover:bg-white dark:hover:bg-white/10 text-muted-foreground transition-colors"
                                             >
                                                 <Minus size={12} />
                                             </button>
                                             <input 
                                                 type="number"
                                                 value={item.quantity}
                                                 onChange={(e) => handleManualQuantityChange(getItemKey(item), e.target.value)}
                                                 className="w-8 text-center text-[11px] font-bold bg-transparent no-spinner outline-none"
                                             />
                                             <button 
                                                 type="button"
                                                 onClick={() => updateQuantity(getItemKey(item), 1)}
                                                 className="p-1 rounded-md hover:bg-white dark:hover:bg-white/10 text-muted-foreground transition-colors"
                                             >
                                                 <Plus size={12} />
                                             </button>
                                         </div>
                                        <button 
                                            type="button"
                                            onClick={() => removeItem(getItemKey(item))}
                                            className="p-2 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="py-20 flex flex-col items-center justify-center text-center">
                                    <div className="p-4 rounded-full bg-muted/20 text-muted-foreground/30 mb-4 border border-dashed border-border dark:border-white/10">
                                        <Package size={32} />
                                    </div>
                                    <p className="text-sm text-muted-foreground max-w-[200px]">
                                        {window.innerWidth < 768 && mobileView === "review" ? "清单为空，请返回选择商品" : "请从商品列表选择需要出库的商品"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                  {/* Right Side Footer Area - Desktop Only */}
                  <div className="p-4 sm:p-5 border-t border-border dark:border-white/5 shrink-0 hidden md:block">
                      <button
                          onClick={handleSubmit}
                          disabled={selectedItems.length === 0}
                          className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold shadow-xl shadow-primary/20 hover:shadow-primary/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                      >
                          <CheckCircle size={20} />
                          <span>确认并减扣库存</span>
                      </button>
                  </div>
                </div>
            </div>
          </div>

          {/* Mobile Bottom Bar - Fixed at bottom of modal body */}
          <div className="md:hidden border-t border-white/5 p-4 bg-white dark:bg-gray-900 shrink-0">
              <div className="flex items-center justify-between mb-3">
                  <div className="flex flex-col">
                      <span className="text-xs font-bold text-foreground">共选择 {selectedItems.length} 项商品</span>
                      <span className="text-[10px] text-muted-foreground">清单实时更新</span>
                  </div>
                  {mobileView === "review" && (
                    <button 
                        onClick={() => setMobileView("selection")}
                        className="text-[10px] font-bold text-primary"
                    >
                        返回修改
                    </button>
                  )}
              </div>
              <button
                  onClick={handleSubmit}
                  disabled={selectedItems.length === 0}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-xl shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                  {mobileView === "selection" ? (
                      <>
                          <span>确认清单并下一步</span>
                          <Plus size={18} className="rotate-45" />
                      </>
                  ) : (
                      <>
                          <CheckCircle size={18} />
                          <span>确认出库并扣减库存</span>
                      </>
                  )}
              </button>
          </div>


        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
