"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Plus, Search, Tags, Package, Trash2, RotateCcw, Store } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrushProduct, Product } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";

export default function BrushProductsPage() {
  const { user } = useUser();
  const canManage = hasPermission(user as SessionUser | null, "brush:manage");
  const { showToast } = useToast();
  const [items, setItems] = useState<BrushProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const fetchBrushProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "500",
        search: searchQuery,
      });
      if (supplierFilter) params.set("supplierId", supplierFilter);

      const res = await fetch(`/api/brush-products?${params.toString()}`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to fetch brush products:", error);
      showToast("加载刷单商品库失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, showToast, supplierFilter]);

  useEffect(() => {
    if (canManage) {
      fetchBrushProducts();
    }
  }, [canManage, fetchBrushProducts]);

  const suppliers = useMemo(() => {
    const list = items
      .map((item) => item.product.supplier)
      .filter((supplier): supplier is NonNullable<Product["supplier"]> => Boolean(supplier));
    const unique = new Map(list.map((supplier) => [supplier.id, supplier]));
    return Array.from(unique.values());
  }, [items]);

  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const product = item.product;
      const matchesSearch = !keyword || [
        product.name,
        product.sku,
        item.brushKeyword,
        product.remark,
      ].some((value) => value?.toLowerCase().includes(keyword));
      const matchesSupplier = !supplierFilter || product.supplierId === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [items, searchQuery, supplierFilter]);

  const handleAddProducts = async (products: Product[]) => {
    try {
      const res = await fetch("/api/brush-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: products.map((product) => product.id) }),
      });

      if (!res.ok) throw new Error("Add failed");

      showToast(`已加入 ${products.length} 个刷单商品`, "success");
      setIsPickerOpen(false);
      fetchBrushProducts();
    } catch (error) {
      console.error("Failed to add brush products:", error);
      showToast("加入刷单商品库失败", "error");
    }
  };

  const handleRemoveProduct = (productId: string, productName: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "移出刷单商品库",
      message: `确定将「${productName}」移出刷单商品库吗？不会删除原商品资料。`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/brush-products", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: [productId] }),
          });

          if (!res.ok) throw new Error("Delete failed");

          showToast("已移出刷单商品库", "success");
          setItems((prev) => prev.filter((item) => item.productId !== productId));
        } catch (error) {
          console.error("Failed to remove brush product:", error);
          showToast("移除失败", "error");
        }
      },
    });
  };

  const handleKeywordChange = (productId: string, value: string) => {
    setEditingKeywords((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSaveKeyword = async (product: Product) => {
    setSavingProductId(product.id);
    try {
      const nextKeyword = (editingKeywords[product.id] ?? items.find((item) => item.productId === product.id)?.brushKeyword ?? "").trim();
      const res = await fetch("/api/brush-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          brushKeyword: nextKeyword,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      setItems((prev) =>
        prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                brushKeyword: nextKeyword,
              }
            : item
        )
      );
      setEditingKeywords((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      showToast("刷单关键词已更新", "success");
    } catch (error) {
      console.error("Failed to update brush keyword:", error);
      showToast("更新刷单关键词失败", "error");
    } finally {
      setSavingProductId(null);
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setSupplierFilter("");
  };

  if (!canManage) {
    return (
      <div className="py-24 text-center">
        <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
          <Tags size={36} className="text-muted-foreground/40" />
        </div>
        <h3 className="text-xl font-black mb-2">暂无访问权限</h3>
        <p className="text-muted-foreground text-sm">您没有管理刷单商品库的权限。</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">刷单商品库</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">从现有商品库中挑选一批刷单专用商品，供刷单安排快速选用。</p>
        </div>

        <button
          onClick={() => setIsPickerOpen(true)}
          className="h-11 sm:h-12 px-5 sm:px-6 rounded-full bg-primary text-primary-foreground font-black text-sm shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all active:scale-95 inline-flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          从商品库添加
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_220px_auto] gap-3">
        <div className="h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Search size={18} className="text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索商品名称、SKU、刷单关键词..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-sm"
          />
        </div>

        <div className="h-11">
          <CustomSelect
            options={[
              { value: "", label: "所有供应商" },
              ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
            ]}
            value={supplierFilter}
            onChange={setSupplierFilter}
            className="h-full"
            triggerClassName="h-full rounded-full text-sm"
          />
        </div>

        {(searchQuery || supplierFilter) && (
          <button
            onClick={resetFilters}
            className="h-11 px-4 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all inline-flex items-center justify-center gap-2"
          >
            <RotateCcw size={14} />
            重置
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">加载中...</div>
      ) : filteredItems.length > 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {filteredItems.map((item) => {
            const product = item.product;
            const editingValue = editingKeywords[product.id] ?? item.brushKeyword ?? "";
            const isDirty = editingValue !== (item.brushKeyword ?? "");
            return (
              <div key={item.id} className="group rounded-[28px] border border-border bg-white dark:bg-white/5 p-3 sm:p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
                <div className="relative aspect-square overflow-hidden rounded-[22px] bg-muted border border-border/50">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 45vw, (max-width: 1280px) 30vw, 20vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <Package size={28} />
                      </div>
                    )}
                  <button
                    onClick={() => handleRemoveProduct(product.id, product.name)}
                    className="absolute right-3 top-3 h-9 w-9 rounded-2xl bg-black/45 text-white backdrop-blur-md transition-all hover:bg-red-500 hover:text-white inline-flex items-center justify-center"
                    title="移出刷单商品库"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="mt-4 min-w-0">
                  <h3 className="text-sm sm:text-base font-black leading-snug line-clamp-2 min-h-[2.75rem]">
                    {product.name}
                  </h3>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {product.sku && <span className="font-mono px-2 py-1 rounded-lg bg-muted/50">{product.sku}</span>}
                    {product.supplier?.name && (
                      <span className="inline-flex items-center gap-1">
                        <Store size={12} />
                        {product.supplier.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl bg-muted/30 border border-border/50 px-3 py-3">
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">刷单关键词</div>
                    <textarea
                      value={editingValue}
                      onChange={(e) => handleKeywordChange(product.id, e.target.value)}
                      placeholder="填写刷单提示词"
                      rows={3}
                      className="mt-2 w-full resize-none rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-medium outline-none transition-all focus:border-primary/40"
                    />
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveKeyword(product)}
                        disabled={!isDirty || savingProductId === product.id}
                        className="inline-flex h-9 items-center rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {savingProductId === product.id ? "保存中..." : "保存关键词"}
                      </button>
                    </div>
                  </div>

                  {product.remark && (
                    <div className="mt-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 px-3 py-3 text-xs text-amber-700 dark:text-amber-400 line-clamp-2">
                      {product.remark}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-6">
            <Tags size={36} className="text-muted-foreground/30" />
          </div>
          <h3 className="text-xl font-black mb-2">刷单商品库还是空的</h3>
          <p className="text-muted-foreground text-sm">先从现有商品库里挑一些常用刷单商品加进来。</p>
        </div>
      )}

      <ProductSelectionModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(products) => handleAddProducts(products)}
        selectedIds={items.map((item) => item.productId)}
        title="选择要加入刷单商品库的商品"
        allowCreate={false}
        showPlatformSelector={false}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant="warning"
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
