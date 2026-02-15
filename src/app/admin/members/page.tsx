"use client";

import { Users, LayoutGrid, ShieldAlert, Loader2 } from "lucide-react";
import { UserManager } from "@/components/Admin/UserManager";
import { useUser } from "@/hooks/useUser";

export default function MembersPage() {
  const { user, isLoading: isUserLoading } = useUser();

  if (isUserLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
            <Loader2 className="animate-spin text-primary" size={40} />
            <p className="text-muted-foreground animate-pulse text-sm">正在核验访问权限...</p>
        </div>
    );
  }

  if (user?.role !== "SUPER_ADMIN") {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                <ShieldAlert size={40} />
            </div>
            <div>
                <h2 className="text-2xl font-bold text-foreground">访问受限</h2>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    对不起，您当前的身份（{user?.role === 'ADMIN' ? '工作区管理员' : '普通成员'}）无法访问系统管理中心。
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
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="text-primary" size={32} />
            成员管理中心
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-2xl">
            作为超级管理员，您可以邀请新成员入驻系统，管理已注册用户，并动态配置其功能细项权限。
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
                <p>在上方“邀请新成员”处添加邮箱。当该邮箱用户访问系统并登录时，系统将识别白名单身份，自动为其创建专属隔离的工作区并分配初始角色。</p>
            </div>
            <div className="space-y-2">
                <p className="font-bold text-foreground/70">2. 动态权限控制</p>
                <p>点击已注册用户的“配置权限”按钮，可以为借用系统的特定用户实现精细化的功能开关（如禁用备份、限制产品数等）。</p>
            </div>
        </div>
      </div>
    </div>
  );
}
