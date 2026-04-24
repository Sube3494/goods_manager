"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { CheckCheck, Loader2, MapPin, Package2, RefreshCw, Search, Settings2, Timer, Truck, X, Clock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { AutoPickIntegrationConfig, AutoPickOrder } from "@/lib/types";
import { formatLocalDateTime } from "@/lib/dateUtils";

type OrderResponse = {
  items: AutoPickOrder[];
  meta: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filters: {
    platforms: string[];
    statuses: string[];
  };
};


function toCurrency(value: number | null | undefined) {
  const amount = Number(value || 0) / 100;
  return `¥${amount.toFixed(2)}`;
}

function getDisplayStatus(status?: string | null) {
  const text = String(status || "").trim();
  if (!text) return "同步中";
  if (text.includes("已完成")) return "已完成";
  if (text.includes("配送中")) return "配送中";
  if (text.includes("已拣货") || text.includes("拣货中")) return "已拣货";
  return text.split(/[,，]/)[0].trim() || "同步中";
}

export default function OrdersPage() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<AutoPickOrder[]>([]);
  const [integrationConfig, setIntegrationConfig] = useState<AutoPickIntegrationConfig>({
    pluginBaseUrl: "",
    inboundApiKey: "",
  });
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [isSavingIntegration, setIsSavingIntegration] = useState(false);
  const [isTestingIntegration, setIsTestingIntegration] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [meta, setMeta] = useState<OrderResponse["meta"]>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [hasDelivery, setHasDelivery] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState("");
  const integrationPanelRef = useRef<HTMLDivElement | null>(null);
  const integrationModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCallbackUrl(`${window.location.origin}/api/v1/api-key/listened-orders`);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isIntegrationOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = integrationPanelRef.current?.contains(target);
      const clickedModal = integrationModalRef.current?.contains(target);

      if (!clickedTrigger && !clickedModal) {
        setIsIntegrationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIntegrationOpen]);

  const fetchIntegrationConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/orders/integration", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "加载对接配置失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
      });
    } catch (error) {
      console.error("Failed to fetch order integration config:", error);
      showToast(error instanceof Error ? error.message : "加载对接配置失败", "error");
    }
  }, [showToast]);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      });

      if (query.trim()) params.set("query", query.trim());
      if (platform !== "all") params.set("platform", platform);
      if (status !== "all") params.set("status", status);
      if (hasDelivery !== "all") params.set("hasDelivery", String(hasDelivery === "true"));
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await fetch(`/api/orders?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "加载订单失败");
      }

      setOrders(Array.isArray(data.items) ? data.items : []);
      setMeta(data.meta);
      setPlatforms(Array.isArray(data.filters?.platforms) ? data.filters.platforms : []);
      setStatuses(Array.isArray(data.filters?.statuses) ? data.filters.statuses : []);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      showToast(error instanceof Error ? error.message : "加载订单失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, endDate, hasDelivery, pageSize, platform, query, showToast, startDate, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchIntegrationConfig();
  }, [fetchIntegrationConfig]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, platform, status, hasDelivery, startDate, endDate]);

  const platformOptions = [
    { value: "all", label: "全部平台" },
    ...platforms.map((item) => ({ value: item, label: item })),
  ];

  const simplifyStatus = (s: string) => {
    if (!s) return "未知状态";
    // 提取核心状态：取逗号或空格前的部分，移除“期望送达”等冗余时间信息
    return s.split(/[,，\s]/)[0].trim();
  };

  const statusOptions = [
    { value: "all", label: "全部状态" },
    ...Array.from(new Set(statuses.map(simplifyStatus)))
      .filter(Boolean)
      .map((label) => {
        // 找到第一个匹配该简写标签的原始值作为过滤值
        const originalValue = statuses.find(s => simplifyStatus(s) === label) || label;
        return { value: originalValue, label };
      }),
  ];

  const deliveryOptions = [
    { value: "all", label: "全部配送" },
    { value: "true", label: "已有配送信息" },
    { value: "false", label: "缺少配送信息" },
  ];

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const tickAutoComplete = useCallback(async () => {
    try {
      await fetch("/api/orders/tick-auto-complete", { method: "POST" });
    } catch {
      // 静默失败，不打扰用户
    }
  }, []);

  // 每 60 秒自动 tick 一次，处理到期的自动完成配送
  useEffect(() => {
    const id = setInterval(() => {
      tickAutoComplete().then(() => fetchOrders());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [tickAutoComplete, fetchOrders]);

  const runAction = async (orderId: string, action: "self-delivery" | "complete-delivery" | "sync") => {
    setActingId(`${orderId}:${action}`);
    try {
      const response = await fetch(`/api/orders/${orderId}/${action}`, {
        method: "POST",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || data?.reason || "操作失败");
      }

      const successMessage = action === "self-delivery"
        ? "已发起自配送"
        : action === "complete-delivery"
          ? "已发送完成配送指令"
          : "已同步最新订单状态";

      showToast(successMessage, "success");
      fetchOrders();
    } catch (error) {
      console.error("Order action failed:", error);
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setActingId("");
    }
  };

  const resetFilters = () => {
    setQuery("");
    setPlatform("all");
    setStatus("all");
    setHasDelivery("all");
    setStartDate("");
    setEndDate("");
  };

  const hasActiveFilters = Boolean(
    query.trim() || startDate || endDate || platform !== "all" || status !== "all" || hasDelivery !== "all"
  );

  const saveIntegrationConfig = async () => {
    setIsSavingIntegration(true);
    try {
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationConfig),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "保存对接配置失败");
      }

      setIntegrationConfig({
        pluginBaseUrl: String(data.pluginBaseUrl || ""),
        inboundApiKey: String(data.inboundApiKey || ""),
      });
      showToast("自动推单对接配置已保存", "success");
    } catch (error) {
      console.error("Failed to save order integration config:", error);
      showToast(error instanceof Error ? error.message : "保存对接配置失败", "error");
    } finally {
      setIsSavingIntegration(false);
    }
  };

  const testIntegrationConfig = async () => {
    setIsTestingIntegration(true);
    try {
      const response = await fetch("/api/orders/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationConfig),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "连通性测试失败");
      }

      showToast(data.ok ? "连通性测试通过" : "连通性测试未完全通过", data.ok ? "success" : "error");
    } catch (error) {
      console.error("Failed to test order integration config:", error);
      showToast(error instanceof Error ? error.message : "连通性测试失败", "error");
    } finally {
      setIsTestingIntegration(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Section */}
      <header className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
              <Package2 size={24} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">订单管理</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span>智能推单中心</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  实时同步中
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsIntegrationOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-bold text-foreground transition-all hover:bg-muted"
          >
            <Settings2 size={18} />
            对接配置
          </button>
        </div>
      </header>

      {/* Filter Section */}
      <section className="rounded-[32px] border border-border/50 bg-white/50 p-6 shadow-sm backdrop-blur-xl dark:bg-white/2">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2 lg:col-span-2">
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-border/50 bg-background/50 px-4 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/5 transition-all">
              <Search size={18} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索订单、地址、商品..."
                className="w-full bg-transparent text-sm font-medium outline-none"
              />
            </label>
          </div>
          <CustomSelect
            value={platform}
            onChange={setPlatform}
            options={platformOptions}
            triggerClassName="h-12 rounded-2xl border-border/50 bg-background/50 px-4 text-sm font-bold"
          />
          <CustomSelect
            value={status}
            onChange={setStatus}
            options={statusOptions}
            triggerClassName="h-12 rounded-2xl border-border/50 bg-background/50 px-4 text-sm font-bold"
          />
          <CustomSelect
            value={hasDelivery}
            onChange={setHasDelivery}
            options={deliveryOptions}
            triggerClassName="h-12 rounded-2xl border-border/50 bg-background/50 px-4 text-sm font-bold"
          />
          <div className="flex gap-2">
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="开始"
              triggerClassName="h-12 flex-1 rounded-2xl border-border/50 bg-background/50 px-3 text-xs font-bold"
            />
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main List Section */}
      <main className="space-y-4">
        {/* Desktop Headings */}
        <div className="hidden px-8 py-2 md:grid md:grid-cols-[2fr_1.5fr_2fr_1fr_1.5fr] md:gap-6">
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">订单 & 平台</span>
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">状态 & 时间</span>
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">收货信息</span>
          <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">实付金额</span>
          <span className="text-right text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">快捷操作</span>
        </div>

        <div className="grid gap-4">
          {orders.map((order) => {
            const expanded = expandedIds.includes(order.id);
            const delivery = order.delivery;
            const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const isMeituan = order.platform?.toLowerCase().includes("美团");

            return (
              <div
                key={order.id}
                className="group relative overflow-hidden rounded-[32px] border border-border/50 bg-white/50 transition-all hover:border-primary/30 hover:bg-white dark:bg-white/2 dark:hover:bg-white/4"
              >
                {/* Main Content Row */}
                <div
                  className="cursor-pointer px-6 py-6 md:grid md:grid-cols-[2fr_1.5fr_2fr_1fr_1.5fr] md:items-center md:gap-6 md:px-8"
                  onClick={() => toggleExpanded(order.id)}
                >
                  {/* Column 1: Order Info */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-black ${isMeituan ? "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500" : "bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500"}`}>
                      {order.platform?.substring(0, 1) || "订"}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black uppercase text-muted-foreground/80 tracking-wider">{order.platform}</span>
                        <span className="h-1 w-1 rounded-full bg-border" />
                        <span className="font-mono text-xs font-bold text-primary">#{order.dailyPlatformSequence || 0}</span>
                      </div>
                      <h3 className="truncate font-mono text-sm font-black tracking-tight text-foreground">
                        {order.orderNo}
                      </h3>
                      <p className="text-[11px] font-bold text-muted-foreground/50 uppercase">ID: {order.sourceId}</p>
                    </div>
                  </div>

                  {/* Column 2: Status & Time */}
                  <div className="hidden md:block">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                      <span className="text-[13px] font-black text-foreground line-clamp-1">{getDisplayStatus(order.status)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <Clock size={12} />
                      {formatLocalDateTime(order.orderTime)}
                    </div>
                  </div>

                  {/* Column 3: Address */}
                  <div className="hidden md:block min-w-0">
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="mt-1 shrink-0 text-primary/60" />
                      <p className="line-clamp-2 text-sm font-bold leading-relaxed text-foreground">
                        {order.userAddress}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="rounded-lg bg-muted/50 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                        {order.distanceKm != null ? `${order.distanceKm.toFixed(2)} km` : "-"}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground/40">{order.distanceIsLinear ? "直线" : "路面"}</span>
                    </div>
                  </div>

                  {/* Column 4: Amount */}
                  <div className="hidden md:block">
                    <div className="text-lg font-black text-foreground">{toCurrency(order.actualPaid)}</div>
                    <p className="mt-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{itemCount} 个商品</p>
                  </div>

                  {/* Column 5: Actions */}
                  <div className="flex flex-col items-end gap-2 md:mt-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => runAction(order.id, "sync")}
                        disabled={actingId !== ""}
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background px-3 text-[11px] font-black text-foreground transition-all hover:bg-muted disabled:opacity-50 xl:h-10 xl:px-4 xl:text-xs"
                        title="同步当前订单状态"
                      >
                        {actingId === `${order.id}:sync` ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        <span className="hidden xl:inline">同步状态</span>
                      </button>
                      <button
                        onClick={() => runAction(order.id, "self-delivery")}
                        disabled={actingId !== ""}
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background px-3 text-[11px] font-black text-foreground transition-all hover:bg-foreground hover:text-background disabled:opacity-50 xl:h-10 xl:px-4 xl:text-xs"
                      >
                        {actingId === `${order.id}:self-delivery` ? <Loader2 size={13} className="animate-spin" /> : <Truck size={14} />}
                        <span className="hidden xl:inline">自配送</span>
                      </button>
                      <button
                        onClick={() => runAction(order.id, "complete-delivery")}
                        disabled={actingId !== ""}
                        className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-500 px-3 text-[11px] font-black text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 hover:shadow-emerald-500/40 disabled:opacity-50 xl:h-10 xl:px-4 xl:text-xs"
                      >
                        {actingId === `${order.id}:complete-delivery` ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={14} />}
                        <span className="hidden xl:inline">完成配送</span>
                      </button>
                    </div>
                    {order.autoCompleteAt && (
                      <div className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-600 dark:text-amber-400">
                        <Timer size={10} />
                        <span>系统预计自动完成 {formatLocalDateTime(order.autoCompleteAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile Extra Info Row */}
                <div className="flex items-center justify-between border-t border-border/30 bg-muted/5 px-6 py-3 md:hidden">
                  <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {getDisplayStatus(order.status)}
                  </div>
                  <div className="text-sm font-black text-foreground">{toCurrency(order.actualPaid)}</div>
                </div>

                {/* Expanded Section */}
                {expanded && (
                  <div className="border-t border-border/40 bg-muted/10 p-6 md:p-8">
                    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
                      {/* Products List */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                          <Package2 size={16} className="text-muted-foreground" />
                          <h4 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/80">商品清单</h4>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-4 rounded-2xl border border-border/50 bg-background p-3 transition-transform hover:scale-[1.01]">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                                {item.thumb ? (
                                  <Image src={item.thumb} alt={item.productName} width={56} height={56} className="h-full w-full object-cover" unoptimized />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/20">
                                    <Package2 size={20} />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-black text-foreground">{item.productName}</p>
                                <div className="mt-1 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
                                  <span>x{item.quantity}</span>
                                  <span className="h-1 w-1 rounded-full bg-border" />
                                  <span className="truncate">{item.productNo || "-"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Delivery & Metadata Sidebar */}
                      <div className="space-y-6">
                        <div className="rounded-[24px] border border-border/50 bg-background p-5 shadow-sm">
                          <h4 className="mb-4 text-[11px] font-black uppercase tracking-widest text-muted-foreground/80">物流与轨迹</h4>
                          <div className="space-y-3.5">
                            <InfoRow label="服务平台" value={delivery?.logisticName || "第三方平台"} />
                            <InfoRow label="物流单号" value={order.logisticId || "-"} />
                            <InfoRow label="骑手姓名" value={delivery?.riderName || "-"} />
                            <InfoRow label="实时轨迹" value={delivery?.track || "暂无更新"} />
                          </div>
                        </div>

                        <div className="rounded-[24px] border border-border/50 bg-background p-5 shadow-sm">
                          <h4 className="mb-4 text-[11px] font-black uppercase tracking-widest text-muted-foreground/80">系统数据</h4>
                          <div className="space-y-3.5">
                            <InfoRow label="佣金收入" value={toCurrency(order.platformCommission)} />
                            <InfoRow label="地理坐标" value={order.longitude && order.latitude ? `${order.longitude}, ${order.latitude}` : "-"} />
                            <InfoRow label="同步周期" value={order.lastSyncedAt ? formatLocalDateTime(order.lastSyncedAt) : "-"} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {!isLoading && orders.length === 0 && (
          <div className="py-32">
            <EmptyState
              icon={<Package2 size={64} strokeWidth={1} className="text-muted-foreground/20" />}
              title="待处理订单库为空"
              description="连接 auto-pick 插件后，最新的订单将自动同步至此。请检查配置信息。"
            />
          </div>
        )}
      </main>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={meta.totalPages}
        totalItems={meta.total}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

      {/* Integration Modal */}
      {isMounted && isIntegrationOpen && createPortal(
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setIsIntegrationOpen(false)} />
          <div
            ref={integrationModalRef}
            className="relative w-full max-w-lg overflow-hidden rounded-[40px] border border-border bg-background p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-black text-foreground">对接配置</h2>
                <p className="mt-2 text-sm font-bold text-muted-foreground">设置 auto-pick 插件的通讯参数。</p>
              </div>
              <button
                onClick={() => setIsIntegrationOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-muted"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">插件服务地址</label>
                <input
                  value={integrationConfig.pluginBaseUrl}
                  onChange={(e) => setIntegrationConfig(prev => ({ ...prev, pluginBaseUrl: e.target.value }))}
                  placeholder="http://127.0.0.1:22800"
                  className="h-12 w-full rounded-2xl border border-border bg-muted/30 px-4 text-sm font-bold outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">API 对接密钥</label>
                <input
                  value={integrationConfig.inboundApiKey}
                  onChange={(e) => setIntegrationConfig(prev => ({ ...prev, inboundApiKey: e.target.value }))}
                  placeholder="Enter your security key"
                  className="h-12 w-full rounded-2xl border border-border bg-muted/30 px-4 text-sm font-bold outline-none focus:border-primary"
                />
              </div>

              <div className="rounded-3xl border border-border bg-muted/20 p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-foreground">回调端点 (URL)</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(callbackUrl);
                      showToast("地址已复制", "success");
                    }}
                    className="text-[11px] font-black text-primary hover:underline"
                  >
                    点击复制
                  </button>
                </div>
                <code className="block break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {callbackUrl}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={testIntegrationConfig}
                  disabled={isTestingIntegration}
                  className="h-12 rounded-2xl border border-border font-bold hover:bg-muted disabled:opacity-50"
                >
                  {isTestingIntegration ? "测试中..." : "测试连接"}
                </button>
                <button
                  onClick={saveIntegrationConfig}
                  disabled={isSavingIntegration}
                  className="h-12 rounded-2xl bg-foreground text-background font-bold hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {isSavingIntegration ? "保存中..." : "保存配置"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">{label}</span>
      <span className="text-right text-[12px] font-bold text-foreground">{value}</span>
    </div>
  );
}
