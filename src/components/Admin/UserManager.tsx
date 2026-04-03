"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Settings2, Loader2, User as UserIcon, Mail, Plus, Trash2, AlertCircle, NotebookPen } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { createPortal } from "react-dom";
import { useUser } from "@/hooks/useUser";
import { hasAdminAccess, SessionUser } from "@/lib/permissions";



interface RoleProfile {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  isSystem: boolean;
}

interface WhitelistEntry {
  id: string;
  email: string;
  remark?: string | null;
  roleProfileId: string | null;
  roleProfile?: RoleProfile;
  invitationToken?: string | null;
  invitationExpiresAt?: string | null;
  user?: {
    id: string;
    name: string;
    role: string;
    status: string;
    roleProfileId: string | null;
    roleProfile?: RoleProfile;
  };
}

function RemarkModal({
  email,
  initialRemark,
  onClose,
  onSave,
  isSaving,
}: {
  email: string;
  initialRemark?: string | null;
  onClose: () => void;
  onSave: (remark: string) => void;
  isSaving: boolean;
}) {
  const [remark, setRemark] = useState(initialRemark || "");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-300">
      <div className="w-full max-w-lg overflow-hidden rounded-[28px] sm:rounded-3xl border border-border bg-background shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 relative">
        <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-border bg-background/95 backdrop-blur">
          <h3 className="text-lg sm:text-xl font-black text-foreground">成员备注</h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-all">{email}</p>
        </div>

        <div className="p-4 sm:p-6">
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="写点方便识别的备注，比如客户昵称、团队名或来源渠道"
            rows={4}
            maxLength={60}
            className="w-full rounded-2xl border border-border bg-white dark:bg-white/5 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 resize-none"
          />
          <div className="mt-2 text-right text-[11px] text-muted-foreground">{remark.length}/60</div>
        </div>

        <div className="p-4 sm:p-6 border-t border-border flex justify-end gap-3 bg-muted/5">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm font-bold"
          >
            取消
          </button>
          <button
            disabled={isSaving}
            onClick={() => onSave(remark)}
            className="px-6 sm:px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : "保存备注"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RoleAssignmentModal({ 
  roles, 
  currentRoleId, 
  onClose, 
  onSave, 
  isSaving 
}: {
    roles: RoleProfile[];
    currentRoleId: string | null;
    onClose: () => void;
    onSave: (roleId: string) => void;
    isSaving: boolean;
}) {
    const [selectedId, setSelectedId] = useState(currentRoleId || "");

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-lg overflow-hidden rounded-[28px] sm:rounded-3xl border border-border bg-background shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 relative max-h-safe-modal">
                <div className="px-5 sm:px-8 py-5 sm:py-6 border-b border-border bg-background/95 backdrop-blur">
                    <h3 className="text-lg sm:text-xl font-black text-foreground">设置成员角色</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">请选择一个角色以更新该成员的访问权限集</p>
                </div>

                <div className="p-4 sm:p-6 space-y-3 overflow-y-auto custom-scrollbar">
                    {roles.length > 0 ? roles.map(role => (
                        <button
                            key={role.id}
                            type="button"
                            onClick={() => setSelectedId(role.id)}
                            className={`w-full p-4 rounded-2xl border transition-all text-left flex items-start justify-between gap-3 ${
                                selectedId === role.id 
                                ? "bg-primary/5 border-primary ring-1 ring-primary/20" 
                                : "bg-background border-border hover:border-primary/40"
                            }`}
                        >
                            <div className="min-w-0">
                                <div className="font-black text-sm text-foreground flex items-center gap-2 flex-wrap">
                                    {role.name}
                                    {role.isSystem && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full font-bold">系统</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{role.description || "无描述"}</p>
                            </div>
                            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedId === role.id ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                                {selectedId === role.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                        </button>
                    )) : (
                        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
                            <p className="text-sm font-bold text-muted-foreground">当前没有可分配的角色</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">请先到角色管理中创建或启用角色模板。</p>
                        </div>
                    )}
                </div>

                <div className="p-4 sm:p-6 border-t border-border flex justify-end gap-3 bg-muted/5">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm font-bold">取消</button>
                    <button 
                        disabled={isSaving || !selectedId}
                        onClick={() => onSave(selectedId)}
                        className="px-6 sm:px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : "确认角色设置"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export function UserManager() {
  const { showToast } = useToast();
  const { user } = useUser();
  const sessionUser = user as SessionUser | null;
  const canManageMembers = hasAdminAccess(sessionUser, "members:manage");
  const canManageMemberStatus = hasAdminAccess(sessionUser, "members:status");
  const canManageWhitelist = hasAdminAccess(sessionUser, "whitelist:manage");
  const canViewEntries = canManageWhitelist || canManageMembers || canManageMemberStatus;
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Invite State
  const [newEmail, setNewEmail] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [newRemark, setNewRemark] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null);

  // Role Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [currentRoleId, setCurrentRoleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRemarkEntry, setEditingRemarkEntry] = useState<WhitelistEntry | null>(null);
  const [isSavingRemark, setIsSavingRemark] = useState(false);

  const fetchData = useCallback(async () => {
    if (!canViewEntries) {
      setEntries([]);
      setRoles([]);
      setIsLoading(false);
      return;
    }

    try {
      const requests: Promise<Response>[] = [fetch("/api/admin/whitelist")];
      if (canManageMembers || canManageWhitelist) {
        requests.push(fetch("/api/admin/roles"));
      }

      const [entriesRes, rolesRes] = await Promise.all(requests);
      
      if (entriesRes.ok) setEntries(await entriesRes.json());
      else setEntries([]);

      if (rolesRes?.ok) {
        setRoles(await rolesRes.json());
      } else if (!canManageMembers && !canManageWhitelist) {
        setRoles([]);
      }
      
    } catch {
      showToast("数据加载失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [canManageMembers, canManageWhitelist, canViewEntries, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Set default role "基础访客" once roles are loaded
  useEffect(() => {
    if (roles.length > 0 && !targetRoleId) {
      const guestRole = roles.find(r => r.name === "基础访客");
      if (guestRole) {
        setTargetRoleId(guestRole.id);
      }
    }
  }, [roles, targetRoleId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWhitelist) {
        showToast("当前账号不能发起邀请", "error");
        return;
    }
    if (!newEmail || !targetRoleId) {
        showToast("请填写完整信息", "error");
        return;
    }

    setIsInviting(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: newEmail, 
          roleProfileId: targetRoleId,
          remark: newRemark,
        }),
      });

      if (res.ok) {
        showToast("邀请已发送", "success");
        setNewEmail("");
        setNewRemark("");
        const guestRole = roles.find(r => r.name === "基础访客");
        setTargetRoleId(guestRole ? guestRole.id : "");
        fetchData();
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

  const handleStatusToggle = async (email: string, currentStatus: string) => {
    if (!canManageMemberStatus) {
        showToast("当前账号不能修改成员状态", "error");
        return;
    }
    const newStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
        const res = await fetch("/api/admin/users/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, status: newStatus }),
        });
        
        if (res.ok) {
            showToast(`账号已${newStatus === "ACTIVE" ? "启用" : "禁用"}`, "success");
            fetchData();
        } else {
            showToast("状态更新失败", "error");
        }
    } catch {
        showToast("网络请求失败", "error");
    }
  };

  const handleRoleSave = async (roleId: string) => {
    if (!editingUserId || !canManageMembers) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleProfileId: roleId }),
      });

      if (res.ok) {
        showToast("角色已更新", "success");
        setEditingUserId(null);
        fetchData();
      } else {
        showToast("更新失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemarkSave = async (remark: string) => {
    if (!editingRemarkEntry || !canManageWhitelist) return;
    setIsSavingRemark(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editingRemarkEntry.email,
          remark,
        }),
      });

      if (res.ok) {
        showToast("备注已更新", "success");
        setEditingRemarkEntry(null);
        fetchData();
      } else {
        showToast("备注更新失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setIsSavingRemark(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManageWhitelist && (
        <div className="glass-panel p-5 md:p-6 rounded-3xl border border-border">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
            <Mail className="text-primary" size={18} />
            邀请新成员
          </h3>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2 flex-1">
              <div className="flex-1 relative">
                <input
                  type="email"
                  placeholder="输入受邀者邮箱..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full h-10 px-4 rounded-xl bg-white dark:bg-white/5 border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>

              <div className="w-[110px] sm:w-48 shrink-0">
                <CustomSelect 
                  value={targetRoleId}
                  onChange={setTargetRoleId}
                  options={roles.map(r => ({ value: r.id, label: r.name }))}
                  placeholder="角色..."
                  triggerClassName="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="备注一下这个成员，方便后续识别"
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  maxLength={60}
                  className="w-full h-10 px-4 rounded-xl bg-white dark:bg-white/5 border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                />
              </div>

              <div className="w-full sm:w-auto shrink-0">
                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full h-10 px-8 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isInviting ? <Loader2 className="animate-spin" size={14} /> : <Plus size={16} />}
                  发送邀请
                </button>
              </div>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5 px-1">
            <AlertCircle size={14} />
            只有受邀并分配角色的邮箱可完成注册。您可以在“角色管理”页签中自定义更多的角色模板。
          </p>
        </div>
      )}

      {!canManageWhitelist && (
        <div className="rounded-2xl border border-dashed border-border bg-white/40 dark:bg-white/5 p-4">
          <p className="text-sm font-semibold text-foreground">邀请与白名单能力已收起</p>
          <p className="mt-1 text-xs text-muted-foreground">当前账号可以查看成员信息，但不能新增邀请或撤销准入。</p>
        </div>
      )}

      {/* Members Table - Desktop */}
      <div className="rounded-3xl border border-border bg-white dark:bg-gray-900/40 overflow-hidden shadow-sm flex-1">
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-5 py-3 text-xs font-bold text-foreground">成员信息</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground text-center">系统角色</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground text-center">状态</th>
                <th className="px-5 py-3 text-xs font-bold text-foreground text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="py-20 text-center text-muted-foreground">
                    <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
                    正在整理成员目录...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={4} className="py-20 text-center text-muted-foreground">暂无成员数据</td></tr>
              ) : (
                entries.map((entry) => {
                  const isRegistered = !!entry.user;
                  const roleName = isRegistered ? entry.user?.roleProfile?.name : entry.roleProfile?.name;
                  
                  return (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isRegistered ? 'bg-primary/10 text-primary' : 'bg-muted/30 border border-dashed border-muted-foreground/30 text-muted-foreground'}`}>
                             {isRegistered ? <UserIcon size={16} /> : <Mail size={14} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold truncate">{isRegistered ? entry.user?.name : "待邀请成员"}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">{entry.email}</span>
                            {entry.remark ? (
                              <span className="mt-1 inline-flex max-w-fit items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                {entry.remark}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary/5 text-primary border border-primary/10 whitespace-nowrap">
                            <Shield size={10} />
                            {roleName || "未分配"}
                          </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                         {isRegistered ? (
                             <div className="flex justify-center shrink-0">
                                 <Switch
                                     checked={entry.user?.status === 'ACTIVE'}
                                     onChange={() => handleStatusToggle(entry.email, entry.user?.status || 'ACTIVE')}
                                     disabled={!canManageMemberStatus}
                                 />
                             </div>
                         ) : (
                             <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg">等待加入</span>
                         )}
                      </td>
                       <td className="px-6 py-5 text-center">
                         <div className="flex justify-center gap-2">
                            <div className="flex items-center gap-1">
                               {isRegistered && canManageMembers ? (
                                 <button
                                   onClick={() => {
                                     setEditingUserId(entry.user!.id);
                                     setCurrentRoleId(entry.user!.roleProfileId);
                                   }}
                                   className="p-2.5 rounded-xl text-muted-foreground hover:bg-primary/5 hover:text-primary transition-all"
                                   title="角色分配"
                                 >
                                   <Settings2 size={18} />
                                 </button>
                               ) : null}
                               {canManageWhitelist && (
                                 <button
                                   onClick={() => setEditingRemarkEntry(entry)}
                                   className="p-2.5 rounded-xl text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 transition-all"
                                   title="编辑备注"
                                 >
                                   <NotebookPen size={18} />
                                 </button>
                               )}
                               {canManageWhitelist && (
                                 <button
                                    onClick={() => setDeleteEmail(entry.email)}
                                    className="p-2.5 rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all"
                                    title={isRegistered ? "移除成员" : "撤销邀请"}
                                 >
                                    <Trash2 size={18} />
                                 </button>
                               )}
                            </div>
                         </div>
                       </td>
                     </tr>
                   );
                 })
               )}
             </tbody>
           </table>
         </div>

        {/* Members Cards - Mobile */}
        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
              <p>正在整理成员目录...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">暂无成员数据</div>
          ) : (
            entries.map((entry) => {
              const isRegistered = !!entry.user;
              const roleName = isRegistered ? entry.user?.roleProfile?.name : entry.roleProfile?.name;
              
              return (
                <div key={entry.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                  {/* 成员信息 */}
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isRegistered ? 'bg-primary/10 text-primary' : 'bg-muted/30 border border-dashed border-muted-foreground/30 text-muted-foreground'}`}>
                      {isRegistered ? <UserIcon size={18} /> : <Mail size={16} />}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-bold truncate">{isRegistered ? entry.user?.name : "待邀请成员"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono truncate">{entry.email}</span>
                      {entry.remark ? (
                        <span className="mt-1 inline-flex max-w-fit items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          {entry.remark}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  
                  {/* 角色与状态 */}
                  <div className="flex items-center justify-between pl-[52px]">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary/5 text-primary border border-primary/10 whitespace-nowrap">
                      <Shield size={10} />
                      {roleName || "未分配"}
                    </span>
                    {isRegistered ? (
                      <Switch
                        checked={entry.user?.status === 'ACTIVE'}
                        onChange={() => handleStatusToggle(entry.email, entry.user?.status || 'ACTIVE')}
                        disabled={!canManageMemberStatus}
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg">等待加入</span>
                    )}
                  </div>
                  
                  {/* 操作按钮 */}
                  <div className="flex items-center justify-end gap-2 pl-[52px]">
                    {canManageWhitelist && (
                      <button
                        onClick={() => setEditingRemarkEntry(entry)}
                        className="flex-1 h-9 rounded-xl bg-amber-500/5 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all hover:bg-amber-500/10 flex items-center justify-center gap-2"
                      >
                        <NotebookPen size={14} />
                        备注
                      </button>
                    )}
                    {isRegistered && canManageMembers && (
                      <button
                        onClick={() => {
                          setEditingUserId(entry.user!.id);
                          setCurrentRoleId(entry.user!.roleProfileId);
                        }}
                        className="flex-1 h-9 rounded-xl bg-primary/5 text-primary text-xs font-bold transition-all hover:bg-primary/10 flex items-center justify-center gap-2"
                      >
                        <Settings2 size={14} />
                        角色分配
                      </button>
                    )}
                    {canManageWhitelist && (
                      <button
                        onClick={() => setDeleteEmail(entry.email)}
                        className="flex-1 h-9 rounded-xl bg-red-500/5 text-red-500 text-xs font-bold transition-all hover:bg-red-500/10 flex items-center justify-center gap-2"
                      >
                        <Trash2 size={14} />
                        {isRegistered ? "移除成员" : "撤销邀请"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
 
       {/* Role Assignment Modal */}
       {editingUserId && canManageMembers && (
         <RoleAssignmentModal 
             roles={roles}
             currentRoleId={currentRoleId}
             onClose={() => setEditingUserId(null)}
             onSave={handleRoleSave}
             isSaving={isSaving}
         />
       )}

       {editingRemarkEntry && canManageWhitelist && (
         <RemarkModal
           email={editingRemarkEntry.email}
           initialRemark={editingRemarkEntry.remark}
           onClose={() => setEditingRemarkEntry(null)}
           onSave={handleRemarkSave}
           isSaving={isSavingRemark}
         />
       )}
 
       {canManageWhitelist && (
         <ConfirmModal
           isOpen={!!deleteEmail}
           onClose={() => setDeleteEmail(null)}
           onConfirm={async () => {
               if (!deleteEmail) return;
               const res = await fetch(`/api/admin/whitelist?email=${deleteEmail}`, { method: "DELETE" });
               if (res.ok) {
                   showToast("已成功移除", "success");
                   fetchData();
               } else {
                   showToast("操作失败", "error");
               }
               setDeleteEmail(null);
           }}
           title={(() => {
               const entry = entries.find(e => e.email === deleteEmail);
               return entry?.user ? "移除成员" : "撤销邀请";
           })()}
           message={(() => {
               const entry = entries.find(e => e.email === deleteEmail);
               return entry?.user 
                  ? `确定要移除成员 ${entry.user.name || deleteEmail} 吗？移除后该账号将无法登录且所有权限将被收回。`
                  : `确定要撤销对 ${deleteEmail} 的入驻邀请吗？`;
           })()}
           variant="danger"
         />
       )}
    </div>
  );
}
