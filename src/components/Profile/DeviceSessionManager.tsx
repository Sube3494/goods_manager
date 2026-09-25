"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock3, Laptop, Loader2, LogOut, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

type DeviceSession = {
  id: string;
  deviceType: string;
  deviceLabel: string;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
  isOnline: boolean;
};

type PendingRevoke = { kind: "single"; device: DeviceSession } | { kind: "others" } | null;

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile") return <Smartphone size={18} />;
  if (type === "tablet") return <Tablet size={18} />;
  return <Laptop size={18} />;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatIpAddress(value: string) {
  const normalized = value.trim().replace(/^::ffff:/i, "");
  return normalized === "::1" || normalized === "127.0.0.1" ? "本机访问" : normalized;
}

export function DeviceSessionManager() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [maxLoginDevices, setMaxLoginDevices] = useState(2);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<PendingRevoke>(null);

  const loadDevices = useCallback(async (showError = true) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/devices", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "加载登录设备失败");
      setDevices(Array.isArray(data?.devices) ? data.devices : []);
      setMaxLoginDevices(Number(data?.maxLoginDevices) || 2);
    } catch (error) {
      if (showError) showToast(error instanceof Error ? error.message : "加载登录设备失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadDevices(false);
  }, [loadDevices]);

  const revokeDevices = async () => {
    if (!pendingRevoke) return;
    const requestKey = pendingRevoke.kind === "others" ? "others" : pendingRevoke.device.id;
    setRevokingId(requestKey);
    try {
      const response = await fetch("/api/user/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingRevoke.kind === "others"
          ? { allOthers: true }
          : { deviceId: pendingRevoke.device.id }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "退出设备失败");
      showToast(pendingRevoke.kind === "others" ? "其他设备已全部退出" : "设备已退出", "success");
      await loadDevices(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "退出设备失败", "error");
    } finally {
      setRevokingId(null);
      setPendingRevoke(null);
    }
  };

  const otherDeviceCount = devices.filter((device) => !device.isCurrent).length;

  return (
    <div className="rounded-[20px] border border-border/60 bg-white/78 p-4 shadow-sm dark:bg-white/[0.05] sm:rounded-[24px] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-black text-foreground">登录设备</h4>
            <span className="rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
              {devices.length} / {maxLoginDevices} 台
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">管理仍占用登录名额的设备；退出后，该设备下次请求时需要重新登录。</p>
        </div>
        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void loadDevices()}
            disabled={isLoading || Boolean(revokingId)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-white text-muted-foreground transition-all hover:border-primary/30 hover:text-primary disabled:opacity-40 dark:bg-white/5"
            title="刷新设备列表"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => setPendingRevoke({ kind: "others" })}
            disabled={otherDeviceCount === 0 || Boolean(revokingId)}
            className="inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/8 bg-black/[0.025] px-3 text-xs font-black text-red-500 shadow-xs transition-all hover:border-red-500/25 hover:bg-red-500/8 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/[0.045] dark:text-red-400 dark:hover:border-red-400/30 dark:hover:bg-red-400/10 sm:flex-none"
          >
            {revokingId === "others" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            退出其他设备
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        {isLoading && devices.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> 正在加载设备
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">暂无可管理的登录设备</div>
        ) : devices.map((device) => (
          <div key={device.id} className={cn(
            "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3.5 py-3",
            device.isCurrent ? "border-emerald-500/20 bg-emerald-500/[0.06]" : "border-border/55 bg-white/55 dark:bg-white/[0.03]"
          )}>
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              device.isCurrent ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border/60 bg-muted/35 text-muted-foreground"
            )}>
              <DeviceIcon type={device.deviceType} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-xs font-black text-foreground">
                  {device.deviceLabel || "未知设备"}
                </span>
                {device.isCurrent ? <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400">当前设备</span> : null}
                <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold", device.isOnline ? "text-emerald-500" : "text-muted-foreground/60")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", device.isOnline ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  {device.isOnline ? "在线" : "近期未活动"}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] leading-tight text-muted-foreground/65 sm:gap-x-3">
                <span className="inline-flex items-center gap-1"><Clock3 size={10} />最后活动 {formatDate(device.lastSeenAt)}</span>
                {device.ipAddress ? <span>IP {formatIpAddress(device.ipAddress)}</span> : <span>IP 未提供</span>}
                <span>登录于 {formatDate(device.createdAt)}</span>
              </div>
            </div>
            {!device.isCurrent ? (
              <button
                type="button"
                onClick={() => setPendingRevoke({ kind: "single", device })}
                disabled={Boolean(revokingId)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 self-center rounded-xl border border-black/8 bg-white/80 text-xs font-black text-red-500/85 shadow-xs transition-all hover:border-red-500/25 hover:bg-red-500/8 hover:text-red-600 disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.045] dark:text-red-400/90 dark:hover:border-red-400/30 dark:hover:bg-red-400/10 dark:hover:text-red-300 sm:w-auto sm:px-3"
                title={`退出 ${device.deviceLabel || "该设备"}`}
                aria-label={`退出 ${device.deviceLabel || "该设备"}`}
              >
                {revokingId === device.id ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                <span className="hidden sm:inline">退出设备</span>
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={Boolean(pendingRevoke)}
        onClose={() => setPendingRevoke(null)}
        onConfirm={() => void revokeDevices()}
        title={pendingRevoke?.kind === "others" ? "退出其他设备" : "退出这台设备"}
        message={pendingRevoke?.kind === "others"
          ? `将退出除当前设备外的 ${otherDeviceCount} 台设备，是否继续？`
          : `“${pendingRevoke?.device.deviceLabel || "该设备"}”将需要重新登录，是否继续？`}
        confirmLabel="确认退出"
        variant="danger"
        confirmDisabled={Boolean(revokingId)}
      />
    </div>
  );
}
