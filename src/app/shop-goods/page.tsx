"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, Plus, Store, X } from "lucide-react";
import Link from "next/link";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { GoodsCardSkeleton } from "@/components/Goods/GoodsCardSkeleton";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ActionBar } from "@/components/ui/ActionBar";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { GalleryItem, Product, Shop } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ShopGoodsPage() {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [shops, setShops] = useState<Shop[]>([]);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const itemsRef = useRef<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const currentPageRef = useRef(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [selectedShopId, shops]
  );
  const pickerQuery = useMemo(
    () => (selectedShopId ? { shopId: selectedShopId, shopFilterMode: "unassigned", publicOnly: "true" } : undefined),
    [selectedShopId]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops");
        const data = await res.json().catch(() => ({ shops: [] }));
        if (!res.ok) {
          showToast(data?.error || "店铺加载失败", "error");
          setShops([]);
          setNeedsAddress(false);
          return;
        }

        const nextShops = Array.isArray(data?.shops) ? data.shops : [];
        setNeedsAddress(Boolean(data?.needsAddress));
        setShops(nextShops);
        setSelectedShopId((prev) => prev || nextShops[0]?.id || "");
      } catch (error) {
        console.error("Failed to fetch shops:", error);
        showToast("店铺加载失败", "error");
        setNeedsAddress(false);
      }
    };

    void fetchShops();
  }, [showToast]);

  const fetchShopProducts = useCallback(async (isFirstPage = true) => {
    if (!selectedShopId) {
      setItems([]);
      setHasMore(false);
      setTotalResults(0);
      setIsLoading(false);
      setIsNextPageLoading(false);
      return;
    }

    try {
      const targetPage = isFirstPage ? 1 : currentPageRef.current + 1;
      if (isFirstPage && itemsRef.current.length === 0) {
        setIsLoading(true);
      } else if (!isFirstPage) {
        setIsNextPageLoading(true);
      }

      const queryParams = new URLSearchParams({
        page: String(targetPage),
        pageSize: "20",
        search: debouncedSearch,
        shopId: selectedShopId,
      });

      const res = await fetch(`/api/products?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch shop products");
      }

      const data = await res.json();
      if (isFirstPage) {
        setItems(data.items || []);
      } else {
        setItems((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const nextItems = (data.items || []).filter((item: Product) => !existingIds.has(item.id));
          return [...prev, ...nextItems];
        });
      }

      currentPageRef.current = targetPage;
      setHasMore(Boolean(data.hasMore));
      setTotalResults(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch shop products:", error);
      showToast("加载店铺商品失败", "error");
    } finally {
      setIsLoading(false);
      setIsNextPageLoading(false);
    }
  }, [debouncedSearch, selectedShopId, showToast]);

  useEffect(() => {
    currentPageRef.current = 1;
    setItems([]);
    setSelectedIds([]);
    void fetchShopProducts(true);
  }, [fetchShopProducts]);

  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void fetchShopProducts(false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [fetchShopProducts, hasMore, isLoading, isNextPageLoading]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }, []);

  const handleToggleSelectAll = useCallback(async () => {
    if (selectedIds.length === totalResults && totalResults > 0) {
      setSelectedIds([]);
      return;
    }

    if (!selectedShopId) return;

    try {
      const queryParams = new URLSearchParams({
        search: debouncedSearch,
        shopId: selectedShopId,
        idsOnly: "true",
      });

      const res = await fetch(`/api/products?${queryParams.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "获取商品失败", "error");
        return;
      }

      setSelectedIds(Array.isArray(data?.ids) ? data.ids : []);
    } catch (error) {
      console.error("Failed to fetch product ids:", error);
      showToast("获取商品失败", "error");
    }
  }, [debouncedSearch, selectedIds.length, selectedShopId, showToast, totalResults]);

  const handleAssignProducts = useCallback(async (products: Product[]) => {
    if (!selectedShop || products.length === 0) {
      return;
    }

    try {
      const res = await fetch(`/api/shops/${selectedShop.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: products.map((product) => product.id) }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "加入店铺失败", "error");
        return;
      }

      showToast(data?.message || `已加入 ${selectedShop.name}`, "success");
      setIsPickerOpen(false);
      void fetchShopProducts(true);
    } catch (error) {
      console.error("Failed to assign products:", error);
      showToast("加入店铺失败", "error");
    }
  }, [fetchShopProducts, selectedShop, showToast]);

  const handleRemoveSelected = useCallback(async () => {
    if (!selectedShop || selectedIds.length === 0) {
      return;
    }

    try {
      const res = await fetch(`/api/shops/${selectedShop.id}/products`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: selectedIds }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "移出店铺失败", "error");
        return;
      }

      showToast(data?.message || `已从 ${selectedShop.name} 移出`, "success");
      setSelectedIds([]);
      void fetchShopProducts(true);
    } catch (error) {
      console.error("Failed to remove products from shop:", error);
      showToast("移出店铺失败", "error");
    }
  }, [fetchShopProducts, selectedIds, selectedShop, showToast]);

  const handleCreateShopProduct = useCallback(async (data: Partial<Product>, galleryItems?: GalleryItem[]) => {
    if (!selectedShop) {
      showToast("请先选择店铺", "error");
      throw new Error("Shop is required");
    }

    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        shopId: selectedShop.id,
        isShopOnly: true,
        isPublic: false,
      }),
    });

    const result = await res.json().catch(() => null);
    if (!res.ok) {
      const message = result?.error || "创建店铺商品失败";
      showToast(message, "error");
      throw new Error(message);
    }

    if (galleryItems && galleryItems.length > 0) {
      const tempItems = galleryItems.filter((item) => item.id.startsWith("temp-"));
      if (tempItems.length > 0) {
        await fetch("/api/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: result.id,
            urls: tempItems.map((item) => ({
              url: item.url,
              thumbnailUrl: item.thumbnailUrl,
              type: item.type,
            })),
          }),
        });
      }
    }

    showToast("店铺商品创建成功", "success");
    setIsCreateOpen(false);
    void fetchShopProducts(true);
  }, [fetchShopProducts, selectedShop, showToast]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">店铺商品</h1>
          <p className="hidden md:block text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
            {selectedShop ? `${selectedShop.name} 的经营商品清单` : "从总商品库挑选并管理店铺经营商品"}
          </p>
        </div>

        {selectedShop && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-2 rounded-full border border-border/60 bg-white dark:bg-white/5 px-4 sm:px-6 h-10 sm:h-11 text-sm font-bold text-foreground hover:bg-white/80 dark:hover:bg-white/10 transition-all whitespace-nowrap"
            >
              <Plus size={18} />
              <span>从总商品库添加</span>
            </button>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 rounded-full bg-primary px-4 sm:px-6 h-10 sm:h-11 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all whitespace-nowrap"
            >
              <Plus size={18} />
              <span>新建店铺商品</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="搜索店铺商品..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex gap-2 sm:gap-3 w-full xl:w-auto shrink-0">
          <div className="xl:w-52 h-10 sm:h-11">
            <CustomSelect
              value={selectedShopId}
              onChange={(value) => startTransition(() => setSelectedShopId(value))}
              options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
              placeholder="选择店铺"
              className="h-full"
              triggerClassName={cn(
                "h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate",
                selectedShopId ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5",
                isPending && "opacity-70"
              )}
            />
          </div>

          {selectedShop && (
            <div className="flex items-center justify-center rounded-full border border-border/60 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm font-bold text-muted-foreground h-10 sm:h-11">
              <Store size={14} className="mr-2" />
              当前共 {totalResults} 个
            </div>
          )}
        </div>
      </div>

      {needsAddress && !isLoading && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center px-6">
          <div className="rounded-full bg-muted/50 p-4 mb-4">
            <Store size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">还没有店铺地址信息</h3>
          <p className="text-sm text-muted-foreground mb-5">请先到个人信息里添加店铺地址，系统会自动把地址同步成可选店铺。</p>
          <Link
            href="/profile#address-library"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 h-10 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            去添加店铺地址
          </Link>
        </div>
      )}

      {!needsAddress && !selectedShopId && !isLoading && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center">
          <div className="rounded-full bg-muted/50 p-4 mb-4">
            <Store size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">先选择一个店铺</h3>
          <p className="text-sm text-muted-foreground">选择后就可以从总商品库往这个店铺里加商品。</p>
        </div>
      )}

      {selectedShopId && isLoading && items.length === 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <GoodsCardSkeleton key={index} />
          ))}
        </div>
      ) : selectedShopId ? (
        <>
          <div className={cn(
            "grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 transition-opacity duration-300",
            isPending && "opacity-50 pointer-events-none"
          )}>
            {items.map((product, index) => (
              <GoodsCard
                key={product.id}
                product={product}
                isSelected={selectedIds.includes(product.id)}
                anySelected={selectedIds.length > 0}
                onToggleSelect={handleToggleSelect}
                priority={index < 4}
                hideDiscontinuedState={true}
              />
            ))}
          </div>

          {items.length > 0 && (
            <div ref={observerTarget} className="flex justify-center mt-8 mb-12 py-4">
              {isNextPageLoading ? (
                <div className="flex items-center gap-3 text-muted-foreground bg-white/5 px-6 py-2 rounded-full border border-white/10 animate-pulse">
                  <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <span className="text-sm font-medium">正在拉取更多记录...</span>
                </div>
              ) : hasMore ? (
                <div className="h-10 invisible" />
              ) : (
                <div className="text-muted-foreground text-sm font-medium flex items-center gap-2 opacity-50">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  已展示全部店铺商品
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                </div>
              )}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center">
              <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Store size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">这个店铺还没有商品</h3>
              <p className="text-sm text-muted-foreground">点击右上角“从总商品库添加”把商品加入到当前店铺。</p>
            </div>
          )}
        </>
      ) : null}

      <ActionBar
        selectedCount={selectedIds.length}
        totalCount={totalResults}
        onToggleSelectAll={handleToggleSelectAll}
        onClear={() => setSelectedIds([])}
        label="个商品"
        extraActions={selectedShop ? [
          { label: `移出 ${selectedShop.name}`, onClick: handleRemoveSelected, variant: "danger" },
        ] : []}
      />

      <ProductSelectionModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(products) => { void handleAssignProducts(products); }}
        selectedIds={[]}
        title={selectedShop ? `添加到 ${selectedShop.name}` : "选择商品"}
        allowCreate={false}
        showPlatformSelector={false}
        query={pickerQuery}
      />

      <ProductFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateShopProduct}
        title={selectedShop ? `新建 ${selectedShop.name} 商品` : "新建店铺商品"}
        hideVisibilityControl={true}
        hideProductionControl={true}
        hideSpecsSection={true}
        hideGallerySection={true}
        coverOnlyMode={true}
      />
    </div>
  );
}
