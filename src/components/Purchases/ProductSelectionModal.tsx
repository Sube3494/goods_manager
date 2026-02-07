"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Package, Tag } from "lucide-react";
import { Product } from "@/lib/types";
import { INITIAL_GOODS } from "@/lib/mockData";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (products: Product[]) => void;
  selectedIds: string[];
  supplierId?: string;
}

export function ProductSelectionModal({ isOpen, onClose, onSelect, selectedIds, supplierId }: ProductSelectionModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);

  const filteredProducts = INITIAL_GOODS.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesSupplier = !supplierId || p.supplierId === supplierId;
    return matchesSearch && matchesSupplier;
  });

  const toggleProduct = (id: string) => {
    setTempSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    const selectedProducts = INITIAL_GOODS.filter(p => tempSelectedIds.includes(p.id));
    onSelect(selectedProducts);
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10000 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-10001 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-border p-8 bg-muted/30 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-foreground">选择商品</h2>
                <p className="text-xs text-muted-foreground mt-1">勾选您需要采购的商品（已自动过滤当前供应商）</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-8 space-y-4">
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input 
                  type="text"
                  placeholder="搜索商品名称或编号..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/50 border-transparent outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                {filteredProducts.map(product => {
                  const isSelected = tempSelectedIds.includes(product.id);
                  return (
                    <div 
                      key={product.id}
                      onClick={() => toggleProduct(product.id)}
                      className={cn(
                        "group flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer",
                        isSelected ? "bg-primary/5 border-primary/30" : "bg-card border-border/50 hover:border-primary/20 hover:bg-muted/30"
                      )}
                    >
                      <div className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all",
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-background border-border"
                      )}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>

                      <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50">
                        {product.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                <Package size={20} />
                            </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                           <span className="font-bold text-foreground truncate">{product.name}</span>
                           <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground font-mono">{product.sku}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Tag size={12} /> {product.category}
                            </span>
                            <span className="text-xs font-bold text-primary">
                                ￥{product.price}
                            </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredProducts.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground">
                        未找到相关商品
                    </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border p-8 bg-muted/30 shrink-0">
              <div className="text-sm font-medium text-muted-foreground">
                已选择 <span className="text-primary font-bold">{tempSelectedIds.length}</span> 项
              </div>
              <div className="flex gap-4">
                <button onClick={onClose} className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all">
                  取消
                </button>
                <button 
                  onClick={handleConfirm}
                  className="bg-primary text-primary-foreground px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98] transition-all"
                >
                  确认添加
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
