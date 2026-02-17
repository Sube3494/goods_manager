"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Settings2, Loader2, Save, User as UserIcon, Mail, Plus, Trash2, AlertCircle, CheckCircle, X, LayoutGrid } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { PERMISSION_TREE } from "@/lib/permissions";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface Workspace {
  id: string;
  name: string;
  owner: {
    email: string;
    name: string | null;
  };
}

interface WhitelistEntry {
  id: string;
  email: string;
  role: string;
  user?: {
    id: string;
    name: string;
    role: string;
    status: string;
    permissions: Record<string, unknown>;
    workspaceId: string;
  };
}

const ROLE_NAMES: Record<string, string> = {
  USER: "普通用户",
  SUPER_ADMIN: "超级管理员"
};

import { createPortal } from "react-dom";

function PermissionEditor({ permissions, onChange, onGroupToggle, onClose, onSave, isSaving }: {
    permissions: Record<string, boolean>;
    onChange: (key: string, val: boolean) => void;
    onGroupToggle: (keys: { key: string }[], val: boolean) => void;
    onClose: () => void;
    onSave: () => void;
    isSaving: boolean;
}) {
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
        // Default only the first group to be expanded
        const initial: Record<string, boolean> = {};
        if (PERMISSION_TREE.length > 0) {
            initial[PERMISSION_TREE[0].key] = true;
        }
        return initial;
    });

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // Prevent scrolling on body when modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#090b11] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-border relative">
                
                {/* Header */}
                <div className="relative flex items-center justify-between px-8 py-6 border-b border-border bg-white dark:bg-card/20">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight text-foreground">权限配置中心</h3>
                        <p className="text-sm text-muted-foreground mt-1 text-pretty">按页面功能组管理用户的详细权限</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground border border-border/10"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Single Column Accordion List */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 no-scrollbar select-none bg-muted/10 dark:bg-transparent">
                    {PERMISSION_TREE.map(group => {
                        const isExpanded = !!expandedGroups[group.key];
                        const activeCount = group.children.filter(c => !!permissions[c.key]).length;
                        const isAllChecked = group.children.every(c => !!permissions[c.key]);

                        return (
                            <div key={group.key} className="rounded-2xl border border-border bg-white dark:bg-white/3 shadow-sm overflow-hidden transition-all">
                                {/* Accordion Header */}
                                <div className="flex items-center gap-2 p-1 pr-6 border-b border-transparent data-[expanded=true]:border-border/50 transition-colors" data-expanded={isExpanded}>
                                    <button 
                                        onClick={() => toggleGroup(group.key)}
                                        className="flex-1 flex items-center gap-4 px-5 py-4 text-left group/header"
                                    >
                                        <div className={clsx(
                                            "w-6 h-6 rounded-lg flex items-center justify-center transition-all",
                                            isExpanded ? "bg-primary text-primary-foreground rotate-90" : "bg-muted text-muted-foreground"
                                        )}>
                                            <Shield size={14} />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-[17px] font-bold tracking-tight text-foreground block">{group.label}</span>
                                            {activeCount > 0 && (
                                                <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mt-1.5 inline-block border border-primary/20">
                                                    已生效 {activeCount} 项权限
                                                </span>
                                            )}
                                        </div>
                                    </button>

                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => onGroupToggle(group.children, !isAllChecked)}
                                            className={clsx(
                                                "text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all border",
                                                isAllChecked 
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                                                : "bg-muted hover:bg-muted/80 text-foreground border-transparent"
                                            )}
                                        >
                                            {isAllChecked ? "取消全选" : "快速全选"}
                                        </button>
                                        <button 
                                            onClick={() => toggleGroup(group.key)}
                                            className={clsx(
                                                "p-1.5 rounded-full transition-transform text-muted-foreground hover:text-foreground hover:bg-muted/50",
                                                isExpanded ? "rotate-180" : ""
                                            )}
                                        >
                                            <Settings2 size={16} className="opacity-40" />
                                        </button>
                                    </div>
                                </div>

                                {/* Accordion Content */}
                                <motion.div
                                    initial={false}
                                    animate={{ height: isExpanded ? "auto" : 0 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className="overflow-hidden bg-muted/20 dark:bg-black/10"
                                >
                                    <div className="px-6 pb-6 pt-5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            {group.children.map(perm => {
                                                const isChecked = !!permissions[perm.key];
                                                return (
                                                    <motion.div
                                                        key={perm.key}
                                                        layout
                                                        onClick={() => onChange(perm.key, !isChecked)}
                                                        className={clsx(
                                                            "relative p-4 rounded-xl border transition-all cursor-pointer group/card flex items-center gap-3 overflow-hidden",
                                                            isChecked 
                                                            ? "bg-white dark:bg-primary/5 border-primary shadow-sm" 
                                                            : "bg-white/80 dark:bg-muted/10 border-border/60 hover:border-primary/30 hover:bg-white dark:hover:bg-muted/20"
                                                        )}
                                                        whileTap={{ scale: 0.98 }}
                                                    >
                                                        <div className={clsx(
                                                            "w-4 h-4 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                                                            isChecked 
                                                            ? "bg-primary border-primary text-primary-foreground" 
                                                            : "bg-transparent border-muted-foreground/30 group-hover/card:border-primary/40"
                                                        )}>
                                                            <CheckCircle size={8} strokeWidth={4} className={isChecked ? "scale-100" : "scale-0 transition-transform"} />
                                                        </div>
                                                        <span className={clsx(
                                                            "text-sm font-bold tracking-tight",
                                                            isChecked ? "text-primary" : "text-foreground/80"
                                                        )}>
                                                            {perm.label}
                                                        </span>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-white dark:bg-card/30 flex justify-end gap-3 items-center">
                     <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium rounded-xl hover:bg-muted transition-colors text-muted-foreground"
                    >
                        取消配置
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-8 py-2.5 text-sm font-black rounded-xl bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:opacity-95 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        应用并保存
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export function UserManager() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Invite State
  const [newEmail, setNewEmail] = useState("");
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isInviting, setIsInviting] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null);

  // Permission Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    role: "",
    permissions: {} as Record<string, boolean>
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whitelist");
      if (res.ok) {
        const data = await res.json();
        setEntries(data);
      }
    } catch {
      showToast("获取成员列表失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch {
      console.error("Failed to fetch workspaces");
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchWorkspaces();
  }, [fetchEntries, fetchWorkspaces]);

  // --- Invite Logic ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setIsInviting(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: newEmail, 
          role: "USER",
          targetWorkspaceId: targetWorkspaceId || null
        }),
      });

      if (res.ok) {
        showToast("已发送邀请", "success");
        setNewEmail("");
        setTargetWorkspaceId("");
        fetchEntries();
      } else {
        const err = await res.json();
        showToast(err.error || "邀请失败", "error");
      }
    } catch {
      showToast("网络请求失败", "error");
    } finally {
      setIsInviting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteEmail) return;
    try {
      const res = await fetch(`/api/admin/whitelist?email=${deleteEmail}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("已撤销邀请", "success");
        fetchEntries();
      } else {
        showToast("撤销失败", "error");
      }
    } catch {
      showToast("网络请求失败", "error");
    } finally {
      setDeleteEmail(null);
    }
  };

  // --- Status Logic ---
  const handleStatusToggle = async (email: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
        const res = await fetch("/api/admin/users/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, status: newStatus }),
        });
        
        if (res.ok) {
            showToast(`账号已${newStatus === "ACTIVE" ? "启用" : "禁用"}`, "success");
            fetchEntries();
        } else {
            showToast("状态更新失败", "error");
        }
    } catch {
        showToast("网络请求失败", "error");
    }
  };

  // --- Permission Edit Logic ---
  interface UserLike {
      id: string;
      role: string;
      permissions: Record<string, unknown>;
  }

  const startEdit = (user: UserLike) => {
    setEditingId(user.id);
    setEditForm({
      role: user.role,
      permissions: (user.permissions as Record<string, boolean>) || {}
    });
  };

  const handlePermissionChange = (permId: string, checked: boolean) => {
    setEditForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permId]: checked
      }
    }));
  };

  const handleGroupToggle = (children: { key: string }[], checked: boolean) => {
    const newPermissions = { ...editForm.permissions };
    children.forEach(child => {
      newPermissions[child.key] = checked;
    });
    setEditForm(prev => ({ ...prev, permissions: newPermissions }));
  };



  const handleSave = async (userId: string | null) => {
    if (!userId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editForm.role,
          permissions: editForm.permissions
        }),
      });

      if (res.ok) {
        showToast("权限已更新", "success");
        setEditingId(null);
        fetchEntries();
      } else {
        showToast("更新失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* Invite Section */}
      <div className="glass-panel p-6 rounded-2xl border border-border">
        <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
          <Mail className="text-primary" size={20} />
          邀请新成员
        </h3>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="email"
                placeholder="输入受邀者邮箱..."
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="w-full h-11 px-4 rounded-full bg-muted/50 border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
              />
            </div>
            
            <div className="w-full sm:w-64">
              <CustomSelect 
                value={targetWorkspaceId}
                onChange={setTargetWorkspaceId}
                options={[
                  { value: "", label: "独立工作区 (新建)" },
                  ...workspaces.map(w => ({
                    value: w.id,
                    label: `加入: ${w.name} (${w.owner.email})`
                  }))
                ]}
                placeholder="选择目标工作区"
                triggerClassName="w-full h-11 rounded-full bg-muted/50 border border-border px-4 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isInviting}
              className="h-11 px-8 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {isInviting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
              发送邀请
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <AlertCircle size={12} />
          只有白名单内的邮箱可以注册并自动获得对应的工作区。
        </p>
      </div>

      {/* Members Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-gray-900/40 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-3 md:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">成员信息</th>
                <th className="px-3 md:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-center">当前角色</th>
                <th className="px-3 md:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-center">账号状态</th>
                <th className="px-3 md:px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-center">管理操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-3 md:px-6 py-12 text-center text-muted-foreground">
                    <Loader2 className="animate-spin mx-auto mb-2" />
                    加载成员列表...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 md:px-6 py-12 text-center text-muted-foreground">
                    暂无成员数据
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const isRegistered = !!entry.user;
                  const user = entry.user;
                  
                  return (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-left">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground shrink-0 ${isRegistered ? 'bg-secondary/50' : 'bg-muted/50 border border-dashed border-muted-foreground/30'}`}>
                             {isRegistered ? <UserIcon size={18} /> : <Mail size={16} />}
                          </div>
                          <div className="flex flex-col">
                            <span className={`text-sm font-bold ${isRegistered ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {isRegistered ? user?.name : "待注册邀请"}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">{entry.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                            <Shield size={10} />
                            {ROLE_NAMES[entry.role] || entry.role}
                          </span>
                      </td>
                      <td className="px-3 md:px-6 py-4 text-center whitespace-nowrap">
                         {isRegistered ? (
                             <div className="flex justify-center">
                                 <Switch
                                     checked={(user?.status || 'ACTIVE') === 'ACTIVE'}
                                     onChange={() => handleStatusToggle(entry.email, user?.status || 'ACTIVE')}
                                 />
                             </div>
                         ) : (
                             <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                 等待注册
                             </span>
                         )}
                      </td>
                      <td className="px-3 md:px-6 py-4 text-center whitespace-nowrap">
                        {isRegistered && user ? (
                          editingId === user.id ? (
                            <div className="flex justify-center gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="h-8 px-3 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 transition-all"
                              >
                                取消
                              </button>
                              <button
                                onClick={() => handleSave(user.id)}
                                disabled={isSaving}
                                className="h-8 px-3 rounded-lg text-xs font-bold bg-primary text-primary-foreground flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 transition-all"
                              >
                                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                保存
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(user)}
                              className="p-2 rounded-lg text-muted-foreground hover:bg-primary/5 hover:text-primary transition-all"
                              title="配置权限"
                            >
                              <Settings2 size={18} />
                            </button>
                          )
                        ) : (
                           <button
                                onClick={() => setDeleteEmail(entry.email)}
                                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                                title="撤销邀请"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Permissions Editor Modal Overlay */}
      {editingId && (
        <PermissionEditor 
            permissions={editForm.permissions} 
            onChange={(key, val) => handlePermissionChange(key, val)}
            onGroupToggle={(keys, val) => handleGroupToggle(keys, val)}
            onClose={() => setEditingId(null)}
            onSave={() => handleSave(editingId)}
            isSaving={isSaving}
        />
      )}

      <ConfirmModal
        isOpen={!!deleteEmail}
        onClose={() => setDeleteEmail(null)}
        onConfirm={confirmDelete}
        title="撤销邀请"
        message={`确定要撤销对 ${deleteEmail} 的入驻邀请吗？`}
        confirmLabel="撤销"
        cancelLabel="保留"
        variant="danger"
      />
    </div>
  );
}
