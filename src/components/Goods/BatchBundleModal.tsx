"use client";

import { useState, useEffect, useRef } from "react";
import { X, Boxes, Search, Plus, Minus, Trash2, CheckCircle, Package, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface BundleSubItem {
  id: string;
  name: string;
  sku?: string | null;
  image?: string | null;
  quantity: number;
  shopProductId?: string;
  productId?: string;
}

interface BatchBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { isBundle: boolean; bundleItems: BundleSubItem[] }) => Promise<void> | void;
  selectedCount: number;
  shopId?: string;
  libraryId?: string;
}

const BatchBundleForm = ({
  onClose,
  onConfirm,
  selectedCount,
  shopId,
  libraryId,
}: Omit<BatchBundleModalProps, "isOpen">) => {
  const [actionType, setActionType] = useState<"configure" | "clear">("configure");
  const [bundleItems, setBundleItems] = useState<BundleSubItem[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchVersionRef = useRef(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 搜索配件候选列表（支持主库及店铺商品聚合搜索）
  const handleSearchCandidates = (query: string, immediate: boolean = false) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const execute = async () => {
      const version = ++searchVersionRef.current;
      setIsLoadingCandidates(true);
      const trimmed = query.trim();

      try {
        const libraryQuery = libraryId ? `&libraryId=${encodeURIComponent(libraryId)}` : "";
        const productUrl = `/api/products?search=${encodeURIComponent(trimmed)}&includePublic=true&includeShopOnly=true&pageSize=30${libraryQuery}`;
        const shopProductUrl = shopId
          ? `/api/shop-products?shopId=${shopId}&search=${encodeURIComponent(trimmed)}&pageSize=30`
          : null;

        const [pRes, spRes] = await Promise.all([
          fetch(productUrl),
          shopProductUrl ? fetch(shopProductUrl) : Promise.resolve(null),
        ]);

        if (version !== searchVersionRef.current) return;

        const pData = await pRes.json().catch(() => ({}));
        const spData = spRes ? await spRes.json().catch(() => ({})) : null;

        const pItems = Array.isArray(pData.items) ? pData.items : [];
        const spItems = spData && Array.isArray(spData.items) ? spData.items : [];

        // 合并去重：店铺已有商品优先，主库公共物料全面补充
        const seen = new Set<string>();
        const merged: any[] = [];

        for (const item of spItems) {
          const key = item.productId || item.id;
          seen.add(key);
          merged.push({
            ...item,
            id: item.id,
            shopProductId: item.id,
            productId: item.productId || item.id,
            name: item.productName || item.name,
            image: item.productImage || item.image,
            sku: item.sku || null,
          });
        }

        for (const item of pItems) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push({
              ...item,
              id: item.id,
              productId: item.id,
              name: item.name,
              image: item.image,
              sku: item.sku || null,
            });
          }
        }

        setCandidates(merged);
      } catch {
        if (version === searchVersionRef.current) {
          setCandidates([]);
        }
      } finally {
        if (version === searchVersionRef.current) {
          setIsLoadingCandidates(false);
        }
      }
    };

    if (immediate) {
      execute();
    } else {
      searchTimeoutRef.current = setTimeout(execute, 200);
    }
  };

  const handleAddCandidate = (candidate: any) => {
    const candidateId = candidate.id;
    if (bundleItems.some((item) => item.id === candidateId || (item.shopProductId && item.shopProductId === candidateId))) {
      return;
    }
    const newItem: BundleSubItem = {
      id: candidateId,
      name: candidate.name || candidate.productName || "未命名商品",
      sku: candidate.sku || null,
      image: candidate.image || candidate.productImage || null,
      quantity: 1,
      shopProductId: shopId ? candidate.id : undefined,
      productId: candidate.productId || candidate.id,
    };
    setBundleItems((prev) => [...prev, newItem]);
  };

  const handleUpdateQty = (index: number, qty: number) => {
    const safeQty = Math.max(1, Math.floor(qty) || 1);
    setBundleItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, quantity: safeQty } : item))
    );
  };

  const handleRemoveItem = (index: number) => {
    setBundleItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      if (actionType === "clear") {
        await onConfirm({ isBundle: false, bundleItems: [] });
      } else {
        await onConfirm({ isBundle: true, bundleItems });
      }
      onClose();
    } catch (error) {
      console.error("Batch bundle action failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 15 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-card border border-border/80 shadow-2xl overflow-hidden z-60000"
    >
      {/* 头部标题区 */}
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 shrink-0 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
            <Boxes size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              批量配置配件清单 (BOM)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              已选中 <strong className="text-emerald-500 font-number">{selectedCount}</strong> 件商品进行组合发货配置
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-all cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      {/* 表单内容区 */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {/* 模式选择：配置配件 vs 清空组合 */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-2xl border border-border/60">
            <button
              type="button"
              onClick={() => setActionType("configure")}
              className={cn(
                "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                actionType === "configure"
                  ? "bg-card text-emerald-500 shadow-sm border border-emerald-500/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Boxes size={15} /> 批量统一配置配件
            </button>
            <button
              type="button"
              onClick={() => setActionType("clear")}
              className={cn(
                "py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                actionType === "clear"
                  ? "bg-rose-500/10 text-rose-500 shadow-sm border border-rose-500/20"
                  : "text-muted-foreground hover:text-rose-500/80"
              )}
            >
              <Trash2 size={15} /> 批量清空/取消组合
            </button>
          </div>

          {actionType === "clear" ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-center space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <AlertCircle size={22} />
              </div>
              <h3 className="text-sm font-bold text-foreground">确认清空组合商品配置？</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                确认后，选中的 <strong className="text-foreground">{selectedCount}</strong> 件商品将全部恢复为【普通单品】，发货与出库时不再自动关联扣减子配件。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 配件提示卡 */}
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-2">
                <Boxes size={16} className="shrink-0 mt-0.5" />
                <span>
                  统一为所选商品配置随单赠送或打包的配件（如礼盒、煤油、火石等）。发货时系统将自动按设定的配比扣减子配件批次库存。
                </span>
              </div>

              {/* 已选子配件列表 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground px-1">
                  <span>配件清单 ({bundleItems.length})</span>
                  <span>每件配比数量</span>
                </div>

                {bundleItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 dark:border-white/10 py-7 text-center text-xs text-muted-foreground space-y-1">
                    <Package size={24} className="mx-auto text-muted-foreground/50 mb-1" />
                    <div>暂未添加配件</div>
                    <div className="text-[11px] opacity-70">点击下方按钮搜索并添加物料</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bundleItems.map((item, index) => (
                      <div
                        key={item.id + "-" + index}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-border/70 dark:border-white/10 bg-muted/20 hover:bg-muted/30 transition-all p-2 sm:p-2.5"
                      >
                        {/* 左侧商品图与名称 */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="h-9 w-9 shrink-0 rounded-lg object-cover border border-border/60 shadow-2xs"
                            />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Package size={16} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-foreground truncate" title={item.name}>
                              {item.name}
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                              SKU: {item.sku || "无编码"}
                            </div>
                          </div>
                        </div>

                        {/* 右侧紧凑步进器与删除按钮 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="inline-flex items-center rounded-lg border border-border/80 bg-background dark:border-white/10 p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(index, item.quantity - 1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground active:scale-90 transition-all cursor-pointer"
                              title="减少"
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleUpdateQty(index, parseInt(e.target.value, 10) || 1)}
                              className="h-6 w-8 text-center text-xs font-bold text-foreground outline-none bg-transparent"
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(index, item.quantity + 1)}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground active:scale-90 transition-all cursor-pointer"
                              title="增加"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="p-1.5 text-muted-foreground hover:text-rose-500 rounded-lg transition-colors hover:bg-rose-500/10 active:scale-90 cursor-pointer"
                            title="移除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 添加配件入口与搜索浮窗 */}
              {!isPickerOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsPickerOpen(true);
                    handleSearchCandidates(searchText);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border dark:border-white/10 bg-muted/10 hover:bg-muted/30 py-2.5 text-xs font-medium text-foreground/80 hover:text-foreground transition-all cursor-pointer"
                >
                  <Plus size={15} /> 添加子配件 / 礼盒 / 物料
                </button>
              ) : (
                <div className="rounded-2xl border border-border/80 dark:border-white/10 bg-muted/30 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Search size={14} className="text-emerald-500" /> 搜索并添加子配件
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPickerOpen(false)}
                      className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      收起
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => {
                        setSearchText(e.target.value);
                        handleSearchCandidates(e.target.value);
                      }}
                      placeholder="输入商品名或 SKU 搜索（如：礼盒、煤油、火石、皮套）"
                      className="w-full h-8.5 rounded-xl border border-border bg-card px-3 text-xs outline-none focus:ring-1 focus:ring-emerald-500/30 dark:border-white/10"
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {isLoadingCandidates ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">搜索中...</div>
                    ) : candidates.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">未找到相关商品</div>
                    ) : (
                      candidates.map((candidate) => {
                        const isAdded = bundleItems.some(
                          (item) => item.id === candidate.id || (item.shopProductId && item.shopProductId === candidate.id)
                        );
                        return (
                          <div
                            key={candidate.id}
                            className={cn(
                              "flex items-center justify-between gap-2.5 rounded-xl p-2 transition-all border",
                              isAdded
                                ? "bg-muted/50 border-transparent opacity-60 pointer-events-none"
                                : "bg-card border-border/50 hover:border-emerald-500/30 hover:bg-muted/30 cursor-pointer"
                            )}
                            onClick={() => !isAdded && handleAddCandidate(candidate)}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {candidate.image || candidate.productImage ? (
                                <img
                                  src={candidate.image || candidate.productImage}
                                  alt=""
                                  className="h-7 w-7 rounded-md object-cover border border-border/60 shrink-0"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-md bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                                  <Package size={14} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-foreground truncate">
                                  {candidate.name || candidate.productName}
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground truncate">
                                  SKU: {candidate.sku || "无编码"}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isAdded}
                              className={cn(
                                "h-6 px-2.5 rounded-lg text-[11px] font-medium transition-all shrink-0 cursor-pointer",
                                isAdded
                                  ? "bg-transparent text-muted-foreground"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white"
                              )}
                            >
                              {isAdded ? "已添加" : "添加"}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-border/60 bg-muted/10 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-full border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (actionType === "configure" && bundleItems.length === 0)}
            className={cn(
              "px-5 py-2.5 rounded-full text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-md cursor-pointer",
              actionType === "clear"
                ? "bg-rose-500 hover:bg-rose-600 disabled:opacity-50"
                : "bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
            )}
          >
            <CheckCircle size={15} />
            {isSubmitting ? "正在应用..." : actionType === "clear" ? "确认清空组合配置" : "确认批量应用配件"}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export const BatchBundleModal = ({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
  shopId,
  libraryId,
}: BatchBundleModalProps) => {
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (typeof document === "undefined") return null;

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
          <BatchBundleForm
            onClose={onClose}
            onConfirm={onConfirm}
            selectedCount={selectedCount}
            shopId={shopId}
            libraryId={libraryId}
          />
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
