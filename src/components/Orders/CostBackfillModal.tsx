import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Check, AlertTriangle, Coins, RefreshCw } from "lucide-react";

type OutboundBatch = {
  purchaseOrderItemId: string;
  purchaseOrderId: string | null;
  quantity: number;
  unitCost: number;
  isVirtual?: boolean;
};

type OutboundBreakdownItem = {
  outboundOrderItemId?: string | null;
  productId?: string | null;
  name: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  shopProductId?: string | null;
  batches?: OutboundBatch[];
  availableBatches?: Array<{
    purchaseOrderItemId: string;
    purchaseOrderId: string | null;
    quantity: number;
    remainingQuantity: number;
    costPrice: number;
    date: string | null;
  }>;
};

interface CostBackfillModalProps {
  order: {
    id: string;
    orderNo: string;
    matchedShopName?: string | null;
    productCostBreakdown?: OutboundBreakdownItem[] | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

type ReferencePrice = {
  price: number;
  date: string;
  orderId: string;
};

export default function CostBackfillModal({
  order,
  onClose,
  onSuccess,
}: CostBackfillModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // 记录每个批次输入框的修改值: { purchaseOrderItemId_or_outboundOrderItemId: string_value }
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  
  // 记录各商品的历史参考价格: { productId_or_shopProductId: ReferencePrice[] }
  const [refPrices, setRefPrices] = useState<Record<string, ReferencePrice[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // 虚拟绑定 FIFO 计算方法
  const resolveDisplayBatches = (item: OutboundBreakdownItem): OutboundBatch[] => {
    if (item.batches && item.batches.length > 0) {
      return item.batches;
    }

    if (!item.availableBatches || item.availableBatches.length === 0) {
      return [];
    }

    const displayBatches: OutboundBatch[] = [];
    let remaining = item.quantity;

    for (const available of item.availableBatches) {
      if (remaining <= 0) break;
      const deduct = Math.min(available.remainingQuantity, remaining);
      if (deduct > 0) {
        displayBatches.push({
          purchaseOrderItemId: available.purchaseOrderItemId,
          purchaseOrderId: available.purchaseOrderId,
          quantity: deduct,
          unitCost: available.costPrice,
          isVirtual: true,
        });
        remaining -= deduct;
      }
    }

    return displayBatches;
  };

  // 1. 初始化成本输入框的值
  useEffect(() => {
    if (!order.productCostBreakdown) return;
    
    const initialInputs: Record<string, string> = {};
    order.productCostBreakdown.forEach((item) => {
      const displayBatches = resolveDisplayBatches(item);
      if (displayBatches.length > 0) {
        displayBatches.forEach((batch) => {
          // 如果成本是 0，默认输入框为空，方便用户输入；否则显示当前成本
          initialInputs[batch.purchaseOrderItemId] = batch.unitCost <= 0 ? "" : String(batch.unitCost);
        });
      } else if (item.outboundOrderItemId) {
        // 无可用批次，兜底纯手动回填
        initialInputs[item.outboundOrderItemId] = item.unitCost <= 0 ? "" : String(item.unitCost);
      }
    });
    setCostInputs(initialInputs);
  }, [order.productCostBreakdown]);

  // 2. 并行拉取每个缺成本商品的历史采购价
  useEffect(() => {
    if (!order.productCostBreakdown) return;

    order.productCostBreakdown.forEach((item) => {
      const targetId = item.shopProductId || item.productId;
      if (!targetId) return;

      // 如果当前商品的某些批次价格 <= 0，就去查询历史记录
      const displayBatches = resolveDisplayBatches(item);
      const hasMissingCost = displayBatches.length > 0
        ? displayBatches.some((b) => b.unitCost <= 0)
        : item.unitCost <= 0;

      if (!hasMissingCost) return;

      // 防止重复加载
      if (loadingHistory[targetId] || refPrices[targetId]) return;

      setLoadingHistory((prev) => ({ ...prev, [targetId]: true }));

      fetch(`/api/purchases?type=Inbound&productId=${targetId}&pageSize=8`)
        .then((res) => {
          if (!res.ok) throw new Error("Fetch failed");
          return res.json();
        })
        .then((data) => {
          const prices: ReferencePrice[] = [];
          const seen = new Set<number>(); // 价格去重，只保留最近一次出现的该价格

          data.items?.forEach((po: { id: string; date?: string; items?: Array<{ productId?: string | null; shopProductId?: string | null; costPrice?: number }> }) => {
            po.items?.forEach((poi) => {
              const matchesProduct = poi.productId === targetId || poi.shopProductId === targetId;
              const hasPrice = typeof poi.costPrice === "number" && poi.costPrice > 0;
              
              if (matchesProduct && hasPrice) {
                if (!seen.has(poi.costPrice!)) {
                  seen.add(poi.costPrice!);
                  
                  // 格式化日期：YYYY-MM-DD
                  let formattedDate = "";
                  if (po.date) {
                    const dateObj = new Date(po.date);
                    formattedDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
                  }
                  
                  prices.push({
                    price: poi.costPrice!,
                    date: formattedDate || "无日期",
                    orderId: po.id,
                  });
                }
              }
            });
          });

          setRefPrices((prev) => ({ ...prev, [targetId]: prices }));
        })
        .catch((err) => {
          console.error(`Failed to fetch history for ${item.name}:`, err);
        })
        .finally(() => {
          setLoadingHistory((prev) => ({ ...prev, [targetId]: false }));
        });
    });
  }, [order.productCostBreakdown, loadingHistory, refPrices]);

  const handleInputChange = (purchaseOrderItemId: string, val: string) => {
    // 仅允许数字和小数点
    if (val !== "" && !/^\d*\.?\d*$/.test(val)) return;
    setCostInputs((prev) => ({ ...prev, [purchaseOrderItemId]: val }));
  };

  const handleApplyRefPrice = (purchaseOrderItemId: string, price: number) => {
    setCostInputs((prev) => ({ ...prev, [purchaseOrderItemId]: String(price) }));
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    // 构造待提交的数据项
    const submitItems: Array<{
      purchaseOrderItemId?: string;
      outboundOrderItemId?: string;
      quantity?: number;
      costPrice: number;
    }> = [];
    let hasEmptyOrZero = false;

    if (!order.productCostBreakdown) return;

    for (const item of order.productCostBreakdown) {
      const displayBatches = resolveDisplayBatches(item);
      if (displayBatches.length > 0) {
        for (const batch of displayBatches) {
          const rawVal = costInputs[batch.purchaseOrderItemId];
          const costPrice = parseFloat(rawVal || "0");
          
          if (isNaN(costPrice) || costPrice <= 0) {
            hasEmptyOrZero = true;
          }
          
          submitItems.push({
            purchaseOrderItemId: batch.purchaseOrderItemId,
            outboundOrderItemId: batch.isVirtual ? (item.outboundOrderItemId || undefined) : undefined,
            quantity: batch.isVirtual ? batch.quantity : undefined,
            costPrice: isNaN(costPrice) ? 0 : costPrice,
          });
        }
      } else if (item.outboundOrderItemId) {
        // 兜底手动回填
        const rawVal = costInputs[item.outboundOrderItemId];
        const costPrice = parseFloat(rawVal || "0");
        
        if (isNaN(costPrice) || costPrice <= 0) {
          hasEmptyOrZero = true;
        }
        
        submitItems.push({
          outboundOrderItemId: item.outboundOrderItemId,
          costPrice: isNaN(costPrice) ? 0 : costPrice,
        });
      }
    }

    if (hasEmptyOrZero) {
      const confirmSave = window.confirm("部分商品的成本未填写或填写为 0，这会导致利润计算不准。确定要直接保存吗？");
      if (!confirmSave) return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/purchases/backfill-cost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: submitItems }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData?.error || "成本保存失败");
      }

      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : "成本保存发生错误");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isMounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4">
      {/* 遮罩背景 */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* 对话框主体 */}
      <div className="relative w-full max-w-2xl rounded-[28px] border border-black/8 bg-white/96 shadow-[0_24px_64px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-[#0d1420]/98 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* 头部 */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-black/6 dark:border-white/8 shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-1.5">
              <Coins size={12} className="text-orange-500" />
              订单成本回填与修改
            </div>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>单号: {order.orderNo}</span>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {order.matchedShopName}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* 滚动列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {!order.productCostBreakdown || order.productCostBreakdown.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <AlertTriangle size={24} className="text-amber-500" />
              当前订单似乎没有任何出库记录，无法获取出库商品。
            </div>
          ) : (
            order.productCostBreakdown.map((item, itemIdx) => {
              const targetId = item.shopProductId || item.productId;
              const isHistoryLoading = targetId ? loadingHistory[targetId] : false;
              const historyCosts = targetId ? (refPrices[targetId] || []) : [];

              return (
                <div 
                  key={`${item.name}-${itemIdx}`} 
                  className="rounded-2xl border border-black/6 bg-black/2 p-4 dark:border-white/8 dark:bg-white/2 flex flex-col gap-3"
                >
                  {/* 商品头部信息 */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-foreground leading-snug break-all line-clamp-2">
                        {item.name}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>数量: x{item.quantity}</span>
                        <span>·</span>
                        {item.unitCost > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">当前成本: ¥{(item.unitCost / 100).toFixed(2)}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 font-semibold bg-orange-500/10 px-1.5 py-0.25 rounded-md">
                            待回填成本
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 批次编辑区域 */}
                  <div className="space-y-3 pt-2 border-t border-black/4 dark:border-white/4">
                    {(() => {
                      const displayBatches = resolveDisplayBatches(item);
                      if (displayBatches.length === 0) {
                        // 如果完全没有批次，且也没有候选批次，退回到纯手动兜底回填
                        if (item.outboundOrderItemId) {
                          const idKey = item.outboundOrderItemId;
                          return (
                            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-xs">
                                <div className="font-semibold text-foreground flex items-center gap-1.5">
                                  <span className="text-[10px] bg-amber-200 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.25 rounded">无关联入库</span>
                                  <span className="text-muted-foreground">出库后补录成本</span>
                                </div>
                                <div className="mt-0.5 text-muted-foreground/80">
                                  出库量: {item.quantity} 件
                                </div>
                              </div>

                              <div className="flex flex-col gap-1.5 items-end shrink-0 w-full sm:w-auto">
                                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                  <span className="text-sm font-bold text-muted-foreground">¥</span>
                                  <input
                                    type="text"
                                    value={costInputs[idKey] || ""}
                                    onChange={(e) => handleInputChange(idKey, e.target.value)}
                                    placeholder="输入采购单价"
                                    disabled={isSaving}
                                    className="h-10 w-full sm:w-40 rounded-xl border border-black/8 bg-white/50 px-3 text-sm font-medium text-foreground outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/12 dark:border-white/10 dark:bg-white/5 dark:focus:border-primary/40"
                                  />
                                </div>
                                {targetId && (
                                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 justify-end">
                                    {isHistoryLoading ? (
                                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                                        <RefreshCw size={10} className="animate-spin" />
                                        查询历史进价中...
                                      </span>
                                    ) : historyCosts.length > 0 ? (
                                      <>
                                        <span>参考历史:</span>
                                        {historyCosts.map((ref, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() => handleApplyRefPrice(idKey, ref.price)}
                                            disabled={isSaving}
                                            title={`采购单: ${ref.orderId} (${ref.date})`}
                                            className="text-primary hover:underline hover:text-primary/80 font-medium bg-primary/8 px-1.5 py-0.25 rounded cursor-pointer transition-colors active:scale-95"
                                          >
                                            ¥{ref.price.toFixed(2)}
                                          </button>
                                        ))}
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground/40">无历史进价记录</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="text-xs text-muted-foreground/60 italic py-1">
                            未定位到该商品绑定的采购入库明细。
                          </div>
                        );
                      }

                      return displayBatches.map((batch) => (
                        <div 
                          key={batch.purchaseOrderItemId}
                          className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          {/* 批次信息描述 */}
                          <div className="text-xs">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              {batch.isVirtual ? (
                                <span className="text-[10px] bg-orange-200 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.25 rounded">补录关联批次</span>
                              ) : (
                                <span className="text-[10px] bg-slate-200 dark:bg-white/10 text-muted-foreground px-1.5 py-0.25 rounded">批次</span>
                              )}
                              <span className="font-mono text-muted-foreground">{batch.purchaseOrderId || "未知入库单"}</span>
                            </div>
                            <div className="mt-0.5 text-muted-foreground/80">
                              {batch.isVirtual ? `分配出库量: ${batch.quantity} 件` : `批次出库量: ${batch.quantity} 件`}
                            </div>
                          </div>

                          {/* 输入框和参考价格 */}
                          <div className="flex flex-col gap-1.5 items-end shrink-0 w-full sm:w-auto">
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                              <span className="text-sm font-bold text-muted-foreground">¥</span>
                              <input
                                type="text"
                                value={costInputs[batch.purchaseOrderItemId] || ""}
                                onChange={(e) => handleInputChange(batch.purchaseOrderItemId, e.target.value)}
                                placeholder="输入采购单价"
                                disabled={isSaving}
                                className="h-10 w-full sm:w-40 rounded-xl border border-black/8 bg-white/50 px-3 text-sm font-medium text-foreground outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/12 dark:border-white/10 dark:bg-white/5 dark:focus:border-primary/40"
                              />
                            </div>
                            
                            {/* 历史进价参考展示 */}
                            {targetId && (
                              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 justify-end">
                                {isHistoryLoading ? (
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                                    <RefreshCw size={10} className="animate-spin" />
                                    查询历史进价中...
                                  </span>
                                ) : historyCosts.length > 0 ? (
                                  <>
                                    <span>参考历史:</span>
                                    {historyCosts.map((ref, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => handleApplyRefPrice(batch.purchaseOrderItemId, ref.price)}
                                        disabled={isSaving}
                                        title={`采购单: ${ref.orderId} (${ref.date})`}
                                        className="text-primary hover:underline hover:text-primary/80 font-medium bg-primary/8 px-1.5 py-0.25 rounded cursor-pointer transition-colors active:scale-95"
                                      >
                                        ¥{ref.price.toFixed(2)}
                                      </button>
                                    ))}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/40">无历史进价记录</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-between gap-4 border-t border-black/6 dark:border-white/8 px-6 py-4 shrink-0 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            更新采购价后，系统会自动更新所有受影响的销售出库成本及净利润。
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="h-10 px-4 rounded-xl border border-black/8 bg-white/85 text-xs font-medium text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !order.productCostBreakdown || order.productCostBreakdown.length === 0}
              className="h-10 px-5 rounded-xl bg-foreground text-xs font-medium text-background transition-all hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Check size={13} />
                  保存
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
