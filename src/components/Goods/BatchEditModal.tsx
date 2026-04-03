"use client";

import { useState, useEffect } from "react";
import { X, Tag, Truck, CheckCircle, Eye, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Category, Supplier } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface BatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { 
    categoryId?: string; 
    supplierId?: string; 
    isPublic?: boolean; 
    isDiscontinued?: boolean; 
    costPrice?: number;
  }) => void;
  categories: Category[];
  suppliers: Supplier[];
  selectedCount: number;
}

// 内部定义的表单组件，利用挂载/卸载生命周期来管理状态重置
const BatchEditForm = ({ 
  onClose, 
  onConfirm, 
  categories, 
  suppliers, 
  selectedCount 
}: Omit<BatchEditModalProps, "isOpen">) => {
  const [categoryId, setCategoryId] = useState<string>("keep");
  const [supplierId, setSupplierId] = useState<string>("keep");
  const [visibility, setVisibility] = useState<string>("keep");
  const [productionStatus, setProductionStatus] = useState<string>("keep");
  const [costPrice, setCostPrice] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { 
      categoryId?: string; 
      supplierId?: string; 
      isPublic?: boolean; 
      isDiscontinued?: boolean; 
      costPrice?: number;
    } = {};
    
    if (categoryId !== "keep") data.categoryId = categoryId;
    if (supplierId !== "keep") data.supplierId = supplierId;
    if (visibility !== "keep") data.isPublic = visibility === "public";
    if (productionStatus !== "keep") data.isDiscontinued = productionStatus === "discontinued";
    if (costPrice.trim() !== "") data.costPrice = parseFloat(costPrice);

    onConfirm(data);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-white dark:bg-gray-900/70 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/5 p-6 sm:p-8">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-foreground">批量修改商品</h3>
          <p className="text-xs text-muted-foreground mt-1">已选中 {selectedCount} 个商品</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {/* Category Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
              <Tag size={16} /> 目标分类
            </label>
            <CustomSelect
              value={categoryId}
              onChange={setCategoryId}
              options={[
                { value: "keep", label: "保持原分类" },
                ...categories.map(c => ({ value: c.id, label: c.name }))
              ]}
              triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
            />
          </div>

          {/* Supplier Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
              <Truck size={16} /> 目标供应商
            </label>
            <CustomSelect
              value={supplierId}
              onChange={setSupplierId}
              options={[
                { value: "keep", label: "保持原供应商" },
                ...suppliers.map(s => ({ value: s.id, label: s.name }))
              ]}
              triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
            />
          </div>

          {/* Visibility Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
              <Eye size={16} /> 可见性
            </label>
            <CustomSelect
              value={visibility}
              onChange={setVisibility}
              options={[
                { value: "keep", label: "保持当前状态" },
                { value: "public", label: "设为公开可见" },
                { value: "private", label: "设为隐藏不公开" }
              ]}
              triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
            />
          </div>

          {/* Production Status Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
              <Activity size={16} /> 生产状态
            </label>
            <CustomSelect
              value={productionStatus}
              onChange={setProductionStatus}
              options={[
                { value: "keep", label: "保持当前状态" },
                { value: "active", label: "正常生产中" },
                { value: "discontinued", label: "标记为已停产" }
              ]}
              triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
            />
          </div>

          {/* Cost Price Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2 px-1">
              <Tag size={16} className="rotate-90" /> 进货单价
            </label>
            <div className="relative group/price">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold font-number">¥</span>
              <input
                type="number"
                step="0.01"
                placeholder="保持原单价"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full h-12 pl-10 pr-4 rounded-2xl bg-muted/30 border border-white/5 focus:border-primary/30 outline-none transition-all font-bold font-number"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-bold text-foreground hover:bg-white/5 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={categoryId === "keep" && supplierId === "keep" && visibility === "keep" && productionStatus === "keep" && costPrice.trim() === ""}
            className="flex-2 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle size={18} />
            确认修改所选商品
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export const BatchEditModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  categories, 
  suppliers, 
  selectedCount 
}: BatchEditModalProps) => {
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalStyle; };
    }
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-60000 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <BatchEditForm 
            onClose={onClose}
            onConfirm={onConfirm}
            categories={categories}
            suppliers={suppliers}
            selectedCount={selectedCount}
          />
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
