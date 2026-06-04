"use client";

import { useState, useEffect } from "react";
import { X, Tag, Truck, CheckCircle, Activity, Settings, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Category, Supplier } from "@/lib/types";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";

interface BatchEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { 
    categoryId?: string; 
    supplierId?: string; 
    isPublic?: boolean; 
    isDiscontinued?: boolean; 
    salePrice?: number;
    stock?: number;
  }) => void;
  categories: Category[];
  suppliers: Supplier[];
  selectedCount: number;
  hideProductionStatus?: boolean;
  hideShelfLifeSection?: boolean;
}

// 内部定义的表单组件，利用挂载/卸载生命周期来管理状态重置
const BatchEditForm = ({ 
  onClose, 
  onConfirm, 
  categories, 
  suppliers, 
  selectedCount,
  hideProductionStatus = false,
  hideShelfLifeSection = false,
}: Omit<BatchEditModalProps, "isOpen">) => {
  const [categoryId, setCategoryId] = useState<string>("keep");
  const [supplierId, setSupplierId] = useState<string>("keep");
  const [productionStatus, setProductionStatus] = useState<string>("keep");
  const [salePrice, setSalePrice] = useState<string>("");
  const [stock, setStock] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { 
      categoryId?: string; 
      supplierId?: string; 
      isPublic?: boolean; 
      isDiscontinued?: boolean; 
      salePrice?: number;
      stock?: number;
    } = {};
    
    if (categoryId !== "keep") data.categoryId = categoryId;
    if (supplierId !== "keep") data.supplierId = supplierId;
    if (!hideProductionStatus && productionStatus !== "keep") data.isDiscontinued = productionStatus === "discontinued";
    if (salePrice.trim() !== "") data.salePrice = parseFloat(salePrice);
    if (stock.trim() !== "") data.stock = parseInt(stock, 10);

    onConfirm(data);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 30 }}
      className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border/50 dark:border-white/10 shadow-2xl bg-white dark:bg-[#0b111e]/98 backdrop-blur-xl flex flex-col max-h-[90vh]"
    >
      {/* 霓虹发光光晕背景 */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/3 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />

      {/* 头部 Header */}
      <div className="flex items-center justify-between border-b border-border/50 dark:border-white/10 p-6 sm:p-8 shrink-0 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-foreground">批量修改商品</h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">已选中 <span className="text-primary font-bold font-mono">{selectedCount}</span> 个商品项进行联动配置</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
        >
          <X size={20} />
        </button>
      </div>

      {/* 主表单区域 - 带有自适应滚动条 */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 overscroll-contain relative z-10">
        
        {/* 卡片区块一：📦 商品基础属性设置 */}
        <div className="rounded-2xl border border-border/50 dark:border-white/5 bg-black/1 dark:bg-white/2 p-5 space-y-5">
          <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5 pb-2 border-b border-border/50 dark:border-white/5">
            <Layers size={13} className="text-primary" />
            <span>货品基本属性修改</span>
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Category Select */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                <Tag size={13} className="text-emerald-500" /> 目标分类
              </label>
              <CustomSelect
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: "keep", label: "保持原分类" },
                  ...categories.map(c => ({ value: c.id, label: c.name }))
                ]}
                triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 px-4 text-xs dark:hover:bg-white/10"
              />
            </div>

            {/* Supplier Select */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                <Truck size={13} className="text-blue-500" /> 目标供应商
              </label>
              <CustomSelect
                value={supplierId}
                onChange={setSupplierId}
                options={[
                  { value: "keep", label: "保持原供应商" },
                  ...suppliers.map(s => ({ value: s.id, label: s.name }))
                ]}
                triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 px-4 text-xs dark:hover:bg-white/10"
              />
            </div>

            {/* Production Status Select */}
            {!hideProductionStatus && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                  <Activity size={13} className="text-red-500" /> 生产状态
                </label>
                <CustomSelect
                  value={productionStatus}
                  onChange={setProductionStatus}
                  options={[
                    { value: "keep", label: "保持当前状态" },
                    { value: "active", label: "正常生产中" },
                    { value: "discontinued", label: "标记为已停产" }
                  ]}
                  triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 px-4 text-xs dark:hover:bg-white/10"
                />
              </div>
            )}

            {/* Cost Price Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                <Tag size={13} className="rotate-90 text-amber-500" /> 售价
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold font-number pointer-events-none">¥</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="保持原售价"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 pl-8 pr-4 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 focus:border-primary/20 focus:shadow-[0_0_14px_rgba(var(--primary-rgb),0.12)] transition-all font-bold font-number text-xs"
                />
              </div>
            </div>

            {/* Stock Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                <Layers size={13} className="text-violet-500" /> 批量库存
              </label>
              <input
                type="number"
                min="0"
                placeholder="保持原库存"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 px-4 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 focus:border-primary/20 focus:shadow-[0_0_14px_rgba(var(--primary-rgb),0.12)] transition-all font-bold font-number text-xs"
              />
            </div>
          </div>
        </div>

        {/* 底部动作按钮组 - 完美对齐系统的 rounded-full 药丸主按钮以及语义化配色 */}
        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-border hover:text-foreground hover:bg-secondary/50 py-3 text-xs font-bold text-muted-foreground transition-all active:scale-[0.96] active:translate-y-0 duration-200 flex items-center justify-center"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={
              categoryId === "keep" &&
              supplierId === "keep" &&
              (hideProductionStatus || productionStatus === "keep") &&
              salePrice.trim() === "" &&
              stock.trim() === ""
            }
            className="flex-2 rounded-full bg-primary text-primary-foreground py-3 text-xs font-bold shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.3)] hover:bg-primary/90 hover:shadow-[0_12px_24px_-4px_rgba(var(--primary-rgb),0.45)] hover:-translate-y-0.5 disabled:translate-y-0 active:scale-[0.95] active:translate-y-0 disabled:opacity-50 disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-1.5"
          >
            <CheckCircle size={15} />
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
  selectedCount,
  hideProductionStatus = false,
  hideShelfLifeSection = false,
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
            hideProductionStatus={hideProductionStatus}
            hideShelfLifeSection={hideShelfLifeSection}
          />
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
