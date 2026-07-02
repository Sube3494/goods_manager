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
  const [reason, setReason] = useState("售后退货");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      };
    });
    return {
      rows,
      latestReason: getOutboundLatestReturnReason(meta.returns),
    };
  }, [order]);

  useEffect(() => {
    if (!isOpen || !order) return;
    const next: Record<string, number> = {};
    returnState.rows.forEach((row) => {
      next[row.itemId] = 0;
    });
    setQuantities(next);
    setRefundAmount("");
    setReason("售后退货");
  }, [isOpen, order, returnState.rows]);

  if (!isOpen || !order) {
    return null;
  }

  const selectedCount = Object.values(quantities).reduce((sum, qty) => sum + Math.max(0, Number(qty || 0)), 0);
  const selectedSkuCount = returnState.rows.filter((row) => Number(quantities[row.itemId] || 0) > 0).length;
  const refundAmountNumber = Math.max(0, Number(refundAmount || 0));

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
          items,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "退货入库失败", "error");
        return;
      }

      showToast("退货已回库，利润会按退款和退货成本一起对冲", "success");
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
    <div className="fixed inset-0 z-60 flex items-start justify-center overflow-y-auto p-3 sm:p-4 lg:pl-(--sidebar-width)">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative my-3 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-black/8 bg-white/96 shadow-[0_24px_64px_rgba(15,23,42,0.20)] dark:border-white/10 dark:bg-[#0d1420]/98 sm:my-4 sm:max-h-[calc(100vh-2rem)] sm:rounded-[28px]">
        <div className="shrink-0 border-b border-black/6 px-4 py-4 dark:border-white/8 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">部分退货入库</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              选择本单要退回的商品数量，库存会自动回补，利润会按退款金额和退回成本一起冲回。
            </p>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-black/6 bg-black/2 px-4 py-3.5 dark:border-white/8 dark:bg-white/3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">出库单</div>
              <div className="mt-2 text-lg font-bold text-foreground">{order.id.slice(-8).toUpperCase()}</div>
              <div className="mt-1 text-sm text-muted-foreground">本次退货会生成关联退货入库单</div>
            </div>
            <div className="rounded-2xl border border-black/6 bg-black/2 px-4 py-3.5 dark:border-white/8 dark:bg-white/3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">当前状态</div>
              <div className="mt-2 text-lg font-bold text-foreground">
                {order.status === "PartialReturned" ? "部分退回" : order.status === "Returned" ? "已全部退回" : "正常"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">继续退回不会覆盖之前记录</div>
            </div>
            <div className="rounded-2xl border border-black/6 bg-black/2 px-4 py-3.5 dark:border-white/8 dark:bg-white/3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">最近一次退货</div>
              <div className="mt-2 truncate text-lg font-bold text-foreground">{returnState.latestReason || "暂无"}</div>
              <div className="mt-1 text-sm text-muted-foreground">历史退货会保留在订单详情中</div>
            </div>
          </div>

          <div className="rounded-2xl border border-black/6 bg-black/2 p-4 dark:border-white/8 dark:bg-white/3 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <ClipboardList size={13} />
                  退货商品选择
                </div>
                <p className="mt-1 text-sm text-muted-foreground">优先选择需要退回的件数，右侧输入框只保留本次退货数量。</p>
              </div>
              <div className="hidden rounded-xl border border-black/6 bg-white/70 px-3 py-2 text-right dark:border-white/8 dark:bg-white/4 md:block">
                <div className="text-[11px] text-muted-foreground">可操作商品</div>
                <div className="text-lg font-bold text-foreground">{returnState.rows.length} 种</div>
              </div>
            </div>

            <div className="space-y-3">
              {returnState.rows.map((row) => (
                (() => {
                  const selectedQuantity = Number(quantities[row.itemId] || 0);
                  const isSelected = selectedQuantity > 0;
                  return (
                <div
                  key={row.itemId}
                  className={[
                    "grid gap-2.5 rounded-xl border px-3 py-2.5 transition-colors md:grid-cols-[minmax(0,1fr)_64px_64px_64px_144px] md:items-center",
                    isSelected
                      ? "border-primary/20 bg-primary/5"
                      : "border-black/6 bg-white/70 dark:border-white/8 dark:bg-white/4",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-black/8 bg-white dark:border-white/10 dark:bg-white/6">
                          {row.image ? (
                            <Image
                              src={row.image}
                              alt={row.name}
                              fill
                              sizes="32px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                              <Package2 size={14} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold leading-5 text-foreground">{row.name}</div>
                        </div>
                      </div>
                      {isSelected ? (
                        <span className="shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                          已选中
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-muted-foreground">原数量</div>
                    <div className="mt-0.5 text-lg font-bold text-foreground">{row.originalQuantity}</div>
                  </div>
                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-muted-foreground">已退</div>
                    <div className="mt-0.5 text-lg font-bold text-amber-500 dark:text-amber-300">{row.alreadyReturned}</div>
                  </div>
                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-muted-foreground">可退</div>
                    <div className="mt-0.5 text-lg font-bold text-emerald-500 dark:text-emerald-300">{row.remainingQuantity}</div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:text-center">
                      本次退回
                    </span>
                    <div className="flex items-center rounded-xl border border-black/8 bg-white/70 dark:border-white/10 dark:bg-white/5">
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.itemId, selectedQuantity - 1, row.remainingQuantity)}
                        disabled={selectedQuantity <= 0}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-l-xl text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/8"
                        aria-label={`减少 ${row.name} 的退回数量`}
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={row.remainingQuantity}
                        value={selectedQuantity}
                        onChange={(e) => updateQuantity(row.itemId, Number(e.target.value || 0), row.remainingQuantity)}
                        className="h-10 min-w-0 flex-1 bg-transparent px-1 text-center text-sm font-semibold text-foreground outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.itemId, selectedQuantity + 1, row.remainingQuantity)}
                        disabled={selectedQuantity >= row.remainingQuantity}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-r-xl text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-white/8"
                        aria-label={`增加 ${row.name} 的退回数量`}
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </label>
                </div>
                  );
                })()
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/6 bg-black/2 p-4 dark:border-white/8 dark:bg-white/3">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  退货说明与汇总
                </div>
                <p className="text-sm text-muted-foreground">填写原因和退款金额的同时，右侧会同步显示本次退货汇总。</p>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">退货原因</span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="例如：客户退单、少件退回"
                      className="h-11 w-full rounded-xl border border-black/8 bg-white/70 px-4 text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-foreground">退款金额</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">¥</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        placeholder="0.00"
                        className="h-11 w-full rounded-xl border border-black/8 bg-white/70 pl-8 pr-4 text-foreground outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-[repeat(2,minmax(0,1fr))_minmax(0,1.1fr)]">
                  <div className="rounded-xl border border-black/6 bg-white/70 px-3 py-2.5 dark:border-white/8 dark:bg-white/4">
                    <div className="text-[11px] text-muted-foreground">退货商品种类</div>
                    <div className="mt-1 text-xl font-bold text-foreground">{selectedSkuCount}</div>
                    <div className="text-[11px] text-muted-foreground">种</div>
                  </div>
                  <div className="rounded-xl border border-black/6 bg-white/70 px-3 py-2.5 dark:border-white/8 dark:bg-white/4">
                    <div className="text-[11px] text-muted-foreground">退货总件数</div>
                    <div className="mt-1 text-xl font-bold text-foreground">{selectedCount}</div>
                    <div className="text-[11px] text-muted-foreground">件</div>
                  </div>
                  <div className="rounded-xl border border-black/6 bg-white/70 px-3 py-2.5 dark:border-white/8 dark:bg-white/4">
                    <div className="text-[11px] text-muted-foreground">本次退款金额</div>
                    <div className="mt-1 text-xl font-bold text-foreground">¥{refundAmountNumber.toFixed(2)}</div>
                    <div className="text-[11px] text-muted-foreground">实时汇总</div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-500/15 bg-amber-500/8 px-3 py-2.5 text-[12px] leading-5 text-muted-foreground dark:text-slate-300">
                提交后会自动回补库存，并把这次退款金额与退回成本一起冲回利润。
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/6 bg-white/70 px-4 py-4 backdrop-blur-md dark:border-white/8 dark:bg-slate-900/40 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="text-sm text-muted-foreground">
            本次将退回 <span className="font-bold text-foreground">{selectedCount}</span> 件商品，
            共 <span className="font-bold text-foreground">{selectedSkuCount}</span> 种
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:flex sm:items-center">
            <button
              onClick={onClose}
              className="h-11 rounded-xl border border-black/8 bg-white/85 px-4 text-sm font-medium text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 sm:h-10 sm:text-xs"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black sm:h-10 sm:text-xs"
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
