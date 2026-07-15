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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-border dark:border-white/10">
            <div>
              <h2 className="text-xl font-bold text-foreground">管理商品模板库</h2>
              <p className="text-xs text-muted-foreground mt-0.5">配置商品库档案名称、切换公私有或删除无商品库</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form to create new library */}
          <form onSubmit={handleCreate} className="p-4 sm:p-6 border-b border-border dark:border-white/10 bg-muted/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="新建商品库名称..."
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                className="w-full h-10 px-4 rounded-xl border border-border bg-white dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground"
                disabled={isSaving}
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !newLibName.trim()}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-95 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              新增商品库
            </button>
          </form>

          {/* List of libraries */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-h-[45vh]">
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border text-xs text-muted-foreground font-semibold">
                    <th className="px-3 sm:px-5 py-2.5 sm:py-3">商品库名称</th>
                    <th className="px-3 sm:px-5 py-2.5 sm:py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {libraries.map((lib) => {
                    const isSystem = lib.code === "public" || lib.code === "secret";
                    const isEditing = editingId === lib.id;

                    return (
                      <tr key={lib.id} className="hover:bg-muted/10 transition-colors group">
                        <td className="px-3 sm:px-5 py-2.5 sm:py-3 font-medium text-foreground">
                          {isEditing ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="px-2 py-1 text-sm rounded-lg border border-border bg-white dark:bg-white/5 outline-none focus:ring-2 focus:ring-primary/20 flex-1 min-w-[70px] max-w-[9rem] sm:max-w-[15rem]"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveEdit(lib.id, lib.isPublic)}
                                className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                title="保存"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20"
                                title="取消"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span>{lib.name}</span>
                              {isSystem && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/5 text-primary border border-primary/10 font-bold scale-90">
                                  内置
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 sm:px-5 py-2.5 sm:py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            {!isEditing && (
                              <button
                                onClick={() => {
                                  setEditingId(lib.id);
                                  setEditingName(lib.name);
                                }}
                                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                                title="编辑名称"
                              >
                                <Edit3 size={14} />
                              </button>
                            )}
                            {!isSystem && (
                              <button
                                onClick={() => handleDelete(lib.id)}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
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
