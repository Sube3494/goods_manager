"use client";

import { RoleManager, RoleManagerHandle } from "@/components/Admin/RoleManager";
import { useUser } from "@/hooks/useUser";
import { useRef } from "react";
import { Plus, Loader2, ShieldAlert, LayoutGrid, Sparkles, BadgeCheck, PanelsTopLeft } from "lucide-react";
import { hasAdminAccess, SessionUser } from "@/lib/permissions";

export default function RolesPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const roleManagerRef = useRef<RoleManagerHandle>(null);
  const canManageRoles = hasAdminAccess(user as SessionUser | null, "roles:manage");


  if (isUserLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-muted-foreground animate-pulse text-sm">正在核验访问权限...</p>
        </div>
    );
  }

  if (!canManageRoles) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                <ShieldAlert size={40} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-foreground">访问受限</h2>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    对不起，您当前没有角色管理权限。
                </p>
            </div>
            <button 
                onClick={() => window.location.href = "/"}
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
            >
                返回概览
            </button>
        </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* 顶部标题与核心操作栏 */}
      <div className="relative overflow-hidden rounded-[22px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:rounded-[32px] sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 hidden h-64 w-64 rounded-full bg-primary/8 blur-3xl sm:block" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 hidden h-64 w-64 rounded-full bg-amber-500/5 blur-3xl sm:block" />

        <div className="relative flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shadow-2xs sm:h-9 sm:w-9">
                  <ShieldAlert size={18} />
                </div>
                <h1 className="text-xl font-black tracking-tight text-foreground sm:text-3xl">
                  系统角色与权限
                </h1>
              </div>
              <p className="hidden max-w-2xl text-xs leading-relaxed text-muted-foreground sm:block sm:text-sm">
                在角色库中定义岗位职能并配置模块访问颗粒度。分配给具体成员后即刻生效，严格保障业务数据安全。
              </p>
            </div>

            <button
              onClick={() => roleManagerRef.current?.openCreateModal()}
              className="group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 active:scale-95 sm:h-11 sm:px-6 sm:text-sm"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>创建新角色</span>
            </button>
          </div>

          {/* 3个功能概览胶囊卡片 */}
          <div className="hidden grid-cols-1 gap-3 sm:grid md:grid-cols-3 sm:gap-4">
            <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 shadow-2xs backdrop-blur-xs transition-all hover:border-primary/30">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <PanelsTopLeft size={13} />
                </div>
                <span>看板式角色库</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">直观纵览各角色模块覆盖与成员人数，支持快速复制、编辑或查阅能力详情。</p>
            </div>

            <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 shadow-2xs backdrop-blur-xs transition-all hover:border-amber-500/30">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                  <Sparkles size={13} />
                </div>
                <span>权限分组导航</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">同步显示分组进度、已开通摘要与快速关键字筛选，清晰勾选精准权限。</p>
            </div>

            <div className="rounded-[20px] border border-border/60 bg-background/60 p-4 shadow-2xs backdrop-blur-xs transition-all hover:border-emerald-500/30">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <BadgeCheck size={13} />
                </div>
                <span>敏捷安全校对</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">系统内置模板安全只读，自定义角色支持灵活调整与删除，权限隔离清晰有序。</p>
            </div>
          </div>
        </div>
      </div>

      {/* 角色管理列表与编辑器 */}
      <div className="grid grid-cols-1">
        <RoleManager ref={roleManagerRef} />
      </div>

      {/* 帮助须知 */}
      <div className="p-5 sm:p-6 rounded-[24px] border border-border/60 bg-background/50 shadow-2xs backdrop-blur-xs">
        <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LayoutGrid size={13} />
          </div>
          <span>角色与权限分配须知</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 text-xs text-muted-foreground leading-relaxed">
          <div className="space-y-1.5 rounded-[18px] border border-border/40 bg-background/40 p-3.5">
            <p className="font-bold text-foreground/85">1. 系统内置角色模板</p>
            <p>系统内置不可篡改的基础角色模板（如相册访客、管理员），满足常规通用场景，方便为新增人员快捷分配标准模板。</p>
          </div>
          <div className="space-y-1.5 rounded-[18px] border border-border/40 bg-background/40 p-3.5">
            <p className="font-bold text-foreground/85">2. 自定义权限颗粒度控制</p>
            <p>若内置角色无法满足特殊业务分工，可点击“创建新角色”，按需勾选读、写、导出等操作权限，绑定用户后实时生效。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
