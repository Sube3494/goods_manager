"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Check, Loader2, RefreshCw, Truck } from "lucide-react";
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

type DeliveryCategory = "all" | "direct" | "shared";
type PriceSort = "asc" | "desc";
type SelectionMode = "single" | "multiple";

function getOptionKey(option: DeliveryQuoteOption) {
  return `${option.logisticId}:${option.logisticTag}:${option.servicePkg || ""}`;
}

function getOptionCategory(option: DeliveryQuoteOption): Exclude<DeliveryCategory, "all"> | "standard" {
  const servicePkg = String(option.servicePkg || "").trim().toLowerCase();
  if (servicePkg.includes("pinsong")) return "shared";
  if (servicePkg.includes("direct")) return "direct";
  return "standard";
}

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
  onDispatched: (order?: unknown, result?: { dispatchedCount: number; failedCount: number }) => void;
}) {
  const [options, setOptions] = useState<DeliveryQuoteOption[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<DeliveryCategory>("all");
  const [priceSort, setPriceSort] = useState<PriceSort>("asc");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("single");

  const selectedOptions = useMemo(
    () => options.filter((option) => selectedKeys.includes(getOptionKey(option))),
    [options, selectedKeys],
  );
  const categoryCounts = useMemo(() => options.reduce((counts, option) => {
    const optionCategory = getOptionCategory(option);
    if (optionCategory === "direct") counts.direct += 1;
    if (optionCategory === "shared") counts.shared += 1;
    return counts;
  }, { direct: 0, shared: 0 }), [options]);
  const displayedOptions = useMemo(() => options
    .filter((option) => category === "all" || getOptionCategory(option) === category)
    .toSorted((a, b) => {
      const amountDiff = Number(a.amount || 0) - Number(b.amount || 0);
      return (priceSort === "asc" ? amountDiff : -amountDiff) || a.name.localeCompare(b.name, "zh-CN");
    }), [category, options, priceSort]);

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
      setCategory("all");
      setPriceSort("asc");
      setSelectionMode("single");
      setSelectedKeys(first ? [getOptionKey(first)] : []);
      if (nextOptions.length === 0) setError("当前没有可用的第三方配送报价");
    } catch (loadError) {
      setOptions([]);
      setSelectedKeys([]);
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

  const changeCategory = (nextCategory: DeliveryCategory) => {
    setCategory(nextCategory);
    const candidates = options
      .filter((option) => nextCategory === "all" || getOptionCategory(option) === nextCategory)
      .toSorted((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
    if (selectionMode === "single" && !candidates.some((option) => selectedKeys.includes(getOptionKey(option)))) {
      setSelectedKeys(candidates[0] ? [getOptionKey(candidates[0])] : []);
    }
  };

  const changeSelectionMode = (nextMode: SelectionMode) => {
    setSelectionMode(nextMode);
    if (nextMode === "single") {
      const selectedInView = displayedOptions.find((option) => selectedKeys.includes(getOptionKey(option)));
      const nextSelected = selectedInView || displayedOptions[0] || options[0];
      setSelectedKeys(nextSelected ? [getOptionKey(nextSelected)] : []);
    }
  };

  const toggleOption = (key: string) => {
    if (selectionMode === "single") {
      setSelectedKeys([key]);
      return;
    }
    setSelectedKeys((current) => current.includes(key)
      ? current.filter((selectedKey) => selectedKey !== key)
      : [...current, key]);
  };

  const submit = async () => {
    if (selectedOptions.length === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/dispatch-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logisticId: selectedOptions[0].logisticId,
          logisticTag: selectedOptions[0].logisticTag,
          servicePkg: selectedOptions[0].servicePkg || "",
          selections: selectedOptions.map((option) => ({
            logisticId: option.logisticId,
            logisticTag: option.logisticTag,
            servicePkg: option.servicePkg || "",
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data.error || data.message || data.parsed?.message || data.text;
        throw new Error(detail || "呼叫配送失败");
      }
      onDispatched(data.order, {
        dispatchedCount: Math.max(1, Number(data.dispatchedCount || 1)),
        failedCount: Math.max(0, Number(data.failedCount || 0)),
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "呼叫配送失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[88vh] sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-black/8 px-5 py-4 text-left dark:border-white/10">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Truck size={18} /></span>
            呼叫配送
          </DialogTitle>
          <DialogDescription>订单 {orderNo} · 报价为麦芽田实时价格，确认时会再次校验。</DialogDescription>
          <div className="mt-1 flex w-fit items-center gap-1 rounded-xl bg-black/[0.035] p-1 dark:bg-white/[0.05]" aria-label="发单模式">
            {([[
              "single",
              "单选发单",
            ], [
              "multiple",
              "多选抢单",
            ]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSelectionMode(value)}
                className={cn(
                  "h-8 rounded-lg px-3 text-xs font-medium transition",
                  selectionMode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-5">
          {loading ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Loader2 size={24} className="animate-spin text-primary" />
              正在向配送平台询价…
            </div>
          ) : options.length > 0 ? (
            <div className="grid gap-3">
              <div className="sticky -top-4 z-10 -mx-1 flex flex-wrap items-center gap-2 bg-popover/95 px-1 py-2 backdrop-blur-sm">
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-black/[0.035] p-1 dark:bg-white/[0.05]">
                  {([
                    ["all", `全部 ${options.length}`],
                    ["direct", `专人 ${categoryCounts.direct}`],
                    ["shared", `拼单 ${categoryCounts.shared}`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={value !== "all" && categoryCounts[value] === 0}
                      onClick={() => changeCategory(value)}
                      className={cn(
                        "h-8 flex-1 rounded-lg px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35",
                        category === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPriceSort((current) => current === "asc" ? "desc" : "asc")}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-black/8 px-3 text-xs font-medium text-foreground transition hover:bg-black/4 dark:border-white/10 dark:hover:bg-white/5"
                  aria-label={priceSort === "asc" ? "当前价格从低到高，点击切换为从高到低" : "当前价格从高到低，点击切换为从低到高"}
                >
                  <ArrowDownUp size={13} />
                  {priceSort === "asc" ? "低价优先" : "高价优先"}
                </button>
              </div>
              <div className="grid gap-2">
              {displayedOptions.map((option) => {
                const key = getOptionKey(option);
                const active = selectedKeys.includes(key);
                const optionCategory = getOptionCategory(option);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleOption(key)}
                    aria-pressed={active}
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
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground">{option.name}</span>
                        {optionCategory === "direct" ? <span className="shrink-0 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">专人</span> : null}
                        {optionCategory === "shared" ? <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">拼单</span> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {Number(option.distance || 0) > 0 ? `配送距离 ${Number(option.distance).toFixed(1)} 公里` : "实时配送报价"}
                      </span>
                    </span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-foreground">¥{(Number(option.amount || 0) / 100).toFixed(2)}</span>
                  </button>
                );
              })}
              </div>
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

        <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-black/8 px-5 py-4 dark:border-white/10">
          <button type="button" disabled={submitting} onClick={() => onOpenChange(false)} className="h-10 rounded-xl border border-black/10 px-4 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5">取消</button>
          <button type="button" disabled={selectedOptions.length === 0 || submitting || loading} onClick={() => void submit()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Truck size={15} />}
            {submitting
              ? selectionMode === "multiple" ? `正在呼叫 ${selectedOptions.length} 家` : "正在发单"
              : selectionMode === "multiple"
                ? selectedOptions.length > 0 ? `确认呼叫 ${selectedOptions.length} 家` : "选择配送"
                : selectedOptions[0] ? `确认 ¥${(selectedOptions[0].amount / 100).toFixed(2)}` : "选择配送"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
