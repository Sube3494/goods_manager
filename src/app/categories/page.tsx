"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Tag, Layers, CheckCheck, RefreshCw } from "lucide-react";
import { Category } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { CategoryModal } from "@/components/Categories/CategoryModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

import { useUser } from "@/hooks/useUser";

export default function CategoriesPage() {
  const { user } = useUser();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>(undefined);
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

  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error("Failed to fetch categories", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenCreate = () => {
    setEditingCategory(undefined);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除分类",
      message: `确定要删除分类 "${name}" 吗？此操作不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/categories?id=${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            showToast("分类已删除", "success");
            fetchCategories();
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

  const handleSubmit = async (data: Partial<Category>) => {
    try {
      const method = editingCategory ? "PUT" : "POST";
      const url = "/api/categories";
      
      const body = editingCategory ? { ...data, id: editingCategory.id } : data;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingCategory ? "分类更新成功" : "分类创建成功", "success");
        setIsModalOpen(false);
        fetchCategories();
      } else {
        showToast("操作失败", "error");
      }
    } catch (error) {
      showToast("请求失败", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
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
            {/* Search */}
            <div className="h-12 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-64">
                <Search size={18} className="text-muted-foreground shrink-0" />
                <input 
                    type="text"
                    placeholder="搜索分类..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
                />
            </div>

            {user && selectedIds.length > 0 && (
                <>
                {/* ... existing bulk actions placeholder ... */}
                </>
            )}
            {user && (
              <button 
                  onClick={handleOpenCreate}
                  className="h-12 flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
              >
                  <Plus size={18} />
                  新建分类
              </button>
            )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCategories.map((category) => {
                const isSelected = selectedIds.includes(category.id);
                return (
                    <div key={category.id} className={`group relative overflow-hidden rounded-2xl glass-card border p-6 transition-all duration-300 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <div className="flex items-start justify-between mb-4 relative z-10">
                            <div className={`h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-md`}>
                                <Layers className="opacity-80 drop-shadow-sm" size={24} />
                            </div>
                            {user && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); toggleSelect(category.id); }}
                                    className={`relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                        isSelected 
                                        ? "bg-foreground border-foreground text-background scale-110" 
                                        : "border-muted-foreground/30 hover:border-foreground/50"
                                    }`}
                                >
                                    {isSelected && (
                                        <CheckCheck size={14} />
                                    )}
                                </button>
                            )}
                        </div>
                        
                        <h3 className="text-xl font-bold text-foreground mb-1">{category.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">{category.description}</p>
                        
                        <div className="flex justify-between items-center w-full mt-auto pt-4 border-t border-border">
                              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                                  <Tag size={12} />
                                  {category.products?.length || 0} items
                              </div>
                              
                              {user && (
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
                              )}
                            </div>
                        </div>
                    );
                })}
            </div>
      )}

      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        initialData={editingCategory}
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
