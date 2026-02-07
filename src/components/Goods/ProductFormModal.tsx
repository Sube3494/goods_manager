"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Image as ImageIcon, DollarSign, Tag, Truck, FileText, Camera, ExternalLink } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { INITIAL_SUPPLIERS } from "@/lib/mockData";

import { Product } from "@/lib/types";

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Product, "id"> & { id?: string }) => void;
  initialData?: Product | null;
}

import { createPortal } from "react-dom";
// ... imports

export function ProductFormModal({ isOpen, onClose, onSubmit, initialData }: ProductFormModalProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    category: initialData?.category || "",
    price: initialData?.price?.toString() || "",
    stock: initialData?.stock?.toString() || "",
    image: initialData?.image || "",
    supplierId: initialData?.supplierId || "",
    sku: initialData?.sku || ""
  });
  
  // In a real app, this would be fetched or passed as a prop. 
  // For now, we use the mock data directly.
  const suppliers = INITIAL_SUPPLIERS;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
        ...formData,
        price: Number(formData.price),
        stock: Number(formData.stock),
        id: initialData?.id
    } as Omit<Product, "id"> & { id?: string });
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
            className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-border p-8 bg-muted/30 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">{initialData ? "编辑商品" : "新增商品"}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* SKU */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText size={16} /> 商品编号 (SKU)
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.sku}
                            onChange={(e) => setFormData({...formData, sku: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                            placeholder="例如：SKU-001"
                        />
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Package size={16} /> 商品名称
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="例如：高级皮质手袋"
                        />
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Tag size={16} /> 分类
                        </label>
                        <CustomSelect 
                            value={formData.category}
                            onChange={(value) => setFormData({...formData, category: value})}
                            options={[
                                { value: "Accessories", label: "配饰 (Accessories)" },
                                { value: "Electronics", label: "电子产品 (Electronics)" },
                                { value: "Home Decor", label: "家居 (Home Decor)" },
                                { value: "Clothing", label: "服装 (Clothing)" }
                            ]}
                            placeholder="选择分类"
                        />
                    </div>

                    {/* Supplier */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Truck size={16} /> 供应商
                        </label>
                        <CustomSelect 
                            value={formData.supplierId || ""}
                            onChange={(value) => setFormData({...formData, supplierId: value})}
                            options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="选择供应商"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Price */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <DollarSign size={16} /> 价格
                            </label>
                            <input 
                                required
                                type="number" 
                                min="0" step="0.01"
                                value={formData.price}
                                onChange={(e) => setFormData({...formData, price: e.target.value})}
                                className="w-full rounded-xl bg-secondary/50 border-transparent px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="0.00"
                            />
                        </div>

                        {/* Stock */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <ArchiveBoxIcon /> 库存数量
                            </label>
                            <input 
                                required
                                type="number" 
                                min="0"
                                value={formData.stock}
                                onChange={(e) => setFormData({...formData, stock: e.target.value})}
                                className="w-full rounded-xl bg-secondary/50 border-transparent px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* Image URL (Simple for now) */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <ImageIcon size={16} /> 图片链接
                            </label>
                            {initialData?.id && (
                                <a 
                                    href={`/gallery?productId=${initialData.id}`}
                                    className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline"
                                >
                                    <Camera size={12} /> 查看实物相册 <ExternalLink size={10} />
                                </a>
                            )}
                        </div>
                        <input 
                            type="url" 
                            value={formData.image}
                            onChange={(e) => setFormData({...formData, image: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-4 border-t border-border p-8 bg-muted/30 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
                    >
                        <CheckCircle size={18} />
                        保存商品
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

function ArchiveBoxIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="20" height="5" x="2" y="3" rx="1" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </svg>
    )
  }
