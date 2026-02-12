"use client";

import { useState } from "react";
import { X, Tag, Truck, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Category, Supplier } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface BatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { categoryId?: string; supplierId?: string }) => void;
  categories: Category[];
  suppliers: Supplier[];
  selectedCount: number;
}

export function BatchEditModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  categories, 
  suppliers, 
  selectedCount 
}: BatchEditModalProps) {
  const [categoryId, setCategoryId] = useState<string>("keep");
  const [supplierId, setSupplierId] = useState<string>("keep");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { categoryId?: string; supplierId?: string } = {};
    if (categoryId !== "keep") data.categoryId = categoryId;
    if (supplierId !== "keep") data.supplierId = supplierId;
    
    onConfirm(data);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white dark:bg-gray-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/5 p-6">
            <div>
              <h3 className="text-xl font-bold text-foreground">批量修改商品</h3>
              <p className="text-xs text-muted-foreground mt-1">已选中 {selectedCount} 个商品</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Category Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Tag size={16} /> 目标分类
              </label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: "keep", label: "保持原分类 (不修改)" },
                  ...categories.map(c => ({ value: c.id, label: c.name }))
                ]}
                triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
              />
            </div>

            {/* Supplier Select */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Truck size={16} /> 目标供应商
              </label>
              <CustomSelect
                value={supplierId}
                onChange={setSupplierId}
                options={[
                  { value: "keep", label: "保持原供应商 (不修改)" },
                  ...suppliers.map(s => ({ value: s.id, label: s.name }))
                ]}
                triggerClassName="w-full rounded-2xl bg-muted/30 border-white/5 h-12"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-bold text-foreground hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={categoryId === "keep" && supplierId === "keep"}
                className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                确认修改
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
