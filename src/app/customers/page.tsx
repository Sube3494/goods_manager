"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownAZ, BarChart3, Copy, Download, Edit2, Eye, Loader2, MapPin, PackageSearch, Plus, Search, Trash2, Upload, User, X } from "lucide-react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { ImportModal } from "@/components/Goods/ImportModal";
import { cn, copyToClipboard } from "@/lib/utils";

type Customer = {
  id: string;
  label: string;
  address: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  group?: string;
  isDefault: boolean;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  usageCount?: number;
};

type CustomerForm = {
  contactName: string;
  contactPhone: string;
  group: string;
  address: string;
};

type SortMode = "recent" | "usage-desc" | "usage-asc" | "name-asc" | "name-desc";

type ShipmentRecord = {
  id: string;
  date: string;
  status: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  trackingNumbers: string[];
  logisticsNames: string[];
  items: Array<{
    id: string;
    statsKey: string;
    name: string;
    variant: string;
    sku: string;
    image?: string | null;
    quantity: number;
    tracking: {
      logisticsName?: string;
      trackingNumber?: string;
    } | null;
  }>;
};

type ShipmentRecordResponse = {
  totalOrders: number;
  totalQuantity: number;
  group?: {
    name: string;
    customerCount: number;
  };
  customerStats?: Array<{
    id: string;
    name: string;
    phone: string;
    orderCount: number;
    totalQuantity: number;
  }>;
  productStats: Array<{
    key: string;
    name: string;
    variant: string;
    sku: string;
    image?: string | null;
    shipmentCount: number;
    totalQuantity: number;
  }>;
  records: ShipmentRecord[];
};

const emptyForm: CustomerForm = {
  contactName: "",
  contactPhone: "",
  group: "",
  address: "",
};

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "recent", label: "最近使用" },
  { value: "usage-desc", label: "进货次数多" },
  { value: "usage-asc", label: "进货次数少" },
  { value: "name-asc", label: "客户名称 A-Z" },
  { value: "name-desc", label: "客户名称 Z-A" },
];

function getCustomerText(customer: Customer) {
  return [customer.contactName, customer.contactPhone, customer.address].filter(Boolean).join(" ");
}

function getCustomerTime(customer: Customer) {
  return customer.lastUsedAt || customer.updatedAt || customer.createdAt || "";
}

function getCustomerName(customer: Customer) {
  return customer.contactName || customer.label || "未命名客户";
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function CustomerProductPill({
  name,
  variant,
  sku,
  image,
  quantity,
  count,
  trackingNumber,
}: {
  name: string;
  variant?: string;
  sku?: string;
  image?: string | null;
  quantity?: number;
  count?: number;
  trackingNumber?: string;
}) {
  const subtitle = [variant, sku].filter(Boolean).join(" / ");
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/50 bg-white/70 p-0.5 pr-2 text-[10px] font-medium text-foreground shadow-sm max-[420px]:max-w-full dark:border-white/8 dark:bg-white/6"
      title={[name, subtitle, trackingNumber].filter(Boolean).join(" ")}
    >
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
        {image ? (
          <Image src={image} alt="" fill sizes="24px" unoptimized className="object-cover" />
        ) : (
          <PackageSearch size={11} className="text-muted-foreground/50" />
        )}
      </span>
      <span className="min-w-0 truncate">
        <span className="font-bold">{name}</span>
        {subtitle ? <span className="ml-1 text-muted-foreground">{subtitle}</span> : null}
      </span>
      {typeof count === "number" ? (
        <span className="shrink-0 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 font-black text-cyan-700 dark:text-cyan-200">{count}次</span>
      ) : null}
      {typeof quantity === "number" ? (
        <span className="shrink-0 font-black text-primary">{quantity}件</span>
      ) : null}
    </span>
  );
}

function CustomerShipmentRecordsModal({
  target,
  isOpen,
  onClose,
}: {
  target: { type: "customer"; customer: Customer } | { type: "group"; group: string } | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<ShipmentRecordResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCustomerStatsExpanded, setIsCustomerStatsExpanded] = useState(false);
  const isGroupTarget = target?.type === "group";
  const title = target?.type === "group" ? `${target.group} 分组的进货记录` : target ? `${getCustomerName(target.customer)} 的进货记录` : "";
  const subtitle = target?.type === "group" ? `${data?.group?.customerCount || 0} 位客户` : target ? (target.customer.contactPhone || "未填写电话") : "";
  const visibleCustomerStats = isCustomerStatsExpanded ? (data?.customerStats || []) : (data?.customerStats || []).slice(0, 6);
  const hiddenCustomerStatsCount = Math.max(0, (data?.customerStats?.length || 0) - visibleCustomerStats.length);

  const fetchRecords = useCallback(async () => {
    if (!target || !isOpen) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      const query = params.toString();
      const res = target.type === "group"
        ? await fetch(`/api/customer-groups/shipment-records?group=${encodeURIComponent(target.group)}${query ? `&${query}` : ""}`)
        : await fetch(`/api/customers/${target.customer.id}/shipment-records${query ? `?${query}` : ""}`);
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(result?.error || "加载进货记录失败");
      }
      setData(result);
    } catch (error) {
      console.error("Failed to fetch customer shipment records:", error);
      showToast(error instanceof Error ? error.message : "加载进货记录失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [endDate, isOpen, keyword, showToast, startDate, target]);

  useEffect(() => {
    if (!isOpen) {
      setStartDate("");
      setEndDate("");
      setKeyword("");
      setData(null);
      setIsCustomerStatsExpanded(false);
      return;
    }
    fetchRecords();
  }, [fetchRecords, isOpen]);

  useEffect(() => {
    setIsCustomerStatsExpanded(false);
  }, [target]);

  if (!isOpen || !target) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-60000 flex items-center justify-center p-3 sm:p-5">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 18 }}
          className="relative z-10 flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-[#101722]/95 sm:max-h-[calc(100dvh-2rem)] sm:rounded-[28px]"
        >
          <div className="shrink-0 border-b border-border/10 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-600 dark:text-cyan-200">
                    <PackageSearch size={17} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-black text-foreground sm:text-lg">{title}</h3>
                    <p className="truncate text-xs font-bold text-muted-foreground">{subtitle}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-white px-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                <Search size={16} className="shrink-0 text-muted-foreground" />
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索商品名称、规格、SKU..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                {keyword ? (
                  <button type="button" onClick={() => setKeyword("")} className="text-muted-foreground hover:text-foreground">
                    <X size={15} />
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
                <DatePicker value={startDate} onChange={setStartDate} maxDate={endDate} placeholder="开始日期" className="h-9 min-w-0 sm:w-[136px]" triggerClassName="h-full rounded-xl border-border bg-white shadow-sm dark:bg-white/5" />
                <span className="hidden text-xs font-bold text-muted-foreground sm:block">至</span>
                <DatePicker value={endDate} onChange={setEndDate} minDate={startDate} placeholder="结束日期" className="h-9 min-w-0 sm:w-[136px]" triggerClassName="h-full rounded-xl border-border bg-white shadow-sm dark:bg-white/5" />
                {(startDate || endDate || keyword) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate("");
                      setEndDate("");
                      setKeyword("");
                    }}
                    className="col-span-2 h-9 rounded-xl border border-border bg-white px-3 text-sm font-bold text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/10 dark:bg-white/5 sm:col-span-1"
                  >
                    清空
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              <div className="flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-2 dark:border-white/10 dark:bg-white/[0.035] sm:justify-start sm:px-3">
                <span className="text-xs font-bold text-muted-foreground">发货单</span>
                <span className="text-base font-black text-foreground">{data?.totalOrders || 0}</span>
              </div>
              {isGroupTarget ? (
                <div className="flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-2 dark:border-white/10 dark:bg-white/[0.035] sm:justify-start sm:px-3">
                  <span className="text-xs font-bold text-muted-foreground">客户数</span>
                  <span className="text-base font-black text-foreground">{data?.group?.customerCount || 0}</span>
                </div>
              ) : null}
              <div className="flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-2 dark:border-white/10 dark:bg-white/[0.035] sm:justify-start sm:px-3">
                <span className="text-xs font-bold text-muted-foreground">商品种类</span>
                <span className="text-base font-black text-foreground">{data?.productStats?.length || 0}</span>
              </div>
              <div className="flex h-9 items-center justify-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-2 dark:border-white/10 dark:bg-white/[0.035] sm:justify-start sm:px-3">
                <span className="text-xs font-bold text-muted-foreground">总数量</span>
                <span className="text-base font-black text-foreground">{data?.totalQuantity || 0}</span>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !data || data.records.length === 0 ? (
              <EmptyState
                icon={<PackageSearch size={32} />}
                title="没有进货记录"
                description="当前筛选条件下没有完整发货记录。"
              />
            ) : (
              <div className="space-y-3">
                <section>
                  {isGroupTarget && data.customerStats && data.customerStats.length > 0 ? (
                    <div className="mb-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-black text-foreground">客户汇总</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {visibleCustomerStats.map((item) => (
                          <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/50 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-foreground shadow-sm dark:border-white/8 dark:bg-white/6">
                            <span className="shrink-0">{item.name}</span>
                            {item.phone ? <span className="min-w-0 truncate text-muted-foreground max-[420px]:max-w-[86px]">{item.phone}</span> : null}
                            <span className="text-cyan-600 dark:text-cyan-200">{item.orderCount}单</span>
                            <span className="text-primary">{item.totalQuantity}件</span>
                          </span>
                        ))}
                        {(hiddenCustomerStatsCount > 0 || isCustomerStatsExpanded) ? (
                          <button
                            type="button"
                            onClick={() => setIsCustomerStatsExpanded((prev) => !prev)}
                            className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 px-2.5 py-1 text-[10px] font-black text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground dark:border-white/8 dark:bg-white/6"
                          >
                            {isCustomerStatsExpanded ? "收起" : `还有 ${hiddenCustomerStatsCount} 位`}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-black text-foreground">商品汇总</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(data.productStats || []).map((item) => (
                      <CustomerProductPill
                        key={item.key}
                        name={item.name}
                        variant={item.variant}
                        sku={item.sku}
                        image={item.image}
                        count={item.shipmentCount}
                        quantity={item.totalQuantity}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-2">
                    <h4 className="text-sm font-black text-foreground">发货明细</h4>
                  </div>
                {data.records.map((record) => (
                  <article key={record.id} className="rounded-xl border border-border bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-black text-foreground">{record.id}</div>
                        <div className="text-xs font-bold text-muted-foreground">
                          {formatDateTime(record.date)}
                          {isGroupTarget && record.customerName ? <span className="ml-2">{record.customerName}</span> : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-300">{record.status}</span>
                        {record.logisticsNames.length > 0 ? <span>{record.logisticsNames.join(" / ")}</span> : null}
                        {record.trackingNumbers.length > 0 ? <span className="font-mono">{record.trackingNumbers.join(" / ")}</span> : null}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-border/70 p-2 dark:border-white/10">
                      {record.items.map((item) => (
                        <CustomerProductPill
                          key={item.id}
                          name={item.name}
                          variant={item.variant}
                          sku={item.sku}
                          image={item.image}
                          quantity={item.quantity}
                          trackingNumber={item.tracking?.trackingNumber}
                        />
                      ))}
                    </div>
                  </article>
                ))}
                </section>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

function CustomerModal({
  isOpen,
  initialData,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  initialData?: Customer | null;
  onClose: () => void;
  onSubmit: (form: CustomerForm) => Promise<void>;
}) {
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(initialData ? {
      contactName: initialData.contactName || "",
      contactPhone: initialData.contactPhone || "",
      group: initialData.group || "",
      address: initialData.address || initialData.detailAddress || "",
    } : emptyForm);
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contactName.trim() || !form.contactPhone.trim() || !form.address.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        group: form.group.trim(),
        address: form.address.trim(),
      });
    } finally {
      setIsSubmitting(false);
    }
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
          initial={{ opacity: 0, scale: 0.95, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 18 }}
          className="relative z-10 w-full max-w-xl overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-[#101722]/92"
        >
          <div className="flex items-center justify-between border-b border-border/10 p-6">
            <div>
              <h3 className="text-xl font-black text-foreground">{initialData ? "编辑客户" : "新建客户"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">发货地址会自动沉淀，也可以在这里手动维护。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-bold text-muted-foreground">客户姓名 <span className="text-rose-500">*</span></span>
                <input
                  value={form.contactName}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                  placeholder="例如：林女士"
                  className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-bold text-muted-foreground">手机号 <span className="text-rose-500">*</span></span>
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="客户电话"
                  className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                />
              </label>
            </div>
            <label className="space-y-2 block">
              <span className="text-xs font-bold text-muted-foreground">客户分组</span>
              <input
                value={form.group}
                onChange={(e) => setForm((prev) => ({ ...prev, group: e.target.value }))}
                placeholder="例如：老客户 / 团购 / 贵州"
                className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
              />
            </label>
            <label className="space-y-2 block">
              <span className="text-xs font-bold text-muted-foreground">完整地址 <span className="text-rose-500">*</span></span>
              <textarea
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="客户完整收件地址"
                rows={4}
                className="w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
              />
            </label>

            <div className="-mx-6 -mb-6 mt-6 flex justify-end gap-3 border-t border-border/10 bg-zinc-50/60 p-6 dark:bg-card/30">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-full border border-border bg-white px-5 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/40 active:scale-95 dark:border-white/10 dark:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !form.contactName.trim() || !form.contactPhone.trim() || !form.address.trim()}
                className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-full bg-foreground px-5 text-sm font-black text-background transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 dark:text-black"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "确认保存"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

function CustomerGroupModal({
  isOpen,
  selectedCount,
  initialGroup,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  selectedCount: number;
  initialGroup: string;
  onClose: () => void;
  onSubmit: (group: string) => Promise<void>;
}) {
  const [group, setGroup] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGroup(initialGroup);
    }
  }, [initialGroup, isOpen]);

  if (!isOpen) return null;

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
          initial={{ opacity: 0, scale: 0.95, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 18 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-[#101722]/95"
        >
          <div className="border-b border-border/10 p-6">
            <h3 className="text-xl font-black text-foreground">设置客户分组</h3>
            <p className="mt-1 text-xs text-muted-foreground">将为已选 {selectedCount} 位客户设置分组，留空则移出分组。</p>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setIsSubmitting(true);
              try {
                await onSubmit(group.trim());
              } finally {
                setIsSubmitting(false);
              }
            }}
            className="space-y-5 p-6"
          >
            <label className="space-y-2 block">
              <span className="text-xs font-bold text-muted-foreground">分组名称</span>
              <input
                value={group}
                onChange={(event) => setGroup(event.target.value)}
                placeholder="例如：老客户 / 团购 / 贵州"
                className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                autoFocus
              />
            </label>
            <div className="-mx-6 -mb-6 flex justify-end gap-3 border-t border-border/10 bg-zinc-50/60 p-6 dark:bg-card/30">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-full border border-border bg-white px-5 text-sm font-bold text-muted-foreground transition-all hover:bg-muted/40 active:scale-95 dark:border-white/10 dark:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-10 min-w-[96px] items-center justify-center rounded-full bg-foreground px-5 text-sm font-black text-background transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 dark:text-black"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : "确认"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

export default function CustomersPage() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [recordsTarget, setRecordsTarget] = useState<{ type: "customer"; customer: Customer } | { type: "group"; group: string } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: async () => {},
  });

  const fetchCustomers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const query = params.toString();
      const res = await fetch(`/api/customers${query ? `?${query}` : ""}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "加载客户失败");
      }
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
      showToast(error instanceof Error ? error.message : "加载客户失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [endDate, showToast, startDate]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    const matched = keyword
      ? customers.filter((customer) =>
          [customer.contactName, customer.contactPhone, customer.address]
            .some((value) => String(value || "").toLowerCase().includes(keyword))
        )
      : customers;
    const groupMatched = groupFilter === "all"
      ? matched
      : matched.filter((customer) => (customer.group || "") === (groupFilter === "__ungrouped" ? "" : groupFilter));

    return [...groupMatched].sort((a, b) => {
      if (sortMode === "usage-desc") {
        return (b.usageCount || 0) - (a.usageCount || 0) || getCustomerTime(b).localeCompare(getCustomerTime(a));
      }
      if (sortMode === "usage-asc") {
        return (a.usageCount || 0) - (b.usageCount || 0) || getCustomerTime(b).localeCompare(getCustomerTime(a));
      }
      if (sortMode === "name-asc") {
        return getCustomerName(a).localeCompare(getCustomerName(b), "zh-Hans-CN");
      }
      if (sortMode === "name-desc") {
        return getCustomerName(b).localeCompare(getCustomerName(a), "zh-Hans-CN");
      }
      return getCustomerTime(b).localeCompare(getCustomerTime(a)) || getCustomerName(a).localeCompare(getCustomerName(b), "zh-Hans-CN");
    });
  }, [customers, groupFilter, searchQuery, sortMode]);

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(customers.map((customer) => customer.group || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    return [
      { value: "all", label: "全部分组" },
      { value: "__ungrouped", label: "未分组" },
      ...groups.map((group) => ({ value: group, label: group })),
    ];
  }, [customers]);

  const totalItems = filteredCustomers.length;
  const hasDateFilter = Boolean(startDate || endDate);
  const selectedGroupName = groupFilter !== "all" && groupFilter !== "__ungrouped" ? groupFilter : "";
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredCustomers, currentPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [groupFilter, searchQuery, startDate, endDate, sortMode, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, groupFilter, searchQuery, startDate, endDate, sortMode, pageSize]);

  const handleSubmit = async (form: CustomerForm) => {
    const isEditing = Boolean(editingCustomer);
    const res = await fetch(isEditing ? `/api/customers/${editingCustomer?.id}` : "/api/customers", {
      method: isEditing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(data?.error || "保存失败", "error");
      return;
    }
    showToast(isEditing ? "客户已更新" : "客户已创建", "success");
    setIsModalOpen(false);
    setEditingCustomer(null);
    await fetchCustomers();
  };

  const handleDelete = (customer: Customer) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除客户",
      message: `确定要删除客户「${customer.contactName || "未命名客户"}」吗？历史发货单不会受影响。`,
      onConfirm: async () => {
        const res = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showToast(data?.error || "删除失败", "error");
          return;
        }
        showToast("客户已删除", "success");
        setSelectedIds((prev) => prev.filter((id) => id !== customer.id));
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        await fetchCustomers();
      },
    });
  };

  const handleBatchDelete = () => {
    const count = selectedIds.length;
    if (count === 0) return;

    setConfirmConfig({
      isOpen: true,
      title: "批量删除客户",
      message: `确定要删除选中的 ${count} 位客户吗？历史发货单不会受影响。`,
      onConfirm: async () => {
        const res = await fetch("/api/customers", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: selectedIds }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showToast(data?.error || "批量删除失败", "error");
          return;
        }

        showToast(`已删除 ${data?.deletedCount || count} 位客户`, "success");
        setSelectedIds([]);
        setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
        await fetchCustomers();
      },
    });
  };

  const handleBatchGroup = async (group: string) => {
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, group }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      showToast(data?.error || "设置分组失败", "error");
      return;
    }

    showToast(group ? `已设置为「${group}」` : "已移出分组", "success");
    setSelectedIds([]);
    setIsGroupModalOpen(false);
    await fetchCustomers();
  };

  const selectedGroup = useMemo(() => {
    const selected = customers.filter((customer) => selectedIds.includes(customer.id));
    if (selected.length === 0) return "";
    const firstGroup = selected[0]?.group || "";
    return selected.every((customer) => (customer.group || "") === firstGroup) ? firstGroup : "";
  }, [customers, selectedIds]);

  const handleCopy = async (customer: Customer) => {
    const success = await copyToClipboard(getCustomerText(customer));
    showToast(success ? "已复制客户地址" : "复制失败", success ? "success" : "error");
  };

  const handleCopyPhone = async (customer: Customer) => {
    const phone = String(customer.contactPhone || "").trim();
    if (!phone) return;
    const success = await copyToClipboard(phone);
    showToast(success ? "已复制客户电话" : "复制失败", success ? "success" : "error");
  };

  const handleExport = async () => {
    if (filteredCustomers.length === 0) {
      showToast("没有可导出的客户", "info");
      return;
    }

    setIsExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Goods Manager";
      workbook.lastModifiedBy = "Goods Manager";
      workbook.created = new Date();
      workbook.modified = new Date();

      const worksheet = workbook.addWorksheet("客户");
      worksheet.columns = [
        { header: "序号", key: "index", width: 8 },
        { header: "客户姓名", key: "contactName", width: 18 },
        { header: "手机号", key: "contactPhone", width: 18 },
        { header: "客户分组", key: "group", width: 16 },
        { header: "完整地址", key: "address", width: 62 },
        { header: "进货次数", key: "usageCount", width: 12 },
        { header: "来源", key: "source", width: 16 },
        { header: "最近使用时间", key: "lastUsedAt", width: 24 },
      ];

      worksheet.views = [{ state: "frozen", ySplit: 1 }];
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FF111827" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 26;

      filteredCustomers.forEach((customer, index) => {
        worksheet.addRow({
          index: index + 1,
          contactName: customer.contactName || "",
          contactPhone: customer.contactPhone || "",
          group: customer.group || "",
          address: customer.address || "",
          usageCount: customer.usageCount || 0,
          source: customer.source === "factory-shipment" ? "发货自动收集" : "手动维护",
          lastUsedAt: customer.lastUsedAt || "",
        });
      });

      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell, colNumber) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };

          if (rowNumber > 1) {
            cell.alignment = {
              vertical: "middle",
              horizontal: colNumber === 1 || colNumber === 6 ? "center" : "left",
              wrapText: colNumber === 5,
            };
          }
        });

        if (rowNumber > 1) {
          row.height = 42;
        }
      });
      worksheet.getColumn("C").numFmt = "@";
      worksheet.getColumn("H").numFmt = "yyyy-mm-dd hh:mm:ss";

      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }).replace(" ", "_").replace(/:/g, "-");
      saveAs(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `客户导出_${timestamp}.xlsx`
      );
      showToast(`已导出 ${filteredCustomers.length} 位客户`, "success");
    } catch (error) {
      console.error("Failed to export customers:", error);
      showToast("导出失败", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!Array.isArray(rows)) {
      showToast("导入文件格式不正确", "error");
      return;
    }

    try {
      const res = await fetch("/api/customers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customers: rows }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "导入失败", "error");
        return;
      }

      const errorsText = Array.isArray(data?.errors) && data.errors.length > 0 ? `，${data.errors.length} 条有字段缺失` : "";
      showToast(`导入完成：新增 ${data?.created || 0} 位，跳过 ${data?.skipped || 0} 位${errorsText}`, data?.created ? "success" : "info");
      await fetchCustomers();
    } catch (error) {
      console.error("Failed to import customers:", error);
      showToast("导入失败", "error");
    }
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] p-3 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-foreground max-[480px]:text-2xl">客户管理</h1>
              {!isLoading ? (
                <span className="rounded-full border border-border bg-white/75 px-3 py-1 text-xs font-black text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
                  {totalItems} 位客户
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">发货单里的收件人会自动收集到这里，方便查找、编辑和复制地址。</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-white/75 px-3 text-sm font-black text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:h-11 sm:px-4"
              title="导入客户"
            >
              <Upload size={16} />
              <span>导入</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-white/75 px-3 text-sm font-black text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white disabled:pointer-events-none disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:h-11 sm:px-4"
              title="导出客户"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span>导出</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCustomer(null);
                setIsModalOpen(true);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-3 text-sm font-black text-background shadow-lg transition-all hover:-translate-y-0.5 dark:text-black sm:h-11 sm:px-5"
            >
              <Plus size={16} />
              <span className="max-[380px]:hidden sm:inline">新建客户</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(360px,1fr)_minmax(520px,auto)]">
          <div className="grid grid-cols-2 items-center gap-2 rounded-2xl border border-border bg-white/75 p-2 shadow-sm dark:border-white/10 dark:bg-white/5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <div className="col-span-2 flex h-10 min-w-0 items-center gap-3 rounded-xl bg-muted/20 px-2 sm:col-span-1 sm:h-11 sm:bg-transparent">
              <Search size={18} className="shrink-0 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索姓名、电话、地址..."
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery("")} className="shrink-0 text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            <div className="flex h-10 min-w-0 items-center gap-1 sm:h-9 sm:w-40">
              <CustomSelect
                value={groupFilter}
                onChange={setGroupFilter}
                options={groupOptions}
                className="h-full min-w-0 flex-1"
                triggerClassName="h-full rounded-xl border-border/50 bg-transparent px-3 text-foreground shadow-none hover:bg-muted/40 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/8 sm:rounded-full"
              />
            </div>
            {selectedGroupName ? (
              <button
                type="button"
                onClick={() => setRecordsTarget({ type: "group", group: selectedGroupName })}
                className="h-10 rounded-xl border border-cyan-400/25 bg-cyan-400/10 px-3 text-sm font-black text-cyan-700 shadow-sm transition-colors hover:bg-cyan-400/15 dark:text-cyan-200 sm:h-9 sm:rounded-full"
              >
                组别数据
              </button>
            ) : null}
            <div className={cn(
              "flex h-10 min-w-0 items-center gap-1 rounded-xl bg-muted/20 px-2 sm:h-9 sm:w-40 sm:bg-transparent sm:px-0",
              selectedGroupName && "col-span-2 sm:col-span-1"
            )}>
              <ArrowDownAZ size={15} className="shrink-0 text-muted-foreground" />
              <CustomSelect
                value={sortMode}
                onChange={(value) => setSortMode(value as SortMode)}
                options={sortOptions}
                className="h-full min-w-0 flex-1"
                triggerClassName="h-full rounded-xl border-border/50 bg-transparent px-3 text-foreground shadow-none hover:bg-muted/40 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/8 sm:rounded-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white/75 p-2 shadow-sm dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center">
            <div className="flex h-8 shrink-0 items-center gap-2 px-2 text-sm font-black text-muted-foreground md:h-10">
              <BarChart3 size={16} />
              <span>进货统计</span>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 max-[380px]:grid-cols-1">
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="开始日期"
                maxDate={endDate}
                className="h-10 min-w-0 md:w-40"
                triggerClassName="h-full rounded-xl border-border bg-white shadow-sm dark:bg-white/5 md:rounded-2xl"
              />
              <span className="shrink-0 text-center text-xs font-bold text-muted-foreground max-[380px]:hidden">至</span>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="结束日期"
                minDate={startDate}
                className="h-10 min-w-0 md:w-40"
                triggerClassName="h-full rounded-xl border-border bg-white shadow-sm dark:bg-white/5 md:rounded-2xl"
              />
            </div>
            {hasDateFilter ? (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="h-10 shrink-0 rounded-xl border border-border bg-white px-4 text-sm font-bold text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/10 dark:bg-white/5 md:rounded-2xl"
              >
                清空
              </button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredCustomers.length === 0 ? (
          <EmptyState
            icon={<User size={32} />}
            title={searchQuery ? "没有匹配客户" : "还没有客户"}
            description={searchQuery ? "换个关键词试试" : "创建发货单后，收件信息会自动出现在这里。"}
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {paginatedCustomers.map((customer) => {
                  const isSelected = selectedIds.includes(customer.id);
                  return (
                    <article
                      key={customer.id}
                      className={cn(
                        "group rounded-[22px] border bg-white/78 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl dark:bg-white/[0.055] sm:rounded-[24px] sm:p-4",
                        isSelected ? "border-cyan-400/50 ring-2 ring-cyan-400/15" : "border-border/70 dark:border-white/10"
                      )}
                    >
                      <div className="grid grid-cols-[22px_42px_minmax(0,1fr)_auto] items-start gap-2 sm:flex sm:justify-between sm:gap-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedIds((prev) => prev.includes(customer.id) ? prev.filter((id) => id !== customer.id) : [...prev, customer.id]);
                          }}
                          className={cn(
                            "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                            isSelected
                              ? "border-cyan-500 bg-cyan-500 text-white"
                              : "border-border bg-white/60 text-transparent hover:border-cyan-400 dark:border-white/15 dark:bg-white/5"
                          )}
                          title={isSelected ? "取消选择" : "选择客户"}
                        >
                          <span className="h-2 w-2 rounded-full bg-current" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          className="min-w-0 text-left"
                          title={getCustomerName(customer)}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-600 transition-all hover:bg-cyan-400/15 dark:text-cyan-200">
                            <User size={18} />
                          </div>
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <h3 className="truncate text-base font-black text-foreground">{customer.contactName || "未命名客户"}</h3>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                                <span className="truncate">{customer.contactPhone || "未填写电话"}</span>
                                {customer.contactPhone ? (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleCopyPhone(customer);
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        handleCopyPhone(customer);
                                      }
                                    }}
                                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600"
                                    title="复制电话"
                                  >
                                    <Copy size={11} />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex max-w-[132px] shrink-0 flex-wrap items-center justify-end gap-0.5 sm:max-w-none sm:flex-nowrap sm:gap-1">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setRecordsTarget({ type: "customer", customer }); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600 sm:rounded-xl sm:p-2" title="查看进货记录">
                            <Eye size={15} />
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleCopy(customer); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-cyan-500/10 hover:text-cyan-600 sm:rounded-xl sm:p-2" title="复制地址">
                            <Copy size={15} />
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setEditingCustomer(customer); setIsModalOpen(true); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary sm:rounded-xl sm:p-2" title="编辑">
                            <Edit2 size={15} />
                          </button>
                          <button type="button" onClick={(event) => { event.stopPropagation(); handleDelete(customer); }} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500 sm:rounded-xl sm:p-2" title="删除">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-border/50 bg-muted/25 p-3 text-sm dark:border-white/8 dark:bg-white/[0.035] sm:mt-4">
                        <div className="flex items-start gap-2 text-foreground">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-cyan-500" />
                          <span className="line-clamp-2 leading-5">{customer.address}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span className="min-w-0 truncate">{customer.group ? `分组：${customer.group}` : (customer.source === "factory-shipment" ? "发货自动收集" : "手动维护")}</span>
                        <span>进货 {customer.usageCount || 0} 次</span>
                      </div>
                    </article>
                  );
              })}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
            />
          </>
        )}
      </div>

      <ActionBar
        selectedCount={selectedIds.length}
        totalCount={paginatedCustomers.length}
        label="位客户"
        onToggleSelectAll={() => {
          const visibleIds = paginatedCustomers.map((customer) => customer.id);
          setSelectedIds((prev) => visibleIds.every((id) => prev.includes(id)) ? [] : visibleIds);
        }}
        onClear={() => setSelectedIds([])}
        onDelete={handleBatchDelete}
        extraActions={[
          {
            label: "设置分组",
            icon: <User size={15} />,
            onClick: () => setIsGroupModalOpen(true),
          },
        ]}
      />

      <CustomerModal
        isOpen={isModalOpen}
        initialData={editingCustomer}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCustomer(null);
        }}
        onSubmit={handleSubmit}
      />
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
        title="导入客户"
        description="支持 Excel 或 CSV。至少包含“客户姓名”“手机号”和“完整地址”；已存在的客户会自动跳过。"
        templateFileName="客户导入模板.xlsx"
        templateData={[
          {
            客户姓名: "张女士",
            手机号: "13800000000",
            客户分组: "老客户",
            完整地址: "贵州省遵义市汇川区香港路184号盛邦帝标A座11楼A6房",
          },
        ]}
      />
      <CustomerShipmentRecordsModal
        target={recordsTarget}
        isOpen={Boolean(recordsTarget)}
        onClose={() => setRecordsTarget(null)}
      />
      <CustomerGroupModal
        isOpen={isGroupModalOpen}
        selectedCount={selectedIds.length}
        initialGroup={selectedGroup}
        onClose={() => setIsGroupModalOpen(false)}
        onSubmit={handleBatchGroup}
      />
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel="确认删除"
      />
    </div>
  );
}
