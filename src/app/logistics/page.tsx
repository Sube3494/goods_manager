"use client";

import { useState, useEffect, useCallback, memo } from "react";
import { Plus, Search, Edit2, Trash2, Briefcase, Check, X, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionBar } from "@/components/ui/ActionBar";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

interface LogisticsCompany {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 局部的物流公司编辑弹窗组件
interface LogisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; code: string }) => Promise<void>;
  initialData?: LogisticsCompany;
}

const LogisticsModal = memo(function LogisticsModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}: LogisticsModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setCode(initialData.code || "");
      } else {
        setName("");
        setCode("");
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        code: code.trim(),
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
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl backdrop-blur-xl dark:bg-gray-900/70"
        >
          <div className="flex items-center justify-between border-b border-border/10 p-6">
            <h3 className="text-xl font-bold text-foreground">
              {initialData ? "编辑物流公司" : "新建物流公司"}
            </h3>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">公司名称 <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：顺丰速运"
                className="h-10 w-full rounded-2xl border border-border bg-white px-4 text-sm text-foreground outline-none ring-1 ring-transparent transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground">物流编码（可选）</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="例如：SF"
                className="h-10 w-full rounded-2xl border border-border bg-white px-4 text-sm text-foreground outline-none ring-1 ring-transparent transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-border/10 pt-6 mt-6 bg-zinc-50/50 -mx-6 -mb-6 p-6 dark:bg-card/30">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-full border border-border bg-white px-5 text-sm font-bold text-muted-foreground hover:bg-muted/40 transition-all active:scale-95 dark:border-white/10 dark:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="h-10 min-w-[80px] rounded-full bg-foreground px-5 text-sm font-black text-background hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 dark:text-black disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
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
});

export default function LogisticsPage() {
  const { user } = useUser();
  const { showToast } = useToast();

  const [companies, setCompanies] = useState<LogisticsCompany[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<LogisticsCompany | undefined>(undefined);
  
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

  const fetchCompanies = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/logistics?all=true");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      } else {
        showToast("加载物流公司失败", "error");
      }
    } catch (err) {
      console.error("Failed to fetch logistics", err);
      showToast("网络请求异常", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleOpenCreate = () => {
    setEditingCompany(undefined);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (company: LogisticsCompany) => {
    setEditingCompany(company);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除物流公司",
      message: `确定要删除物流公司 "${name}" 吗？此操作不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/logistics/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            showToast("物流公司已删除", "success");
            fetchCompanies();
            setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
          } else {
            const data = await res.json();
            showToast(data.error || "删除失败", "error");
          }
        } catch {
          showToast("删除请求失败", "error");
        }
      },
    });
  };

  const handleModalSubmit = async (data: { name: string; code: string }) => {
    try {
      const method = editingCompany ? "PUT" : "POST";
      const url = editingCompany ? `/api/logistics/${editingCompany.id}` : "/api/logistics";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        showToast(editingCompany ? "更新物流公司成功" : "创建物流公司成功", "success");
        setIsModalOpen(false);
        fetchCompanies();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || "操作失败", "error");
      }
    } catch {
      showToast("提交请求失败", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* 头部标题区域 */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">物流管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">
            管理用于发货记录的快递与物流公司配置。
          </p>
        </div>

        {user && (
          <button
            onClick={handleOpenCreate}
            className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all shrink-0"
          >
            <Plus size={16} className="md:w-[18px] md:h-[18px]" />
            新建物流公司
          </button>
        )}
      </div>

      {/* 搜索过滤框 */}
      <div className="h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full mb-6 md:mb-8">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索物流公司名称或编码..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
        />
      </div>

      {/* 物流公司列表展示 (Grid) */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filteredCompanies.map((company) => {
            const isSelected = selectedIds.includes(company.id);
            return (
              <div
                key={company.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl glass-card border p-4 transition-all duration-300 flex flex-col justify-between",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-lg shadow-primary/5"
                    : "border-border hover:border-primary/40"
                )}
              >
                <div className="flex items-start justify-between mb-3 relative z-10">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary shadow-sm transition-all duration-300">
                      <Briefcase className="opacity-90 drop-shadow-sm" size={20} />
                    </div>
                   
                  {user && (
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "relative transition-all duration-300",
                          isSelected || selectedIds.length > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(company.id);
                          }}
                          className={cn(
                            "relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
                            isSelected
                              ? "bg-foreground border-foreground text-background scale-110"
                              : "border-muted-foreground/30 hover:border-foreground/50"
                          )}
                        >
                          {isSelected && <Check size={12} strokeWidth={4} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors duration-300">
                    {company.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    {company.code && (
                      <span className="text-[10px] font-mono font-bold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {company.code}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end items-center w-full mt-4 border-t border-border/5 pt-2">
                  {user && (
                    <div className="flex gap-1 opacity-100 translate-y-0 lg:opacity-0 lg:translate-y-1 lg:group-hover:opacity-100 lg:group-hover:translate-y-0 transition-all duration-300">
                      <button
                        onClick={() => handleOpenEdit(company)}
                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 hover:text-primary transition-colors"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(company.id, company.name)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredCompanies.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
              <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border group-hover:scale-110 transition-transform duration-500">
                <Briefcase size={40} strokeWidth={1.5} />
              </div>
              <h3 className="text-xl font-bold text-foreground">暂无物流公司配置</h3>
              <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                {searchQuery ? "未找到匹配结果，尝试更改搜索关键词。" : "目前还没有配置任何物流公司，点击右上角新建。"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 弹窗及确认 */}
      <LogisticsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={editingCompany}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel="确认删除"
        variant="danger"
      />

      <ActionBar
        selectedCount={selectedIds.length}
        totalCount={filteredCompanies.length}
        onToggleSelectAll={() => {
          if (selectedIds.length === filteredCompanies.length) {
            setSelectedIds([]);
          } else {
            setSelectedIds(filteredCompanies.map((c) => c.id));
          }
        }}
        onClear={() => setSelectedIds([])}
        label="个物流公司"
        onDelete={() => {
          setConfirmConfig({
            isOpen: true,
            title: "批量删除物流公司",
            message: `确定要删除选中的 ${selectedIds.length} 个物流公司吗？此操作不可恢复。`,
            onConfirm: async () => {
              try {
                const res = await fetch(`/api/logistics/${selectedIds.join(",")}`, {
                  method: "DELETE",
                });
                if (res.ok) {
                  showToast("所选物流公司已删除", "success");
                  setSelectedIds([]);
                  fetchCompanies();
                } else {
                  const data = await res.json();
                  showToast(data.error || "删除失败", "error");
                }
              } catch {
                showToast("删除请求失败", "error");
              }
            },
          });
        }}
      />
    </div>
  );
}
