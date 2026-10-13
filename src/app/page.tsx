/*
 * @Date: 2026-02-07 00:08:33
 * @Author: Sube
 * @FilePath: page.tsx
 * @LastEditTime: 2026-02-08 23:18:39
 * @Description: 
 */
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { DataOverview } from "@/components/Dashboard/DataOverview";
import { DashboardFeedPanel } from "@/components/Dashboard/DashboardFeedPanel";
import { format } from "date-fns";
import { Shop, StatsData } from "@/lib/types";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { canAccessDashboardPage, getDefaultAuthorizedPath, SessionUser } from "@/lib/permissions";
import { dashboardDateRangeKey, presetDashboardDateRange, restoreDashboardDateRange, serializeDashboardDateRange } from "@/lib/dashboardDateRange";

export default function Home() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const today = new Date();
  const initialEnd = format(today, "yyyy-MM-dd");
  const [rangePreset, setRangePreset] = useState("all");
  const [startDate, setStartDate] = useState(initialEnd);
  const [endDate, setEndDate] = useState(initialEnd);
  const [shopOptions, setShopOptions] = useState<Shop[]>([]);
  const [selectedShopName, setSelectedShopName] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const todayDate = initialEnd;
  const latestStatsRequestRef = useRef(0);
  const [datePreferenceUserId, setDatePreferenceUserId] = useState<string | null>(null);
  const userId = user?.id;
  const requestStartDate = rangePreset === "all" ? "" : startDate;
  const requestEndDate = rangePreset === "all" ? todayDate : endDate;

  useEffect(() => {
    latestStatsRequestRef.current += 1;
    if (!userId) {
      setDatePreferenceUserId(null);
      return;
    }
    let saved: string | null = null;
    try { saved = localStorage.getItem(dashboardDateRangeKey(userId)); } catch { /* Storage may be disabled. */ }
    const range = restoreDashboardDateRange(saved, format(new Date(), "yyyy-MM-dd"));
    setRangePreset(range.rangePreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setDatePreferenceUserId(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || datePreferenceUserId !== userId) return;
    try {
      localStorage.setItem(dashboardDateRangeKey(userId), serializeDashboardDateRange({ rangePreset, startDate, endDate }));
    } catch { /* The date picker still works when storage is unavailable. */ }
  }, [userId, datePreferenceUserId, rangePreset, startDate, endDate]);

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
    if (!user || datePreferenceUserId !== user.id) return;

    const requestId = latestStatsRequestRef.current + 1;
    latestStatsRequestRef.current = requestId;
    setIsLoading(true);
    try {
      const query = new URLSearchParams();
      if (rangePreset === "all") {
        query.set("range", "all");
      }
      if (requestStartDate) query.set("startDate", requestStartDate);
      if (requestEndDate) query.set("endDate", requestEndDate);
      if (selectedShopName) query.set("shopName", selectedShopName);
      if (selectedPlatform) query.set("platform", selectedPlatform);
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
  }, [requestEndDate, rangePreset, selectedPlatform, selectedShopName, requestStartDate, user, showToast, datePreferenceUserId]);

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
    if (!userId || datePreferenceUserId !== userId) return;
    fetchData(true);
  }, [fetchData, userId, datePreferenceUserId]);

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

  const handleRangePresetChange = useCallback((preset: string) => {
    const range = presetDashboardDateRange(preset, format(new Date(), "yyyy-MM-dd"));
    setRangePreset(range.rangePreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  }, []);

  const handleDateRangeChange = useCallback(({ startDate: nextStart, endDate: nextEnd }: { startDate: string; endDate: string }) => {
    if (!nextStart || !nextEnd) {
      handleRangePresetChange("all");
      return;
    }
    setRangePreset("custom");
    setStartDate(nextStart);
    setEndDate(nextEnd);
  }, [handleRangePresetChange]);

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
          onRangePresetChange={handleRangePresetChange}
          selectedPlatform={selectedPlatform}
          onSelectedPlatformChange={setSelectedPlatform}
          selectedShopName={selectedShopName}
          shopOptions={shopOptions}
          onSelectedShopNameChange={setSelectedShopName}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={handleDateRangeChange}
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
