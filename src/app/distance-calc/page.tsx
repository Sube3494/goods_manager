"use client";

import { useState } from "react";
import { StoreDispatchMap } from "@/components/DistanceCalc/StoreDispatchMap";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ShieldAlert, Loader2 } from "lucide-react";
import Link from "next/link";

export default function DistanceCalcPage() {
  const [switcherContainer, setSwitcherContainer] = useState<HTMLDivElement | null>(null);
  const { user, isLoading: isUserLoading } = useUser();
  const canManageLogistics = hasPermission(user as SessionUser | null, "logistics:manage");

  if (isUserLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
        <Loader2 className="animate-spin text-primary" size={36} />
        <p className="text-muted-foreground animate-pulse text-sm font-medium">核验访问权限中...</p>
      </div>
    );
  }

  if (!canManageLogistics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70dvh] p-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-destructive/20 blur-3xl rounded-full scale-150 opacity-50" />
          <div className="relative h-20 w-20 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shadow-xl">
            <ShieldAlert size={40} strokeWidth={1.75} />
          </div>
        </div>
        
        <div className="max-w-md space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">访问权限受限</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            对不起，您当前所在的角色未被授予 <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">logistics:manage</code> 权限。
            请联系系统管理员在“角色管理”中开启该功能模块。
          </p>
          
          <div className="pt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link 
              href="/"
              className="px-6 h-10 flex items-center justify-center rounded-full bg-primary text-primary-foreground font-medium text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all"
            >
              返回首页
            </Link>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 h-10 flex items-center justify-center rounded-full border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 text-foreground text-sm font-medium active:scale-95 transition-all"
            >
              重试加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-1 flex-col animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 shrink-0 px-4 sm:px-6 lg:px-8 pt-4 pb-3">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl leading-tight font-bold tracking-tight text-foreground truncate">
              智能调货中心
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              路线规划
            </span>
          </div>
          <p className="text-muted-foreground mt-1 max-w-3xl text-xs sm:text-sm">
            选择区域、搜索送达地址，快速比较附近网点的调货路线。
          </p>
        </div>
        <div ref={setSwitcherContainer} className="ml-auto flex shrink-0 items-center self-start sm:pt-0.5" />
      </div>

      <div className={cn(
        "flex min-h-0 flex-1 flex-col rounded-none border-y border-black/8 bg-white/72 dark:border-white/10 dark:bg-white/4 shadow-xs overflow-hidden backdrop-blur-xl relative lg:rounded-3xl lg:border lg:border-black/8 lg:dark:border-white/10 lg:mx-4 lg:mb-4",
      )}>
        <StoreDispatchMap initialStores={[]} switcherContainer={switcherContainer} />
      </div>
    </div>
  );
}
