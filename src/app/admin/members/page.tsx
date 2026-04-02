"use client";

import { Users, LayoutGrid, ShieldAlert, Loader2, ShieldCheck, UserCog, MailPlus } from "lucide-react";
import { UserManager } from "@/components/Admin/UserManager";
import { useUser } from "@/hooks/useUser";
import { hasAdminAccess, SessionUser } from "@/lib/permissions";

export default function MembersPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const sessionUser = user as SessionUser | null;
  const canManageMembers = hasAdminAccess(sessionUser, "members:manage");
  const canManageMemberStatus = hasAdminAccess(sessionUser, "members:status");
  const canManageWhitelist = hasAdminAccess(sessionUser, "whitelist:manage");
  const canAccessMembersCenter = canManageMembers || canManageMemberStatus || canManageWhitelist;

  if (isUserLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-muted-foreground animate-pulse text-sm">正在核验访问权限...</p>
        </div>
    );
  }

  if (!canAccessMembersCenter) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                <ShieldAlert size={40} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-foreground">访问受限</h2>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    当前账号没有成员与准入管理能力，因此无法进入这个区域。
                </p>
            </div>
            <button 
                onClick={() => window.location.href = "/"}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg hover:scale-105 transition-all"
            >
                返回概览
            </button>
        </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="text-primary" size={28} />
            成员管理中心
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-2xl">
            在这里统一处理成员账号、准入白名单与邀请关系。页面会按你的实际管理能力显示可执行操作，避免前后端口径不一致。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-white/60 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <UserCog size={16} className={canManageMembers ? "text-primary" : "text-muted-foreground"} />
            成员角色
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {canManageMembers ? "可以调整成员角色与账号归属。" : "当前账号不能修改成员角色。"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white/60 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck size={16} className={canManageMemberStatus ? "text-emerald-500" : "text-muted-foreground"} />
            账号状态
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {canManageMemberStatus ? "可以启用或禁用现有成员账号。" : "当前账号不能修改成员状态。"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-white/60 dark:bg-white/5 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <MailPlus size={16} className={canManageWhitelist ? "text-sky-500" : "text-muted-foreground"} />
            邀请与白名单
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {canManageWhitelist ? "可以发起邀请、撤销准入和维护白名单。" : "当前账号不能管理邀请与白名单。"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
         <UserManager />
      </div>

      {/* Help Section */}
      <div className="mt-12 p-6 rounded-2xl border border-dashed border-border bg-white/50 dark:bg-transparent">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
            <LayoutGrid size={16} className="text-primary" />
            管理控制说明
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-muted-foreground leading-relaxed">
            <div className="space-y-2">
                <p className="font-bold text-foreground/70">1. 入驻流程</p>
                <p>成员是否能被邀请、加入白名单或调整状态，都会按当前管理员的 capability 实时决定，不再单靠页面硬编码角色。</p>
            </div>
            <div className="space-y-2">
                <p className="font-bold text-foreground/70">2. 角色分工</p>
                <p>成员的权责由被分派的“角色模板”决定。如需创建或修改系统现有角色，请前往侧边栏的“角色管理”中心操作。</p>
            </div>
        </div>
      </div>
    </div>
  );
}
