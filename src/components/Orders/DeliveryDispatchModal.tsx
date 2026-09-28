"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw, Truck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type DeliveryQuoteOption = {
  logisticId: string;
  logisticTag: string;
  name: string;
  servicePkg?: string;
  amount: number;
  distance?: number;
  estimatedDeliveryTime?: number;
};

export function DeliveryDispatchModal({
  orderId,
  orderNo,
  open,
  onOpenChange,
  onDispatched,
}: {
  orderId: string;
  orderNo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDispatched: (order?: unknown) => void;
}) {
  const [options, setOptions] = useState<DeliveryQuoteOption[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = useMemo(
    () => options.find((option) => `${option.logisticId}:${option.logisticTag}:${option.servicePkg || ""}` === selectedKey),
    [options, selectedKey],
  );

  const loadOptions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery-options`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || "获取配送报价失败");
      const nextOptions = Array.isArray(data.options) ? data.options as DeliveryQuoteOption[] : [];
      setOptions(nextOptions);
      const first = nextOptions[0];
      setSelectedKey(first ? `${first.logisticId}:${first.logisticTag}:${first.servicePkg || ""}` : "");
      if (nextOptions.length === 0) setError("当前没有可用的第三方配送报价");
    } catch (loadError) {
      setOptions([]);
      setSelectedKey("");
      setError(loadError instanceof Error ? loadError.message : "获取配送报价失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadOptions();
    // 每次打开都需要获取实时价格。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/dispatch-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logisticId: selected.logisticId,
          logisticTag: selected.logisticTag,
          servicePkg: selected.servicePkg || "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data.error || data.message || data.parsed?.message || data.text;
        throw new Error(detail || "呼叫配送失败");
      }
      onDispatched(data.order);
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "呼叫配送失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-black/8 px-5 py-4 text-left dark:border-white/10">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Truck size={18} /></span>
            呼叫配送
          </DialogTitle>
          <DialogDescription>订单 {orderNo} · 报价为麦芽田实时价格，确认时会再次校验。</DialogDescription>
        </DialogHeader>

        <div className="min-h-52 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              正在向配送平台询价…
            </div>
          ) : options.length > 0 ? (
            <div className="grid gap-2">
              {options.map((option) => {
                const key = `${option.logisticId}:${option.logisticTag}:${option.servicePkg || ""}`;
                const active = key === selectedKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      active
                        ? "border-primary/40 bg-primary/8 shadow-sm"
                        : "border-black/8 bg-black/[0.018] hover:border-primary/25 hover:bg-primary/[0.035] dark:border-white/10 dark:bg-white/[0.025]",
                    )}
                  >
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", active ? "border-primary bg-primary text-primary-foreground" : "border-black/10 text-transparent dark:border-white/15")}>
                      <Check size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{option.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {Number(option.distance || 0) > 0 ? `配送距离 ${Number(option.distance).toFixed(1)} 公里` : "实时配送报价"}
                      </span>
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-foreground">¥{(Number(option.amount || 0) / 100).toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
              <p>{error || "当前没有可用的第三方配送报价"}</p>
              <button type="button" onClick={() => void loadOptions()} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-foreground hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
                <RefreshCw size={13} />重新询价
              </button>
            </div>
          )}
          {error && options.length > 0 ? <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t border-black/8 px-5 py-4 dark:border-white/10">
          <button type="button" disabled={submitting} onClick={() => onOpenChange(false)} className="h-10 rounded-xl border border-black/10 px-4 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5">取消</button>
          <button type="button" disabled={!selected || submitting || loading} onClick={() => void submit()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
            {submitting ? "正在发单" : selected ? `确认 ¥${(selected.amount / 100).toFixed(2)}` : "选择配送"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
