"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Settings2, Loader2, Save, User as UserIcon, Mail, Plus, Trash2, AlertCircle, CheckCircle, X } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toast";
import { PERMISSION_TREE } from "@/lib/permissions";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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
    const [activeGroupKey, setActiveGroupKey] = useState(PERMISSION_TREE[0].key);
    const activeGroup = PERMISSION_TREE.find(g => g.key === activeGroupKey) || PERMISSION_TREE[0];
    const isAllChecked = activeGroup.children.every(c => permissions[c.key]);

    // Prevent scrolling on body when modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-background rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-border/50">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">权限配置中心</h3>
                        <p className="text-sm text-muted-foreground mt-1">为用户分配详细的功能访问权限</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border bg-muted/20 flex md:flex-col overflow-x-auto md:overflow-y-auto p-3 gap-1 shrink-0">
                        {PERMISSION_TREE.map(group => {
                            const activeCount = group.children.filter(c => !!permissions[c.key]).length;
                            const isActive = activeGroupKey === group.key;
                            
                            return (
                                <button
                                    key={group.key}
                                    onClick={() => setActiveGroupKey(group.key)}
                                    className={clsx(
                                        "relative px-3 py-2.5 mx-1 rounded-xl text-sm font-medium transition-all text-left flex items-center justify-between shrink-0 md:w-full outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                        isActive 
                                        ? "text-primary-foreground font-semibold" 
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {isActive && (
                                        <motion.div
                                            layoutId="activePermGroup"
                                            className="absolute inset-0 bg-primary rounded-xl"
                                            initial={false}
                                            transition={{ type: "spring", stiffness: 350, damping: 35 }}
                                        />
                                    )}
                                    <span className="relative z-10">{group.label}</span>
                                    {activeCount > 0 && (
                                        <span className={clsx(
                                            "relative z-10 min-w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 transition-colors",
                                            isActive 
                                            ? "bg-white/20 text-white" 
                                            : "bg-primary/5 text-primary"
                                        )}>
                                            {activeCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-background relative">
                        {/* Sticky Section Header */}
                        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md px-8 pt-8 pb-6 border-b border-border/40">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h5 className="text-xl font-bold text-foreground tracking-tight">
                                            {activeGroup.label}
                                        </h5>
                                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                                            {activeGroup.children.length} 项权限
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-1.5 opacity-80">
                                        配置该模块下的具体操作权限
                                    </p>
                                </div>
                                <button
                                    onClick={() => onGroupToggle(activeGroup.children, !isAllChecked)}
                                    className={clsx(
                                        "text-xs font-bold px-4 py-2 rounded-xl transition-all border",
                                        isAllChecked 
                                        ? "bg-primary text-primary-foreground border-primary shadow-sm hover:opacity-90 active:scale-95" 
                                        : "bg-muted hover:bg-muted/80 text-foreground border-transparent active:scale-95"
                                    )}
                                >
                                    {isAllChecked ? "取消全选" : "本组全选"}
                                </button>
                            </div>
                        </div>

                        <div className="p-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-8">
                                {activeGroup.children.map(perm => {
                                    const isChecked = !!permissions[perm.key];
                                    return (
                                        <motion.div
                                            key={perm.key}
                                            layout
                                            initial={false}
                                            onClick={() => onChange(perm.key, !isChecked)}
                                            className={clsx(
                                                "relative p-5 rounded-2xl border-2 transition-all cursor-pointer group select-none flex items-center gap-4 overflow-hidden outline-none",
                                                isChecked 
                                                ? "bg-primary/3 border-primary shadow-xs" 
                                                : "bg-card border-border/40 hover:border-primary/20 hover:bg-muted/30"
                                            )}
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.985 }}
                                        >
                                            <div className={clsx(
                                                "w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all shrink-0",
                                                isChecked 
                                                ? "bg-primary border-primary text-primary-foreground shadow-sm" 
                                                : "bg-transparent border-muted-foreground/20 group-hover:border-primary/40"
                                            )}>
                                                <CheckCircle size={10} strokeWidth={3} className={isChecked ? "scale-100" : "scale-0 transition-transform"} />
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <span className={clsx(
                                                    "text-[15px] font-semibold block transition-colors tracking-tight",
                                                    isChecked ? "text-primary" : "text-foreground/90"
                                                )}>
                                                    {perm.label}
                                                </span>
                                            </div>

                                            {isChecked && (
                                                <motion.div 
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    className="absolute -right-1 -top-1 w-6 h-6 bg-primary/10 rounded-full blur-md"
                                                />
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Footer Actions */}
                <div className="p-4 border-t border-border bg-muted/5 flex justify-end gap-3">
                     <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                    >
                        取消
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isSaving}
                        className="px-6 py-2 text-sm font-bold rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all flex items-center gap-2"
                    >
                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        保存变更
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

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // --- Invite Logic ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setIsInviting(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, role: "USER" }),
      });

      if (res.ok) {
        showToast("已发送邀请", "success");
        setNewEmail("");
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
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            placeholder="输入受邀者邮箱..."
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="w-full sm:flex-1 h-10 px-4 rounded-full bg-muted/50 border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm shrink-0"
          />
          <button
            type="submit"
            disabled={isInviting}
            className="h-10 px-6 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 disabled:translate-y-0 flex items-center justify-center gap-2"
          >
            {isInviting ? <Loader2 className="animate-spin" size={16} /> : <Plus size={18} />}
            发送邀请
          </button>
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
