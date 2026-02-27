"use client";

import { useState, useEffect } from "react";
import { X, Check, FileText, ShoppingBag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

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
  // 仅在打开时由外部控制状态初始化的写法
  const [commission, setCommission] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [clearNote, setClearNote] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 初始化挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 监听打开状态，仅处理正交的副作用（如滚动锁定）
  // 状态重置改用 key 方案，使 React 自动重置组件状态，避免 Cascading Renders
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { commission?: number; note?: string; type?: string } = {};
    if (commission.trim() !== "") {
      data.commission = Number(commission);
    }
    
    if (type !== "") {
      data.type = type;
    }
    
    if (clearNote) {
      data.note = "";
    } else if (note.trim() !== "") {
      data.note = note.trim();
    }
    
    onConfirm(data);
    onClose();
  };

  // 通过 key={`batch-edit-${isOpen}`} 强行在开关时重写组件，
  // 这样内部的 useState 就会自动回归初始值，不再需要在 useEffect 中 set
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <div 
          key="batch-edit-modal-wrapper"
          className="fixed inset-0 z-70000 flex items-center justify-center p-4"
        >
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
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors"
                aria-label="关闭"
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
                  <ShoppingBag size={15} /> 批量修改平台
                </label>
                <div className="flex bg-muted/30 rounded-2xl p-1.5 border border-border/50">
                  {['美团', '淘宝', '京东'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setType(type === p ? "" : p)}
                      className={cn(
                        "flex-1 py-2 text-xs font-bold rounded-xl transition-all",
                        type === p 
                          ? "bg-white dark:bg-gray-800 text-primary shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                    <FileText size={16} /> 统一备注内容
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => setClearNote(!clearNote)}
                    className="flex items-center gap-2 group cursor-pointer"
                  >
                    <div className={cn(
                      "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                      clearNote 
                        ? "bg-foreground border-foreground text-background scale-110 shadow-lg shadow-foreground/10" 
                        : "border-muted-foreground/30 group-hover:border-foreground/50 bg-white dark:bg-black/20"
                    )}>
                      {clearNote && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Check size={12} strokeWidth={4} />
                        </motion.div>
                      )}
                    </div>
                    <span className={cn(
                      "text-[11px] font-black transition-colors uppercase tracking-tight", 
                      clearNote ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}>
                      清空备注
                    </span>
                  </button>
                </div>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={clearNote ? "已开启清空现有备注模式" : "最多500字... 留空则保持原貌"}
                  rows={3}
                  disabled={clearNote}
                  className={cn(
                    "w-full rounded-2xl bg-muted/30 border border-border/50 p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none shadow-inner",
                    clearNote && "opacity-40 grayscale cursor-not-allowed border-dashed"
                  )}
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
                  disabled={commission.trim() === "" && note.trim() === "" && !clearNote && type === ""}
                  className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  <Check size={18} />
                  确认修改
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
