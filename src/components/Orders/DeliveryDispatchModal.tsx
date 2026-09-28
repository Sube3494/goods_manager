"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  Award,
  Check,
  CheckCheck,
  Clock,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
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
  provider?: "maiyitian" | "shansong";
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
  return `${option.provider || "maiyitian"}:${option.logisticId}:${option.logisticTag}:${option.servicePkg || ""}`;
}

function getOptionCategory(option: DeliveryQuoteOption): Exclude<DeliveryCategory, "all"> | "standard" {
  const servicePkg = String(option.servicePkg || "").trim().toLowerCase();
  if (servicePkg.includes("pinsong") || servicePkg.includes("拼")) return "shared";
  if (servicePkg.includes("direct") || servicePkg.includes("专")) return "direct";
  return "standard";
}

interface BrandTheme {
  shortName: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  avatarBg: string;
  avatarText: string;
}

function getBrandTheme(option: DeliveryQuoteOption): BrandTheme {
  const name = option.name || "";
  const tag = (option.logisticTag || "").toLowerCase();

  if (name.includes("顺丰") || tag.includes("sf") || tag.includes("shunfeng")) {
    return {
      shortName: "顺丰",
      badgeBg: "bg-rose-500/10 dark:bg-rose-500/20",
      badgeText: "text-rose-600 dark:text-rose-400",
      badgeBorder: "border-rose-500/20",
      avatarBg: "bg-gradient-to-br from-zinc-800 to-zinc-950 text-white shadow-sm",
      avatarText: "text-white font-bold",
    };
  }
  if (name.includes("美团") || tag.includes("meituan") || tag.includes("mt")) {
    return {
      shortName: "美团",
      badgeBg: "bg-amber-500/10 dark:bg-amber-500/20",
      badgeText: "text-amber-700 dark:text-amber-400",
      badgeBorder: "border-amber-500/20",
      avatarBg: "bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 shadow-sm",
      avatarText: "text-amber-950 font-black",
    };
  }
  if (name.includes("蜂鸟") || name.includes("饿了么") || tag.includes("eleme") || tag.includes("fengniao")) {
    return {
      shortName: "蜂鸟",
      badgeBg: "bg-sky-500/10 dark:bg-sky-500/20",
      badgeText: "text-sky-600 dark:text-sky-400",
      badgeBorder: "border-sky-500/20",
      avatarBg: "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sm",
      avatarText: "text-white font-bold",
    };
  }
  if (name.includes("达达") || tag.includes("dada")) {
    return {
      shortName: "达达",
      badgeBg: "bg-red-500/10 dark:bg-red-500/20",
      badgeText: "text-red-600 dark:text-red-400",
      badgeBorder: "border-red-500/20",
      avatarBg: "bg-gradient-to-br from-red-500 to-orange-600 text-white shadow-sm",
      avatarText: "text-white font-bold",
    };
  }
  if (name.includes("闪送") || tag.includes("shansong")) {
    return {
      shortName: "闪送",
      badgeBg: "bg-blue-500/10 dark:bg-blue-500/20",
      badgeText: "text-blue-600 dark:text-blue-400",
      badgeBorder: "border-blue-500/20",
      avatarBg: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm",
      avatarText: "text-white font-bold",
    };
  }
  if (name.includes("UU") || name.includes("uu") || tag.includes("uu")) {
    return {
      shortName: "UU",
      badgeBg: "bg-orange-500/10 dark:bg-orange-500/20",
      badgeText: "text-orange-600 dark:text-orange-400",
      badgeBorder: "border-orange-500/20",
      avatarBg: "bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm",
      avatarText: "text-white font-bold",
    };
  }

  return {
    shortName: (option.name || "运力").slice(0, 2),
    badgeBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-500/20",
    avatarBg: "bg-gradient-to-br from-primary/80 to-primary text-primary-foreground shadow-sm",
    avatarText: "text-primary-foreground font-semibold",
  };
}

function formatEstimatedTime(time?: number) {
  if (!time || time <= 0) return null;
  if (time > 1000000000) {
    const date = new Date(time > 100000000000 ? time : time * 1000);
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    return `约 ${h}:${m} 送达`;
  }
  return `约 ${time} 分钟送达`;
}

function formatDeliveryError(rawError: unknown): string {
  if (!rawError) return "呼叫配送失败，请稍后重试";
  const message = rawError instanceof Error ? rawError.message : String(rawError);
  if (message.includes("picking-not-completed")) {
    return "该订单尚未拣货出库，请先完成订单拣货后再呼叫配送";
  }
  if (message.includes("delivery-option-not-found")) {
    return "所选配送运力已在配送平台下线或失效，请点击刷新重新获取报价";
  }
  if (message.includes("delivery-quote-failed")) {
    return "向配送平台获取实时运费报价失败，请检查运力余额或稍后重试";
  }
  if (message.includes("missing cookie") || message.includes("missing token") || message.includes("9191")) {
    return "麦芽田账号登录已过期或未配置 Cookie，请在订单设置中重新授权";
  }
  if (message.includes("余额不足") || message.includes("8100")) {
    return "所选运力平台账户余额不足，请先在麦芽田充值配送余额";
  }
  return message;
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

  const minPrice = useMemo(() => {
    if (options.length === 0) return 0;
    return Math.min(...options.map((o) => Number(o.amount || 0)));
  }, [options]);

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

  // 计算多选模式下的金额区间
  const priceRange = useMemo(() => {
    if (selectedOptions.length === 0) return null;
    const amounts = selectedOptions.map((o) => Number(o.amount || 0) / 100);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    return { min, max, isSame: min === max };
  }, [selectedOptions]);

  const loadOptions = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/delivery-options`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || data.message || "获取配送报价失败");
      const nextOptions = Array.isArray(data.options) ? data.options as DeliveryQuoteOption[] : [];
      setOptions(nextOptions);
      setCategory("all");
      setPriceSort("asc");
      setSelectionMode("single");

      // 默认选中最低价那一家
      if (nextOptions.length > 0) {
        const sorted = [...nextOptions].sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0));
        setSelectedKeys([getOptionKey(sorted[0])]);
      } else {
        setSelectedKeys([]);
        setError("当前配送区域暂无可用第三方运力报价");
      }
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
    } else {
      const selectedMaiyitian = options.filter((option) => option.provider !== "shansong" && selectedKeys.includes(getOptionKey(option)));
      const fallback = options
        .filter((option) => option.provider !== "shansong")
        .toSorted((a, b) => Number(a.amount || 0) - Number(b.amount || 0))[0];
      setSelectedKeys((selectedMaiyitian.length ? selectedMaiyitian : fallback ? [fallback] : []).map(getOptionKey));
    }
  };

  const toggleOption = (key: string) => {
    const target = options.find((option) => getOptionKey(option) === key);
    if (target?.provider === "shansong") {
      setSelectionMode("single");
      setSelectedKeys([key]);
      return;
    }
    if (selectionMode === "single") {
      setSelectedKeys([key]);
      return;
    }
    setSelectedKeys((current) => {
      const withoutShansong = current.filter((selectedKey) => {
        const option = options.find((item) => getOptionKey(item) === selectedKey);
        return option?.provider !== "shansong";
      });
      return withoutShansong.includes(key)
        ? withoutShansong.filter((selectedKey) => selectedKey !== key)
        : [...withoutShansong, key];
    });
  };

  // 快捷操作：多选全选当前显示
  const selectAllDisplayed = () => {
    const displayedKeys = displayedOptions.filter((option) => option.provider !== "shansong").map(getOptionKey);
    const allSelected = displayedKeys.every((key) => selectedKeys.includes(key));
    if (allSelected) {
      setSelectedKeys((current) => current.filter((key) => !displayedKeys.includes(key)));
    } else {
      setSelectedKeys((current) => Array.from(new Set([...current, ...displayedKeys])));
    }
  };

  // 快捷操作：多选推荐最划算前三家
  const selectTopThreeCheapest = () => {
    const topThree = [...options]
      .filter((option) => option.provider !== "shansong")
      .sort((a, b) => Number(a.amount || 0) - Number(b.amount || 0))
      .slice(0, 3)
      .map(getOptionKey);
    setSelectedKeys(topThree);
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
            provider: option.provider || "maiyitian",
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
      console.error("呼叫配送失败:", submitError);
      setError(formatDeliveryError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden rounded-2xl border border-black/10 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:max-h-[88vh] sm:max-w-xl dark:border-white/10 dark:bg-card/95">
        {/* 头部美化 */}
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-black/8 px-6 pt-5 pb-4 text-left dark:border-white/10">
          <div className="absolute top-0 right-0 -z-10 h-32 w-48 translate-x-12 -translate-y-8 rounded-full bg-gradient-to-br from-primary/10 via-primary/5 to-transparent blur-2xl" />

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary shadow-inner ring-1 ring-primary/20">
                <Truck size={22} className="stroke-[2.2]" />
              </div>
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
                  呼叫第三方配送
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    麦芽田 + 闪送实时比价
                  </span>
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs text-muted-foreground">
                  订单号 <span className="font-mono font-medium text-foreground">{orderNo}</span>
                  <span className="mx-1.5 opacity-40">·</span>
                  发单时各运力将按实时价格扣费
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* 模式切换胶囊卡片 */}
          <div className="mt-3.5 flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-1 ring-1 ring-black/[0.04] dark:bg-muted/40 dark:ring-white/[0.05]">
            <div className="grid flex-1 grid-cols-2 gap-1" role="tablist" aria-label="发单模式">
              <button
                type="button"
                role="tab"
                aria-selected={selectionMode === "single"}
                onClick={() => { changeSelectionMode("single"); setError(""); }}
                className={cn(
                  "relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all duration-200",
                  selectionMode === "single"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:bg-background dark:ring-white/10"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Zap size={13} className={selectionMode === "single" ? "text-amber-500" : ""} />
                单选发单
                <span className="text-[10px] font-normal text-muted-foreground">精确指定</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={selectionMode === "multiple"}
                onClick={() => { changeSelectionMode("multiple"); setError(""); }}
                className={cn(
                  "relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all duration-200",
                  selectionMode === "multiple"
                    ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:bg-background dark:ring-white/10"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Layers size={13} className={selectionMode === "multiple" ? "text-primary" : ""} />
                多选抢单
                <span className="rounded bg-primary/10 px-1 py-0.2 text-[10px] font-bold text-primary">推荐·接单更快</span>
              </button>
            </div>
          </div>

          {/* 顶部醒目错误告警横幅（发单失败时立即在此处展示，绝不沉底） */}
          {error && options.length > 0 ? (
            <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive animate-in fade-in duration-200">
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-0.5 inline-block shrink-0 rounded-full bg-destructive/20 p-0.5">
                  <span className="block h-2 w-2 rounded-full bg-destructive animate-ping" />
                </span>
                <div className="min-w-0">
                  <span className="font-bold">发单失败提示：</span>
                  <span className="break-all">{error}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setError("")}
                className="shrink-0 rounded-lg p-1 text-destructive/70 hover:bg-destructive/15 hover:text-destructive"
                title="关闭提示"
              >
                ✕
              </button>
            </div>
          ) : null}
        </DialogHeader>

        {/* 筛选与选项列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 [scrollbar-gutter:stable] sm:px-6">
          {loading ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-center gap-2 py-4 text-xs font-medium text-muted-foreground">
                <Loader2 size={16} className="animate-spin text-primary" />
                正在向麦芽田运力与闪送个人账号实时询价…
              </div>
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex animate-pulse items-center gap-3.5 rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]"
                >
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-3 w-40 rounded bg-muted/60" />
                  </div>
                  <div className="h-6 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : options.length > 0 ? (
            <div className="space-y-2.5">
              {/* 吸顶控制条 */}
              <div className="sticky -top-3 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 bg-background/90 px-1 py-2 backdrop-blur-md dark:bg-card/90">
                {/* 分类切换 */}
                <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-0.5 dark:bg-muted/30">
                  {([
                    ["all", "全部", options.length],
                    ["direct", "专人", categoryCounts.direct],
                    ["shared", "拼单", categoryCounts.shared],
                  ] as const).map(([value, label, count]) => {
                    const isDisabled = value !== "all" && count === 0;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => changeCategory(value)}
                        className={cn(
                          "flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-35",
                          category === value
                            ? "bg-background text-foreground shadow-xs ring-1 ring-black/5 dark:bg-background dark:ring-white/10"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                        <span className={cn(
                          "rounded-full px-1 text-[10px]",
                          category === value ? "bg-muted font-bold text-foreground" : "opacity-60",
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* 辅助工具：排序与多选快捷键 */}
                <div className="flex items-center gap-1.5">
                  {selectionMode === "multiple" ? (
                    <>
                      <button
                        type="button"
                        onClick={selectTopThreeCheapest}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/8 px-2 text-[11px] font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
                        title="快速勾选价格最低的前三家运力"
                      >
                        <Sparkles size={11} className="text-amber-500" />
                        推荐前3
                      </button>
                      <button
                        type="button"
                        onClick={selectAllDisplayed}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/8 px-2 text-[11px] font-medium text-muted-foreground hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
                      >
                        <CheckCheck size={12} />
                        {displayedOptions.every((opt) => selectedKeys.includes(getOptionKey(opt))) ? "反选" : "全选"}
                      </button>
                    </>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setPriceSort((current) => current === "asc" ? "desc" : "asc")}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/8 px-2 text-xs font-medium text-muted-foreground transition hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
                    title={priceSort === "asc" ? "当前价格由低到高，点击切换" : "当前价格由高到低，点击切换"}
                  >
                    <ArrowDownUp size={11} />
                    {priceSort === "asc" ? "低价优先" : "高价优先"}
                  </button>
                </div>
              </div>

              {/* 运力选项卡片列表 */}
              <div className="grid gap-2 pt-0.5 pb-2">
                {displayedOptions.map((option) => {
                  const key = getOptionKey(option);
                  const active = selectedKeys.includes(key);
                  const optionCategory = getOptionCategory(option);
                  const brand = getBrandTheme(option);
                  const isLowest = minPrice > 0 && Number(option.amount || 0) === minPrice;
                  const estimatedTimeText = formatEstimatedTime(option.estimatedDeliveryTime);

                  return (
                    <div
                      key={key}
                      onClick={() => toggleOption(key)}
                      role="checkbox"
                      aria-checked={active}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          toggleOption(key);
                        }
                      }}
                      className={cn(
                        "group relative flex cursor-pointer select-none items-center gap-3.5 rounded-2xl border p-3.5 transition-all duration-150",
                        active
                          ? "border-primary/40 bg-primary/[0.04] shadow-xs ring-1 ring-primary/20 dark:border-primary/50 dark:bg-primary/[0.08]"
                          : "border-black/7 bg-background/60 hover:border-black/15 hover:bg-black/[0.015] dark:border-white/8 dark:bg-card/40 dark:hover:border-white/15 dark:hover:bg-white/[0.025]",
                      )}
                    >
                      {/* 选择状态指示器 (单选 Radio / 多选 Checkbox) */}
                      <div className="flex shrink-0 items-center justify-center">
                        {selectionMode === "single" ? (
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full border transition-all",
                              active
                                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                : "border-black/20 bg-background dark:border-white/20 dark:bg-card",
                            )}
                          >
                            {active && <div className="h-2 w-2 rounded-full bg-white dark:bg-primary-foreground" />}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-md border transition-all",
                              active
                                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                : "border-black/20 bg-background dark:border-white/20 dark:bg-card",
                            )}
                          >
                            <Check size={13} className={cn("stroke-[2.5]", active ? "block" : "hidden")} />
                          </div>
                        )}
                      </div>

                      {/* 品牌 Avatar */}
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs tracking-wider",
                          brand.avatarBg,
                          brand.avatarText,
                        )}
                      >
                        {brand.shortName}
                      </div>

                      {/* 运力主要信息 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-foreground">
                            {option.name}
                          </span>
                          {option.provider === "shansong" ? (
                            <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                              个人账号直连
                            </span>
                          ) : null}

                          {/* 专人 / 拼单标签 */}
                          {optionCategory === "direct" && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                              <Zap size={9} />
                              专送
                            </span>
                          )}
                          {optionCategory === "shared" && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                              拼单
                            </span>
                          )}

                          {/* 最低价超值推荐 */}
                          {isLowest && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
                              <Award size={10} />
                              最省
                            </span>
                          )}
                        </div>

                        {/* 辅助时效及距离 */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {Number(option.distance || 0) > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11} className="opacity-70" />
                              距离 {Number(option.distance).toFixed(1)} km
                            </span>
                          ) : null}

                          {estimatedTimeText ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} className="opacity-70" />
                              {estimatedTimeText}
                            </span>
                          ) : (
                            <span className="opacity-75">即刻就近派单</span>
                          )}
                        </div>
                      </div>

                      {/* 价格展示 */}
                      <div className="shrink-0 text-right">
                        <div className="flex items-baseline justify-end gap-0.5">
                          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">¥</span>
                          <span className="font-mono text-lg font-black tracking-tight text-rose-600 dark:text-rose-400">
                            {(Number(option.amount || 0) / 100).toFixed(2)}
                          </span>
                        </div>
                        {isLowest && (
                          <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            全场最低
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center gap-3.5 rounded-2xl border border-dashed border-black/10 p-6 text-center text-muted-foreground dark:border-white/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                <Truck size={24} className="stroke-[1.5]" />
              </div>
              <div className="max-w-xs space-y-1">
                <p className="text-sm font-semibold text-foreground">暂无可用的第三方运力报价</p>
                <p className="text-xs text-muted-foreground">
                  {error || "请确认配送区域是否支持，或检查外卖平台配置"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadOptions()}
                className="mt-1 inline-flex items-center gap-1.5 rounded-xl border border-black/10 bg-background px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition hover:bg-black/5 dark:border-white/10 dark:bg-card dark:hover:bg-white/5"
              >
                <RefreshCw size={13} />
                重新查询报价
              </button>
            </div>
          )}

          {/* 底部沉底错误提示已由顶部横幅与底栏统一接管 */}
        </div>

        {/* 底部结算与发单栏 */}
        <DialogFooter className="mx-0 mb-0 shrink-0 border-t border-black/8 bg-muted/20 px-6 py-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-muted/10">
          {/* 左侧说明与费用概览 */}
          <div className="hidden min-w-0 flex-1 sm:block">
            {error ? (
              <div className="space-y-0.5 animate-in fade-in duration-150">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  发单未成功，请查看上方提示或重试
                </div>
                <div className="text-[11px] text-muted-foreground truncate max-w-sm" title={error}>
                  {error}
                </div>
              </div>
            ) : selectionMode === "multiple" ? (
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-foreground">
                  已选 <span className="font-bold text-primary">{selectedOptions.length}</span> 家运力同时抢单
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {priceRange ? (
                    priceRange.isSame ? (
                      <>运费统一为 <span className="font-semibold text-foreground">¥{priceRange.min.toFixed(2)}</span></>
                    ) : (
                      <>
                        预计运费{" "}
                        <span className="font-semibold text-foreground">
                          ¥{priceRange.min.toFixed(2)} ~ ¥{priceRange.max.toFixed(2)}
                        </span>
                        （以首位接单平台为准）
                      </>
                    )
                  ) : (
                    "请至少勾选一家运力"
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-foreground">
                  {selectedOptions[0] ? (
                    <>
                      已选 <span className="font-semibold text-primary">{selectedOptions[0].name}</span>
                    </>
                  ) : (
                    "请选择一家运力发单"
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {selectedOptions[0] ? (
                    <>
                      预估运费{" "}
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        ¥{(Number(selectedOptions[0].amount || 0) / 100).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    "确认后将向选定平台直接指派"
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 右侧操作按钮 */}
          <div className="flex w-full items-center justify-end gap-2.5 sm:w-auto">
            <button
              type="button"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl border border-black/10 bg-background px-4 text-xs font-semibold text-muted-foreground transition hover:bg-black/5 hover:text-foreground disabled:opacity-50 dark:border-white/10 dark:bg-card dark:hover:bg-white/5"
            >
              取消
            </button>

            <button
              type="button"
              disabled={selectedOptions.length === 0 || submitting || loading}
              onClick={() => void submit()}
              className={cn(
                "relative inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl px-5 text-xs font-bold transition-all duration-200",
                "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg active:scale-[0.98]",
                "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>
                    {selectionMode === "multiple"
                      ? `正在呼叫 ${selectedOptions.length} 家…`
                      : "正在指派发单…"}
                  </span>
                </>
              ) : (
                <>
                  {selectionMode === "multiple" ? <Layers size={14} /> : <Truck size={14} />}
                  <span>
                    {selectionMode === "multiple"
                      ? selectedOptions.length > 0
                        ? `呼叫 ${selectedOptions.length} 家抢单`
                        : "请勾选运力"
                      : selectedOptions[0]
                        ? `确认叫配送 · ¥${(selectedOptions[0].amount / 100).toFixed(2)}`
                        : "请选择运力"}
                  </span>
                </>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
