/*
 * @Author: Sube3494 2237608602@qq.com
 * @Date: 2026-03-03 19:55:03
 * @LastEditors: Sube3494 2237608602@qq.com
 * @LastEditTime: 2026-09-08 09:08:27
 * @FilePath: \goods\src\app\admin\members\page.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
"use client";

import { Users, LayoutGrid, ShieldAlert, Loader2 } from "lucide-react";
import { UserManager } from "@/components/Admin/UserManager";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";

export default function MembersPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const sessionUser = user as SessionUser | null;
  const canAccessMembersCenter = hasPermission(sessionUser, "members:read");

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
                className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
            >
                返回概览
            </button>
        </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* 顶部标题与环境光晕 Hero */}
      <div className="relative overflow-hidden rounded-[22px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-white/6 dark:via-white/3 dark:to-transparent sm:rounded-4xl sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-16 -top-16 hidden h-64 w-64 rounded-full bg-primary/8 blur-3xl sm:block" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 hidden h-64 w-64 rounded-full bg-sky-500/5 blur-3xl sm:block" />

        <div className="relative flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="space-y-1 sm:space-y-1.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shadow-2xs sm:h-9 sm:w-9">
                  <Users size={18} />
                </div>
                <h1 className="text-xl font-black tracking-tight text-foreground sm:text-3xl">
                  成员管理中心
                </h1>
              </div>
              <p className="hidden max-w-2xl text-xs leading-relaxed text-muted-foreground sm:block sm:text-sm">
                统一维护成员账号、准入白名单与邀请链路。系统依据你的实际管理 Capability 动态呈现可用操作，严密保障协作安全。
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <UserManager />
      </div>

      {/* 管理控制说明 */}
      <div className="relative overflow-hidden rounded-[22px] sm:rounded-[28px] border border-border/60 bg-linear-to-br from-white/80 to-muted/20 dark:from-white/3 dark:to-transparent p-5 sm:p-6 backdrop-blur-xs">
        <h3 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-2 mb-3 tracking-wide">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LayoutGrid size={13} />
          </div>
          管理控制说明
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 text-xs text-muted-foreground leading-relaxed">
          <div className="space-y-1.5 rounded-2xl bg-white/50 dark:bg-white/2 border border-border/40 p-3.5">
            <p className="font-bold text-foreground/80 flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-black">1</span>
              入驻流程
            </p>
            <p className="text-muted-foreground">成员是否能被邀请、加入白名单或调整状态，都会按当前管理员的 Capability 实时决定，保障前后端口径严格对齐。</p>
          </div>
          <div className="space-y-1.5 rounded-2xl bg-white/50 dark:bg-white/2 border border-border/40 p-3.5">
            <p className="font-bold text-foreground/80 flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-black">2</span>
              角色分工
            </p>
            <p className="text-muted-foreground">成员的权责由被分派的“角色模板”决定。如需创建或修改系统现有角色，请前往侧边栏的“角色管理”中心操作。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
