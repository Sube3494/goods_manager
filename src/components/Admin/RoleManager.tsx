"use client";

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { 
  Shield, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Loader2,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSION_TREE } from "@/lib/permissions";
import { useToast } from "@/components/ui/Toast";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export interface RoleManagerHandle {
  openCreateModal: () => void;
}

interface RoleProfile {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
  _count?: { users: number };
}

export const RoleManager = forwardRef<RoleManagerHandle>((props, ref) => {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [editingRole, setEditingRole] = useState<Partial<RoleProfile> | null>(null);
  const { showToast } = useToast();

  useImperativeHandle(ref, () => ({
    openCreateModal: () => {
      setEditingRole({ name: "", description: "", permissions: {} });
    }
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch {
      showToast("获取角色列表失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleSave = async () => {
    if (!editingRole?.name) {
      showToast("角色名称不能为空", "error");
      return;
    }

    setIsSaving(true);
    try {
      const method = editingRole.id ? "PUT" : "POST";
      const res = await fetch("/api/admin/roles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRole),
      });

      if (res.ok) {
        showToast(editingRole.id ? "更新成功" : "创建成功", "success");
        setEditingRole(null);
        fetchRoles();
      } else {
        const error = await res.json();
        showToast(error.error || "操作失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除该角色吗？与之关联的用户将失去权限。")) return;

    try {
      const res = await fetch(`/api/admin/roles?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("角色已移除", "success");
        fetchRoles();
      }
    } catch {
      showToast("删除失败", "error");
    }
  };

  const togglePermission = (key: string) => {
    if (!editingRole) return;
    const newPermissions = { ...(editingRole.permissions || {}) };
    newPermissions[key] = !newPermissions[key];
    setEditingRole({ ...editingRole, permissions: newPermissions });
  };

  const toggleGroup = (keys: string[], check: boolean) => {
    if (!editingRole) return;
    const newPermissions = { ...(editingRole.permissions || {}) };
    keys.forEach(k => { newPermissions[k] = check; });
    setEditingRole({ ...editingRole, permissions: newPermissions });
  };

  if (!isMounted) return null;

  return (
    <div className="space-y-6 min-h-[400px] relative">
      {isLoading && roles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary opacity-20" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map((role) => (
          <div key={role.id} className="group relative bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/10 transition-all overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Shield size={24} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingRole(role)} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                  <Edit2 size={18} />
                </button>
                {!role.isSystem && (
                  <button onClick={() => handleDelete(role.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-lg font-black text-foreground mb-1">{role.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 min-h-[40px] leading-relaxed italic opacity-60 group-hover:opacity-100 transition-opacity">
              {role.description || "暂无描述"}
            </p>
            <div className="mt-6 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/20 text-muted-foreground">
                <Users size={12} />
                {role._count?.users || 0} 位成员
              </div>
              {role.isSystem && (
                <div className="px-3 py-1.5 rounded-full bg-primary/20 text-primary border border-primary/20">
                  系统锁定
                </div>
              )}
            </div>
          </div>
        ))}

          <button 
            onClick={() => setEditingRole({ name: "", description: "", permissions: {} })}
            className="h-full min-h-[200px] border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all group"
          >
            <div className="h-14 w-14 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
              <Plus size={28} />
            </div>
            <span className="font-bold text-muted-foreground group-hover:text-primary transition-colors">全定义新角色</span>
          </button>
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {editingRole && (
            <div className="fixed inset-0 z-99999 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={() => setEditingRole(null)} 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ opacity: 0, y: 100 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 100 }} 
                className="relative w-full max-w-6xl bg-[#0a0a0b] border border-white/10 rounded-t-[40px] shadow-2xl overflow-y-auto custom-scrollbar flex flex-col h-[95vh] mt-[5vh]"
              >
                {/* 顶部标题栏 */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0a0a0b] sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Shield size={18} />
                        </div>
                        <h2 className="text-base font-black text-foreground tracking-tight">定义全新角色权限</h2>
                    </div>
                    <button onClick={() => setEditingRole(null)} className="h-8 w-8 rounded-full hover:bg-white/5 flex items-center justify-center transition-all opacity-40 hover:opacity-100">
                        <X size={16} />
                    </button>
                </div>

                {/* 主滚动区：不再使用内层滚动，作为普通 div 流展示 */}
                <div className="flex-1 p-6 space-y-4">
                    {/* 极致精简：单行身份工具栏 */}
                    <div className="flex items-center gap-4 bg-white/2 border border-white/5 rounded-xl px-4 py-1.5 shrink-0">
                        <div className="flex-1 flex items-center gap-2 group">
                            <label className="shrink-0 text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">名</label>
                            <input 
                                type="text" 
                                value={editingRole.name || ""}
                                onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                                disabled={editingRole.isSystem}
                                placeholder="输入角色..."
                                className="flex-1 h-8 bg-transparent outline-none font-bold text-sm text-foreground placeholder:opacity-20"
                            />
                        </div>

                        <div className="h-4 w-px bg-white/10" />

                        <div className="flex-2 flex items-center gap-2 group">
                            <label className="shrink-0 text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-40">描述</label>
                            <input 
                                type="text" 
                                value={editingRole.description || ""}
                                onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                                placeholder="简述职能定位..."
                                className="w-full h-8 bg-transparent outline-none font-bold text-xs text-foreground/70"
                            />
                        </div>
                    </div>

                    {/* 权限矩阵区域 */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-1 bg-primary rounded-full" />
                            <h4 className="text-xs font-black uppercase tracking-widest text-foreground/60">功能权限配置</h4>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {PERMISSION_TREE.map((group) => {
                                const groupKeys = group.children.map(c => c.key);
                                const allChecked = groupKeys.every(k => !!editingRole.permissions?.[k]);

                                return (
                                    <div key={group.key} className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-3xl bg-white/2 border border-white/5 group/row hover:bg-white/4 transition-all">
                                        <div className="w-full md:w-32 shrink-0">
                                            <h5 className="font-black text-[13px] text-foreground/90 tracking-tight group-hover/row:text-primary transition-colors">
                                                {group.label}
                                            </h5>
                                            <button 
                                                onClick={() => toggleGroup(groupKeys, !allChecked)}
                                                className={cn(
                                                    "mt-1 text-[9px] font-black uppercase tracking-tighter opacity-30 hover:opacity-100 hover:text-primary transition-all",
                                                    allChecked && "text-primary opacity-60"
                                                )}
                                            >
                                                {allChecked ? "撤销全选" : "全选模块"}
                                            </button>
                                        </div>

                                        <div className="flex-1 flex flex-wrap gap-2">
                                            {group.children.map((child) => {
                                                const label = child.label.replace(group.label.replace("管理", ""), "").trim() || child.label;
                                                const isChecked = !!editingRole.permissions?.[child.key];
                                                
                                                return (
                                                    <label 
                                                        key={child.key} 
                                                        className={cn(
                                                            "flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none",
                                                            isChecked
                                                                ? "bg-primary/20 border-primary/40 text-primary shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                                                                : "bg-white/2 border-white/5 text-muted-foreground hover:border-white/20 hover:text-foreground"
                                                        )}
                                                    >
                                                        <div className="relative inline-flex items-center cursor-pointer">
                                                            <input type="checkbox" checked={isChecked} onChange={() => togglePermission(child.key)} className="sr-only peer" />
                                                            <div className="w-7 h-4 bg-black/40 dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary transition-colors"></div>
                                                        </div>
                                                        <span className="text-[12px] font-bold">{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* 底部按钮栏 */}
                <div className="px-10 py-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 shrink-0 bg-white/2">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-muted-foreground uppercase opacity-40 leading-none">当前配置</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-black text-primary leading-none">{Object.values(editingRole.permissions || {}).filter(Boolean).length}</span>
                            <span className="text-xs font-bold text-muted-foreground">项功能权限</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 w-full sm:w-auto">
                        <button onClick={() => setEditingRole(null)} className="flex-1 sm:flex-none px-8 h-12 rounded-2xl font-black hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm opacity-60">放弃</button>
                        <button onClick={handleSave} disabled={isSaving} className="flex-1 sm:flex-none px-12 h-12 rounded-2xl bg-primary text-primary-foreground font-black shadow-2xl shadow-primary/30 hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Check size={22} strokeWidth={3} />}
                            部署配置
                        </button>
                    </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
});

RoleManager.displayName = "RoleManager";
