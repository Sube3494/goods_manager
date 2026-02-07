"use client";

import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Tag, Layers, CheckCheck } from "lucide-react";
import { Category } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { CategoryModal } from "@/components/Categories/CategoryModal";

// Dummy Data
const INITIAL_CATEGORIES = [
  { id: "1", name: "Accessories", count: 124, description: "Bags, jewelry, and wearable add-ons.", color: "bg-orange-500" },
  { id: "2", name: "Electronics", count: 85, description: "Gadgets, devices, and digital equipment.", color: "bg-blue-500" },
  { id: "3", name: "Home Decor", count: 42, description: "Furniture, lighting, and interior items.", color: "bg-green-500" },
  { id: "4", name: "Clothing", count: 215, description: "Apparel for men, women, and children.", color: "bg-purple-500" },
  { id: "5", name: "Footwear", count: 68, description: "Shoes, sneakers, and boots.", color: "bg-red-500" },
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const { showToast } = useToast();

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleSubmit = (data: Omit<Category, "id" | "count">) => {
    if (editingCategory) {
      // Edit mode
      setCategories(categories.map(c => c.id === editingCategory.id ? { ...data, id: c.id, count: c.count } : c));
      showToast("分类已更新", "success");
    } else {
      // Create mode
      const newCat = {
        ...data,
        id: `new-${Date.now()}`,
        count: 0
      };
      setCategories([newCat, ...categories]);
      showToast("分类已创建", "success");
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`确定要删除分类 "${name}" 吗？此操作不可逆。`)) {
        setCategories(categories.filter(c => c.id !== id));
        setSelectedIds(selectedIds.filter(sid => sid !== id));
        showToast("分类已删除", "success");
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
        setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
        setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = () => {
    if (window.confirm(`确定要删除选中的 ${selectedIds.length} 个分类吗？`)) {
        setCategories(categories.filter(c => !selectedIds.includes(c.id)));
        setSelectedIds([]);
        showToast(`已批量删除 ${selectedIds.length} 个分类`, "success");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === categories.length) {
        setSelectedIds([]);
    } else {
        setSelectedIds(categories.map(c => c.id));
    }
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">分类管理</h1>
          <p className="text-muted-foreground mt-2">管理商品类别与属性。</p>
        </div>
        
        <div className="flex gap-2">
            {selectedIds.length > 0 && (
                <>
                    <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-2 rounded-lg bg-white/80 dark:bg-zinc-800/80 border border-border/50 px-4 py-2.5 text-sm font-bold text-foreground hover:bg-white dark:hover:bg-zinc-800 hover:border-primary/50 hover:text-primary shadow-sm hover:shadow-md transition-all duration-300"
                    >
                        <CheckCheck size={18} />
                        {selectedIds.length === categories.length ? "取消全选" : "全选"}
                    </button>
                    <button 
                        onClick={handleBulkDelete}
                        className="flex items-center gap-2 rounded-lg bg-destructive px-5 py-2.5 text-sm font-bold text-destructive-foreground shadow-lg shadow-destructive/30 hover:shadow-destructive/50 hover:-translate-y-0.5 transition-all"
                    >
                        <Trash2 size={18} />
                        批量删除 ({selectedIds.length})
                    </button>
                </>
            )}
            <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
            >
                <Plus size={18} />
                新建分类
            </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4 backdrop-blur-md md:flex-row md:items-center shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索分类..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-secondary/50 px-10 py-2 text-sm text-foreground outline-none ring-1 ring-border transition-all placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredCategories.map((category) => {
            const isSelected = selectedIds.includes(category.id);
            return (
                <div key={category.id} className={`group relative overflow-hidden rounded-2xl glass-card border p-6 transition-all duration-300 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className={`h-12 w-12 rounded-xl ${category.color} bg-opacity-10 flex items-center justify-center text-white shadow-md`}>
                            <Layers className="opacity-80 drop-shadow-sm" size={24} />
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleSelect(category.id); }}
                            className={`relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                isSelected 
                                ? "bg-foreground border-foreground text-background scale-110" 
                                : "border-muted-foreground/30 hover:border-foreground/50"
                            }`}
                        >
                            {isSelected && (
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="3" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    className="h-3.5 w-3.5"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>
                    </div>
                    
                    <h3 className="text-xl font-bold text-foreground mb-1">{category.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">{category.description}</p>
                    
                    <div className="flex items-center justify-between border-t border-border pt-4 mt-auto">
                        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                            <Tag size={12} />
                            {category.count} items
                        </div>
                        
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                            <button 
                                onClick={() => handleOpenEdit(category)} 
                                className="p-2 rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button 
                                onClick={() => handleDelete(category.id, category.name)} 
                                className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Decorative colored glow */}
                    <div className={`absolute -right-10 -top-10 h-32 w-32 rounded-full ${category.color} blur-[60px] opacity-10 group-hover:opacity-20 transition-opacity`} />
                </div>
            );
        })}
      </div>

      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        initialData={editingCategory}
      />
    </div>
  );
}
