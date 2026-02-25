"use client";

import { useState } from "react";
import { X, CheckCircle, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface BatchEditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { commission?: number; note?: string }) => void;
  selectedCount: number;
}

export function BatchEditOrderModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  selectedCount 
}: BatchEditOrderModalProps) {
  const [commission, setCommission] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { commission?: number; note?: string } = {};
    if (commission.trim() !== "") {
      data.commission = Number(commission);
    }
    if (note.trim() !== "") {
      data.note = note.trim();
    }
    
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
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 shadow-2xl bg-white dark:bg-gray-900/70 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border/10 p-6">
            <div>
              <h3 className="text-xl font-bold text-foreground">批量修改订单</h3>
              <p className="text-xs text-muted-foreground mt-1">已选中 {selectedCount} 个订单</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="text-sm font-bold w-4 h-4 flex items-center justify-center bg-muted-foreground/10 rounded-sm">¥</span> 统一佣金设置
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">¥</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder="留空则保持原貌"
                  className="w-full rounded-2xl bg-muted/30 border border-border/50 h-12 pl-8 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText size={16} /> 统一备注内容
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="最多500字... 留空则保持原貌"
                rows={3}
                className="w-full rounded-2xl bg-muted/30 border border-border/50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              />
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-border/50 py-3 text-sm font-bold text-foreground hover:bg-muted/50 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={commission.trim() === "" && note.trim() === ""}
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
