"use client";

import { useState } from "react";
import { Plus, Search, Edit2, Trash2, Truck, Phone, Mail, MapPin, CheckCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SupplierModal } from "@/components/Suppliers/SupplierModal";
import { Supplier } from "@/lib/types";

import { INITIAL_SUPPLIERS } from "@/lib/mockData";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const { showToast } = useToast();

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsModalOpen(true);
  };

  const handleSubmit = (data: Omit<Supplier, "id"> & { id?: string }) => {
    if (editingSupplier && data.id) {
      // Edit mode
      setSuppliers(suppliers.map(s => s.id === data.id ? { ...data, id: data.id! } as Supplier : s));
      showToast("供应商已更新", "success");
    } else {
      // Create mode
      const newSupplier: Supplier = {
        ...data,
        id: `new-${Date.now()}`
      };
      setSuppliers([newSupplier, ...suppliers]);
      showToast("供应商已创建", "success");
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`确定要删除供应商 "${name}" 吗？此操作不可逆。`)) {
        setSuppliers(suppliers.filter(s => s.id !== id));
        setSelectedIds(selectedIds.filter(sid => sid !== id));
        showToast("供应商已删除", "success");
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
    if (window.confirm(`确定要删除选中的 ${selectedIds.length} 个供应商吗？`)) {
        setSuppliers(suppliers.filter(s => !selectedIds.includes(s.id)));
        setSelectedIds([]);
        showToast(`已批量删除 ${selectedIds.length} 个供应商`, "success");
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === suppliers.length) {
        setSelectedIds([]);
    } else {
        setSelectedIds(suppliers.map(s => s.id));
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.contact.toLowerCase().includes(searchQuery.toLowerCase())
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
            {selectedIds.length > 0 && (
                <>
                    <button
                        onClick={handleSelectAll}
                        className="flex items-center gap-2 rounded-lg bg-white/80 dark:bg-zinc-800/80 border border-border/50 px-4 py-2.5 text-sm font-bold text-foreground hover:bg-white dark:hover:bg-zinc-800 hover:border-primary/50 hover:text-primary shadow-sm hover:shadow-md transition-all duration-300"
                    >
                        <CheckCheck size={18} />
                        {selectedIds.length === suppliers.length ? "取消全选" : "全选"}
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
                新建供应商
            </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/50 p-4 backdrop-blur-md md:flex-row md:items-center shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="搜索供应商..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg bg-secondary/50 px-10 py-2 text-sm text-foreground outline-none ring-1 ring-border transition-all placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-primary/20"
          />
        </div>
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
                                <p className="text-xs text-muted-foreground">ID: {supplier.id}</p>
                            </div>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleSelect(supplier.id); }}
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
                    
                    <div className="space-y-2 mt-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <Truck size={14} className="text-primary/70" />
                            <span className="text-foreground/80">{supplier.contact}</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <Phone size={14} />
                             <span>{supplier.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <Mail size={14} />
                             <span>{supplier.email}</span>
                        </div>
                        <div className="flex items-start gap-2">
                             <MapPin size={14} className="mt-0.5" />
                             <span className="line-clamp-2">{supplier.address}</span>
                        </div>
                    </div>
                    
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
    </div>
  );
}
