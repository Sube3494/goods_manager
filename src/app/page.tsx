/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: page.tsx
 * @LastEditTime: 2026-02-08 23:18:39
 * @Description: 
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataOverview } from "@/components/Dashboard/DataOverview";
import { DashboardFeedPanel } from "@/components/Dashboard/DashboardFeedPanel";
import { format } from "date-fns";
import { Shop, StatsData } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { canAccessDashboardPage, getDefaultAuthorizedPath, SessionUser } from "@/lib/permissions";

export default function Home() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const today = new Date();
  const initialEnd = format(today, "yyyy-MM-dd");
  const initialStart = format(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const [rangePreset, setRangePreset] = useState("7d");
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [shopOptions, setShopOptions] = useState<Shop[]>([]);
  const [selectedShopName, setSelectedShopName] = useState("");
  const todayDate = initialEnd;
  const latestStatsRequestRef = useRef(0);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  useEffect(() => {
    if (isUserLoading || !user) return;

    if (!canAccessDashboardPage(user as SessionUser)) {
      router.replace(getDefaultAuthorizedPath(user as SessionUser));
    }
  }, [user, isUserLoading, router]);

  const fetchData = useCallback(async (quiet = false) => {
    if (!user) return; // Don't fetch if not logged in

    const requestId = latestStatsRequestRef.current + 1;
    latestStatsRequestRef.current = requestId;
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
        if (latestStatsRequestRef.current !== requestId) {
          return;
        }
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
        if (latestStatsRequestRef.current !== requestId) {
          return;
        }
        if (!quiet) showToast("同步失败，请重试", "error");
      }
    } catch (error) {
      if (latestStatsRequestRef.current !== requestId) {
        return;
      }
      console.error("Dashboard data fetch failed:", error);
      if (!quiet) showToast("网络请求失败", "error");
    } finally {
      if (latestStatsRequestRef.current === requestId) {
        setIsLoading(false);
      }
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
    if (startDate && startDate > todayDate) {
      setStartDate(todayDate);
      return;
    }
    if (endDate && endDate > todayDate) {
      setEndDate(todayDate);
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDate(startDate);
    }
  }, [endDate, startDate, todayDate]);

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

  if (!canAccessDashboardPage(user as SessionUser)) {
    return null;
  }

  return (
    <div className="relative min-w-0 overflow-x-clip px-2 sm:px-1">
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-5 duration-700 sm:space-y-8">
        <DataOverview
          data={statsData}
          rangePreset={rangePreset}
          onRangePresetChange={setRangePreset}
          selectedShopName={selectedShopName}
          shopOptions={shopOptions}
          onSelectedShopNameChange={setSelectedShopName}
          startDate={startDate}
          endDate={endDate}
          isLoading={isLoading}
          lastSynced={lastSynced}
          onRefresh={() => fetchData(false)}
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
            shopOptions={shopOptions}
            onShopChange={setSelectedShopName}
          />
        </div>
      </div>
    </div>
  );
}
