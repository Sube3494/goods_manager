"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ShoppingBag,
  RotateCcw,
  Maximize,
  Minimize,
  Shield,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toCurrency, getPlatformBadgeMeta } from "@/app/orders/OrderCard";
import { TodayOrdersView } from "@/app/orders/TodayOrdersView";

interface UserOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string | null;
  userEmail?: string | null;
  roleName?: string | null;
}

export function UserOrdersModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
  roleName,
}: UserOrdersModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 顶部看板数据状态（直接由 TodayOrdersView 回调供给，与订单主页面完全对齐）
  const [todaySummary, setTodaySummary] = useState<{
    receivedAmount: number;
    platformCommission: number;
    validOrderCount: number;
    itemCount: number;
    totalDeliveryFee: number;
    realReceivedAmount?: number;
    brushReceivedAmount?: number;
    realPaidAmount?: number;
    brushPaidAmount?: number;
    platformReceived?: Record<string, { amount: number; count: number }>;
    platformDelivery?: Record<string, number>;
    pureProfit: number;
    platformProfit?: Record<string, { amount: number; count: number }>;
  }>({
    receivedAmount: 0,
    platformCommission: 0,
    validOrderCount: 0,
    itemCount: 0,
    totalDeliveryFee: 0,
    pureProfit: 0,
  });

  const [todayOverview, setTodayOverview] = useState<{
    totalCount: number;
    trueOrderCount: number;
    brushCount: number;
    cancelledCount: number;
    platformBreakdown?: {
      truePlatformCounts: Record<string, number>;
      brushPlatformCounts: Record<string, number>;
      cancelledPlatformCounts: Record<string, number>;
    };
  }>({
    totalCount: 0,
    trueOrderCount: 0,
    brushCount: 0,
    cancelledCount: 0,
    platformBreakdown: {
      truePlatformCounts: {},
      brushPlatformCounts: {},
      cancelledPlatformCounts: {},
    },
  });

  const [localShops, setLocalShops] = useState<Array<{ id: string; name: string; address: string }>>([]);

  const handleDataLoad = useCallback((data: {
    summary: typeof todaySummary;
    overview: typeof todayOverview;
  }) => {
    if (data.summary) setTodaySummary(data.summary);
    if (data.overview) setTodayOverview(data.overview);
  }, []);

  useEffect(() => {
    if (!isOpen || !userId) return;
    const fetchShops = async () => {
      try {
        const res = await fetch(`/api/orders/integration/local-shops?userId=${encodeURIComponent(userId)}`);
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.shops)) {
          setLocalShops(data.shops);
        }
      } catch (err) {
        console.warn("Failed to load user shops:", err);
      }
    };
    void fetchShops();
  }, [isOpen, userId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-85000 bg-black/65 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className={`fixed left-1/2 top-1/2 z-85001 -translate-x-1/2 -translate-y-1/2 bg-background border border-border/80 shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen
                ? "w-screen h-dynamic-screen max-w-none max-h-none rounded-none border-none"
                : "w-[calc(100%-20px)] sm:w-[calc(100%-40px)] max-w-6xl max-h-safe-modal rounded-3xl"
            }`}
          >
            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-border/60 shrink-0 bg-muted/25">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <ShoppingBag size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-bold text-foreground truncate">
                      {userName || "成员"} 的今日订单看板
                    </h2>
                    {roleName && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">
                        <Shield size={10} />
                        {roleName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      麦芽田已接入
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                    {userEmail || userId}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  onClick={() => setRefreshTrigger((prev) => prev + 1)}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95"
                  title="刷新数据"
                >
                  <RotateCcw size={15} />
                </button>

                <button
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className="h-9 w-9 rounded-xl border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center active:scale-95 hidden sm:flex"
                  title={isFullscreen ? "退出全屏" : "全屏查看"}
                >
                  {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </button>

                <button
                  onClick={onClose}
                  className="h-9 w-9 rounded-xl bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center active:scale-95"
                  title="关闭"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 弹窗内容区 */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* 今日指标看板：与订单页面顶部 1:1 完全对齐 */}
              <div className="grid items-stretch gap-3 md:grid-cols-2 lg:grid-cols-4">
                {/* 1. 总订单 / 商家实收 合并卡片 */}
                <div className="min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 md:col-span-2 lg:col-span-2">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="shrink-0">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground whitespace-nowrap">总订单</div>
                        <div className="mt-2 text-2xl sm:text-[30px] font-black leading-none tracking-tight text-foreground">{todayOverview.totalCount}</div>
                      </div>
                      <div className="min-w-0 text-right">
                        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">商家实收</div>
                        <div className="mt-2 text-2xl sm:text-[30px] font-black leading-none tracking-tight text-emerald-600 dark:text-emerald-400">{toCurrency(todaySummary.receivedAmount || 0)}</div>
                        <div className="mt-1.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[11px] font-semibold">
                          <span className="whitespace-nowrap text-sky-600 dark:text-sky-400">真实收入 {toCurrency(todaySummary.realReceivedAmount || 0)}</span>
                          {(todaySummary.brushReceivedAmount || 0) > 0 || (todaySummary.brushPaidAmount || 0) > 0 ? (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="whitespace-nowrap text-rose-500">刷单收入 {toCurrency(todaySummary.brushReceivedAmount || 0)} <span className="text-rose-500/80 dark:text-rose-400/80 font-normal">(实付 {toCurrency(todaySummary.brushPaidAmount || 0)})</span></span>
                            </>
                          ) : (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="whitespace-nowrap text-rose-500/60 dark:text-rose-400/60 font-normal">无刷单</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 订单成分比例进度条 */}
                    {todayOverview.totalCount > 0 && (
                      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/6 dark:bg-white/10">
                        {todayOverview.trueOrderCount > 0 && (
                          <div
                            style={{ width: `${(todayOverview.trueOrderCount / todayOverview.totalCount) * 100}%` }}
                            className="bg-sky-500 transition-all duration-500"
                            title={`真单 ${todayOverview.trueOrderCount}单`}
                          />
                        )}
                        {todayOverview.brushCount > 0 && (
                          <div
                            style={{ width: `${(todayOverview.brushCount / todayOverview.totalCount) * 100}%` }}
                            className="bg-rose-500 transition-all duration-500"
                            title={`刷单 ${todayOverview.brushCount}单`}
                          />
                        )}
                        {todayOverview.cancelledCount > 0 && (
                          <div
                            style={{ width: `${(todayOverview.cancelledCount / todayOverview.totalCount) * 100}%` }}
                            className="bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                            title={`取消 ${todayOverview.cancelledCount}单`}
                          />
                        )}
                      </div>
                    )}

                    {/* 三列看板网格：真单 / 刷单 / 取消 */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-5 mt-2 border-t border-black/4 pt-3 dark:border-white/5 text-[10px]">
                      {/* 第一列：真单 */}
                      <div className="flex flex-col gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-2 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent sm:p-0">
                        <div className="flex items-center justify-between rounded-lg bg-sky-500/8 px-1.5 py-0.5 text-sky-700 dark:bg-sky-500/12 dark:text-sky-400 font-medium text-[9px]">
                          <span className="truncate">真单</span>
                          <span className="shrink-0">{todayOverview.trueOrderCount}单</span>
                        </div>
                        <div className="flex flex-col gap-1 px-0.5">
                          {todayOverview.platformBreakdown?.truePlatformCounts && Object.keys(todayOverview.platformBreakdown.truePlatformCounts).length > 0 ? (
                            Object.entries(todayOverview.platformBreakdown.truePlatformCounts)
                              .sort((a, b) => b[1] - a[1])
                              .map(([platform, count]) => {
                              const meta = getPlatformBadgeMeta(platform);
                              return (
                                <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[9px]">
                                  <span className="flex items-center gap-0.5 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3 w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                    <span className="truncate">{platform}</span>
                                  </span>
                                  <span className="shrink-0">{count}单</span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-muted-foreground/30 text-center py-0.5 text-[9px]">-</div>
                          )}
                        </div>
                      </div>

                      {/* 第二列：刷单 */}
                      <div className="flex flex-col gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-2 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent sm:p-0">
                        <div className="flex items-center justify-between rounded-lg bg-rose-500/8 px-1.5 py-0.5 text-rose-700 dark:bg-rose-500/12 dark:text-rose-400 font-medium text-[9px]">
                          <span className="truncate">刷单</span>
                          <span className="shrink-0">{todayOverview.brushCount}单</span>
                        </div>
                        <div className="flex flex-col gap-1 px-0.5">
                          {todayOverview.platformBreakdown?.brushPlatformCounts && Object.keys(todayOverview.platformBreakdown.brushPlatformCounts).length > 0 ? (
                            Object.entries(todayOverview.platformBreakdown.brushPlatformCounts)
                              .sort((a, b) => b[1] - a[1])
                              .map(([platform, count]) => {
                              const meta = getPlatformBadgeMeta(platform);
                              return (
                                <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[9px]">
                                  <span className="flex items-center gap-0.5 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3 w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                    <span className="truncate">{platform}</span>
                                  </span>
                                  <span className="shrink-0">{count}单</span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-muted-foreground/30 text-center py-0.5 text-[9px]">-</div>
                          )}
                        </div>
                      </div>

                      {/* 第三列：取消 */}
                      <div className="flex flex-col gap-1.5 min-w-0 rounded-xl bg-black/1.5 p-2 dark:bg-white/1.5 sm:bg-transparent sm:dark:bg-transparent sm:p-0">
                        <div className="flex items-center justify-between rounded-lg bg-slate-500/8 px-1.5 py-0.5 text-slate-600 dark:bg-slate-500/12 dark:text-slate-400 font-medium text-[9px]">
                          <span className="truncate">取消</span>
                          <span className="shrink-0">{todayOverview.cancelledCount}单</span>
                        </div>
                        <div className="flex flex-col gap-1 px-0.5">
                          {todayOverview.platformBreakdown?.cancelledPlatformCounts && Object.keys(todayOverview.platformBreakdown.cancelledPlatformCounts).length > 0 ? (
                            Object.entries(todayOverview.platformBreakdown.cancelledPlatformCounts)
                              .sort((a, b) => b[1] - a[1])
                              .map(([platform, count]) => {
                              const meta = getPlatformBadgeMeta(platform);
                              return (
                                <div key={platform} className="flex items-center justify-between text-foreground/80 dark:text-white/80 text-[9px]">
                                  <span className="flex items-center gap-0.5 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3 w-3 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                                    <span className="truncate">{platform}</span>
                                  </span>
                                  <span className="shrink-0">{count}单</span>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-muted-foreground/30 text-center py-0.5 text-[9px]">-</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. 平台纯利润分布卡片 */}
                <div className="group min-w-0 h-full rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 text-left shadow-xs transition hover:border-emerald-400/40 hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-300/35 dark:hover:bg-emerald-400/8 flex flex-col gap-2.5">
                  <div className="flex flex-col w-full">
                    <div className="flex items-center justify-between sm:block">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                        <span>纯利润</span>
                        <Store className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                      </div>
                      <div className={cn(
                        "sm:hidden text-[22px] font-bold leading-none tracking-tight",
                        todaySummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {toCurrency(todaySummary.pureProfit || 0)}
                      </div>
                    </div>
                    <div className={cn(
                      "hidden sm:block mt-2 text-[26px] font-bold leading-none tracking-tight",
                      todaySummary.pureProfit < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      {toCurrency(todaySummary.pureProfit || 0)}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      今日各平台纯利润汇总
                    </div>
                  </div>
                  {todaySummary.platformProfit && Object.entries(todaySummary.platformProfit).some(([, info]) => info.amount !== 0) ? (
                    <div className="flex flex-col gap-2 border-t border-black/4 pt-3 dark:border-white/5">
                      {Object.entries(todaySummary.platformProfit)
                        .sort((a, b) => b[1].amount - a[1].amount)
                        .map(([platform, info]) => {
                        if (info.amount === 0) return null;
                        const meta = getPlatformBadgeMeta(platform);
                        return (
                          <div key={platform} className="flex items-center justify-between rounded-xl bg-black/1.5 px-3 py-1.5 dark:bg-white/1.5 text-[11px] text-foreground/80 dark:text-white/80">
                            <span className="flex items-center gap-1.5 min-w-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={meta.iconSrc} alt={meta.iconAlt} className="h-3.5 w-3.5 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              <span className="truncate font-medium">{platform}</span>
                            </span>
                            <span className={cn(
                              "font-bold shrink-0",
                              info.amount < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                            )}>
                              {toCurrency(info.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* 3. 最右侧：总配送费与推广费垂直列 */}
                <div className="h-full flex flex-col gap-3">
                  <div className="flex-1 min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">总配送费</div>
                      <div className="mt-2 text-[26px] font-bold leading-none tracking-tight text-foreground">
                        {toCurrency(todaySummary.totalDeliveryFee || 0)}
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">今日订单汇总</div>
                  </div>

                  <div className="flex-1 min-w-0 rounded-[20px] border border-black/8 bg-white/76 px-4 py-3.5 shadow-xs dark:border-white/10 dark:bg-white/5 flex flex-col justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">推广费</div>
                      <div className="mt-2 text-[26px] font-bold leading-none tracking-tight text-foreground">
                        ¥0.00
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">今日推广费录入</div>
                  </div>
                </div>
              </div>

              {/* 完整的今日订单视图：直接复用 TodayOrdersView */}
              <div className="pt-2">
                <TodayOrdersView
                  userId={userId}
                  refreshTrigger={refreshTrigger}
                  onOpenCostBackfill={() => {}}
                  onOpenMatchEditor={() => {}}
                  onDataLoad={handleDataLoad}
                  localShops={localShops}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

