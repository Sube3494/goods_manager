"use client";

import { useState, useEffect, useCallback, useContext, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { X, History, Phone, Loader2 } from "lucide-react";
import { OrderListContext } from "./OrderListContext";
import type { AllOrdersViewProps } from "@/app/orders/AllOrdersView";

const HistoryOrdersView = dynamic(() => import("@/app/orders/AllOrdersView").then((module) => module.AllOrdersView), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />加载历史订单...</div>,
});
const emptyShops: AllOrdersViewProps["localShops"] = [];
const noAction = () => {};

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneTail: string;
  currentOrderNo?: string;
  currentOrderId?: string;
  shopId?: string;
  shopName?: string;
  maskedPhone?: string | null;
}

export function CustomerHistoryModal({
  isOpen, onClose, phoneTail, currentOrderId, maskedPhone,
}: CustomerHistoryModalProps) {
  const orderList = useContext(OrderListContext);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState<number | null>(null);
  const handleDataLoad = useCallback<AllOrdersViewProps["onDataLoad"]>((data) => {
    setTotal(data.isLoading ? null : data.total);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      // 编辑、照片等子弹窗自己处理 Escape，避免同时关闭底下的历史列表。
      if (!target || !dialogRef.current?.contains(target) || target.closest('[role="dialog"]') !== dialogRef.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (typeof window === "undefined" || !isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[95000] flex items-center justify-center p-2 sm:p-5">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.2, ease: "easeOut" }}
          ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="customer-history-title"
          className="relative flex h-[90dvh] w-full max-w-[1440px] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background text-foreground shadow-2xl dark:border-white/10"
          onClick={(event) => event.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><History size={20} /></div>
              <div className="min-w-0">
                <h3 id="customer-history-title" className="text-base font-bold">老客历史订单</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Phone size={12} />真实尾号 <strong className="font-mono text-foreground">{phoneTail}</strong></span>
                  {maskedPhone ? <span>{maskedPhone}</span> : null}
                  {total !== null ? <span>当前结果 <strong className="text-foreground">{total}</strong> 笔</span> : null}
                </div>
              </div>
            </div>
            <button type="button" autoFocus onClick={onClose} aria-label="关闭历史订单" title="关闭 (Esc)"
              className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X size={20} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 custom-scrollbar">
            {currentOrderId ? (
              <HistoryOrdersView
                {...(orderList || { refreshTrigger: 0, localShops: emptyShops, readOnly: true,
                  onOpenCostBackfill: noAction, onOpenMatchEditor: noAction })}
                customerHistoryOrderId={currentOrderId}
                onDataLoad={handleDataLoad}
              />
            ) : <p className="py-12 text-center text-muted-foreground">当前订单信息缺失，请关闭后重试。</p>}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <span>仅查看本店本平台该顾客的历史订单，包含刷单、取消及退款。</span>
            <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-border bg-background px-4 py-2 text-foreground transition hover:bg-muted">关闭</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>, document.body,
  );
}
