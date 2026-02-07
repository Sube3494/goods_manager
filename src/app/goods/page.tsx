"use client";

import { useState } from "react";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { Search, Plus, Filter, Download } from "lucide-react";

// Dummy Data
import { INITIAL_GOODS } from "@/lib/mockData";
import { Product } from "@/lib/types";

interface ImportedItem {
  SKU?: string;
  sku?: string;
  Name?: string;
  name?: string;
  Category?: string;
  category?: string;
  Price?: number | string;
  price?: number | string;
  Stock?: number | string;
  stock?: number | string;
  Image?: string;
  image?: string;
  [key: string]: unknown;
}

export default function GoodsPage() {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [goods, setGoods] = useState<Product[]>(INITIAL_GOODS);
  const [searchQuery, setSearchQuery] = useState("");

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleImport = (data: Record<string, unknown>[]) => {
    // Transform imported data to match our schema and append
    const newGoods = data.map((item: ImportedItem, index) => ({
        id: `imported-${Date.now()}-${index}`,
        sku: item.SKU || item.sku || `IMP-${Date.now()}-${index}`,
        name: item.Name || item.name || "Unknown Product",
        category: item.Category || item.category || "Uncategorized",
        price: Number(item.Price || item.price) || 0,
        stock: Number(item.Stock || item.stock) || 0,
        image: item.Image || item.image || undefined
    })) as Product[];
    setGoods([...goods, ...newGoods]);
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setIsNewProductOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsNewProductOpen(true);
  };

  const handleSaveItem = (item: Omit<Product, "id"> & { id?: string }) => {
    if (item.id) {
        // Update existing
        setGoods(goods.map(g => g.id === item.id ? { ...item, id: item.id! } : g));
    } else {
        // Create new
        const newItem: Product = {
            ...item,
            id: `new-${Date.now()}`
        };
        setGoods([newItem, ...goods]);
    }
    setIsNewProductOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("确定要删除该商品吗？此操作不可恢复。")) {
        setGoods(goods.filter(g => g.id !== id));
    }
  };

  const filteredGoods = goods.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    g.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between relative z-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">商品库</h1>
          <p className="text-muted-foreground mt-2 text-lg">统一管理商品信息与SKU。</p>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="glass p-1 rounded-xl flex gap-2">
              <button 
                onClick={() => setIsImportOpen(true)}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
              >
                <Download size={18} />
                Excel 导入
              </button>
              <button 
                onClick={handleCreate}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
              >
                <Plus size={18} />
                新建商品
              </button>
           </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4 backdrop-blur-md md:flex-row md:items-center shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索商品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-secondary/50 px-10 py-2 text-sm text-foreground outline-none ring-1 ring-border transition-all placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
          <Filter size={16} />
          筛选
        </button>
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredGoods.map((product) => (
          <GoodsCard key={product.id} product={product} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </div>

      {/* Empty State */}
      {filteredGoods.length === 0 && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 text-center">
            <div className="rounded-full bg-muted/50 p-4 mb-4">
                <Search size={32} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No products found</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
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
    </div>
  );
}
