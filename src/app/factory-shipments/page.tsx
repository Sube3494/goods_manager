"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  memo,
  type ReactNode,
} from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronDown,
  Check,
  ClipboardList,
  Copy,
  FileText,
  ListOrdered,
  Package,
  Plus,
  Search,
  Truck,
  Wallet,
  X,
  Eye,
  Trash2,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { OutboundOrder, Product } from "@/lib/types";
import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  buildFactoryShipmentNote,
  cn,
  copyToClipboard,
  parseFactoryShipmentNote,
  type FactoryShipmentNotePayload,
  type FactoryShipmentTrackingEntry,
  type FactoryShipmentCompensationItem,
} from "@/lib/utils";
import { pinyinMatch } from "@/lib/pinyin";

interface SelectedShipmentItem {
  productId?: string | null;
  productVariantId?: string | null;
  shopProductId?: string;
  shopProductVariantId?: string | null;
  name: string;
  sku: string;
  quantity: number;
  image: string;
  stock: number;
  trackingNumber?: string;
  logisticsName?: string;
  price?: number;
  shippingFee?: number;
}

function getLooseProductVariantLabel(product: Product | null | undefined) {
  const candidate = product as (Product & { variantName?: string | null; optionSummary?: string | null }) | null | undefined;
  return String(candidate?.variantName || candidate?.optionSummary || "").trim();
}

function buildShipmentItemDisplayName(product: Product) {
  const rawName = String(product.name || "").trim();
  const parts = rawName.split(" / ").map((part) => part.trim()).filter(Boolean);
  const variantLabel = getLooseProductVariantLabel(product);
  if ((parts.length > 1) || !variantLabel) {
    return rawName;
  }
  return [rawName, variantLabel].filter(Boolean).join(" / ");
}

function parseSafeDate(dateInput: Date | string | null | undefined): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  const str = String(dateInput).trim();
  if (str.endsWith('Z')) {
    return new Date(str.slice(0, -1));
  }
  return new Date(str);
}

type CustomerAddressOption = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  address?: string;
};

function formatCustomerAddressLine(customer: CustomerAddressOption) {
  return [customer.contactName, customer.contactPhone, customer.address].filter(Boolean).join(" ");
}

function CustomerAddressCombobox({
  value,
  onChange,
  onSelectCustomer,
  placeholder,
  className,
  wrapperClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomer?: (customer: CustomerAddressOption | null) => void;
  placeholder: string;
  className?: string;
  wrapperClassName?: string;
}) {
  const [customers, setCustomers] = useState<CustomerAddressOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isOpen || hasLoaded) return;

    let cancelled = false;
    fetch("/api/customers")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (!cancelled) {
          setCustomers(Array.isArray(data) ? data : []);
          setHasLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomers([]);
          setHasLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasLoaded, isOpen]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim();
    const list = query
      ? customers.filter((customer) =>
          [customer.contactName, customer.contactPhone, customer.address]
            .some((part) => pinyinMatch(String(part || ""), query))
        )
      : customers;
    return list.slice(0, 8);
  }, [customers, searchQuery]);

  return (
    <div className={cn("relative", wrapperClassName)}>
      <input
        type="text"
        value={value}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(e) => {
          const nextValue = e.target.value;
          onChange(nextValue);
          setSearchQuery(nextValue);
          setIsOpen(true);
        }}
        placeholder={placeholder}
        className={cn(className, "truncate pr-[72px]")}
      />
      <div className="absolute inset-y-0 right-3 flex items-center gap-0.5 bg-transparent">
        {value ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              onSelectCustomer?.(null);
              setSearchQuery("");
              setIsOpen(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:text-rose-500"
            title="清空客户地址"
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setSearchQuery("");
            setIsOpen((prev) => !prev);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:text-foreground"
          title="选择客户"
        >
          <ChevronDown size={15} className={cn("transition-transform", isOpen && "rotate-180")} />
        </button>
      </div>
      {isOpen && filteredCustomers.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-border bg-white/98 p-1.5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#202733]/98 dark:shadow-black/35">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(formatCustomerAddressLine(customer));
                onSelectCustomer?.(customer);
                setSearchQuery("");
                setIsOpen(false);
              }}
              className="flex w-full flex-col gap-1 rounded-xl bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-100 dark:bg-white/[0.035] dark:hover:bg-white/[0.07]"
            >
              <div className="flex items-center gap-2 text-sm font-black text-foreground">
                <span>{customer.contactName || "未命名客户"}</span>
                {customer.contactPhone ? <span className="font-mono text-xs text-muted-foreground">{customer.contactPhone}</span> : null}
              </div>
              <div className="line-clamp-1 text-xs text-muted-foreground">{customer.address || "未填写地址"}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ShipmentItemRow = memo(({
  item,
  isBatchMode,
  isChecked,
  onToggle,
  onRemove,
  onUpdateManualQuantity,
  onUpdatePrice,
  onUpdateShippingFee,
  getItemKey,
  showTrackingInput = false,
  showShippingFee = true,
  onUpdateTrackingNumber,
  onUpdateLogisticsName,
  onCopyItem,
  disabled = false,
  logisticsOptions = [],
  onAddNewLogistics,
}: {
  item: SelectedShipmentItem;
  isBatchMode: boolean;
  isChecked: boolean;
  onToggle: (key: string) => void;
  onRemove: (key: string) => void;
  onUpdateManualQuantity: (key: string, val: string) => void;
  onUpdatePrice?: (key: string, val: string) => void;
  onUpdateShippingFee?: (key: string, val: string) => void;
  getItemKey: (item: SelectedShipmentItem) => string;
  showTrackingInput?: boolean;
  showShippingFee?: boolean;
  onUpdateTrackingNumber?: (key: string, val: string) => void;
  onUpdateLogisticsName?: (key: string, val: string) => void;
  onCopyItem?: (item: SelectedShipmentItem) => void;
  disabled?: boolean;
  logisticsOptions?: { value: string; label: string }[];
  onAddNewLogistics?: () => void;
}) => {
  const itemKey = getItemKey(item) || getStableShipmentActionKey(item);
  const { baseName, variantLabel } = splitShipmentDisplayName(item.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingDelete) {
      onRemove(itemKey);
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 2500);
    }
  }, [confirmingDelete, itemKey, onRemove]);

  const qty = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const shippingFee = Number(item.shippingFee) || 0;
  const totalPrice = qty * price + shippingFee;
  const isLogisticsSelected = hasSelectedLogisticsName(item.logisticsName);
  const valueGridClass = showShippingFee
    ? "grid w-full grid-cols-[minmax(0,1fr)_72px] gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_76px_92px_86px] md:grid-cols-[minmax(180px,1fr)_78px_minmax(120px,0.8fr)_minmax(112px,0.75fr)_108px_24px] md:grid-rows-[auto_36px] md:gap-x-2.5 md:gap-y-1 lg:grid-cols-[minmax(220px,1fr)_88px_156px_136px_112px_28px] lg:gap-x-3"
    : "grid w-full grid-cols-[minmax(0,1fr)_72px] gap-2 min-[390px]:grid-cols-[minmax(0,1fr)_76px_92px_86px] md:grid-cols-[minmax(180px,1fr)_78px_minmax(120px,0.8fr)_108px_24px] md:grid-rows-[auto_36px] md:gap-x-2.5 md:gap-y-1 lg:grid-cols-[minmax(220px,1fr)_88px_156px_112px_28px] lg:gap-x-3";
  const trackingValueGridClass = showShippingFee
    ? "grid w-full grid-cols-[58px_minmax(0,1.45fr)_76px] gap-2 min-[430px]:grid-cols-[58px_minmax(0,1.45fr)_76px_96px_68px] md:grid-cols-[58px_minmax(120px,1.45fr)_92px_112px_80px] md:items-end"
    : "grid w-full grid-cols-[58px_minmax(0,1.45fr)_76px] gap-2 min-[430px]:grid-cols-[58px_minmax(0,1.45fr)_96px_68px] md:grid-cols-[58px_minmax(120px,1.45fr)_112px_80px] md:items-end";

  return (
    <div
      onClick={isBatchMode ? () => onToggle(itemKey) : undefined}
      className={cn(
        "group relative flex flex-col gap-2.5 md:gap-2 rounded-2xl border border-border/70 bg-linear-to-br from-white to-slate-50/70 p-3 md:p-2.5 shadow-sm transition-all cursor-pointer dark:border-white/8 dark:from-white/10 dark:to-white/[0.06]",
        isBatchMode && isChecked
          ? "bg-rose-500/5 border-rose-500/30 dark:bg-rose-500/10 dark:border-rose-500/20"
          : "hover:border-primary/20 hover:shadow-[0_16px_40px_-28px_rgba(59,130,246,0.45)]"
      )}
    >
      {showTrackingInput ? (
        <>
          {/* 移动端排版 (仅在 md 以下可见) */}
          <div
            className="flex w-full flex-col gap-2 md:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid w-full grid-cols-2 gap-2.5">
              <div className="col-span-2 flex min-w-0 flex-col gap-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">商品</div>
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
                    {item.image ? (
                      <Image src={item.image} alt={item.name} width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package size={16} className="text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div title={item.name} className="line-clamp-1 text-[13px] font-bold leading-tight text-foreground">{baseName}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {variantLabel ? (
                        <span className="inline-flex h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-bold text-primary">
                          {variantLabel}
                        </span>
                      ) : null}
                      <span className="inline-flex h-5 items-center rounded-full border border-cyan-400/25 bg-cyan-400/12 px-2 text-[10px] font-black text-cyan-700 shadow-[0_0_18px_rgba(34,211,238,0.12)] dark:text-cyan-200">
                        库存 {item.stock}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-1 flex min-w-0 flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">物流公司</span>
                <CustomSelect
                  options={logisticsOptions}
                  value={item.logisticsName || ""}
                  onChange={(val) => onUpdateLogisticsName?.(itemKey, val)}
                  placeholder="物流公司"
                  disabled={disabled}
                  searchable
                  triggerClassName="h-9 w-full rounded-xl border border-border bg-white text-xs dark:border-white/10 dark:bg-[#2b313d]"
                  onAddNew={onAddNewLogistics}
                  addNewLabel="去新增"
                />
              </div>

              <div className="col-span-1 flex min-w-0 flex-col gap-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">快递单号</span>
                <input
                  type="text"
                  disabled={disabled || !isLogisticsSelected}
                  value={item.trackingNumber || ""}
                  onChange={(e) => onUpdateTrackingNumber?.(itemKey, e.target.value)}
                  placeholder={isLogisticsSelected ? "多个单号用逗号分隔" : "请先选择物流公司"}
                  className="h-9 w-full rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-[#2b313d] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className={trackingValueGridClass}>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">数量</span>
                <input
                  type="number"
                  min="1"
                  disabled={disabled}
                  value={item.quantity || ""}
                  onChange={(e) => onUpdateManualQuantity(itemKey, e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-white px-2 py-1 text-center font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">单价 (￥)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">￥</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={disabled}
                    value={item.price ?? ""}
                    onChange={(e) => onUpdatePrice?.(itemKey, e.target.value)}
                    className="h-9 w-full rounded-xl border border-border bg-white pl-7 pr-3 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {showShippingFee ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">运费 (￥)</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">￥</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={disabled}
                      value={item.shippingFee ?? ""}
                      onChange={(e) => onUpdateShippingFee?.(itemKey, e.target.value)}
                      className="h-9 w-full rounded-xl border border-border bg-white pl-7 pr-3 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ) : null}

              <div className="col-span-2 flex flex-col gap-1 min-[430px]:col-span-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">小计</span>
                <div className="flex h-9 min-w-0 items-center justify-end rounded-xl border border-border/50 bg-background/70 px-2.5 text-right dark:border-white/8 dark:bg-white/4">
                  <div className="overflow-x-auto scrollbar-none whitespace-nowrap font-mono text-[15px] font-black leading-none text-foreground">￥{totalPrice.toFixed(2)}</div>
                </div>
              </div>

              <div className="relative flex h-9 items-end justify-end gap-1 self-end">
                {isBatchMode ? (
                  <div
                    className={cn(
                      "mb-2 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all",
                      isChecked ? "bg-rose-500 border-rose-500 text-white" : "border-border dark:border-white/20"
                    )}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>
                ) : (
                  <>
                    {onCopyItem ? (
                      <button
                        type="button"
                        onClick={() => onCopyItem(item)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                        title="复制此货品"
                      >
                        <Copy size={15} className="shrink-0" />
                      </button>
                    ) : null}
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 flex-nowrap",
                          confirmingDelete
                            ? "w-14 bg-rose-500 px-2 text-white shadow-sm"
                            : "w-9 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                        )}
                        title="移除项目"
                      >
                        {confirmingDelete ? <span className="text-[10px] font-bold whitespace-nowrap">确认</span> : <X size={16} className="shrink-0" />}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* PC 端排版 (仅在 md 及以上可见) */}
          <div
            className="hidden w-full flex-col gap-2 md:flex"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 上面一行：商品、数量、单价、操作 */}
            <div className="grid w-full grid-cols-[minmax(150px,1.8fr)_minmax(70px,0.7fr)_minmax(90px,1.1fr)_80px] items-center gap-2.5">
              {/* 商品信息 */}
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
                  {item.image ? (
                    <Image src={item.image} alt={item.name} width={48} height={48} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package size={16} className="text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div title={item.name} className="line-clamp-1 text-[13px] font-bold leading-tight text-foreground">{baseName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {variantLabel ? (
                      <span className="inline-flex h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-bold text-primary">
                        {variantLabel}
                      </span>
                    ) : null}
                    <span className="inline-flex h-5 items-center rounded-full border border-cyan-400/25 bg-cyan-400/12 px-2 text-[10px] font-black text-cyan-700 shadow-[0_0_18px_rgba(34,211,238,0.12)] dark:text-cyan-200">
                      库存 {item.stock}
                    </span>
                  </div>
                </div>
              </div>

              {/* 数量 */}
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">数量</span>
                <input
                  type="number"
                  min="1"
                  disabled={disabled}
                  value={item.quantity || ""}
                  onChange={(e) => onUpdateManualQuantity(itemKey, e.target.value)}
                  placeholder="0"
                  className="h-9 w-full rounded-xl border border-border bg-white pl-9 pr-1.5 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {/* 单价 */}
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">单价 ￥</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={disabled}
                  value={item.price ?? ""}
                  onChange={(e) => onUpdatePrice?.(itemKey, e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-white pl-10 pr-2 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="0.00"
                />
              </div>

              {/* 操作 */}
              <div className="relative flex h-9 items-center justify-end gap-1">
                {isBatchMode ? (
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all",
                      isChecked ? "bg-rose-500 border-rose-500 text-white" : "border-border dark:border-white/20"
                    )}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>
                ) : (
                  <>
                    {onCopyItem ? (
                      <button
                        type="button"
                        onClick={() => onCopyItem(item)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                        title="复制此货品"
                      >
                        <Copy size={15} className="shrink-0" />
                      </button>
                    ) : null}
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 flex-nowrap",
                          confirmingDelete
                            ? "w-14 bg-rose-500 px-2 text-white shadow-sm"
                            : "w-9 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                        )}
                        title="移除项目"
                      >
                        {confirmingDelete ? <span className="text-[10px] font-bold whitespace-nowrap">确认</span> : <X size={16} className="shrink-0" />}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* 下面一行：物流、快递单号、小计 */}
            <div className={cn(
              "grid w-full items-center gap-2.5",
              showShippingFee
                ? "grid-cols-[130px_minmax(150px,1.8fr)_minmax(85px,0.9fr)_minmax(105px,1.1fr)]"
                : "grid-cols-[130px_minmax(180px,1.9fr)_minmax(120px,1fr)]"
            )}>
              {/* 物流公司 */}
              <CustomSelect
                options={logisticsOptions}
                value={item.logisticsName || ""}
                onChange={(val) => onUpdateLogisticsName?.(itemKey, val)}
                placeholder="物流公司"
                disabled={disabled}
                searchable
                triggerClassName="h-9 w-full rounded-xl border border-border bg-white text-xs dark:border-white/10 dark:bg-[#2b313d]"
                onAddNew={onAddNewLogistics}
                addNewLabel="去新增"
              />

              {/* 快递单号 */}
              <input
                type="text"
                disabled={disabled || !isLogisticsSelected}
                value={item.trackingNumber || ""}
                onChange={(e) => onUpdateTrackingNumber?.(itemKey, e.target.value)}
                placeholder={isLogisticsSelected ? "多个单号用逗号分隔" : "请先选择物流公司"}
                className="h-9 w-full rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-[#2b313d] disabled:cursor-not-allowed disabled:opacity-50"
              />

              {showShippingFee ? (
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">运费 ￥</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={disabled}
                    value={item.shippingFee ?? ""}
                    onChange={(e) => onUpdateShippingFee?.(itemKey, e.target.value)}
                    className="h-9 w-full rounded-xl border border-border bg-white pl-10 pr-2 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="0.00"
                  />
                </div>
              ) : null}

              {/* 小计 */}
              <div className="flex h-9 min-w-0 items-center justify-between rounded-xl border border-border/50 bg-background/70 px-2.5 dark:border-white/8 dark:bg-white/4">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">小计</span>
                <div className="overflow-x-auto scrollbar-none whitespace-nowrap font-mono text-[13px] font-black leading-none text-foreground">￥{totalPrice.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            className="flex w-full flex-col gap-3 md:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm">
                  {item.image ? (
                    <Image src={item.image} alt={item.name} width={48} height={48} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package size={16} className="text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div title={item.name} className="line-clamp-1 text-[13px] font-bold leading-tight text-foreground">{baseName}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {variantLabel ? (
                      <span className="inline-flex h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-black text-primary">
                        {variantLabel}
                      </span>
                    ) : null}
                    <span className="inline-flex h-5 items-center rounded-full border border-cyan-400/25 bg-cyan-400/12 px-2 text-[10px] font-black text-cyan-700 shadow-[0_0_18px_rgba(34,211,238,0.12)] dark:text-cyan-200">
                      库存 {item.stock}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end">
                {isBatchMode ? (
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all",
                      isChecked ? "bg-rose-500 border-rose-500 text-white" : "border-border dark:border-white/20"
                    )}
                  >
                    {isChecked && <Check size={11} strokeWidth={3} />}
                  </div>
                ) : (
                  <>
                    {onCopyItem ? (
                      <button
                        type="button"
                        onClick={() => onCopyItem(item)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-95"
                        title="复制此货品"
                      >
                        <Copy size={15} className="shrink-0" />
                      </button>
                    ) : null}
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className={cn(
                          "inline-flex h-9 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 flex-nowrap",
                          confirmingDelete
                            ? "w-14 bg-rose-500 px-2 text-white shadow-sm"
                            : "w-9 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500"
                        )}
                        title="移除项目"
                      >
                        {confirmingDelete ? <span className="text-[10px] font-bold whitespace-nowrap">确认</span> : <X size={16} className="shrink-0" />}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">数量</span>
                <input
                  type="number"
                  min="1"
                  disabled={disabled}
                  value={item.quantity || ""}
                  onChange={(e) => onUpdateManualQuantity(itemKey, e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-white px-2 py-1 text-center font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">单价 (￥)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">￥</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={disabled}
                    value={item.price ?? ""}
                    onChange={(e) => onUpdatePrice?.(itemKey, e.target.value)}
                    className="h-9 w-full rounded-xl border border-border bg-white pl-7 pr-3 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">小计</span>
                <div className="flex h-9 min-w-0 items-center justify-end rounded-xl border border-border/50 bg-background/70 px-2.5 text-right dark:border-white/8 dark:bg-white/[0.04]">
                  <div className="truncate text-[14px] font-black leading-none text-foreground">￥{totalPrice.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(valueGridClass, "hidden md:grid")}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="hidden text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:flex md:items-end">商品</span>
            <span className="hidden text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:flex md:items-end">数量</span>
            <span className="hidden text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:flex md:items-end">单价 (￥)</span>
            {showShippingFee ? (
              <span className="hidden text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:flex md:items-end">运费 (￥)</span>
            ) : null}
            <span className="hidden justify-end text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:flex md:items-end">小计</span>
            <div className="hidden md:block" />

            <div className="flex min-w-0 items-center gap-2.5 lg:gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-background shadow-sm lg:h-11 lg:w-11">
                {item.image ? (
                  <Image src={item.image} alt={item.name} width={48} height={48} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package size={16} className="text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-[13px] font-bold leading-tight text-foreground lg:text-[14px]">{baseName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {variantLabel ? (
                    <span className="inline-flex h-5 items-center rounded-full border border-primary/20 bg-primary/10 px-2 text-[10px] font-black text-primary">
                      {variantLabel}
                    </span>
                  ) : null}
                  <span className="inline-flex h-5 items-center rounded-full border border-cyan-400/25 bg-cyan-400/12 px-2 text-[10px] font-black text-cyan-700 shadow-[0_0_18px_rgba(34,211,238,0.12)] dark:text-cyan-200">
                    库存 {item.stock}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 md:gap-0">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:hidden">数量</span>
              <input
                type="number"
                min="1"
                disabled={disabled}
                value={item.quantity || ""}
                onChange={(e) => onUpdateManualQuantity(itemKey, e.target.value)}
                className="h-9 w-full rounded-xl border border-border bg-white px-2 py-1 text-center font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1 md:gap-0">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:hidden">单价 (￥)</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">￥</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={disabled}
                  value={item.price ?? ""}
                  onChange={(e) => onUpdatePrice?.(itemKey, e.target.value)}
                  className="h-9 w-full rounded-xl border border-border bg-white pl-7 pr-3 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="0.00"
                />
              </div>
            </div>

            {showShippingFee ? (
              <div className="flex flex-col gap-1 md:gap-0">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider md:hidden">运费 (￥)</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">￥</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={disabled}
                    value={item.shippingFee ?? ""}
                    onChange={(e) => onUpdateShippingFee?.(itemKey, e.target.value)}
                    className="h-9 w-full rounded-xl border border-border bg-white pl-7 pr-3 py-1 text-right font-mono text-sm font-bold placeholder:font-normal text-foreground outline-none ring-1 ring-transparent transition-all focus:ring-2 focus:ring-primary/20 no-spinner dark:border-white/10 dark:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="0.00"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex h-9 min-w-0 items-center justify-end rounded-xl border border-border/50 bg-background/70 px-3 text-right dark:border-white/8 dark:bg-white/[0.04]">
              <div className="truncate text-[16px] font-black leading-none text-foreground">￥{totalPrice.toFixed(2)}</div>
            </div>

            <div className="flex h-9 items-center justify-center">
              {isBatchMode ? (
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all",
                    isChecked ? "bg-rose-500 border-rose-500 text-white" : "border-border dark:border-white/20"
                  )}
                >
                  {isChecked && <Check size={11} strokeWidth={3} />}
                </div>
              ) : (
                !disabled ? (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl px-2 transition-all active:scale-95 flex-nowrap",
                      confirmingDelete
                        ? "bg-rose-500 text-white shadow-sm min-w-[52px]"
                        : "text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 min-w-[32px] sm:opacity-0 group-hover:opacity-100"
                    )}
                    title="移除项目"
                  >
                    <X size={16} className="shrink-0" />
                    {confirmingDelete && <span className="text-[10px] font-bold whitespace-nowrap">确认</span>}
                  </button>
                ) : null
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});
ShipmentItemRow.displayName = "ShipmentItemRow";

interface ShipmentFormState {
  date: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  status: string;
  paymentStatus: string;
  compensationStatus: string;
  remark: string;
}

const shippingStatusOptions = [
  { value: "待发货", label: "待发货" },
  { value: "部分发货", label: "部分发货" },
  { value: "已发货", label: "已发货" },
];

const paymentStatusOptions = [
  { value: "未支付", label: "未支付" },
  { value: "部分支付", label: "部分支付" },
  { value: "已支付", label: "已支付" },
];

const compensationStatusOptions = [
  { value: "待补偿", label: "待补偿" },
  { value: "已补偿", label: "已补偿" },
];

function createInitialForm(): ShipmentFormState {
  return {
    date: format(new Date(), "yyyy-MM-dd"),
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    status: "待发货",
    paymentStatus: "未支付",
    compensationStatus: "",
    remark: "",
  };
}

const recipientPhoneRegex = /1[3-9]\d{9}/;
const addressKeywordRegex = /(省|自治区|特别行政区|市|区|县|镇|乡|街道|大道|路|街|巷|弄|号|栋|幢|单元|室|楼|层|园|苑|大厦|广场|公寓|小区|花园|村|宿舍|仓|收货|收件)/;

function isLikelyRecipientName(value: string) {
  const text = value.trim();
  if (!text || text.length > 12) return false;
  if (recipientPhoneRegex.test(text) || /\d/.test(text)) return false;
  if (addressKeywordRegex.test(text)) return false;
  return /^[\u4e00-\u9fa5·]{1,12}$/.test(text);
}

function isLikelyRecipientAddress(value: string) {
  const text = value.trim();
  if (!text) return false;
  if (addressKeywordRegex.test(text)) return true;
  return /[\d一二三四五六七八九十]/.test(text) && text.length >= 6;
}

function hasSelectedLogisticsName(logisticsName?: string | null) {
  const value = String(logisticsName || "").trim();
  return Boolean(value) && value !== "选择物流公司";
}

function parseQuickAddressInput(input: string) {
  const normalizedInput = input || "";

  // 匹配并提取时间，支持常见的订单时间格式（含下单时间等前缀）
  const dateTimeRegex = /(?:(下单时间|创建时间|付款时间|申请时间|订单时间|时间)[:：]?\s*)?(?:(\d{4})[-/年.])?(\d{1,2})[-/月.](\d{1,2})日?\s+(\d{1,2})[点:](\d{1,2})(?:[分秒:]+(\d{1,2})秒?|分)?/i;
  const dateMatch = normalizedInput.match(dateTimeRegex);
  let parsedDate: string | undefined = undefined;
  let cleanInput = normalizedInput;

  if (dateMatch) {
    try {
      const year = dateMatch[2] || String(new Date().getFullYear());
      const month = String(dateMatch[3]).padStart(2, '0');
      const day = String(dateMatch[4]).padStart(2, '0');
      parsedDate = `${year}-${month}-${day}`;
      
      // 移除时间字符串以避免污染姓名和地址解析
      cleanInput = normalizedInput.replace(dateMatch[0], " ");
    } catch (e) {
      console.error("Failed to parse date in address parser:", e);
    }
  }

  const normalized = cleanInput
    .replace(/[（【]/g, "(")
    .replace(/[）】]/g, ")")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!normalized) {
    return {
      recipientName: "",
      recipientPhone: "",
      recipientAddress: "",
      remark: "",
      parsedDate,
    };
  }

  const remark = "";
  const core = normalized
    .replace(/[|｜]/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const phoneMatch = core.match(recipientPhoneRegex);
  if (!phoneMatch) {
    return {
      recipientName: "",
      recipientPhone: "",
      recipientAddress: core,
      remark,
      parsedDate,
    };
  }

  const recipientPhone = phoneMatch[0];
  const residual = core
    .slice(0, phoneMatch.index)
    .concat(" ", core.slice((phoneMatch.index || 0) + recipientPhone.length))
    .replace(/^[，,;；\s]+/, "")
    .replace(/[，,;；\s]+$/, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  const segments = residual
    .split(/\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  let recipientName = "";
  let recipientAddress = "";

  const addressSegments = segments.filter((segment) => isLikelyRecipientAddress(segment));
  const nameSegments = segments.filter((segment) => !addressSegments.includes(segment) && isLikelyRecipientName(segment));

  if (addressSegments.length > 0) {
    recipientAddress = addressSegments.join(" ");
  }
  if (nameSegments.length > 0) {
    recipientName = nameSegments[0];
  }

  if (segments.length === 1) {
    const singleLine = segments[0];
    const leadingNameMatch = singleLine.match(/^([\u4e00-\u9fa5·]{1,12})[\s，,;；]+(.+)$/);
    if (leadingNameMatch && isLikelyRecipientName(leadingNameMatch[1]) && isLikelyRecipientAddress(leadingNameMatch[2])) {
      recipientName = recipientName || leadingNameMatch[1].trim();
      recipientAddress = leadingNameMatch[2].trim();
    } else {
      const trailingNameMatch = singleLine.match(/^(.+?)[\s，,;；]+([\u4e00-\u9fa5·]{1,12})$/);
      if (trailingNameMatch && isLikelyRecipientAddress(trailingNameMatch[1]) && isLikelyRecipientName(trailingNameMatch[2])) {
        recipientAddress = trailingNameMatch[1].trim();
        recipientName = recipientName || trailingNameMatch[2].trim();
      }
    }
  }

  if (!recipientAddress) {
    const nonNameSegments = segments.filter((segment) => segment !== recipientName);
    recipientAddress = nonNameSegments.join(" ").trim() || residual;
  }

  if (!recipientName) {
    const fallbackName = segments.find((segment) => isLikelyRecipientName(segment));
    recipientName = fallbackName || "";
  }

  // 兜底去除地址前面可能因解析或导入污染而重复出现的“姓名”前缀
  if (recipientName && recipientAddress) {
    const escapedName = recipientName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const namePrefixRegex = new RegExp(`^(?:${escapedName}\\s*)+`, 'g');
    recipientAddress = recipientAddress.replace(namePrefixRegex, '').trim();
  }

  return {
    recipientName,
    recipientPhone,
    recipientAddress,
    remark,
    parsedDate,
  };
}

function formatQuantity(order: OutboundOrder) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function extractRecipientCity(address?: string) {
  if (!address) return "";
  const compactAddress = address.replace(/\s+/g, "");
  const municipalityMatch = compactAddress.match(/(北京市|上海市|天津市|重庆市)/);
  if (municipalityMatch) {
    return municipalityMatch[1];
  }

  const textAfterProvince = compactAddress.replace(
    /^(?:[\u4e00-\u9fa5]{2,8}省|[\u4e00-\u9fa5]{2,12}自治区|[\u4e00-\u9fa5]{2,12}特别行政区)/,
    ""
  );
  const cityMatch = textAfterProvince.match(/([\u4e00-\u9fa5]{2,6}?(?:市|州|地区|盟|特别行政区))/);
  return cityMatch?.[1] || "";
}

function formatRecipientWithRegion(name?: string, address?: string) {
  const recipientName = name?.trim() || "-";
  const city = extractRecipientCity(address);
  return city ? `${recipientName}-${city}` : recipientName;
}

function splitShipmentDisplayName(name?: string) {
  const raw = String(name || "").trim();
  if (!raw) {
    return { baseName: "未知商品", variantLabel: "" };
  }

  const parts = raw.split(" / ").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { baseName: raw, variantLabel: "" };
  }

  return {
    baseName: parts[0] || raw,
    variantLabel: parts.slice(1).join(" / "),
  };
}

function resolveShipmentSummaryItemName(item: {
  variantName?: string | null;
  shopProduct?: { name?: string | null; productName?: string | null } | null;
  product?: { name?: string | null } | null;
  shopProductVariant?: { variantName?: string | null; optionSummary?: string | null } | null;
  productVariant?: { variantName?: string | null; optionSummary?: string | null } | null;
}) {
  const baseName = String(
    item.shopProduct?.name
    || item.shopProduct?.productName
    || item.product?.name
    || "未知商品"
  ).trim();
  const variantLabel = String(
    item.shopProductVariant?.variantName
    || item.shopProductVariant?.optionSummary
    || item.productVariant?.variantName
    || item.productVariant?.optionSummary
    || item.variantName
    || ""
  ).trim();
  if (!variantLabel) {
    return baseName;
  }
  const splitName = splitShipmentDisplayName(baseName);
  if (splitName.variantLabel) {
    return baseName;
  }
  return `${baseName} / ${variantLabel}`;
}

function getItemKey(item: {
  productId?: string | null;
  productVariantId?: string | null;
  shopProductId?: string | null;
  shopProductVariantId?: string | null;
}) {
  return item.shopProductVariantId || item.productVariantId || item.shopProductId || item.productId || "";
}

function isShipmentItemMarkedShipped(
  item: { productId?: string | null; productVariantId?: string | null; shopProductId?: string | null; shopProductVariantId?: string | null },
  parsed: { trackingEntries?: FactoryShipmentTrackingEntry[] },
  status?: string | null
) {
  if (getDisplayStatus(status) !== "部分发货") return false;
  const itemKey = getItemKey(item);
  if (!itemKey) return false;

  return Boolean(
    parsed.trackingEntries?.some((entry) =>
      entry.itemKey === itemKey && Boolean(entry.trackingNumber?.trim())
    )
  );
}

function hasShipmentItemDeliveryInfo(item: Pick<SelectedShipmentItem, "trackingNumber" | "logisticsName" | "shippingFee">) {
  return Boolean(item.trackingNumber?.trim());
}

function hasParsedShipmentItemDeliveryInfo(
  item: { productId?: string | null; productVariantId?: string | null; shopProductId?: string | null; shopProductVariantId?: string | null },
  parsed: { trackingEntries?: FactoryShipmentTrackingEntry[] }
) {
  const itemKey = getItemKey(item);
  if (!itemKey) return false;
  return Boolean(
    parsed.trackingEntries?.some((entry) => entry.itemKey === itemKey && Boolean(entry.trackingNumber?.trim()))
  );
}

function deriveFactoryShipmentStatusFromItems(
  items: Pick<SelectedShipmentItem, "trackingNumber" | "logisticsName" | "shippingFee">[],
  fallbackStatus = "待发货"
) {
  if (items.length === 0) return fallbackStatus || "待发货";

  const shippedCount = items.filter(hasShipmentItemDeliveryInfo).length;
  if (shippedCount === 0) return "待发货";
  return shippedCount === items.length ? "已发货" : "部分发货";
}

function deriveFactoryShipmentStatusFromOrder(order: OutboundOrder, parsed = parseFactoryShipmentNote(order.note)) {
  if (order.status === "Returned" || order.status === "已退回") return "已退回";
  if (!order.items?.length) return "待发货";

  const shippedCount = order.items.filter((item) => hasParsedShipmentItemDeliveryInfo(item, parsed)).length;
  if (shippedCount === 0) return "待发货";
  return shippedCount === order.items.length ? "已发货" : "部分发货";
}

function isReturnedShipmentOrder(order: Pick<OutboundOrder, "status">) {
  return order.status === "Returned" || order.status === "已退回";
}

// 供 key 属性使用的稳定键生成器
function getStableShipmentItemKey(
  item: { productId?: string | null; productVariantId?: string | null; shopProductId?: string | null; shopProductVariantId?: string | null; name?: string; sku?: string },
  index: number
) {
  return getItemKey(item) || `${item.sku || item.name || "shipment-item"}-${index}`;
}

// 供事件和表单处理使用的稳定键生成器
function getStableShipmentActionKey(
  item: { productId?: string | null; productVariantId?: string | null; shopProductId?: string | null; shopProductVariantId?: string | null; name?: string; sku?: string; quantity?: number }
) {
  return getItemKey(item) || `${item.sku || item.name || "shipment-item"}-${item.quantity || 0}`;
}

function formatShipmentCopyNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatShipmentItemCopyLine(item: SelectedShipmentItem, recipientLabel?: string) {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const shippingFee = Number(item.shippingFee) || 0;
  const totalPrice = qty * price + shippingFee;
  const title = [recipientLabel?.trim(), item.name.trim()].filter(Boolean).join("-");
  const trackingNumbers = (item.trackingNumber || "")
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(",");
  const logisticsName = item.logisticsName?.trim();
  const trackingPart = trackingNumbers
    ? ` ${trackingNumbers}${logisticsName ? `（${logisticsName}）` : ""}`
    : logisticsName
      ? ` （${logisticsName}）`
      : "";
  const shippingPart = shippingFee > 0 ? `+${formatShipmentCopyNumber(shippingFee)}` : "";

  return `${title}${trackingPart}/${formatShipmentCopyNumber(price)}×${formatShipmentCopyNumber(qty)}${shippingPart}=${formatShipmentCopyNumber(totalPrice)}`;
}

function getShipmentItemCopyTotal(item: SelectedShipmentItem) {
  const qty = Number(item.quantity) || 0;
  const price = Number(item.price) || 0;
  const shippingFee = Number(item.shippingFee) || 0;
  return qty * price + shippingFee;
}

function formatShipmentCopyAllText(items: SelectedShipmentItem[], recipientLabel?: string) {
  const lines = items.map((item) => formatShipmentItemCopyLine(item, recipientLabel));
  const totals = items.map(getShipmentItemCopyTotal);
  const totalFormula = totals.map(formatShipmentCopyNumber).join("+");
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);
  const today = format(new Date(), "M.d");

  return [
    today,
    lines.join("\n\n"),
    "",
    `合计：${totalFormula}=${formatShipmentCopyNumber(grandTotal)}`,
  ].join("\n");
}

function formatShipmentCopySingleText(item: SelectedShipmentItem, recipientLabel?: string) {
  return [format(new Date(), "M.d"), formatShipmentItemCopyLine(item, recipientLabel)].join("\n");
}

function getShipmentInfoSpecLabel(item: SelectedShipmentItem) {
  const rawName = item.name.trim();
  if (!rawName) return "";
  const segments = rawName.split("/").map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 1] : segments[0];
}

function formatShipmentInfoItemLine(item: SelectedShipmentItem, index: number) {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const itemName = getShipmentInfoSpecLabel(item) || item.sku?.trim() || `货品${index + 1}`;
  return `${itemName}×${formatShipmentCopyNumber(qty)}`;
}

function formatShipmentInfoText(
  recipientLine: string,
  recipient: { recipientName: string; recipientPhone: string; recipientAddress: string },
  items: SelectedShipmentItem[]
) {
  const lines = items.map((item, index) => formatShipmentInfoItemLine(item, index));
  const normalizedRecipientLine = recipientLine.trim() || [recipient.recipientName.trim(), recipient.recipientPhone.trim(), recipient.recipientAddress.trim()].filter(Boolean).join(" ");
  return [
    normalizedRecipientLine,
    "",
    `货品：${lines.join("\n")}`,
  ].join("\n");
}

function formatFactoryShipmentError(message: string, items: SelectedShipmentItem[]) {
  return message.replace(/商品 ID ([^\s]+) 库存不足，缺口[:：]\s*(\d+)/g, (_, rawId: string, gap: string) => {
    const matchedItem = items.find((item) => item.shopProductId === rawId || item.productId === rawId);
    const itemLabel = matchedItem?.name ? `${matchedItem.name}${matchedItem.sku ? `（${matchedItem.sku}）` : ""}` : "该商品";
    return `${itemLabel} 库存不足，缺口 ${gap} 件`;
  });
}

function getPaymentTone(status: string) {
  if (status === "已支付") {
    return "bg-emerald-500/8 text-emerald-700 border-emerald-500/15 dark:bg-emerald-500/12 dark:text-emerald-400 dark:border-emerald-500/25";
  }
  if (status === "部分支付") {
    return "bg-amber-500/8 text-amber-700 border-amber-500/15 dark:bg-amber-500/12 dark:text-amber-400 dark:border-amber-500/25";
  }
  return "bg-rose-500/8 text-rose-700 border-rose-500/15 dark:bg-rose-500/12 dark:text-rose-400 dark:border-rose-500/25";
}

function getShippingTone(status: string) {
  if (status === "已发货") {
    return "bg-emerald-500/8 text-emerald-700 border-emerald-500/15 dark:bg-emerald-500/12 dark:text-emerald-400 dark:border-emerald-500/25";
  }
  if (status === "部分发货") {
    return "bg-sky-500/8 text-sky-700 border-sky-500/15 dark:bg-sky-500/12 dark:text-sky-400 dark:border-sky-500/25";
  }
  if (status === "已退回") {
    return "bg-slate-500/8 text-slate-600 border-slate-500/15 dark:bg-slate-500/12 dark:text-slate-400 dark:border-slate-500/25";
  }
  return "bg-rose-500/8 text-rose-700 border-rose-500/15 dark:bg-rose-500/12 dark:text-rose-400 dark:border-rose-500/25";
}
function getCompensationTone(status: string) {
  if (status === "已补偿") {
    return "bg-sky-500/8 text-sky-700 border-sky-500/15 dark:bg-sky-500/12 dark:text-sky-400 dark:border-sky-500/25";
  }
  if (status === "待补偿") {
    return "bg-orange-500/8 text-orange-700 border-orange-500/15 dark:bg-orange-500/12 dark:text-orange-400 dark:border-orange-500/25";
  }
  return "bg-slate-500/8 text-slate-600 border-slate-500/15 dark:bg-slate-500/12 dark:text-slate-400 dark:border-slate-500/25";
}







function getDisplayStatus(status?: string | null) {
  if (status === "Normal" || status === "已发货") return "已发货";
  if (status === "Returned" || status === "已退回") return "已退回";
  return status || "待发货";
}

function canKeepShipmentExtras(status?: string | null) {
  const displayStatus = getDisplayStatus(status);
  return displayStatus === "已发货" || displayStatus === "部分发货";
}

function FactoryMetricCard({
  label,
  value,
  hint,
  icon,
  accentClassName,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accentClassName: string;
}) {
  return (
    <div className="rounded-[18px] border border-black/8 bg-white/76 px-3 py-2.5 shadow-xs dark:border-white/10 dark:bg-white/5 sm:px-3.5 sm:py-3">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.14em]">
            {label}
          </div>
          <div className="mt-1 text-[18px] font-black leading-none tracking-tight text-foreground sm:mt-1.5 sm:text-[24px]">
            {value}
          </div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground sm:mt-1.5 sm:text-[11px]">
            {hint}
          </p>
        </div>
        <div className={cn("rounded-2xl border p-2.5 shadow-sm", accentClassName)}>{icon}</div>
      </div>
    </div>
  );
}

function FactoryShipmentFilters({
  searchQuery,
  shippingFilter,
  paymentFilter,
  compensationFilter,
  startDate,
  endDate,
  hasActiveFilters,
  onSearchChange,
  onShippingChange,
  onPaymentChange,
  onCompensationChange,
  onStartDateChange,
  onEndDateChange,
  onReset,
}: {
  searchQuery: string;
  shippingFilter: string;
  paymentFilter: string;
  compensationFilter: string;
  startDate: string;
  endDate: string;
  hasActiveFilters: boolean;
  onSearchChange: (value: string) => void;
  onShippingChange: (value: string) => void;
  onPaymentChange: (value: string) => void;
  onCompensationChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-[24px] border border-border bg-white/70 p-3 shadow-sm dark:border-white/10 dark:bg-white/5 lg:flex-row lg:items-center lg:p-3.5">
      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_112px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_128px]">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索收件人、电话、地址或商品"
            className="h-10 w-full rounded-full border border-border bg-white pl-10 pr-9 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5 lg:h-11"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="h-10 min-w-0 lg:h-11">
          <CustomSelect
            value={shippingFilter}
            onChange={onShippingChange}
            options={[{ value: "all", label: "发货状态" }, ...shippingStatusOptions]}
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border px-3 text-xs shadow-sm lg:text-sm",
              shippingFilter !== "all"
                ? "bg-primary/10 border-primary/20 text-primary font-bold"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-row lg:items-center lg:gap-3">
        <div className="h-10 min-w-0 lg:h-11 lg:w-28 lg:shrink-0">
          <CustomSelect
            value={paymentFilter}
            onChange={onPaymentChange}
            options={[{ value: "all", label: "货款状态" }, ...paymentStatusOptions]}
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border px-3 text-xs shadow-sm lg:text-sm",
              paymentFilter !== "all"
                ? "bg-primary/10 border-primary/20 text-primary font-bold"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>
        <div className="h-10 min-w-0 lg:h-11 lg:w-28 lg:shrink-0">
          <CustomSelect
            value={compensationFilter}
            onChange={onCompensationChange}
            options={[{ value: "all", label: "补偿状态" }, ...compensationStatusOptions]}
            className="h-full"
            triggerClassName={cn(
              "h-full rounded-full border px-3 text-xs shadow-sm lg:text-sm",
              compensationFilter !== "all"
                ? "bg-primary/10 border-primary/20 text-primary font-bold"
                : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5 font-normal"
            )}
          />
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2 lg:contents">
          <DatePicker
            value={startDate}
            onChange={onStartDateChange}
            maxDate={endDate}
            placeholder="开始日期"
            className="h-10 lg:h-11 lg:w-32"
            triggerClassName="h-full rounded-full border-border bg-white shadow-sm dark:bg-white/5"
            isCompact
          />
          <DatePicker
            value={endDate}
            onChange={onEndDateChange}
            minDate={startDate}
            placeholder="结束日期"
            className="h-10 lg:h-11 lg:w-32"
            triggerClassName="h-full rounded-full border-border bg-white shadow-sm dark:bg-white/5"
            isCompact
          />
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="col-span-2 h-10 rounded-full border border-primary/20 bg-primary/5 px-4 text-xs font-bold text-primary shadow-sm transition-all hover:bg-primary/10 sm:col-span-1 sm:h-11"
          >
            重置筛选
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FactoryShipmentDetailModal({
  order,
  onClose,
  onUpdated,
  logisticsOptions = [],
  onAddNewLogistics,
}: {
  order: OutboundOrder | null;
  onClose: () => void;
  onUpdated?: () => Promise<void>;
  logisticsOptions?: { value: string; label: string }[];
  onAddNewLogistics?: () => void;
}) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editItems, setEditItems] = useState<SelectedShipmentItem[]>([]);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  
  const [editForm, setEditForm] = useState({
    status: "",
    date: "",
    recipientLine: "",
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    remark: "",
    paymentStatus: "",
    compensationStatus: "",
    compensationLogisticsName: "",
    compensationTrackingNumber: "",
  });

  const getSingleRowLogisticsOptions = useCallback((currentVal?: string | null) => {
    const base = [...logisticsOptions];
    if (currentVal?.trim() && !base.some((opt) => opt.value === currentVal.trim())) {
      base.push({
        value: currentVal.trim(),
        label: `${currentVal.trim()} (历史数据)`,
      });
    }
    return base;
  }, [logisticsOptions]);

  const compensationLogisticsOptions = useMemo(() => {
    const base = [...logisticsOptions];
    const currentVal = editForm.compensationLogisticsName;
    if (currentVal?.trim() && !base.some((opt) => opt.value === currentVal.trim())) {
      base.push({
        value: currentVal.trim(),
        label: `${currentVal.trim()} (历史数据)`,
      });
    }
    return base;
  }, [logisticsOptions, editForm.compensationLogisticsName]);

  const [editCompensationItems, setEditCompensationItems] = useState<{
    itemKey: string;
    name: string;
    sku: string;
    image: string;
    quantity: number;
  }[]>([]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (!order) {
      setIsEditing(false);
      return;
    }

    const parsed = parseFactoryShipmentNote(order.note);
    setEditForm({
      status: deriveFactoryShipmentStatusFromOrder(order, parsed),
      date: format(parseSafeDate(order.date), "yyyy-MM-dd"),
      recipientLine: [parsed.recipientName, parsed.recipientPhone, parsed.recipientAddress].filter(Boolean).join(" "),
      recipientName: parsed.recipientName || "",
      recipientPhone: parsed.recipientPhone || "",
      recipientAddress: parsed.recipientAddress || "",
      remark: parsed.remark || "",
      paymentStatus: parsed.paymentStatus || "未支付",
      compensationStatus: parsed.compensationStatus || "",
      compensationLogisticsName: parsed.compensationLogisticsName || "",
      compensationTrackingNumber: parsed.compensationTrackingNumber || "",
    });
    setEditItems(
      order.items.map((item) => {
        const normalizedItemIds = {
          productId: item.productId || item.shopProduct?.productId || item.product?.id || null,
          productVariantId: item.productVariantId || item.productVariant?.id || item.shopProductVariant?.productVariantId || null,
          shopProductId: item.shopProductId || item.shopProduct?.id || undefined,
          shopProductVariantId: item.shopProductVariantId || item.shopProductVariant?.id || undefined,
        };
        const trackingEntry = parsed.trackingEntries.find(
          (entry: FactoryShipmentTrackingEntry) => entry.itemKey === getItemKey(normalizedItemIds)
        );
        return {
          ...normalizedItemIds,
          name: item.shopProductVariant?.variantName
            ? `${item.shopProduct?.name || item.product?.name || "未知商品"} / ${item.shopProductVariant.variantName}`
            : item.productVariant?.variantName
              ? `${item.product?.name || "未知商品"} / ${item.productVariant.variantName}`
              : item.variantName
                ? `${item.shopProduct?.name || item.product?.name || "未知商品"} / ${item.variantName}`
                : item.shopProduct?.name || item.product?.name || "未知商品",
          sku: item.shopProductVariant?.sku || item.productVariant?.sku || item.shopProduct?.sku || item.product?.sku || "",
          quantity: item.quantity,
          image: item.shopProductVariant?.image || item.productVariant?.image || item.shopProduct?.image || item.product?.image || "",
          stock: Number(item.shopProductVariant?.stock ?? item.productVariant?.stock ?? item.shopProduct?.stock ?? item.product?.stock ?? item.quantity ?? 0),
          trackingNumber: trackingEntry?.trackingNumber || "",
          logisticsName: trackingEntry?.logisticsName || "",
          price: item.price || item.shopProductVariant?.salePrice || item.productVariant?.salePrice || item.shopProduct?.costPrice || item.product?.costPrice || 0,
          shippingFee: trackingEntry?.shippingFee || 0,
        };
      })
    );

    const compItems = (parsed.compensationItems || []).map((cItem: FactoryShipmentCompensationItem) => {
      const isBox = cItem.itemKey.endsWith("-box");
      const realKey = isBox ? cItem.itemKey.replace("-box", "") : cItem.itemKey;
      const matched = order.items.find(
        (oItem) =>
          (oItem.shopProductId || oItem.shopProduct?.id || oItem.productId || oItem.shopProduct?.productId || oItem.product?.id || "") === realKey
      );
      const baseName = matched?.shopProduct?.name || matched?.product?.name;
      return {
        itemKey: cItem.itemKey,
        name: baseName ? (isBox ? `${baseName} (彩盒)` : baseName) : (isBox ? "未知商品 (彩盒)" : "未知商品"),
        sku: matched?.shopProduct?.sku || matched?.product?.sku || (isBox && matched?.shopProduct?.sku ? `${matched.shopProduct.sku}-box` : ""),
        image: matched?.shopProduct?.image || matched?.product?.image || "",
        quantity: cItem.quantity,
      };
    });
    setEditCompensationItems(compItems);

    const isReturned = order.status === "Returned" || order.status === "已退回";
    setIsEditing(!isReturned);
  }, [order]);

  useEffect(() => {
    if (!isEditing || editItems.length === 0) return;

    const nextStatus = deriveFactoryShipmentStatusFromItems(editItems, editForm.status || "待发货");
    setEditForm((prev) => prev.status === nextStatus ? prev : { ...prev, status: nextStatus });
  }, [editForm.status, editItems, isEditing]);

  const updateEditQuantity = useCallback((itemKey: string, value: string) => {
    if (value.trim() === "") {
      setEditItems((prev) =>
        prev.map((item) =>
          (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
            ? { ...item, quantity: 0 }
            : item
        )
      );
      return;
    }

    const nextQty = Number.parseInt(value, 10) || 1;
    setEditItems((prev) => {
      const originalItem = order?.items.find(
        (oItem) =>
          (oItem.shopProductVariantId || oItem.productVariantId || oItem.shopProductId || oItem.productId || "") === itemKey
      );
      const originalQty = originalItem?.quantity || 0;
      const currentItem = prev.find((i) => (getItemKey(i) || getStableShipmentActionKey(i)) === itemKey);
      const maxAllowed = originalQty + (currentItem?.stock || 0);

      return prev.map((item) =>
        (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
          ? { ...item, quantity: Math.max(1, Math.min(maxAllowed, nextQty)) }
          : item
      );
    });
  }, [order]);

  const removeEditItem = useCallback((itemKey: string) => {
    setEditItems((prev) => prev.filter((item) => (getItemKey(item) || getStableShipmentActionKey(item)) !== itemKey));
  }, []);

  const updateEditTrackingNumber = useCallback((itemKey: string, value: string) => {
    const trackingNumber = value.replace(/，/g, ",");
    setEditItems((prev) =>
      prev.map((item) =>
        (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
          ? hasSelectedLogisticsName(item.logisticsName)
            ? { ...item, trackingNumber }
            : { ...item, trackingNumber: "" }
          : item
      )
    );
  }, []);

  const updateEditLogisticsName = useCallback((itemKey: string, value: string) => {
    setEditItems((prev) =>
      prev.map((item) =>
        (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
          ? hasSelectedLogisticsName(value)
            ? { ...item, logisticsName: value }
            : { ...item, logisticsName: value, trackingNumber: "" }
          : item
      )
    );
  }, []);

  const updateEditPrice = useCallback((itemKey: string, value: string) => {
    const price = value === "" ? undefined : (Number(value) || 0);
    setEditItems((prev) =>
      prev.map((item) =>
        (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
          ? { ...item, price }
          : item
      )
    );
  }, []);

  const updateEditShippingFee = useCallback((itemKey: string, value: string) => {
    const shippingFee = value === "" ? undefined : (Number(value) || 0);
    setEditItems((prev) =>
      prev.map((item) =>
        (getItemKey(item) || getStableShipmentActionKey(item)) === itemKey
          ? { ...item, shippingFee }
          : item
      )
    );
  }, []);

  const handleEditBatchAdd = useCallback((pickedProducts: Product[]) => {
    setEditItems((prev) => {
      const next = [...prev];

      for (const product of pickedProducts) {
        const itemKey = product.shopProductVariantId || product.productVariantId || product.shopProductId || product.id;
        if (next.some((item) => getItemKey(item) === itemKey)) continue;

        next.push({
          productId:
            product.productId ||
            product.sourceProductId ||
            (product.sourceType === "shopProduct" ? null : product.id),
          productVariantId: product.productVariantId || null,
          shopProductId: product.shopProductId || undefined,
          shopProductVariantId: product.shopProductVariantId || null,
          name: buildShipmentItemDisplayName(product),
          sku: product.sku || "",
          image: product.image || "",
          stock: Number(product.stock || 0),
          quantity: 1,
          trackingNumber: "",
          logisticsName: "",
          price: product.salePrice ?? product.costPrice ?? 0,
          shippingFee: 0,
        });
      }

      return next;
    });
  }, []);

  const handleAddCompensationBox = useCallback((item: SelectedShipmentItem) => {
    const itemKey = `${item.shopProductId || item.productId || ""}-box`;
    setEditCompensationItems((prev) => {
      if (prev.some((i) => i.itemKey === itemKey)) {
        return prev.map((i) => i.itemKey === itemKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          itemKey,
          name: `${item.name} (彩盒)`,
          sku: item.sku ? `${item.sku}-box` : "",
          image: item.image,
          quantity: 1,
        },
      ];
    });
  }, []);

  const handleAddCompensationOriginal = useCallback((item: SelectedShipmentItem) => {
    const itemKey = item.shopProductId || item.productId || "";
    setEditCompensationItems((prev) => {
      if (prev.some((i) => i.itemKey === itemKey)) {
        return prev.map((i) => i.itemKey === itemKey ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [
        ...prev,
        {
          itemKey,
          name: item.name,
          sku: item.sku,
          image: item.image,
          quantity: 1,
        },
      ];
    });
  }, []);

  if (!mounted) return null;
  const parsed = order ? parseFactoryShipmentNote(order.note) : null;
  const selectedProductIds = editItems.map((item) => String(getItemKey(item))).filter(Boolean);
  const parsedCopyRecipient = parseQuickAddressInput(editForm.recipientLine);
  const copyRecipientLabel = formatRecipientWithRegion(
    parsedCopyRecipient.recipientName || editForm.recipientName,
    parsedCopyRecipient.recipientAddress || editForm.recipientAddress
  );

  const copyEditItem = async (item: SelectedShipmentItem) => {
    const parsedRecipient = parseQuickAddressInput(editForm.recipientLine);
    const recipient = {
      recipientName: (parsedRecipient.recipientName.trim() || editForm.recipientName.trim()),
      recipientPhone: (parsedRecipient.recipientPhone.trim() || editForm.recipientPhone.trim()),
      recipientAddress: (parsedRecipient.recipientAddress.trim() || editForm.recipientAddress.trim()),
    };
    if (!recipient.recipientName || !recipient.recipientPhone || !recipient.recipientAddress) {
      showToast("请先填写完整收件信息后再复制", "error");
      return;
    }
    const text = formatShipmentInfoText(editForm.recipientLine, recipient, [item]);
    const success = await copyToClipboard(text);
    showToast(success ? "已复制单个发货信息" : "复制失败", success ? "success" : "error");
  };

  const copyAllEditItems = async () => {
    if (editItems.length === 0) {
      showToast("暂无可复制货品", "info");
      return;
    }

    const text = formatShipmentCopyAllText(editItems, copyRecipientLabel);
    const success = await copyToClipboard(text);
    showToast(success ? `已复制 ${editItems.length} 项货品文本` : "复制失败", success ? "success" : "error");
  };

  const handleSaveEdit = async () => {
    if (!order) return;
    const parsedRecipient = parseQuickAddressInput(editForm.recipientLine);
    if (!parsedRecipient.recipientName.trim() || !parsedRecipient.recipientPhone.trim() || !parsedRecipient.recipientAddress.trim()) {
      showToast("请直接填写完整收件信息，至少包含姓名、手机号和地址", "error");
      return;
    }
    if (editItems.length === 0) {
      showToast("请至少保留一件发货商品", "error");
      return;
    }
    if (editItems.some((item) => item.quantity <= 0)) {
      showToast("请填写所有商品数量，数量至少为 1", "error");
      return;
    }
    const invalidTrackingItem = editItems.find((item) => item.trackingNumber?.trim() && !hasSelectedLogisticsName(item.logisticsName));
    if (invalidTrackingItem) {
      showToast(`填写 ${invalidTrackingItem.name} 的快递单号前，请先选择物流公司`, "error");
      return;
    }

    const compLogName = (editForm.compensationLogisticsName || "").trim();
    const isCompensationLogisticsSelected = compLogName && compLogName !== "选择物流公司";
    if (
      (editForm.compensationStatus === "待补偿" || editForm.compensationStatus === "已补偿") &&
      editForm.compensationTrackingNumber.trim() &&
      !isCompensationLogisticsSelected
    ) {
      showToast("填写补偿单号前，请先选择补偿物流公司", "error");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/outbound/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: deriveFactoryShipmentStatusFromItems(editItems, editForm.status || "待发货"),
          date: editForm.date,
          notePayload: {
            recipientName: parsedRecipient.recipientName,
            recipientPhone: parsedRecipient.recipientPhone,
            recipientAddress: parsedRecipient.recipientAddress,
            paymentStatus: editForm.paymentStatus,
            compensationStatus: editForm.compensationStatus,
            compensationLogisticsName: editForm.compensationLogisticsName,
            compensationTrackingNumber: editForm.compensationTrackingNumber,
            compensationItems: editCompensationItems.map((item) => ({
              itemKey: item.itemKey,
              itemName: item.name,
              quantity: item.quantity,
            })),
            trackingEntries: editItems
              .map((item) => ({
                itemKey: getItemKey(item) || getStableShipmentActionKey(item),
                itemName: item.name,
                logisticsName: item.logisticsName?.trim() || "",
                trackingNumber: item.trackingNumber?.trim() || "",
                shippingFee: Number(item.shippingFee) || 0,
              }))
              .filter((entry) => entry.itemKey && entry.trackingNumber),
            remark: editForm.remark,
          },
          items: editItems.map((item) => ({
            productId: item.productId || undefined,
            productVariantId: item.productVariantId || undefined,
            shopProductId: item.shopProductId || undefined,
            shopProductVariantId: item.shopProductVariantId || undefined,
            quantity: item.quantity,
            price: Number(item.price) || 0,
          })),
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(formatFactoryShipmentError(data?.error || "保存失败", editItems));

      showToast("发货信息已更新", "success");
      if (onUpdated) {
        await onUpdated();
      }
      onClose();
    } catch (err) {
      console.error("Failed to update factory shipment:", err);
      showToast(err instanceof Error ? formatFactoryShipmentError(err.message, editItems) : "保存失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  return createPortal(
    <AnimatePresence>
      {order && parsed && (
        <div key={`factory-shipment-detail-${order.id}`} className="fixed inset-0 z-10000 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-card/98 backdrop-blur-xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-start justify-between border-b border-black/5 px-6 py-5 dark:border-white/10 shrink-0">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-[26px] font-black tracking-tight text-foreground">
                    {isEditing ? "编辑发货单" : "发货记录详情"}
                  </h3>
                  {order.status !== "Returned" && order.status !== "已退回" && !isEditing && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="text-xs font-bold text-primary px-3 py-1.5 rounded-xl bg-primary/5 hover:bg-primary/10 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      编辑信息
                    </button>
                  )}
                </div>
              </div>
              <button 
                type="button" 
                onClick={onClose} 
                className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-[22px] border border-border/50 bg-linear-to-br from-zinc-50 via-white to-zinc-50/70 p-4 shadow-sm dark:border-white/10 dark:from-white/7 dark:via-white/4 dark:to-white/2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">发货安排</div>
                      <div className="mt-1 text-xs text-muted-foreground">单据与创建时间</div>
                    </div>
                    <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-border/60 bg-white/80 px-3 text-[11px] text-muted-foreground shadow-xs dark:border-white/10 dark:bg-white/6">
                      {editItems.length || order.items.length} 项货品
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
                    <div className="rounded-2xl border border-border/60 bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <FileText size={12} className="shrink-0" />
                        <span>单据编号</span>
                      </div>
                      <div className="mt-2 truncate font-mono text-[15px] font-semibold tracking-tight text-foreground/90">{order.id}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <Calendar size={12} className="shrink-0" />
                        <span>发货状态</span>
                      </div>
                      <div className="mt-2">
                        <span className={cn("inline-flex h-8 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-normal", getShippingTone(editForm.status))}>
                          {editForm.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-2xl border border-border/60 bg-white/70 px-3.5 py-3 dark:border-white/10 dark:bg-white/4">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">创建时间</div>
                    <div className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                      {format(parseSafeDate(order.date), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                    </div>
                  </div>
                </div>
                <div className="rounded-[22px] border border-border/50 bg-linear-to-br from-zinc-50 via-white to-zinc-50/70 p-4 shadow-sm dark:border-white/10 dark:from-white/7 dark:via-white/4 dark:to-white/2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">状态设置</div>
                    <div className="mt-1 text-xs text-muted-foreground">货款与补偿状态</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-2xl border border-border/60 bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">货款状态</div>
                      {isEditing ? (
                        <CustomSelect
                          value={editForm.paymentStatus}
                          onChange={(val) => setEditForm(prev => ({ ...prev, paymentStatus: val }))}
                          options={[
                            { value: "未支付", label: "未支付" },
                            { value: "部分支付", label: "部分支付" },
                            { value: "已支付", label: "已支付" },
                          ]}
                          triggerClassName="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#2b313d]"
                        />
                      ) : (
                        <span className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-normal", getPaymentTone(parsed.paymentStatus))}>
                          {parsed.paymentStatus}
                        </span>
                      )}
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/5">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">补偿状态</div>
                      {isEditing ? (
                        <CustomSelect
                          value={editForm.compensationStatus}
                          onChange={(val) => {
                            setEditForm((prev) => ({
                              ...prev,
                              compensationStatus: val,
                              ...(val === ""
                                ? {
                                    compensationLogisticsName: "",
                                    compensationTrackingNumber: "",
                                  }
                                : {}),
                            }));
                            if (val === "") {
                              setEditCompensationItems([]);
                            }
                          }}
                          disabled={!canKeepShipmentExtras(editForm.status)}
                          options={[
                            { value: "", label: "无需补偿" },
                            { value: "待补偿", label: "待补偿" },
                            { value: "已补偿", label: "已补偿" },
                          ]}
                          triggerClassName="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-sm dark:border-white/10 dark:bg-[#2b313d] disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      ) : (
                        <span className={cn("inline-flex h-8 items-center rounded-full border px-3 text-xs font-normal", getCompensationTone(parsed.compensationStatus || ""))}>
                          {parsed.compensationStatus || "无需补偿"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-[20px] border border-border/50 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-white/6 dark:to-white/3">
                  <div className="grid min-w-0 gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">收件信息</div>
                      {isEditing ? (
                        <CustomerAddressCombobox
                          value={editForm.recipientLine}
                          onChange={(nextLine) => {
                            const nextParsed = parseQuickAddressInput(nextLine);
                            setEditForm((prev) => {
                              const next = {
                                ...prev,
                                recipientLine: nextLine,
                                recipientName: nextParsed.recipientName,
                                recipientPhone: nextParsed.recipientPhone,
                                recipientAddress: nextParsed.recipientAddress,
                              };
                              if (nextParsed.parsedDate) {
                                next.date = nextParsed.parsedDate;
                              }
                              return next;
                            });
                          }}
                          placeholder="直接填写或粘贴：姓名 手机号 详细地址"
                          wrapperClassName="mt-2.5"
                          className="h-11 w-full rounded-2xl border border-border/70 bg-white px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 dark:border-white/10 dark:bg-[#2b313d]"
                        />
                      ) : (
                        <div
                          className="mt-3 w-full min-w-0 overflow-hidden text-ellipsis rounded-2xl border border-border/50 bg-white/80 px-4 py-3.5 text-sm font-normal whitespace-nowrap text-foreground dark:border-white/10 dark:bg-white/4"
                          title={[parsed.recipientName, parsed.recipientPhone, parsed.recipientAddress].filter(Boolean).join(" ") || "-"}
                        >
                          {[parsed.recipientName, parsed.recipientPhone, parsed.recipientAddress].filter(Boolean).join(" ") || "-"}
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* 破损补偿安排卡片 */}
                {(editForm.compensationStatus === "待补偿" || editForm.compensationStatus === "已补偿") && (
                  <div className="space-y-3 rounded-[20px] border border-amber-500/20 bg-linear-to-br from-amber-500/5 to-orange-500/5 p-4 shadow-sm dark:border-amber-500/30 dark:from-amber-500/6 dark:to-orange-500/3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-black tracking-tight text-amber-700 dark:text-amber-500 flex items-center gap-2">
                          <ClipboardList size={18} /> 破损补偿安排
                        </h4>
                        <p className="mt-1 text-xs font-medium text-muted-foreground/80">为少件、破损的货品单独安排发货并登记单号</p>
                      </div>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-white/70 px-3.5 py-2.5 shadow-sm dark:bg-white/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">补偿物流公司</div>
                        <CustomSelect
                          options={compensationLogisticsOptions}
                          value={editForm.compensationLogisticsName}
                          onChange={(val) => setEditForm((prev) => {
                            const nextLogistics = (val || "").trim();
                            const isNone = !nextLogistics || nextLogistics === "选择物流公司";
                            return {
                              ...prev,
                              compensationLogisticsName: isNone ? "" : nextLogistics,
                              ...(isNone ? { compensationTrackingNumber: "" } : {}),
                            };
                          })}
                          placeholder="选择物流公司"
                          disabled={!isEditing}
                          searchable
                          className="mt-1"
                          triggerClassName="h-9 w-full rounded-xl border border-border bg-white text-xs dark:border-white/10 dark:bg-[#2b313d] focus:ring-2 focus:ring-amber-500/20"
                          onAddNew={onAddNewLogistics}
                          addNewLabel="去新增"
                        />
                      </div>

                      <div className="rounded-2xl border border-border bg-white/70 px-3.5 py-2.5 shadow-sm dark:bg-white/5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">补偿快递单号</div>
                        {(() => {
                          const compLogName = (editForm.compensationLogisticsName || "").trim();
                          const isLogisticsSelected = compLogName && compLogName !== "选择物流公司";
                          return (
                            <input
                              type="text"
                              disabled={!isEditing || !isLogisticsSelected}
                              value={editForm.compensationTrackingNumber}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, compensationTrackingNumber: e.target.value }))}
                              placeholder={isLogisticsSelected ? "单独发出的快递单号" : "请先选择物流公司"}
                              className="mt-1 h-9 w-full rounded-xl border border-border bg-white px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-white/10 dark:bg-[#2b313d] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          );
                        })()}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">选择补偿商品及数量</div>
                      </div>
                      <div className="space-y-2.5 rounded-2xl border border-border bg-white/50 p-4 dark:border-white/5 dark:bg-white/5">
                        {editCompensationItems.length === 0 ? (
                          <div className="text-center py-4 text-xs text-muted-foreground">
                            {isEditing ? "暂无已选补偿，请通过下方的一键快速添加按钮进行添加" : "无补偿商品"}
                          </div>
                        ) : (
                          editCompensationItems.map((item) => {
                            const itemKey = item.itemKey;
                            const compQty = item.quantity;

                            return (
                              <div key={itemKey} className="flex items-center justify-between gap-4 py-1.5 border-b border-border/40 last:border-0 dark:border-white/5">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background">
                                    {item.image ? (
                                      <Image src={item.image} alt={item.name} width={32} height={32} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center">
                                        <Package size={12} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-semibold text-foreground">{splitShipmentDisplayName(item.name).baseName}</div>
                                    {splitShipmentDisplayName(item.name).variantLabel ? (
                                      <div className="mt-0.5 text-[10px] font-medium text-primary">{splitShipmentDisplayName(item.name).variantLabel}</div>
                                    ) : null}
                                    {item.sku && (
                                      <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">{item.sku}</div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  {isEditing ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditCompensationItems((prev) => {
                                            const exists = prev.find((i) => i.itemKey === itemKey);
                                            if (exists) {
                                              if (exists.quantity <= 1) {
                                                return prev.filter((i) => i.itemKey !== itemKey);
                                              }
                                              return prev.map((i) => i.itemKey === itemKey ? { ...i, quantity: i.quantity - 1 } : i);
                                            }
                                            return prev;
                                          });
                                        }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-xs font-bold text-amber-700 transition-all hover:bg-amber-50 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-amber-400"
                                      >
                                        -
                                      </button>
                                      <span className="w-8 text-center font-mono text-xs font-bold text-foreground">{compQty}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditCompensationItems((prev) =>
                                            prev.map((i) => i.itemKey === itemKey ? { ...i, quantity: i.quantity + 1 } : i)
                                          );
                                        }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-xs font-bold text-amber-700 transition-all hover:bg-amber-50 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-amber-400"
                                      >
                                        +
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditCompensationItems((prev) => prev.filter((i) => i.itemKey !== itemKey));
                                        }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-xs text-rose-500 hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-95 dark:border-white/10 dark:bg-white/5 dark:hover:bg-rose-500/10"
                                        title="删除此商品"
                                      >
                                        <X size={12} />
                                      </button>
                                    </>
                                  ) : (
                                    <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
                                      {compQty > 0 ? `补偿 ${compQty} 件` : "无补偿"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}

                        {isEditing && editItems.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-border/40 dark:border-white/5 space-y-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-500">一键快速添加补偿：</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {editItems.map((item) => (
                                <div key={getItemKey(item) || ""} className="flex flex-col gap-2 rounded-xl border border-border bg-white/40 p-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 dark:bg-white/3">
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-semibold text-foreground">{splitShipmentDisplayName(item.name).baseName}</div>
                                    {splitShipmentDisplayName(item.name).variantLabel ? (
                                      <div className="mt-0.5 text-[10px] font-medium text-primary">{splitShipmentDisplayName(item.name).variantLabel}</div>
                                    ) : null}
                                  </div>
                                  <div className="flex gap-1.5 shrink-0 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleAddCompensationBox(item)}
                                      className="rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-500/20 active:scale-95 transition-all dark:text-amber-400"
                                    >
                                      + 补彩盒
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAddCompensationOriginal(item)}
                                      className="rounded-lg bg-amber-600/10 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-600/20 active:scale-95 transition-all dark:text-amber-400"
                                    >
                                      + 补原商品
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-[20px] border border-border/50 bg-linear-to-br from-zinc-50 to-white p-4 shadow-sm dark:border-white/10 dark:from-white/6 dark:to-white/3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h4 className="text-base font-black tracking-tight text-foreground">货品明细</h4>
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">当前发货单包含的商品项目</p>
                    </div>
                    <span className="text-xs font-bold text-muted-foreground">共 {editItems.length} 项</span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex shrink-0 items-center gap-2 text-sm font-bold text-foreground">
                        <ListOrdered size={16} className="text-primary" /> {isEditing ? "已选货品" : "发货货品"}
                      </div>
                        <div className="flex items-center gap-1.5">
                        {editItems.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => void copyAllEditItems()}
                            className="flex h-8 items-center gap-1.5 rounded-xl bg-white/70 px-2.5 text-[11px] font-bold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary active:scale-95 dark:bg-white/5"
                          >
                            <Copy size={12} /> 复制全部
                          </button>
                        ) : null}
                        {isEditing ? (
                          <button
                            type="button"
                            onClick={() => setIsSelectionModalOpen(true)}
                            className="flex h-8 items-center gap-1.5 rounded-xl bg-primary/5 px-2.5 text-[11px] font-bold text-primary transition-all hover:bg-primary/10 active:scale-95"
                          >
                            <Plus size={12} /> 添加商品
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isEditing && editItems.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => setIsSelectionModalOpen(true)}
                        className="h-40 w-full rounded-2xl border-2 border-dashed border-border bg-white p-8 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:bg-transparent"
                      >
                        <div className="flex flex-col items-center justify-center gap-2 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted transition-colors">
                            <Plus size={20} />
                          </div>
                          <span className="text-sm font-bold">添加发货项目</span>
                          <span className="text-xs opacity-60">点击开始为这张发货单添加商品项目</span>
                        </div>
                      </button>
                    ) : null}

                    {editItems.length > 0 ? (
                      <div className="space-y-2">
                        {editItems.map((item, index) => (
                          <ShipmentItemRow
                            key={getStableShipmentItemKey(item, index)}
                            item={item}
                            isBatchMode={false}
                            isChecked={false}
                            onToggle={() => undefined}
                            onRemove={removeEditItem}
                            onUpdateManualQuantity={updateEditQuantity}
                            onUpdatePrice={updateEditPrice}
                            onUpdateShippingFee={updateEditShippingFee}
                            getItemKey={getStableShipmentActionKey}
                            showTrackingInput
                            onUpdateTrackingNumber={updateEditTrackingNumber}
                            onUpdateLogisticsName={updateEditLogisticsName}
                            onCopyItem={copyEditItem}
                            disabled={!isEditing}
                            logisticsOptions={getSingleRowLogisticsOptions(item.logisticsName)}
                            onAddNewLogistics={onAddNewLogistics}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {isEditing && (
              <div className="flex shrink-0 justify-end gap-2.5 border-t border-black/5 bg-zinc-50 px-4 py-3.5 dark:border-white/10 dark:bg-card/50 sm:px-5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="h-10 rounded-full border border-border bg-white px-5 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/40 active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="h-10 rounded-full bg-foreground px-5 text-sm font-black text-background shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 disabled:opacity-50 dark:text-black"
                >
                  {isSaving ? "正在保存..." : "保存修改"}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
      <ProductSelectionModal
        key="factory-shipment-detail-product-selection"
        isOpen={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        onSelect={(pickedProducts) => handleEditBatchAdd(pickedProducts)}
        showPrice={false}
        selectedIds={selectedProductIds}
        selectedBadgeLabel="已在发货单中"
        unselectedOnlyLabel="显示未添加"
        unselectedOnlyTitle="切换是否只显示当前发货单未添加的商品"
        fetchPath="/api/products"
        showPlatformSelector={false}
        query={{
          sortBy: "stock-desc",
          view: "picker",
          includeShopOnly: "true",
          includePublic: "true",
        }}
        loadAllOnOpen
        title="选择发货商品"
        inStockOnly={true}
      />
    </AnimatePresence>,
    document.body
  );
}

function FactoryShipmentCreateModal({
  isOpen,
  onClose,
  onCreated,
  logisticsOptions,
  onAddNewLogistics,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  logisticsOptions: { value: string; label: string }[];
  onAddNewLogistics: () => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState<ShipmentFormState>(createInitialForm);
  const [quickAddressInput, setQuickAddressInput] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedShipmentItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchConfirming, setBatchConfirming] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setForm(createInitialForm());
      setQuickAddressInput("");
      setSelectedItems([]);
      setBatchMode(false);
      setBatchSelected(new Set());
      setBatchConfirming(false);
    }
  }, [isOpen]);

  const updateForm = <K extends keyof ShipmentFormState>(key: K, value: ShipmentFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleQuickAddressChange = useCallback((nextValue: string, selectedCustomer?: CustomerAddressOption | null) => {
    setQuickAddressInput(nextValue);
    const parsed = parseQuickAddressInput(nextValue);

    setForm((prev) => {
      const next = {
        ...prev,
        recipientName: (selectedCustomer?.contactName || parsed.recipientName || "").trim(),
        recipientPhone: (selectedCustomer?.contactPhone || parsed.recipientPhone || "").trim(),
        recipientAddress: (selectedCustomer?.address || parsed.recipientAddress || "").trim(),
      };
      if (parsed.parsedDate) {
        next.date = parsed.parsedDate;
      }
      return next;
    });
  }, []);

  const shipmentDraftId = `FS-${form.date.replace(/-/g, "")}-${Math.max(selectedItems.length, 1)
    .toString()
    .padStart(3, "0")}`;
  const selectedProductIds = useMemo(
    () => selectedItems.map((item) => String(getItemKey(item))).filter(Boolean),
    [selectedItems]
  );

  const toggleBatchSelect = useCallback((itemKey: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemKey)) {
        next.delete(itemKey);
      } else {
        next.add(itemKey);
      }
      return next;
    });
  }, []);

  const batchDelete = useCallback(() => {
    setSelectedItems((prev) => prev.filter((item) => !batchSelected.has(getItemKey(item))));
    setBatchSelected(new Set());
    setBatchMode(false);
  }, [batchSelected]);

  const handleBatchAdd = (pickedProducts: Product[]) => {
    setSelectedItems((prev) => {
      const next = [...prev];

      for (const product of pickedProducts) {
        const itemKey = product.shopProductVariantId || product.productVariantId || product.shopProductId || product.id;
        if (next.some((item) => getItemKey(item) === itemKey)) continue;

        next.push({
          productId: product.productId || product.id,
          productVariantId: product.productVariantId || null,
          shopProductId: product.shopProductId || undefined,
          shopProductVariantId: product.shopProductVariantId || null,
          name: buildShipmentItemDisplayName(product),
          sku: product.sku || "",
          image: product.image || "",
          stock: Number(product.stock || 0),
          quantity: 1,
          price: product.salePrice ?? product.costPrice ?? 0,
          shippingFee: 0,
        });
      }

      return next;
    });
  };

  const updateManualQuantity = (itemKey: string, value: string) => {
    if (value.trim() === "") {
      setSelectedItems((prev) =>
        prev.map((item) =>
          getItemKey(item) === itemKey
            ? { ...item, quantity: 0 }
            : item
        )
      );
      return;
    }

    const quantity = Number.parseInt(value, 10) || 1;
    setSelectedItems((prev) =>
      prev.map((item) =>
        getItemKey(item) === itemKey
          ? { ...item, quantity: Math.max(0, Math.min(item.stock, quantity)) }
          : item
      )
    );
  };

  const updatePrice = (itemKey: string, value: string) => {
    const price = value === "" ? undefined : (Number(value) || 0);
    setSelectedItems((prev) =>
      prev.map((item) =>
        getItemKey(item) === itemKey ? { ...item, price } : item
      )
    );
  };

  const updateShippingFee = (itemKey: string, value: string) => {
    const shippingFee = value === "" ? undefined : (Number(value) || 0);
    setSelectedItems((prev) =>
      prev.map((item) =>
        getItemKey(item) === itemKey ? { ...item, shippingFee } : item
      )
    );
  };

  const removeItem = (itemKey: string) => {
    setSelectedItems((prev) => prev.filter((item) => getItemKey(item) !== itemKey));
  };

  const handleSubmit = async () => {
    const parsedAddress = parseQuickAddressInput(quickAddressInput);
    const finalForm = {
      ...form,
      recipientName: (parsedAddress.recipientName.trim() || form.recipientName.trim()),
      recipientPhone: (parsedAddress.recipientPhone.trim() || form.recipientPhone.trim()),
      recipientAddress: (parsedAddress.recipientAddress.trim() || form.recipientAddress.trim()),
      remark: [parsedAddress.remark.trim(), form.remark.trim()].filter(Boolean).join(" / "),
      trackingEntries: selectedItems.map((item) => ({
        itemKey: getItemKey(item),
        itemName: item.name,
        logisticsName: item.logisticsName || "",
        trackingNumber: item.trackingNumber || "",
        shippingFee: Number(item.shippingFee) || 0,
      })),
    };

    if (!form.date) {
      showToast("请选择发货日期", "error");
      return;
    }
    if (!finalForm.recipientName || !finalForm.recipientPhone || !finalForm.recipientAddress) {
      showToast("请直接粘贴完整收件信息，至少包含姓名、手机号和地址", "error");
      return;
    }
    if (selectedItems.length === 0) {
      showToast("请至少选择一件商品", "error");
      return;
    }
    if (selectedItems.some((item) => item.quantity <= 0)) {
      showToast("请填写所有商品数量，数量至少为 1", "error");
      return;
    }
    const invalidTrackingItem = selectedItems.find((item) => item.trackingNumber?.trim() && !hasSelectedLogisticsName(item.logisticsName));
    if (invalidTrackingItem) {
      showToast(`填写 ${invalidTrackingItem.name} 的快递单号前，请先选择物流公司`, "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const autoStatus = deriveFactoryShipmentStatusFromItems(selectedItems, form.status || "待发货");
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "FactoryShipment",
          status: autoStatus,
          date: form.date,
          note: buildFactoryShipmentNote(finalForm),
          items: selectedItems.map((item) => ({
            productId: item.productId,
            productVariantId: item.productVariantId,
            shopProductId: item.shopProductId,
            shopProductVariantId: item.shopProductVariantId,
            quantity: item.quantity,
            price: Number(item.price) || 0,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(formatFactoryShipmentError(data?.error || "创建发货单失败", selectedItems));
      showToast("发货记录已创建", "success");
      await onCreated();
      onClose();
    } catch (error) {
      console.error("Failed to create factory shipment:", error);
      showToast(error instanceof Error ? formatFactoryShipmentError(error.message, selectedItems) : "创建失败", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div key="factory-shipment-create-portal-container" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed left-1/2 top-1/2 z-10000 flex max-h-safe-modal w-[calc(100%-32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-border/50 bg-white shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-card/98"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-5 sm:p-8">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="flex items-center gap-2 truncate text-lg font-bold text-foreground sm:gap-3 sm:text-2xl">
                <Truck size={20} className="shrink-0 text-primary sm:h-6 sm:w-6" />
                <span className="truncate">新建发货记录</span>
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:space-y-8 sm:p-8">
              <div className="rounded-3xl border border-border/50 bg-muted/20 p-4 sm:p-6 dark:bg-white/5">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/50 bg-white/70 px-4 py-3 shadow-sm dark:bg-white/5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <FileText size={13} /> 单据编号
                      </div>
                      <div className="mt-2 truncate font-mono text-sm font-semibold text-foreground/80">{shipmentDraftId}</div>
                    </div>

                    <div className="rounded-2xl border border-border bg-white/70 px-4 py-3 shadow-sm dark:bg-white/5">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <Calendar size={13} /> 发货日期<span className="text-rose-500 ml-0.5 font-bold">*</span>
                      </div>
                      <div className="mt-2">
                        <DatePicker
                          value={form.date ? form.date.slice(0, 10) : ""}
                          onChange={(val) => {
                            updateForm("date", val);
                          }}
                          showClear={false}
                          className="h-10 w-full"
                          triggerClassName="h-10 rounded-xl border border-border bg-white dark:border-white/10 dark:bg-white/5"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-white/70 px-4 py-3 shadow-sm dark:bg-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <FileText size={13} /> 客户地址<span className="text-rose-500 ml-0.5 font-bold">*</span>
                    </div>
                    <div className="mt-2">
                      <CustomerAddressCombobox
                        value={quickAddressInput}
                        onChange={(value) => handleQuickAddressChange(value, null)}
                        onSelectCustomer={(customer) => handleQuickAddressChange(customer ? formatCustomerAddressLine(customer) : "", customer)}
                        placeholder="直接粘贴客户整串地址，系统会在后台自动拆解"
                        className="w-full h-10 rounded-xl border border-border bg-white px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>
                  </div>


                </div>
              </div>

              <div className="flex flex-col gap-3 px-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex shrink-0 items-center gap-2 text-sm font-bold text-foreground">
                    <ListOrdered size={16} className="text-primary" /> 发货项目<span className="text-rose-500 ml-0.5 font-bold">*</span> {selectedItems.length > 0 && `(${selectedItems.length})`}
                  </label>
                  {selectedItems.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {batchMode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = selectedItems.map((i) => getItemKey(i)).filter(Boolean);
                              const allSelected = allIds.every((id) => batchSelected.has(id));
                              setBatchSelected(allSelected ? new Set() : new Set(allIds));
                            }}
                            className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95 whitespace-nowrap"
                          >
                            {selectedItems.every((i) => batchSelected.has(getItemKey(i))) ? "取消全选" : "全选"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (batchConfirming) {
                                batchDelete();
                                setBatchConfirming(false);
                              } else {
                                setBatchConfirming(true);
                                setTimeout(() => setBatchConfirming(false), 3000);
                              }
                            }}
                            disabled={batchSelected.size === 0}
                            className={cn(
                              "flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none whitespace-nowrap",
                              batchConfirming
                                ? "text-white bg-rose-500 hover:bg-rose-600"
                                : "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20"
                            )}
                          >
                            <X size={12} /> {batchConfirming ? `确认删除？` : (batchSelected.size > 0 ? `删除 ${batchSelected.size}` : "删除")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBatchMode(false);
                              setBatchSelected(new Set());
                              setBatchConfirming(false);
                            }}
                            className="text-[11px] font-bold text-muted-foreground px-3 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setBatchMode(true)}
                          className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-all active:scale-95"
                        >
                          批量操作
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsSelectionModalOpen(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-primary/5 px-3 py-1.5 text-[11px] font-bold text-primary transition-all hover:bg-primary/10 active:scale-95"
                      >
                        <Plus size={12} /> 添加商品
                      </button>
                    </div>
                  )}
                </div>

                {selectedItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setIsSelectionModalOpen(true)}
                    className="h-48 w-full rounded-2xl border-2 border-dashed border-border bg-white p-8 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary dark:bg-transparent"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <Plus size={20} />
                      </div>
                      <span className="text-sm font-bold">添加发货货品</span>
                      <span className="text-xs opacity-60">点击开始为这张发货单添加商品</span>
                    </div>
                  </button>
                ) : (
                  <div className="space-y-3 max-h-[360px] overflow-y-auto px-1">
                    {selectedItems.map((item, index) => (
                      <ShipmentItemRow
                        key={getStableShipmentItemKey(item, index)}
                        item={item}
                        isBatchMode={batchMode}
                        isChecked={batchSelected.has(getItemKey(item))}
                        onToggle={toggleBatchSelect}
                        onRemove={removeItem}
                        onUpdateManualQuantity={updateManualQuantity}
                        onUpdatePrice={updatePrice}
                        onUpdateShippingFee={updateShippingFee}
                        getItemKey={getItemKey}
                        showShippingFee={false}
                        disabled={false}
                        logisticsOptions={logisticsOptions}
                        onAddNewLogistics={onAddNewLogistics}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/10 p-5 sm:p-8 bg-zinc-50 dark:bg-card/50 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-11 rounded-full border border-border bg-white px-6 text-sm font-bold text-muted-foreground hover:bg-muted/40 transition-all active:scale-95 disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || selectedItems.length === 0}
                className="h-11 rounded-full bg-foreground px-6 text-sm font-black text-background shadow-lg shadow-black/10 hover:-translate-y-0.5 hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 dark:text-black"
              >
                {isSubmitting ? "正在创建..." : "确认创建"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
      <ProductSelectionModal
        key="factory-shipment-create-product-selection"
        isOpen={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        onSelect={handleBatchAdd}
        showPrice={false}
        selectedIds={selectedProductIds}
        selectedBadgeLabel="已选发货"
        unselectedOnlyLabel="显示未选"
        unselectedOnlyTitle="切换是否只显示当前未选择的商品"
        fetchPath="/api/products"
        showPlatformSelector={false}
        query={{
          sortBy: "stock-desc",
          view: "picker",
          includeShopOnly: "true",
          includePublic: "true",
        }}
        loadAllOnOpen
        title="选择发货商品"
        inStockOnly={true}
      />
    </AnimatePresence>,
    document.body
  );
}

function FactoryShipmentBatchEditModal({
  isOpen,
  onClose,
  onConfirm,
  selectedCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (values: { paymentStatus: string; compensationStatus: string }) => void;
  selectedCount: number;
}) {
  const [paymentStatus, setPaymentStatus] = useState("keep");
  const [compensationStatus, setCompensationStatus] = useState("keep");

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({ paymentStatus, compensationStatus });
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-60000 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-gray-900/70"
        >
          <div className="flex items-center justify-between border-b border-border/10 p-6">
            <div>
              <h3 className="text-xl font-bold text-foreground">批量修改发货单</h3>
              <p className="mt-1 text-xs text-muted-foreground">已选择 {selectedCount} 张发货单</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">货款状态</label>
              <CustomSelect
                value={paymentStatus}
                onChange={setPaymentStatus}
                options={[
                  { value: "keep", label: "保持不变" },
                  { value: "未支付", label: "未支付" },
                  { value: "部分支付", label: "部分支付" },
                  { value: "已支付", label: "已支付" },
                ]}
                triggerClassName="h-10 w-full rounded-2xl border border-border bg-white px-3 text-sm dark:bg-white/5 dark:border-white/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">补偿状态</label>
              <CustomSelect
                value={compensationStatus}
                onChange={setCompensationStatus}
                options={[
                  { value: "keep", label: "保持不变" },
                  { value: "", label: "无需补偿" },
                  { value: "待补偿", label: "待补偿" },
                  { value: "已补偿", label: "已补偿" },
                ]}
                triggerClassName="h-10 w-full rounded-2xl border border-border bg-white px-3 text-sm dark:bg-white/5 dark:border-white/10"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border/10 p-6 bg-zinc-50 dark:bg-card/50">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full border border-border bg-white px-5 text-sm font-bold text-muted-foreground hover:bg-muted/40 transition-all active:scale-95 dark:border-white/10 dark:bg-white/5"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="h-10 rounded-full bg-foreground px-5 text-sm font-black text-background hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 dark:text-black"
            >
              确认修改
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

export default function FactoryShipmentsPage() {
  const { showToast } = useToast();
  const [logisticsList, setLogisticsList] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [isQuickLogisticsOpen, setIsQuickLogisticsOpen] = useState(false);
  const [quickLogisticsName, setQuickLogisticsName] = useState("");
  const [isQuickLogisticsSubmitting, setIsQuickLogisticsSubmitting] = useState(false);

  const fetchLogistics = useCallback(async () => {
    try {
      const res = await fetch("/api/logistics");
      if (res.ok) {
        const data = await res.json();
        setLogisticsList(data);
      }
    } catch (err) {
      console.error("Failed to fetch logistics:", err);
    }
  }, []);

  useEffect(() => {
    void fetchLogistics();
  }, [fetchLogistics]);

  const logisticsOptions = useMemo(() => {
    return logisticsList.map((item) => ({
      value: item.name,
      label: item.name,
    }));
  }, [logisticsList]);

  const handleQuickCreateLogistics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLogisticsName.trim()) return;
    setIsQuickLogisticsSubmitting(true);
    try {
      const res = await fetch("/api/logistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: quickLogisticsName.trim() }),
      });
      if (res.ok) {
        showToast("物流公司创建成功", "success");
        setQuickLogisticsName("");
        setIsQuickLogisticsOpen(false);
        await fetchLogistics();
      } else {
        const err = await res.json();
        showToast(err.error || "创建失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    } finally {
      setIsQuickLogisticsSubmitting(false);
    }
  };

  const [shipmentOrders, setShipmentOrders] = useState<OutboundOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [shippingFilter, setShippingFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [compensationFilter, setCompensationFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OutboundOrder | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/outbound?scope=factory-shipments&excludeReturned=1");
      if (!res.ok) throw new Error("加载发货记录失败");
      const data = await res.json();
      setShipmentOrders(data || []);
    } catch (error) {
      console.error("Failed to fetch factory shipments:", error);
      showToast("加载发货记录失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const handleQuickUpdateStatus = useCallback(async (
    order: OutboundOrder,
    field: "paymentStatus" | "compensationStatus",
    value: string
  ) => {
    setUpdatingOrderId(order.id);
    try {
      const parsed = parseFactoryShipmentNote(order.note);
      
      const notePayload: FactoryShipmentNotePayload = {
        recipientName: parsed.recipientName,
        recipientPhone: parsed.recipientPhone,
        recipientAddress: parsed.recipientAddress,
        paymentStatus: parsed.paymentStatus,
        compensationStatus: parsed.compensationStatus,
        compensationLogisticsName: parsed.compensationLogisticsName,
        compensationTrackingNumber: parsed.compensationTrackingNumber,
        compensationItems: parsed.compensationItems,
        trackingEntries: parsed.trackingEntries,
        remark: parsed.remark,
      };

      if (field === "paymentStatus") {
        notePayload.paymentStatus = value;
      } else if (field === "compensationStatus") {
        notePayload.compensationStatus = value;
      }

      if (field === "compensationStatus" && value === "") {
        notePayload.compensationLogisticsName = "";
        notePayload.compensationTrackingNumber = "";
        notePayload.compensationItems = [];
      }

      const res = await fetch(`/api/outbound/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: deriveFactoryShipmentStatusFromOrder(order, parsed),
          notePayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "更新失败");
      }

      showToast("状态更新成功", "success");
      void fetchOrders();
    } catch (error) {
      console.error("Quick update failed:", error);
      showToast(error instanceof Error ? error.message : "状态更新失败", "error");
    } finally {
      setUpdatingOrderId(null);
    }
  }, [fetchOrders, showToast]);

  const handleReturnOrder = useCallback((order: OutboundOrder) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除发货记录",
      message: `确定要删除此发货记录吗？此操作将从列表中移除该单据，并在后台安全回退其扣减的商品库存。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/outbound/${order.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "前台用户手动撤回" }),
          });
          if (res.ok) {
            showToast("发货已成功退回，库存已回退", "success");
            void fetchOrders();
          } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.error || "退回失败", "error");
          }
        } catch (error) {
          console.error("Return outbound order failed:", error);
          showToast("网络错误，退回失败", "error");
        }
      }
    });
  }, [fetchOrders, showToast]);

  const handleBatchReturnOrders = useCallback(() => {
    const selectedOrders = shipmentOrders.filter((order) => selectedOrderIds.includes(order.id));
    if (selectedOrders.length === 0) return;

    const returnableOrders = selectedOrders.filter((order) => order.status !== "Returned" && order.status !== "已退回");

    if (returnableOrders.length === 0) {
      showToast("所选单据均已是退回状态，无需重复操作", "warning");
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: "批量删除发货记录",
      message: `确定要批量删除已勾选的 ${returnableOrders.length} 张发货记录吗？此操作将从列表中移除这些单据，并在后台安全回退其扣减的商品库存。`,
      onConfirm: async () => {
        try {
          const results = await Promise.allSettled(
            returnableOrders.map((order) =>
              fetch(`/api/outbound/${order.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "批量退货入库" }),
              }).then(async (res) => {
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error || `操作失败: ${order.id}`);
                }
                return order.id;
              })
            )
          );

          const successIds = results
            .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
            .map((result) => result.value);
          const failedCount = results.length - successIds.length;

          if (successIds.length > 0) {
            setSelectedOrderIds((prev) => prev.filter((id) => !successIds.includes(id)));
            void fetchOrders();
          }

          if (failedCount > 0) {
            showToast(`已成功退回 ${successIds.length} 张，失败 ${failedCount} 张`, "error");
          } else {
            showToast(`已成功退回 ${successIds.length} 张发货单，库存已全部扣减回退`, "success");
          }
        } catch (error) {
          console.error("Batch return outbound orders failed:", error);
          showToast("批量退回失败", "error");
        }
      }
    });
  }, [shipmentOrders, selectedOrderIds, fetchOrders, showToast]);

  const handleBatchUpdate = useCallback(async (values: { paymentStatus: string; compensationStatus: string }) => {
    const selectedOrders = shipmentOrders.filter((order) => selectedOrderIds.includes(order.id));
    if (selectedOrders.length === 0) return;

    const nextPaymentStatus = values.paymentStatus === "keep" ? "" : values.paymentStatus;
    const nextCompensationStatus = values.compensationStatus === "keep" ? "__keep__" : values.compensationStatus;

    if (!nextPaymentStatus && nextCompensationStatus === "__keep__") {
      showToast("请选择至少一项要批量修改的内容", "info");
      return;
    }

    const eligibleOrders = selectedOrders.filter((order) => {
      const parsed = parseFactoryShipmentNote(order.note);
      const paymentChanged = nextPaymentStatus && (parsed.paymentStatus || "未支付") !== nextPaymentStatus;
      const compensationChanged = nextCompensationStatus !== "__keep__" && (parsed.compensationStatus || "") !== nextCompensationStatus;
      return Boolean(paymentChanged || compensationChanged);
    });
    const skippedCount = selectedOrders.length - eligibleOrders.length;

    if (eligibleOrders.length === 0) {
      showToast("所选单据状态已与批量设置一致，无需重复操作", "info");
      return;
    }

    try {
      const results = await Promise.allSettled(
        eligibleOrders.map((order) => {
          const parsed = parseFactoryShipmentNote(order.note);
          const finalStatus = deriveFactoryShipmentStatusFromOrder(order, parsed);
          
          let compStatus = parsed.compensationStatus;
          let compLogName = parsed.compensationLogisticsName;
          let compTrackNum = parsed.compensationTrackingNumber;
          let compItems = parsed.compensationItems;

          if (nextCompensationStatus !== "__keep__") {
            compStatus = nextCompensationStatus;
          }

          // 联动清空校验
          if (!canKeepShipmentExtras(finalStatus) || compStatus === "") {
            compStatus = "";
            compLogName = "";
            compTrackNum = "";
            compItems = [];
          }

          return fetch(`/api/outbound/${order.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: finalStatus,
              notePayload: {
                recipientName: parsed.recipientName || "",
                recipientPhone: parsed.recipientPhone || "",
                recipientAddress: parsed.recipientAddress || "",
                remark: parsed.remark || "",
                paymentStatus: nextPaymentStatus || (parsed.paymentStatus || "未支付"),
                compensationStatus: compStatus,
                compensationLogisticsName: compLogName,
                compensationTrackingNumber: compTrackNum,
                compensationItems: compItems,
                trackingEntries: parsed.trackingEntries || [],
              },
            }),
          }).then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(data?.error || `更新失败: ${order.id}`);
            }
            return order.id;
          });
        })
      );

      const successIds = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value);
      const failedCount = results.length - successIds.length;

      if (successIds.length > 0) {
        setSelectedOrderIds((prev) => prev.filter((id) => !successIds.includes(id)));
        setIsBatchEditOpen(false);
        void fetchOrders();
      }

      if (failedCount > 0) {
        showToast(`已批量修改 ${successIds.length} 张，失败 ${failedCount} 张`, "error");
      } else {
        showToast(
          `已成功批量修改 ${successIds.length} 张发货单${skippedCount > 0 ? `，跳过 ${skippedCount} 张` : ""}`,
          "success"
        );
      }
    } catch (error) {
      console.error("Batch update factory shipments failed:", error);
      showToast("批量修改失败", "error");
    }
  }, [shipmentOrders, selectedOrderIds, fetchOrders, showToast]);

  const filteredOrders = useMemo(() => {
    return shipmentOrders.filter((order) => {
      const parsed = parseFactoryShipmentNote(order.note);
      const derivedStatus = deriveFactoryShipmentStatusFromOrder(order, parsed);
      const orderDate = order.date ? format(parseSafeDate(order.date), "yyyy-MM-dd") : "";
      const query = searchQuery.trim();
      const itemNames = order.items.map(
        (item) => item.shopProduct?.name || item.product?.name || ""
      );

      const matchesSearch =
        !query ||
        pinyinMatch(parsed.recipientName || "", query) ||
        pinyinMatch(parsed.recipientPhone || "", query) ||
        pinyinMatch(parsed.recipientAddress || "", query) ||
        pinyinMatch(derivedStatus, query) ||
        pinyinMatch(parsed.paymentStatus || "", query) ||
        pinyinMatch(parsed.compensationStatus || "", query) ||
        itemNames.some((name) => pinyinMatch(name, query));
      const matchesShipping = shippingFilter === "all" || derivedStatus === shippingFilter;
      const matchesPayment = paymentFilter === "all" || parsed.paymentStatus === paymentFilter;
      const matchesCompensation =
        compensationFilter === "all" || parsed.compensationStatus === compensationFilter;
      const matchesStart = !startDate || orderDate >= startDate;
      const matchesEnd = !endDate || orderDate <= endDate;
      return matchesSearch && matchesShipping && matchesPayment && matchesCompensation && matchesStart && matchesEnd;
    });
  }, [compensationFilter, endDate, paymentFilter, searchQuery, shipmentOrders, shippingFilter, startDate]);

  const stats = useMemo(() => {
    const totalQuantity = shipmentOrders.reduce((sum, order) => sum + formatQuantity(order), 0);
    const unpaidCount = shipmentOrders.filter((order) => {
      const parsed = parseFactoryShipmentNote(order.note);
      return parsed.paymentStatus !== "已支付";
    }).length;
    const pendingCompensation = shipmentOrders.filter((order) => {
      const parsed = parseFactoryShipmentNote(order.note);
      return parsed.compensationStatus === "待补偿";
    }).length;
    const recipientCount = new Set(
      shipmentOrders.map((order) => parseFactoryShipmentNote(order.note).recipientName).filter(Boolean)
    ).size;

    return {
      totalCount: shipmentOrders.length,
      totalQuantity,
      unpaidCount,
      pendingCompensation,
      recipientCount,
    };
  }, [shipmentOrders]);

  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, shippingFilter, paymentFilter, compensationFilter, startDate, endDate, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const hasActiveFilters = Boolean(
    searchQuery || shippingFilter !== "all" || paymentFilter !== "all" || compensationFilter !== "all" || startDate || endDate
  );

  const selectableFilteredOrderIds = useMemo(
    () => filteredOrders.filter((order) => !isReturnedShipmentOrder(order)).map((order) => order.id),
    [filteredOrders]
  );

  const toggleOrderSelection = useCallback((id: string) => {
    const targetOrder = shipmentOrders.find((order) => order.id === id);
    if (!targetOrder || isReturnedShipmentOrder(targetOrder)) return;
    setSelectedOrderIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }, [shipmentOrders]);

  useEffect(() => {
    setSelectedOrderIds((prev) => prev.filter((id) => {
      const order = shipmentOrders.find((item) => item.id === id);
      return order ? !isReturnedShipmentOrder(order) : false;
    }));
  }, [shipmentOrders]);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="mb-6 flex flex-col items-start justify-between gap-3 transition-all sm:flex-row sm:items-center md:mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">发货记录</h1>
          <p className="mt-2 hidden text-sm text-muted-foreground lg:block lg:text-lg">
            统一登记发货记录，跟进厂家发货与货款、补偿状态。
          </p>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {selectedOrderIds.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBatchEditOpen(true)}
              className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-white px-4 text-xs font-bold text-muted-foreground shadow-sm transition-all hover:bg-muted/40 active:scale-95 md:h-10 md:px-5 md:text-sm dark:border-white/10 dark:bg-white/5"
            >
              批量修改
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:-translate-y-0.5 hover:shadow-primary/50 active:scale-95 md:h-10 md:px-6 md:text-sm"
          >
            <Plus size={16} />
            新建发货单
          </button>
        </div>
      </div>

      <section className="mb-5 md:mb-6">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <FactoryMetricCard
            label="发货单数"
            value={`${stats.totalCount}`}
            hint={`涉及 ${stats.recipientCount} 位收件人`}
            icon={<Truck size={18} className="text-sky-600 dark:text-sky-400" />}
            accentClassName="border-sky-500/15 bg-sky-500/10"
          />
          <FactoryMetricCard
            label="发货件数"
            value={`${stats.totalQuantity}`}
            hint="累计登记的出货总件数"
            icon={<Package size={18} className="text-emerald-600 dark:text-emerald-400" />}
            accentClassName="border-emerald-500/15 bg-emerald-500/10"
          />
          <FactoryMetricCard
            label="待收货款"
            value={`${stats.unpaidCount}`}
            hint="未支付和部分支付单据"
            icon={<Wallet size={18} className="text-amber-600 dark:text-amber-400" />}
            accentClassName="border-amber-500/15 bg-amber-500/10"
          />
          <FactoryMetricCard
            label="待补偿"
            value={`${stats.pendingCompensation}`}
            hint="仍需跟进破损补偿的单据"
            icon={<ClipboardList size={18} className="text-violet-600 dark:text-violet-400" />}
            accentClassName="border-violet-500/15 bg-violet-500/10"
          />
        </div>
      </section>

      <FactoryShipmentFilters
        searchQuery={searchQuery}
        shippingFilter={shippingFilter}
        paymentFilter={paymentFilter}
        compensationFilter={compensationFilter}
        startDate={startDate}
        endDate={endDate}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchQuery}
        onShippingChange={setShippingFilter}
        onPaymentChange={setPaymentFilter}
        onCompensationChange={setCompensationFilter}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onReset={() => {
          setSearchQuery("");
          setShippingFilter("all");
          setPaymentFilter("all");
          setCompensationFilter("all");
          setStartDate("");
          setEndDate("");
        }}
      />

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5 xl:block">
        <div className="overflow-auto max-h-[calc(100dvh-220px-env(safe-area-inset-bottom,0))]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <p className="text-sm font-medium text-muted-foreground">正在加载发货记录...</p>
            </div>
          ) : paginatedOrders.length > 0 ? (
            <table className="w-full min-w-[940px] table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[44px]" />
                <col className="w-[60px]" />
                <col className="w-[126px]" />
                <col className="w-[96px]" />
                <col className="w-[220px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[96px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 backdrop-blur">
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-[44px] px-1 py-3 text-center align-middle">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedOrderIds.length === selectableFilteredOrderIds.length) {
                            setSelectedOrderIds([]);
                          } else {
                            setSelectedOrderIds(selectableFilteredOrderIds);
                          }
                        }}
                        className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all duration-300 lg:h-5 lg:w-5 ${
                          selectedOrderIds.length === selectableFilteredOrderIds.length && selectableFilteredOrderIds.length > 0
                            ? "scale-110 border-foreground bg-foreground text-background shadow-lg shadow-black/10 dark:text-black"
                            : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                        }`}
                      >
                        {selectedOrderIds.length === selectableFilteredOrderIds.length && selectableFilteredOrderIds.length > 0 ? (
                          <Check size={12} strokeWidth={4} />
                        ) : null}
                      </button>
                    </div>
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">序号</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">发货时间</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">收件人</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">货品概览</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">发货状态</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">货款状态</th>
                  <th className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedOrders.map((order, index) => {
                  const parsed = parseFactoryShipmentNote(order.note);
                  const derivedStatus = deriveFactoryShipmentStatusFromOrder(order, parsed);
                  const isReturned = isReturnedShipmentOrder(order);
                  return (
                    <tr key={order.id} className="transition-colors hover:bg-muted/20">
                      <td className="w-[44px] px-1 py-3 text-center align-middle">
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOrderSelection(order.id);
                            }}
                            disabled={isReturned}
                            className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all duration-300 lg:h-5 lg:w-5 ${
                              selectedOrderIds.includes(order.id)
                                ? "scale-110 border-foreground bg-foreground text-background shadow-lg shadow-black/10 dark:text-black"
                                : isReturned
                                  ? "cursor-not-allowed border-gray-200 bg-muted/50 opacity-45 dark:border-white/10 dark:bg-white/[0.03]"
                                  : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                            }`}
                            title={isReturned ? "已退回单据不可勾选" : (selectedOrderIds.includes(order.id) ? "取消选择" : "选择此发货单")}
                          >
                            {selectedOrderIds.includes(order.id) ? <Check size={12} strokeWidth={4} /> : null}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-xs font-bold text-muted-foreground">
                        {(currentPage - 1) * pageSize + index + 1}
                      </td>
                      <td className="px-4 py-4 text-center text-xs text-muted-foreground">
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <Calendar size={14} className="shrink-0 text-muted-foreground/75" />
                          <span className="font-mono tabular-nums">{format(parseSafeDate(order.date), "yyyy-MM-dd HH:mm", { locale: zhCN })}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-sm font-normal text-foreground">
                        <div className="flex flex-col items-center gap-1">
                          <span className="truncate" title={[parsed.recipientName, parsed.recipientAddress].filter(Boolean).join(" ")}>
                            {formatRecipientWithRegion(parsed.recipientName, parsed.recipientAddress)}
                          </span>
                          {parsed.compensationStatus && (
                            <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold leading-none", getCompensationTone(parsed.compensationStatus))}>
                              {parsed.compensationStatus}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-sm">
                        <div className="mx-auto flex max-w-[220px] flex-wrap justify-center gap-1.5">
                          {(() => {
                            const isCompensation = false;
                            const listItems = isCompensation
                              ? (parsed.compensationItems || []).map((cItem) => {
                                  const matched = order.items.find(
                                    (oItem) =>
                                      (oItem.shopProductId || oItem.shopProduct?.id || oItem.productId || oItem.shopProduct?.productId || oItem.product?.id || "") === cItem.itemKey
                                  );
                                  return {
                                    id: cItem.itemKey,
                                    name: resolveShipmentSummaryItemName(matched || {}),
                                    image: matched?.shopProduct?.image || matched?.product?.image || "",
                                    quantity: cItem.quantity,
                                    isShipped: parsed.compensationStatus === "已补偿",
                                  };
                                })
                              : order.items.map((item) => ({
                                  id: item.id,
                                  name: resolveShipmentSummaryItemName(item),
                                  image: item.shopProduct?.image || item.product?.image || "",
                                  quantity: item.quantity,
                                  isShipped: isShipmentItemMarkedShipped(item, parsed, derivedStatus),
                                }));

                            return (
                              <>
                                {listItems.slice(0, 2).map((item) => (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      "flex min-w-0 max-w-[170px] items-center gap-1.5 rounded-full border p-0.5 pr-2 shadow-sm transition-all hover:border-primary/30",
                                      item.isShipped
                                        ? "border-emerald-500/55 bg-emerald-500/6 dark:bg-emerald-500/10"
                                        : "border-border/50 bg-secondary/30 dark:bg-white/5"
                                    )}
                                    title={`${item.name}${item.isShipped ? " - 已发" : ""}`}
                                  >
                                    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                      {item.image ? (
                                        <Image src={item.image} alt="" fill className="object-cover" sizes="24px" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package size={12} className="text-muted-foreground/50" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="truncate text-[10px] font-medium leading-none text-foreground/80">
                                      {splitShipmentDisplayName(item.name).baseName}
                                      {splitShipmentDisplayName(item.name).variantLabel ? ` / ${splitShipmentDisplayName(item.name).variantLabel}` : ""}
                                    </span>
                                    <span className="shrink-0 text-[10px] font-black leading-none text-primary">x{item.quantity}</span>
                                  </div>
                                ))}
                                {listItems.length > 2 && (
                                  <div className="flex h-7 items-center justify-center rounded-full border border-border/50 bg-muted/50 px-3 text-[10px] font-bold text-muted-foreground">
                                    +{listItems.length - 2}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "inline-flex h-8.5 min-w-24 items-center justify-center rounded-full border px-2.5 py-1 text-xs font-normal shadow-xs",
                          getShippingTone(derivedStatus)
                        )}>
                          {derivedStatus}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div onClick={(e) => e.stopPropagation()} className="inline-flex justify-center w-full">
                          <CustomSelect
                            value={parsed.paymentStatus || "未支付"}
                            onChange={(val) => handleQuickUpdateStatus(order, "paymentStatus", val)}
                            options={paymentStatusOptions}
                            disabled={updatingOrderId === order.id}
                            className="w-24"
                            triggerClassName={cn(
                              "inline-flex h-8.5 w-full items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-105 cursor-pointer shadow-xs",
                              getPaymentTone(parsed.paymentStatus || "未支付"),
                              updatingOrderId === order.id && "opacity-50"
                            )}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDetailOrder(order); }}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 shadow-sm transition-all group/btn hover:bg-blue-500 hover:text-white dark:text-blue-400"
                            title="发货详情"
                          >
                            <Eye size={16} className="group-hover/btn:scale-110 transition-transform" />
                          </button>
                          {order.status !== "Returned" && order.status !== "已退回" && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleReturnOrder(order); }}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 shadow-sm transition-all group/btn hover:bg-red-500 hover:text-white dark:text-red-400"
                              title="删除"
                            >
                              <Trash2 size={16} className="group-hover/btn:scale-110 transition-transform" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-border bg-muted/30 text-muted-foreground/50">
                <Truck size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-foreground">暂无发货记录</h3>
              <p className="mt-2 max-w-70 text-sm leading-relaxed text-muted-foreground">
                {hasActiveFilters ? "当前筛选条件下没有记录，试试调整筛选条件。" : "还没有发货记录，点击右上角新建发货单开始。"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 xl:hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="text-sm font-medium text-muted-foreground">加载中...</p>
          </div>
        ) : paginatedOrders.length > 0 ? (
          paginatedOrders.map((order, index) => {
            const parsed = parseFactoryShipmentNote(order.note);
            const derivedStatus = deriveFactoryShipmentStatusFromOrder(order, parsed);
            const isReturned = isReturnedShipmentOrder(order);
            return (
              <div
                key={order.id}
                onClick={() => setDetailOrder(order)}
                className={cn(
                  "w-full cursor-pointer rounded-[22px] border border-border bg-white/80 p-3.5 text-left shadow-sm transition-all active:scale-[0.99] dark:border-white/10 dark:bg-white/4",
                  selectedOrderIds.includes(order.id) && "border-foreground/25 bg-foreground/[0.03] dark:border-white/20 dark:bg-white/[0.07]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {!isReturned ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOrderSelection(order.id);
                          }}
                          className={cn(
                            "relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                            selectedOrderIds.includes(order.id)
                              ? "scale-110 border-foreground bg-foreground text-background shadow-lg shadow-black/10 dark:text-black"
                              : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                          )}
                          title={selectedOrderIds.includes(order.id) ? "取消选择" : "选择此发货单"}
                        >
                          {selectedOrderIds.includes(order.id) ? <Check size={12} strokeWidth={4} /> : null}
                        </button>
                      ) : null}
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-black text-foreground dark:bg-white/8 dark:text-white">
                        {(currentPage - 1) * pageSize + index + 1}
                      </span>
                      <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 text-[10px] font-normal leading-none text-muted-foreground dark:border-white/8 dark:bg-white/6">
                        <span>{format(parseSafeDate(order.date), "MM-dd")}</span>
                        <span>{format(parseSafeDate(order.date), "HH:mm")}</span>
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-normal text-foreground" title={[parsed.recipientName, parsed.recipientAddress].filter(Boolean).join(" ")}>
                          {formatRecipientWithRegion(parsed.recipientName, parsed.recipientAddress)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className={cn(
                      "inline-flex h-7 min-w-20 items-center justify-center rounded-full border px-2.5 text-[11px] font-normal shadow-xs",
                      getShippingTone(derivedStatus)
                    )}>
                      {derivedStatus}
                    </span>
                  </div>
                </div>
                <div className="mt-3 rounded-[18px] border border-border/40 bg-muted/25 p-2.5 dark:border-white/6 dark:bg-white/4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">货品概览</span>
                    {parsed.compensationStatus && (
                      <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold leading-none", getCompensationTone(parsed.compensationStatus))}>
                        {parsed.compensationStatus}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(() => {
                      const isCompensation = false;
                      const listItems = isCompensation
                        ? (parsed.compensationItems || []).map((cItem) => {
                            const matched = order.items.find(
                              (oItem) =>
                                (oItem.shopProductId || oItem.shopProduct?.id || oItem.productId || oItem.shopProduct?.productId || oItem.product?.id || "") === cItem.itemKey
                            );
                            return {
                              id: cItem.itemKey,
                              name: resolveShipmentSummaryItemName(matched || {}),
                              image: matched?.shopProduct?.image || matched?.product?.image || "",
                              quantity: cItem.quantity,
                              isShipped: parsed.compensationStatus === "已补偿",
                            };
                          })
                        : order.items.map((item) => ({
                            id: item.id,
                            name: resolveShipmentSummaryItemName(item),
                            image: item.shopProduct?.image || item.product?.image || "",
                            quantity: item.quantity,
                            isShipped: isShipmentItemMarkedShipped(item, parsed, derivedStatus),
                          }));

                      return (
                        <>
                          {listItems.slice(0, 4).map((item) => (
                            <span
                              key={item.id}
                              className={cn(
                                "inline-flex min-w-0 items-center gap-1.5 rounded-full border p-0.5 pr-2 text-[10px] font-medium text-foreground",
                                item.isShipped
                                  ? "border-emerald-500/55 bg-emerald-500/6 dark:bg-emerald-500/10"
                                  : "border-border/50 bg-white/70 dark:border-white/8 dark:bg-white/6"
                              )}
                              title={item.isShipped ? `${item.name} 已发` : item.name}
                            >
                              <div className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                {item.image ? (
                                  <Image src={item.image} alt="" fill sizes="20px" className="object-cover" />
                                ) : (
                                  <Package size={10} className="text-muted-foreground/50" />
                                )}
                              </div>
                              <span className="min-w-0 flex-1 truncate">
                                {splitShipmentDisplayName(item.name).baseName}
                                {splitShipmentDisplayName(item.name).variantLabel ? ` / ${splitShipmentDisplayName(item.name).variantLabel}` : ""}
                              </span>
                              <span className="shrink-0 font-black text-primary">x{item.quantity}</span>
                            </span>
                          ))}
                          {listItems.length > 4 && (
                            <span className="inline-flex items-center justify-center rounded-full border border-border/50 bg-muted/50 px-2 py-1 text-[10px] font-bold text-muted-foreground dark:border-white/8">
                              另有 {listItems.length - 4} 项
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className={cn(
                  "mt-3 grid items-center gap-1.5 border-t border-border/30 pt-2 dark:border-white/6",
                  isReturned
                    ? "grid-cols-[96px_minmax(84px,1fr)_44px] min-[390px]:grid-cols-[116px_minmax(92px,1fr)_44px]"
                    : "grid-cols-[96px_minmax(84px,1fr)_44px_40px] min-[390px]:grid-cols-[116px_minmax(92px,1fr)_44px_40px]"
                )}>
                  <div className="flex h-11 min-w-0 items-center rounded-2xl border border-border/40 bg-muted/25 px-2.5 dark:border-white/6 dark:bg-white/4">
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/75">合计</div>
                      <div className="mt-0.5 text-sm font-black leading-none text-foreground">{formatQuantity(order)} 件</div>
                    </div>
                  </div>
                  <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                    <CustomSelect
                      value={parsed.paymentStatus || "未支付"}
                      onChange={(val) => handleQuickUpdateStatus(order, "paymentStatus", val)}
                      options={paymentStatusOptions}
                      disabled={updatingOrderId === order.id}
                      className="w-full"
                      triggerClassName={cn(
                        "inline-flex h-11 w-full items-center justify-center rounded-2xl border px-1.5 py-0 text-[11px] font-bold transition-all active:scale-95 cursor-pointer shadow-sm",
                        getPaymentTone(parsed.paymentStatus || "未支付"),
                        updatingOrderId === order.id && "opacity-50"
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailOrder(order);
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 shadow-sm transition-all active:scale-95 hover:bg-blue-500 hover:text-white dark:bg-blue-500/12 dark:text-blue-300"
                    title="查看详情"
                  >
                    <Eye size={18} />
                  </button>
                  {order.status !== "Returned" && order.status !== "已退回" ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReturnOrder(order);
                      }}
                      className="flex h-11 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 shadow-sm transition-all active:scale-95 hover:bg-red-500 hover:text-white dark:bg-red-500/12 dark:text-red-300"
                      title="删除"
                    >
                      <Trash2 size={18} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={<Truck size={36} strokeWidth={1.5} />}
            title="暂无发货记录"
            description={hasActiveFilters ? "没有筛到结果，换个条件试试。" : "先新建一张发货单吧。"}
            className="py-16"
          />
        )}
      </div>

      {!isLoading && totalItems > 0 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}

      <FactoryShipmentCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={fetchOrders}
        logisticsOptions={logisticsOptions}
        onAddNewLogistics={() => setIsQuickLogisticsOpen(true)}
      />
      <FactoryShipmentDetailModal
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onUpdated={async () => {
          await fetchOrders();
        }}
        logisticsOptions={logisticsOptions}
        onAddNewLogistics={() => setIsQuickLogisticsOpen(true)}
      />

      <ActionBar
        selectedCount={selectedOrderIds.length}
        totalCount={selectableFilteredOrderIds.length}
        onToggleSelectAll={() => {
          if (selectedOrderIds.length === selectableFilteredOrderIds.length) {
            setSelectedOrderIds([]);
          } else {
            setSelectedOrderIds(selectableFilteredOrderIds);
          }
        }}
        onClear={() => setSelectedOrderIds([])}
        label="张发货单"
        onDelete={handleBatchReturnOrders}
        onEdit={() => setIsBatchEditOpen(true)}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel="确认"
      />

      <FactoryShipmentBatchEditModal
        key={isBatchEditOpen ? "open" : "closed"}
        isOpen={isBatchEditOpen}
        onClose={() => setIsBatchEditOpen(false)}
        onConfirm={handleBatchUpdate}
        selectedCount={selectedOrderIds.length}
      />

      {/* 极简新增物流公司弹窗 */}
      {isQuickLogisticsOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-70000 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsQuickLogisticsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-gray-900/70"
            >
              <div className="flex items-center justify-between border-b border-border/10 p-5">
                <h3 className="text-base font-bold text-foreground">快速新增物流公司</h3>
                <button
                  onClick={() => setIsQuickLogisticsOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleQuickCreateLogistics} className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground">公司名称 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={quickLogisticsName}
                    onChange={(e) => setQuickLogisticsName(e.target.value)}
                    placeholder="例如：中通快递"
                    className="h-9 w-full rounded-xl border border-border bg-white px-3 text-xs text-foreground outline-none ring-1 ring-transparent transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-border/10 pt-4 mt-4 bg-zinc-50/50 -mx-5 -mb-5 p-5 dark:bg-card/30">
                  <button
                    type="button"
                    onClick={() => setIsQuickLogisticsOpen(false)}
                    className="h-9 rounded-full border border-border bg-white px-4 text-xs font-bold text-muted-foreground hover:bg-muted/40 transition-all active:scale-95 dark:border-white/10 dark:bg-white/5"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={isQuickLogisticsSubmitting || !quickLogisticsName.trim()}
                    className="h-9 min-w-[70px] rounded-full bg-foreground px-4 text-xs font-black text-background hover:-translate-y-0.5 transition-all active:scale-95 dark:text-black disabled:opacity-50 flex items-center justify-center"
                  >
                    {isQuickLogisticsSubmitting ? <Loader2 size={14} className="animate-spin" /> : "确定"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
