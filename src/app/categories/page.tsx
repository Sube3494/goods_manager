"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Edit2, Trash2, Tag, Layers, Check } from "lucide-react";
import { Category } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { CategoryModal } from "@/components/Categories/CategoryModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionBar } from "@/components/ui/ActionBar";

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

  const fetchCategories = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Failed to fetch categories", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

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
          const res = await fetch(`/api/categories/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            showToast("分类已删除", "success");
            fetchCategories();
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          } else {
            const data = await res.json();
            showToast(data.error || "删除失败", "error");
          }
        } catch {
          showToast("删除请求失败", "error");
        }
      },
    });
  };

  const handleSubmit = async (data: Partial<Category>) => {
    try {
      const method = editingCategory ? "PUT" : "POST";
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
      
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
    } catch {
      showToast("请求失败", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };
  
  const filteredCategories = categories.filter((c: Category) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 transition-all">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">分类管理</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">管理商品类别与属性。</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Search */}
            <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full sm:w-64 shrink-0">
                <Search size={18} className="text-muted-foreground shrink-0" />
                <input 
                    type="text"
                    placeholder="搜索分类..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
                />
            </div>
            {user && (
              <button 
                  onClick={handleOpenCreate}
                  className="h-9 sm:h-10 flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-full bg-primary px-5 sm:px-6 text-xs sm:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all whitespace-nowrap"
              >
                  <Plus size={16} />
                  新建分类
              </button>
            )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredCategories.map((category) => {
                const isSelected = selectedIds.includes(category.id);
                return (
                    <div key={category.id} className={`group relative overflow-hidden rounded-2xl glass-card border p-4 transition-all duration-300 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <div className="flex items-start justify-between mb-3 relative z-10">
                            <div className={`h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm transition-transform duration-300 group-hover:scale-110`}>
                                <Layers className="opacity-90 drop-shadow-sm" size={18} />
                            </div>
                            {user && (
                                <div className={`relative transition-all duration-300 ${isSelected || selectedIds.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleSelect(category.id); }}
                                        className={`relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                            isSelected 
                                            ? "bg-foreground border-foreground text-background scale-110" 
                                            : "border-muted-foreground/30 hover:border-foreground/50"
                                        }`}
                                    >
                                        {isSelected && (
                                            <Check size={12} strokeWidth={4} />
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <h3 className="text-lg font-bold text-foreground mb-3">{category.name}</h3>
                        
                        <div className="flex justify-between items-center w-full">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-md">
                                  <Tag size={13} />
                                  {category.count || 0}
                              </div>
                              
                              {user && (
                                <div className="flex gap-1 opacity-100 translate-y-0 lg:opacity-0 lg:translate-y-1 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 transition-all duration-300">
                                    <button 
                                        onClick={() => handleOpenEdit(category)} 
                                        className="p-1.5 rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(category.id, category.name)} 
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                              )}
                            </div>
                        </div>
                    );
                })}
                {filteredCategories.length === 0 && (
                  <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                    <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border group-hover:scale-110 transition-transform duration-500">
                      <Tag size={40} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-bold text-foreground">暂无分类数据</h3>
                    <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                      {searchQuery ? '未找到匹配结果，尝试更改搜索关键词。' : '还没有任何分类，点击右上角“新建分类”开始。'}
                    </p>
                  </div>
                )}
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

      <ActionBar 
        selectedCount={selectedIds.length}
        totalCount={filteredCategories.length}
        onToggleSelectAll={() => {
          if (selectedIds.length === filteredCategories.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredCategories.map((c: Category) => c.id));
          }
        }}
        onClear={() => setSelectedIds([])}
        label="个分类"
        onDelete={() => {
          setConfirmConfig({
            isOpen: true,
            title: "批量删除分类",
            message: `确定要删除选中的 ${selectedIds.length} 个分类吗？此操作不可恢复。`,
            onConfirm: async () => {
              try {
                const res = await fetch(`/api/categories/${selectedIds.join(",")}`, {
                  method: "DELETE",
                });
                if (res.ok) {
                  showToast("所选分类已删除", "success");
                  setSelectedIds([]);
                  fetchCategories();
                } else {
                  const data = await res.json();
                  showToast(data.error || "删除失败", "error");
                }
              } catch {
                showToast("删除请求失败", "error");
              }
            },
          });
        }}
      />
    </div>
  );
}
