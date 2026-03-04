"use client";

import { useState, useEffect, useCallback } from "react";
import { Shield, Settings2, Loader2, User as UserIcon, Mail, Plus, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { createPortal } from "react-dom";



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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="glass-panel rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-border relative">
                <div className="px-8 py-6 border-b border-border">
                    <h3 className="text-xl font-bold">设置成员角色</h3>
                    <p className="text-sm text-muted-foreground mt-1">请选择一个角色以更新该成员的访问权限集</p>
                </div>

                <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {roles.map(role => (
                        <div 
                            key={role.id}
                            onClick={() => setSelectedId(role.id)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                                selectedId === role.id 
                                ? "bg-primary/5 border-primary ring-1 ring-primary/20" 
                                : "bg-white/50 dark:bg-white/5 border-border hover:border-primary/50"
                            }`}
                        >
                            <div>
                                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                                    {role.name}
                                    {role.isSystem && <span className="text-[10px] bg-muted px-1 rounded">系统</span>}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{role.description || "无描述"}</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedId === role.id ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                                {selectedId === role.id && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/5">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm">取消</button>
                    <button 
                        disabled={isSaving || !selectedId}
                        onClick={() => onSave(selectedId)}
                        className="px-8 py-2.5 rounded-xl bg-primary text-primary-foreground font-black shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
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
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Invite State
  const [newEmail, setNewEmail] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null);

  // Role Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [currentRoleId, setCurrentRoleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, rolesRes] = await Promise.all([
        fetch("/api/admin/whitelist"),
        fetch("/api/admin/roles")
      ]);
      
      if (entriesRes.ok) setEntries(await entriesRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
      
    } catch {
      showToast("数据加载失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

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
        }),
      });

      if (res.ok) {
        showToast("邀请已发送", "success");
        setNewEmail("");
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
    if (!editingUserId) return;
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

  return (
    <div className="space-y-6">
      {/* Invite Section */}
      <div className="glass-panel p-5 md:p-6 rounded-3xl border border-border">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-4">
          <Mail className="text-primary" size={18} />
          邀请新成员
        </h3>
        <form onSubmit={handleAdd} className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
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
        </form>
        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5 px-1">
          <AlertCircle size={14} />
          只有受邀并分配角色的邮箱可完成注册。您可以在“角色管理”页签中自定义更多的角色模板。
        </p>
      </div>

      {/* Members Table */}
      <div className="rounded-3xl border border-border bg-white dark:bg-gray-900/40 overflow-hidden shadow-sm flex-1">
        <div className="overflow-x-auto w-full">
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
                                 />
                             </div>
                         ) : (
                             <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg">等待加入</span>
                         )}
                      </td>
                       <td className="px-6 py-5 text-center">
                         <div className="flex justify-center gap-2">
                            <div className="flex items-center gap-1">
                               {isRegistered ? (
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
                               ) : (
                                 null
                               )}
                               <button
                                  onClick={() => setDeleteEmail(entry.email)}
                                  className="p-2.5 rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all"
                                  title={isRegistered ? "移除成员" : "撤销邀请"}
                               >
                                  <Trash2 size={18} />
                               </button>
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
       </div>
 
       {/* Role Assignment Modal */}
       {editingUserId && (
         <RoleAssignmentModal 
             roles={roles}
             currentRoleId={currentRoleId}
             onClose={() => setEditingUserId(null)}
             onSave={handleRoleSave}
             isSaving={isSaving}
         />
       )}
 
       <ConfirmModal
         isOpen={!!deleteEmail}
         onClose={() => setDeleteEmail(null)}
         onConfirm={async () => {
             if (!deleteEmail) return;
             // API 现在默认级联删除 User 记录
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
    </div>
  );
}
