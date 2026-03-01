/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: page.tsx
 * @LastEditTime: 2026-02-08 23:18:39
 * @Description: 
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsGrid } from "@/components/Dashboard/StatsGrid";
import { RecentInbound } from "@/components/Dashboard/RecentInbound";
import { QuickActions } from "@/components/Dashboard/QuickActions";
import { TopOutboundProducts } from "@/components/Dashboard/TopOutboundProducts";
import { PageGuard } from "@/components/layout/PageGuard";
import { format } from "date-fns";
import { StatsData } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export default function Home() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  const fetchData = useCallback(async (quiet = false) => {
    if (!user) return; // Don't fetch if not logged in
    
    setIsLoading(true);
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
        setLastSynced(new Date());
        if (!quiet) {
          showToast("系统同步完成", "success");
        }
      } else {
        if (!quiet) showToast("同步失败，请重试", "error");
      }
    } catch (error) {
      console.error("Dashboard data fetch failed:", error);
      if (!quiet) showToast("网络请求失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <PageGuard>
      <div className="relative px-3 sm:px-1">
        <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Header */}
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-8">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">
                概览
              </h1>
              <p className="text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
                实时监控仓库状态与资产总值
              </p>
            </div>
            
            <button 
              onClick={() => fetchData(false)}
              disabled={isLoading}
              className="group relative flex items-center gap-3 h-11 px-5 rounded-2xl bg-black/3 dark:bg-white/5 border border-black/8 dark:border-white/10 hover:bg-black/6 dark:hover:bg-white/10 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs dark:shadow-none"
            >
               <div className={`flex items-center justify-center h-5 w-5 rounded-full ${isLoading ? "bg-primary/20" : "bg-black/5 dark:bg-white/10 group-hover:bg-primary/20"} transition-colors`}>
                 <RefreshCw size={12} className={cn(
                   "transition-all duration-700",
                   isLoading ? "animate-spin text-primary" : "text-muted-foreground group-hover:text-primary group-hover:rotate-180"
                 )} />
               </div>
               
               <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                    {isLoading ? "同步中..." : "系统同步"}
                  </span>
                  {lastSynced && !isLoading ? (
                    <span className="text-xs font-mono text-foreground/80 mt-1 tabular-nums">
                      {format(lastSynced, "HH:mm:ss")}
                    </span>
                  ) : (
                    <span className="text-xs text-foreground/40 mt-1">
                      点击手动刷新
                    </span>
                  )}
               </div>

               <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Stats Area */}
          <div className="relative">
            <StatsGrid data={statsData} />
          </div>

          {/* Quick Actions */}
          <div className="relative group">
             <QuickActions />
          </div>

          {/* Main Content Grid (1:1 Layout) */}
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-2 items-stretch pb-10">
             <div className="w-full flex min-w-0">
                <RecentInbound items={statsData?.recentInboundItems || []} isLoading={isLoading} />
             </div>
             <div className="w-full flex min-w-0">
                <TopOutboundProducts />
             </div>
          </div>
        </div>
      </div>
    </PageGuard>
  );
}
