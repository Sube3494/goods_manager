"use client";

import { useEffect, useMemo, useState } from "react";
import { X, RotateCcw } from "lucide-react";
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
      <div className="relative w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#111621]/95 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-white">部分退货入库</h2>
            <p className="mt-1 text-sm text-slate-400">
              选择本单要退回的商品数量，库存会自动回补，利润会按退款金额和退回成本一起冲回。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
            <span>出库单：{order.id.slice(-8).toUpperCase()}</span>
            <span>状态：{order.status === "PartialReturned" ? "部分退回" : order.status === "Returned" ? "已全部退回" : "正常"}</span>
            {returnState.latestReason && <span>最近一次原因：{returnState.latestReason}</span>}
          </div>

          <div className="rounded-2xl border border-white/8 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.04] text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left">商品</th>
                  <th className="px-4 py-3 text-center">原数量</th>
                  <th className="px-4 py-3 text-center">已退</th>
                  <th className="px-4 py-3 text-center">可退</th>
                  <th className="px-4 py-3 text-center">本次退回</th>
                </tr>
              </thead>
              <tbody>
                {returnState.rows.map((row) => (
                  <tr key={row.itemId} className="border-t border-white/6 text-slate-100">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-center">{row.originalQuantity}</td>
                    <td className="px-4 py-3 text-center text-amber-300">{row.alreadyReturned}</td>
                    <td className="px-4 py-3 text-center text-emerald-300">{row.remainingQuantity}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={row.remainingQuantity}
                        value={quantities[row.itemId] ?? 0}
                        onChange={(e) => {
                          const nextValue = Math.max(0, Math.min(row.remainingQuantity, Number(e.target.value || 0)));
                          setQuantities((current) => ({ ...current, [row.itemId]: nextValue }));
                        }}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-center text-white outline-none transition focus:border-white/30"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <input
                type="number"
                min={0}
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0.00"
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-white outline-none transition focus:border-white/30"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/8 px-6 py-5">
          <div className="text-sm text-slate-400">
            本次将退回 <span className="font-bold text-white">{selectedCount}</span> 件商品
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
