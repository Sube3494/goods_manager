"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Tag, Truck, CheckCircle, Activity, FileText, Settings, Layers, CalendarClock } from "lucide-react";
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
    costPrice?: number;
    stock?: number;
    isShelfLife?: boolean;
    shelfLifeDays?: number;
  }) => void;
  categories: Category[];
  suppliers: Supplier[];
  selectedCount: number;
  hideProductionStatus?: boolean;
}

// 极其精美且带平滑过渡的 Switch 开关组件 (完全对齐系统原生翠绿高亮)
const Switch = ({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) => {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // 阻止冒泡以防触发外层容器的点击事件
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none active:scale-95",
        checked ? "bg-emerald-500" : "bg-black/20 dark:bg-white/10"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
};

// 内部定义的表单组件，利用挂载/卸载生命周期来管理状态重置
const BatchEditForm = ({ 
  onClose, 
  onConfirm, 
  categories, 
  suppliers, 
  selectedCount,
  hideProductionStatus = false,
}: Omit<BatchEditModalProps, "isOpen">) => {
  const [categoryId, setCategoryId] = useState<string>("keep");
  const [supplierId, setSupplierId] = useState<string>("keep");
  const [productionStatus, setProductionStatus] = useState<string>("keep");
  const [costPrice, setCostPrice] = useState<string>("");
  const [stock, setStock] = useState<string>("");
  
  // 🔘 极简保质期批量开关状态（关 = 保持原样 / 开 = 批量统一设置）
  const [isShelfLifeActive, setIsShelfLifeActive] = useState<boolean>(false);
  const [displayShelfLifeVal, setDisplayShelfLifeVal] = useState<string>("");
  const [shelfLifeUnit, setShelfLifeUnit] = useState<"day" | "month" | "year">("day");

  const calculatedDays = useMemo(() => {
    if (!displayShelfLifeVal || isNaN(Number(displayShelfLifeVal))) return 0;
    const val = Number(displayShelfLifeVal);
    if (shelfLifeUnit === "day") return val;
    if (shelfLifeUnit === "month") return val * 30;
    return val * 365;
  }, [displayShelfLifeVal, shelfLifeUnit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: { 
      categoryId?: string; 
      supplierId?: string; 
      isPublic?: boolean; 
      isDiscontinued?: boolean; 
      costPrice?: number;
      stock?: number;
      isShelfLife?: boolean;
      shelfLifeDays?: number;
    } = {};
    
    if (categoryId !== "keep") data.categoryId = categoryId;
    if (supplierId !== "keep") data.supplierId = supplierId;
    if (!hideProductionStatus && productionStatus !== "keep") data.isDiscontinued = productionStatus === "discontinued";
    if (costPrice.trim() !== "") data.costPrice = parseFloat(costPrice);
    if (stock.trim() !== "") data.stock = parseInt(stock, 10);
    
    // 如果老板拨开了批量配置保质期开关
    if (isShelfLifeActive) {
      data.isShelfLife = true;
      if (calculatedDays > 0) {
        data.shelfLifeDays = calculatedDays;
      }
    }

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
                <Tag size={13} className="rotate-90 text-amber-500" /> 进货单价
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold font-number pointer-events-none">¥</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="保持原单价"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
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

        {/* 卡片区块二：⏰ 门店保质期智能配置 */}
        <div className="rounded-2xl border border-primary/10 bg-black/1 dark:bg-white/2 p-5 space-y-5 relative">
          {/* 小脉冲呼吸灯，表示这是核心新功能 */}
          <div className="absolute top-5 right-5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </div>

          <h4 className="text-xs font-black uppercase tracking-wider text-primary/80 flex items-center gap-1.5 pb-2 border-b border-primary/10">
            <CalendarClock size={13} className="text-primary animate-pulse" />
            <span>批次保质期智能设置</span>
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
            {/* 🔘 极简保质期批量联动开关 (100%对齐原生翠绿色彩与全圆角药丸) */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                <Activity size={13} className="text-emerald-500" /> 批量设置保质期
              </label>
              
              <div 
                onClick={() => setIsShelfLifeActive(!isShelfLifeActive)}
                className={cn(
                  "w-full rounded-full border px-4 py-3 flex items-center justify-between transition-all duration-300 h-11 cursor-pointer select-none",
                  isShelfLifeActive 
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500 dark:bg-emerald-500/5 dark:border-emerald-500/20 dark:text-emerald-400" 
                    : "bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <span className={cn(
                  "text-xs font-bold transition-all",
                  isShelfLifeActive ? "text-emerald-500 dark:text-emerald-400 font-extrabold" : "text-muted-foreground/60"
                )}>
                  {isShelfLifeActive ? "批量统一设置保质期" : "保持商品原有保质期不变"}
                </span>
                
                <Switch 
                  checked={isShelfLifeActive} 
                  onChange={(val) => setIsShelfLifeActive(val)} 
                />
              </div>
            </div>

            {/* 保质期时长：始终固定展示，通过状态变亮/置灰，绝无多余动画 */}
            <div className="space-y-2">
              <label className={cn(
                "text-xs font-bold flex items-center gap-1.5 px-1 uppercase tracking-wider transition-colors duration-200",
                isShelfLifeActive ? "text-muted-foreground/80" : "text-muted-foreground/40"
              )}>
                <FileText size={13} className={cn("transition-colors", isShelfLifeActive ? "text-primary animate-pulse" : "opacity-40")} /> 
                保质期时长 {isShelfLifeActive && <span className="text-red-500">*</span>}
              </label>
              
              <div className={cn(
                "transition-all duration-200",
                isShelfLifeActive ? "opacity-100 pointer-events-auto" : "opacity-35 pointer-events-none"
              )}>
                <div className="flex items-center w-full h-11 rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/20 focus-within:shadow-[0_0_14px_rgba(var(--primary-rgb),0.12)] hover:bg-black/5 dark:hover:bg-white/5 transition-all overflow-hidden">
                  <input
                    required={isShelfLifeActive}
                    disabled={!isShelfLifeActive}
                    type="number"
                    min="1"
                    placeholder={!isShelfLifeActive ? "保持商品原有保质期天数不变" : shelfLifeUnit === "day" ? "例如：30" : shelfLifeUnit === "month" ? "例如：9" : "例如：2"}
                    value={isShelfLifeActive ? displayShelfLifeVal : ""}
                    onChange={(e) => setDisplayShelfLifeVal(e.target.value)}
                    className="flex-1 h-full bg-transparent border-0 outline-none ring-0 focus:ring-0 focus:outline-none px-4 text-foreground font-mono text-sm placeholder:font-sans placeholder:text-[10px]"
                  />
                  <div className="h-5 w-px bg-border dark:bg-white/10 shrink-0" />
                  <CustomSelect
                    value={shelfLifeUnit}
                    onChange={(val) => setShelfLifeUnit(val as "day" | "month" | "year")}
                    options={[
                      { value: "day", label: "天" },
                      { value: "month", label: "月" },
                      { value: "year", label: "年" }
                    ]}
                    placeholder="单位"
                    className="w-[80px] shrink-0 h-full"
                    triggerClassName="!bg-transparent !border-0 hover:!bg-transparent dark:hover:!bg-transparent focus:!ring-0 px-3 text-xs font-bold text-foreground h-full flex items-center justify-between cursor-pointer rounded-r-full !shadow-none"
                  />
                </div>
                {isShelfLifeActive && calculatedDays > 0 && shelfLifeUnit !== "day" && (
                  <p className="text-[10px] text-muted-foreground/80 font-bold flex items-center gap-1 pl-2 pt-1">
                    💡 批量折合天数：<span className="text-primary font-mono">{calculatedDays}</span> 天
                  </p>
                )}
              </div>
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
              costPrice.trim() === "" &&
              stock.trim() === "" &&
              !isShelfLifeActive
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
          />
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
