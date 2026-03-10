"use client";

import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface PartialItem {
  id?: string;
  productName?: string | null;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
}

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editingItem: PartialItem;
  setEditingItem: (item: PartialItem) => void;
}

export function ItemModal({ isOpen, onClose, onSave, editingItem, setEditingItem }: ItemModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 lg:pl-(--sidebar-width) transition-[padding] duration-200">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-md"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-[380px] glass-panel relative z-10 rounded-[28px] shadow-2xl overflow-hidden border border-white/10"
      >
        <div className="p-6">
          <h2 className="text-xl font-black mb-6 tracking-tight text-foreground">
            {editingItem.id ? "编辑明细" : "手工补录明细"}
          </h2>
          <div className="space-y-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">商品名称 (非库内)</label>
              <input
                type="text"
                value={editingItem.productName || ""}
                onChange={(e) => setEditingItem({ ...editingItem, productName: e.target.value })}
                placeholder="如：垃圾桶、清洁剂"
                className="w-full h-11 px-4 rounded-xl border border-border bg-muted/30 focus:bg-background outline-none transition-all text-foreground text-sm"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">数量</label>
                <input
                  type="number"
                  min="1"
                  value={editingItem.quantity || ""}
                  onChange={(e) => setEditingItem({ ...editingItem, quantity: parseInt(e.target.value) || 1 })}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-muted/30 outline-none text-foreground text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">单价 (￥)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingItem.unitPrice !== undefined ? editingItem.unitPrice : ""}
                  onChange={(e) => setEditingItem({ ...editingItem, unitPrice: parseFloat(e.target.value) || 0 })}
                  className="w-full h-11 px-4 rounded-xl border border-border bg-muted/30 outline-none text-foreground text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">小计总额</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={
                  editingItem.totalAmount !== undefined
                    ? editingItem.totalAmount
                    : (editingItem.quantity || 1) * (editingItem.unitPrice || 0)
                }
                onChange={(e) => setEditingItem({ ...editingItem, totalAmount: parseFloat(e.target.value) || 0 })}
                className="w-full h-12 px-4 rounded-xl border-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-500 font-black text-lg focus:border-emerald-500 outline-none transition-all"
              />
            </div>
          </div>
          <div className="mt-8 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 h-12 rounded-xl border border-border font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-[0.98] text-sm"
            >
              取消
            </button>
            <button
              onClick={onSave}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-black shadow-md shadow-black/10 dark:shadow-none transition-all active:scale-[0.98] text-sm"
            >
              确认补录
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
