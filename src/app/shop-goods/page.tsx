"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, Store, X, ArrowUp } from "lucide-react";
import Link from "next/link";
import { ImportModal } from "@/components/Goods/ImportModal";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { BatchEditModal } from "@/components/Goods/BatchEditModal";
import { GoodsCardSkeleton } from "@/components/Goods/GoodsCardSkeleton";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ActionBar } from "@/components/ui/ActionBar";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { Category, Product, Shop, ShopCatalogItem, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ShopProductsResponse {
  items?: ShopCatalogItem[];
  total?: number;
  hasMore?: boolean;
}

interface GroupedShopCardItem extends ShopCatalogItem {
  displayId: string;
  linkedIds: string[];
  shopNames: string[];
}

export default function ShopGoodsPage() {
  const { showToast } = useToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("all");
  const [items, setItems] = useState<ShopCatalogItem[]>([]);
  const itemsRef = useRef<ShopCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const currentPageRef = useRef(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [sortBy, setSortBy] = useState("sku-asc");
  const [categoryOptions, setCategoryOptions] = useState([{ value: "all", label: "全部分类" }]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [editingShopId, setEditingShopId] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const selectedShop = useMemo(
    () => (selectedShopId === "all" ? null : shops.find((shop) => shop.id === selectedShopId) || null),
    [selectedShopId, shops]
  );

  const templateCatalogQuery = useMemo(
    () => ({ includeShopOnly: "true", includePublic: "true" }),
    []
  );

  const assignedTemplateIds = useMemo(
    () =>
      items
        .filter((item) => item.shopId === selectedShopId)
        .map((item) => item.sourceProductId || item.productId || "")
        .filter(Boolean),
    [items, selectedShopId]
  );

  const displayedItems = useMemo<GroupedShopCardItem[]>(() => {
    if (selectedShop) {
      return items.map((item) => ({
        ...item,
        displayId: item.id,
        linkedIds: [item.id],
        shopNames: item.shopName ? [item.shopName] : [],
      }));
    }

    const grouped = new Map<string, GroupedShopCardItem>();
    items.forEach((item) => {
      const key = item.sourceProductId || item.productId || `${item.name}::${item.sku || ""}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          ...item,
          displayId: `group:${key}`,
          linkedIds: [item.id],
          shopNames: item.shopName ? [item.shopName] : [],
          stock: item.stock || 0,
          costPrice: item.costPrice ?? 0,
        });
        return;
      }

      existing.linkedIds.push(item.id);
      if (item.shopName && !existing.shopNames.includes(item.shopName)) {
        existing.shopNames.push(item.shopName);
      }
      existing.stock = (existing.stock || 0) + (item.stock || 0);

      const existingPrice = Number(existing.costPrice ?? 0);
      const nextPrice = Number(item.costPrice ?? 0);
      if (existing.linkedIds.length === 2 && existingPrice !== nextPrice) {
        existing.costPrice = 0;
      } else if (existing.linkedIds.length > 2 && Number(existing.costPrice ?? 0) !== nextPrice) {
        existing.costPrice = 0;
      }
    });

    return Array.from(grouped.values());
  }, [items, selectedShop]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops?source=shipping-addresses");
        const data = await res.json().catch(() => ({ shops: [] }));
        if (!res.ok) {
          showToast(data?.error || "店铺加载失败", "error");
          setShops([]);
          setNeedsAddress(false);
          return;
        }
        setNeedsAddress(Boolean(data?.needsAddress));
        setShops(Array.isArray(data?.shops) ? data.shops : []);
      } catch (error) {
        console.error("Failed to fetch shops:", error);
        showToast("店铺加载失败", "error");
        setNeedsAddress(false);
      }
    };
    void fetchShops();
  }, [showToast]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) setCategories(data);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    const fetchSuppliers = async () => {
      try {
        const res = await fetch("/api/suppliers");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) setSuppliers(data);
      } catch (error) {
        console.error("Failed to fetch suppliers:", error);
      }
    };
    void fetchCategories();
    void fetchSuppliers();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      setShowScrollTop(scrollTop > 10);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const buildAggregateQuery = useCallback((page: number, extra?: Record<string, string>) => {
    const queryParams = new URLSearchParams({
      page: String(page),
      pageSize: selectedShopId === "all" ? "2000" : "20",
      search: debouncedSearch,
      categoryName: selectedCategory,
      supplierId: selectedSupplier,
      sortBy,
      ...(selectedShopId === "all" ? { all: "true" } : {}),
      ...(selectedShopId !== "all" ? { shopId: selectedShopId } : {}),
      ...extra,
    });
    return queryParams;
  }, [debouncedSearch, selectedCategory, selectedShopId, selectedSupplier, sortBy]);

  const fetchShopProducts = useCallback(async (isFirstPage = true) => {
    try {
      const targetPage = isFirstPage ? 1 : currentPageRef.current + 1;
      if (isFirstPage && itemsRef.current.length === 0) setIsLoading(true);
      if (!isFirstPage) setIsNextPageLoading(true);

      const res = await fetch(`/api/shop-products?${buildAggregateQuery(targetPage).toString()}`);
      const data: ShopProductsResponse = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Failed to fetch shop products");

      if (isFirstPage) {
        setItems(data.items || []);
      } else {
        setItems((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          return [...prev, ...((data.items || []).filter((item) => !existingIds.has(item.id)))];
        });
      }

      currentPageRef.current = targetPage;
      setHasMore(selectedShopId === "all" ? false : Boolean(data.hasMore));
      setTotalResults(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch shop products:", error);
      showToast("加载店铺商品失败", "error");
    } finally {
      setIsLoading(false);
      setIsNextPageLoading(false);
    }
  }, [buildAggregateQuery, selectedShopId, showToast]);

  useEffect(() => {
    currentPageRef.current = 1;
    setItems([]);
    setSelectedIds([]);
    void fetchShopProducts(true);
  }, [fetchShopProducts]);

  useEffect(() => {
    const fetchCategoryOptions = async () => {
      try {
        const queryParams = buildAggregateQuery(1, { all: "true", pageSize: "2000" });
        const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
        const data: ShopProductsResponse = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const names = Array.from(new Set((data.items || []).map((item) => (item.categoryName || "未分类").trim() || "未分类")))
          .sort((a, b) => a.localeCompare(b, "zh-CN"));
        setCategoryOptions([{ value: "all", label: "全部分类" }, ...names.map((name) => ({ value: name, label: name }))]);
      } catch (error) {
        console.error("Failed to fetch shop categories:", error);
      }
    };
    void fetchCategoryOptions();
  }, [buildAggregateQuery]);

  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchShopProducts(false);
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [fetchShopProducts, hasMore, isLoading, isNextPageLoading]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);

  const handleToggleSelectAll = useCallback(async () => {
    if (selectedIds.length === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds([]);
      return;
    }
    if (!selectedShop) {
      setSelectedIds(displayedItems.map((item) => item.displayId));
      return;
    }
    try {
      const queryParams = buildAggregateQuery(1, { idsOnly: "true" });
      const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "获取商品失败", "error");
        return;
      }
      setSelectedIds(Array.isArray(data?.ids) ? data.ids : []);
    } catch (error) {
      console.error("Failed to fetch shop product ids:", error);
      showToast("获取商品失败", "error");
    }
  }, [buildAggregateQuery, displayedItems, selectedIds.length, selectedShop, showToast]);

  const handleAssignProducts = useCallback(async (products: Product[]) => {
    if (!selectedShop || products.length === 0) return;
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
    if (selectedIds.length === 0) return;
    const selectedItems = displayedItems
      .filter((item) => selectedIds.includes(item.displayId))
      .flatMap((item) => items.filter((rawItem) => item.linkedIds.includes(rawItem.id) && rawItem.shopId));
    const grouped = selectedItems.reduce<Record<string, string[]>>((acc, item) => {
      const shopId = item.shopId!;
      if (!acc[shopId]) acc[shopId] = [];
      acc[shopId].push(item.id);
      return acc;
    }, {});
    const shopIds = Object.keys(grouped);
    if (shopIds.length === 0) {
      showToast("未找到可移出的店铺商品", "error");
      return;
    }
    try {
      const results = await Promise.all(shopIds.map(async (shopId) => {
        const res = await fetch(`/api/shops/${shopId}/products`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: grouped[shopId] }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "移出店铺失败");
        return data;
      }));
      const removedCount = results.reduce((sum, result) => sum + Number(result?.count || 0), 0);
      showToast(`已移出 ${removedCount} 个店铺商品`, "success");
      setSelectedIds([]);
      void fetchShopProducts(true);
    } catch (error) {
      console.error("Failed to remove products from shops:", error);
      showToast(error instanceof Error ? error.message : "移出店铺失败", "error");
    }
  }, [displayedItems, fetchShopProducts, items, selectedIds, showToast]);

  const openEditModal = useCallback((item: ShopCatalogItem) => {
    setEditingItemId(item.id);
    setEditingShopId(item.shopId || "");
    setEditingProduct({
      id: "",
      sku: item.sku || "",
      name: item.name,
      categoryId: item.categoryId || "",
      costPrice: item.costPrice || 0,
      stock: item.stock || 0,
      image: item.image || "",
      supplierId: item.supplierId || "",
      isPublic: item.isPublic ?? true,
      isDiscontinued: item.isDiscontinued ?? false,
      specs: item.specs || {},
      remark: item.remark || "",
    });
    setIsEditOpen(true);
  }, []);

  const handleEditSelected = useCallback(() => {
    if (selectedIds.length !== 1) {
      showToast("请选择 1 个商品进行编辑", "error");
      return;
    }
    const target = displayedItems.find((item) => item.displayId === selectedIds[0]);
    if (!target) {
      showToast("未找到要编辑的店铺商品", "error");
      return;
    }
    if (!selectedShop && target.linkedIds.length > 1) {
      showToast("当前是全部店铺聚合视图，请先筛选到单个店铺再编辑这类商品", "error");
      return;
    }
    const rawTarget = items.find((item) => item.id === target.linkedIds[0]);
    if (!rawTarget) {
      showToast("未找到要编辑的店铺商品", "error");
      return;
    }
    openEditModal(rawTarget);
  }, [displayedItems, items, openEditModal, selectedIds, selectedShop, showToast]);

  const handleSaveEdit = useCallback(async (formData: Omit<Product, "id"> & { id?: string }) => {
    if (!editingShopId || !editingItemId) return;
    let nextCategories = categories;
    if (!nextCategories.some((category) => category.id === formData.categoryId)) {
      try {
        const res = await fetch("/api/categories");
        const refreshed = await res.json().catch(() => []);
        if (res.ok && Array.isArray(refreshed)) {
          nextCategories = refreshed;
          setCategories(refreshed);
        }
      } catch (error) {
        console.error("Failed to refresh categories:", error);
      }
    }
    const categoryName = nextCategories.find((category) => category.id === formData.categoryId)?.name || "未分类";
    try {
      const res = await fetch(`/api/shops/${editingShopId}/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingItemId,
          sku: formData.sku?.trim() || "",
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          categoryName,
          image: formData.image?.trim() || "",
          supplierId: formData.supplierId || "",
          costPrice: formData.costPrice ?? 0,
          stock: formData.stock ?? 0,
          isPublic: formData.isPublic ?? true,
          isDiscontinued: formData.isDiscontinued ?? false,
          remark: formData.remark?.trim() || "",
          specs: formData.specs || {},
        }),
      });
      const responseData = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(responseData?.error || "保存失败", "error");
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === responseData.id ? { ...item, ...responseData, shopId: item.shopId, shopName: item.shopName } : item)));
      setIsEditOpen(false);
      setEditingProduct(null);
      setEditingItemId("");
      setEditingShopId("");
      showToast("店铺商品已更新", "success");
    } catch (error) {
      console.error("Failed to update shop product:", error);
      showToast("保存失败", "error");
    }
  }, [categories, editingItemId, editingShopId, showToast]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleBatchUpdate = useCallback(async (updateData: {
    categoryId?: string;
    supplierId?: string;
    isPublic?: boolean;
    isDiscontinued?: boolean;
    costPrice?: number;
    stock?: number;
  }) => {
    if (selectedIds.length === 0) return;
    const categoryName = updateData.categoryId
      ? categories.find((category) => category.id === updateData.categoryId)?.name || "未分类"
      : undefined;
    const selectedItems = displayedItems
      .filter((item) => selectedIds.includes(item.displayId))
      .flatMap((item) => items.filter((rawItem) => item.linkedIds.includes(rawItem.id) && rawItem.shopId));
    const grouped = selectedItems.reduce<Record<string, string[]>>((acc, item) => {
      const shopId = item.shopId!;
      if (!acc[shopId]) acc[shopId] = [];
      acc[shopId].push(item.id);
      return acc;
    }, {});
    try {
      await Promise.all(Object.entries(grouped).map(async ([shopId, ids]) => {
        const res = await fetch(`/api/shops/${shopId}/products`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, ...updateData, categoryName }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "批量更新失败");
      }));
      setItems((prev) => prev.map((item) => {
        if (!selectedIds.includes(item.id)) return item;
        return {
          ...item,
          ...(updateData.categoryId ? { categoryId: updateData.categoryId, categoryName } : {}),
          ...(updateData.supplierId !== undefined ? { supplierId: updateData.supplierId || null } : {}),
          ...(updateData.costPrice !== undefined ? { costPrice: updateData.costPrice } : {}),
          ...(updateData.stock !== undefined ? { stock: updateData.stock } : {}),
          ...(updateData.isPublic !== undefined ? { isPublic: updateData.isPublic } : {}),
        };
      }));
      setSelectedIds([]);
      setIsBatchEditOpen(false);
      showToast(`成功更新 ${selectedItems.length} 个商品`, "success");
    } catch (error) {
      console.error("Failed to batch update shop products:", error);
      showToast(error instanceof Error ? error.message : "批量更新请求失败", "error");
    }
  }, [categories, displayedItems, items, selectedIds, showToast]);

  const handleExport = useCallback(async () => {
    try {
      const queryParams = buildAggregateQuery(1, { all: "true", pageSize: "2000" });
      const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
      const data: ShopProductsResponse = await res.json().catch(() => ({}));
      const exportItems = Array.isArray(data.items) ? data.items : [];
      if (exportItems.length === 0) {
        showToast("没有可导出的店铺商品", "error");
        return;
      }
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(selectedShop?.name || "全部店铺商品");
      const rows = exportItems.map((item) => ({
        店铺: item.shopName || "",
        商品名称: item.name || "",
        "SKU/店内码": item.sku || "",
        分类: item.categoryName || "未分类",
        供应商: suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "",
        进货单价: item.costPrice ?? 0,
        库存: item.stock ?? 0,
        主图: item.image || "",
        备注: item.remark || "",
      }));
      const headers = Object.keys(rows[0]);
      worksheet.addRow(headers).font = { bold: true };
      rows.forEach((row) => worksheet.addRow(headers.map((header) => row[header as keyof typeof row])));
      worksheet.columns = headers.map((header) => ({
        header, key: header,
        width: header === "商品名称" ? 34 : header === "主图" || header === "备注" ? 28 : header === "店铺" ? 20 : 18,
      }));
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `${selectedShop?.name || "全部店铺"}商品_${new Date().toLocaleString("sv-SE", { hour12: false }).replace(" ", "_").replace(/:/g, "-")}.xlsx`);
      showToast(`已导出 ${rows.length} 条店铺商品`, "success");
    } catch (error) {
      console.error("Failed to export shop products:", error);
      showToast("导出失败", "error");
    }
  }, [buildAggregateQuery, selectedShop, showToast, suppliers]);

  const handleImport = useCallback(async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!selectedShop) {
      showToast("请先选择要导入到哪个店铺", "error");
      return;
    }
    try {
      const payload = Array.isArray(rows) ? rows : [];
      const res = await fetch(`/api/shops/${selectedShop.id}/products/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "导入失败", "error");
        return;
      }
      await fetchShopProducts(true);
      const summary = [data?.success ? `新增 ${data.success} 条` : "", data?.updated ? `更新 ${data.updated} 条` : "", data?.failed ? `失败 ${data.failed} 条` : ""].filter(Boolean).join("，");
      showToast(summary || "导入完成", data?.failed ? "info" : "success");
    } catch (error) {
      console.error("Failed to import shop products:", error);
      showToast("导入失败", "error");
    }
  }, [fetchShopProducts, selectedShop, showToast]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">店铺商品</h1>
            <span className="shrink-0 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 sm:px-4 h-8 sm:h-10 text-sm sm:text-lg font-bold text-primary font-number shadow-sm">{selectedShop ? totalResults : displayedItems.length}</span>
          </div>
          <p className="hidden md:block text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
            所有店铺商品统一展示，卡片会直接标出所属店铺，也可以按店铺筛选。
          </p>
        </div>
        {shops.length > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => selectedShop ? setIsImportOpen(true) : showToast("先选择一个目标店铺再导入", "error")} className={cn("flex items-center gap-2 rounded-full border border-border/60 px-4 h-10 sm:h-11 text-sm font-bold transition-all whitespace-nowrap", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><span>导入</span></button>
            <button onClick={handleExport} className="flex items-center gap-2 rounded-full border border-border/60 bg-white dark:bg-white/5 px-4 h-10 sm:h-11 text-sm font-bold text-foreground hover:bg-white/80 dark:hover:bg-white/10 transition-all whitespace-nowrap"><span>导出</span></button>
            <button onClick={() => selectedShop ? setIsPickerOpen(true) : showToast("先选择一个目标店铺再从模板库添加", "error")} className={cn("flex items-center gap-2 rounded-full border border-border/60 px-4 sm:px-6 h-10 sm:h-11 text-sm font-bold transition-all whitespace-nowrap", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><Plus size={18} /><span>从模板库添加</span></button>
          </div>
        )}
      </div>

      <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input type="text" placeholder="搜索商品、编号或店铺..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"><X size={14} /></button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 xl:flex gap-2 sm:gap-3 w-full xl:w-auto shrink-0">
          <div className="xl:w-52 h-10 sm:h-11">
            <CustomSelect value={selectedShopId} onChange={setSelectedShopId} options={[{ value: "all", label: "全部店铺" }, ...shops.map((shop) => ({ value: shop.id, label: shop.name }))]} placeholder="全部店铺" className="h-full" triggerClassName={cn("h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate", selectedShop ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5")} />
          </div>
          <div className="xl:w-44 h-10 sm:h-11">
            <CustomSelect value={selectedCategory} onChange={setSelectedCategory} options={categoryOptions} placeholder="全部分类" className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
          <div className="xl:w-44 h-10 sm:h-11">
            <CustomSelect value={selectedSupplier} onChange={setSelectedSupplier} options={[{ value: "all", label: "所有供应商" }, { value: "unknown", label: "未知供应商" }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} placeholder="所有供应商" className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
          <div className="xl:w-48 h-10 sm:h-11">
            <CustomSelect value={sortBy} onChange={setSortBy} options={[{ value: "sku-asc", label: "编号从小到大" }, { value: "sku-desc", label: "编号从大到小" }, { value: "createdAt-desc", label: "最新创建" }, { value: "createdAt-asc", label: "最早创建" }, { value: "stock-desc", label: "库存从高到低" }, { value: "stock-asc", label: "库存从低到高" }, { value: "shop-asc", label: "店铺 A-Z" }, { value: "shop-desc", label: "店铺 Z-A" }, { value: "name-asc", label: "名称 A-Z" }]} className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
        </div>
      </div>

      {needsAddress && !isLoading && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center px-6">
          <div className="rounded-full bg-muted/50 p-4 mb-4"><Store size={32} className="text-muted-foreground" /></div>
          <h3 className="text-lg font-semibold">还没有店铺地址信息</h3>
          <p className="text-sm text-muted-foreground mb-5">请先到个人信息里添加店铺地址，系统会自动把地址同步成可选店铺。</p>
          <Link href="/profile#address-library" className="inline-flex items-center justify-center rounded-full bg-primary px-5 h-10 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">去添加店铺地址</Link>
        </div>
      )}

      {!needsAddress && isLoading && items.length === 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, index) => <GoodsCardSkeleton key={index} />)}</div>
      ) : !needsAddress ? (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>{selectedShop ? `当前筛选：${selectedShop.name}` : "当前筛选：全部店铺"}</p>
            {!selectedShop && shops.length > 0 ? <p>要导入或从模板库添加时，先在上面选一个目标店铺。</p> : null}
          </div>
          <div className="grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 transition-opacity duration-300">
            {displayedItems.map((product, index) => (
              <GoodsCard key={product.displayId} product={{ id: product.displayId, sku: product.sku || undefined, name: product.name, categoryId: product.categoryId || "", category: product.categoryName ? { id: product.categoryId || "", name: product.categoryName, count: 0 } : undefined, costPrice: product.costPrice || 0, stock: product.stock || 0, image: product.image || undefined, isPublic: product.isPublic ?? true, isDiscontinued: product.isDiscontinued ?? false, remark: product.remark || undefined, specs: product.specs || undefined, supplierId: product.supplierId || undefined }} shopLabel={product.shopNames.length > 2 ? `${product.shopNames[0]} 等 ${product.shopNames.length} 店` : product.shopNames.join(" / ") || product.shopName || undefined} onEdit={() => {
                if (!selectedShop && product.linkedIds.length > 1) {
                  showToast("当前是全部店铺聚合视图，请先筛选到单个店铺再编辑这类商品", "error");
                  return;
                }
                const rawTarget = items.find((item) => item.id === product.linkedIds[0]);
                if (rawTarget) openEditModal(rawTarget);
              }} isSelected={selectedIds.includes(product.displayId)} anySelected={selectedIds.length > 0} onToggleSelect={handleToggleSelect} priority={index < 4} hideDiscontinuedState={true} />
            ))}
          </div>
          {displayedItems.length > 0 && <div ref={observerTarget} className="flex justify-center mt-8 mb-12 py-4">{isNextPageLoading ? <div className="flex items-center gap-3 text-muted-foreground bg-white/5 px-6 py-2 rounded-full border border-white/10 animate-pulse"><div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /><span className="text-sm font-medium">正在拉取更多记录...</span></div> : hasMore ? <div className="h-10 invisible" /> : <div className="text-muted-foreground text-sm font-medium flex items-center gap-2 opacity-50"><div className="w-1.5 h-1.5 rounded-full bg-current" />已展示全部店铺商品<div className="w-1.5 h-1.5 rounded-full bg-current" /></div>}</div>}
          {!isLoading && displayedItems.length === 0 && <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center"><div className="rounded-full bg-muted/50 p-4 mb-4"><Store size={32} className="text-muted-foreground" /></div><h3 className="text-lg font-semibold">还没有店铺商品</h3><p className="text-sm text-muted-foreground">{selectedShop ? `当前筛选店铺是 ${selectedShop.name}，可以从右上角模板库添加。` : "先选择店铺筛选，或直接从右上角导出当前结果。"}</p></div>}
        </>
      ) : null}

      <ActionBar selectedCount={selectedIds.length} totalCount={selectedShop ? totalResults : displayedItems.length} onToggleSelectAll={handleToggleSelectAll} onClear={() => setSelectedIds([])} onEdit={() => { if (selectedIds.length === 1) { handleEditSelected(); return; } setIsBatchEditOpen(true); }} label="个商品" extraActions={[{ label: selectedShop ? `移出 ${selectedShop.name}` : "移出所属店铺", onClick: handleRemoveSelected, variant: "danger" }]} />
      <ProductSelectionModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={(products) => { void handleAssignProducts(products); }} selectedIds={assignedTemplateIds} selectedBadgeLabel="已在当前店铺" title={selectedShop ? `添加到 ${selectedShop.name}` : "选择商品"} allowCreate={false} showPlatformSelector={false} minimalView={true} query={templateCatalogQuery} emptyStateText="模板库里还没有商品" />
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={handleImport} title={selectedShop ? `导入到 ${selectedShop.name}` : "导入店铺商品"} description="导入结果只会落到当前选中的目标店铺。已存在的店铺商品会更新，未存在的会按公开商品匹配后加入该店铺。" templateFileName="店铺商品导入模板.xlsx" templateData={[{ 商品名称: "示例商品", "SKU/店内码": "SHOP-001", 分类: "默认分类", 供应商: "默认供应商", 进货单价: 19.9, 库存: 12, 主图: "https://example.com/cover.jpg", 备注: "店铺自定义备注" }]} />
      <ProductFormModal isOpen={isEditOpen} onClose={() => { setIsEditOpen(false); setEditingProduct(null); setEditingItemId(""); setEditingShopId(""); }} onSubmit={async (data) => { await handleSaveEdit(data); }} initialData={editingProduct} title="编辑店铺商品" hideGallerySection={true} hideSpecsSection={true} disableHistorySection={true} showCoverSection={true} mainImageUploadEndpoint={editingShopId ? `/api/shops/${editingShopId}/products/cover-upload` : undefined} />
      <BatchEditModal isOpen={isBatchEditOpen} onClose={() => setIsBatchEditOpen(false)} onConfirm={handleBatchUpdate} categories={categories} suppliers={suppliers} selectedCount={selectedIds.length} hideProductionStatus={true} />

      {typeof document !== "undefined" && createPortal(<AnimatePresence>{showScrollTop && <motion.button initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5, y: 20 }} onClick={scrollToTop} className="fixed bottom-24 sm:bottom-12 right-6 sm:right-12 z-9999 p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground hover:scale-110 active:scale-95 transition-all group"><ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" /></motion.button>}</AnimatePresence>, document.body)}
    </div>
  );
}
