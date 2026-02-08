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
      const res = await fetch("/api/suppliers");
      if (res.ok) {
        setSuppliers(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch suppliers:", error);
    }
  }, []);

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
            showToast("删除失败", "error");
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
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">供应商管理</h1>
          <p className="text-muted-foreground mt-2">管理供应链合作伙伴与联系信息。</p>
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredSuppliers.map((supplier) => {
            const isSelected = selectedIds.includes(supplier.id);
            return (
                <div key={supplier.id} className={`group relative overflow-hidden rounded-2xl glass-card border p-6 transition-all duration-300 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <div className="flex items-start justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-sm">
                                <Truck size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-foreground line-clamp-1">{supplier.name}</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[10px] text-muted-foreground font-mono bg-secondary/50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        {supplier.code ? `${supplier.code}` : `ID: ${supplier.id.substring(0, 6)}`}
                                    </p>
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold">
                                        <Package size={12} />
                                        <span>{supplier._count?.products || 0} 件商品</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={`relative transition-all duration-300 ${isSelected || selectedIds.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleSelect(supplier.id); }}
                                className={`relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                    isSelected 
                                    ? "bg-foreground border-foreground text-background scale-110" 
                                    : "border-muted-foreground/30 hover:border-foreground/50"
                                }`}
                            >
                                {isSelected && (
                                    <Check size={14} strokeWidth={4} />
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {(supplier.contact || supplier.phone || supplier.email || supplier.address) && (
                        <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                            {supplier.contact && (
                                <div className="flex items-center gap-2">
                                    <Truck size={14} className="text-primary/70" />
                                    <span className="text-foreground/80">{supplier.contact}</span>
                                </div>
                            )}
                            {supplier.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone size={14} />
                                    <span>{supplier.phone}</span>
                                </div>
                            )}
                            {supplier.email && (
                                <div className="flex items-center gap-2">
                                    <Mail size={14} />
                                    <span>{supplier.email}</span>
                                </div>
                            )}
                            {supplier.address && (
                                <div className="flex items-start gap-2">
                                    <MapPin size={14} className="mt-0.5" />
                                    <span className="line-clamp-2">{supplier.address}</span>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="flex justify-end pt-4 mt-4 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                         <div className="flex gap-1">
                            <button 
                                onClick={() => handleOpenEdit(supplier)} 
                                className="p-2 rounded-lg hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                            >
                                <Edit2 size={16} />
                            </button>
                            <button 
                                onClick={() => handleDelete(supplier.id, supplier.name)} 
                                className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            );
        })}
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
                  showToast("批量删除失败", "error");
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
