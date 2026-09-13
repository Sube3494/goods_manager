"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  X,
  ArrowRightLeft,
  Store,
  Package,
  AlertCircle,
  Clock,
  History,
  CheckCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Info,
  Search,
  Check,
  PlusCircle,
  Layers,
  SlidersHorizontal,
  ArrowLeft,
  Coins,
  Minus,
  Plus,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export interface TransferItem {
  id: string; // shopProductId
  name: string;
  sku?: string | null;
  image?: string | null;
  stock: number;
  shopId: string;
  shopName: string;
  productId?: string | null;
  costPrice?: number;
}

interface TransferRecordItem {
  id: string;
  productName: string;
  sku?: string | null;
  quantity: number;
  shippingFee?: number | null;
  sourceCostPrice?: number | null;
  targetCostPrice?: number | null;
  remark?: string | null;
  createdAt: string;
  sourceShop?: { id: string; name: string };
  targetShop?: { id: string; name: string };
  user?: { id: string; name?: string; email: string };
}

export interface TargetProductOption {
  id: string; // shopProductId
  name: string;
  sku?: string | null;
  stock: number;
  image?: string | null;
  productId?: string | null;
  costPrice?: number;
}

interface TransferStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TransferItem | null;
  shops: Array<{ id: string; name: string }>;
  onSuccess?: (result: {
    shopProductId: string;
    sourceStock: number;
    quantity: number;
    targetShopName: string;
  }) => void;
}

function resolveImageUrl(url?: string | null): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("/api/uploads/")) return trimmed;
  if (trimmed.startsWith("api/uploads/")) return `/${trimmed}`;
  let clean = trimmed;
  if (clean.startsWith("/uploads/")) clean = clean.substring(9);
  else if (clean.startsWith("uploads/")) clean = clean.substring(8);
  else if (clean.startsWith("/")) clean = clean.substring(1);
  return `/api/uploads/${clean}`;
}

export function TransferStockModal({
  isOpen,
  onClose,
  item,
  shops,
  onSuccess,
}: TransferStockModalProps) {
  const { showToast } = useToast();

  // 页面滚动锁
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  // 目标店铺与接收商品状态
  const [targetShopId, setTargetShopId] = useState("");
  const [targetProduct, setTargetProduct] = useState<TargetProductOption | null>(null);
  const [isMatchingTarget, setIsMatchingTarget] = useState(false);
  const [isPickerMode, setIsPickerMode] = useState(false);

  // 目标店铺商品搜索
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(productSearchQuery, 300);
  const [searchedProducts, setSearchedProducts] = useState<TargetProductOption[]>([]);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);

  // 调拨数量
  const [quantity, setQuantity] = useState<string>("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 成本与运费核算状态
  const [shippingFee, setShippingFee] = useState<string>("");

  // 历史流水查看
  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TransferRecordItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 候选目标店铺（排除源店铺）
  const candidateShops = useMemo(() => {
    if (!item?.shopId) return [];
    return shops.filter((s) => s.id !== item.shopId);
  }, [shops, item?.shopId]);

  // 每次打开弹窗初始化状态
  useEffect(() => {
    if (isOpen && item) {
      if (candidateShops.length > 0) {
        setTargetShopId(candidateShops[0].id);
      } else {
        setTargetShopId("");
      }
      setTargetProduct(null);
      setIsPickerMode(false);
      setProductSearchQuery("");
      setQuantity(item.stock > 0 ? "1" : "0");
      setShippingFee("");
      setShowHistory(false);
      setHistoryRecords([]);
    }
  }, [isOpen, item, candidateShops]);

  // 自动对齐匹配目标店铺的商品
  useEffect(() => {
    if (!isOpen || !item || !targetShopId) return;

    let isCancelled = false;
    const matchTargetProduct = async () => {
      setIsMatchingTarget(true);
      try {
        const keyword = item.name.trim().slice(0, 15);
        const res = await fetch(
          `/api/shops/${targetShopId}/products?search=${encodeURIComponent(keyword)}&pageSize=30`
        );
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const candidateItems: Array<any> = Array.isArray(data?.items) ? data.items : [];

        if (isCancelled) return;

        let matched = null;
        if (item.productId) {
          matched = candidateItems.find((p) => p.productId === item.productId);
        }
        if (!matched && item.sku) {
          matched = candidateItems.find((p) => p.sku === item.sku);
        }
        if (!matched) {
          matched = candidateItems.find(
            (p) => (p.name || p.productName || "").trim() === item.name.trim()
          );
        }

        if (matched) {
          setTargetProduct({
            id: matched.id,
            name: matched.name || matched.productName || "未命名商品",
            sku: matched.sku,
            stock: Number(matched.stock) || 0,
            image: matched.image || matched.productImage,
            productId: matched.productId,
            costPrice: matched.costPrice,
          });
        } else {
          setTargetProduct(null);
        }
      } catch (err) {
        console.error("智能匹配目标店铺商品失败:", err);
      } finally {
        if (!isCancelled) {
          setIsMatchingTarget(false);
        }
      }
    };

    void matchTargetProduct();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, item, targetShopId]);

  // 检索目标店铺全部商品
  useEffect(() => {
    if (!isOpen || !targetShopId || !isPickerMode) return;

    let isCancelled = false;
    const searchTargetProducts = async () => {
      setIsSearchingProducts(true);
      try {
        const query = debouncedSearchQuery.trim();
        const res = await fetch(
          `/api/shops/${targetShopId}/products?search=${encodeURIComponent(query)}&pageSize=50`
        );
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const list: Array<any> = Array.isArray(data?.items) ? data.items : [];

        if (isCancelled) return;

        setSearchedProducts(
          list.map((p) => ({
            id: p.id,
            name: p.name || p.productName || "未命名商品",
            sku: p.sku,
            stock: Number(p.stock) || 0,
            image: p.image || p.productImage,
            productId: p.productId,
            costPrice: p.costPrice,
          }))
        );
      } catch (err) {
        console.error("搜索目标店铺商品异常:", err);
      } finally {
        if (!isCancelled) {
          setIsSearchingProducts(false);
        }
      }
    };

    void searchTargetProducts();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, targetShopId, isPickerMode, debouncedSearchQuery]);

  // 加载该商品调拨历史
  const fetchHistory = useCallback(async () => {
    if (!item?.shopId || !item?.id) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/shops/${item.shopId}/transfer?shopProductId=${item.id}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(data.records || []);
      }
    } catch (e) {
      console.error("加载调拨记录异常:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [item?.shopId, item?.id]);

  useEffect(() => {
    if (isOpen && showHistory) {
      void fetchHistory();
    }
  }, [isOpen, showHistory, fetchHistory]);

  const maxStock = item?.stock ?? 0;
  const numQuantity = Number(quantity) || 0;
  const isQuantityValid = numQuantity > 0 && numQuantity <= maxStock;

  // 成本与运费计算（总运费与单件分摊）
  const sourceCost = Number(item?.costPrice) || 0;
  const numShippingFee = Math.max(0, Number(shippingFee) || 0); // 本次调拨整单总运费
  const unitShippingFee = numQuantity > 0 ? numShippingFee / numQuantity : 0; // 单件分摊运费
  // 单件自动核算到岸采购成本（原进价 + 单件分摊运费）
  const inboundUnitCost = Math.round((sourceCost + unitShippingFee) * 100) / 100;
  // 调拨整单总货值（含运费）
  const totalInboundAmount = Math.round((sourceCost * numQuantity + numShippingFee) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    if (!targetShopId) {
      showToast("请选择接收商品的目标店铺", "error");
      return;
    }

    if (maxStock <= 0) {
      showToast("当前商品可用库存为 0，无法调拨", "error");
      return;
    }

    if (!isQuantityValid) {
      showToast(`调拨数量须介于 1 到 ${maxStock} 件之间`, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/shops/${item.shopId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopProductId: item.id,
          targetShopId,
          targetShopProductId: targetProduct ? targetProduct.id : undefined,
          quantity: numQuantity,
          shippingFee: numShippingFee,
          targetCostPrice: inboundUnitCost,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "调拨处理失败");
      }

      showToast(data?.message || "库存调拨成功", "success");

      const targetShop = shops.find((s) => s.id === targetShopId);
      if (onSuccess) {
        onSuccess({
          shopProductId: item.id,
          sourceStock: data?.data?.sourceStock ?? maxStock - numQuantity,
          quantity: numQuantity,
          targetShopName: targetShop?.name || "目标店铺",
        });
      }

      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "调拨失败";
      showToast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (typeof window === "undefined" || !isOpen || !item) return null;

  const selectedTargetShop = shops.find((s) => s.id === targetShopId);
  const imageUrl = resolveImageUrl(item.image);

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-60000 flex items-center justify-center p-3 sm:p-6">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 弹窗主体 - 采用系统标准 rounded-3xl 磨砂与边缘光晕 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 25 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 25 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border/50 dark:border-white/10 shadow-2xl bg-white dark:bg-[#0b111e]/98 backdrop-blur-xl flex flex-col max-h-[90vh] z-10"
        >
          {/* 霓虹发光光晕背景 */}
          <div className="absolute top-0 right-0 w-52 h-52 bg-primary/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none" />

          {/* 头部 Header */}
          <div className="flex items-center justify-between border-b border-border/50 dark:border-white/10 px-4 py-3 sm:px-6 sm:py-4 shrink-0 relative z-10 gap-2">
            {isPickerMode ? (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setIsPickerMode(false)}
                  className="h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-all active:scale-95 shrink-0"
                  title="返回调拨表单"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-foreground truncate">选择接收商品</h3>
                  <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                    对应到【{selectedTargetShop?.name}】中的商品条目
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <ArrowRightLeft size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-foreground whitespace-nowrap">跨门店调拨</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary truncate max-w-[130px] sm:max-w-none">
                      {item.shopName}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                    将货品按需调配至其他门店
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {isPickerMode ? (
                <button
                  type="button"
                  onClick={() => setIsPickerMode(false)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1 shadow-xs whitespace-nowrap"
                >
                  <ArrowLeft size={13} />
                  <span>返回</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowHistory(!showHistory);
                    setIsPickerMode(false);
                  }}
                  className={cn(
                    "rounded-full px-2.5 sm:px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition-all border whitespace-nowrap",
                    showHistory
                      ? "bg-primary/10 border-primary/30 text-primary shadow-xs"
                      : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                  )}
                  title="查看调拨历史"
                >
                  <History size={13} />
                  <span>{showHistory ? "返回" : "流水明细"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors active:scale-95"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* 弹窗内容主体 */}
          {showHistory ? (
            /* 调拨历史明细视图 */
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 overscroll-contain relative z-10">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                  <Clock size={13} className="text-primary" />
                  <span>最近调拨记录</span>
                </span>
                <span className="text-xs text-muted-foreground font-mono">共 {historyRecords.length} 笔记录</span>
              </div>

              {isLoadingHistory ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <span className="text-xs font-medium">正在拉取调拨流水...</span>
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground rounded-2xl border border-dashed border-border/60 p-6">
                  <Clock size={32} className="opacity-30 mb-2" />
                  <p className="text-sm font-semibold text-foreground">暂无该商品的调拨记录</p>
                  <p className="text-xs text-muted-foreground mt-1">调拨成功后，系统会自动在此生成可溯源的流水明细</p>
                </div>
              ) : (
                historyRecords.map((rec) => {
                  const isOut = rec.sourceShop?.id === item.shopId;
                  return (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-2xl border border-border/50 dark:border-white/5 bg-black/2 dark:bg-white/3 hover:bg-black/4 dark:hover:bg-white/5 transition-colors text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold",
                              isOut
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {isOut ? "调出" : "调入"}
                          </span>
                          <span className="text-foreground">
                            {rec.sourceShop?.name || "未知"} → {rec.targetShop?.name || "未知"}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-sm text-primary">
                          {rec.quantity} 件
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-medium truncate">
                        流转商品：{rec.productName}
                      </div>
                      {/* 调拨运费与成本入库核算流水 */}
                      {((rec.shippingFee !== undefined && rec.shippingFee !== null && rec.shippingFee > 0) || (rec.targetCostPrice !== undefined && rec.targetCostPrice !== null)) && (
                        <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                          {rec.shippingFee !== undefined && rec.shippingFee !== null && rec.shippingFee > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold font-mono">
                              整单运费: ¥{rec.shippingFee}
                              {rec.quantity > 1 && (
                                <span className="opacity-80 font-normal ml-1">
                                  (均摊 ¥{(rec.shippingFee / rec.quantity).toFixed(2)}/件)
                                </span>
                              )}
                            </span>
                          )}
                          {rec.targetCostPrice !== undefined && rec.targetCostPrice !== null && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold font-mono">
                              到岸采购价: ¥{rec.targetCostPrice}/件
                              {rec.sourceCostPrice !== undefined && rec.sourceCostPrice !== null && (
                                <span className="text-muted-foreground font-normal ml-1">
                                  (原进价 ¥{rec.sourceCostPrice}{rec.shippingFee ? ` + 均摊运费 ¥${(rec.shippingFee / rec.quantity).toFixed(2)}` : ""})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-muted-foreground text-[11px] pt-0.5">
                        <span>{new Date(rec.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        {rec.user?.name && <span>经办人: {rec.user.name}</span>}
                      </div>
                      {rec.remark && (
                        <p className="text-[11px] text-muted-foreground bg-black/5 dark:bg-white/5 rounded-xl px-2.5 py-1 mt-1">
                          备注: {rec.remark}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : isPickerMode ? (
            /* 检索并更换目标商品视图 */
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain relative z-10">
                {/* 搜索框 */}
                <div className="relative">
                  <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="输入目标店铺中的商品名称、SKU或商品编码搜索..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    autoFocus
                    className="h-11 w-full rounded-full border border-border/60 bg-white dark:bg-white/5 pl-10 pr-9 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  />
                  {productSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setProductSearchQuery("")}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* 选项 1：作为全新商品上架 */}
                <div
                  onClick={() => {
                    setTargetProduct(null);
                    setIsPickerMode(false);
                  }}
                  className={cn(
                    "flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all",
                    targetProduct === null
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                      : "border-dashed border-border/80 hover:bg-black/2 dark:hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shrink-0">
                      <PlusCircle size={20} />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-foreground flex items-center gap-2">
                        <span>在【{selectedTargetShop?.name}】作为新商品上架</span>
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                          新建条目
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        目标店尚未铺过此货时选此项，调拨后将自动完成上架并入库
                      </p>
                    </div>
                  </div>
                  {targetProduct === null && <Check size={18} className="text-primary shrink-0 mr-1" />}
                </div>

                {/* 选项列表：B 店已存在的商品 */}
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5 px-1">
                    <Package size={13} className="text-blue-500" />
                    <span>目标店铺已有商品 ({searchedProducts.length})</span>
                  </span>

                  {isSearchingProducts ? (
                    <div className="flex items-center justify-center py-10 text-muted-foreground gap-2 text-xs">
                      <Loader2 size={16} className="animate-spin text-primary" />
                      <span>正在搜索目标店铺商品...</span>
                    </div>
                  ) : searchedProducts.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground rounded-2xl border border-dashed border-border/60">
                      没有找到符合条件的商品，您可以直接选择上方的“作为新商品上架”
                    </div>
                  ) : (
                    searchedProducts.map((p) => {
                      const isSelected = targetProduct?.id === p.id;
                      const pImg = resolveImageUrl(p.image);
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setTargetProduct(p);
                            setIsPickerMode(false);
                          }}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all",
                            isSelected
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                              : "border-border/50 dark:border-white/5 bg-black/2 dark:bg-white/3 hover:bg-black/4 dark:hover:bg-white/5"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-secondary/30 border border-border/50">
                              {pImg ? (
                                <Image src={pImg} alt={p.name} fill className="object-cover" sizes="40px" unoptimized />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package size={16} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-foreground truncate">{p.name}</div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                                {p.sku && <span>商品编码: {p.sku}</span>}
                                <span>当前库存: <strong className="text-foreground font-semibold font-mono">{p.stock}</strong> 件</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check size={18} className="text-primary shrink-0 ml-2 mr-1" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 底部固定返回栏 */}
              <div className="p-4 sm:p-5 border-t border-border/50 dark:border-white/10 bg-black/2 dark:bg-white/3 shrink-0 flex items-center justify-between gap-3 relative z-10">
                <button
                  type="button"
                  onClick={() => setIsPickerMode(false)}
                  className="rounded-full px-5 py-2.5 text-xs font-bold border border-border/70 hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <ArrowLeft size={14} />
                  <span>返回调拨单</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPickerMode(false)}
                  className="rounded-full px-6 py-2.5 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Check size={14} />
                  <span>完成选择并返回</span>
                </button>
              </div>
            </div>
          ) : (
            /* 标准调拨表单 */
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-3.5 sm:space-y-4.5 overscroll-contain relative z-10">
              
              {/* 区块一：📦 调出商品与目标门店 */}
              <div className="rounded-2xl border border-border/50 dark:border-white/5 bg-black/2 dark:bg-white/3 p-4 space-y-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between pb-2 border-b border-border/50 dark:border-white/5">
                  <div className="flex items-center gap-1.5">
                    <Layers size={13} className="text-primary" />
                    <span>调拨路由与商品对应</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-normal">精准跨店对调</span>
                </h4>

                {/* 源商品信息 */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/5 border border-border/50 dark:border-white/10">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary/30 border border-border/50">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={item.name} fill className="object-cover" sizes="48px" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package size={20} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary shrink-0">
                        调出店铺：{item.shopName}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-foreground truncate mt-1">{item.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      {item.sku && <span className="font-mono">商品编码: {item.sku}</span>}
                      <span>
                        当前可用:{" "}
                        <strong className={cn("font-bold font-number", maxStock > 0 ? "text-primary" : "text-destructive")}>
                          {maxStock}
                        </strong>{" "}
                        件
                      </span>
                    </div>
                  </div>
                </div>

                {/* 目标门店选择（统一系统 CustomSelect 药丸风格） */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-muted-foreground/80 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                    <Store size={13} className="text-emerald-500" /> 调入目标门店
                  </label>
                  {candidateShops.length === 0 ? (
                    <div className="text-xs text-destructive font-medium p-3 rounded-full border border-destructive/20 bg-destructive/10">
                      暂无可调入的其他门店
                    </div>
                  ) : (
                    <CustomSelect
                      value={targetShopId}
                      onChange={(val) => {
                        setTargetShopId(val);
                        setTargetProduct(null);
                      }}
                      options={candidateShops.map((s) => ({ value: s.id, label: s.name }))}
                      placeholder="请选择接收门店"
                      triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 h-11 px-4 text-xs dark:hover:bg-white/10"
                    />
                  )}
                </div>

                {/* 目标商品对齐条目 */}
                <div className="p-3 rounded-xl bg-white dark:bg-white/5 border border-border/50 dark:border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isMatchingTarget ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
                        <Loader2 size={13} className="animate-spin text-primary" />
                        <span>正在匹配【{selectedTargetShop?.name}】同款商品...</span>
                      </div>
                    ) : targetProduct ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                            已对齐目标商品
                          </span>
                          <span className="font-bold text-xs text-foreground truncate">{targetProduct.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          {targetProduct.sku && <span className="font-mono">商品编码: {targetProduct.sku}</span>}
                          <span>
                            当前库存: <strong className="font-mono font-bold text-foreground">{targetProduct.stock}</strong> 件 → 预计增至:{" "}
                            <strong className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                              {targetProduct.stock + numQuantity}
                            </strong>{" "}
                            件
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                            新商品
                          </span>
                          <span>将在目标店新建条目上架</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          初始库存设为: <strong className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">{numQuantity}</strong> 件
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPickerMode(true);
                      setProductSearchQuery("");
                    }}
                    className="rounded-full px-3 py-1.5 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all active:scale-95 shrink-0 whitespace-nowrap"
                  >
                    {targetProduct ? "更换商品" : "指定已有商品"}
                  </button>
                </div>
              </div>

              {/* 零库存提示 */}
              {maxStock <= 0 && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>当前源店铺该商品可用库存为 0，暂无法发起调拨。</span>
                </div>
              )}

              {/* 区块二：💰 调拨数量与成本核算 */}
              <div className="rounded-2xl border border-border/50 dark:border-white/5 bg-black/2 dark:bg-white/3 p-4 space-y-3.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/50 dark:border-white/5">
                  <span className="text-xs font-black uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1.5">
                    <Coins size={13} className="text-amber-500" />
                    <span>调拨数量与成本核算</span>
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>原店进价:</span>
                    <strong className="font-mono font-bold text-foreground">¥{sourceCost.toFixed(2)}</strong>
                    <span>/件</span>
                  </div>
                </div>

                {/* 调拨件数与单件运费并排双列 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 调拨件数 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-muted-foreground/80 flex items-center gap-1.5">
                        <SlidersHorizontal size={12} className="text-indigo-500" />
                        <span>调拨件数</span>
                      </label>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>
                          最多可调: <strong className="text-foreground font-mono font-bold">{maxStock}</strong> 件
                        </span>
                        {maxStock > 0 && (
                          <button
                            type="button"
                            onClick={() => setQuantity(String(maxStock))}
                            className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all active:scale-95 cursor-pointer"
                            title="一键调拨全部库存"
                          >
                            全部
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        disabled={maxStock <= 0 || numQuantity <= 1}
                        onClick={() => setQuantity(String(Math.max(1, numQuantity - 1)))}
                        className="absolute left-1.5 z-10 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={quantity}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          if (raw === "") {
                            setQuantity("");
                            return;
                          }
                          const val = parseInt(raw, 10);
                          if (val > maxStock) {
                            setQuantity(String(maxStock));
                          } else {
                            setQuantity(String(val));
                          }
                        }}
                        onBlur={() => {
                          const val = parseInt(quantity, 10);
                          if (isNaN(val) || val < 1) {
                            setQuantity(maxStock > 0 ? "1" : "0");
                          } else if (val > maxStock) {
                            setQuantity(String(maxStock));
                          }
                        }}
                        disabled={maxStock <= 0}
                        placeholder="请输入调拨件数"
                        className="h-11 w-full rounded-full border border-border/60 bg-white dark:bg-white/5 px-10 text-center text-xs font-bold font-number text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-all shadow-xs"
                      />
                      <button
                        type="button"
                        disabled={maxStock <= 0 || numQuantity >= maxStock}
                        onClick={() => setQuantity(String(Math.min(maxStock, numQuantity + 1)))}
                        className="absolute right-1.5 z-10 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* 整单调拨总运费 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-muted-foreground/80 flex items-center gap-1">
                        <span>调拨总运费 (元)</span>
                      </label>
                      <span className="text-[11px] text-muted-foreground">
                        {numQuantity > 1 && numShippingFee > 0 ? (
                          <>
                            单件均摊: <strong className="font-mono text-primary font-bold">¥{unitShippingFee.toFixed(2)}</strong>/件
                          </>
                        ) : (
                          <span>本次整单配送运费</span>
                        )}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                        ¥
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0.00 (整单运费)"
                        value={shippingFee}
                        onChange={(e) => setShippingFee(e.target.value)}
                        className="h-11 w-full rounded-full border border-border/60 bg-white dark:bg-white/5 pl-8 pr-4 text-xs font-bold font-number text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 调入采购进价（到岸成本）自动核算 */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-white/5 border border-border/50 dark:border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>调入入库采购单价:</span>
                      <strong className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ¥{inboundUnitCost.toFixed(2)}
                      </strong>
                      <span className="text-[10px] text-muted-foreground font-normal">/件</span>
                    </div>
                    {numQuantity > 0 && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        入库总额: <strong className="text-foreground font-bold font-number">¥{totalInboundAmount.toFixed(2)}</strong>
                      </span>
                    )}
                  </div>

                  {/* 成本计算分解公式 */}
                  <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5 bg-black/2 dark:bg-white/3 p-2.5 rounded-lg font-mono">
                    <span>原进价 ¥{sourceCost.toFixed(2)}</span>
                    {numShippingFee > 0 ? (
                      <>
                        <span>+</span>
                        <span>
                          均摊运费 ¥{unitShippingFee.toFixed(2)}
                          {numQuantity > 1 && (
                            <span className="text-[10px] opacity-75 font-normal"> (总运费¥{numShippingFee.toFixed(2)} ÷ {numQuantity}件)</span>
                          )}
                        </span>
                      </>
                    ) : null}
                    <span>=</span>
                    <span className="font-bold text-foreground">
                      ¥{inboundUnitCost.toFixed(2)} / 件
                    </span>
                  </div>
                </div>

                {/* 调拨入库采购批次说明（按系统采购批次独立核算） */}
                <div className="text-[11px] text-muted-foreground bg-black/2 dark:bg-white/3 p-2.5 rounded-xl flex items-center gap-1.5">
                  <Info size={13} className="text-primary shrink-0" />
                  <span>
                    调入后将自动为【{selectedTargetShop?.name || "目标门店"}】生成一笔入库采购批次（单价:{" "}
                    <strong className="text-foreground font-mono font-bold">
                      ¥{inboundUnitCost.toFixed(2)}
                    </strong>{" "}
                    元/件，总额:{" "}
                    <strong className="text-foreground font-mono font-bold">
                      ¥{totalInboundAmount.toFixed(2)}
                    </strong>{" "}
                    元），按系统采购批次独立核算库存与成本。
                  </span>
                </div>
              </div>

              {/* 底部动作按钮组 - 完美对齐系统 rounded-full 胶囊样式 */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 rounded-full border border-border/70 hover:text-foreground hover:bg-secondary/50 py-3 text-xs font-bold text-muted-foreground transition-all active:scale-[0.96] flex items-center justify-center"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    maxStock <= 0 ||
                    !isQuantityValid ||
                    !targetShopId ||
                    candidateShops.length === 0
                  }
                  className="flex-2 rounded-full bg-primary text-primary-foreground py-3 text-xs font-bold shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.3)] hover:bg-primary/90 hover:shadow-[0_12px_24px_-4px_rgba(var(--primary-rgb),0.45)] hover:-translate-y-0.5 disabled:translate-y-0 active:scale-[0.95] disabled:opacity-50 disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>正在划拨...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      <span>确认调拨 ({numQuantity}件)</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
