"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ClipboardList, Minus, Package2, Plus, RotateCcw, X } from "lucide-react";
import { OutboundOrder } from "@/lib/types";
import {
  getOutboundReturnedQuantityMap,
  getOutboundLatestReturnReason,
  parseOutboundReturnMeta,
} from "@/lib/outboundReturnMeta";
import { useToast } from "@/components/ui/Toast";

interface PartialReturnModalProps {
  isOpen: boolean;
  order: OutboundOrder | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function PartialReturnModal({ isOpen, order, onClose, onSuccess }: PartialReturnModalProps) {
  const { showToast } = useToast();
  const [refundAmount, setRefundAmount] = useState("");
  const [extraExpense, setExtraExpense] = useState("");
  const [reason, setReason] = useState("售后退货");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefundAmountManual, setIsRefundAmountManual] = useState(false);

  const returnState = useMemo(() => {
    const meta = parseOutboundReturnMeta(order?.note);
    const returnedMap = getOutboundReturnedQuantityMap(meta.returns);
    const rows = (order?.items || []).map((item) => {
      const alreadyReturned = returnedMap.get(String(item.id || "")) || 0;
      const originalQuantity = Math.max(0, Number(item.quantity || 0));
      const remainingQuantity = Math.max(0, originalQuantity - alreadyReturned);
      return {
        itemId: String(item.id || ""),
        name: item.shopProduct?.name || item.product?.name || "未命名商品",
        image: item.shopProduct?.image || item.product?.image || null,
        originalQuantity,
        alreadyReturned,
        remainingQuantity,
        price: Number(item.price || 0),
      };
    });
    return {
      rows,
      latestReason: getOutboundLatestReturnReason(meta.returns),
    };
  }, [order]);

  const suggestedAmount = useMemo(() => {
    return returnState.rows.reduce((sum, row) => {
      const qty = quantities[row.itemId] || 0;
      return sum + qty * row.price;
    }, 0);
  }, [quantities, returnState.rows]);

  useEffect(() => {
    if (!isOpen || !order) return;
    const next: Record<string, number> = {};
    returnState.rows.forEach((row) => {
      next[row.itemId] = 0;
    });
    setQuantities(next);
    setRefundAmount("");
    setExtraExpense("");
    setReason("售后退货");
    setIsRefundAmountManual(false);
  }, [isOpen, order, returnState.rows]);

  useEffect(() => {
    if (!isOpen || isRefundAmountManual) return;
    if (suggestedAmount > 0) {
      setRefundAmount(suggestedAmount.toFixed(2));
    } else {
      setRefundAmount("");
    }
  }, [isOpen, suggestedAmount, isRefundAmountManual]);

  if (!isOpen || !order) {
    return null;
  }

  const selectedCount = Object.values(quantities).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0);
  const selectedSkuCount = returnState.rows.filter((row) => Number(quantities[row.itemId] || 0) > 0).length;

  const updateQuantity = (itemId: string, nextValue: number, max: number) => {
    const safeValue = Math.max(0, Math.min(max, Number.isFinite(nextValue) ? nextValue : 0));
    setQuantities((current) => ({ ...current, [itemId]: safeValue }));
  };

  const handleSubmit = async () => {
    const items = returnState.rows
      .map((row) => ({
        outboundOrderItemId: row.itemId,
        quantity: Math.max(0, Number(quantities[row.itemId] || 0)),
      }))
      .filter((item) => item.quantity > 0);

    if (items.length === 0) {
      showToast("请先选择要退回的商品数量", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/outbound/${order.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim() || "售后退货",
          refundAmount: Number(refundAmount || 0),
          extraExpense: Number(extraExpense || 0),
          items,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "退货入库失败", "error");
        return;
      }

      showToast("退货已回库，利润会按退款、退货成本和额外支出一起对冲", "success");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Partial return failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto p-3 sm:p-4 lg:pl-(--sidebar-width)">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative my-3 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] sm:rounded-[32px] border border-border/60 bg-white dark:border-white/10 dark:bg-gray-900/75 backdrop-blur-2xl shadow-2xl sm:my-4 sm:max-h-[calc(100vh-2rem)]">
        <div className="shrink-0 border-b border-border/60 bg-white/40 dark:bg-white/[0.02] px-5 py-4 sm:px-8 sm:py-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground">部分退货入库</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                选择本单要退回的商品数量，库存会自动回补，利润会按退款金额、退回成本和额外支出一起冲回。
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              aria-label="关闭"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6 custom-scrollbar">
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-white/50 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03] shadow-xs">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">出库单</div>
                <div className="mt-1.5 text-base font-mono font-bold text-foreground">#{order.id.slice(-8).toUpperCase()}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">本次退货生成关联退货单</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-white/50 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03] shadow-xs">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">当前状态</div>
                <div className="mt-1.5 text-base font-bold text-foreground">
                  {order.status === "PartialReturned" ? "部分退回" : order.status === "Returned" ? "已全部退回" : "正常"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">继续退回不覆盖原记录</div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-white/50 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03] shadow-xs">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">最近退货</div>
                <div className="mt-1.5 truncate text-base font-bold text-foreground">{returnState.latestReason || "暂无"}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">历史退货保留在详情中</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-white/50 p-4 dark:border-white/10 dark:bg-white/[0.03] shadow-xs sm:p-5">
              <div className="mb-3.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                  <ClipboardList size={13} className="text-sky-500" />
                  退货商品选择
                </div>
                <p className="mt-1 text-xs text-muted-foreground">优先选择需要退回的件数，右侧输入框只保留本次退货数量。</p>
              </div>

              <div className="space-y-2.5">
                {returnState.rows.map((row) => (
                  (() => {
                    const selectedQuantity = Number(quantities[row.itemId] || 0);
                    const isSelected = selectedQuantity > 0;
                    return (
                      <div
                        key={row.itemId}
                        className={[
                          "grid gap-2.5 rounded-2xl border px-3.5 py-3 transition-all md:grid-cols-[minmax(0,1fr)_64px_64px_64px_140px] md:items-center shadow-xs",
                          isSelected
                            ? "border-sky-500/30 bg-sky-500/5 dark:bg-sky-500/10"
                            : "border-border/60 bg-white/70 dark:border-white/10 dark:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted flex items-center justify-center dark:border-white/10">
                              {row.image ? (
                                <Image
                                  src={row.image}
                                  alt={row.name}
                                  fill
                                  sizes="36px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                  <Package2 size={16} />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-xs sm:text-sm font-bold leading-5 text-foreground">{row.name}</div>
                            </div>
                          </div>
                        </div>

                        <div className="hidden text-center md:block">
                          <div className="text-[10px] font-bold text-muted-foreground">原数量</div>
                          <div className="mt-0.5 text-sm font-bold text-foreground">{row.originalQuantity}</div>
                        </div>
                        <div className="hidden text-center md:block">
                          <div className="text-[10px] font-bold text-muted-foreground">已退</div>
                          <div className="mt-0.5 text-sm font-bold text-amber-600 dark:text-amber-400">{row.alreadyReturned}</div>
                        </div>
                        <div className="hidden text-center md:block">
                          <div className="text-[10px] font-bold text-muted-foreground">可退</div>
                          <div className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">{row.remainingQuantity}</div>
                        </div>

                        <label className="block">
                          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-muted-foreground md:text-center">
                            本次退回
                          </span>
                          <div className="flex items-center rounded-full border border-border/60 bg-white/80 dark:border-white/10 dark:bg-white/5 shadow-2xs overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateQuantity(row.itemId, selectedQuantity - 1, row.remainingQuantity)}
                              disabled={selectedQuantity <= 0}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/10"
                              aria-label={`减少 ${row.name} 的退回数量`}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={row.remainingQuantity}
                              value={selectedQuantity}
                              onChange={(e) => updateQuantity(row.itemId, Number(e.target.value || 0), row.remainingQuantity)}
                              className="h-8 min-w-0 flex-1 bg-transparent px-1 text-center text-xs font-bold text-foreground outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(row.itemId, selectedQuantity + 1, row.remainingQuantity)}
                              disabled={selectedQuantity >= row.remainingQuantity}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/10"
                              aria-label={`增加 ${row.name} 的退回数量`}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        </label>
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-white/50 p-4 dark:border-white/10 dark:bg-white/[0.03] shadow-xs sm:p-5">
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                    退货说明与汇总
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">填写退货原因、退款金额和额外支出，提交后系统会按本次退货数量回补库存并冲回利润。</p>
                </div>

                <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)]">
                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-foreground">退货原因</span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="例如：客户退单、少件退回"
                      className="h-10 w-full rounded-full border border-border/60 bg-white/70 px-4 text-xs font-bold text-foreground outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 dark:border-white/10 dark:bg-white/5 shadow-2xs"
                    />
                  </label>

                  <label className="space-y-1.5 flex-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold text-foreground">退款金额</span>
                      {suggestedAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRefundAmount(suggestedAmount.toFixed(2));
                            setIsRefundAmountManual(true);
                          }}
                          className="text-[11px] text-sky-600 hover:text-sky-500 dark:text-sky-400 font-bold transition cursor-pointer"
                        >
                          参考 ¥{suggestedAmount.toFixed(2)}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">¥</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => {
                          setRefundAmount(e.target.value);
                          setIsRefundAmountManual(true);
                        }}
                        placeholder="0.00"
                        className="h-10 w-full rounded-full border border-border/60 bg-white/70 pl-8 pr-4 text-xs font-bold text-foreground outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 dark:border-white/10 dark:bg-white/5 shadow-2xs"
                      />
                    </div>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-xs font-bold text-foreground px-1">额外退货支出</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-bold">¥</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={extraExpense}
                        onChange={(e) => setExtraExpense(e.target.value)}
                        placeholder="0.00"
                        className="h-10 w-full rounded-full border border-border/60 bg-white/70 pl-8 pr-4 text-xs font-bold text-foreground outline-none transition focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10 dark:border-white/10 dark:bg-white/5 shadow-2xs"
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/60 bg-white/40 px-5 py-4 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.02] sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="text-xs text-muted-foreground">
              本次将退回 <span className="font-bold text-foreground">{selectedCount}</span> 件商品，共 <span className="font-bold text-foreground">{selectedSkuCount}</span> 种
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:flex sm:items-center">
              <button
                onClick={onClose}
                className="h-10 rounded-full border border-border/60 bg-white/70 px-5 text-xs font-bold text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex h-10 items-center justify-center gap-2 rounded-full px-6 text-xs font-bold transition-all duration-300 bg-linear-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              >
                <RotateCcw size={14} />
                {isSubmitting ? "处理中..." : "确认退货入库"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
