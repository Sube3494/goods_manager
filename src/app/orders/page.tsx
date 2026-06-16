"use client";

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package2,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
  TimerReset,
  Truck,
  X,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { TodayOrdersView } from "./TodayOrdersView";
import { AllOrdersView } from "./AllOrdersView";
import { PromotionCalendarModal } from "./PromotionCalendarModal";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { CreateOfflineOrderModal } from "@/components/Orders/CreateOfflineOrderModal";
import CostBackfillModal from "@/components/Orders/CostBackfillModal";
import {
  getBaseAutoPickStatusDisplay,
  isAutoPickOrderAbnormalStatus,
  isAutoPickOrderCancelledStatus,
  isAutoPickOrderCompletedStatus,
  isAutoPickOrderDeliveringStatus,
  isAutoPickOrderTerminalStatus,
} from "@/lib/autoPickOrderStatus";
import { AutoPickIntegrationConfig, AutoPickMaiyatianShop, AutoPickOrder, AutoPickOrderItem, PurchaseOrder, PurchaseOrderItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatLocalDate, formatLocalDateTime } from "@/lib/dateUtils";
import { ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD } from "@/lib/purchaseOrderTypes";

type OrderAction = "self-delivery" | "complete-delivery" | "pickup-complete" | "sync" | "outbound";
type OrdersTab = "today" | "all";

type OrderResponse = {
  items: AutoPickOrder[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filters: {
    platforms: string[];
    statuses: string[];
  };
  summary?: {
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
  };
  overview?: {
    totalCount: number;
    trueOrderCount: number;
    brushCount: number;
    cancelledCount: number;
  };
};

type LocalShopOption = {
  id: string;
  name: string;
  address: string;
  isDefault?: boolean;
};

type TimingFieldKey = keyof AutoPickIntegrationConfig["selfDeliveryTiming"];

import {
  OrderCard,
  OrderCardErrorBoundary,
  toCurrency,
  formatPercent,
  isCancelledStatus,
  isCompletedStatus,
  isTerminalStatus,
  isDeliveringStatus,
  isAbnormalStatus,
  getDeadlineDisplay,
  formatCompactDateTime,
  summarizeOrders,
  getOrderActionErrorMessage,
  getBrushSyncSkippedReasonText,
  getAutoPickSyncSkippedReasonText,
  getItemCount,
  serializeIntegrationConfig,
  serializeMaiyatianMappings,
  readIntegrationConfigResponse,
  createDefaultSelfDeliveryTiming,
  formatTimingNumber,
  getFilterDateValue,
  getPlatformBadgeMeta
} from "./OrderCard";
function MappingSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative mt-2.5">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-medium outline-none transition-all",
          "border-black/8 bg-white/90 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] hover:bg-white focus:border-primary/30 focus:ring-2 focus:ring-primary/10",
          "dark:border-white/10 dark:bg-white/4 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:hover:bg-white/6"
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {selected?.label || "暂不映射"}
        </span>
        <ChevronDown size={15} className={cn("shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-black/8 bg-white/95 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#111827]/96">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "__empty__"}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-primary/12 text-foreground"
                      : "text-foreground hover:bg-black/[0.035] dark:hover:bg-white/5"
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{option.label}</div>
                    {option.hint ? (
                      <div className={cn("mt-1 line-clamp-2 text-[11px] leading-4", active ? "text-foreground/70" : "text-muted-foreground")}>
                        {option.hint}
                      </div>
                    ) : null}
                  </div>
                  {active ? <Check size={14} className="mt-0.5 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
    >
      {icon}
      {label}
    </button>
  );
}

function IntegrationModal({
  integrationConfig,
  maiyatianShops,
  localShops,
  isFetchingMaiyatianShops,
  isTestingPlugin,
  isTestingCookie,
  modalRef,
  onClose,
  onChange,
  onFetchMaiyatianShops,
  onTestPlugin,
  onTestCookie,
}: {
  integrationConfig: AutoPickIntegrationConfig;
  maiyatianShops: AutoPickMaiyatianShop[];
  localShops: LocalShopOption[];
  isFetchingMaiyatianShops: boolean;
  isTestingPlugin: boolean;
  isTestingCookie: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onChange: (value: AutoPickIntegrationConfig) => void;
  onFetchMaiyatianShops: () => void;
  onTestPlugin: () => void;
  onTestCookie: () => void;
}) {
  const hasCookie = Boolean(integrationConfig.maiyatianCookie.trim());
  const [isEditingCookie, setIsEditingCookie] = useState(!hasCookie);
  const [showInboundApiKey, setShowInboundApiKey] = useState(false);
  const [copiedCallback, setCopiedCallback] = useState(false);
  const pillButtonClass = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/8 bg-white/85 px-3 py-2 text-[11px] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-all duration-150 hover:-translate-y-px hover:border-black/12 hover:bg-white hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 sm:min-h-9 sm:rounded-full sm:px-3 sm:py-1.5 dark:border-white/10 dark:bg-white/5 dark:text-white/92 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-white/18 dark:hover:bg-white/[0.09] dark:hover:text-white dark:hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)]";
  const localShopOptions = localShops.map((item) => ({
    value: item.name,
    label: `${item.name}${item.isDefault ? "（默认）" : ""}`,
    hint: item.address,
  }));
  const callbackBaseUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.origin;
  }, []);
  const callbackOrderUrl = callbackBaseUrl ? `${callbackBaseUrl}/api/v1/api-key/listened-orders` : "/api/v1/api-key/listened-orders";
  const showCookieEditor = !integrationConfig.maiyatianCookie.trim() || isEditingCookie;
  const timing = integrationConfig.selfDeliveryTiming;
  const timingTotalLabel = `${formatTimingNumber(timing.pickupMinutes)} + 距离 × ${formatTimingNumber(timing.minutesPerKm)} + ${formatTimingNumber(timing.riderUpstairsMinutes)}`;

  const updateTimingField = useCallback((field: TimingFieldKey, rawValue: string) => {
    const numeric = Number(rawValue);
    onChange({
      ...integrationConfig,
      selfDeliveryTiming: {
        ...integrationConfig.selfDeliveryTiming,
        [field]: Number.isFinite(numeric) ? numeric : 0,
      },
    });
  }, [integrationConfig, onChange]);

  const copyCallbackUrl = useCallback(async () => {
    if (!callbackOrderUrl || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }
    await navigator.clipboard.writeText(callbackOrderUrl);
    setCopiedCallback(true);
    window.setTimeout(() => setCopiedCallback(false), 1500);
  }, [callbackOrderUrl]);

  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-280 flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b111e]/98 sm:rounded-4xl"
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-0 pt-5 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-black/8 bg-black/3 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10 dark:bg-white/4">
              Auto Pick
            </div>
            <h2 className="mt-3 text-2xl tracking-tight text-foreground">订单对接配置</h2>
            <p className="mt-2 text-sm text-muted-foreground">脚本负责监听订单和执行动作，主系统这里只保留回调配置和门店映射。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-5 pb-5 sm:px-7 sm:pb-7">
          <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)]">
            <div className="rounded-[18px] border border-black/8 bg-black/2 p-3.5 dark:border-white/10 dark:bg-white/3 lg:col-start-1 lg:row-start-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">系统回调地址</div>
                <button
                  type="button"
                  onClick={() => void copyCallbackUrl()}
                  className={pillButtonClass}
                >
                  <CheckCheck size={12} />
                  {copiedCallback ? "已复制" : "复制"}
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-black/8 bg-white/72 px-3 py-3 dark:border-white/10 dark:bg-[#111827]">
                <div className="break-all font-mono text-xs leading-5 text-foreground">{callbackOrderUrl}</div>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">脚本里的上报地址填这里，`MYSHOP_API_KEY` 填下面的回调密钥。</p>
            </div>

            <div className="rounded-[20px] border border-black/8 bg-black/2 p-3.5 dark:border-white/10 dark:bg-white/3 sm:p-4 lg:col-start-2 lg:row-start-1">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">麦芽田 Cookie</div>
                  <p className="mt-1 text-xs text-muted-foreground">这里只用于读取麦芽田门店，方便你做门店映射。</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                  {hasCookie ? (
                    <button
                      type="button"
                      onClick={() => setIsEditingCookie((current) => !current)}
                      className={cn(pillButtonClass, "min-w-16")}
                    >
                      {showCookieEditor ? "取消" : "编辑"}
                    </button>
                  ) : null}
                  {hasCookie ? (
                    <button
                      type="button"
                      onClick={() => onChange({ ...integrationConfig, maiyatianCookie: "" })}
                      className={cn(pillButtonClass, "min-w-16")}
                    >
                      删除
                    </button>
                  ) : null}
                </div>
              </div>

              {showCookieEditor ? (
                <textarea
                  value={integrationConfig.maiyatianCookie}
                  onChange={(event) => onChange({ ...integrationConfig, maiyatianCookie: event.target.value })}
                  placeholder="粘贴麦芽田 cookie，用于读取发货门店"
                  className="mt-3 min-h-23 w-full rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#111827]"
                />
              ) : (
                <div
                  onCopy={(event) => event.preventDefault()}
                  onCut={(event) => event.preventDefault()}
                  className="mt-3 select-none rounded-xl border border-black/8 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-[#111827]"
                >
                  <div className="text-sm font-medium text-foreground">已保存 Cookie</div>
                  <div className="mt-1 text-xs text-muted-foreground">默认隐藏，当前界面不展示明文。</div>
                  <div className="mt-2 font-mono text-xs tracking-[0.18em] text-muted-foreground">
                    {"•".repeat(28)}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[18px] border border-black/8 bg-black/2 p-3.5 dark:border-white/10 dark:bg-white/3 lg:col-start-1 lg:row-start-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">脚本地址</div>
                <input
                  value={integrationConfig.pluginBaseUrl}
                  onChange={(event) => onChange({ ...integrationConfig, pluginBaseUrl: event.target.value })}
                  placeholder="例如 http://127.0.0.1:22800"
                  className="mt-3 h-11 w-full rounded-xl border border-black/8 bg-white/80 px-3 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#111827]"
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">主系统通过这个地址调用 `auto-pick` 脚本。</p>
              </div>
              <div className="mt-4 min-w-0 border-t border-black/8 pt-4 dark:border-white/10">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">回调密钥</div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 dark:border-white/10 dark:bg-[#111827]">
                  <input
                    type={showInboundApiKey ? "text" : "password"}
                    value={integrationConfig.inboundApiKey}
                    onChange={(event) => onChange({ ...integrationConfig, inboundApiKey: event.target.value })}
                    placeholder="输入或粘贴回调密钥"
                    className="h-11 w-full bg-transparent font-mono text-sm font-medium outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInboundApiKey((current) => !current)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/6"
                    title={showInboundApiKey ? "隐藏回调密钥" : "显示回调密钥"}
                  >
                    {showInboundApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">这里填写外部系统分配给你的回调密钥。脚本上报订单时会使用这个值做校验。</p>
              </div>
            </div>


            <div className="rounded-[20px] border border-black/8 bg-black/2 p-3.5 dark:border-white/10 dark:bg-white/3 sm:p-4 lg:col-start-2 lg:row-start-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">麦芽田门店绑定</div>
                  <p className="mt-1 text-xs text-muted-foreground">读取麦芽田发货门店后，在这里手动映射到系统门店。</p>
                </div>
                <button
                  type="button"
                  onClick={onFetchMaiyatianShops}
                  disabled={isFetchingMaiyatianShops}
                  className={cn(
                    pillButtonClass,
                    "min-w-22 shrink-0 self-start px-3.5 text-center leading-4",
                    "bg-white/88 dark:bg-white/5",
                    "disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-black/6 disabled:bg-black/4 disabled:text-muted-foreground disabled:shadow-none",
                    "dark:disabled:border-white/10 dark:disabled:bg-white/4 dark:disabled:text-white/45"
                  )}
                >
                  {isFetchingMaiyatianShops ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  读取门店
                </button>
              </div>

              {localShops.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-black/8 bg-white/65 px-3 py-2.5 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/3">
                  还没有读取到系统发货地址，请先去个人资料里维护地址。
                </div>
              ) : null}

              <div className="mt-3 space-y-2.5">
                {maiyatianShops.length > 0 ? maiyatianShops.map((shop) => {
                  const mapped = integrationConfig.maiyatianShopMappings.find((item) => item.maiyatianShopId === shop.id);
                  const isMappingInvalid = mapped && !localShops.some(s => s.name === mapped.localShopName);
                  return (
                    <div key={shop.id} className="rounded-2xl border border-black/8 bg-white/80 p-3 dark:border-white/10 dark:bg-white/4">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm leading-5 text-foreground">{shop.name}</div>
                              <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {shop.address}
                              </div>
                              <div className="mt-1.5 text-[11px] text-muted-foreground">
                                {shop.cityName ? `${shop.cityName} · ` : ""}ID {shop.id}
                              </div>
                            </div>
                            <span className={cn(
                              "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]",
                              isMappingInvalid
                                ? "border border-rose-500/20 bg-rose-500/12 text-rose-600 dark:text-rose-400 animate-pulse"
                                : mapped
                                ? "border border-emerald-500/20 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                                : "border border-black/8 bg-black/3 text-muted-foreground dark:border-white/10 dark:bg-white/4"
                            )}>
                              {isMappingInvalid ? "映射已失效" : mapped ? "已映射" : "待映射"}
                            </span>
                          </div>
                          {isMappingInvalid ? (
                            <div className="mt-2.5 text-[11px] text-rose-500">⚠️ 原绑定的系统门店 “{mapped.localShopName}” 已在管理中被删除或重命名！</div>
                          ) : !mapped?.localShopName ? (
                            <div className="mt-2.5 text-[11px] text-muted-foreground">还没绑定系统门店。</div>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border border-black/8 bg-black/2 p-2.5 dark:border-white/10 dark:bg-white/3">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">系统门店</div>
                          {(() => {
                            const finalOptions = [{ value: "", label: "暂不映射" }, ...localShopOptions];
                            if (mapped?.localShopName && !localShopOptions.some(opt => opt.value === mapped.localShopName)) {
                              finalOptions.push({
                                value: mapped.localShopName,
                                label: `已失效 (无此门店: ${mapped.localShopName})`,
                                hint: "原绑定的门店在系统门店管理中已不存在，请在此处重新选择一个有效门店。"
                              });
                            }
                            return (
                              <MappingSelect
                                value={mapped?.localShopName || ""}
                                options={finalOptions}
                                onChange={(localShopName) => {
                                  const nextMappings = integrationConfig.maiyatianShopMappings.filter((item) => item.maiyatianShopId !== shop.id);
                                  if (localShopName) {
                                    nextMappings.push({
                                      maiyatianShopId: shop.id,
                                      maiyatianShopName: shop.name,
                                      maiyatianShopAddress: shop.address,
                                      localShopName,
                                      cityCode: shop.cityCode || undefined,
                                      cityName: shop.cityName || undefined,
                                    });
                                  }
                                  onChange({
                                    ...integrationConfig,
                                    maiyatianShopMappings: nextMappings,
                                  });
                                }}
                              />
                            );
                          })()}
                          {isMappingInvalid ? (
                            <div className="mt-2 text-[11px] text-rose-500">请在此处重新选择一个有效的系统门店并保存。</div>
                          ) : !mapped?.localShopName ? (
                            <div className="mt-2 text-[11px] text-muted-foreground">选择后会固定这条映射。</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[18px] border border-dashed border-black/8 bg-white/60 px-4 py-5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/2">
                    读取后会在这里列出麦芽田发货门店，你可以逐条绑定到系统门店。
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[18px] border border-black/8 bg-black/2 p-3 dark:border-white/10 dark:bg-white/3 lg:col-start-1 lg:row-start-3 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">自配完成时间</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">按环节输入分钟数。</p>
                </div>
                <div className="shrink-0 rounded-full border border-black/8 bg-white/70 px-2.5 py-1 text-[10px] text-foreground dark:border-white/10 dark:bg-white/6">
                  当前公式: {timingTotalLabel}
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { key: "pickupMinutes", label: "到店取货", step: "1" },
                  { key: "minutesPerKm", label: "每公里配送", step: "0.5" },
                  { key: "riderUpstairsMinutes", label: "送达收尾", step: "1" },
                  { key: "deadlineLeadMinutes", label: "提前量", step: "1" },
                ].map((item) => (
                  <label key={item.key} className="rounded-xl border border-black/8 bg-white/78 px-3 py-2.5 dark:border-white/10 dark:bg-white/4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-foreground">{item.label}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step={item.step}
                          value={integrationConfig.selfDeliveryTiming[item.key as TimingFieldKey]}
                          onChange={(event) => updateTimingField(item.key as TimingFieldKey, event.target.value)}
                          className="h-9 w-20 rounded-lg border border-black/8 bg-white/88 px-2.5 text-sm font-medium outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#111827]"
                        />
                        <span className="text-[11px] text-muted-foreground">分钟</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                自动完成 = 当前时间 + 到店取货 + 距离 × 每公里配送 + 送达收尾；若有预计送达时间，会减去提前量后截断。
              </div>
            </div>

            <div className="rounded-[18px] border border-black/8 bg-black/2 p-3.5 dark:border-white/10 dark:bg-white/3 lg:col-start-1 lg:row-start-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">自动推送刷单佣金</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">订单自动同步刷单时，系统将采用此处设定的佣金金额。</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 dark:border-white/10 dark:bg-[#111827]">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={integrationConfig.defaultBrushCommission ?? 0}
                  onChange={(event) => onChange({ ...integrationConfig, defaultBrushCommission: parseFloat(event.target.value) || 0 })}
                  placeholder="例如 3.0"
                  className="h-11 w-full bg-transparent text-sm font-medium outline-none"
                />
                <span className="text-sm text-muted-foreground shrink-0 pr-1">元 / 单</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">同步时手动挑单的初始佣金也将默认读取该值。</p>
            </div>

            <div className="lg:col-start-1 lg:row-start-5">
              <ActionButton
                label={isTestingPlugin ? "测试中..." : "测试脚本"}
                icon={isTestingPlugin ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                onClick={() => onTestPlugin()}
                disabled={isTestingPlugin}
              />
            </div>

            <div className="lg:col-start-2 lg:row-start-5">
              <ActionButton
                label={isTestingCookie ? "测试中..." : "测试 Cookie"}
                icon={isTestingCookie ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                onClick={() => onTestCookie()}
                disabled={isTestingCookie}
              />
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}

function BrushSyncPickerModal({
  orders,
  selectedIds,
  isSubmitting,
  modalRef,
  onClose,
  onToggle,
  onSetSelected,
  onConfirm,
  integrationConfig,
  scope,
  todayDate,
}: {
  orders: AutoPickOrder[];
  selectedIds: string[];
  isSubmitting: boolean;
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onToggle: (id: string) => void;
  onSetSelected: (ids: string[]) => void;
  onConfirm: (commission: number) => void;
  integrationConfig: AutoPickIntegrationConfig;
  scope: OrdersTab;
  todayDate: string;
}) {

  const [commission, setCommission] = useState<string>(
    String(integrationConfig.defaultBrushCommission > 0 ? integrationConfig.defaultBrushCommission : 0)
  );
  const [query, setQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const platformOptions = useMemo(
    () => [
      { value: "all", label: "全部平台" },
      ...Array.from(new Set(orders.map((order) => String(order.platform || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "zh-CN"))
        .map((item) => ({ value: item, label: item })),
    ],
    [orders]
  );
  const filteredOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (selectedPlatform !== "all" && String(order.platform || "").trim() !== selectedPlatform) {
        return false;
      }

      const orderDate = getFilterDateValue(order.orderTime);
      if (startDate && (!orderDate || orderDate < startDate)) {
        return false;
      }
      if (endDate && (!orderDate || orderDate > endDate)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const haystacks = [
        String(order.dailyPlatformSequence || ""),
        order.orderNo,
        order.platform || "",
        order.matchedShopName || "",
        order.userAddress || "",
        ...order.items.map((item) => `${item.productName} ${item.productNo || ""}`),
      ];
      return haystacks.some((item) => item.toLowerCase().includes(keyword));
    });
  }, [endDate, orders, query, selectedPlatform, startDate]);
  const selectedCount = selectedIds.length;
  const visibleIds = filteredOrders.map((order) => order.id);
  const allVisibleSelected = filteredOrders.length > 0 && filteredOrders.every((order) => selectedIds.includes(order.id));
  const toggleVisibleSelection = () => {
    if (visibleIds.length === 0) {
      return;
    }

    if (allVisibleSelected) {
      onSetSelected(selectedIds.filter((id) => !visibleIds.includes(id)));
      return;
    }

    onSetSelected(Array.from(new Set([...selectedIds, ...visibleIds])));
  };

  return (
    <div className="fixed inset-0 z-100000 flex items-center justify-center px-3 py-3 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative flex h-[88dvh] w-full max-w-220 flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b111e]/98 sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-[36px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/6 px-4 py-4 dark:border-white/6 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">同步刷单</div>
            <h2 className="mt-1.5 text-xl tracking-tight text-foreground sm:mt-2 sm:text-2xl">选择要纳入刷单的订单</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground sm:mt-2 sm:text-sm">优先按流水号挑单，也可以搜订单号、店铺、地址或商品名。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4 sm:h-10 sm:w-10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-3 sm:items-center">
            <label className="flex h-11 flex-1 items-center gap-3 rounded-xl border border-black/8 bg-white px-4 focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3">
              <Search size={16} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索流水号、订单号、店铺、地址、商品"
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
            <button
              type="button"
              onClick={toggleVisibleSelection}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-3 text-xs text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 sm:px-4 sm:text-sm"
            >
              {allVisibleSelected ? "取消当前" : "全选当前"}
            </button>
            <button
              type="button"
              onClick={() => onSetSelected([])}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-3 text-xs text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 sm:px-4 sm:text-sm"
            >
              清空
            </button>
          </div>

          {scope === "all" ? (
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3 sm:gap-3">
              <CustomSelect
                value={selectedPlatform}
                onChange={setSelectedPlatform}
                options={platformOptions}
                className="h-11"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="开始日期"
                maxDate={endDate || todayDate}
                className="h-11 w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="结束日期"
                minDate={startDate || undefined}
                maxDate={todayDate}
                className="h-11 w-full"
                triggerClassName="h-full rounded-xl border border-black/8 bg-white px-4 text-sm shadow-none dark:border-white/10 dark:bg-white/3"
              />
            </div>
          ) : null}

          <div className="mt-3 rounded-2xl border border-black/8 bg-black/2 px-3.5 py-3 text-sm dark:border-white/10 dark:bg-white/3 sm:px-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground">当前可选 <span className="font-bold text-foreground">{filteredOrders.length}</span> 单</span>
              <span className="text-foreground">已选 <span className="font-bold">{selectedCount}</span> 单</span>
            </div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">只显示已完成且符合刷单同步条件的订单</div>
          </div>

          <div className="mt-3 space-y-2.5 sm:mt-4 sm:space-y-2">
            {filteredOrders.length > 0 ? filteredOrders.map((order) => {
              const selected = selectedIds.includes(order.id);
              const platformMeta = getPlatformBadgeMeta(order.platform);
              const platformLabel = String(order.platform || "").trim() || platformMeta.iconAlt;
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onToggle(order.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-[20px] border px-3.5 py-3 text-left transition-all sm:rounded-[22px] sm:px-4",
                    selected
                      ? "border-primary/25 bg-primary/8"
                      : "border-black/8 bg-white/80 hover:border-black/12 dark:border-white/10 dark:bg-white/4"
                  )}
                >
                  <span className={cn(
                    "mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-black/12 bg-white dark:border-white/12 dark:bg-white/4"
                  )}>
                    {selected ? <Check size={12} /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="inline-flex h-6 items-center rounded-full border border-black/8 bg-black/3 px-2 text-[12px] font-bold text-foreground dark:border-white/10 dark:bg-white/4 sm:h-7 sm:px-2.5 sm:text-sm">
                        流水 #{order.dailyPlatformSequence || 0}
                      </span>
                      <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full border border-black/8 bg-black/3 px-2 text-[11px] text-foreground dark:border-white/10 dark:bg-white/4 sm:h-7 sm:px-2.5 sm:text-xs">
                        <Image
                          src={platformMeta.iconSrc}
                          alt={platformMeta.iconAlt}
                          width={16}
                          height={16}
                          className="h-4 w-4 shrink-0 object-cover"
                          unoptimized
                        />
                        <span className="truncate">{platformLabel}</span>
                      </span>
                      {order.matchedShopName ? (
                        <span className="inline-flex h-6 max-w-full items-center rounded-full border border-sky-500/15 bg-sky-500/10 px-2 text-[11px] text-sky-700 dark:text-sky-400 sm:h-7 sm:px-2.5 sm:text-xs">
                          {order.matchedShopName}
                        </span>
                      ) : null}
                      {order.isMainSystemSelfDelivery ? (
                        <span className="inline-flex h-6 items-center rounded-full border border-rose-500/15 bg-rose-500/10 px-2 text-[11px] text-rose-600 dark:text-rose-400 sm:h-7 sm:px-2.5 sm:text-xs">
                          已标记刷单
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-foreground/78 sm:text-[13px]">
                      {order.items.slice(0, 2).map((item) => item.productName).join(" / ") || "暂无商品"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span>共 {getItemCount(order.items)} 件</span>
                      <span>{formatLocalDateTime(order.orderTime)}</span>
                    </div>
                  </div>
                </button>
              );
            }) : (
              <div className="rounded-[22px] border border-dashed border-black/8 bg-white/65 px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/3">
                没有找到匹配的可刷单订单。
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-black/6 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0))] dark:border-white/6 sm:px-6 sm:py-4 sm:pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">已选 <span className="font-bold text-foreground">{selectedCount}</span> 单</div>
              <div className="flex items-center gap-1.5 rounded-xl border border-black/8 bg-white/80 px-3 dark:border-white/10 dark:bg-white/5">
                <span className="text-xs text-muted-foreground shrink-0">佣金</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  className="h-9 w-20 bg-transparent text-sm font-medium outline-none text-center"
                  placeholder="0"
                />
                <span className="text-xs text-muted-foreground shrink-0">元/单</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-black/8 bg-white/85 px-4 text-sm text-foreground transition-all hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => onConfirm(parseFloat(commission) || 0)}
              disabled={selectedCount === 0 || isSubmitting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm text-background transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              同步所选
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-[30px] font-bold leading-none tracking-tight text-foreground">{value}</div>
      <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

type PromotionPlatformAmounts = {
  amountMeituan: number;
  amountJingdong: number;
  amountTaobao: number;
};

function PromotionMetricCard({
  amount,
  date,
  localShops,
  onRefresh,
}: {
  amount: number;
  date: string;
  localShops: LocalShopOption[];
  onRefresh?: () => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <div className="group relative rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 transition-all duration-300">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">推广费</div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary hover:underline cursor-pointer"
          >
            录入/编辑
          </button>
        </div>
        <div
          onClick={() => setIsModalOpen(true)}
          className="mt-2 text-[30px] font-bold leading-none tracking-tight text-foreground cursor-pointer hover:opacity-85 transition-opacity duration-200"
        >
          ¥{amount.toFixed(2)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{date} 推广费录入</p>
      </div>

      {isMounted && isModalOpen && (
        <PromotionCalendarModal
          initialDate={date}
          localShops={localShops}
          onClose={() => {
            setIsModalOpen(false);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const showGlobalErrorDOM = (msg: string) => {
      if (typeof document === "undefined" || !document.body) return;
      
      const oldEl = document.getElementById("native-global-error-popup");
      if (oldEl) oldEl.remove();

      const el = document.createElement("div");
      el.id = "native-global-error-popup";
      el.style.cssText = "position: fixed; top: 12px; left: 12px; right: 12px; z-index: 2147483647; background: #fff5f5; border: 2px solid #f87171; border-radius: 16px; padding: 16px; color: #991b1b; font-family: monospace; font-size: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); pointer-events: auto;";
      el.innerHTML = `
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
          🚨 系统致命运行错误 (原生捕获)
        </h4>
        <p style="margin: 0 0 12px 0; word-break: break-all; line-height: 1.5; background: #fee2e2; padding: 8px; border-radius: 8px;">${msg}</p>
        <button onclick="document.getElementById('native-global-error-popup').remove()" style="background: #991b1b; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">关闭提示</button>
      `;
      document.body.appendChild(el);
    };

    const handleError = (event: ErrorEvent) => {
      const errMsg = `JavaScript 错误: ${event.message} 在 ${event.filename}:${event.lineno}`;
      setPageError(errMsg);
      showGlobalErrorDOM(errMsg);
    };
    
    const handleRejection = (event: PromiseRejectionEvent) => {
      const errMsg = `未捕获的 Promise 错误: ${event.reason}`;
      setPageError(errMsg);
      showGlobalErrorDOM(errMsg);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedIntegrationRef = useRef(false);

  const [activeTab, setActiveTab] = useState<OrdersTab>("today");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const todayDate = useMemo(() => formatLocalDate(new Date()), []);

  // 数据上报接收的状态
  const [activeSummary, setActiveSummary] = useState({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
  });
  const [activeOverview, setActiveOverview] = useState({
    totalCount: 0,
    trueOrderCount: 0,
    brushCount: 0,
    cancelledCount: 0,
  });
  const [activeTotal, setActiveTotal] = useState(0);
  const [activeEligibleBrushSyncOrders, setActiveEligibleBrushSyncOrders] = useState<AutoPickOrder[]>([]);
  const [isSubComponentLoading, setIsSubComponentLoading] = useState(false);

  // 推广费相关
  const [promotionAmount, setPromotionAmount] = useState(0);
  const [promotionPlatforms, setPromotionPlatforms] = useState<PromotionPlatformAmounts>({
    amountMeituan: 0,
    amountJingdong: 0,
    amountTaobao: 0,
  });
  const [promotionDate, setPromotionDate] = useState("");

  // 同步状态
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);

  const [integrationConfig, setIntegrationConfig] = useState<AutoPickIntegrationConfig>({
    pluginBaseUrl: "",
    inboundApiKey: "",
    maiyatianCookie: "",
    maiyatianShopMappings: [],
    selfDeliveryTiming: createDefaultSelfDeliveryTiming(),
    defaultBrushCommission: 0,
  });
  const [maiyatianShops, setMaiyatianShops] = useState<AutoPickMaiyatianShop[]>([]);
  const [localShops, setLocalShops] = useState<LocalShopOption[]>([]);
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [hasUnresolvedShops, setHasUnresolvedShops] = useState(false);
  const [isBrushSyncPickerOpen, setIsBrushSyncPickerOpen] = useState(false);
  const [isTestingPlugin, setIsTestingPlugin] = useState(false);
  const [isTestingCookie, setIsTestingCookie] = useState(false);
  const [isFetchingMaiyatianShops, setIsFetchingMaiyatianShops] = useState(false);
  
  const [isCreateOfflineOpen, setIsCreateOfflineOpen] = useState(false);
  const [backfillTarget, setBackfillTarget] = useState<AutoPickOrder | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseOrder | null>(null);
  
  const [isMatchPickerOpen, setIsMatchPickerOpen] = useState(false);
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [matchEditorTarget, setMatchEditorTarget] = useState<{
    orderId: string;
    itemId: string;
    itemName: string;
    shopName: string;
    shopId: string;
    currentMatchedProductId: string;
  } | null>(null);

  const [brushSyncPool, setBrushSyncPool] = useState<AutoPickOrder[]>([]);
  const [selectedBrushOrderIds, setSelectedBrushOrderIds] = useState<string[]>([]);
  const [isBulkBrushSyncing, setIsBulkBrushSyncing] = useState(false);

  const [savedIntegrationDigest, setSavedIntegrationDigest] = useState(() => serializeIntegrationConfig({
    pluginBaseUrl: "",
    inboundApiKey: "",
    maiyatianCookie: "",
    maiyatianShopMappings: [],
    selfDeliveryTiming: createDefaultSelfDeliveryTiming(),
    defaultBrushCommission: 0,
  }));
  const [savedMappingsDigest, setSavedMappingsDigest] = useState(() => serializeMaiyatianMappings({
    maiyatianShopMappings: [],
  }));

  const triggerParentRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleDataLoad = useCallback((data: {
    summary: { receivedAmount: number; platformCommission: number; validOrderCount: number; itemCount: number; totalDeliveryFee: number };
    overview: { totalCount: number; trueOrderCount: number; brushCount: number; cancelledCount: number };
    total: number;
    eligibleBrushSyncOrders: AutoPickOrder[];
    isLoading: boolean;
    promotionDate?: string;
  }) => {
    setActiveSummary(data.summary);
    setActiveOverview(data.overview);
    setActiveTotal(data.total);
    setActiveEligibleBrushSyncOrders(data.eligibleBrushSyncOrders);
    setIsSubComponentLoading(data.isLoading);
    if (data.promotionDate) {
      setPromotionDate(data.promotionDate);
    }
  }, []);

  const fetchPromotionExpense = useCallback(async () => {
    if (!promotionDate) return;
    try {
      const res = await fetch(`/api/promotion?date=${promotionDate}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const meituan = data.amountMeituan ?? 0;
        const jingdong = data.amountJingdong ?? 0;
        const taobao = data.amountTaobao ?? 0;
        setPromotionPlatforms({ amountMeituan: meituan, amountJingdong: jingdong, amountTaobao: taobao });
        setPromotionAmount(data.amount ?? (meituan + jingdong + taobao));
      }
    } catch (error) {
      console.error("Failed to fetch promotion amount:", error);
    }
  }, [promotionDate]);

  useEffect(() => {
    fetchPromotionExpense();
  }, [fetchPromotionExpense]);

  const handleSavePromotionExpense = async (vals: PromotionPlatformAmounts) => {
    if (!promotionDate) return false;
    try {
      const res = await fetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: promotionDate,
          amountMeituan: vals.amountMeituan,
          amountJingdong: vals.amountJingdong,
          amountTaobao: vals.amountTaobao,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const meituan = data.amountMeituan ?? vals.amountMeituan;
        const jingdong = data.amountJingdong ?? vals.amountJingdong;
        const taobao = data.amountTaobao ?? vals.amountTaobao;
        setPromotionPlatforms({ amountMeituan: meituan, amountJingdong: jingdong, amountTaobao: taobao });
        setPromotionAmount(data.amount ?? (meituan + jingdong + taobao));
        showToast(`${promotionDate} 推广费已保存`, "success");
        return true;
      } else {
        showToast("保存失败，请重试", "error");
        return false;
      }
    } catch (error) {
      console.error("Failed to save promotion expense:", error);
      showToast("网络请求失败", "error");
      return false;
    }
  };

  const syncOrders = async () => {
    setIsBulkSyncing(true);
    try {
      const currentIntegrationDigest = serializeIntegrationConfig(integrationConfig);
      if (currentIntegrationDigest !== savedIntegrationDigest) {
        await saveIntegrationConfig(integrationConfig, { silent: true });
      }

      const response = await fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "date",
          date: promotionDate || todayDate,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "批量同步失败");
      }

      const syncedCount = Number(data?.synced || 0);
      const skippedCount = Number(data?.skipped || 0);
      const backfilledCount = Number(data?.backfilled || 0);
      const skippedOrders = Array.isArray(data?.skippedOrders) ? data.skippedOrders : [];
      const firstSkippedReason = skippedOrders[0] && typeof skippedOrders[0] === "object"
        ? getAutoPickSyncSkippedReasonText((skippedOrders[0] as { reason?: unknown }).reason)
        : "";
      showToast(
        backfilledCount > 0
          ? skippedCount > 0
            ? `已同步 ${syncedCount} 单，补齐 ${backfilledCount} 单，跳过 ${skippedCount} 单${firstSkippedReason ? `：${firstSkippedReason}` : ""}`
            : `已同步 ${syncedCount} 单，补齐 ${backfilledCount} 单`
          : skippedCount > 0
            ? `已同步 ${syncedCount} 单，跳过 ${skippedCount} 单${firstSkippedReason ? `：${firstSkippedReason}` : ""}`
            : `已同步 ${syncedCount} 单`,
        "success"
      );
      triggerParentRefresh();
    } catch (error) {
      console.error("Failed to sync orders:", error);
      showToast(error instanceof Error ? error.message : "批量同步失败", "error");
    } finally {
      setIsBulkSyncing(false);
    }
  };

  const openBrushSyncPicker = useCallback(() => {
    if (activeEligibleBrushSyncOrders.length === 0) {
      showToast("当前筛选范围没有可同步刷单的已完成配送单", "error");
      return;
    }
    setBrushSyncPool(activeEligibleBrushSyncOrders);
    setSelectedBrushOrderIds([]);
    setIsBrushSyncPickerOpen(true);
  }, [activeEligibleBrushSyncOrders, showToast]);

  useEffect(() => {
    if (!isIntegrationOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modalRef.current?.contains(target)) {
        setIsIntegrationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIntegrationOpen]);

  useEffect(() => {
    if (!isIntegrationOpen && !isBrushSyncPickerOpen) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isBrushSyncPickerOpen, isIntegrationOpen]);

  const fetchLocalShops = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await fetch("/api/orders/integration/local-shops", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取系统地址失败");
      }

      const nextLocalShops = Array.isArray(data?.shops)
        ? data.shops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        : [];

      setLocalShops(nextLocalShops);

      if (!options?.silent && nextLocalShops.length === 0) {
        showToast("还没有读取到系统发货地址，请先去个人资料里维护地址", "error");
      }
    } catch (error) {
      console.error("Failed to fetch local shops:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "读取系统地址失败", "error");
      }
    }
  }, [showToast]);

  const fetchIntegrationConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/orders/integration", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "加载对接配置失败");
      }

      const nextConfig = readIntegrationConfigResponse(data);
      setIntegrationConfig(nextConfig);
      setHasUnresolvedShops(Boolean(data?.hasUnresolvedShops));
      setSavedIntegrationDigest(serializeIntegrationConfig({
        pluginBaseUrl: nextConfig.pluginBaseUrl,
        inboundApiKey: nextConfig.inboundApiKey,
        maiyatianCookie: nextConfig.maiyatianCookie,
        maiyatianShopMappings: nextConfig.maiyatianShopMappings,
        selfDeliveryTiming: nextConfig.selfDeliveryTiming,
        defaultBrushCommission: nextConfig.defaultBrushCommission,
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: nextConfig.maiyatianShopMappings,
      }));
      hasLoadedIntegrationRef.current = true;
    } catch (error) {
      console.error("Failed to fetch order integration config:", error);
      showToast(error instanceof Error ? error.message : "加载对接配置失败", "error");
    }
  }, [showToast]);

  useEffect(() => {
    void fetchLocalShops({ silent: true });
    void fetchIntegrationConfig();
  }, [fetchLocalShops, fetchIntegrationConfig]);

  const fetchMaiyatianShops = useCallback(async () => {
    const cookie = integrationConfig.maiyatianCookie.trim();
    if (!cookie) {
      showToast("请先填写麦芽田 Cookie", "error");
      return;
    }

    setIsFetchingMaiyatianShops(true);
    try {
      const response = await fetch("/api/orders/integration/maiyatian-shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maiyatianCookie: cookie }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取麦芽田门店失败");
      }

      setMaiyatianShops(Array.isArray(data.shops) ? data.shops : []);
      if (Array.isArray(data.localShops)) {
        setLocalShops(
          data.localShops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        );
      }
      showToast(`已读取 ${Array.isArray(data.shops) ? data.shops.length : 0} 家麦芽田门店`, "success");
    } catch (error) {
      console.error("Failed to fetch Maiyatian shops:", error);
      showToast(error instanceof Error ? error.message : "读取麦芽田门店失败", "error");
    } finally {
      setIsFetchingMaiyatianShops(false);
    }
  }, [integrationConfig.maiyatianCookie, showToast]);

  useEffect(() => {
    if (!integrationConfig.maiyatianCookie.trim()) {
      setMaiyatianShops([]);
    }
  }, [integrationConfig.maiyatianCookie]);

  const saveIntegrationConfig = useCallback(async (
    nextConfig?: AutoPickIntegrationConfig,
    options?: { silent?: boolean }
  ) => {
    try {
      const payload = nextConfig && typeof nextConfig === "object" && !("nativeEvent" in (nextConfig as object))
        ? nextConfig
        : integrationConfig;
      const shouldRefreshOrders = serializeMaiyatianMappings(payload) !== savedMappingsDigest;
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "保存对接配置失败");
      }
      const savedConfig = readIntegrationConfigResponse(data);
      setIntegrationConfig(savedConfig);
      setHasUnresolvedShops(Boolean(data?.hasUnresolvedShops));
      setSavedIntegrationDigest(serializeIntegrationConfig({
        pluginBaseUrl: savedConfig.pluginBaseUrl,
        inboundApiKey: savedConfig.inboundApiKey,
        maiyatianCookie: savedConfig.maiyatianCookie,
        maiyatianShopMappings: savedConfig.maiyatianShopMappings,
        selfDeliveryTiming: savedConfig.selfDeliveryTiming,
        defaultBrushCommission: savedConfig.defaultBrushCommission
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: savedConfig.maiyatianShopMappings,
      }));
      if (!options?.silent) {
        showToast("自动推单对接配置已保存", "success");
      }
      if (shouldRefreshOrders) {
        triggerParentRefresh();
      }
    } catch (error) {
      console.error("Failed to save order integration config:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "保存对接配置失败", "error");
      }
    }
  }, [integrationConfig, savedMappingsDigest, showToast, triggerParentRefresh]);

  const testIntegrationConfig = async (target: "plugin" | "cookie") => {
    if (target === "plugin") {
      setIsTestingPlugin(true);
    } else {
      setIsTestingCookie(true);
    }
    try {
      const response = await fetch("/api/orders/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...integrationConfig, target }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || `${target === "plugin" ? "脚本" : "Cookie"} 测试失败`);
      }

      showToast(data.ok ? `${target === "plugin" ? "脚本" : "Cookie"} 测试通过` : `${target === "plugin" ? "脚本" : "Cookie"} 测试未通过`, data.ok ? "success" : "error");
    } catch (error) {
      console.error("Failed to test order integration config:", error);
      showToast(error instanceof Error ? error.message : `${target === "plugin" ? "脚本" : "Cookie"} 测试失败`, "error");
    } finally {
      if (target === "plugin") {
        setIsTestingPlugin(false);
      } else {
        setIsTestingCookie(false);
      }
    }
  };

  useEffect(() => {
    if (!hasLoadedIntegrationRef.current) return;
    if (!isIntegrationOpen) return;

    const currentDigest = serializeIntegrationConfig(integrationConfig);
    if (currentDigest === savedIntegrationDigest) return;

    const timer = window.setTimeout(() => {
      void saveIntegrationConfig(integrationConfig, { silent: true });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [integrationConfig, isIntegrationOpen, saveIntegrationConfig, savedIntegrationDigest]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (localShops.length > 0) return;
    void fetchLocalShops();
  }, [fetchLocalShops, isIntegrationOpen, localShops.length]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (!integrationConfig.maiyatianCookie.trim()) return;
    if (maiyatianShops.length > 0) return;
    void fetchMaiyatianShops();
  }, [fetchMaiyatianShops, integrationConfig.maiyatianCookie, isIntegrationOpen, maiyatianShops.length]);

  // 商品匹配逻辑
  const openMatchEditor = useCallback((order: AutoPickOrder, item: AutoPickOrderItem) => {
    const resolvedShopName = order.matchedShopName || "";
    const resolvedShopId = localShops.find((s) => s.name === resolvedShopName)?.id || "";
    setMatchEditorTarget({
      orderId: order.id,
      itemId: String(item.id || "").trim(),
      itemName: item.productName || "未命名商品",
      shopName: resolvedShopName,
      shopId: resolvedShopId,
      currentMatchedProductId: item.matchedProduct?.id || "",
    });
    setIsMatchPickerOpen(true);
  }, [localShops]);

  const closeMatchEditor = useCallback(() => {
    if (isSavingMatch) return;
    setIsMatchPickerOpen(false);
    setMatchEditorTarget(null);
  }, [isSavingMatch]);

  const saveManualMatch = useCallback(async (productId: string) => {
    if (!matchEditorTarget?.orderId || !matchEditorTarget.itemId) return;

    setIsSavingMatch(true);
    try {
      const response = await fetch(`/api/orders/${matchEditorTarget.orderId}/items/${matchEditorTarget.itemId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "更新商品匹配失败");
      }

      showToast("商品匹配已更新", "success");
      setIsMatchPickerOpen(false);
      setMatchEditorTarget(null);
      triggerParentRefresh();
    } catch (error) {
      console.error("Failed to save manual product match:", error);
      showToast(error instanceof Error ? error.message : "更新商品匹配失败", "error");
    } finally {
      setIsSavingMatch(false);
    }
  }, [matchEditorTarget, showToast, triggerParentRefresh]);

  // 刷单同步确认
  const syncBrushOrders = async (targetIds?: string[], commission?: number) => {
    const scopedIds = Array.isArray(targetIds) ? targetIds.filter(Boolean) : [];
    if (scopedIds.length === 0) {
      showToast("请先选择要同步刷单的订单", "error");
      return;
    }

    const sourceOrders = brushSyncPool.filter((item) => scopedIds.includes(item.id));
    const targetOrders = sourceOrders
      .map((item) => ({
        id: item.id,
        matchedShopName: item.matchedShopName || null,
      }))
      .filter((item) => item.id);
    if (targetOrders.length === 0) {
      showToast("当前筛选范围没有可同步刷单的已完成配送单", "error");
      return;
    }

    setIsBulkBrushSyncing(true);
    try {
      const response = await fetch("/api/orders/sync-brush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: targetOrders, commission: commission ?? 0 }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "批量同步刷单失败");
      }

      const syncedCount = Number(data?.synced || 0);
      const updatedCount = Number(data?.updated || 0);
      const skippedCount = Number(data?.skipped || 0);
      const skippedOrders = Array.isArray(data?.skippedOrders) ? data.skippedOrders : [];
      const skippedReasonCounts = new Map<string, number>();
      for (const item of skippedOrders) {
        const reason = item && typeof item === "object"
          ? getBrushSyncSkippedReasonText((item as { reason?: unknown }).reason)
          : "";
        if (!reason) continue;
        skippedReasonCounts.set(reason, (skippedReasonCounts.get(reason) || 0) + 1);
      }
      const skippedReasonSummary = Array.from(skippedReasonCounts.entries())
        .slice(0, 2)
        .map(([reason, count]) => `${reason} ${count} 单`)
        .join("，");

      showToast(
        skippedCount > 0
          ? `已同步 ${syncedCount} 单，已更新 ${updatedCount} 单，不符合条件 ${skippedCount} 单${skippedReasonSummary ? `（${skippedReasonSummary}）` : ""}`
          : `已同步 ${syncedCount} 单，已更新 ${updatedCount} 单`,
        "success"
      );
      setSelectedBrushOrderIds([]);
      setIsBrushSyncPickerOpen(false);
      triggerParentRefresh();
    } catch (error) {
      console.error("Failed to sync brush orders:", error);
      showToast(error instanceof Error ? error.message : "批量同步刷单失败", "error");
    } finally {
      setIsBulkBrushSyncing(false);
    }
  };

  const handleOpenBrushSync = (pool: AutoPickOrder[]) => {
    setBrushSyncPool(pool);
    setSelectedBrushOrderIds([]);
    setIsBrushSyncPickerOpen(true);
  };

  const toggleBrushSyncSelection = useCallback((orderId: string) => {
    setSelectedBrushOrderIds((current) => (
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    ));
  }, []);

  const savePurchaseDraft = useCallback(async (data: PurchaseOrder) => {
    const existingNote = String(data.note || "").trim();
    const taggedNote = existingNote.includes(ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD)
      ? existingNote
      : [ORDER_SHORTAGE_PURCHASE_NOTE_KEYWORD, existingNote].filter(Boolean).join(" | ");
    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        status: "Received",
        note: taggedNote,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "创建采购单失败");
    }
    showToast("采购单已创建并入库", "success");
    setPurchaseDraft(null);
    triggerParentRefresh();
  }, [showToast, triggerParentRefresh]);

  return (
    <div className="relative px-2 sm:px-1">
      {pageError && (
        <div className="fixed top-4 left-4 right-4 z-999999 rounded-2xl border border-rose-500 bg-rose-50 p-4 text-xs text-rose-700 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:bg-rose-950/90 dark:text-rose-200 flex items-start gap-3">
          <span className="text-base shrink-0">🚨</span>
          <div className="min-w-0 flex-1">
            <h4>页面运行出错</h4>
            <p className="mt-1 font-mono break-all leading-relaxed">{pageError}</p>
            <button onClick={() => setPageError(null)} className="mt-2 text-[10px] text-rose-900 underline hover:no-underline dark:text-rose-100">关闭提示</button>
          </div>
        </div>
      )}

      <div className="space-y-6 sm:space-y-8">
        <section className="rounded-3xl border border-black/8 bg-white/72 px-4 py-4 shadow-xs dark:border-white/10 dark:bg-white/4 sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">订单管理</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {activeTab === "today" ? "聚焦今天待处理订单" : "按时间和状态回看订单"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={syncOrders}
                  disabled={isBulkSyncing || isSubComponentLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-white disabled:opacity-50 sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                >
                  {isBulkSyncing ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                  一键同步
                </button>

                <button
                  type="button"
                  onClick={openBrushSyncPicker}
                  disabled={isBulkBrushSyncing || isSubComponentLoading}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-white disabled:opacity-50 sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                >
                  {isBulkBrushSyncing ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  同步刷单
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOfflineOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-white sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                >
                  <Plus size={15} />
                  录入线下
                </button>
                <button
                  type="button"
                  onClick={() => setIsIntegrationOpen(true)}
                  className="relative inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-white/80 px-3 py-2.5 text-sm text-foreground transition-all hover:bg-white sm:w-auto sm:px-4 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
                >
                  <Settings2 size={15} />
                  对接配置
                  {hasUnresolvedShops && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"></span>
                    </span>
                  )}
                </button>
              </div>
            </div>

            <div className="inline-flex w-full rounded-xl border border-black/8 bg-black/3 p-1 dark:border-white/10 dark:bg-white/4 sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab("today")}
                className={cn(
                  "flex-1 rounded-lg px-5 py-2.5 text-sm transition-all sm:min-w-35",
                  activeTab === "today"
                    ? "bg-foreground text-background dark:bg-white dark:text-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                今日推单
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "flex-1 rounded-lg px-5 py-2.5 text-sm transition-all sm:min-w-35",
                  activeTab === "all"
                    ? "bg-foreground text-background dark:bg-white dark:text-black"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                全部订单
              </button>
            </div>

            <div className="grid items-start gap-3 lg:grid-cols-3 xl:grid-cols-4">
              <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">总订单</div>
                    <div className="mt-2 text-[30px] font-bold leading-none tracking-tight text-foreground">{activeOverview.totalCount}</div>
                    {activeTab !== "today" && (
                      <p className="mt-2 text-xs text-muted-foreground">当前筛选共 {activeTotal} 单</p>
                    )}
                  </div>
                  <div className="flex min-w-24.5 max-w-31.5 flex-col items-stretch gap-1">
                    <div className="inline-flex items-center justify-between rounded-full border border-sky-500/18 bg-sky-500/10 px-2.5 py-1 text-[10px] text-sky-700 dark:text-sky-400">
                      <span className="truncate pr-2">真单</span>
                      <span className="shrink-0 font-bold">{activeOverview.trueOrderCount} 单</span>
                    </div>
                    <div className="inline-flex items-center justify-between rounded-full border border-rose-500/18 bg-rose-500/10 px-2.5 py-1 text-[10px] text-rose-700 dark:text-rose-400">
                      <span className="truncate pr-2">刷单</span>
                      <span className="shrink-0 font-bold">{activeOverview.brushCount} 单</span>
                    </div>
                    <div className="inline-flex items-center justify-between rounded-full border border-slate-500/18 bg-slate-500/10 px-2.5 py-1 text-[10px] text-slate-600 dark:text-slate-400">
                      <span className="truncate pr-2">取消</span>
                      <span className="shrink-0 font-bold">{activeOverview.cancelledCount} 单</span>
                    </div>
                  </div>
                </div>
              </div>
              <MetricCard
                label="商家实收"
                value={toCurrency(activeSummary.receivedAmount - promotionAmount)}
                hint={`有效订单 ${activeSummary.validOrderCount} 单`}
              />
              <MetricCard
                label="总配送费"
                value={toCurrency(activeSummary.totalDeliveryFee)}
                hint={activeTab === "today" ? "今日订单汇总" : "当前筛选汇总"}
              />
              <PromotionMetricCard
                amount={promotionAmount}
                date={promotionDate || todayDate}
                localShops={localShops}
                onRefresh={fetchPromotionExpense}
              />
            </div>
          </div>
        </section>

        {activeTab === "today" ? (
          <TodayOrdersView
            refreshTrigger={refreshTrigger}
            onOpenCostBackfill={setBackfillTarget}
            onOpenMatchEditor={openMatchEditor}
            onOpenPurchaseDraft={setPurchaseDraft}
            onDataLoad={handleDataLoad}
            localShops={localShops}
          />
        ) : (
          <AllOrdersView
            refreshTrigger={refreshTrigger}
            onOpenCostBackfill={setBackfillTarget}
            onOpenMatchEditor={openMatchEditor}
            onOpenPurchaseDraft={setPurchaseDraft}
            onDataLoad={handleDataLoad}
            localShops={localShops}
          />
        )}
      </div>

      {isIntegrationOpen
        ? createPortal(
              <IntegrationModal
                integrationConfig={integrationConfig}
                maiyatianShops={maiyatianShops}
                localShops={localShops}
                isFetchingMaiyatianShops={isFetchingMaiyatianShops}
                isTestingPlugin={isTestingPlugin}
                isTestingCookie={isTestingCookie}
                modalRef={modalRef}
                onClose={() => setIsIntegrationOpen(false)}
                onChange={setIntegrationConfig}
                onFetchMaiyatianShops={fetchMaiyatianShops}
                onTestPlugin={() => void testIntegrationConfig("plugin")}
                onTestCookie={() => void testIntegrationConfig("cookie")}
              />,
            document.body
          )
        : null}

      {isCreateOfflineOpen ? (
        <CreateOfflineOrderModal
          shopOptions={localShops}
          onClose={() => setIsCreateOfflineOpen(false)}
          onSuccess={() => triggerParentRefresh()}
        />
      ) : null}

      {purchaseDraft ? (
        <PurchaseOrderModal
          isOpen={Boolean(purchaseDraft)}
          initialData={purchaseDraft}
          onClose={() => setPurchaseDraft(null)}
          onSubmit={(data) => {
            void savePurchaseDraft(data).catch((error) => {
              console.error("Failed to create purchase draft:", error);
              showToast(error instanceof Error ? error.message : "创建采购单失败", "error");
            });
          }}
        />
      ) : null}

      {isBrushSyncPickerOpen
        ? createPortal(
            <BrushSyncPickerModal
              orders={brushSyncPool}
              selectedIds={selectedBrushOrderIds}
              isSubmitting={isBulkBrushSyncing}
              modalRef={modalRef}
              onClose={() => setIsBrushSyncPickerOpen(false)}
              onToggle={toggleBrushSyncSelection}
              onSetSelected={setSelectedBrushOrderIds}
              integrationConfig={integrationConfig}
              scope={activeTab}
              todayDate={todayDate}
              onConfirm={(commission) => void syncBrushOrders(selectedBrushOrderIds, commission)}
            />,
            document.body
          )
        : null}

      <ProductSelectionModal
        isOpen={isMatchPickerOpen}
        onClose={closeMatchEditor}
        onSelect={(products) => {
          const selectedProduct = products[0];
          const resolvedProductId = String(
            selectedProduct?.sourceProductId
            || selectedProduct?.productId
            || selectedProduct?.id
            || ""
          ).trim();
          if (!resolvedProductId) return;
          void saveManualMatch(resolvedProductId);
        }}
        selectedIds={matchEditorTarget?.currentMatchedProductId ? [matchEditorTarget.currentMatchedProductId] : []}
        singleSelect
        loadAllOnOpen
        showPlatformSelector={false}
        showCategoryFilter
        showPrice={false}
        title="修改商品匹配"
        fetchPath="/api/shop-products"
        query={{
          all: "true",
          ...(matchEditorTarget?.shopId ? { shopId: matchEditorTarget.shopId } : {}),
          ...(matchEditorTarget?.shopName ? { shopName: matchEditorTarget.shopName } : {}),
        }}
        emptyStateText={matchEditorTarget?.shopName ? `当前店铺“${matchEditorTarget.shopName}”下没有找到候选商品` : "未找到相关商品"}
      />

      {backfillTarget && (
        <CostBackfillModal
          order={backfillTarget}
          onClose={() => setBackfillTarget(null)}
          onSuccess={() => {
            setBackfillTarget(null);
            showToast("成本回填成功！净利润已重新计算", "success");
            triggerParentRefresh();
          }}
        />
      )}
    </div>
  );
}
