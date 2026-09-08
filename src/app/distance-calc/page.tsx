"use client";

import { StoreDispatchMap } from "@/components/DistanceCalc/StoreDispatchMap";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ShieldAlert, Loader2 } from "lucide-react";
import Link from "next/link";

export default function DistanceCalcPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const canManageLogistics = hasPermission(user as SessionUser | null, "logistics:manage");

  if (isUserLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] gap-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="text-muted-foreground animate-pulse text-sm font-medium">核验访问权限中...</p>
      </div>
    );
  }

  if (!canManageLogistics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70dvh] p-6 text-center animate-in fade-in zoom-in-95 duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full scale-150 opacity-50" />
          <div className="relative h-24 w-24 rounded-[28px] bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-2xl">
            <ShieldAlert size={48} strokeWidth={1.5} />
          </div>
        </div>
        
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-black tracking-tight text-foreground">访问权限受限</h2>
          <p className="text-muted-foreground leading-relaxed">
            对不起，您当前所在的角色未被授予 <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">logistics:manage</code> 权限。
            请联系系统管理员在“角色管理”中开启该功能模块。
          </p>
          
          <div className="pt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link 
              href="/"
              className="px-8 h-12 flex items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
              返回首页
            </Link>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 font-bold hover:bg-white/10 transition-all"
            >
              重试加载
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-1 flex-col animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-baseline justify-between gap-1.5 shrink-0 px-4 sm:px-6 lg:px-8 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[1.75rem] sm:text-[2.1rem] leading-none font-black tracking-tight text-foreground truncate">
              智能调货中心
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              LBS 智能调度
            </span>
          </div>
          <p className="text-muted-foreground mt-1.5 max-w-3xl text-xs sm:text-sm">
            基于高德地图实时 LBS 测距能力，精准规划目标收货地与各仓库、门店的配送路径与预估运费。
          </p>
        </div>
      </div>

      <div className={cn(
        "flex min-h-0 flex-1 flex-col rounded-none border-y border-border/60 bg-card/60 shadow-sm overflow-hidden backdrop-blur-xl relative lg:rounded-[32px] lg:border lg:border-border/60 lg:mx-4 lg:mb-4",
      )}>
        <StoreDispatchMap initialStores={[]} />
      </div>
    </div>
  );
}
