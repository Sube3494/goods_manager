"use client";

import { useState, useEffect } from "react";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { Search, Plus, Download } from "lucide-react";
import { Product, Category, Supplier, GalleryItem } from "@/lib/types";
import { BatchEditModal } from "@/components/Goods/BatchEditModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ActionBar } from "@/components/ui/ActionBar";
import { CustomSelect } from "@/components/ui/CustomSelect";


import { useUser } from "@/hooks/useUser";
import { pinyinMatch } from "@/lib/pinyin";

export default function GoodsPage() {
  const { user } = useUser();
  const [goods, setGoods] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [settings, setSettings] = useState<{ lowStockThreshold: number }>({ lowStockThreshold: 10 });
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

  const { showToast } = useToast();

  const fetchGoods = async () => {
    try {
      setIsLoading(true);
      const [productsRes, categoriesRes, suppliersRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/categories"),
        fetch("/api/suppliers")
      ]);

      if (productsRes.ok && categoriesRes.ok && suppliersRes.ok) {
        const productsData = await productsRes.json();
        const categoriesData = await categoriesRes.json();
        const suppliersData = await suppliersRes.json();
        setGoods(productsData);
        setCategories(categoriesData);
        setSuppliers(suppliersData);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/system/settings");
      if (res.ok) {
        setSettings(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
    }
  };

  useEffect(() => {
    fetchGoods();
    fetchSettings();
  }, []);

  const handleCreate = () => {
    setEditingProduct(undefined);
    setIsNewProductOpen(true);
  };

  const handleEdit = (product: Product) => {
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
  const toggleSelectProduct = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };


  const handleBatchUpdate = async (updateData: { categoryId?: string; supplierId?: string }) => {
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

  const handleBatchDelete = () => {
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
  };

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
                urls: tempItems.map(item => ({ url: item.url, type: item.type })),
                isPublic: product.isPublic // Match product visibility
              })
            });
          }
        }

        showToast(editingProduct ? "商品更新成功" : "商品创建成功", "success");
        setIsNewProductOpen(false);
        fetchGoods();
      } else {
        showToast("操作失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    }
  };

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
        fetchGoods();
      } else {
        showToast("导入失败", "error");
      }
    } catch {
      showToast("导入请求失败", "error");
    }
  };
  
  
  // Sync URL filter to state on mount if needed, or just use state
  // For simplicity and unified UI, we prioritize local state controlled by dropdowns
  
  const filteredGoods = goods.filter(g => {
    // 1. Status Filter
    if (selectedStatus === 'low_stock') {
       if (g.stock >= settings.lowStockThreshold) return false;
    }

    // 2. Category Filter
    if (selectedCategory !== 'all') {
      const catName = typeof g.category === 'object' ? (g.category as Category).name : String(g.category);
      if (catName !== selectedCategory) return false;
    }

    const query = searchQuery.trim();
    if (!query) return true;

    const nameMatch = pinyinMatch(g.name, query);
    
    // Category match (for search input)
    let categoryMatch = false;
    if (g.category) {
      if (typeof g.category === 'object') {
        categoryMatch = pinyinMatch((g.category as Category).name, query);
      } else {
        categoryMatch = pinyinMatch(String(g.category), query);
      }
    }
    
    // SKU match
    const skuMatch = pinyinMatch(g.sku || "", query);
    
    return nameMatch || categoryMatch || skuMatch;
  });

  return (
    <div className="space-y-8">
      {/* Header section with unified style */}
      <div className="flex items-center justify-between mb-6 sm:mb-8 transition-all relative z-10 gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">商品库</h1>
          <p className="hidden md:block text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
            {isLoading ? "正在从数据库加载商品..." : "统一管理商品信息与SKU。"}
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
           {user && (
             <div className="glass p-1 rounded-full flex gap-1 items-center h-9 sm:h-10 shadow-sm border border-white/10">
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
          <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full sm:flex-1 shrink-0">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="搜索商品..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
            />
          </div>
          
          <div className="grid grid-cols-2 sm:flex gap-3 h-10 sm:h-11 w-full sm:w-auto">
             <div className="w-full sm:w-40 h-full"> 
                <CustomSelect 
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    options={[
                        { value: 'all', label: '所有状态' },
                        { value: 'low_stock', label: '库存预警' }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-sm py-0"
                />
             </div>
             <div className="w-full sm:w-40 h-full">
                <CustomSelect 
                    value={selectedCategory}
                    onChange={setSelectedCategory}
                    options={[
                        { value: 'all', label: '所有分类' },
                        ...categories.map(c => ({ value: c.name, label: c.name }))
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-sm py-0"
                />
             </div>
          </div>
      </div>

      {/* Grid */}
      {isLoading ? (
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
              onEdit={user ? handleEdit : undefined} 
              onDelete={user ? handleDelete : undefined} 
              lowStockThreshold={settings.lowStockThreshold}
              isSelected={selectedIds.includes(product.id)}
              anySelected={selectedIds.length > 0}
              onToggleSelect={toggleSelectProduct}
              priority={index < 4}
            />
          ))}
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
            "供应商": "默认供应商"
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
        totalCount={filteredGoods.length}
        onToggleSelectAll={() => {
          if (selectedIds.length === filteredGoods.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredGoods.map(g => g.id));
          }
        }}
        onClear={() => setSelectedIds([])}
        label="个商品"
        onDelete={handleBatchDelete}
        onEdit={() => setIsBatchEditOpen(true)}
      />
    </div>
  );
}
