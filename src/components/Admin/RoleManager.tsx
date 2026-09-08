"use client";

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Edit2,
  Eye,
  LayoutGrid,
  Loader2,
  Plus,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { PAGE_PERMISSION_TREE, PagePermissionGroup, PagePermissionNode } from "@/lib/permissions";
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

type PermissionStats = {
  enabledPages: number;
  totalPages: number;
  enabledActions: number;
  totalActions: number;
};

const firstGroup = PAGE_PERMISSION_TREE[0];
const firstPage = firstGroup.pages[0];

function getPageKeys(page: PagePermissionNode) {
  return [page.accessKey, ...page.actions.map((action) => action.key)];
}

function getPermissionStats(permissions: Record<string, boolean> | undefined): PermissionStats {
  return PAGE_PERMISSION_TREE.reduce<PermissionStats>(
    (stats, group) => {
      group.pages.forEach((page) => {
        stats.totalPages += 1;
        stats.totalActions += page.actions.length;
        if (permissions?.[page.accessKey]) stats.enabledPages += 1;
        stats.enabledActions += page.actions.filter((action) => permissions?.[action.key]).length;
      });
      return stats;
    },
    { enabledPages: 0, totalPages: 0, enabledActions: 0, totalActions: 0 }
  );
}

function getGroupStats(group: PagePermissionGroup, permissions: Record<string, boolean> | undefined): PermissionStats {
  return group.pages.reduce<PermissionStats>(
    (stats, page) => {
      stats.totalPages += 1;
      stats.totalActions += page.actions.length;
      if (permissions?.[page.accessKey]) stats.enabledPages += 1;
      stats.enabledActions += page.actions.filter((action) => permissions?.[action.key]).length;
      return stats;
    },
    { enabledPages: 0, totalPages: 0, enabledActions: 0, totalActions: 0 }
  );
}

function findPage(groupKey: string, pageKey: string) {
  const group = PAGE_PERMISSION_TREE.find((item) => item.key === groupKey) || firstGroup;
  const page = group.pages.find((item) => item.key === pageKey) || group.pages[0] || firstPage;
  return { group, page };
}

function SwitchMark({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 rounded-full border transition-all",
        checked ? "border-foreground bg-foreground dark:border-white dark:bg-white" : "border-border bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full transition-all",
          checked ? "translate-x-4 bg-background dark:bg-black" : "bg-muted-foreground/60"
        )}
      />
    </span>
  );
}

export const RoleManager = forwardRef<RoleManagerHandle>((props, ref) => {
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<RoleProfile> | null>(null);
  const [activeGroupKey, setActiveGroupKey] = useState(firstGroup.key);
  const [activePageKey, setActivePageKey] = useState(firstPage.key);
  const { showToast } = useToast();

  const resetEditorPosition = () => {
    setActiveGroupKey(firstGroup.key);
    setActivePageKey(firstPage.key);
  };

  const openCreateModal = () => {
    setEditingRole({ name: "", description: "", permissions: {} });
    resetEditorPosition();
  };

  useImperativeHandle(ref, () => ({ openCreateModal }));

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

  const openRole = (role: RoleProfile) => {
    setEditingRole(role);
    resetEditorPosition();
  };

  const updatePermissions = (updater: (permissions: Record<string, boolean>) => Record<string, boolean>) => {
    if (!editingRole || editingRole.isSystem) return;
    setEditingRole({
      ...editingRole,
      permissions: updater({ ...(editingRole.permissions || {}) }),
    });
  };

  const togglePageAccess = (page: PagePermissionNode) => {
    updatePermissions((permissions) => {
      const nextValue = !permissions[page.accessKey];
      permissions[page.accessKey] = nextValue;
      if (!nextValue) {
        page.actions.forEach((action) => {
          permissions[action.key] = false;
        });
      }
      return permissions;
    });
  };

  const toggleAction = (page: PagePermissionNode, actionKey: string) => {
    updatePermissions((permissions) => {
      const nextValue = !permissions[actionKey];
      permissions[actionKey] = nextValue;
      if (nextValue) {
        permissions[page.accessKey] = true;
      }
      return permissions;
    });
  };

  const setPageAll = (page: PagePermissionNode, nextValue: boolean) => {
    updatePermissions((permissions) => {
      getPageKeys(page).forEach((key) => {
        permissions[key] = nextValue;
      });
      return permissions;
    });
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

  const { group: activeGroup, page: activePage } = findPage(activeGroupKey, activePageKey);
  const activeStats = getPermissionStats(editingRole?.permissions);
  const activePageEnabled = !!editingRole?.permissions?.[activePage.accessKey];
  const activePageActionCount = activePage.actions.filter((action) => editingRole?.permissions?.[action.key]).length;
  const activePageTotal = getPageKeys(activePage).length;
  const activePageSelected = Number(activePageEnabled) + activePageActionCount;

  return (
    <div className="space-y-6 min-h-[400px] relative">
      {isLoading && roles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-emerald-500 opacity-20" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {roles.map((role) => {
            const stats = getPermissionStats(role.permissions);
            return (
              <div
                key={role.id}
                className="group rounded-[18px] border border-black/6 bg-white/72 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:shadow-black/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary ring-1 ring-primary/10">
                      <Shield size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate text-base font-black tracking-tight text-foreground">{role.name}</h3>
                        <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black", role.isSystem ? "bg-amber-500/10 text-amber-600" : "bg-sky-500/10 text-sky-600")}>
                          {role.isSystem ? "系统角色" : "自定义"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {role.description || "暂无描述，建议补充这个角色适合谁使用。"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => openRole(role)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={role.isSystem ? "查看内置角色权限" : "编辑角色权限"}
                    >
                      {role.isSystem ? <Eye size={15} /> : <Edit2 size={15} />}
                    </button>
                    {!role.isSystem && (
                      <button
                        onClick={() => setRoleToDelete(role.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title="删除角色"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-black/3 px-3 py-2 dark:bg-white/5">
                    <div className="text-[10px] font-black text-muted-foreground/60">成员</div>
                    <div className="mt-0.5 text-lg font-black text-foreground">{role._count?.users || 0}</div>
                  </div>
                  <div className="rounded-xl bg-primary/5 px-3 py-2 ring-1 ring-primary/10">
                    <div className="text-[10px] font-black text-primary/60">页面</div>
                    <div className="mt-0.5 text-lg font-black text-foreground">{stats.enabledPages}</div>
                  </div>
                  <div className="rounded-xl bg-black/3 px-3 py-2 dark:bg-white/5">
                    <div className="text-[10px] font-black text-muted-foreground/60">操作</div>
                    <div className="mt-0.5 text-lg font-black text-foreground">{stats.enabledActions}</div>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={openCreateModal}
            className="group hidden min-h-[136px] items-center justify-center gap-4 rounded-[18px] border-2 border-dashed border-black/8 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/5 dark:border-white/10 md:flex"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted transition-all group-hover:bg-primary group-hover:text-primary-foreground dark:bg-white/5">
              <Plus size={22} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="font-black text-base text-foreground">创建新角色</div>
              <div className="text-xs text-muted-foreground">按页面配置访问，再细分页面内操作。</div>
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
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 32 }}
                className="relative flex h-[92dvh] max-h-[92dvh] min-h-0 w-full max-w-7xl flex-col overflow-hidden rounded-[24px] border border-border bg-background shadow-2xl sm:h-[90dvh] sm:max-h-[90dvh] sm:rounded-3xl"
              >
                <div className="shrink-0 border-b border-border/60 bg-background px-5 py-4 sm:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Shield size={18} className="text-primary" />
                        <h2 className="text-xl font-black tracking-tight text-foreground">
                          {editingRole.id ? (editingRole.isSystem ? "查看系统角色" : "编辑角色权限") : "创建新角色"}
                        </h2>
                      </div>
                      <p className="mt-2 hidden text-sm text-muted-foreground sm:block">先决定角色能进入哪些页面，再配置页面里的具体操作。</p>
                    </div>
                    <button onClick={() => setEditingRole(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-muted">
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[280px_320px_minmax(0,1fr)] lg:overflow-hidden">
                  <aside className="hidden min-h-0 border-r border-border/60 bg-black/[0.015] p-4 dark:bg-white/[0.02] lg:flex lg:flex-col">
                    <div className="space-y-3 shrink-0">
                      <div>
                        <label className="ml-1 text-sm font-black text-foreground">角色名称</label>
                        <input
                          value={editingRole.name || ""}
                          onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                          disabled={editingRole.isSystem}
                          className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm font-black outline-none disabled:opacity-50"
                          placeholder="输入角色名称"
                        />
                      </div>
                      <div>
                        <label className="ml-1 text-sm font-black text-foreground">职能定位</label>
                        <input
                          value={editingRole.description || ""}
                          onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                          disabled={editingRole.isSystem}
                          className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm font-bold outline-none disabled:opacity-50"
                          placeholder="适合谁使用"
                        />
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-border bg-background px-3 py-2.5">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">页面</div>
                        <div className="mt-1 text-xl font-black">{activeStats.enabledPages}/{activeStats.totalPages}</div>
                      </div>
                      <div className="rounded-2xl border border-border bg-background px-3 py-2.5">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">操作</div>
                        <div className="mt-1 text-xl font-black">{activeStats.enabledActions}/{activeStats.totalActions}</div>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2 overflow-y-auto custom-scrollbar">
                      {PAGE_PERMISSION_TREE.map((group) => {
                        const stats = getGroupStats(group, editingRole.permissions);
                        const isActive = group.key === activeGroup.key;
                        return (
                          <button
                            key={group.key}
                            onClick={() => {
                              setActiveGroupKey(group.key);
                              setActivePageKey(group.pages[0]?.key || firstPage.key);
                            }}
                            className={cn("w-full rounded-2xl border px-4 py-3 text-left transition", isActive ? "border-primary/30 bg-primary/8" : "border-border bg-background hover:bg-muted/50")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-black text-foreground">{group.label}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">{stats.enabledPages}/{stats.totalPages} 页面</div>
                              </div>
                              <ArrowRight size={15} className={cn("shrink-0 transition", isActive ? "text-primary" : "text-muted-foreground")} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </aside>

                  <section className="min-h-0 border-r border-border/60 p-4 lg:overflow-y-auto lg:custom-scrollbar">
                    <div className="mb-3 space-y-2 lg:hidden">
                      <input
                        value={editingRole.name || ""}
                        onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                        disabled={editingRole.isSystem}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm font-black outline-none disabled:opacity-50"
                        placeholder="角色名称"
                      />
                      <input
                        value={editingRole.description || ""}
                        onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })}
                        disabled={editingRole.isSystem}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm font-bold outline-none disabled:opacity-50"
                        placeholder="职能定位"
                      />
                      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {PAGE_PERMISSION_TREE.map((group) => (
                          <button
                            key={group.key}
                            onClick={() => {
                              setActiveGroupKey(group.key);
                              setActivePageKey(group.pages[0]?.key || firstPage.key);
                            }}
                            className={cn("h-9 shrink-0 rounded-xl border px-3 text-xs font-black", group.key === activeGroup.key ? "border-primary/30 bg-primary/8 text-primary" : "border-border bg-background text-muted-foreground")}
                          >
                            {group.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                      <LayoutGrid size={12} />
                      {activeGroup.label}
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                      {activeGroup.pages.map((page) => {
                        const enabled = !!editingRole.permissions?.[page.accessKey];
                        const actionCount = page.actions.filter((action) => editingRole.permissions?.[action.key]).length;
                        const isActive = page.key === activePage.key;
                        return (
                          <div key={page.key} className={cn(isActive && "col-span-2 lg:col-span-1")}>
                            <button
                              onClick={() => setActivePageKey(page.key)}
                              className={cn("w-full rounded-xl border px-3 py-2.5 text-left transition lg:rounded-2xl lg:px-4 lg:py-3", isActive ? "border-primary/30 bg-primary/8 shadow-sm" : "border-border bg-background hover:bg-muted/40")}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-black text-foreground">{page.label}</div>
                                  <div className="mt-0.5 text-[11px] text-muted-foreground lg:mt-1">
                                    {enabled ? "可访问" : "未开放"} · {actionCount}/{page.actions.length} 操作
                                  </div>
                                </div>
                                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", enabled ? "bg-emerald-500" : "bg-muted-foreground/25")} />
                              </div>
                            </button>

                            {isActive && (
                              <div className="mt-2 space-y-2 rounded-2xl border border-border bg-background p-3 lg:hidden">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-base font-black text-foreground">{page.label}</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">{page.description}</div>
                                  </div>
                                  {!editingRole.isSystem && (
                                    <button
                                      onClick={() => setPageAll(page, (Number(enabled) + actionCount) !== getPageKeys(page).length)}
                                      className="h-8 shrink-0 rounded-xl border border-border px-3 text-xs font-black"
                                    >
                                      {(Number(enabled) + actionCount) === getPageKeys(page).length ? "全关" : "全开"}
                                    </button>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={editingRole.isSystem}
                                  onClick={() => togglePageAccess(page)}
                                  className={cn("flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left", enabled ? "border-primary/25 bg-primary/6" : "border-border", editingRole.isSystem && "cursor-not-allowed opacity-75")}
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-black text-foreground">允许访问此页面</div>
                                    <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{page.accessKey}</div>
                                  </div>
                                  <SwitchMark checked={enabled} />
                                </button>

                                {page.actions.length > 0 ? (
                                  page.actions.map((action) => {
                                    const checked = !!editingRole.permissions?.[action.key];
                                    return (
                                      <button
                                        key={action.key}
                                        type="button"
                                        disabled={editingRole.isSystem || !enabled}
                                        onClick={() => toggleAction(page, action.key)}
                                        className={cn("flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left", checked ? "border-primary/25 bg-primary/6" : "border-border", (!enabled || editingRole.isSystem) && "cursor-not-allowed opacity-55")}
                                      >
                                        <div className="min-w-0">
                                          <div className="text-sm font-black text-foreground">{action.label}</div>
                                          <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{action.key}</div>
                                        </div>
                                        <SwitchMark checked={checked} />
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                                    这个页面目前只有访问权限。
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="hidden min-h-0 p-4 pb-24 lg:block lg:overflow-y-auto lg:custom-scrollbar sm:p-6">
                    <div className="rounded-2xl border border-border bg-white/70 p-4 dark:bg-white/5 sm:rounded-[22px] sm:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-black tracking-tight text-foreground sm:text-2xl">{activePage.label}</div>
                          <p className="mt-2 hidden text-sm leading-6 text-muted-foreground sm:block">{activePage.description}</p>
                        </div>
                        {!editingRole.isSystem && (
                          <button
                            onClick={() => setPageAll(activePage, activePageSelected !== activePageTotal)}
                            className="h-9 shrink-0 rounded-xl border border-border bg-background px-3 text-xs font-black transition hover:bg-muted sm:h-10 sm:rounded-2xl sm:px-4 sm:text-sm"
                          >
                            {activePageSelected === activePageTotal ? "全部关闭" : "全部开启"}
                          </button>
                        )}
                      </div>

                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted sm:mt-5 sm:h-2">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(activePageSelected / activePageTotal) * 100}%` }} />
                      </div>
                    </div>

                    <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
                      <button
                        type="button"
                        disabled={editingRole.isSystem}
                        onClick={() => togglePageAccess(activePage)}
                        className={cn("flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition sm:rounded-[22px] sm:p-5", activePageEnabled ? "border-primary/25 bg-primary/6" : "border-border bg-background hover:bg-muted/40", editingRole.isSystem && "cursor-not-allowed opacity-75")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-black text-foreground sm:text-base">允许访问此页面</div>
                          <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{activePage.accessKey}</div>
                        </div>
                        <SwitchMark checked={activePageEnabled} />
                      </button>

                      {activePage.actions.length > 0 ? (
                        activePage.actions.map((action) => {
                          const checked = !!editingRole.permissions?.[action.key];
                          return (
                            <button
                              key={action.key}
                              type="button"
                              disabled={editingRole.isSystem || !activePageEnabled}
                              onClick={() => toggleAction(activePage, action.key)}
                              className={cn(
                                "flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition sm:rounded-[22px] sm:p-5",
                                checked ? "border-primary/25 bg-primary/6" : "border-border bg-background hover:bg-muted/40",
                                (!activePageEnabled || editingRole.isSystem) && "cursor-not-allowed opacity-55"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-black text-foreground">{action.label}</div>
                                <div className="mt-1 break-all font-mono text-xs text-muted-foreground">{action.key}</div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {checked && <Check size={14} className="text-primary" />}
                                <SwitchMark checked={checked} />
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground sm:rounded-[22px] sm:p-8">
                          这个页面目前只有访问权限，没有额外细分操作。
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border bg-background px-5 py-4 sm:px-6">
                  <div className="hidden items-center gap-3 rounded-2xl border border-border bg-white/40 px-4 py-2 dark:bg-white/5 sm:flex">
                    <BadgeCheck size={14} className="text-primary" />
                    <span className="text-xs font-bold text-muted-foreground">{activeStats.enabledPages} 个页面，{activeStats.enabledActions} 项操作已启用</span>
                  </div>
                  <div className="ml-auto flex w-full items-center gap-3 sm:w-auto">
                    <button onClick={() => setEditingRole(null)} className="h-10 flex-1 rounded-xl px-5 text-sm font-black opacity-70 transition hover:bg-muted sm:flex-none">
                      {editingRole.isSystem ? "关闭" : "放弃"}
                    </button>
                    {!editingRole.isSystem && (
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-8 text-sm font-black text-background shadow-xl transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 sm:flex-none"
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} strokeWidth={3} />}
                        保存角色
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
