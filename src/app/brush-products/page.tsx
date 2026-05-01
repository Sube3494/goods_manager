"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Plus, Search, Tags, Package, RotateCcw, Store, Download, Check, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BrushProduct, Product, Shop } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ActionBar } from "@/components/ui/ActionBar";
import { ImportModal } from "@/components/Goods/ImportModal";

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read blob as data URL"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

async function getExcelImageSource(imageUrl?: string | null) {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    const mimeType = blob.type.toLowerCase();
    const extension =
      mimeType.includes("png") ? "png" :
      mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpeg" :
      null;

    if (!extension) return null;

    const base64 = await blobToDataUrl(blob);
    return { base64, extension: extension as "png" | "jpeg" };
  } catch (error) {
    console.error("Failed to prepare export image:", imageUrl, error);
    return null;
  }
}

export default function BrushProductsPage() {
  const { user } = useUser();
  const canManage = hasPermission(user as SessionUser | null, "brush:manage");
  const { showToast } = useToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [items, setItems] = useState<BrushProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string>>({});
  const [selectedBrushProductIds, setSelectedBrushProductIds] = useState<string[]>([]);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const latestFetchIdRef = useRef(0);
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

  const getBrushSelectionKey = useCallback((item: BrushProduct) => {
    return String(item.product.shopProductId || item.productId || item.id);
  }, []);

  const fetchBrushProducts = useCallback(async () => {
    if (!selectedShopId) {
      latestFetchIdRef.current += 1;
      setItems([]);
      setIsLoading(false);
      return;
    }

    const fetchId = latestFetchIdRef.current + 1;
    latestFetchIdRef.current = fetchId;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "500",
        search: searchQuery,
        shopId: selectedShopId,
      });
      if (supplierFilter) params.set("supplierId", supplierFilter);

      const res = await fetch(`/api/brush-products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json();
      if (latestFetchIdRef.current !== fetchId) {
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      console.error("Failed to fetch brush products:", error);
      showToast("加载刷单商品库失败", "error");
    } finally {
      if (latestFetchIdRef.current === fetchId) {
        setIsLoading(false);
      }
    }
  }, [searchQuery, selectedShopId, showToast, supplierFilter]);

  useEffect(() => {
    if (!canManage) return;

    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops?source=shipping-addresses");
        const data = await res.json().catch(() => ({ shops: [] }));
        if (!res.ok) {
          showToast(data?.error || "加载店铺失败", "error");
          setShops([]);
          setSelectedShopId("");
          return;
        }

        const nextShops: Shop[] = Array.isArray(data?.shops) ? data.shops : [];
        setShops(nextShops);
        setSelectedShopId((current) => {
          if (current && nextShops.some((shop) => shop.id === current)) return current;
          return nextShops[0]?.id || "";
        });
      } catch (error) {
        console.error("Failed to fetch shops:", error);
        showToast("加载店铺失败", "error");
        setShops([]);
        setSelectedShopId("");
      }
    };

    void fetchShops();
  }, [canManage, showToast]);

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
  const anySelected = selectedBrushProductIds.length > 0;

  useEffect(() => {
    setSelectedBrushProductIds((prev) => prev.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  const handleAddProducts = async (products: Product[]) => {
    if (!selectedShopId) {
      showToast("请先选择店铺", "error");
      return;
    }

    try {
      const productItems = Array.from(
        new Map(
          products
            .map((product) => {
              const productId = String(product.sourceProductId || product.id || "").trim();
              const shopId = String(selectedShopId).trim();
              const shopProductId = String(product.shopProductId || "").trim();
              if (!productId && !shopProductId) {
                return null;
              }
              const dedupeKey = shopProductId || `${productId}:${shopId}`;
              return [dedupeKey, { productId, shopId: shopId || null, shopProductId: shopProductId || null }];
            })
            .filter((entry): entry is [string, { productId: string; shopId: string | null; shopProductId: string | null }] => Boolean(entry))
        ).values()
      );
      const res = await fetch("/api/brush-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: productItems }),
      });

      if (!res.ok) throw new Error("Add failed");

      showToast(`已加入 ${productItems.length} 个刷单商品`, "success");
      setIsPickerOpen(false);
      fetchBrushProducts();
    } catch (error) {
      console.error("Failed to add brush products:", error);
      showToast("加入刷单商品库失败", "error");
    }
  };

  const handleKeywordChange = (productId: string, value: string) => {
    setEditingKeywords((prev) => ({ ...prev, [productId]: value }));
  };

  const toggleSelectProduct = (brushProductId: string) => {
    setSelectedBrushProductIds((prev) =>
      prev.includes(brushProductId) ? prev.filter((id) => id !== brushProductId) : [...prev, brushProductId]
    );
  };

  const toggleSelectAllFiltered = () => {
    const filteredIds = filteredItems.map((item) => item.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedBrushProductIds.includes(id));

    setSelectedBrushProductIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !filteredIds.includes(id));
      }

      return Array.from(new Set([...prev, ...filteredIds]));
    });
  };

  const handleSaveKeyword = async (item: BrushProduct) => {
    setSavingProductId(item.id);
    try {
      const nextKeyword = (editingKeywords[item.id] ?? item.brushKeyword ?? "").trim();
      const res = await fetch("/api/brush-products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brushProductId: item.id,
          brushKeyword: nextKeyword,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id
            ? {
                ...current,
                brushKeyword: nextKeyword,
              }
            : current
        )
      );
      setEditingKeywords((prev) => {
        const next = { ...prev };
        delete next[item.id];
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

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [selectedShopId, shops]
  );

  const handleBatchRemove = () => {
    if (selectedBrushProductIds.length === 0) return;

    setConfirmConfig({
      isOpen: true,
      title: "批量移出刷单商品库",
      message: `确定将选中的 ${selectedBrushProductIds.length} 个商品移出刷单商品库吗？不会删除原商品资料。`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/brush-products", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: selectedBrushProductIds }),
          });

          if (!res.ok) throw new Error("Batch delete failed");

          showToast(`已移出 ${selectedBrushProductIds.length} 个刷单商品`, "success");
          setItems((prev) => prev.filter((item) => !selectedBrushProductIds.includes(item.id)));
          setSelectedBrushProductIds([]);
        } catch (error) {
          console.error("Failed to batch remove brush products:", error);
          showToast("批量移除失败", "error");
        }
      },
    });
  };

  const handleExport = useCallback(async () => {
    showToast("正在准备导出数据...", "info");
    try {
      if (filteredItems.length === 0) {
        showToast("没有可导出的刷单商品", "error");
        return;
      }

      const exportData = filteredItems.map((item) => ({
        商品图片: "",
        商品名称: item.product.name,
        "SKU/店内码": item.product.sku || "",
        供应商: item.product.supplier?.name || "",
        刷单关键词: item.brushKeyword || "",
        备注: item.product.remark || "",
        加入时间: item.createdAt ? new Date(item.createdAt).toLocaleString() : "",
      }));

      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("刷单商品库");

      const headers = Object.keys(exportData[0]);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };

      exportData.forEach((row) => {
        worksheet.addRow(headers.map((header) => row[header as keyof typeof row]));
      });

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width:
          header === "商品图片" ? 18 :
          header === "商品名称" ? 34 :
          header === "刷单关键词" || header === "备注" ? 24 :
          18,
      }));

      worksheet.eachRow((row: import("exceljs").Row) => {
        row.eachCell((cell: import("exceljs").Cell) => {
          cell.font = { ...cell.font, name: "微软雅黑" };
          cell.alignment = { vertical: "middle", wrapText: true };
        });
      });

      const preparedImages = await Promise.all(
        filteredItems.map((item) => getExcelImageSource(item.product.image))
      );

      preparedImages.forEach((image, index) => {
        const rowNumber = index + 2;
        const row = worksheet.getRow(rowNumber);
        row.height = 96;

        if (!image) {
          worksheet.getCell(`A${rowNumber}`).value = "无图";
          worksheet.getCell(`A${rowNumber}`).alignment = { horizontal: "center", vertical: "middle" };
          return;
        }

        const imageId = workbook.addImage({
          base64: image.base64,
          extension: image.extension,
        });

        worksheet.addImage(imageId, {
          tl: { col: 0.2, row: rowNumber - 1 + 0.15 },
          ext: { width: 72, height: 72 },
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = new Date()
        .toLocaleString("sv-SE", { hour12: false })
        .replace(" ", "_")
        .replace(/:/g, "-");
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `刷单商品库_${timestamp}.xlsx`
      );
      showToast(`已导出 ${filteredItems.length} 条刷单商品`, "success");
    } catch (error) {
      console.error("Failed to export brush products:", error);
      showToast("导出失败，请重试", "error");
    }
  }, [filteredItems, showToast]);

  const handleImport = useCallback(async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!selectedShopId) {
      showToast("请先选择店铺", "error");
      return;
    }

    try {
      const payload = Array.isArray(rows) ? rows : [];
      const res = await fetch("/api/brush-products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload, shopId: selectedShopId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "导入失败", "error");
        return;
      }

      fetchBrushProducts();
      const summary = [
        data?.success ? `新增 ${data.success} 条` : "",
        data?.updated ? `更新 ${data.updated} 条` : "",
        data?.failed ? `失败 ${data.failed} 条` : "",
      ].filter(Boolean).join("，");

      showToast(summary || "导入完成", data?.failed ? "info" : "success");
    } catch (error) {
      console.error("Failed to import brush products:", error);
      showToast("导入失败", "error");
    }
  }, [fetchBrushProducts, selectedShopId, showToast]);

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/brush"
            className="group inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/70 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground dark:bg-white/5"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            <span>返回刷单中心</span>
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">刷单商品库</h1>
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-2xl border border-border/70 bg-white/70 px-3 text-xs font-bold leading-none text-foreground dark:bg-white/5">
              {items.length}
            </span>
          </div>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">先选店铺，再从对应商品库里挑刷单商品，后面安排时会更稳。</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-end">
          <button
            onClick={() => setIsImportOpen(true)}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-2xl border border-border bg-white/80 px-4 text-sm font-bold text-foreground transition-all active:scale-95 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 sm:h-12 sm:px-5"
          >
            <Plus size={16} />
            <span className="truncate">导入</span>
          </button>
          <button
            onClick={handleExport}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-2xl border border-border bg-white/80 px-4 text-sm font-bold text-foreground transition-all active:scale-95 hover:bg-white dark:bg-white/5 dark:hover:bg-white/10 sm:h-12 sm:px-5"
          >
            <Download size={16} className="rotate-180" />
            <span className="truncate">导出</span>
          </button>
          <button
            onClick={() => {
              if (!selectedShopId) {
                showToast("请先选择店铺", "error");
                return;
              }
              setIsPickerOpen(true);
            }}
            disabled={!selectedShopId}
            className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:h-12 sm:px-6"
          >
            <Plus size={18} />
            <span className="truncate sm:hidden">添加</span>
            <span className="hidden truncate sm:inline">添加商品</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <div className="col-span-2 flex h-11 items-center gap-3 rounded-2xl border border-border bg-white px-5 transition-all focus-within:ring-2 focus-within:ring-primary/10 dark:bg-white/5 md:col-span-1">
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
            options={shops.map((shop) => ({ value: shop.id, label: shop.name }))}
            value={selectedShopId}
            onChange={setSelectedShopId}
            placeholder="先选择店铺"
            className="h-full"
            triggerClassName="h-full rounded-2xl text-sm"
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
            triggerClassName="h-full rounded-2xl text-sm"
          />
        </div>

        {(searchQuery || supplierFilter) && (
          <button
            onClick={resetFilters}
            className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 text-xs font-bold text-primary transition-all hover:bg-primary/10 md:col-span-1 md:justify-self-start"
          >
            <RotateCcw size={14} />
            重置
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">加载中...</div>
      ) : filteredItems.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
          {filteredItems.map((item) => {
            const product = item.product;
            const editingValue = editingKeywords[item.id] ?? item.brushKeyword ?? "";
            const isDirty = editingValue !== (item.brushKeyword ?? "");
            const isSelected = selectedBrushProductIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`group relative flex flex-col overflow-hidden rounded-[18px] border bg-white transition-all duration-200 cursor-pointer dark:bg-white/5 sm:rounded-2xl ${
                  isSelected
                    ? "border-primary/40 ring-2 ring-primary/10 shadow-lg shadow-primary/10 bg-primary/5"
                    : "border-border hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 sm:hover:-translate-y-1.5 sm:hover:shadow-2xl"
                }`}
              >
                <div className="relative aspect-[0.98/1] w-full overflow-hidden bg-secondary/30 sm:aspect-4/3">
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.name}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                        <Package size={28} />
                      </div>
                    )}
                  <button
                    type="button"
                    onClick={() => toggleSelectProduct(item.id)}
                    className={`absolute left-2.5 top-2.5 z-10 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-all duration-300 sm:left-3 sm:top-3 sm:h-6 sm:w-6 ${
                      isSelected
                        ? "scale-110 border-foreground bg-foreground text-background dark:text-black"
                        : anySelected
                          ? "border-white/50 bg-white/50 text-transparent dark:border-white/20 dark:bg-zinc-800/50"
                          : "border-white/50 bg-white/50 text-transparent opacity-0 group-hover:opacity-100 hover:border-foreground/50 dark:border-white/20 dark:bg-zinc-800/50"
                    }`}
                    title={isSelected ? "取消选择" : "选择商品"}
                  >
                    <Check size={14} strokeWidth={4} />
                  </button>
                </div>

                <div className="flex flex-1 flex-col p-2.5 sm:p-5">
                  <h3
                    className="mb-1.5 line-clamp-3 text-[12px] font-bold leading-snug text-foreground transition-colors group-hover:text-primary break-words sm:mb-2.5 sm:line-clamp-none sm:text-[15px]"
                    title={product.name}
                  >
                    {product.name}
                  </h3>

                  <div className="flex min-h-[20px] flex-wrap items-center gap-1 text-xs text-muted-foreground sm:min-h-[22px] sm:gap-1.5">
                    {item.shopName && (
                      <span className="flex h-5 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary sm:px-2">
                        {item.shopName}
                      </span>
                    )}
                    {product.sku && <span className="flex h-5 items-center rounded-full bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] leading-none sm:px-2">{product.sku}</span>}
                    {product.supplier?.name && (
                      <span className="hidden h-5 items-center gap-1 rounded-full border border-zinc-500/10 bg-zinc-500/5 px-2 py-0.5 text-[10px] leading-none sm:flex">
                        <Store size={10} />
                        {product.supplier.name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 border-t border-white/10 pt-3 sm:mt-4 sm:pt-4">
                    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">刷单关键词</div>
                    <textarea
                      value={editingValue}
                      onChange={(e) => handleKeywordChange(item.id, e.target.value)}
                      placeholder="填写刷单提示词"
                      rows={2}
                      className="mt-2 w-full resize-none rounded-xl border border-border/60 bg-background/70 px-2.5 py-2 text-xs font-medium outline-none transition-all focus:border-primary/40 sm:px-3 sm:text-sm"
                    />
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveKeyword(item)}
                        disabled={!isDirty || savingProductId === item.id}
                        className="inline-flex h-8 items-center rounded-xl bg-primary px-2.5 text-[11px] font-black text-primary-foreground transition-all disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-3 sm:text-xs"
                      >
                        {savingProductId === item.id ? "保存中..." : "保存关键词"}
                      </button>
                    </div>
                  </div>

                  {product.remark && (
                    <div className="mt-2.5 line-clamp-2 rounded-xl border border-amber-500/10 bg-amber-500/5 px-2.5 py-2.5 text-[11px] text-amber-700 dark:text-amber-400 sm:mt-3 sm:px-3 sm:py-3 sm:text-xs">
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
        selectedIds={items.map((item) => getBrushSelectionKey(item))}
        selectedBadgeLabel="已加入刷单库"
        unselectedOnlyLabel="显示未加入"
        unselectedOnlyTitle="切换是否只显示未加入刷单商品库的商品"
        showPrice={false}
        showSku={true}
        fetchPath="/api/purchase-products"
        title={selectedShop ? `选择要加入 ${selectedShop.name} 的商品` : "先选择店铺"}
        allowCreate={false}
        showPlatformSelector={false}
        query={selectedShopId ? { shopId: selectedShopId } : undefined}
        emptyStateText={selectedShop ? `${selectedShop.name} 还没有可选商品` : "请先选择店铺"}
      />

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
        title="导入刷单商品"
        description="支持按导出表头回填刷单商品库，至少填写商品名称或 SKU，可同时带入刷单关键词。"
        templateFileName="刷单商品导入模板.xlsx"
        templateData={[
          {
            商品名称: "示例商品",
            "SKU/店内码": "EXAMPLE-001",
            刷单关键词: "按摩仪 送礼",
          },
        ]}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        variant="warning"
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
      />

      <ActionBar
        selectedCount={selectedBrushProductIds.length}
        totalCount={filteredItems.length}
        onToggleSelectAll={toggleSelectAllFiltered}
        onClear={() => setSelectedBrushProductIds([])}
        onDelete={handleBatchRemove}
        label="个商品"
      />
    </div>
  );
}
