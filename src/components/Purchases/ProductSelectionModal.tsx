"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { X, Search, Check, Loader2, Package } from "lucide-react";
import { Category, Product } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}


function normalizeShopName(value: string | null | undefined) {
  return String(value || "").trim();
}

function stripShopSuffix(value: string) {
  return value.replace(/(门店|店铺|旗舰店|总店|分店|一店|二店|三店|四店|五店|店)$/g, "").trim();
}

function isShopNameMatch(candidate: string | null | undefined, scopedShopName: string | null | undefined) {
  const normalizedCandidate = normalizeShopName(candidate);
  const normalizedScoped = normalizeShopName(scopedShopName);
  if (!normalizedScoped) {
    return true;
  }
  if (!normalizedCandidate) {
    return false;
  }
  if (normalizedCandidate === normalizedScoped) {
    return true;
  }
  if (normalizedCandidate.includes(normalizedScoped) || normalizedScoped.includes(normalizedCandidate)) {
    return true;
  }

  const coreCandidate = stripShopSuffix(normalizedCandidate);
  const coreScoped = stripShopSuffix(normalizedScoped);
  if (!coreCandidate || !coreScoped) {
    return false;
  }

  return (
    coreCandidate === coreScoped ||
    coreCandidate.includes(coreScoped) ||
    coreScoped.includes(coreCandidate)
  );
}

function getProductCode(product: Product) {
  return String(product.sku || product.shopProductId || product.sourceProductId || "").trim();
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (products: Product[], platform: string) => void;
  selectedIds: string[];
  selectedBadgeLabel?: string;
  unselectedOnlyLabel?: string;
  unselectedOnlyTitle?: string;
  hideUnselectedOnlyToggle?: boolean;
  singleSelect?: boolean;
  showPrice?: boolean;
  showSku?: boolean;
  fetchPath?: string;
  title?: string;
  showPlatformSelector?: boolean;
  imageOnly?: boolean;
  allowMultipleToggle?: boolean; // 是否允许切换多选开关
  minimalView?: boolean;
  showCategoryFilter?: boolean;
  query?: Record<string, string>;
  emptyStateText?: string;
  prefetchedProducts?: Product[];
  externalLoading?: boolean;
  loadAllOnOpen?: boolean;
  respectPublicVisibility?: boolean;
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
  showSku = true,
  fetchPath = "/api/products",
  title = "选择商品",
  showPlatformSelector = true,
  imageOnly = false,
  minimalView = false,
  showCategoryFilter = false,
  query,
  emptyStateText = "未找到相关商品",
  prefetchedProducts,
  externalLoading = false,
  loadAllOnOpen = false,
  respectPublicVisibility = true,
  allowMultipleToggle = false,
}: ProductSelectionModalProps) {
  const [localSingleSelect, setLocalSingleSelect] = useState(Boolean(singleSelect));
  const queryRef = useRef(query);
  queryRef.current = query;
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 500);

  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedResults, setHasLoadedResults] = useState(false);
  const [showInitialSkeleton, setShowInitialSkeleton] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string>("all");

  useEffect(() => {
    if (isOpen) {
      fetch("/api/product-libraries")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setLibraries(data);
            if (data.length > 0) {
              setActiveLibraryId(data[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const [showUnselectedOnly, setShowUnselectedOnly] = useState(true);
  const [localVisibleCount, setLocalVisibleCount] = useState(50);
  const { showToast } = useToast();
  const resultsVersion = useRef(0);
  const [mounted] = useState(typeof window !== "undefined");
  const [targetPlatform, setTargetPlatform] = useState("美团");
  const PLATFORMS = ["美团", "淘宝", "京东"];
  const shouldShowCategoryFilter = !imageOnly && (!minimalView || showCategoryFilter);
  const loadingDelayRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadedSignatureRef = useRef("");
  const usesPrefetchedData = Array.isArray(prefetchedProducts);
  const remoteSearch = loadAllOnOpen ? "" : debouncedSearch;
  const remoteCategoryName = loadAllOnOpen ? "all" : selectedCategoryName;
  const querySignature = JSON.stringify({
    fetchPath,
    minimalView,
    query: query || {},
    selectedCategoryName: remoteCategoryName,
    debouncedSearch: remoteSearch,
    activeLibraryId,
  });

  const getSelectionKey = useCallback((product: Product) => {
    return String(product.shopProductId || product.id || product.sourceProductId || "").trim();
  }, []);


  // 初始化重置逻辑
  useEffect(() => {
    if (isOpen) {
      setLocalSingleSelect(Boolean(singleSelect));
      setTempSelectedIds([]);
      setSelectedProducts([]);
      setProducts([]);
      setSearchQuery("");
      setSelectedCategoryName("all");
      setHasLoadedResults(false);
      setHasMore(false);
      setIsNextPageLoading(false);
      setIsSearching(false);
      resultsVersion.current += 1;
      lastLoadedSignatureRef.current = "";

      // singleSelect 模式（如"修改商品匹配"）下，已选商品应以勾选态显示而非被过滤掉
      setShowUnselectedOnly(!singleSelect);
      setIsLoading(usesPrefetchedData ? externalLoading : true);
      setShowInitialSkeleton(!(usesPrefetchedData && !externalLoading));
      pageRef.current = 1;
      setLocalVisibleCount(50);
      setIsInitialized(true);
    } else {
      setIsInitialized(false);
      setShowInitialSkeleton(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); 

  useEffect(() => {
    setLocalVisibleCount(50);
  }, [debouncedSearch, selectedCategoryName, showUnselectedOnly]);

  useEffect(() => {
    if (!usesPrefetchedData) return;
    setProducts(prefetchedProducts || []);
  }, [prefetchedProducts, usesPrefetchedData]);

  useEffect(() => {
    if (!usesPrefetchedData) return;
    setIsLoading(externalLoading);
    if (!externalLoading) {
      setIsSearching(false);
      setIsNextPageLoading(false);
      setHasMore(false);
      setShowInitialSkeleton(false);
    }
  }, [externalLoading, usesPrefetchedData]);

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
      if (mode === 'initial') setIsLoading(true);
    } else {
      setIsNextPageLoading(true);
    }

    try {
      const targetPage = pageRef.current;
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        ...(loadAllOnOpen ? { all: "true" } : { pageSize: "20" }),
        ...(remoteSearch ? { search: remoteSearch } : {}),
        ...(queryRef.current || {}),
        ...(activeLibraryId && activeLibraryId !== "all" ? { libraryId: activeLibraryId } : {}),
        ...(remoteCategoryName !== "all" ? { category: remoteCategoryName, categoryName: remoteCategoryName } : {}),
      });

      const shopId = queryRef.current?.shopId;
      const categoryUrl = shopId 
        ? `/api/categories?shopId=${shopId}` 
        : fetchPath === "/api/shop-products" 
        ? "/api/categories" 
        : "/api/categories?scope=main-products";
      const [pRes, sRes] = await Promise.all([
        fetch(`${fetchPath}?${queryParams.toString()}`),
        mode === 'initial' && shouldShowCategoryFilter ? fetch(categoryUrl) : Promise.resolve(null)
      ]);

      if (version !== resultsVersion.current) return;

      if (pRes.ok) {
        const pData = await pRes.json();
        const newItems = Array.isArray(pData.items) ? pData.items : [];
        setHasLoadedResults(true);
        
        if (mode === 'initial' || mode === 'search') {
          setProducts(newItems);
        } else {
          setProducts(prev => {
            const existingIds = new Set(prev.map(i => i.id));
            return [...prev, ...newItems.filter((i: Product) => !existingIds.has(i.id))];
          });
        }
        
        setHasMore(loadAllOnOpen ? false : pData.hasMore);
        pageRef.current = targetPage + 1;
        if (mode === "initial") {
          lastLoadedSignatureRef.current = querySignature;
        }
      }

      if (sRes && sRes.ok) {
        setCategories(await sRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch products or categories:", error);
    } finally {
      if (version === resultsVersion.current) {
        setIsLoading(false);
        setIsSearching(false);
        setIsNextPageLoading(false);
      }
    }
  }, [fetchPath, loadAllOnOpen, querySignature, remoteCategoryName, remoteSearch, shouldShowCategoryFilter]);

  useEffect(() => {
    if (loadingDelayRef.current) {
      clearTimeout(loadingDelayRef.current);
      loadingDelayRef.current = null;
    }

    if (isLoading && products.length === 0 && !hasLoadedResults) {
      if (isOpen) {
        setShowInitialSkeleton(true);
        return;
      }
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
  }, [hasLoadedResults, isLoading, products.length, isOpen]);

  useEffect(() => {
    if (usesPrefetchedData) return;
    if (!isOpen || !isInitialized) return;

    if (lastLoadedSignatureRef.current === querySignature) {
      setIsLoading(false);
      setShowInitialSkeleton(false);
      return;
    }

    setHasMore(false);
    pageRef.current = 1;
    fetchData('initial');
  }, [fetchData, isInitialized, isOpen, querySignature, usesPrefetchedData]);

  const filterVisibleProducts = useCallback((candidates: Product[], categoryName = selectedCategoryName) => {
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    const scopedShopName = normalizeShopName(queryRef.current?.shopName);

    return candidates.filter((p) => {
      const matchesVisibility = respectPublicVisibility ? (p.isPublic ?? true) : true;
      const isVisible = matchesVisibility && !(p.isDiscontinued ?? false);
      const productCategoryName = p.category?.name || (p as Product & { categoryName?: string | null }).categoryName || "";
      const matchesCategory = categoryName === "all" || productCategoryName === categoryName;
      const matchesUnselected = !showUnselectedOnly || !selectedIds.includes(getSelectionKey(p));
      const searchableText = [p.name, p.sku, p.jdSkuId].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);
      const matchesShop = !scopedShopName || isShopNameMatch(p.shopName, scopedShopName);

      return isVisible && matchesCategory && matchesUnselected && matchesSearch && matchesShop;
    });
  }, [debouncedSearch, getSelectionKey, respectPublicVisibility, selectedCategoryName, selectedIds, showUnselectedOnly]);

  const displayCategoryName = selectedCategoryName;

  const filteredProducts = useMemo(() => {
    return filterVisibleProducts(Array.isArray(products) ? products : [], displayCategoryName);
  }, [filterVisibleProducts, products, displayCategoryName]);

  const hasMoreLocal = filteredProducts.length > localVisibleCount;

  useEffect(() => {
    if (!isOpen) return;

    const needBackendMore = !usesPrefetchedData && hasMore && !isLoading && !isSearching && !isNextPageLoading;
    const needFrontendMore = hasMoreLocal;

    if (!needBackendMore && !needFrontendMore) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          if (needBackendMore) {
            fetchData('next');
          } else if (needFrontendMore) {
            setLocalVisibleCount(prev => prev + 50);
          }
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [fetchData, hasMore, isLoading, isNextPageLoading, isOpen, isSearching, usesPrefetchedData, hasMoreLocal]);

  const selectableProducts = useMemo(() => {
    return filteredProducts.filter((product: Product) => !selectedIds.includes(getSelectionKey(product)));
  }, [filteredProducts, selectedIds, getSelectionKey]);

  const allFilteredSelected = useMemo(() => {
    return (
      !localSingleSelect &&
      selectableProducts.length > 0 &&
      selectableProducts.every((product: Product) => tempSelectedIds.includes(getSelectionKey(product)))
    );
  }, [localSingleSelect, selectableProducts, tempSelectedIds, getSelectionKey]);

  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, localVisibleCount);
  }, [filteredProducts, localVisibleCount]);

  const handleToggleSelectAll = async () => {
    if (localSingleSelect || selectableProducts.length === 0) {
      return;
    }

    if (allFilteredSelected) {
      setTempSelectedIds([]);
      setSelectedProducts([]);
      return;
    }

    if (usesPrefetchedData || loadAllOnOpen) {
      setTempSelectedIds(selectableProducts.map((product: Product) => getSelectionKey(product)));
      setSelectedProducts(selectableProducts);
      return;
    }

    setIsSelectingAll(true);
    try {
      const queryParams = new URLSearchParams({
        page: "1",
        all: "true",
        search: debouncedSearch,
        ...(query || {}),
        category: selectedCategoryName,
      });
      const res = await fetch(`${fetchPath}?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch all products");

      const data = await res.json();
      const allProducts = filterVisibleProducts(Array.isArray(data.items) ? data.items : [], selectedCategoryName);
      setProducts(allProducts);
      setHasMore(false);
      setTempSelectedIds(allProducts.map((product: Product) => getSelectionKey(product)));
      setSelectedProducts(allProducts);
    } catch (error) {
      console.error("Failed to select all products:", error);
      showToast("全选失败，请稍后重试", "error");
    } finally {
      setIsSelectingAll(false);
    }
  };

  const toggleProduct = useCallback((product: Product) => {
    const id = getSelectionKey(product);
    if (selectedIds.includes(id)) {
      return;
    }
    if (localSingleSelect) {
        setTempSelectedIds([id]);
        setSelectedProducts([product]);
    } else {
        setTempSelectedIds(prev => {
            const isSelected = prev.includes(id);
            if (isSelected) return prev.filter(i => i !== id);
            return [...prev, id];
        });
        
        setSelectedProducts(prev => {
            const isSelected = prev.some(p => getSelectionKey(p) === id);
            if (isSelected) return prev.filter(p => getSelectionKey(p) !== id);
            return [...prev, product];
        });
    }
  }, [getSelectionKey, selectedIds, localSingleSelect]);

  const handleConfirm = () => {
    onSelect(selectedProducts, targetPlatform);
    onClose();
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-110000 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-110001 flex min-h-[520px] w-[calc(100%-24px)] sm:min-h-[560px] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border/50 bg-white shadow-2xl backdrop-blur-xl dark:bg-gray-900/70 max-h-[min(84dvh,820px)]"
      >
             <div className="flex items-center justify-between border-b border-border/50 p-5 sm:p-8 shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-foreground">{title}</h2>
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
              {libraries.length > 1 && (
                <div className="flex flex-wrap gap-2 border-b border-border/50 pb-3 shrink-0">
                  {libraries.map((lib) => (
                    <button
                      key={lib.id}
                      onClick={() => setActiveLibraryId(lib.id)}
                      className={cn(
                        "px-4 py-1.5 text-xs font-bold rounded-xl transition-all duration-200",
                        activeLibraryId === lib.id
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                          : "text-muted-foreground hover:bg-muted/10 hover:text-foreground"
                      )}
                    >
                      {lib.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 shrink-0">
                 <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="搜索商品名称或编号..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-11 pr-10 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary/20 transition-all dark:hover:bg-white/10 text-sm"
                  />
                  {(isLoading || isSearching) && products.length > 0 && (
                    <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                 </div>

                {shouldShowCategoryFilter && (
                  <div className="w-36 sm:w-44 shrink-0">
                    <CustomSelect
                      options={[
                        { value: "all", label: "所有分类" },
                        ...categories.map(category => ({ value: category.name, label: category.name }))
                      ]}
                      value={selectedCategoryName}
                      onChange={setSelectedCategoryName}
                      placeholder="筛选分类"
                      triggerClassName="h-11 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                    />
                  </div>
                )}
              </div>
              
              {allowMultipleToggle && (
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/6 bg-black/2 px-4 py-3 dark:border-white/8 dark:bg-white/3 transition-all hover:bg-black/3 dark:hover:bg-white/5 shrink-0 mt-0.5 mb-1.5">
                  <div className="flex flex-col gap-0.5 text-left">
                    <span className="text-xs font-bold text-foreground transition-colors">组合商品匹配</span>
                    <span className="text-[10px] font-medium text-muted-foreground leading-normal">开启后支持同时勾选多件商品进行合并绑定 (适用于套装礼盒等)</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {!localSingleSelect && (
                      <span className="hidden sm:inline-block text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/15 animate-pulse">
                        多选模式已启用
                      </span>
                    )}
                    <label className="relative inline-flex cursor-pointer items-center select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={!localSingleSelect}
                        onChange={(e) => {
                          const isMultiple = e.target.checked;
                          setLocalSingleSelect(!isMultiple);
                          setTempSelectedIds([]);
                          setSelectedProducts([]);
                          setShowUnselectedOnly(!isMultiple ? false : true);
                        }}
                        className="peer sr-only"
                      />
                      <div className="peer relative h-6 w-11 rounded-full bg-zinc-200 dark:bg-zinc-700 transition-all peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-600 peer-focus:outline-none flex items-center px-[2px]">
                        <div className={cn(
                          "h-5 w-5 rounded-full bg-white shadow-sm transition-all transform duration-200",
                          !localSingleSelect ? "translate-x-5" : "translate-x-0"
                        )} />
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className={cn("relative flex-1 overflow-y-auto no-scrollbar min-h-[220px]", imageOnly ? "" : "space-y-2")}>
                 {(showInitialSkeleton && products.length === 0) ? (
                    <div className={cn(imageOnly ? "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" : "space-y-2")}>
                        {[...Array(6)].map((_, i) => (
                           <ProductSkeleton key={i} imageOnly={imageOnly} />
                        ))}
                    </div>
                 ) : (
                    <div className={cn(imageOnly ? "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" : "space-y-1.5")}>
                    {displayedProducts.map((product: Product) => {
                      const selectionKey = getSelectionKey(product);
                      const isSelected = tempSelectedIds.includes(selectionKey);
                      const isAlreadySelected = selectedIds.includes(selectionKey);
                      const productCode = getProductCode(product);
                      return (
                         <button
                          key={product.id}
                          type="button"
                         onClick={() => toggleProduct(product)}
                            disabled={isAlreadySelected}
                            className={cn(
                             imageOnly
                               ? "group relative aspect-square overflow-hidden rounded-2xl border transition-all cursor-pointer"
                               : "group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer min-h-[64px]",
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
                              : "order-last ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all",
                            isSelected 
                              ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20"
                              : isAlreadySelected
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                              : "bg-transparent border-muted-foreground/50 text-transparent group-hover:border-foreground/60"
                          )}>
                            {(isSelected || isAlreadySelected) && <Check size={12} strokeWidth={4} />}
                          </div>

                          <div className={cn(
                            imageOnly
                              ? "h-full w-full overflow-hidden bg-muted relative"
                              : "h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50 relative"
                          )}>
                            {product.image ? (
                                <Image 
                                   src={product.image} 
                                   alt={product.name} 
                                    width={imageOnly ? 240 : 40} 
                                    height={imageOnly ? 240 : 40} 
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
                           <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
                             <span className={cn("truncate text-sm font-medium leading-snug", isSelected ? "text-primary dark:text-foreground" : "text-foreground")}>{product.name}</span>
                             <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                                {showSku && productCode && (
                                  <span className="shrink-0 rounded bg-zinc-100 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-800 dark:text-zinc-200">
                                    编号：{productCode}
                                  </span>
                                )}
                                {product.shopName && (
                                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                                    {product.shopName}
                                  </span>
                                )}
                                {product.category?.name && (
                                  <span className="shrink-0 rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {product.category.name}
                                  </span>
                                )}
                                {!minimalView && product.remark && (
                                    <span className="flex min-w-0 items-center gap-1 truncate rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-500">
                                        <span className="shrink-0 font-bold opacity-70">注:</span>
                                        <span className="truncate">{product.remark}</span>
                                    </span>
                                )}
                                {showPrice && !minimalView && (
                                  <span className="ml-auto shrink-0 text-sm font-semibold text-foreground">
                                      ￥{product.costPrice}
                                  </span>
                                )}
                             </div>
                          </div>
                           )}
                           {imageOnly && (
                           <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent px-2.5 pb-2.5 pt-10 text-left">
                              {isAlreadySelected && (
                                <div className="mb-1 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                                  {selectedBadgeLabel}
                                </div>
                              )}
                              <div className="line-clamp-2 text-xs font-bold leading-snug text-white/95">
                                {product.name}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {productCode && (
                                  <span className="inline-flex max-w-full items-center rounded-full bg-black/35 px-2 py-0.5 font-mono text-[10px] font-bold text-white/90">
                                    {`编号 ${productCode}`}
                                  </span>
                                )}
                                {product.category?.name && (
                                  <span className="inline-flex max-w-full items-center rounded-full bg-white/12 px-2 py-0.5 text-[10px] text-white/70">
                                    {product.category.name}
                                  </span>
                                )}
                              </div>
                            </div>
                           )}
                        </button>
                      );
                    })}
                    
                     {filteredProducts.length === 0 && !showInitialSkeleton && !isLoading && !isSearching && !isNextPageLoading && (
                        <div className="py-12 text-center text-muted-foreground">
                            {emptyStateText}
                        </div>
                     )}
                    
                     <div ref={observerTarget} className="flex h-14 items-center justify-center">
                      {(isNextPageLoading || (hasMoreLocal && !isLoading && !isSearching)) ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                          <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                          加载更多...
                        </div>
                      ) : (hasMore && !isLoading && !isSearching) ? (
                        <div className="h-5 opacity-0">占位</div>
                      ) : null}
                     </div>
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
                  {!localSingleSelect && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      disabled={selectableProducts.length === 0 || isSelectingAll}
                      className="rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/10"
                    >
                      {isSelectingAll ? "全选中..." : allFilteredSelected ? "取消全选" : "全选"}
                    </button>
                  )}
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
        </>,
    document.body
  );
}
