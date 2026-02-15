"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Tag } from "lucide-react";

import { Category } from "@/lib/types";

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Category>) => void;
  initialData?: Partial<Category> | null;
}


export function CategoryModal({ isOpen, onClose, onSubmit, initialData }: CategoryModalProps) {
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState<Partial<Category>>(initialData || {
    name: ""
  });

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        if (initialData) {
          setFormData(initialData);
        } else {
          setFormData({ name: "" });
        }
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-100 w-[calc(100%-32px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">
                {initialData ? "编辑分类" : "新建分类"}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Tag size={16} /> 分类名称 <span className="text-red-500">*</span>
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                            placeholder="例如：箱包配饰"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-white/10 p-8 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="flex items-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
                    >
                        <CheckCircle size={18} />
                        保存分类
                    </button>
                </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
