"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Calendar, Edit2, Store, Eye } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { useRouter } from "next/navigation";

interface StoreOpeningBatch {
  id: string;
  name: string;
  date: string;
  _count?: { items: number };
}

function SetupPurchasesContent() {

  const { showToast } = useToast();
  const { user } = useUser();
  const canManage = hasPermission(user as SessionUser | null, "setup_purchase:manage");
  const router = useRouter();
  
  const [batches, setBatches] = useState<StoreOpeningBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<StoreOpeningBatch | null>(null);
  const [formData, setFormData] = useState({ name: "", date: "" });
  
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    message: "",
    onConfirm: () => {}
  });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch("/api/setup-purchases");
      if (res.ok) {
        const data = await res.json();
        setBatches(data);
      }
    } catch {
      showToast("加载批次失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      message: "确定要删除这条开店进货记录吗？包含的所有明细将被清空且不可恢复。",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/setup-purchases/${id}`, { method: "DELETE" });
          if (res.ok) {
            setBatches(prev => prev.filter(b => b.id !== id));
            showToast("记录已删除", "success");
          } else {
            showToast("删除失败", "error");
          }
        } catch {
          showToast("网络错误", "error");
        }
      }
    });
  };

  const handleSave = async () => {
    if (!formData.name) return showToast("请输入账单名称", "error");
    try {
      const isEdit = !!editingBatch;
      const url = isEdit ? `/api/setup-purchases/${editingBatch.id}` : "/api/setup-purchases";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        showToast(isEdit ? "更新成功" : "创建成功", "success");
        setIsModalOpen(false);
        fetchData(true);
      } else {
        const err = await res.json();
        showToast(err.error || "保存失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">开店进货对账</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">管理新店起步或批量进货的账单核对与汇总。</p>
        </div>
        {canManage && (
          <button 
            onClick={() => {
              setEditingBatch(null);
              setFormData({ name: "", date: new Date().toISOString().split('T')[0] });
              setIsModalOpen(true);
            }}
            className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-md shadow-black/10 dark:shadow-none hover:-translate-y-0.5 transition-all active:scale-95"
          >
            <Plus size={16} />
            新建账单记录
          </button>
        )}
      </div>

      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {batches.map(batch => (
            <motion.div
              key={batch.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-card border border-border shadow-sm hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all duration-500"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3 text-foreground font-black text-xl tracking-tight">
                    <div className="w-10 h-10 rounded-2xl bg-primary/5 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-500">
                      <Store className="w-5 h-5" />
                    </div>
                    {batch.name}
                  </div>
                  <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-wider">
                    <Calendar className="w-3 h-3" />
                    {formatLocalDateTime(batch.date).split(' ')[0]}
                  </div>
                </div>
                <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                  <span className="font-bold text-foreground text-2xl font-number">{batch._count?.items || 0}</span>
                  <span className="font-medium">条对账明细</span>
                </div>
              </div>

              <div className="px-6 py-5 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          setEditingBatch(batch);
                          setFormData({ name: batch.name, date: batch.date ? new Date(batch.date).toISOString().split('T')[0] : "" });
                          setIsModalOpen(true);
                        }}
                        className="p-2.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(batch.id)}
                        className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-90"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/setup-purchases/${batch.id}`)}
                  className="px-5 py-2.5 text-sm font-black text-primary-foreground bg-primary rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap shrink-0"
                >
                  <Eye size={18} strokeWidth={2.5} />
                  查看明细
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {batches.length === 0 && !isLoading && (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <Store className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-bold text-foreground">暂无账单记录</h3>
          <p className="text-muted-foreground mt-2">点击上方按钮创建你的第一份开店进货账单</p>
        </div>
      )}

      {isModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 lg:pl-(--sidebar-width) transition-[padding] duration-200">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => setIsModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-[380px] glass-panel relative z-10 rounded-[28px] shadow-2xl overflow-hidden border border-white/10"
          >
            <div className="p-6">
              <h2 className="text-xl font-black mb-6 tracking-tight text-foreground">{editingBatch ? "编辑账单记录" : "新建账单记录"}</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">账单名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="如：2026年遵义开店进货账单"
                    className="w-full h-11 px-4 rounded-xl border border-border bg-muted/30 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all outline-none text-foreground text-sm"
                  />
                </div>
                <div className="relative group">
                  <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5 text-muted-foreground/80">所属日期</label>
                  <DatePicker 
                    value={formData.date}
                    onChange={val => setFormData({ ...formData, date: val })}
                    className="h-11"
                    triggerClassName="rounded-xl border-border bg-muted/30 focus:ring-primary/20"
                    placeholder="选择账单日期"
                  />
                </div>
              </div>
              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-12 rounded-xl border border-border font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-[0.98] text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-black shadow-md shadow-black/10 dark:shadow-none transition-all active:scale-[0.98] text-sm"
                >
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title="确认删除"
        message={confirmConfig.message}
        onConfirm={() => {
          confirmConfig.onConfirm();
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

export default function SetupPurchasesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">加载中...</div>}>
      <SetupPurchasesContent />
    </Suspense>
  );
}
