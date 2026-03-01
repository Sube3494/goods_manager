"use client";

import { RoleManager, RoleManagerHandle } from "@/components/Admin/RoleManager";
import { useUser } from "@/hooks/useUser";
import { useRef } from "react";
import { Plus, Loader2, ShieldAlert, LayoutGrid } from "lucide-react";

export default function RolesPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const roleManagerRef = useRef<RoleManagerHandle>(null);

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
                    对不起，您当前的身份无法访问角色管理中心。
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
    <div className="space-y-8 text-foreground">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-border/50 pb-8">
        <div className="space-y-1">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldAlert className="text-primary" size={32} />
            系统角色与权限
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl">
            作为超级管理员，您可以在此定义及分配角色权限模板。拥有具体角色的用户，将获得相对应的模块访问与操作权限。
          </p>
        </div>

        <button
          onClick={() => roleManagerRef.current?.openCreateModal()}
          className="group relative px-8 h-14 rounded-2xl bg-primary text-primary-foreground font-black shadow-2xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all overflow-hidden shrink-0"
        >
          <div className="relative z-10 flex items-center gap-3">
            <Plus size={22} strokeWidth={3} />
            创建新角色
          </div>
          <div className="absolute inset-0 bg-linear-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>

      <div className="grid grid-cols-1">
         <RoleManager ref={roleManagerRef} />
      </div>

      {/* Help Section */}
      <div className="mt-12 p-6 rounded-2xl border border-dashed border-border bg-white/50 dark:bg-transparent">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
            <LayoutGrid size={16} className="text-primary" />
            角色与权限分配须知
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-muted-foreground leading-relaxed">
            <div className="space-y-2">
                <p className="font-bold text-foreground/70">1. 系统默认角色</p>
                <p>系统内置了一些不可修改的基础角色模板（如相册访客），用以满足日常基础场景。对于大多数新增人员，可直接分配这些预置模板。</p>
            </div>
            <div className="space-y-2">
                <p className="font-bold text-foreground/70">2. 自定义权限颗粒度</p>
                <p>若内置角色无法满足需求，您可以点击“新建角色”，针对性地勾选读取、写入或管理权限。该角色绑定至用户后即刻生效，严格拦截越权操作。</p>
            </div>
        </div>
      </div>
    </div>
  );
}
