"use client";

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from "react";
import {
  BadgeCheck,
  Check,
  ClipboardCheck,
  Edit2,
  Eye,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  ListChecks,
  Loader2,
  Package,
  Plus,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { PERMISSION_TREE } from "@/lib/permissions";
import { useToast } from "@/components/ui/Toast";
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

const GROUP_ICONS = {
  products: Package,
  categories: LayoutGrid,
  suppliers: Truck,
  purchases: ShoppingBag,
  setup_purchases: Store,
  inbound: Warehouse,
  outbound: Package,
  brush_center: Layers,
  gallery: ImageIcon,
  gallery_audit: ClipboardCheck,
  system: Settings,
} as const;

function getGroupIcon(groupKey: string) {
  return GROUP_ICONS[groupKey as keyof typeof GROUP_ICONS] || Shield;
}

function summarizeRolePermissions(permissions: Record<string, boolean> | undefined) {
  return PERMISSION_TREE.map((group) => {
    const selected = group.children.filter((child) => permissions?.[child.key]).length;
    return {
      ...group,
      selected,
      total: group.children.length,
    };
  }).filter((group) => group.selected > 0);
}

export const RoleManager = forwardRef<RoleManagerHandle>((props, ref) => {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<RoleProfile> | null>(null);
  const [activeTab, setActiveTab] = useState<string>(PERMISSION_TREE[0].key);
  const [permissionQuery, setPermissionQuery] = useState("");
  const groupListRef = useRef<HTMLDivElement | null>(null);
  const detailPaneRef = useRef<HTMLDivElement | null>(null);
  const mobilePaneRef = useRef<HTMLDivElement | null>(null);
  const { showToast } = useToast();

  useImperativeHandle(ref, () => ({
    openCreateModal: () => {
      setEditingRole({ name: "", description: "", permissions: {} });
      setActiveTab(PERMISSION_TREE[0].key);
      setPermissionQuery("");
    },
  }));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/roles");
      if (res.ok) {
        setRoles(await res.json());
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

  useEffect(() => {
    if (!detailPaneRef.current) return;
    if (detailPaneRef.current.scrollHeight <= detailPaneRef.current.clientHeight) return;
    detailPaneRef.current.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    if (!mobilePaneRef.current) return;
    mobilePaneRef.current.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [activeTab, editingRole?.id]);

  useEffect(() => {
    if (!editingRole) return;

    const originalOverflow = document.body.style.overflow;
    const originalOverscrollBehavior = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscrollBehavior;
    };
  }, [editingRole]);

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

      if (!res.ok) {
        const error = await res.json();
        showToast(error.error || "操作失败", "error");
        return;
      }

      showToast(editingRole.id ? "更新成功" : "创建成功", "success");
      setEditingRole(null);
      fetchRoles();
    } catch {
      showToast("请求失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const togglePermission = (key: string) => {
    if (!editingRole) return;
    const permissions = { ...(editingRole.permissions || {}) };
    permissions[key] = !permissions[key];
    setEditingRole({ ...editingRole, permissions });
  };

  const toggleGroup = (keys: string[], nextValue: boolean) => {
    if (!editingRole) return;
    const permissions = { ...(editingRole.permissions || {}) };
    keys.forEach((key) => {
      permissions[key] = nextValue;
    });
    setEditingRole({ ...editingRole, permissions });
  };

  const openRole = (role: RoleProfile) => {
    setEditingRole(role);
    setActiveTab(PERMISSION_TREE[0].key);
    setPermissionQuery("");
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;

    try {
      const res = await fetch(`/api/admin/roles?id=${roleToDelete}`, { method: "DELETE" });
      if (res.ok) {
        showToast("角色已移除", "success");
        fetchRoles();
      } else {
        showToast("删除失败", "error");
      }
    } catch {
      showToast("删除失败", "error");
    } finally {
      setRoleToDelete(null);
    }
  };

  if (!isMounted) return null;

  const selectedPermissions = Object.values(editingRole?.permissions || {}).filter(Boolean).length;
  const enabledGroups = summarizeRolePermissions(editingRole?.permissions);
  const currentGroup = PERMISSION_TREE.find((group) => group.key === activeTab) || PERMISSION_TREE[0];
  const currentKeys = currentGroup.children.map((child) => child.key);
  const currentSelected = currentKeys.filter((key) => !!editingRole?.permissions?.[key]).length;
  const visiblePermissions = currentGroup.children.filter((child) => {
    const query = permissionQuery.trim().toLowerCase();
    if (!query) return true;
    return child.label.toLowerCase().includes(query) || child.key.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6 min-h-[400px] relative">
      {isLoading && roles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-500 opacity-20" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {roles.map((role) => {
            const groups = summarizeRolePermissions(role.permissions);
            return (
              <div
                key={role.id}
                className="group rounded-[28px] border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="h-12 w-12 rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center text-primary shrink-0">
                      <Shield size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black tracking-tight text-foreground">{role.name}</h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.12em] uppercase",
                            role.isSystem ? "bg-amber-500/10 text-amber-600" : "bg-sky-500/10 text-sky-600"
                          )}
                        >
                          {role.isSystem ? "系统角色" : "自定义"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {role.description || "暂无描述，建议补充这个角色适合谁使用。"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openRole(role)}
                      className="h-10 w-10 rounded-2xl border border-border bg-background/70 hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title={role.isSystem ? "查看内置角色权限" : "编辑角色权限"}
                    >
                      {role.isSystem ? <Eye size={18} /> : <Edit2 size={18} />}
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => setRoleToDelete(role.id)}
                        className="h-10 w-10 rounded-2xl border border-border bg-background/70 hover:bg-red-500/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-red-500"
                        title="删除角色"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-black/3 dark:bg-white/5 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">成员覆盖</div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-2xl font-black text-foreground">{role._count?.users || 0}</span>
                      <span className="pb-1 text-xs text-muted-foreground">位成员</span>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-primary/5 px-4 py-3 ring-1 ring-primary/10">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-primary/60">权限规模</div>
                    <div className="mt-1 flex items-end gap-2">
                      <span className="text-2xl font-black text-foreground">{Object.values(role.permissions || {}).filter(Boolean).length}</span>
                      <span className="pb-1 text-xs text-muted-foreground">项已启用</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
                    <Sparkles size={12} />
                    角色画像
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {groups.slice(0, 4).map((group) => {
                      const GroupIcon = getGroupIcon(group.key);
                      return (
                        <div key={group.key} className="inline-flex items-center gap-2 rounded-full bg-muted/60 dark:bg-white/8 px-3 py-2 text-xs font-bold text-foreground/80">
                          <GroupIcon size={12} />
                          {group.label}
                          <span className="text-muted-foreground">{group.selected}/{group.total}</span>
                        </div>
                      );
                    })}
                    {groups.length === 0 && <div className="text-xs text-muted-foreground">这个角色还没有启用任何权限。</div>}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={() => {
              setEditingRole({ name: "", description: "", permissions: {} });
              setActiveTab(PERMISSION_TREE[0].key);
              setPermissionQuery("");
            }}
            className="h-full min-h-[280px] rounded-[28px] border-2 border-dashed border-black/6 dark:border-white/8 flex flex-col items-center justify-center gap-4 hover:border-primary/30 hover:bg-primary/5 transition-all group"
          >
            <div className="h-14 w-14 rounded-full bg-muted dark:bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
              <Plus size={24} />
            </div>
            <div className="space-y-1 text-center">
              <div className="font-black text-base text-foreground">创建新角色</div>
              <div className="text-xs text-muted-foreground max-w-[220px]">从空白模板开始，按职责勾选权限并立即投入使用。</div>
            </div>
          </button>
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {editingRole && (
            <div className="fixed inset-0 z-99999 flex items-end sm:items-center justify-center p-3 sm:p-4 overscroll-none">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingRole(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                className="relative w-full max-w-7xl h-[92dvh] sm:h-[90dvh] max-h-[92dvh] sm:max-h-[90dvh] min-h-0 bg-background border border-border rounded-[28px] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="px-5 sm:px-6 py-4 shrink-0 bg-background/95 backdrop-blur border-b border-border/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Shield size={18} />
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <h2 className="text-xl sm:text-lg md:text-xl font-black tracking-tighter text-foreground leading-none">
                          {editingRole.id ? (editingRole.isSystem ? "查看系统内置角色" : "配置访问权限") : "创建新角色"}
                        </h2>
                        <p className="mt-2 max-w-[20rem] text-sm sm:text-xs text-muted-foreground leading-6 sm:leading-5">
                          把角色信息、权限组和具体能力放在同一个工作区里，一次看清。
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingRole(null)}
                      className="h-11 w-11 sm:h-9 sm:w-9 rounded-full hover:bg-muted flex items-center justify-center transition-all opacity-70 hover:opacity-100 shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div
                  ref={mobilePaneRef}
                  className="sm:hidden flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar touch-pan-y"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  <div className="p-4 pb-24 space-y-4">
                    <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-black text-foreground ml-1 flex items-center gap-1">
                          角色名称 <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-3 bg-background border border-border rounded-2xl px-4 py-3">
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

                      <div className="space-y-1.5">
                        <label className="text-sm font-black text-foreground ml-1">职能定位描述</label>
                        <div className="flex items-center gap-3 bg-background border border-border rounded-2xl px-4 py-3">
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

                    <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                        <ListChecks size={12} />
                        权限分组
                      </div>
                      <div className="-mx-1 overflow-x-auto px-1">
                        <div className="flex gap-2 min-w-max">
                          {PERMISSION_TREE.map((group) => {
                            const selectedCount = group.children.filter((child) => !!editingRole.permissions?.[child.key]).length;
                            const isActive = activeTab === group.key;
                            const GroupIcon = getGroupIcon(group.key);
                            return (
                              <button
                                key={group.key}
                                onClick={() => setActiveTab(group.key)}
                                className={cn(
                                  "min-w-[140px] rounded-2xl border px-3 py-3 text-left transition-all touch-pan-y",
                                  isActive ? "border-primary/30 bg-primary/8 shadow-sm" : "border-border bg-background hover:bg-muted/50"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                                    <GroupIcon size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-black text-foreground truncate">{group.label}</div>
                                    <div className="text-[11px] text-muted-foreground">{selectedCount} / {group.children.length}</div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-3xl border border-border/60 bg-background/70 p-4">
                      <div className="space-y-1">
                        <h3 className="text-xl font-black tracking-tight text-foreground">{currentGroup.label}</h3>
                        <p className="text-sm text-muted-foreground">在当前分组里精细配置这个角色能访问和操作的功能。</p>
                      </div>

                      <div className="space-y-3">
                        <div className="relative">
                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            value={permissionQuery}
                            onChange={(e) => setPermissionQuery(e.target.value)}
                            placeholder="搜索当前分组权限..."
                            className="w-full h-11 rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none"
                          />
                        </div>
                        {!editingRole.isSystem && (
                          <button
                            onClick={() => toggleGroup(currentKeys, currentSelected !== currentKeys.length)}
                            className="w-full h-11 px-4 rounded-2xl border border-border bg-background hover:bg-muted text-sm font-black"
                          >
                            当前分组全选/撤销
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-border bg-background px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">启用权限</div>
                          <div className="mt-1 text-xl font-black text-foreground">{selectedPermissions}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background px-4 py-3">
                          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">覆盖模块</div>
                          <div className="mt-1 text-xl font-black text-foreground">{enabledGroups.length}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {visiblePermissions.map((child) => {
                          const isChecked = !!editingRole.permissions?.[child.key];
                          return (
                            <button
                              key={child.key}
                              type="button"
                              role="switch"
                              aria-checked={isChecked}
                              disabled={editingRole.isSystem}
                              onPointerDown={(e) => e.preventDefault()}
                              onClick={() => !editingRole.isSystem && togglePermission(child.key)}
                              className={cn(
                                "flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all cursor-pointer shadow-sm",
                                isChecked ? "border-primary/25 bg-primary/6" : "border-border bg-background hover:bg-muted/40",
                                editingRole.isSystem && "cursor-not-allowed opacity-70"
                              )}
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="text-base font-black text-foreground leading-none">{child.label}</div>
                                <div className={cn("text-xs font-bold", isChecked ? "text-primary/80" : "text-muted-foreground")}>
                                  {isChecked ? "已启用" : "未启用"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isChecked && <Check size={14} className="text-primary" />}
                                <div className={cn("relative w-10 h-6 rounded-full border transition-all", isChecked ? "bg-foreground dark:bg-white border-foreground dark:border-white" : "bg-muted border-border", editingRole.isSystem && "opacity-50")}>
                                  <div className={cn("absolute top-0.5 left-0.5 h-4.5 w-4.5 rounded-full transition-all", isChecked ? "translate-x-4 bg-background dark:bg-black" : "bg-muted-foreground/60")} />
                                </div>
                              </div>
                            </button>
                          );
                        })}

                        {visiblePermissions.length === 0 && (
                          <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                            当前分组里没有匹配 “{permissionQuery}” 的权限项。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block flex-1 min-h-0 overflow-hidden">
                  <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] h-full min-h-0">
                    <div className="border-b xl:border-b-0 xl:border-r border-border/60 bg-black/[0.015] dark:bg-white/[0.02] h-full min-h-0 flex flex-col">
                      <div className="p-4 md:p-5 space-y-4 shrink-0 border-b border-border/40">
                        <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-black text-foreground ml-1 flex items-center gap-1">
                            角色名称 <span className="text-red-500">*</span>
                          </label>
                          <div className="flex items-center gap-3 bg-background border border-border rounded-2xl px-5 py-3">
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

                        <div className="space-y-1.5">
                          <label className="text-sm font-black text-foreground ml-1">职能定位描述</label>
                          <div className="flex items-center gap-3 bg-background border border-border rounded-2xl px-5 py-3">
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

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                          <ListChecks size={12} />
                          权限分组
                        </div>
                      </div>
                      </div>

                      <div ref={groupListRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 md:px-5 pb-4 xl:pb-16 pt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 min-w-0">
                          {PERMISSION_TREE.map((group) => {
                            const selectedCount = group.children.filter((child) => !!editingRole.permissions?.[child.key]).length;
                            const isActive = activeTab === group.key;
                            const GroupIcon = getGroupIcon(group.key);
                            return (
                            <button
                              key={group.key}
                              onClick={() => setActiveTab(group.key)}
                              className={cn(
                                "w-full rounded-2xl border px-4 py-3 text-left transition-all touch-pan-y",
                                isActive ? "border-primary/30 bg-primary/8 shadow-sm" : "border-border bg-background hover:bg-muted/50"
                              )}
                            >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                                      <GroupIcon size={16} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-black text-foreground truncate">{group.label}</div>
                                      <div className="text-[11px] text-muted-foreground">{selectedCount} / {group.children.length} 已启用</div>
                                    </div>
                                  </div>
                                  <div className="text-xs font-black text-muted-foreground">{selectedCount}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div ref={detailPaneRef} className="h-full min-h-0 overflow-y-auto custom-scrollbar">
                      <div className="xl:sticky xl:top-0 z-10 p-4 md:p-8 pb-4 bg-background/96 backdrop-blur border-b border-border/40 space-y-5">
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                          <div className="space-y-1">
                            <h3 className="text-2xl md:text-3xl font-black tracking-tighter text-foreground">{currentGroup.label}</h3>
                            <p className="text-sm text-muted-foreground">在当前分组里精细配置这个角色能访问和操作的功能。</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative min-w-[240px]">
                              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="text"
                                value={permissionQuery}
                                onChange={(e) => setPermissionQuery(e.target.value)}
                                placeholder="搜索当前分组权限..."
                                className="w-full h-11 rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none"
                              />
                            </div>
                            {!editingRole.isSystem && (
                              <button
                                onClick={() => toggleGroup(currentKeys, currentSelected !== currentKeys.length)}
                                className="h-11 px-4 rounded-2xl border border-border bg-background hover:bg-muted text-sm font-black"
                              >
                                当前分组全选/撤销
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-border bg-white/50 dark:bg-white/5 p-5">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">分组概览</div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                当前已启用 <span className="font-black text-foreground">{currentSelected}</span> / {currentGroup.children.length} 项能力
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${(currentSelected / currentGroup.children.length) * 100}%` }} />
                              </div>
                              <div className={cn("text-xs font-black", currentSelected === currentGroup.children.length ? "text-primary" : "text-muted-foreground")}>
                                {currentSelected === currentGroup.children.length ? "已全开" : "未全开"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,180px)_minmax(0,180px)_minmax(0,1fr)] gap-3">
                          <div className="rounded-2xl border border-border bg-background px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">启用权限</div>
                            <div className="mt-1 text-2xl font-black text-foreground">{selectedPermissions}</div>
                          </div>
                          <div className="rounded-2xl border border-border bg-background px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">覆盖模块</div>
                            <div className="mt-1 text-2xl font-black text-foreground">{enabledGroups.length}</div>
                          </div>
                          <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                              <BadgeCheck size={12} />
                              已覆盖模块
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {enabledGroups.length > 0 ? (
                                enabledGroups.map((group) => (
                                  <div key={group.key} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-bold text-foreground/80">
                                    {group.label}
                                    <span className="text-muted-foreground">{group.selected}/{group.total}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-xs text-muted-foreground">还没有选中任何权限。</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 md:p-8 pt-5 pb-16">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={activeTab + permissionQuery}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-5"
                          >
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                              {visiblePermissions.map((child) => {
                                const isChecked = !!editingRole.permissions?.[child.key];
                                return (
                                  <label
                                    key={child.key}
                                    className={cn(
                                      "flex flex-col gap-3 rounded-2xl md:rounded-3xl border p-4 md:p-5 transition-all cursor-pointer shadow-sm min-h-[92px] md:min-h-[116px]",
                                      isChecked ? "border-primary/25 bg-primary/6" : "border-border bg-background hover:bg-muted/40"
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-black text-foreground">{child.label}</div>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0 text-[11px] md:text-xs text-muted-foreground font-mono break-all">{child.key}</div>
                                      <div className="flex items-center gap-2 md:gap-3 shrink-0">
                                        {isChecked && <Check size={14} className="text-primary" />}
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={editingRole.isSystem}
                                          onChange={() => togglePermission(child.key)}
                                          className="sr-only"
                                        />
                                        <div className={cn("relative w-9 h-5.5 md:w-10 md:h-6 rounded-full border transition-all", isChecked ? "bg-foreground dark:bg-white border-foreground dark:border-white" : "bg-muted border-border", editingRole.isSystem && "opacity-50")}>
                                          <div className={cn("absolute top-0.5 left-0.5 h-4 w-4 md:h-4.5 md:w-4.5 rounded-full transition-all", isChecked ? "translate-x-3.5 md:translate-x-4.5 bg-background dark:bg-black" : "bg-muted-foreground/60")} />
                                        </div>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>

                            {visiblePermissions.length === 0 && (
                              <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                                当前分组里没有匹配 “{permissionQuery}” 的权限项。
                              </div>
                            )}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 md:px-8 py-4 flex flex-row items-center justify-between gap-4 shrink-0 bg-background border-t border-border">
                  <div className="hidden lg:flex items-center gap-3 rounded-2xl border border-border bg-white/40 dark:bg-white/5 px-4 py-2">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.16em]">当前配置</span>
                    <span className="text-lg font-black text-foreground">{selectedPermissions}</span>
                    <span className="text-xs font-bold text-muted-foreground">项权限已启用</span>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto ml-auto">
                    <button onClick={() => setEditingRole(null)} className="flex-1 sm:flex-none px-4 md:px-6 h-10 rounded-xl md:rounded-2xl font-black hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm opacity-70">
                      {editingRole.isSystem ? "关闭" : "放弃"}
                    </button>
                    {!editingRole.isSystem && (
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1 sm:flex-none px-6 md:px-10 h-10 rounded-xl md:rounded-2xl bg-foreground text-background font-black shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} strokeWidth={3} />}
                        <span className="text-sm md:text-base">保存角色</span>
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
