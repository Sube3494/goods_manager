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
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row items-baseline justify-between gap-4 shrink-0 px-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground truncate">
            智能调货中心
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-2xl">
            基于高德地图 LBS 能力，实时测算目标点与各仓库、门店之间的路线方案、骑行距离及预估运费。
          </p>
        </div>
      </div>

      <div className={cn(
        "flex-1 min-h-[600px] rounded-[32px] border border-border/60 bg-white/5 shadow-sm overflow-hidden backdrop-blur-xl relative",
      )}>
        <StoreDispatchMap initialStores={[]} />
      </div>
    </div>
  );
}
