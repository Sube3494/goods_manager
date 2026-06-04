"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Edit2, Loader2, MapPin, Phone, Plus, Search, Trash2, User, X } from "lucide-react";
import { createPortal } from "react-dom";
import { ActionBar } from "@/components/ui/ActionBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
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

const emptyForm: CustomerForm = {
  contactName: "",
  contactPhone: "",
  address: "",
};

function getCustomerText(customer: Customer) {
  return [customer.contactName, customer.contactPhone, customer.address].filter(Boolean).join(" ");
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
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
      const res = await fetch("/api/customers");
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
  }, [showToast]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return customers;
    return customers.filter((customer) =>
      [customer.contactName, customer.contactPhone, customer.address]
        .some((value) => String(value || "").toLowerCase().includes(keyword))
    );
  }, [customers, searchQuery]);

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

  const handleCopy = async (customer: Customer) => {
    const success = await copyToClipboard(getCustomerText(customer));
    showToast(success ? "已复制客户地址" : "复制失败", success ? "success" : "error");
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">客户管理</h1>
            <p className="mt-2 text-sm text-muted-foreground">发货单里的收件人会自动收集到这里，方便查找、编辑和复制地址。</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingCustomer(null);
              setIsModalOpen(true);
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-black text-background shadow-lg transition-all hover:-translate-y-0.5 dark:text-black"
          >
            <Plus size={16} />
            新建客户
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white/75 px-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <Search size={18} className="text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索姓名、电话、地址..."
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {searchQuery ? (
            <button type="button" onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          ) : null}
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCustomers.map((customer) => {
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
                              <div className="mt-1 text-[11px] font-bold text-muted-foreground">{customer.contactPhone || "未填写电话"}</div>
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

                      <div className="mt-4 space-y-2 rounded-2xl border border-border/50 bg-muted/25 p-3 text-sm dark:border-white/8 dark:bg-white/[0.035]">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone size={14} />
                          <span className="font-mono">{customer.contactPhone || "未填写电话"}</span>
                        </div>
                        <div className="flex items-start gap-2 text-foreground">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-cyan-500" />
                          <span className="line-clamp-2 leading-5">{customer.address}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{customer.source === "factory-shipment" ? "发货自动收集" : "手动维护"}</span>
                        <span>使用 {customer.usageCount || 0} 次</span>
                      </div>
                    </article>
                  );
            })}
          </div>
        )}
      </div>

      <ActionBar
        selectedCount={selectedIds.length}
        totalCount={filteredCustomers.length}
        label="位客户"
        onToggleSelectAll={() => {
          const visibleIds = filteredCustomers.map((customer) => customer.id);
          setSelectedIds((prev) => prev.length === visibleIds.length ? [] : visibleIds);
        }}
        onClear={() => setSelectedIds([])}
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
