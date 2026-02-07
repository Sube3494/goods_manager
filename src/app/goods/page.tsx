"use client";

import { useState, useEffect } from "react";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { Search, Plus, Download, RefreshCw } from "lucide-react";
import { Product, Category } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";

import { useUser } from "@/hooks/useUser";

export default function GoodsPage() {
  const { user } = useUser();
  const [goods, setGoods] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
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

  useEffect(() => {
    fetchGoods();
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
        } catch (error) {
          showToast("删除请求失败", "error");
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
    } catch (error) {
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
    } catch (error) {
      showToast("导入请求失败", "error");
    }
  };
  
  const filteredGoods = goods.filter(g => {
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground">商品库</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {isLoading ? "正在从数据库加载商品..." : "统一管理商品信息与SKU。"}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
           {user && (
             <div className="glass p-1 rounded-full flex gap-1 items-center h-10">
                <button 
                  onClick={() => setIsImportOpen(true)}
                  className="flex items-center gap-2 rounded-full px-4 h-8 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
                >
                  <Download size={18} />
                  Excel 导入
                </button>
                <button 
                  onClick={handleCreate}
                  className="flex items-center gap-2 rounded-full bg-primary px-6 h-8 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
                >
                  <Plus size={18} />
                  新建商品
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
          {filteredGoods.map((product) => (
            <GoodsCard 
              key={product.id} 
              product={product} 
              onEdit={user ? handleEdit : undefined} 
              onDelete={user ? handleDelete : undefined} 
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
    </div>
  );
}
