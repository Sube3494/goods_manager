/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: page.tsx
 * @LastEditTime: 2026-02-08 23:18:39
 * @Description: 
 */
"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { StatsGrid } from "@/components/Dashboard/StatsGrid";
import { RecentInbound } from "@/components/Dashboard/RecentInbound";
import { QuickActions } from "@/components/Dashboard/QuickActions";
import { format } from "date-fns";
import { StatsData } from "@/lib/types";


export default function Home() {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/stats', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
        setLastSynced(new Date());
      }
    } catch (error) {
      console.error("Dashboard data fetch failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/60">
            库存概览
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            实时监控仓库状态与资产总值。
          </p>
        </div>
        
        <button 
          onClick={fetchData}
          disabled={isLoading}
          className="group relative overflow-hidden h-9 px-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
           <div className={`transition-transform duration-700 ${isLoading ? "animate-spin" : "group-hover:rotate-180"}`}>
             <RefreshCw size={14} className={isLoading ? "text-primary" : "text-muted-foreground group-hover:text-foreground"} />
           </div>
           
           <div className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
             {isLoading ? (
               <span className="text-muted-foreground">数据同步中...</span>
             ) : lastSynced ? (
               <>
                 <span className="text-muted-foreground/70">已同步</span>
                 <span className="font-mono text-foreground/90 tabular-nums tracking-tight">
                    {format(lastSynced, "HH:mm:ss")}
                 </span>
               </>
             ) : (
               <span className="text-muted-foreground group-hover:text-foreground transition-colors">点击同步数据</span>
             )}
           </div>
           
           {!isLoading && lastSynced && (
              <span className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
           )}
        </button>
      </div>

      {/* Stats Area */}
      <StatsGrid data={statsData} />

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-3 h-full items-stretch pb-10">
        <div className="md:col-span-2 h-full">
            <RecentInbound items={statsData?.recentInboundItems || []} isLoading={isLoading} />
        </div>
        <div className="h-full">
           <QuickActions />
        </div>
      </div>
    </div>
  );
}
