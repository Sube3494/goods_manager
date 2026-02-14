"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Edit2, Trash2, Truck, Phone, Mail, MapPin, Check, Package } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SupplierModal } from "@/components/Suppliers/SupplierModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionBar } from "@/components/ui/ActionBar";
import { Supplier } from "@/lib/types";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    message: string;
    title?: string;
    variant?: "danger" | "warning";
  }>({
    isOpen: false,
    onConfirm: () => {},
    message: "",
  });
  
  const { showToast } = useToast();

  const fetchSuppliers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        setSuppliers(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
      showToast("加载供应商失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleSubmit = async (data: Omit<Supplier, "id"> & { id?: string }) => {
    try {
      const isEdit = !!editingSupplier;
      const url = isEdit ? `/api/suppliers/${editingSupplier.id}` : "/api/suppliers";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        fetchSuppliers();
        showToast(isEdit ? "供应商已更新" : "供应商已创建", "success");
        setIsModalOpen(false);
      } else {
        showToast("操作失败", "error");
      }
    } catch (error) {
      console.error("Supplier submit failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除供应商",
      message: `确定要删除供应商 "${name}" 吗？此操作不可逆，将影响已关联的商品数据。`,
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
          if (res.ok) {
            fetchSuppliers();
            setSelectedIds(selectedIds.filter(sid => sid !== id));
            showToast("供应商已删除", "success");
          } else {
            const data = await res.json();
            showToast(data.error || "删除失败", "error");
          }
        } catch (error) {
          console.error("Delete supplier failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
        setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
        setSelectedIds([...selectedIds, id]);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.contact.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 transition-all">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">供应商管理</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">管理供应链合作伙伴与联系信息。</p>
        </div>
        
        <div className="flex gap-2">
            <button 
                onClick={handleOpenCreate}
                className="h-10 flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
            >
                <Plus size={18} />
                新建供应商
            </button>
        </div>
      </div>

      {/* Search Box */}
      <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索供应商..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {isLoading ? (
          [1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))
        ) : filteredSuppliers.length > 0 ? (
           filteredSuppliers.map((supplier) => {
             const isSelected = selectedIds.includes(supplier.id);
             return (
                <div 
                  key={supplier.id} 
                  className={`group relative overflow-hidden rounded-2xl glass-card border p-4 transition-all duration-300 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                  }`}
                >
                    <div className="flex items-start justify-between mb-3 relative z-10">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-sm transition-transform duration-300 group-hover:scale-110">
                            <Truck size={18} strokeWidth={1.5} />
                        </div>
                        
                        <div className={`relative transition-all duration-300 ${isSelected || selectedIds.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleSelect(supplier.id); }}
                                className={`relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                    isSelected 
                                    ? "bg-foreground border-foreground text-background scale-110" 
                                    : "border-muted-foreground/30 hover:border-foreground/50"
                                }`}
                            >
                                {isSelected && <Check size={12} strokeWidth={4} />}
                            </button>
                        </div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-foreground mb-3 truncate group-hover:text-primary transition-colors">
                      {supplier.name}
                    </h3>
                    
                    <div className="flex justify-between items-center w-full">
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded uppercase tracking-wider">
                                {supplier.code ? supplier.code : `SUP__${supplier.id.substring(0, 4)}`}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full w-fit">
                                <Package size={12} strokeWidth={2.5} />
                                <span>{supplier._count?.products || 0}</span>
                            </div>
                        </div>
                        
                        <div className="flex gap-1 opacity-100 translate-y-0 lg:opacity-0 lg:translate-y-1 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 transition-all duration-300">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleOpenEdit(supplier); }} 
                                className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
                                title="编辑"
                            >
                                <Edit2 size={14} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(supplier.id, supplier.name); }} 
                                className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                                title="删除"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                </div>
             );
           })
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
            <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border group-hover:scale-110 transition-transform duration-500">
              <Truck size={40} strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-foreground">暂无供应商数据</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
              {searchQuery ? '未找到匹配的供应商，尝试调整关键词。' : '当前没有任何供应商，点击右上角“新建供应商”开始。'}
            </p>
          </div>
        )}
      </div>

      <SupplierModal
        key={editingSupplier?.id || 'create'}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSubmit}
        initialData={editingSupplier}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        variant={confirmConfig.variant}
        confirmLabel="确认执行"
      />

      <ActionBar 
        selectedCount={selectedIds.length}
        totalCount={filteredSuppliers.length}
        onToggleSelectAll={() => {
          if (selectedIds.length === filteredSuppliers.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredSuppliers.map(s => s.id));
          }
        }}
        onClear={() => setSelectedIds([])}
        label="个供应商"
        onDelete={() => {
          setConfirmConfig({
            isOpen: true,
            title: "批量删除供应商",
            message: `确定要删除选中的 ${selectedIds.length} 个供应商吗？此操作不可恢复。`,
            variant: "danger",
            onConfirm: async () => {
              try {
                const res = await fetch(`/api/suppliers/${selectedIds.join(",")}`, {
                  method: "DELETE",
                });
                if (res.ok) {
                  showToast("所选供应商已删除", "success");
                  setSelectedIds([]);
                  fetchSuppliers();
                } else {
                  const data = await res.json();
                  showToast(data.error || "删除失败", "error");
                }
              } catch {
                showToast("网络请求失败", "error");
              }
            },
          });
        }}
      />
    </div>
  );
}
