"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCent, Boxes, ClipboardList, Minus, Plus, RotateCcw, Undo2, X } from "lucide-react";
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
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 lg:pl-(--sidebar-width)">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl overflow-hidden rounded-[30px] border border-white/10 bg-[#111621]/95 shadow-2xl">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_58%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_52%)] pointer-events-none" />

        <div className="relative flex items-start justify-between border-b border-white/8 px-7 py-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/12 bg-amber-400/8 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-amber-200">
              <Undo2 size={12} />
              RETURN FLOW
            </div>
            <h2 className="mt-3 text-[30px] font-black leading-none text-white">部分退货入库</h2>
            <p className="mt-2 text-sm text-slate-400">
              选择本单要退回的商品数量，库存会自动回补，利润会按退款金额和退回成本一起冲回。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 p-2.5 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-7 py-6">
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_1fr]">
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">出库单</div>
              <div className="mt-2 text-xl font-black tracking-wide text-white">{order.id.slice(-8).toUpperCase()}</div>
              <div className="mt-1 text-sm text-slate-400">本次退货会自动生成关联退货入库单</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">当前状态</div>
              <div className="mt-2 text-lg font-bold text-white">
                {order.status === "PartialReturned" ? "部分退回" : order.status === "Returned" ? "已全部退回" : "正常"}
              </div>
              <div className="mt-1 text-sm text-slate-400">继续退回不会覆盖之前记录</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">最近一次退货</div>
              <div className="mt-2 truncate text-lg font-bold text-white">{returnState.latestReason || "暂无"}</div>
              <div className="mt-1 text-sm text-slate-400">历史退货会保留在订单详情中</div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <ClipboardList size={13} />
                  退货商品选择
                </div>
                <p className="mt-1 text-sm text-slate-400">优先选择需要退回的件数，右侧输入框只保留本次退货数量。</p>
              </div>
              <div className="hidden rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-right md:block">
                <div className="text-[11px] text-slate-500">可操作商品</div>
                <div className="text-lg font-bold text-white">{returnState.rows.length} 种</div>
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
                    "grid gap-3 rounded-2xl border p-4 transition-all duration-200 md:grid-cols-[minmax(0,1fr)_96px_96px_96px_168px] md:items-center",
                    isSelected
                      ? "border-emerald-400/22 bg-linear-to-r from-emerald-400/[0.10] via-[#151b27] to-[#151b27] shadow-[0_0_0_1px_rgba(74,222,128,0.06)]"
                      : "border-white/8 bg-[#151b27]/85",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[15px] font-semibold leading-6 text-white">{row.name}</div>
                      {isSelected ? (
                        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/[0.12] px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                          已选中
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                      <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-slate-300">
                        原数量 {row.originalQuantity}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-amber-400/12 bg-amber-400/[0.08] px-2.5 py-1 text-amber-200">
                        已退 {row.alreadyReturned}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-emerald-400/12 bg-emerald-400/[0.08] px-2.5 py-1 text-emerald-200">
                        可退 {row.remainingQuantity}
                      </span>
                    </div>
                  </div>

                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-slate-500">原数量</div>
                    <div className="mt-1 text-xl font-bold text-white">{row.originalQuantity}</div>
                  </div>
                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-slate-500">已退</div>
                    <div className="mt-1 text-xl font-bold text-amber-300">{row.alreadyReturned}</div>
                  </div>
                  <div className="hidden text-center md:block">
                    <div className="text-[11px] text-slate-500">可退</div>
                    <div className="mt-1 text-xl font-bold text-emerald-300">{row.remainingQuantity}</div>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:text-center">
                      本次退回
                    </span>
                    <div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.05]">
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.itemId, selectedQuantity - 1, row.remainingQuantity)}
                        disabled={selectedQuantity <= 0}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-l-2xl text-slate-300 transition hover:bg-white/6 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`减少 ${row.name} 的退回数量`}
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={row.remainingQuantity}
                        value={selectedQuantity}
                        onChange={(e) => updateQuantity(row.itemId, Number(e.target.value || 0), row.remainingQuantity)}
                        className="h-12 min-w-0 flex-1 bg-transparent px-1 text-center text-lg font-bold text-white outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(row.itemId, selectedQuantity + 1, row.remainingQuantity)}
                        disabled={selectedQuantity >= row.remainingQuantity}
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-r-2xl text-slate-300 transition hover:bg-white/6 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`增加 ${row.name} 的退回数量`}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </label>
                </div>
                  );
                })()
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="rounded-[26px] border border-white/8 bg-white/[0.03] p-5">
              <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <Boxes size={13} />
                退货说明
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-200">退货原因</span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例如：客户退单、少件退回"
                    className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition focus:border-white/30"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-200">退款金额</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">¥</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] pl-8 pr-4 text-white outline-none transition focus:border-white/30"
                    />
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-[26px] border border-white/8 bg-linear-to-br from-white/[0.05] to-white/[0.02] p-5">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <BadgeCent size={13} />
                本次汇总
              </div>
              <div className="mt-4 rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_65%)] p-4">
                <div className="rounded-[22px] border border-emerald-400/12 bg-linear-to-br from-emerald-400/[0.10] to-emerald-400/[0.03] px-4 py-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">退货执行概览</div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/8 bg-black/12 px-3 py-3">
                      <div className="text-[11px] text-slate-400">退货商品种类</div>
                      <div className="mt-1 text-2xl font-black text-white">{selectedSkuCount}</div>
                      <div className="text-[11px] text-slate-500">种</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-black/12 px-3 py-3">
                      <div className="text-[11px] text-slate-400">退货总件数</div>
                      <div className="mt-1 text-2xl font-black text-white">{selectedCount}</div>
                      <div className="text-[11px] text-slate-500">件</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/8 bg-black/12 px-3 py-3">
                    <div className="text-[11px] text-slate-400">本次退款金额</div>
                    <div className="mt-1 text-3xl font-black tracking-tight text-white">
                      ¥{refundAmountNumber.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-amber-400/10 bg-amber-400/[0.05] px-4 py-3 text-[13px] leading-6 text-slate-300">
                  提交后会自动回补库存，并把这次退款金额与退回成本一起冲回利润。
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/8 px-7 py-5 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-400">
            本次将退回 <span className="font-bold text-white">{selectedCount}</span> 件商品，
            共 <span className="font-bold text-white">{selectedSkuCount}</span> 种
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw size={14} />
              {isSubmitting ? "处理中..." : "确认退货入库"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
