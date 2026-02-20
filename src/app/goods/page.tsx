"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { Search, Plus, Download, ArrowUp, X } from "lucide-react";
import { Product, Category, Supplier, GalleryItem } from "@/lib/types";
import { BatchEditModal } from "@/components/Goods/BatchEditModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ActionBar } from "@/components/ui/ActionBar";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";

import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";

export default function GoodsPage() {
  const { user } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const observerTarget = useRef<HTMLDivElement>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  
  const [items, setItems] = useState<Product[]>([]);
  const itemsRef = useRef<Product[]>([]);
  const [, setPage] = useState(1);
  const currentPageRef = useRef(1);
  const [hasMore, setHasMore] = useState(true);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [showScrollTop, setShowScrollTop] = useState(false);
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

  // Batch selection states
  const [selectedIds, setSelectedIds] = useState<string[]>([]);



  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [sortBy, setSortBy] = useState<string>("sku-asc");

  const debouncedSearch = useDebounce(searchQuery, 500);

  const { showToast } = useToast();
  const canCreate = hasPermission(user as SessionUser | null, "product:create");
  const canUpdate = hasPermission(user as SessionUser | null, "product:update");
  const canDelete = hasPermission(user as SessionUser | null, "product:delete");

  // Sync ref with items
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fetchGoods = useCallback(async (isFirstPage = true) => {
    try {
      const targetPage = isFirstPage ? 1 : currentPageRef.current + 1;
      
      if (isFirstPage && itemsRef.current.length === 0) {
        setIsLoading(true);
      } else if (!isFirstPage) {
        setIsNextPageLoading(true);
      }
      
      const queryParams = new URLSearchParams({
        page: targetPage.toString(),
        pageSize: "20",
        search: debouncedSearch,
        category: selectedCategory,
        status: selectedStatus,
        sortBy: sortBy,
      });

      const res = await fetch(`/api/products?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Fetch failed");
      
      const data = await res.json();
      
      if (isFirstPage) {
        setItems(data.items);
      } else {
        setItems(prev => {
          const existingIds = new Set(prev.map(i => i.id));
          const newItems = data.items.filter((i: Product) => !existingIds.has(i.id));
          return [...prev, ...newItems];
        });
      }
      
      currentPageRef.current = targetPage;
      setPage(targetPage);
      setHasMore(data.hasMore);
      setTotalResults(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
      setIsNextPageLoading(false);
    }
  }, [debouncedSearch, selectedCategory, selectedStatus, sortBy]);

  // Fetch metadata once on mount
  useEffect(() => {
    // Categories
    fetch("/api/categories")
      .then(r => r.ok ? r.json() : [])
      .then(data => Array.isArray(data) ? setCategories(data) : setCategories([]))
      .catch(() => setCategories([]));
    
    // Suppliers (Permission based)
    const canReadSuppliers = user?.role === "SUPER_ADMIN" || user?.permissions?.["supplier:read"];
    if (canReadSuppliers) {
      fetch("/api/suppliers").then(r => r.ok && r.json()).then(setSuppliers).catch(() => {});
    }

    // System Settings
    fetch("/api/system/settings").then(r => r.ok && r.json()).then(s => s && setLowStockThreshold(s.lowStockThreshold)).catch(() => {});
  }, [user]);

  useEffect(() => {
    // We use a small delay or ensure this only captures external triggers
    fetchGoods(true);
  }, [fetchGoods]);

  // Infinite Scroll Observer
  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore) {
          fetchGoods(false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, isNextPageLoading, fetchGoods]);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target;
      let st = 0;
      
      if (target === document || target === window) {
        st = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      } else if (target instanceof HTMLElement) {
        st = target.scrollTop;
      }
        
      setShowScrollTop(st > 10);
    };
    
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCreate = () => {
    setSelectedIds([]);
    setEditingProduct(undefined);
    setIsNewProductOpen(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedIds([]);
    setEditingProduct(product);
    setIsNewProductOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除商品",
      message: `确定要删除商品 "${name}" 吗？此操作不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/products?id=${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            showToast("商品已删除", "success");
            fetchGoods();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            showToast("删除失败", "error");
          }
        } catch {
          showToast("删除请求失败", "error");
        }
      },
    });
  };

  // Batch selection handlers
  const toggleSelectProduct = useCallback((id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }, []);

  const handleToggleSelectAll = useCallback(async () => {
    // If all possible matches are already selected, clear all
    if (selectedIds.length === totalResults && totalResults > 0) {
      setSelectedIds([]);
      return;
    }

    // Otherwise, fetch ALL matching IDs from the backend
    try {
      const queryParams = new URLSearchParams({
        search: debouncedSearch,
        category: selectedCategory,
        status: selectedStatus,
        sortBy: sortBy,
        idsOnly: "true",
      });

      const res = await fetch(`/api/products?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ids) {
          setSelectedIds(data.ids);
        }
      } else {
        showToast("获取全选列表失败", "error");
      }
    } catch (error) {
      console.error("Failed to fetch all IDs:", error);
      showToast("网络请求失败", "error");
    }
  }, [selectedIds.length, totalResults, debouncedSearch, selectedCategory, selectedStatus, sortBy, showToast]);


  const handleBatchUpdate = async (updateData: { categoryId?: string; supplierId?: string; isPublic?: boolean }) => {
    const count = selectedIds.length;
    try {
      const res = await fetch("/api/products/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          ...updateData
        })
      });

      if (res.ok) {
        showToast(`成功更新 ${count} 个商品`, "success");
        setSelectedIds([]);
        fetchGoods();
      } else {
        showToast("批量更新失败", "error");
      }
    } catch {
      showToast("批量更新请求失败", "error");
    }
  };

  const handleBatchDelete = useCallback(() => {
    const count = selectedIds.length;
    setConfirmConfig({
      isOpen: true,
      title: "批量删除商品",
      message: `确定要删除选中的 ${count} 个商品吗？此操作不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch("/api/products/batch", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: selectedIds }),
          });
          if (res.ok) {
            showToast(`成功删除 ${count} 个商品`, "success");
            setSelectedIds([]);
            fetchGoods();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            showToast("删除失败", "error");
          }
        } catch {
          showToast("请求失败", "error");
        }
      },
    });
  }, [selectedIds, fetchGoods, showToast]);

  const handleSaveItem = async (data: Partial<Product>, galleryItems?: GalleryItem[]) => {
    try {
      const method = editingProduct ? "PUT" : "POST";
      const url = "/api/products";
      
      const body = editingProduct ? { ...data, id: editingProduct.id } : data;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const product = await res.json();
        
        // Handle gallery items persistence, especially for new products
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

        showToast(editingProduct ? "商品更新成功" : "商品创建成功", "success");
        setIsNewProductOpen(false);
        
        if (editingProduct) {
          // 静默更新本地数据，避免页面滚动到顶部
          setItems(prev => prev.map(item => item.id === product.id ? { ...item, ...product } : item));
        } else {
          // 新建商品还是维持刷新逻辑
          fetchGoods(true);
        }
      } else {
        showToast("操作失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    }
  };
  // Sync URL filter to state on mount if needed, or just use state
  // For simplicity and unified UI, we prioritize local state controlled by dropdowns
  
  // No local sorting needed anymore, we trust server-side globally-sorted pagination
  const filteredGoods = items;

  const handleExport = useCallback(() => {
    if (filteredGoods.length === 0) {
      showToast("没有可导出的商品", "error");
      return;
    }

    const exportData = filteredGoods.map(g => ({
      "商品名称": g.name,
      "SKU/店内码": g.sku || "",
      "分类": typeof g.category === 'object' ? (g.category as Category).name : String(g.category),
      "进货单价": g.costPrice,
      "当前库存": g.stock,
      "供应商": g.supplier?.name || "未知供应商",
      "商品图片": g.image || "暂无图片",
      "创建时间": g.createdAt ? new Date(g.createdAt).toLocaleString() : ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "商品列表");
    XLSX.writeFile(workbook, `商品库导出_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast("已开始下载 Excel 文件", "success");
  }, [filteredGoods, showToast]);

  const handleImport = async (data: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!Array.isArray(data)) return;
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: data }),
      });

      if (res.ok) {
        showToast("导入成功", "success");
        setIsImportOpen(false);
        fetchGoods(true);
      } else {
        showToast("导入失败", "error");
      }
    } catch {
      showToast("导入请求失败", "error");
    }
  };
  
  
  // Sync URL filter to state on mount if needed, or just use state
  // For simplicity and unified UI, we prioritize local state controlled by dropdowns
  
  // No local sorting needed anymore, we trust server-side globally-sorted pagination

  return (
    <div className="space-y-8">
      {/* Header section with unified style */}
      <div className="flex items-center justify-between mb-6 sm:mb-8 transition-all relative z-10 gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">商品库</h1>
          <p className="hidden md:block text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
            {isLoading ? "正在从数据库加载商品..." : "统一管理商品信息与SKU"}
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
           {(canCreate) && (
              <div className="glass p-1 rounded-full flex gap-1 items-center h-9 sm:h-10 shadow-sm border border-white/10">
                <button 
                  onClick={handleExport}
                  className="flex items-center justify-center rounded-full w-7 h-7 sm:w-auto sm:px-4 text-xs sm:text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
                  title="导出 Excel"
                >
                  <Download size={16} className="sm:size-[18px] rotate-180" />
                  <span className="hidden sm:inline ml-2">导出</span>
                </button>
                <div className="w-px h-3 bg-white/20 mx-0.5 hidden sm:block"></div>
                <button 
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center justify-center rounded-full w-7 h-7 sm:w-auto sm:px-4 text-xs sm:text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
                  title="Excel 导入"
                >
                  <Download size={16} className="sm:size-[18px]" />
                  <span className="hidden sm:inline ml-2">导入</span>
                </button>
                <div className="w-px h-3 bg-white/20 mx-0.5 hidden sm:block"></div>
                <button 
                  onClick={handleCreate}
                  className="flex items-center gap-2 rounded-full bg-primary px-3 sm:px-6 h-7 sm:h-8 text-[11px] sm:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all whitespace-nowrap"
                >
                  <Plus size={16} className="sm:size-[18px]" />
                  <span className="hidden sm:inline">新建商品</span>
                  <span className="inline sm:hidden">新建</span>
                </button>
              </div>
           )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 mb-6 md:mb-8">
          <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full lg:flex-1 shrink-0 relative">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="搜索商品..."
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
          
          <div className="grid grid-cols-3 lg:flex lg:flex-row gap-2 sm:gap-3 w-full lg:w-auto"> 
             <div className="col-span-1 lg:w-40 h-10 sm:h-11"> 
                <CustomSelect 
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    options={[
                        { value: 'all', label: '所有状态' },
                        { value: 'public', label: '公开可见' },
                        { value: 'private', label: '隐藏不公开' },
                        { value: 'low_stock', label: '库存预警' }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all hover:bg-white/5 truncate"
                />
             </div>
             <div className="col-span-1 lg:w-40 h-10 sm:h-11">
                <CustomSelect 
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    options={[
                        { value: 'all', label: '所有分类' },
                        ...(Array.isArray(categories) ? categories.map(c => ({ value: c.name, label: c.name })) : [])
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all hover:bg-white/5 truncate"
                />
             </div>
             <div className="col-span-1 lg:w-48 h-10 sm:h-11">
                <CustomSelect 
                    value={sortBy}
                    onChange={setSortBy}
                    options={[
                        { value: 'sku-asc', label: '编号从小到大' },
                        { value: 'sku-desc', label: '编号从大到小' },
                        { value: 'createdAt-desc', label: '最新创建' },
                        { value: 'createdAt-asc', label: '最早创建' },
                        { value: 'stock-desc', label: '库存从高到低' },
                        { value: 'stock-asc', label: '库存从低到高' },
                        { value: 'name-asc', label: '名称 A-Z' }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all hover:bg-white/5 truncate"
                />
              </div>
          </div>
      </div>

      {/* Grid */}
      {isLoading && items.length === 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredGoods.map((product, index) => (
            <GoodsCard 
              key={product.id} 
              product={product} 
              onEdit={canUpdate ? handleEdit : undefined} 
              onDelete={canDelete ? handleDelete : undefined} 
              lowStockThreshold={lowStockThreshold}
              isSelected={selectedIds.includes(product.id)}
              anySelected={selectedIds.length > 0}
              onToggleSelect={toggleSelectProduct}
              priority={index < 4}
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel & Loading indicator */}
      {filteredGoods.length > 0 && (
        <div ref={observerTarget} className="flex justify-center mt-8 mb-12 py-4">
          {isNextPageLoading ? (
            <div className="flex items-center gap-3 text-muted-foreground bg-white/5 px-6 py-2 rounded-full border border-white/10 animate-pulse">
              <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-sm font-medium">正在拉取更多记录...</span>
            </div>
          ) : hasMore ? (
            <div className="h-10 invisible" /> // Sentinel is active but invisible
          ) : (
            <div className="text-muted-foreground text-sm font-medium flex items-center gap-2 opacity-50">
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
              已展示全部商品
              <div className="w-1.5 h-1.5 rounded-full bg-current" />
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredGoods.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-gray-900/70 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Search size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">未找到商品</h3>
            <p className="text-sm text-muted-foreground">尝试调整搜索关键词或筛选条件。</p>
        </div>
      )}

      <ImportModal 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
        title="导入商品"
        description="支持通过 Excel 批量导入商品"
        templateFileName="商品导入模版.xlsx"
        templateData={[
          {
            "*商品名称": "示例商品1",
            "*分类": "默认分类",
            "*进货单价": 99.00,
            "库存": 100,
            "SKU": "EXAMPLE-001",
            "供应商": "默认供应商",
            "商品图片": "https://example.com/image.jpg"
          }
        ]}
      />

      <ProductFormModal 
        key={editingProduct?.id || 'create'}
        isOpen={isNewProductOpen}
        onClose={() => setIsNewProductOpen(false)}
        onSubmit={handleSaveItem}
        initialData={editingProduct}
      />

      <BatchEditModal 
        isOpen={isBatchEditOpen}
        onClose={() => setIsBatchEditOpen(false)}
        onConfirm={handleBatchUpdate}
        categories={categories}
        suppliers={suppliers}
        selectedCount={selectedIds.length}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel="确认删除"
        variant="danger"
      />

      <ActionBar 
        selectedCount={selectedIds.length}
        totalCount={totalResults}
        onToggleSelectAll={handleToggleSelectAll}
        onClear={() => setSelectedIds([])}
        label="个商品"
        onDelete={handleBatchDelete}
        onEdit={() => setIsBatchEditOpen(true)}
      />

      {/* Back to Top Button */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              onClick={scrollToTop}
              className="fixed bottom-24 sm:bottom-12 right-6 sm:right-12 z-9999 p-3 sm:p-4 rounded-full bg-white dark:bg-zinc-800 border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground hover:scale-110 active:scale-95 transition-all group"
            >
              <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
