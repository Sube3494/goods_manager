"use client";

import { useState, useEffect } from "react";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { Search, Plus, Download, ListChecks, Trash2, X } from "lucide-react";
import { Product, Category } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { ActionBar } from "@/components/ui/ActionBar";


import { useUser } from "@/hooks/useUser";
import { useSearchParams } from "next/navigation";

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


  const { showToast } = useToast();

  const fetchGoods = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setGoods(data);
      }
    } catch (error) {
      console.error("Failed to fetch goods", error);
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


  const handleBatchDelete = () => {
    const count = selectedIds.length;
    setConfirmConfig({
      isOpen: true,
      title: "批量删除商品",
      message: `确定要删除选中的 ${count} 个商品吗?此操作不可恢复。`,
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
            showToast("批量删除失败", "error");
          }
        } catch {
          showToast("批量删除请求失败", "error");
        }
      },
    });
  };

  const handleSaveItem = async (data: Partial<Product>) => {
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

  const handleImport = async (data: Record<string, unknown>[]) => {
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
  
  const searchParams = useSearchParams();
  const filterType = searchParams.get('filter');

  const filteredGoods = goods.filter(g => {
    // 1. Low stock filter
    if (filterType === 'low_stock') {
       if (g.stock >= settings.lowStockThreshold) return false;
    }

    const searchLower = searchQuery.toLowerCase();
    const nameMatch = g.name.toLowerCase().includes(searchLower);
    
    // Category match
    let categoryMatch = false;
    if (g.category) {
      if (typeof g.category === 'object') {
        categoryMatch = (g.category as Category).name.toLowerCase().includes(searchLower);
      } else {
        categoryMatch = (g.category as string).toLowerCase().includes(searchLower);
      }
    }
    
    // SKU match
    const skuMatch = g.sku?.toLowerCase().includes(searchLower) || false;
    
    return nameMatch || categoryMatch || skuMatch;
  });

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between relative z-10">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">商品库</h1>
          <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-lg">
            {isLoading ? "正在从数据库加载商品..." : filterType === 'low_stock' ? "仅显示需补货商品" : "统一管理商品信息与SKU。"}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
           {user && (
             <div className="glass p-1 rounded-full flex gap-1 items-center h-10">
               <button 
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-2 rounded-full px-3 sm:px-4 h-8 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
                >
                  <Download size={18} />
                  <span className="hidden sm:inline">Excel 导入</span>
                </button>
                <button 
                  onClick={handleCreate}
                  className="flex items-center gap-2 rounded-full bg-primary px-4 sm:px-6 h-8 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">新建商品</span>
                  <span className="inline sm:hidden">新建</span>
                </button>
             </div>
           )}
        </div>
      </div>

      {/* Search Box */}
      <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索商品名称、SKU 或分类..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            <p className="text-sm text-muted-foreground">尝试调整搜索关键词或添加新商品。</p>
        </div>
      )}

      <ImportModal 
        isOpen={isImportOpen} 
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />

      <ProductFormModal 
        key={editingProduct?.id || 'create'}
        isOpen={isNewProductOpen}
        onClose={() => setIsNewProductOpen(false)}
        onSubmit={handleSaveItem}
        initialData={editingProduct}
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
      />
    </div>
  );
}
