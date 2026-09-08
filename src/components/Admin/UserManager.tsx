"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import md5 from "blueimp-md5";
import { Shield, Settings2, Loader2, User as UserIcon, Mail, Plus, Trash2, AlertCircle, NotebookPen, Search, Check, UserCheck, Ban, MonitorSmartphone, Smartphone, FolderLock, ShoppingBag, X, Crown, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Switch } from "@/components/ui/Switch";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ActionBar } from "@/components/ui/ActionBar";
import { UserOrdersModal } from "@/components/Admin/UserOrdersModal";
import { createPortal } from "react-dom";
import { useUser } from "@/hooks/useUser";
import { hasAdminAccess, SessionUser } from "@/lib/permissions";
import { pinyinMatch } from "@/lib/pinyin";
import { formatLocalDateTime } from "@/lib/dateUtils";



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
    lastActiveAt?: string | null;
    deviceSessions?: Array<{
      id: string;
      deviceType: string;
      deviceLabel: string;
      browser?: string | null;
      os?: string | null;
      lastSeenAt: string;
    }>;
    roleProfileId: string | null;
    roleProfile?: RoleProfile;
    isInternal?: boolean;
    hasMaiyatianCookie?: boolean;
    maiyatianCookieCount?: number;
    accessibleLibraries?: Array<{ id: string; name: string }>;
  };
}

interface ProductLibraryOption {
  id: string;
  name: string;
}

function formatLastActiveAt(value?: string | null) {
  if (!value) return "暂无记录";
  return formatLocalDateTime(value);
}

function DeviceBadge({ deviceType, label }: { deviceType: string; label: string }) {
  const isMobile = deviceType === "mobile" || deviceType === "tablet";
  const Icon = isMobile ? Smartphone : MonitorSmartphone;

  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
      <Icon size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function DevicePresence({
  devices,
  compact = false,
}: {
  devices?: NonNullable<WhitelistEntry["user"]>["deviceSessions"];
  compact?: boolean;
}) {
  if (!devices?.length) {
    return <span className="text-xs text-muted-foreground">离线</span>;
  }

  if (compact && devices.length === 1) {
    const isMobile = devices[0].deviceType === "mobile" || devices[0].deviceType === "tablet";
    const Icon = isMobile ? Smartphone : MonitorSmartphone;
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        title={devices[0].deviceLabel}
      >
        <Icon size={14} />
      </span>
    );
  }

  if (!compact && devices.length === 1) {
    return <DeviceBadge deviceType={devices[0].deviceType} label={devices[0].deviceLabel} />;
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-emerald-500/8 px-2.5 py-1">
      <div className="flex items-center -space-x-1">
        {devices.slice(0, 3).map((device, index) => {
          const isMobile = device.deviceType === "mobile" || device.deviceType === "tablet";
          const Icon = isMobile ? Smartphone : MonitorSmartphone;
          return (
            <span
              key={device.id}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              style={{ zIndex: devices.length - index }}
              title={device.deviceLabel}
            >
              <Icon size={10} />
            </span>
          );
        })}
      </div>
      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
        {devices.length} 台在线
      </span>
    </div>
  );
}

function RoleBadge({
  isSuperAdmin,
  roleName,
}: {
  isSuperAdmin: boolean;
  roleName?: string | null;
}) {
  if (isSuperAdmin) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-orange-500/12 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-xs whitespace-nowrap">
        <Crown size={12} className="text-orange-500 dark:text-orange-400 shrink-0" />
        超级管理员
      </span>
    );
  }

  if (roleName) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 shadow-xs whitespace-nowrap">
        <Shield size={11} className="text-sky-600 dark:text-sky-400 shrink-0" />
        {roleName}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 whitespace-nowrap">
      <ShieldAlert size={10} className="shrink-0 text-amber-500/80" />
      未分配角色
    </span>
  );
}

function MemberAvatar({
  isRegistered,
  email,
  name,
  size = "md",
}: {
  isRegistered: boolean;
  email: string;
  name?: string | null;
  size?: "md" | "lg";
}) {
  const isLg = size === "lg";
  const avatarSize = isLg ? 40 : 36;
  const normalizedEmail = email.trim().toLowerCase();

  return (
    <div
      className={`relative overflow-hidden rounded-full flex items-center justify-center shrink-0 transition-all ${
        isLg ? "h-10 w-10" : "h-9 w-9"
      } ${
        isRegistered
          ? "bg-primary/10 text-primary shadow-2xs ring-1 ring-border/50 dark:ring-white/10"
          : "bg-muted/40 border border-dashed border-muted-foreground/30 text-muted-foreground"
      }`}
    >
      {isRegistered ? (
        <>
          <Image
            src={`https://cravatar.cn/avatar/${md5(normalizedEmail)}?d=mp&s=${avatarSize * 2}`}
            alt={`${name || email} 的头像`}
            fill
            sizes={`${avatarSize}px`}
            className="object-cover"
          />
          <UserIcon size={isLg ? 18 : 16} className="opacity-0" />
        </>
      ) : (
        <Mail size={isLg ? 16 : 14} />
      )}
    </div>
  );
}

function SelectionCircleButton({
  checked,
  onClick,
  disabled = false,
  title,
  className = "",
}: {
  checked: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={disabled ? undefined : onClick}
      className={`relative h-5 w-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
        disabled
          ? "cursor-not-allowed bg-zinc-100 dark:bg-zinc-800/80 border-zinc-300 dark:border-zinc-700 opacity-60 shadow-none"
          : checked
          ? "bg-foreground border-foreground text-background dark:text-black scale-110 shadow-lg shadow-black/10 cursor-pointer"
          : "bg-white dark:bg-white/5 border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-foreground/50 shadow-sm cursor-pointer"
      } ${className}`}
    >
      {checked ? <Check size={12} strokeWidth={4} /> : null}
    </button>
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="relative mb-10 w-full max-w-lg overflow-hidden rounded-[26px] sm:mb-0 sm:rounded-[32px] border border-border/80 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        <div className="relative px-6 py-5 border-b border-border/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-2xs shrink-0">
              <NotebookPen size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight">成员备注</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all hover:scale-105 active:scale-95 shrink-0"
          >
            <X size={17} />
          </button>
        </div>

        <div className="relative p-6">
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="写点方便识别的备注，比如客户昵称、团队名或来源渠道"
            rows={4}
            maxLength={60}
            className="w-full rounded-2xl border border-border/80 bg-zinc-50 dark:bg-white/[0.03] px-4 py-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/20 resize-none shadow-2xs"
          />
          <div className="mt-2 text-right text-[11px] text-muted-foreground font-mono">{remark.length}/60</div>
        </div>

        <div className="relative px-6 py-4 border-t border-border/60 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200/80 dark:hover:bg-white/10 text-foreground transition-all text-sm font-bold active:scale-95"
          >
            取消
          </button>
          <button
            disabled={isSaving}
            onClick={() => onSave(remark)}
            className="px-7 sm:px-8 py-2.5 rounded-full bg-primary text-primary-foreground font-black shadow-lg shadow-primary/25 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 text-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
            <div className="relative mb-10 w-full max-w-lg overflow-hidden rounded-[26px] sm:mb-0 sm:rounded-[32px] border border-border/80 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 max-h-[calc(100dvh-5rem)] sm:max-h-safe-modal">
                <div className="relative px-6 py-5 border-b border-border/60 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-2xs shrink-0">
                            <Shield size={18} />
                        </div>
                        <div>
                            <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight">设置成员角色</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">请选择一个角色以更新该成员的访问权限集</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all hover:scale-105 active:scale-95 shrink-0"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="relative p-6 space-y-3 overflow-y-auto custom-scrollbar">
                    {roles.length > 0 ? roles.map(role => {
                        const isSelected = selectedId === role.id;
                        return (
                            <button
                                key={role.id}
                                type="button"
                                onClick={() => setSelectedId(role.id)}
                                className={`w-full p-4 rounded-2xl border transition-all text-left flex items-start justify-between gap-3 group ${
                                    isSelected 
                                    ? "bg-primary/5 dark:bg-primary/10 border-primary ring-2 ring-primary/20 shadow-xs" 
                                    : "bg-zinc-50 dark:bg-white/[0.03] border-border/80 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] hover:border-primary/40"
                                }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="font-black text-sm text-foreground flex items-center gap-2 flex-wrap">
                                        {role.name}
                                        {role.isSystem && (
                                            <span className="text-[10px] bg-zinc-200/80 text-zinc-700 dark:bg-white/10 dark:text-white/80 px-2 py-0.5 rounded-full font-bold">
                                                系统
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{role.description || "无具体权限描述"}</p>
                                </div>
                                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                                    isSelected 
                                    ? "bg-primary border-primary text-primary-foreground shadow-xs shadow-primary/40 scale-105" 
                                    : "border-zinc-300 dark:border-white/20 bg-white dark:bg-zinc-800 group-hover:border-primary/50"
                                }`}>
                                    {isSelected ? <Check size={11} strokeWidth={4} /> : null}
                                </div>
                            </button>
                        );
                    }) : (
                        <div className="rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center bg-muted/10">
                            <p className="text-sm font-bold text-muted-foreground">当前没有可分配的角色</p>
                            <p className="text-xs text-muted-foreground/70 mt-1">请先到角色管理中创建或启用角色模板。</p>
                        </div>
                    )}
                </div>

                <div className="relative px-6 py-4 border-t border-border/60 flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2.5 rounded-full bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200/80 dark:hover:bg-white/10 text-foreground transition-all text-sm font-bold active:scale-95"
                    >
                        取消
                    </button>
                    <button 
                        disabled={isSaving || !selectedId}
                        onClick={() => onSave(selectedId)}
                        className={`px-7 sm:px-8 py-2.5 rounded-full font-black text-sm transition-all ${
                            selectedId && !isSaving
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed shadow-none"
                        }`}
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
  const canViewMemberOrders = hasAdminAccess(sessionUser, "members:orders");
  const canManageMemberLibraries = hasAdminAccess(sessionUser, "members:libraries");
  const canManageWhitelist = hasAdminAccess(sessionUser, "whitelist:manage");
  const canViewEntries = canManageWhitelist || canManageMembers || canManageMemberStatus || canViewMemberOrders || canManageMemberLibraries;
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [roles, setRoles] = useState<RoleProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isBatchRoleOpen, setIsBatchRoleOpen] = useState(false);

  // 查看成员订单数据状态
  const [viewOrdersUser, setViewOrdersUser] = useState<{
    id: string;
    name: string;
    email: string;
    roleName?: string;
  } | null>(null);

  // 新增：商品库授权状态
  const [authLibraryUserId, setAuthLibraryUserId] = useState<string | null>(null);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [allLibraries, setAllLibraries] = useState<ProductLibraryOption[]>([]);

  useEffect(() => {
    if (authLibraryUserId) {
      fetch("/api/product-libraries")
        .then(r => r.ok ? r.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            setAllLibraries(data);
          }
        })
        .catch(() => {});
    }
  }, [authLibraryUserId]);

  const filteredEntries = useMemo(() => {
    const keyword = searchQuery.trim();
    if (!keyword) return entries;

    return entries.filter((entry) => {
      const normalizedKeyword = keyword.toLowerCase();

      return (
        entry.email.toLowerCase().includes(normalizedKeyword) ||
        pinyinMatch(entry.remark || "", keyword)
      );
    });
  }, [entries, searchQuery]);

  const selectedEntries = useMemo(
    () => filteredEntries.filter((entry) => selectedEmails.includes(entry.email)),
    [filteredEntries, selectedEmails]
  );
  const selectedRegisteredEntries = useMemo(
    () => selectedEntries.filter((entry) => Boolean(entry.user)),
    [selectedEntries]
  );
  const selectableFilteredEntries = useMemo(
    () => filteredEntries.filter((entry) => entry.user?.role !== "SUPER_ADMIN"),
    [filteredEntries]
  );
  const allFilteredSelected =
    selectableFilteredEntries.length > 0 &&
    selectableFilteredEntries.every((entry) => selectedEmails.includes(entry.email));
  const shouldHideActionBar = Boolean(editingUserId || isBatchRoleOpen || editingRemarkEntry || deleteEmail || viewOrdersUser);

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

  useEffect(() => {
    setSelectedEmails((current) => current.filter((email) => entries.some((entry) => entry.email === email)));
  }, [entries]);

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

  const handleInternalToggle = async (userId: string, isInternal: boolean) => {
    if (!canManageMembers) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isInternal }),
      });
      if (res.ok) {
        showToast("用户内部身份已更新", "success");
        fetchData();
      } else {
        showToast("操作失败", "error");
      }
    } catch {
      showToast("网络请求失败", "error");
    }
  };

  const handleSaveUserLibraries = async () => {
    if (!authLibraryUserId) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${authLibraryUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryIds: selectedLibraryIds }),
      });
      if (res.ok) {
        showToast("商品库授权已更新", "success");
        setAuthLibraryUserId(null);
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

  const toggleSelectEmail = (email: string) => {
    setSelectedEmails((current) => (
      current.includes(email)
        ? current.filter((item) => item !== email)
        : [...current, email]
    ));
  };

  const toggleSelectAllFiltered = () => {
    const selectableEmails = selectableFilteredEntries.map((entry) => entry.email);
    setSelectedEmails((current) => {
      if (allFilteredSelected) {
        return current.filter((email) => !selectableEmails.includes(email));
      }
      return Array.from(new Set([...current, ...selectableEmails]));
    });
  };

  const runBatchStatusChange = async (status: "ACTIVE" | "DISABLED") => {
    if (!canManageMemberStatus || selectedRegisteredEntries.length === 0) {
      return;
    }

    setIsBatchRunning(true);
    try {
      const res = await fetch("/api/admin/users/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: selectedRegisteredEntries.map((entry) => entry.email),
          status,
        }),
      });
      if (!res.ok) {
        throw new Error("状态更新失败");
      }
      showToast(`已批量${status === "ACTIVE" ? "启用" : "禁用"} ${selectedRegisteredEntries.length} 个成员`, "success");
      setSelectedEmails([]);
      fetchData();
    } catch (error) {
      console.error("Batch status update failed:", error);
      showToast("批量状态更新失败", "error");
    } finally {
      setIsBatchRunning(false);
    }
  };

  const runBatchRoleSave = async (roleId: string) => {
    if (!canManageMembers || selectedEntries.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: selectedEntries.map((entry) => entry.email),
          roleProfileId: roleId,
        }),
      });
      if (!res.ok) {
        throw new Error("角色更新失败");
      }
      showToast(`已批量更新 ${selectedEntries.length} 个成员角色`, "success");
      setIsBatchRoleOpen(false);
      setSelectedEmails([]);
      fetchData();
    } catch (error) {
      console.error("Batch role update failed:", error);
      showToast("批量角色更新失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const runBatchDelete = async () => {
    if (!canManageWhitelist || selectedEntries.length === 0) {
      return;
    }

    setIsBatchRunning(true);
    try {
      const res = await fetch("/api/admin/whitelist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: selectedEntries.map((entry) => entry.email),
        }),
      });
      if (!res.ok) {
        throw new Error("批量移除失败");
      }
      showToast(`已批量移除 ${selectedEntries.length} 个成员/邀请`, "success");
      setSelectedEmails([]);
      fetchData();
    } catch (error) {
      console.error("Batch delete failed:", error);
      showToast("批量移除失败", "error");
    } finally {
      setIsBatchRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManageWhitelist && (
        <div className="relative overflow-hidden rounded-[22px] sm:rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-5 sm:p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent">
          <div className="pointer-events-none absolute -right-12 -top-12 hidden h-48 w-48 rounded-full bg-primary/5 blur-2xl sm:block" />
          <h3 className="relative text-sm font-black flex items-center gap-2 mb-4 text-foreground tracking-wide">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail size={13} />
            </div>
            邀请新成员
          </h3>
          <form onSubmit={handleAdd} className="relative space-y-3">
            <div className="flex gap-2 flex-1">
              <div className="flex-1 relative">
                <input
                  type="email"
                  placeholder="输入受邀者邮箱..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full h-10 px-4 rounded-full bg-white dark:bg-white/5 border border-border/80 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all text-sm shadow-2xs"
                />
              </div>

              <div className="w-[110px] sm:w-48 shrink-0">
                <CustomSelect 
                  value={targetRoleId}
                  onChange={setTargetRoleId}
                  options={roles.map(r => ({ value: r.id, label: r.name }))}
                  placeholder="角色..."
                  triggerClassName="w-full h-10 rounded-full bg-white dark:bg-white/5 border border-border/80 px-4 text-sm shadow-2xs"
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
                  className="w-full h-10 px-4 rounded-full bg-white dark:bg-white/5 border border-border/80 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all text-sm shadow-2xs"
                />
              </div>

              <div className="w-full sm:w-auto shrink-0">
                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full sm:w-auto h-10 px-8 rounded-full bg-primary text-primary-foreground font-black text-sm shadow-lg shadow-primary/25 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {isInviting ? <Loader2 className="animate-spin" size={14} /> : <Plus size={16} />}
                  发送邀请
                </button>
              </div>
            </div>
          </form>
          <p className="relative mt-4 text-xs text-muted-foreground flex items-center gap-1.5 px-1">
            <AlertCircle size={14} />
            只有受邀并分配角色的邮箱可完成注册。您可以在“角色管理”页签中自定义更多的角色模板。
          </p>
        </div>
      )}

      {!canManageWhitelist && (
        <div className="rounded-[20px] sm:rounded-[22px] border border-border/60 bg-linear-to-br from-white/80 to-muted/20 dark:from-white/[0.03] dark:to-transparent p-4 backdrop-blur-xs">
          <p className="text-sm font-bold text-foreground">邀请与白名单能力已收起</p>
          <p className="mt-1 text-xs text-muted-foreground">当前账号可以查看成员信息，但不能新增邀请或撤销准入。</p>
        </div>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索邮箱或备注"
          className="h-11 w-full rounded-full border border-border/70 bg-white dark:bg-white/5 pl-11 pr-4 text-sm outline-none transition-all shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 backdrop-blur-xs"
        />
      </div>

      {/* Members Table - Desktop */}
      <div className="rounded-[22px] sm:rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent overflow-hidden shadow-sm backdrop-blur-md flex-1">
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/40 dark:bg-white/[0.03] border-b border-border/60">
                <th className="px-4 py-3.5 text-center">
                  <div className="flex justify-center">
                    <SelectionCircleButton checked={allFilteredSelected} onClick={toggleSelectAllFiltered} />
                  </div>
                </th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground">成员信息</th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground text-center">最后活动</th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground text-center">在线设备</th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground text-center">系统角色</th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground text-center">状态</th>
                <th className="px-5 py-3.5 text-xs font-black text-foreground text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-muted-foreground">
                    <Loader2 className="animate-spin mx-auto mb-4 text-primary" size={32} />
                    正在整理成员目录...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center text-muted-foreground">暂无成员数据</td></tr>
              ) : (
                filteredEntries.map((entry) => {
                  const isRegistered = !!entry.user;
                  const isSuperAdmin = entry.user?.role === "SUPER_ADMIN";
                  const roleName = isSuperAdmin ? "超级管理员" : (isRegistered ? entry.user?.roleProfile?.name : entry.roleProfile?.name);
                  
                  return (
                    <tr key={entry.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center">
                          {isSuperAdmin ? (
                            <SelectionCircleButton
                              checked={false}
                              disabled
                              title="不可勾选"
                            />
                          ) : (
                            <SelectionCircleButton checked={selectedEmails.includes(entry.email)} onClick={() => toggleSelectEmail(entry.email)} />
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <MemberAvatar
                            isRegistered={isRegistered}
                            email={entry.email}
                            name={entry.user?.name}
                            size="md"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold truncate">{isRegistered ? entry.user?.name : "待邀请成员"}</span>
                            <span className="text-[10px] text-muted-foreground font-mono truncate">{entry.email}</span>
                            {entry.remark && entry.remark !== "系统超级管理员" ? (
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex max-w-fit items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                  {entry.remark}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {isRegistered ? formatLastActiveAt(entry.user?.lastActiveAt) : "暂无记录"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <DevicePresence devices={entry.user?.deviceSessions} compact />
                      </td>
                      <td className="px-5 py-3 text-center">
                        <RoleBadge isSuperAdmin={isSuperAdmin} roleName={roleName} />
                      </td>
                      <td className="px-5 py-3 text-center">
                         {isRegistered ? (
                             <div className="flex justify-center shrink-0">
                                 <Switch
                                     checked={entry.user?.status === 'ACTIVE'}
                                     onChange={() => handleStatusToggle(entry.email, entry.user?.status || 'ACTIVE')}
                                     disabled={!canManageMemberStatus || isSuperAdmin}
                                 />
                             </div>
                         ) : (
                             <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20 whitespace-nowrap">等待加入</span>
                         )}
                      </td>
                       <td className="px-6 py-4 text-center">
                         <div className="flex justify-center">
                            <div className="flex items-center gap-1 bg-muted/20 dark:bg-white/[0.02] p-1 rounded-full border border-border/40">
                               {isRegistered && canViewMemberOrders ? (
                                  <button
                                    onClick={() => {
                                      setViewOrdersUser({
                                        id: entry.user!.id,
                                        name: entry.user?.name || entry.email,
                                        email: entry.email,
                                        roleName: entry.user?.roleProfile?.name || entry.roleProfile?.name,
                                      });
                                    }}
                                    className={`relative h-8 w-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                                      Boolean(entry.user?.hasMaiyatianCookie)
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 shadow-2xs shadow-emerald-500/10"
                                        : "text-muted-foreground/45 hover:text-muted-foreground hover:bg-muted/40"
                                    }`}
                                    title={
                                      Boolean(entry.user?.hasMaiyatianCookie)
                                        ? `查看麦芽田订单数据（已接入${entry.user?.maiyatianCookieCount && entry.user.maiyatianCookieCount > 1 ? ` ${entry.user.maiyatianCookieCount}号` : ""}）`
                                        : "查看麦芽田订单数据（未接入）"
                                    }
                                  >
                                    <ShoppingBag size={15} />
                                    {entry.user?.hasMaiyatianCookie && entry.user?.maiyatianCookieCount && entry.user.maiyatianCookieCount > 1 ? (
                                      <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-600 px-0.5 text-[8px] font-black text-white ring-2 ring-background leading-none">
                                        {entry.user.maiyatianCookieCount}
                                      </span>
                                    ) : null}
                                  </button>
                                ) : null}
                               {isRegistered && canManageMembers && !isSuperAdmin ? (
                                  <button
                                    onClick={() => {
                                      setEditingUserId(entry.user!.id);
                                      setCurrentRoleId(entry.user!.roleProfileId);
                                    }}
                                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/15 hover:text-primary transition-all hover:scale-110 active:scale-95"
                                    title="角色分配"
                                  >
                                    <Settings2 size={15} />
                                  </button>
                                ) : null}
                                {isRegistered && canManageMemberLibraries && !isSuperAdmin ? (
                                  <button
                                    onClick={() => {
                                      setAuthLibraryUserId(entry.user!.id);
                                      setSelectedLibraryIds(entry.user!.accessibleLibraries?.map(l => l.id) || []);
                                    }}
                                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-indigo-500/15 hover:text-indigo-600 transition-all hover:scale-110 active:scale-95"
                                    title="商品库授权"
                                  >
                                    <FolderLock size={15} />
                                  </button>
                                ) : null}
                               {canManageWhitelist && (
                                 <button
                                   onClick={() => setEditingRemarkEntry(entry)}
                                   className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-amber-500/15 hover:text-amber-600 transition-all hover:scale-110 active:scale-95"
                                   title="编辑备注"
                                 >
                                   <NotebookPen size={15} />
                                 </button>
                               )}
                               {canManageWhitelist && !isSuperAdmin && (
                                 <button
                                    onClick={() => setDeleteEmail(entry.email)}
                                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-500/15 hover:text-red-500 transition-all hover:scale-110 active:scale-95"
                                    title={isRegistered ? "移除成员" : "撤销邀请"}
                                 >
                                    <Trash2 size={15} />
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
          ) : filteredEntries.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">暂无成员数据</div>
          ) : (
            filteredEntries.map((entry) => {
              const isRegistered = !!entry.user;
              const isSuperAdmin = entry.user?.role === "SUPER_ADMIN";
              const roleName = isSuperAdmin ? "超级管理员" : (isRegistered ? entry.user?.roleProfile?.name : entry.roleProfile?.name);
              
              return (
                <div key={entry.id} className="p-4 transition-colors hover:bg-muted/10">
                  <div className="rounded-[22px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent p-4 shadow-sm backdrop-blur-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <MemberAvatar
                          isRegistered={isRegistered}
                          email={entry.email}
                          name={entry.user?.name}
                          size="lg"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-bold truncate">{isRegistered ? entry.user?.name : "待邀请成员"}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground font-mono break-all leading-relaxed">{entry.email}</span>
                          {entry.remark && entry.remark !== "系统超级管理员" ? (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex max-w-full items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/20 break-all">
                                {entry.remark}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {isSuperAdmin ? (
                        <SelectionCircleButton
                          checked={false}
                          disabled
                          title="不可勾选"
                        />
                      ) : (
                        <SelectionCircleButton checked={selectedEmails.includes(entry.email)} onClick={() => toggleSelectEmail(entry.email)} />
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <RoleBadge isSuperAdmin={isSuperAdmin} roleName={roleName} />
                      {isRegistered ? (
                        <Switch
                          checked={entry.user?.status === 'ACTIVE'}
                          onChange={() => handleStatusToggle(entry.email, entry.user?.status || 'ACTIVE')}
                          disabled={!canManageMemberStatus || isSuperAdmin}
                        />
                      ) : (
                        <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">等待加入</span>
                      )}
                    </div>

                    <div className="mt-3 rounded-2xl bg-muted/30 dark:bg-white/[0.02] px-3.5 py-2.5 border border-border/30">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">最后活动</div>
                      <div className="mt-1 text-xs font-semibold text-foreground">
                        {isRegistered ? formatLastActiveAt(entry.user?.lastActiveAt) : "暂无记录"}
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-muted/30 dark:bg-white/[0.02] px-3.5 py-2.5 border border-border/30">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">在线设备</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <DevicePresence devices={entry.user?.deviceSessions} />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {canManageWhitelist && (
                        <button
                          onClick={() => setEditingRemarkEntry(entry)}
                          className={`h-9 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold transition-all hover:bg-amber-500/20 active:scale-95 flex items-center justify-center gap-2 border border-amber-500/20 ${
                            isRegistered ? "" : "col-span-2"
                          }`}
                        >
                          <NotebookPen size={14} />
                          备注
                        </button>
                      )}
                      {isRegistered && canManageMembers && !isSuperAdmin && (
                        <button
                          onClick={() => {
                            setEditingUserId(entry.user!.id);
                            setCurrentRoleId(entry.user!.roleProfileId);
                          }}
                          className="h-9 rounded-full bg-primary/10 text-primary text-xs font-bold transition-all hover:bg-primary/20 active:scale-95 flex items-center justify-center gap-2 border border-primary/20"
                        >
                          <Settings2 size={14} />
                          角色分配
                        </button>
                      )}
                      {isRegistered && canViewMemberOrders && (
                        <button
                          onClick={() => {
                            setViewOrdersUser({
                              id: entry.user!.id,
                              name: entry.user?.name || entry.email,
                              email: entry.email,
                              roleName: entry.user?.roleProfile?.name || entry.roleProfile?.name,
                            });
                          }}
                          className={`col-span-2 h-9 rounded-full text-xs font-bold transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 border ${
                            Boolean(entry.user?.hasMaiyatianCookie)
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20"
                              : "bg-muted/20 text-muted-foreground/60 border-border/40 hover:bg-muted/40 hover:text-muted-foreground"
                          }`}
                        >
                          <ShoppingBag size={14} className={Boolean(entry.user?.hasMaiyatianCookie) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"} />
                          <span>查看麦芽田订单数据</span>
                          <span className={`text-[10px] font-semibold ${Boolean(entry.user?.hasMaiyatianCookie) ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}`}>
                            ({Boolean(entry.user?.hasMaiyatianCookie) ? `已接入${entry.user?.maiyatianCookieCount && entry.user.maiyatianCookieCount > 1 ? ` ${entry.user.maiyatianCookieCount}号` : ""}` : "未接入"})
                          </span>
                        </button>
                      )}
                      {isRegistered && canManageMemberLibraries && !isSuperAdmin && (
                        <button
                          onClick={() => {
                            setAuthLibraryUserId(entry.user!.id);
                            setSelectedLibraryIds(entry.user!.accessibleLibraries?.map(l => l.id) || []);
                          }}
                          className="col-span-2 h-9 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold transition-all hover:bg-indigo-500/20 active:scale-95 flex items-center justify-center gap-2 border border-indigo-500/20"
                        >
                          <FolderLock size={14} />
                          商品库授权
                        </button>
                      )}
                      {canManageWhitelist && !isSuperAdmin && (
                        <button
                          onClick={() => setDeleteEmail(entry.email)}
                          className="col-span-2 h-9 rounded-full bg-red-500/10 text-red-500 text-xs font-bold transition-all hover:bg-red-500/20 active:scale-95 flex items-center justify-center gap-2 border border-red-500/20"
                        >
                          <Trash2 size={14} />
                          {isRegistered ? "移除成员" : "撤销邀请"}
                        </button>
                      )}
                    </div>
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

       {isBatchRoleOpen && canManageMembers && (
         <RoleAssignmentModal
           roles={roles}
           currentRoleId={null}
           onClose={() => setIsBatchRoleOpen(false)}
           onSave={runBatchRoleSave}
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
               if (deleteEmail === "__BATCH__") {
                   await runBatchDelete();
                   setDeleteEmail(null);
                   return;
               }
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
               if (deleteEmail === "__BATCH__") {
                 return "批量移除";
               }
               const entry = entries.find(e => e.email === deleteEmail);
               return entry?.user ? "移除成员" : "撤销邀请";
           })()}
           message={(() => {
               if (deleteEmail === "__BATCH__") {
                 return `确定要批量移除选中的 ${selectedEntries.length} 个成员或邀请吗？`;
               }
               const entry = entries.find(e => e.email === deleteEmail);
               return entry?.user 
                  ? `确定要移除成员 ${entry.user.name || deleteEmail} 吗？移除后该账号将无法登录且所有权限将被收回。`
                  : `确定要撤销对 ${deleteEmail} 的入驻邀请吗？`;
           })()}
           variant="danger"
         />
       )}

       {/* 商品库授权 Modal */}
      {authLibraryUserId && (
        <ConfirmModal
          isOpen={!!authLibraryUserId}
          onClose={() => setAuthLibraryUserId(null)}
          onConfirm={handleSaveUserLibraries}
          title="商品库访问授权"
          confirmLabel="保存授权"
          variant="primary"
          message={
            <div className="space-y-4 py-2">
              <p className="text-xs text-muted-foreground">
                请选择该成员可以访问的商品模板库。可单选、多选，也可以不选择。
              </p>
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {allLibraries.map((lib) => {
                  const isChecked = selectedLibraryIds.includes(lib.id);
                  
                  return (
                    <div
                      key={lib.id}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedLibraryIds(prev => prev.filter(id => id !== lib.id));
                        } else {
                          setSelectedLibraryIds(prev => [...prev, lib.id]);
                        }
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border text-sm transition-all cursor-pointer select-none ${
                        isChecked
                          ? "border-primary/40 bg-primary/8 text-foreground shadow-2xs"
                          : "border-border/60 hover:bg-muted/20 text-muted-foreground hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="pointer-events-none">
                          <SelectionCircleButton
                            checked={isChecked}
                            onClick={() => {}}
                          />
                        </div>
                        <span className="font-semibold">{lib.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          }
        />
      )}

       <ActionBar
         selectedCount={shouldHideActionBar ? 0 : selectedEntries.length}
         totalCount={filteredEntries.length}
         onToggleSelectAll={toggleSelectAllFiltered}
         onClear={() => setSelectedEmails([])}
         label="项"
         extraActions={[
           ...(canManageMemberStatus ? [
             {
               label: "批量启用",
               icon: <UserCheck size={14} />,
               onClick: () => void runBatchStatusChange("ACTIVE"),
               title: "批量启用",
             },
             {
               label: "批量禁用",
               icon: <Ban size={14} />,
               onClick: () => void runBatchStatusChange("DISABLED"),
               title: "批量禁用",
             },
           ] : []),
           ...(canManageMembers ? [
             {
               label: "批量分配角色",
               icon: <Settings2 size={14} />,
               onClick: () => setIsBatchRoleOpen(true),
               title: "批量分配角色",
             },
           ] : []),
           ...(canManageWhitelist ? [
             {
               label: "批量移除",
               icon: <Trash2 size={14} />,
               onClick: () => setDeleteEmail("__BATCH__"),
               title: "批量移除",
               variant: "danger" as const,
             },
           ] : []),
         ].filter((action) => {
           if ((action.label === "批量启用" || action.label === "批量禁用") && (isBatchRunning || selectedRegisteredEntries.length === 0)) {
             return false;
           }
           if (action.label === "批量分配角色" && isSaving) {
             return false;
           }
           if (action.label === "批量移除" && isBatchRunning) {
             return false;
           }
           return true;
         })}
       />

        {/* 成员订单数据弹窗 */}
        <UserOrdersModal
          key={viewOrdersUser?.id || "closed"}
          isOpen={Boolean(viewOrdersUser)}
          onClose={() => setViewOrdersUser(null)}
          userId={viewOrdersUser?.id || null}
         userName={viewOrdersUser?.name}
         userEmail={viewOrdersUser?.email}
         roleName={viewOrdersUser?.roleName}
       />
    </div>
  );
}
