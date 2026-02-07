"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Filter, ShoppingBag, Calendar, DollarSign, Edit2, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOrder, PurchaseStatus, Supplier } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    onConfirm: () => {},
    message: "",
  });
  const { showToast } = useToast();

  const fetchData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/purchases"),
        fetch("/api/suppliers")
      ]);
      if (pRes.ok && sRes.ok) {
        setPurchases(await pRes.json());
        setSuppliers(await sRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch purchases data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getSupplierName = (id: string) => {
    return suppliers.find(s => s.id === id)?.name || "未知供应商";
  };

  const getStatusColor = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Ordered": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  const getStatusLabel = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "已入库";
      case "Ordered": return "已下单";
      default: return "草稿";
    }
  };

  const handleCreate = () => {
    setEditingPurchase(null);
    setIsModalOpen(true);
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除采购单",
      message: `确定要删除单号为 ${id} 的采购单吗？此操作将移除所有关联的采购项目，且不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
          if (res.ok) {
            fetchData();
            showToast("采购单已删除", "success");
          } else {
            showToast("删除失败", "error");
          }
        } catch (error) {
          console.error("Delete purchase failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };

  const handleConfirmReceipt = async (id: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Received" }),
      });
      if (res.ok) {
        fetchData();
        showToast("采购入库成功", "success");
      } else {
        showToast("入库失败", "error");
      }
    } catch (error) {
      console.error("Confirm receipt failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleSave = async (data: Partial<PurchaseOrder>) => {
    try {
      const isEdit = !!editingPurchase;
      const url = isEdit ? `/api/purchases/${editingPurchase.id}` : "/api/purchases";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        fetchData();
        showToast(isEdit ? "采购单已保存" : "采购单已创建", "success");
        setIsModalOpen(false);
      } else {
        showToast("保存失败", "error");
      }
    } catch (error) {
      console.error("Purchase save failed:", error);
      showToast("网络错误", "error");
    }
  };

  const filteredPurchases = purchases.filter(p => 
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    getSupplierName(p.supplierId).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">采购管理</h1>
          <p className="text-muted-foreground mt-2">管理与供应商的采购订单，跟踪入库进度。</p>
        </div>
        
        <button 
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
        >
          <Plus size={18} />
          新建采购单
        </button>
      </div>

      {/* Search Box */}
      <div className="h-12 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索采购记录..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Table/List View */}
      <div className="rounded-2xl border border-border bg-white dark:bg-gray-900/70 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">采购单信息</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">供应商</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">交易金额</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">日期</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredPurchases.map((po) => (
                  <motion.tr 
                    key={po.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-foreground">{po.id}</span>
                        <span className="text-xs text-muted-foreground">{po.items.length} 个项目</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-foreground">{getSupplierName(po.supplierId)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-foreground font-bold">
                        <DollarSign size={14} className="mr-0.5 opacity-60" />
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                        {getStatusLabel(po.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        {po.date}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        {po.status === "Ordered" && (
                            <button 
                                onClick={() => handleConfirmReceipt(po.id)}
                                className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors" 
                                title="确认入库"
                            >
                                <CheckCircle2 size={16} />
                            </button>
                        )}
                        <button 
                            onClick={() => handleEdit(po)}
                            className="p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                            title="编辑"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                            onClick={() => handleDelete(po.id)}
                            className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                            title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredPurchases.length === 0 && (
            <div className="p-12 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4 text-muted-foreground">
                <ShoppingBag size={32} />
              </div>
              <h3 className="text-lg font-medium text-foreground">暂无采购记录</h3>
              <p className="text-muted-foreground mt-1">尝试搜索其他关键词或创建新的采购单。</p>
            </div>
          )}
        </div>
      </div>

      <PurchaseOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        initialData={editingPurchase}
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
