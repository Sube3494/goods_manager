"use client";

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { 
  Users,
  Package,
  LayoutGrid,
  Truck,
  ShoppingBag,
  Warehouse,
  Layers,
  Image as ImageIcon,
  ClipboardCheck,
  Settings,
  Shield, 
  Plus, 
  Trash2, 
  Edit2, 
  ListChecks,
  X, 
  Loader2,
  Eye,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERMISSION_TREE } from "@/lib/permissions";
import { useToast } from "@/components/ui/Toast";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<RoleProfile> | null>(null);
  const [activeTab, setActiveTab] = useState<string>(PERMISSION_TREE[0].key);
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

  const handleDelete = (id: string) => {
    setRoleToDelete(id);
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;

    try {
      const res = await fetch(`/api/admin/roles?id=${roleToDelete}`, { method: "DELETE" });
      if (res.ok) {
        showToast("角色已移除", "success");
        fetchRoles();
      }
    } catch {
      showToast("删除失败", "error");
    } finally {
      setRoleToDelete(null);
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
          <Loader2 className="animate-spin text-emerald-500 opacity-20" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
          <div key={role.id} className="group relative bg-card dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-3xl p-5 hover:bg-muted/50 dark:hover:bg-white/10 transition-all overflow-hidden shadow-sm hover:shadow-xl">
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-2xl bg-muted dark:bg-white/5 flex items-center justify-center text-foreground group-hover:scale-110 transition-transform">
                <Shield size={20} />
              </div>
              <div className="flex items-center gap-2">
                {role.isSystem ? (
                  <button onClick={() => setEditingRole(role)} title="查看内置角色权限" className="p-2 rounded-xl hover:bg-muted dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                    <Eye size={18} />
                  </button>
                ) : (
                  <button onClick={() => setEditingRole(role)} title="编辑角色权限" className="p-2 rounded-xl hover:bg-muted dark:hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                    <Edit2 size={18} />
                  </button>
                )}
                {!role.isSystem && (
                  <button onClick={() => handleDelete(role.id)} className="p-2 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-base font-black text-foreground mb-1">{role.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px] leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity">
              {role.description || "暂无描述"}
            </p>
            <div className="mt-4 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 text-muted-foreground">
                <Users size={12} />
                {role._count?.users || 0} 位成员
              </div>
            </div>
          </div>
        ))}
 
          <button 
            onClick={() => setEditingRole({ name: "", description: "", permissions: {} })}
            className="h-full min-h-[160px] border-2 border-dashed border-black/5 dark:border-white/5 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-black/20 dark:hover:border-white/20 hover:bg-muted/50 dark:hover:bg-white/5 transition-all group"
          >
            <div className="h-12 w-12 rounded-full bg-muted dark:bg-white/5 flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition-all">
              <Plus size={24} />
            </div>
            <span className="font-bold text-sm text-muted-foreground group-hover:text-foreground transition-colors">创建新角色</span>
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
                className="relative w-full max-w-6xl bg-background border border-border rounded-3xl shadow-2xl overflow-y-auto custom-scrollbar flex flex-col h-[90vh] mt-[5vh]"
              >
                {/* 顶部标题栏 */}
                <div className="px-6 py-4 flex items-center justify-between shrink-0 bg-background sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-xl bg-muted dark:bg-white/5 flex items-center justify-center text-foreground">
                            <Shield size={18} />
                        </div>
                        <h2 className="text-lg md:text-xl font-black text-foreground tracking-tighter">
                            {editingRole?.id ? (editingRole.isSystem ? "查看系统内置角色" : "修改角色权限") : "创建新角色"}
                        </h2>
                    </div>
                    <button onClick={() => setEditingRole(null)} className="h-8 w-8 rounded-full hover:bg-muted dark:hover:bg-white/5 flex items-center justify-center transition-all opacity-40 hover:opacity-100">
                        <X size={16} />
                    </button>
                </div>

                {/* 主滚动区：不再使用内层滚动，作为普通 div 流展示 */}
                <div className="flex-1 p-4 md:p-6 space-y-4 bg-background">
                    {/* 极致精简：单行身份工具栏 (响应式为两行或自动折行) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-black text-foreground ml-1 flex items-center gap-1">
                                角色名称 <span className="text-red-500 font-bold">*</span>
                            </label>
                            <div className="flex items-center gap-3 bg-background dark:bg-white/3 border border-border dark:border-white/5 rounded-2xl px-5 py-3 group focus-within:bg-muted/40 dark:focus-within:bg-white/5 transition-all">
                                <input 
                                    type="text" 
                                    value={editingRole.name || ""}
                                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                                    placeholder="输入角色名称..."
                                    disabled={editingRole.isSystem}
                                    className="flex-1 bg-transparent outline-none font-black text-sm text-foreground placeholder:text-foreground/40 disabled:opacity-50"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-black text-foreground ml-1">职能定位描述</label>
                            <div className="flex items-center gap-3 bg-background dark:bg-white/3 border border-border dark:border-white/5 rounded-2xl px-5 py-3 group focus-within:bg-muted/40 dark:focus-within:bg-white/5 transition-all">
                                <input 
                                    type="text" 
                                    value={editingRole.description || ""}
                                    onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                                    placeholder="输入职能定位描述..."
                                    disabled={editingRole.isSystem}
                                    className="flex-1 bg-transparent outline-none font-bold text-sm text-foreground/80 placeholder:text-foreground/40 disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 权限分栏联动区 */}
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden -mx-4 md:-mx-6 -mb-4 md:-mb-6">
                        {/* 分类导航：移动端横滑，桌面端竖向边栏 */}
                        <div className="w-full md:w-56 bg-background dark:bg-black/10 flex flex-row md:flex-col shrink-0 border-b md:border-b-0 md:border-r border-border dark:border-white/5 z-10 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] md:shadow-none">
                            <div className="flex-1 overflow-x-auto md:overflow-y-auto no-scrollbar md:custom-scrollbar p-3 flex flex-row md:flex-col gap-2 md:space-y-1">
                                {PERMISSION_TREE.map((group) => {
                                    const groupKeys = group.children.map(c => c.key);
                                    const selectedCount = groupKeys.filter(k => !!editingRole.permissions?.[k]).length;
                                    const isActive = activeTab === group.key;
                                    
                                    return (
                                        <button
                                            key={group.key}
                                            onClick={() => setActiveTab(group.key)}
                                            className={cn(
                                                "w-auto md:w-full shrink-0 flex items-center justify-between py-2 px-3 md:p-3 rounded-2xl transition-all group/tab gap-3",
                                                isActive 
                                                    ? "bg-black text-white dark:bg-white dark:text-black shadow-md md:shadow-xl md:scale-[1.02]" 
                                                    : "text-foreground/80 hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                                            )}
                                        >
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all shrink-0",
                                                    isActive ? "bg-white/10 dark:bg-black/10 scale-90" : "bg-muted dark:bg-white/5 group-hover/tab:bg-muted-foreground/10 group-hover/tab:dark:bg-white/10"
                                                )}>
                                                    {(() => {
                                                        switch(group.key) {
                                                            case 'products': return <Package size={16} />;
                                                            case 'categories': return <LayoutGrid size={16} />;
                                                            case 'suppliers': return <Truck size={16} />;
                                                            case 'purchases': return <ShoppingBag size={16} />;
                                                            case 'store_management': return <Warehouse size={16} />;
                                                            case 'brush_orders': return <Layers size={16} />;
                                                            case 'gallery': return <ImageIcon size={16} />;
                                                            case 'gallery_audit': return <ClipboardCheck size={16} />;
                                                            case 'system': return <Settings size={16} />;
                                                            default: return <Shield size={16} />;
                                                        }
                                                    })()}
                                                </div>
                                                <span className="text-sm font-bold tracking-tight whitespace-nowrap">{group.label}</span>
                                            </div>
                                            {selectedCount > 0 && (
                                                <div className={cn(
                                                    "min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-lg text-[11px] font-black shadow-sm shrink-0",
                                                    isActive 
                                                        ? "bg-white text-black dark:bg-black dark:text-white" 
                                                        : "bg-foreground/10 text-foreground dark:bg-white/20 dark:text-white"
                                                )}>
                                                    {selectedCount}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 右侧：详细配置详情 */}
                        <div className="flex-1 bg-background overflow-y-auto custom-scrollbar relative p-4 md:p-8">
                            <AnimatePresence mode="wait">
                                {PERMISSION_TREE.map((group) => {
                                    if (group.key !== activeTab) return null;
                                    
                                    const groupKeys = group.children.map(c => c.key);
                                    const selectedCount = groupKeys.filter(k => !!editingRole.permissions?.[k]).length;
                                    const allChecked = selectedCount === groupKeys.length;

                                    return (
                                        <motion.div 
                                            key={group.key}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-8"
                                        >
                                            <div className="flex items-start justify-between group/header gap-3">
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <h3 className="text-2xl md:text-3xl font-black tracking-tighter truncate">{group.label}权限配置</h3>
                                                    <p className="text-xs md:text-sm font-semibold text-foreground/60">已开启 {selectedCount} / {group.children.length} 项功能</p>
                                                </div>
                                                {!editingRole.isSystem && (
                                                <button 
                                                    onClick={() => toggleGroup(groupKeys, !allChecked)}
                                                    className={cn(
                                                        "h-8 w-8 md:h-10 md:w-10 rounded-xl flex items-center justify-center transition-all shrink-0 mt-0.5 md:mt-0",
                                                        allChecked ? "bg-black text-white dark:bg-white dark:text-black shadow-xl" : "bg-background border border-border text-foreground/40 hover:border-foreground/20 hover:text-foreground"
                                                    )}
                                                    title={allChecked ? "撤回该组所有权限" : "授予该组全部权限"}
                                                >
                                                    <ListChecks size={18} className="md:w-5 md:h-5" />
                                                </button>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                                                {group.children.map((child) => {
                                                    const label = child.label.replace(group.label.replace("管理", ""), "").trim() || child.label;
                                                    const isChecked = !!editingRole.permissions?.[child.key];
                                                    
                                                    return (
                                                        <label 
                                                            key={child.key} 
                                                            className={cn(
                                                                "flex items-center justify-between px-3 md:px-5 py-2 md:py-3 rounded-xl md:rounded-2xl border transition-all cursor-pointer group/item select-none shadow-sm",
                                                                isChecked
                                                                    ? "bg-muted/80 dark:bg-white/12 border-foreground/20 dark:border-white/30 text-foreground dark:text-white shadow-xl scale-[1.01]"
                                                                    : "bg-background border-black/5 dark:border-white/10 text-foreground/80 hover:bg-muted hover:border-black/10"
                                                            )}
                                                        >
                                                            <span className="text-sm font-black tracking-tight">{label}</span>
                                                                <div className="flex items-center">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        disabled={editingRole.isSystem} 
                                                                        checked={isChecked} 
                                                                        onChange={() => togglePermission(child.key)} 
                                                                        className="sr-only peer" 
                                                                    />
                                                                    <div className={cn(
                                                                        "relative w-9 h-5 rounded-full transition-all duration-500 border border-black/10 dark:border-white/10 shrink-0",
                                                                        isChecked 
                                                                            ? "bg-foreground dark:bg-white" 
                                                                            : "bg-muted/50 dark:bg-white/5",
                                                                        editingRole.isSystem && "opacity-50 grayscale"
                                                                    )}>
                                                                        <div className={cn(
                                                                            "absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full transition-all duration-500",
                                                                            isChecked
                                                                                ? "translate-x-[18px] bg-background dark:bg-black"
                                                                                : "bg-muted-foreground dark:bg-white/40 shadow-sm"
                                                                        )} />
                                                                    </div>
                                                                </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* 底部按钮栏 */}
                <div className="px-6 md:px-10 py-6 md:py-8 flex flex-row items-center justify-between gap-4 shrink-0 bg-background border-t border-border">
                    <div className="hidden sm:flex flex-col">
                        <span className="text-[10px] font-black text-muted-foreground uppercase opacity-40 leading-none">当前配置</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-black text-foreground dark:text-white leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">{Object.values(editingRole.permissions || {}).filter(Boolean).length}</span>
                            <span className="text-xs font-bold text-muted-foreground">项功能权限</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto ml-auto">
                        <button onClick={() => setEditingRole(null)} className="flex-1 sm:flex-none px-4 md:px-8 h-10 md:h-12 rounded-xl md:rounded-2xl font-black hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm opacity-60">{editingRole.isSystem ? "关闭" : "放弃"}</button>
                        {!editingRole.isSystem && (
                        <button onClick={handleSave} disabled={isSaving} className="flex-1 sm:flex-none px-6 md:px-12 h-10 md:h-12 rounded-xl md:rounded-2xl bg-foreground text-background font-black shadow-2xl hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50">
                            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} strokeWidth={3} />}
                            <span className="text-sm md:text-base">部署配置</span>
                        </button>
                        )}
                    </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <ConfirmModal 
        isOpen={!!roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={confirmDelete}
        title="确认删除角色"
        message="确定要删除该角色吗？与之关联的用户将失去权限。"
        variant="danger"
        confirmLabel="确认删除"
      />
    </div>
  );
});

RoleManager.displayName = "RoleManager";
