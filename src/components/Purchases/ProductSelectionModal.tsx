"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Package, Tag, Truck, Plus } from "lucide-react";
import { Product, Supplier, GalleryItem } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";


import { getCategoryName } from "@/lib/utils";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (products: Product[]) => void;
  selectedIds: string[];
  singleSelect?: boolean;
  showPrice?: boolean;
}

function ProductSkeleton() {
  return (
    <div className="flex items-center gap-5 p-4 rounded-2xl border border-border/60 bg-white dark:bg-white/5 animate-pulse">
      <div className="h-12 w-12 rounded-lg bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/2 bg-muted rounded" />
        <div className="h-3 w-1/4 bg-muted rounded" />
      </div>
    </div>
  );
}

export function ProductSelectionModal({ isOpen, onClose, onSelect, selectedIds, singleSelect = false, showPrice = true }: ProductSelectionModalProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { showToast } = useToast();
  const observerTarget = useRef<HTMLDivElement>(null);

  // 1. Sync selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedIds(selectedIds);
      setSelectedProducts([]); // Clear temporary session selections
      setSearchQuery("");
      setSelectedSupplierId("");
    }
  }, [isOpen, selectedIds]);

   const fetchData = useCallback(async (mode: 'initial' | 'search' | 'next' = 'initial') => {
    if (mode === 'initial') {
      setIsLoading(true);
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
      });

      const [pRes, sRes] = await Promise.all([
        fetch(`/api/products?${queryParams.toString()}`),
        mode === 'initial' ? fetch("/api/suppliers") : Promise.resolve(null)
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        const newItems = Array.isArray(pData.items) ? pData.items : [];
        
        if (mode === 'initial' || mode === 'search') {
          setProducts(newItems);
        } else {
          setProducts(prev => {
            const existingIds = new Set(prev.map(i => i.id));
            return [...prev, ...newItems.filter((i: Product) => !existingIds.has(i.id))];
          });
        }
        
        setHasMore(pData.hasMore);
        pageRef.current = targetPage + 1;
      }

      if (sRes && sRes.ok) {
        setSuppliers(await sRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch products or suppliers:", error);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
      setIsNextPageLoading(false);
    }
  }, [debouncedSearch]);

  // 2. Data fetching when modal opens
  useEffect(() => {
    if (!isOpen) return;
    fetchData('initial');
  }, [isOpen, fetchData]);

  // 3. Search change (debounced)
  useEffect(() => {
    if (!isOpen || isLoading) return; // Skip if modal just opened (handled by initial)
    fetchData('search');
  }, [debouncedSearch, isOpen, isLoading, fetchData]);

  // 4. Infinite scroll observer
  useEffect(() => {
    if (!isOpen || !hasMore || isLoading || isSearching || isNextPageLoading) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          fetchData('next');
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [isOpen, hasMore, isLoading, isSearching, isNextPageLoading, fetchData]);

  const handleQuickCreate = async (data: Partial<Product>, galleryItems?: GalleryItem[]) => {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const product = await res.json();
        
        // Handle gallery items persistence
        if (galleryItems && galleryItems.length > 0) {
          const tempItems = galleryItems.filter(item => item.id.startsWith('temp-'));
          if (tempItems.length > 0) {
            await fetch("/api/gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: product.id,
                urls: tempItems.map(item => ({ url: item.url, type: item.type }))
              })
            });
          }
        }

        showToast("商品创建成功", "success");
        setIsCreateModalOpen(false);
        
        // Refresh and auto-select
        await fetchData();
        toggleProduct(product.id);
      } else {
        showToast("创建失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    }
  };

  const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
    // Backend already handles search, but we apply supplier filter on top of it 
    // since backend doesn't support supplierId param yet
    const matchesSupplier = !selectedSupplierId || p.supplierId === selectedSupplierId;
    return matchesSupplier;
  });

  const toggleProduct = (product: Product) => {
    const id = product.id;
    if (singleSelect) {
        setTempSelectedIds([id]);
        setSelectedProducts([product]);
    } else {
        setTempSelectedIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) {
                return prev.filter(i => i !== id);
            } else {
                return [...prev, id];
            }
        });
        
        setSelectedProducts(prev => {
            const isSelected = prev.some(p => p.id === id);
            if (isSelected) {
                return prev.filter(p => p.id !== id);
            } else {
                return [...prev, product];
            }
        });
    }
  };

  const handleConfirm = () => {
    onSelect(selectedProducts);
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10000 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-10001 w-[calc(100%-32px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
             <div className="flex items-center justify-between border-b border-border/50 p-8 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-medium text-foreground">选择商品</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/40 active:scale-95 transition-all text-xs font-medium border border-primary/20"
                    title="新添商品"
                  >
                    <Plus size={14} /> 新添商品
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={onClose} 
                  className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-90"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-8 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                 <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="搜索商品名称或编号..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-11 pr-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary/20 transition-all dark:hover:bg-white/10 text-sm"
                  />
                </div>

                <div className="w-full sm:w-56 shrink-0">
                  <CustomSelect
                    options={[
                      { value: "", label: "全部供应商" },
                      ...suppliers.map(s => ({ value: s.id, label: s.name }))
                    ]}
                    value={selectedSupplierId}
                    onChange={setSelectedSupplierId}
                    placeholder="按供应商筛选"
                    triggerClassName="h-11 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0 relative">
                 {isLoading ? (
                    <div className="space-y-2">
                        {[...Array(6)].map((_, i) => (
                           <ProductSkeleton key={i} />
                        ))}
                    </div>
                 ) : (
                    <div className={cn("space-y-2 transition-opacity duration-200", isSearching && "opacity-50 pointer-events-none")}>
                    {filteredProducts.map(product => {
                      const isSelected = tempSelectedIds.includes(product.id);
                      return (
                         <div 
                          key={product.id}
                          onClick={() => toggleProduct(product)}
                            className={cn(
                             "group relative flex items-center gap-5 p-4 rounded-2xl border transition-all cursor-pointer",
                             isSelected 
                               ? "bg-white dark:bg-white/5 border-primary shadow-md" 
                               : "bg-white dark:bg-white/5 border-border/60 shadow-sm hover:border-primary/20 hover:bg-zinc-50 dark:hover:bg-white/10"
                           )}
                        >
                          {/* Circular Checkbox/Radio Top-Right - enlarged for usability */}
                          <div className={cn(
                            "absolute top-3 right-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all z-10 shadow-xl hover:scale-110",
                            isSelected 
                              ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20" 
                              : "bg-black/20 dark:bg-black/40 border-white/50 backdrop-blur-sm"
                          )}>
                            {isSelected && <Check size={14} strokeWidth={3.5} />}
                          </div>

                          <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50 relative">
                            {product.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <Package size={20} />
                                </div>
                            )}
                          </div>
                          
                           <div className="flex-1 min-w-0 flex flex-col justify-center py-1 pr-10">
                            <div className="flex items-center gap-2">
                               <span className={`text-[15px] font-medium truncate leading-snug ${isSelected ? "text-primary" : "text-foreground"}`}>{product.name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded text-muted-foreground font-mono shrink-0">
                                  {product.sku ? product.sku : `REF__${product.id.slice(0, 6)}`}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate opacity-70">
                                    <Tag size={12} className="shrink-0" /> {getCategoryName(product.category)}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate opacity-70">
                                    <Truck size={12} className="shrink-0" /> {suppliers.find(s => s.id === product.supplierId)?.name || "未知供应商"}
                                </span>
                            </div>
                             {showPrice && (
                                <div className="mt-1.5">
                                <span className="text-sm font-medium text-primary">
                                    ￥{product.costPrice}
                                </span>
                                </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                     {filteredProducts.length === 0 && !isLoading && !isSearching && (
                        <div className="py-12 text-center text-muted-foreground">
                            未找到相关商品
                        </div>
                    )}
                    
                    {hasMore && !isLoading && !isSearching && (
                      <div ref={observerTarget} className="flex justify-center py-6">
                        {isNextPageLoading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                            <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                            加载更多...
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                 )}
                </div>
            </div>

             <div className="flex items-center justify-between border-t border-border/50 p-8 shrink-0 bg-zinc-50/50 dark:bg-white/5">
              <div className="text-sm font-medium text-muted-foreground">
                已选择 <span className="text-primary font-medium">{tempSelectedIds.length}</span> 项
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={onClose} 
                  className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-95"
                >
                  取消
                </button>
                <button 
                  onClick={handleConfirm}
                  className="bg-primary text-primary-foreground px-8 py-2.5 rounded-xl text-sm font-medium shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all"
                >
                  确认添加
                </button>
              </div>
            </div>
          </motion.div>
          
          <ProductFormModal 
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSubmit={handleQuickCreate}
          />
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
