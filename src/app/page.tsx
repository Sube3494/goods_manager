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
import { DataOverview } from "@/components/Dashboard/DataOverview";
import { DashboardFeedPanel } from "@/components/Dashboard/DashboardFeedPanel";
import { format } from "date-fns";
import { Shop, StatsData } from "@/lib/types";
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
  const [rangePreset, setRangePreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [shopOptions, setShopOptions] = useState<Shop[]>([]);
  const [selectedShopName, setSelectedShopName] = useState("");

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  const fetchData = useCallback(async (quiet = false) => {
    if (!user) return; // Don't fetch if not logged in

    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (rangePreset === "all") {
        query.set("range", "all");
      }
      if (startDate) query.set("startDate", startDate);
      if (endDate) query.set("endDate", endDate);
      if (selectedShopName) query.set("shopName", selectedShopName);
      const res = await fetch(`/api/stats?${query.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
        if (rangePreset === "all") {
          if (data?.rangeStart) setStartDate(data.rangeStart);
          if (data?.rangeEnd) setEndDate(data.rangeEnd);
        }
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
  }, [endDate, rangePreset, selectedShopName, startDate, user, showToast]);

  useEffect(() => {
    if (!user) return;

    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops?source=shipping-addresses", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setShopOptions(Array.isArray(data?.shops) ? data.shops : []);
      } catch (error) {
        console.error("Failed to fetch shop options:", error);
      }
    };

    fetchShops();
  }, [user]);

  useEffect(() => {
    if (!startDate || !endDate) {
      const today = new Date();
      const end = format(today, "yyyy-MM-dd");
      const start = format(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      setStartDate(start);
      setEndDate(end);
      return;
    }
    fetchData(true);
  }, [fetchData, startDate, endDate]);

  useEffect(() => {
    if (rangePreset === "custom") return;
    if (rangePreset === "all") {
      const today = new Date();
      setEndDate(format(today, "yyyy-MM-dd"));
      return;
    }
    const days = rangePreset === "7d" ? 7 : rangePreset === "90d" ? 90 : 30;
    const today = new Date();
    setEndDate(format(today, "yyyy-MM-dd"));
    setStartDate(format(new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  }, [rangePreset]);

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60dvh]">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="relative px-2 sm:px-1">
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-700 sm:space-y-8">
        <section className="overflow-hidden rounded-[24px] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(244,244,245,0.78)_48%,rgba(239,246,255,0.78)_100%)] px-4 py-4 shadow-xs dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03)_48%,rgba(14,165,233,0.05)_100%)] sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center rounded-full border border-black/8 bg-white/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.05]">
                Dashboard
              </div>
              <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">概览</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                经营结果与趋势
              </p>
            </div>

            <button
              onClick={() => fetchData(false)}
              disabled={isLoading}
              className="group relative flex h-11 shrink-0 items-center gap-3 self-start rounded-2xl border border-black/8 bg-white/75 px-4 transition-all hover:border-primary/30 hover:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className={`flex h-6 w-6 items-center justify-center rounded-full ${isLoading ? "bg-primary/20" : "bg-black/5 transition-colors group-hover:bg-primary/15 dark:bg-white/10"}`}>
                <RefreshCw
                  size={13}
                  className={cn(
                    "transition-all duration-700",
                    isLoading ? "animate-spin text-primary" : "text-muted-foreground group-hover:rotate-180 group-hover:text-primary"
                  )}
                />
              </div>

              <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {isLoading ? "同步中..." : "系统同步"}
                </span>
                <span className="mt-1 text-xs font-mono tabular-nums text-foreground/80">
                  {lastSynced && !isLoading ? format(lastSynced, "HH:mm:ss") : "点击刷新"}
                </span>
              </div>
            </button>
          </div>
        </section>

        <DataOverview
          data={statsData}
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          selectedShopName={selectedShopName}
          shopOptions={shopOptions}
          onSelectedShopNameChange={setSelectedShopName}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(value) => {
            setRangePreset("custom");
            setStartDate(value);
          }}
          onEndDateChange={(value) => {
            setRangePreset("custom");
            setEndDate(value);
          }}
        />

        <div className="pb-10">
          <DashboardFeedPanel
            recentInboundItems={statsData?.recentInboundItems || []}
            isLoading={isLoading}
            selectedShopName={selectedShopName}
          />
        </div>
      </div>
    </div>
  );
}
