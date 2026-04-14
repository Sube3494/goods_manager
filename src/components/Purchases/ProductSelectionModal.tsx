"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, Search, Check, Package, Plus } from "lucide-react";
import { Product, Supplier, GalleryItem } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (products: Product[], platform: string) => void;
  selectedIds: string[];
  selectedBadgeLabel?: string;
  singleSelect?: boolean;
  showPrice?: boolean;
  fetchPath?: string;
  title?: string;
  allowCreate?: boolean;
  showPlatformSelector?: boolean;
  imageOnly?: boolean;
  minimalView?: boolean;
  query?: Record<string, string>;
  createPayload?: Record<string, unknown>;
  emptyStateText?: string;
}

function ProductSkeleton({ imageOnly = false }: { imageOnly?: boolean }) {
  if (imageOnly) {
    return <div className="aspect-square rounded-2xl border border-border/60 bg-white dark:bg-white/5 animate-pulse" />;
  }

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

export function ProductSelectionModal({
  isOpen,
  onClose,
  onSelect,
  selectedIds,
  selectedBadgeLabel = "已在计划中",
  singleSelect = false,
  showPrice = true,
  fetchPath = "/api/products",
  title = "选择商品",
  allowCreate = true,
  showPlatformSelector = true,
  imageOnly = false,
  minimalView = false,
  query,
  createPayload,
  emptyStateText = "未找到相关商品",
}: ProductSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);
  const [showImageName, setShowImageName] = useState(true);
  const [showImageSupplier, setShowImageSupplier] = useState(true);
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { showToast } = useToast();
  const resultsVersion = useRef(0);
  const [mounted] = useState(typeof window !== "undefined");
  const [targetPlatform, setTargetPlatform] = useState("美团");
  const PLATFORMS = ["美团", "淘宝", "京东"];
  const loadingDelayRef = useRef<NodeJS.Timeout | null>(null);


  // 初始化重置逻辑
  useEffect(() => {
    if (isOpen) {
      setTempSelectedIds([]);
      setSelectedProducts([]);
      setSearchQuery("");
      setSelectedSupplierId("");
      setShowImageName(true);
      setShowImageSupplier(true);
      // 不再清空 products，除非是首次初始化或需要强制刷新
      // setProducts([]); 
      setIsLoading(products.length === 0);
      pageRef.current = 1;
      setIsInitialized(true);
    } else {
      setIsInitialized(false);
      setShowInitialSkeleton(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // 移除对 selectedIds 的依赖，因为它可能由于父组件重渲染而导致意外重置

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const fetchData = useCallback(async (mode: 'initial' | 'search' | 'next' = 'initial') => {
    const version = ++resultsVersion.current;
    
    if (mode === 'initial' || mode === 'search') {
      pageRef.current = 1;
      if (mode === 'search') setIsSearching(true);
    } else {
      setIsNextPageLoading(true);
    }

    try {
      const targetPage = pageRef.current;
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        pageSize: "20",
        search: mode === 'initial' ? "" : debouncedSearch,
        ...(query || {}),
      });

      const [pRes, sRes] = await Promise.all([
        fetch(`${fetchPath}?${queryParams.toString()}`),
        mode === 'initial' && !minimalView ? fetch("/api/suppliers") : Promise.resolve(null)
      ]);

      if (version !== resultsVersion.current) return;

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
      if (version === resultsVersion.current) {
        setIsLoading(false);
        setIsSearching(false);
        setIsNextPageLoading(false);
      }
    }
  }, [debouncedSearch, fetchPath, minimalView, query]);

  useEffect(() => {
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = null;
    }

    if (isLoading && products.length === 0) {
      loadingDelayRef.current = setTimeout(() => {
        setShowInitialSkeleton(true);
      }, 180);
    } else {
      setShowInitialSkeleton(false);
    }

    return () => {
      if (loadingDelayRef.current) {
        clearTimeout(loadingDelayRef.current);
        loadingDelayRef.current = null;
      }
    };
  }, [isLoading, products.length]);

  useEffect(() => {
    if (!isOpen || !isInitialized) return;
    fetchData('initial');
  }, [isOpen, isInitialized, fetchData]);

  useEffect(() => {
    if (!isOpen || !isInitialized || isLoading) return; 
    if (debouncedSearch.trim() === "") return;
    fetchData('search');
  }, [debouncedSearch, isOpen, isInitialized, isLoading, fetchData]);

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
        body: JSON.stringify({
          ...data,
          ...(createPayload || {}),
        }),
      });

      if (res.ok) {
        const product = await res.json();
        if (galleryItems && galleryItems.length > 0) {
          const tempItems = galleryItems.filter(item => item.id.startsWith('temp-'));
          if (tempItems.length > 0) {
            await fetch("/api/gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productId: product.id,
                urls: tempItems.map(item => ({
                  url: item.url,
                  thumbnailUrl: item.thumbnailUrl,
                  type: item.type
                }))
              })
            });
          }
        }
        showToast("商品创建成功", "success");
        setIsCreateModalOpen(false);
        await fetchData();
        if (createPayload && typeof createPayload.shopId === "string" && fetchPath === "/api/purchase-products") {
          const scopedQuery = new URLSearchParams({
            page: "1",
            pageSize: "200",
            all: "true",
            shopId: String(createPayload.shopId),
          });
          const scopedRes = await fetch(`${fetchPath}?${scopedQuery.toString()}`);
          const scopedData = await scopedRes.json().catch(() => null);
          const scopedItems = Array.isArray(scopedData?.items) ? scopedData.items : [];
          const createdShopProduct = scopedItems.find((item: Product) => item.sourceProductId === product.id);
          toggleProduct(createdShopProduct || product);
        } else {
          toggleProduct(product);
        }
      } else {
        showToast("创建失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    }
  };

  const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
    const matchesSupplier = !selectedSupplierId || p.supplierId === selectedSupplierId;
    return matchesSupplier;
  });
  const selectableProducts = filteredProducts.filter((product) => !selectedIds.includes(product.sourceProductId || product.id));
  const allFilteredSelected =
    !singleSelect &&
    selectableProducts.length > 0 &&
    selectableProducts.every((product) => tempSelectedIds.includes(product.id));

  const handleToggleSelectAll = async () => {
    if (singleSelect || selectableProducts.length === 0) {
      return;
    }

    if (allFilteredSelected) {
      setTempSelectedIds([]);
      setSelectedProducts([]);
      return;
    }

    try {
      const queryParams = new URLSearchParams({
        page: "1",
        pageSize: "99999",
        all: "true",
        search: debouncedSearch,
        ...(query || {}),
      });

      const res = await fetch(`${fetchPath}?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch all products");
      }

      const data = await res.json();
      const allMatchedProducts = Array.isArray(data.items) ? data.items : [];
      const fullyFilteredProducts = allMatchedProducts.filter((product: Product) => (
        !selectedSupplierId || product.supplierId === selectedSupplierId
      ));
      const fullySelectableProducts = fullyFilteredProducts.filter((product: Product) => !selectedIds.includes(product.sourceProductId || product.id));

      setTempSelectedIds(fullySelectableProducts.map((product: Product) => product.id));
      setSelectedProducts(fullySelectableProducts);
    } catch (error) {
      console.error("Failed to select all products:", error);
      showToast("全选失败", "error");
    }
  };

  const toggleProduct = (product: Product) => {
    const id = product.id;
    if (selectedIds.includes(product.sourceProductId || id)) {
      return;
    }
    if (singleSelect) {
        setTempSelectedIds([id]);
        setSelectedProducts([product]);
    } else {
        setTempSelectedIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) return prev.filter(i => i !== id);
            return [...prev, id];
        });
        
        setSelectedProducts(prev => {
            const isSelected = prev.some(p => p.id === id);
            if (isSelected) return prev.filter(p => p.id !== id);
            return [...prev, product];
        });
    }
  };

  const handleConfirm = () => {
    onSelect(selectedProducts, targetPlatform);
    onClose();
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-60000 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-60001 w-[calc(100%-24px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-safe-modal"
      >
             <div className="flex items-center justify-between border-b border-border/50 p-5 sm:p-8 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-foreground">{title}</h2>
                {allowCreate && (
                  <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/40 active:scale-95 transition-all text-xs font-medium border border-primary/20"
                      title="新添商品"
                    >
                      <Plus size={14} /> 新添商品
                  </button>
                )}
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

            <div className="flex-1 overflow-hidden flex flex-col p-5 sm:p-8 space-y-4">
              <div className="flex items-center gap-3 shrink-0">
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

                {!minimalView && (
                  <div className="w-36 sm:w-44 shrink-0">
                    <CustomSelect
                      options={[
                        { value: "", label: "所有供应商" },
                        ...suppliers.map(s => ({ value: s.id, label: s.name }))
                      ]}
                      value={selectedSupplierId}
                      onChange={setSelectedSupplierId}
                      placeholder="筛选供应商"
                      triggerClassName="h-11 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                    />
                  </div>
                )}
              </div>

              {!singleSelect && filteredProducts.length > 0 && (
                <div className="flex items-center justify-end shrink-0">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="rounded-full border border-border/60 bg-white/5 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-all hover:text-foreground hover:bg-white/10"
                  >
                    {allFilteredSelected ? "取消全选" : "全选当前结果"}
                  </button>
                </div>
              )}

              {imageOnly && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowImageName(prev => !prev)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                      showImageName
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/60 bg-white/5 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    名称
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImageSupplier(prev => !prev)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
                      showImageSupplier
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/60 bg-white/5 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    供应商
                  </button>
                </div>
              )}

              <div className={cn("flex-1 overflow-y-auto no-scrollbar min-h-0 relative", imageOnly ? "" : "space-y-2")}>
                 {(showInitialSkeleton && products.length === 0) ? (
                    <div className={cn(imageOnly ? "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" : "space-y-2")}>
                        {[...Array(6)].map((_, i) => (
                           <ProductSkeleton key={i} imageOnly={imageOnly} />
                        ))}
                    </div>
                 ) : (
                    <div className={cn(imageOnly ? "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" : "space-y-2")}>
                    {filteredProducts.map(product => {
                      const isSelected = tempSelectedIds.includes(product.id);
                      const isAlreadySelected = selectedIds.includes(product.sourceProductId || product.id);
                      return (
                         <button
                          key={product.id}
                          type="button"
                         onClick={() => toggleProduct(product)}
                            disabled={isAlreadySelected}
                            className={cn(
                             imageOnly
                               ? "group relative aspect-square overflow-hidden rounded-2xl border transition-all cursor-pointer"
                               : "group relative flex w-full items-start gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer min-h-[108px] text-left",
                             isSelected 
                               ? "bg-white dark:bg-white/5 border-primary shadow-md" 
                               : isAlreadySelected
                               ? "bg-white/70 dark:bg-white/5 border-emerald-500/20 shadow-sm opacity-70 cursor-not-allowed"
                               : "bg-white dark:bg-white/5 border-border/60 shadow-sm hover:border-primary/20 hover:bg-zinc-50 dark:hover:bg-white/10"
                           )}
                        >
                          <div className={cn(
                            imageOnly
                              ? "absolute top-2.5 right-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all z-10 shadow-xl hover:scale-110"
                              : "absolute top-3 right-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all z-10 shadow-xl hover:scale-110",
                            isSelected 
                              ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20" 
                              : "bg-black/20 dark:bg-black/40 border-white/50 backdrop-blur-sm"
                          )}>
                            {isSelected && <Check size={12} strokeWidth={4} />}
                          </div>

                          <div className={cn(
                            imageOnly
                              ? "h-full w-full overflow-hidden bg-muted relative"
                              : "h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50 relative"
                          )}>
                            {product.image ? (
                                <Image 
                                    src={product.image} 
                                    alt={product.name} 
                                    width={imageOnly ? 240 : 48} 
                                    height={imageOnly ? 240 : 48} 
                                    className="h-full w-full object-cover" 
                                    unoptimized
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <Package size={20} />
                                </div>
                            )}
                          </div>
                          
                           {!imageOnly && (
                           <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5 pr-10">
                            <div className="flex items-center gap-2">
                             <span className={cn("text-[15px] font-medium truncate leading-snug", isSelected ? "text-primary dark:text-foreground" : "text-foreground")}>{product.name}</span>
                             {isAlreadySelected && (
                                 <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/10 text-green-500 border border-green-500/20">
                                     {selectedBadgeLabel}
                                 </span>
                             )}
                            </div>
                             {(minimalView ? product.category?.name : (product.sku || (product.supplierId && suppliers.find(s => s.id === product.supplierId)) || product.remark)) && (
                                 <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                    {!minimalView && product.sku && (
                                      <span className="text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded text-muted-foreground font-mono shrink-0">
                                        {product.sku}
                                      </span>
                                    )}
                                    {minimalView && product.category?.name && (
                                      <span className="text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                                        {product.category.name}
                                      </span>
                                    )}
                                    {!minimalView && product.remark && (
                                        <span className="flex flex-wrap items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded w-fit max-w-full truncate">
                                            <span className="font-bold opacity-70 shrink-0">注:</span>
                                            <span className="truncate leading-none">{product.remark}</span>
                                        </span>
                                    )}
                                 </div>
                             )}

                             {showPrice && !minimalView && (
                                <div className="mt-2">
                                <span className="text-sm font-medium text-primary">
                                    ￥{product.costPrice}
                                </span>
                                </div>
                             )}
                          </div>
                           )}
                           {imageOnly && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent px-2.5 pb-2.5 pt-10 text-left">
                              {isAlreadySelected && (
                                <div className="mb-1 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                                  {selectedBadgeLabel}
                                </div>
                              )}
                              {showImageName && (
                                <div className="line-clamp-2 text-xs font-bold leading-snug text-white/95">
                                  {product.name}
                                </div>
                              )}
                              {(product.sku || product.category?.name) && (showImageName || showImageSupplier) && (
                                <div className="mt-1 line-clamp-1 text-[10px] text-white/65">
                                  {[
                                    showImageName ? product.sku : null,
                                    showImageSupplier ? product.category?.name : null
                                  ].filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>
                           )}
                        </button>
                      );
                    })}
                    
                     {filteredProducts.length === 0 && !showInitialSkeleton && (
                        <div className="py-12 text-center text-muted-foreground">
                            {emptyStateText}
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

              <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border/50 p-5 sm:p-8 shrink-0 bg-zinc-50/50 dark:bg-white/5 gap-4">
               {showPlatformSelector ? (
                 <div className="flex flex-col gap-2 w-full sm:w-auto">
                   <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1">添加到平台</div>
                   <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/50">
                      {PLATFORMS.map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTargetPlatform(p)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-xs font-black transition-all",
                            targetPlatform === p 
                              ? "bg-white dark:bg-white/10 text-primary shadow-sm border border-border" 
                              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                   </div>
                 </div>
               ) : (
                 <div />
               )}

               <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 w-full sm:w-auto">
                <div className="text-xs sm:text-sm font-medium text-muted-foreground mr-2">
                  已选 <span className="text-primary font-medium">{tempSelectedIds.length}</span> 项
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={onClose} 
                    className="rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-95"
                  >
                    取消
                  </button>
                   <button 
                    onClick={handleConfirm}
                    disabled={tempSelectedIds.length === 0}
                    className="bg-foreground text-background dark:text-black px-6 sm:px-8 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-xl shadow-foreground/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    确认添加
                  </button>
                </div>
               </div>
            </div>
          </div>
          
          {allowCreate && (
            <ProductFormModal 
              isOpen={isCreateModalOpen}
              onClose={() => setIsCreateModalOpen(false)}
              onSubmit={handleQuickCreate}
            />
          )}
        </>,
    document.body
  );
}
