"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownAZ, BarChart3, Copy, Download, Edit2, Loader2, MapPin, Plus, Search, Trash2, Upload, User, X } from "lucide-react";
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
  address: string;
};

type SortMode = "recent" | "usage-desc" | "usage-asc" | "name-asc" | "name-desc";

const emptyForm: CustomerForm = {
  contactName: "",
  contactPhone: "",
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
      address: initialData.address || initialData.detailAddress || "",
    } : emptyForm);
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.contactName.trim() || !form.address.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
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
                <span className="text-xs font-bold text-muted-foreground">手机号</span>
                <input
                  value={form.contactPhone}
                  onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="客户电话"
                  className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                />
              </label>
            </div>
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
                disabled={isSubmitting || !form.contactName.trim() || !form.address.trim()}
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

export default function CustomersPage() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
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

    return [...matched].sort((a, b) => {
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
  }, [customers, searchQuery, sortMode]);

  const totalItems = filteredCustomers.length;
  const hasDateFilter = Boolean(startDate || endDate);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredCustomers, currentPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate, sortMode, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, searchQuery, startDate, endDate, sortMode, pageSize]);

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
              horizontal: colNumber === 1 || colNumber === 5 ? "center" : "left",
              wrapText: colNumber === 4,
            };
          }
        });

        if (rowNumber > 1) {
          row.height = 42;
        }
      });
      worksheet.getColumn("C").numFmt = "@";
      worksheet.getColumn("G").numFmt = "yyyy-mm-dd hh:mm:ss";

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
    <div className="min-h-[calc(100dvh-4rem)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black tracking-tight text-foreground">客户管理</h1>
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white/75 px-4 text-sm font-black text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              title="导入客户"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">导入</span>
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-white/75 px-4 text-sm font-black text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white disabled:pointer-events-none disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              title="导出客户"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span className="hidden sm:inline">导出</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCustomer(null);
                setIsModalOpen(true);
              }}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-black text-background shadow-lg transition-all hover:-translate-y-0.5 dark:text-black sm:px-5"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">新建客户</span>
            </button>
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(360px,1fr)_minmax(520px,auto)]">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,38%)] items-center gap-2 rounded-2xl border border-border bg-white/75 p-2 shadow-sm dark:border-white/10 dark:bg-white/5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="flex h-10 min-w-0 items-center gap-3 px-2 sm:h-11">
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
              <ArrowDownAZ size={15} className="shrink-0 text-muted-foreground" />
              <CustomSelect
                value={sortMode}
                onChange={(value) => setSortMode(value as SortMode)}
                options={sortOptions}
                className="h-full min-w-0 flex-1"
                triggerClassName="h-full rounded-full border-border/50 bg-transparent px-3 text-foreground shadow-none hover:bg-muted/40 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/8"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white/75 p-2 shadow-sm dark:border-white/10 dark:bg-white/5 md:flex-row md:items-center">
            <div className="flex h-10 shrink-0 items-center gap-2 px-2 text-sm font-black text-muted-foreground">
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
                triggerClassName="h-full rounded-2xl border-border bg-white shadow-sm dark:bg-white/5"
              />
              <span className="shrink-0 text-center text-xs font-bold text-muted-foreground max-[380px]:hidden">至</span>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="结束日期"
                minDate={startDate}
                className="h-10 min-w-0 md:w-40"
                triggerClassName="h-full rounded-2xl border-border bg-white shadow-sm dark:bg-white/5"
              />
            </div>
            {hasDateFilter ? (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="h-10 shrink-0 rounded-2xl border border-border bg-white px-4 text-sm font-bold text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground dark:border-white/10 dark:bg-white/5"
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
                        "group rounded-[24px] border bg-white/78 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl dark:bg-white/[0.055]",
                        isSelected ? "border-cyan-400/50 ring-2 ring-cyan-400/15" : "border-border/70 dark:border-white/10"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setSelectedIds((prev) => prev.includes(customer.id) ? prev.filter((id) => id !== customer.id) : [...prev, customer.id])}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-600 dark:text-cyan-200">
                              <User size={18} />
                            </div>
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
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => handleCopy(customer)} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-cyan-500/10 hover:text-cyan-600" title="复制地址">
                            <Copy size={15} />
                          </button>
                          <button type="button" onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary" title="编辑">
                            <Edit2 size={15} />
                          </button>
                          <button type="button" onClick={() => handleDelete(customer)} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500" title="删除">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-border/50 bg-muted/25 p-3 text-sm dark:border-white/8 dark:bg-white/[0.035]">
                        <div className="flex items-start gap-2 text-foreground">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-cyan-500" />
                          <span className="line-clamp-2 leading-5">{customer.address}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{customer.source === "factory-shipment" ? "发货自动收集" : "手动维护"}</span>
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
            label: "复制选中",
            icon: <Copy size={15} />,
            onClick: async () => {
              const selected = customers.filter((customer) => selectedIds.includes(customer.id));
              const success = await copyToClipboard(selected.map(getCustomerText).join("\n"));
              showToast(success ? `已复制 ${selected.length} 个客户地址` : "复制失败", success ? "success" : "error");
            },
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
        description="支持 Excel 或 CSV。至少包含“客户姓名”和“完整地址”，手机号可选；已存在的客户会自动跳过。"
        templateFileName="客户导入模板.xlsx"
        templateData={[
          {
            客户姓名: "张女士",
            手机号: "13800000000",
            完整地址: "贵州省遵义市汇川区香港路184号盛邦帝标A座11楼A6房",
          },
        ]}
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
