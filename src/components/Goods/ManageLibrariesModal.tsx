"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Edit3, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

interface Library {
  id: string;
  name: string;
  code: string;
  isPublic: boolean;
}

interface ManageLibrariesModalProps {
  isOpen: boolean;
  onClose: () => void;
  libraries: Library[];
  onUpdate: () => void;
}

export function ManageLibrariesModal({
  isOpen,
  onClose,
  libraries,
  onUpdate
}: ManageLibrariesModalProps) {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [newLibName, setNewLibName] = useState("");

  // 行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen]);

  if (typeof window === "undefined" || !isOpen) return null;

  // 创建新商品库
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibName.trim()) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/product-libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLibName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "创建商品库失败");
      }

      showToast("商品库创建成功", "success");
      setNewLibName("");
      onUpdate(); // 刷新父组件的库列表
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  // 保存单行修改 (编辑商品库)
  const handleSaveEdit = async (id: string, originalIsPublic: boolean) => {
    if (!editingName.trim()) return;
    try {
      const res = await fetch(`/api/product-libraries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "修改失败");
      }

      showToast("修改成功", "success");
      setEditingId(null);
      onUpdate();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };



  // 删除商品库
  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除这个商品库吗？该操作不可逆！")) return;

    try {
      const res = await fetch(`/api/product-libraries/${id}`, {
        method: "DELETE"
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "删除失败");
      }

      showToast("商品库已成功删除", "success");
      onUpdate();
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm transition-all sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-black/10 bg-white/96 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-xl dark:border-white/10 dark:bg-[#111722]/96 dark:shadow-[0_28px_90px_rgba(0,0,0,0.52)] sm:rounded-[30px]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-black/8 px-4 py-4 dark:border-white/8 sm:px-7 sm:py-5">
            <div className="min-w-0">
              <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">管理商品模板库</h2>
              <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground sm:text-sm">配置商品库档案名称，系统内置库仅支持改名。</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition-all hover:border-black/8 hover:bg-black/5 hover:text-foreground dark:hover:border-white/10 dark:hover:bg-white/8"
              aria-label="关闭"
            >
              <X size={19} />
            </button>
          </div>

          {/* Form to create new library */}
          <form onSubmit={handleCreate} className="flex flex-col gap-3 border-b border-black/8 bg-slate-50/80 p-4 dark:border-white/8 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:p-6">
            <div className="flex-1">
              <input
                type="text"
                placeholder="新建商品库名称..."
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                className="h-11 w-full rounded-2xl border border-black/8 bg-white px-4 text-sm font-medium text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/30 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/6 dark:focus:border-primary/40"
                disabled={isSaving}
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !newLibName.trim()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/15 transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              新增商品库
            </button>
          </form>

          {/* List of libraries */}
          <div className="max-h-[45vh] flex-1 space-y-4 overflow-y-auto bg-white/70 p-3 dark:bg-transparent sm:p-6">
            <div className="overflow-hidden rounded-[22px] border border-black/8 bg-white shadow-xs dark:border-white/10 dark:bg-white/[0.035]">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-black/8 bg-slate-50 text-xs font-bold text-muted-foreground dark:border-white/8 dark:bg-white/[0.045]">
                    <th className="px-4 py-3 sm:px-5">商品库名称</th>
                    <th className="px-4 py-3 text-right sm:px-5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/6 dark:divide-white/8">
                  {libraries.map((lib) => {
                    const isSystem = lib.code === "public" || lib.code === "secret";
                    const isEditing = editingId === lib.id;

                    return (
                      <tr key={lib.id} className="group transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.045]">
                        <td className="px-4 py-3.5 font-semibold text-foreground sm:px-5">
                          {isEditing ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-9 min-w-[70px] max-w-[11rem] flex-1 rounded-xl border border-black/8 bg-white px-3 text-sm font-semibold text-foreground outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/6 sm:max-w-[18rem]"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(lib.id, lib.isPublic)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-600 transition-all hover:bg-emerald-500/18 dark:text-emerald-400"
                                title="保存"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/15 bg-rose-500/10 text-rose-600 transition-all hover:bg-rose-500/18 dark:text-rose-400"
                                title="取消"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{lib.name}</span>
                              {isSystem && (
                                <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] font-black leading-none text-primary">
                                  内置
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right sm:px-5">
                          <div className="flex justify-end gap-1.5">
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(lib.id);
                                  setEditingName(lib.name);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                                title="编辑名称"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                            {!isSystem && (
                              <button
                                type="button"
                                onClick={() => handleDelete(lib.id)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-rose-500/10 hover:text-rose-500"
                                title="删除"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
