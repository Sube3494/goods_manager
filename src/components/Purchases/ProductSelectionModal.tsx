"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Check, Package, Tag, Truck } from "lucide-react";
import { Product, Supplier } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";


import { getCategoryName } from "@/lib/utils";
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
  singleSelect?: boolean;
  showPrice?: boolean;
}

export function ProductSelectionModal({ isOpen, onClose, onSelect, selectedIds, singleSelect = false, showPrice = true }: ProductSelectionModalProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // 1. Sync selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelectedIds(selectedIds);
      setSearchQuery("");
      setSelectedSupplierId("");
    }
  }, [isOpen, selectedIds]);

  // 2. Data fetching when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [pRes, sRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/suppliers")
        ]);
        if (pRes.ok && sRes.ok) {
          const [pData, sData] = await Promise.all([pRes.json(), sRes.json()]);
          setProducts(pData);
          setSuppliers(sData);
        }
      } catch (error) {
        console.error("Failed to fetch products or suppliers:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [isOpen]); // Only depends on isOpen

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    const matchesSupplier = !selectedSupplierId || p.supplierId === selectedSupplierId;
    return matchesSearch && matchesSupplier;
  });

  const toggleProduct = (id: string) => {
    if (singleSelect) {
        setTempSelectedIds([id]);
    } else {
        setTempSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }
  };

  const handleConfirm = () => {
    const selectedProducts = products.filter(p => tempSelectedIds.includes(p.id));
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
            className="fixed left-1/2 top-1/2 z-10001 w-[calc(100%-2rem)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-foreground">选择商品</h2>
                <p className="text-xs text-muted-foreground mt-1">
                    {singleSelect ? "请选择一个关联商品" : "勾选您需要采购的商品"}
                </p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-8 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 shrink-0">
                <div className="relative flex-1 group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="搜索商品名称或编号..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-11 pr-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 focus:border-primary/20 transition-all dark:hover:bg-white/10 text-sm"
                  />
                </div>

                <div className="w-full sm:w-56 shrink-0">
                  <CustomSelect
                    options={[
                      { value: "", label: "全部供应商" },
                      ...suppliers.map(s => ({ value: s.id, label: s.name }))
                    ]}
                    value={selectedSupplierId}
                    onChange={setSelectedSupplierId}
                    placeholder="按供应商筛选"
                    triggerClassName="h-11 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-0">
                 {isLoading ? (
                    <div className="py-12 text-center text-muted-foreground animate-pulse">
                        加载中...
                    </div>
                 ) : (
                    <>
                    {filteredProducts.map(product => {
                      const isSelected = tempSelectedIds.includes(product.id);
                      return (
                        <div 
                          key={product.id}
                          onClick={() => toggleProduct(product.id)}
                          className={cn(
                            "group relative flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer",
                            isSelected ? "bg-primary/5 border-primary/30" : "bg-card border-border/50 hover:border-primary/20 hover:bg-muted/30"
                          )}
                        >
                          {/* Circular Checkbox/Radio Top-Right */}
                          <div className={cn(
                            "absolute top-2 right-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all z-10",
                            isSelected ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20" : "bg-background border-border"
                          )}>
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </div>

                          <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50 relative">
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
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-secondary/80 px-1.5 py-0.5 rounded text-muted-foreground font-mono shrink-0">
                                  {product.sku ? product.sku : `REF__${product.id.slice(0, 6)}`}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate opacity-70">
                                    <Tag size={12} className="shrink-0" /> {getCategoryName(product.category)}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate opacity-70">
                                    <Truck size={12} className="shrink-0" /> {suppliers.find(s => s.id === product.supplierId)?.name || "未知供应商"}
                                </span>
                            </div>
                            {showPrice && (
                                <div className="mt-1">
                                <span className="text-xs font-bold text-primary">
                                    ￥{product.price}
                                </span>
                                </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {filteredProducts.length === 0 && (
                        <div className="py-12 text-center text-muted-foreground">
                            未找到相关商品
                        </div>
                    )}
                    </>
                 )}
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 p-8 shrink-0">
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
