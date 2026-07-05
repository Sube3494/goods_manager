"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Battery, ChevronDown, Copy, Cpu, DoorOpen, Fingerprint, Layers, Loader2, LockKeyhole, ShieldCheck, Timer, Wifi, WifiOff, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { hasPermission, type SessionUser } from "@/lib/permissions";
import type {
  TTLockIntegrationConfigPublic,
  TTLockLockDetail,
  TTLockLockSummary,
  TTLockRegion,
} from "@/lib/types";

type ConfigForm = {
  region: TTLockRegion;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  defaultLockId: string;
};

type LocksResponse = {
  locks: TTLockLockSummary[];
  config: TTLockIntegrationConfigPublic;
};

function getDefaultForm(): ConfigForm {
  return {
    region: "cn",
    clientId: "",
    clientSecret: "",
    username: "",
    password: "",
    defaultLockId: "",
  };
}

function toForm(config: TTLockIntegrationConfigPublic): ConfigForm {
  return {
    region: config.region,
    clientId: config.clientId || "",
    clientSecret: config.clientSecret || "",
    username: config.username || "",
    password: "",
    defaultLockId: config.defaultLockId ? String(config.defaultLockId) : "",
  };
}

function formatTime(value?: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatBattery(value?: number | null) {
  if (!Number.isFinite(Number(value))) return "--";
  return `${Number(value)}%`;
}

function getGatewayLabel(value?: boolean | null) {
  if (value === true) return "已连接";
  if (value === false) return "未连接";
  return "未知";
}

function testBitFromHex(hexStr: string | null | undefined, bitIndex: number): boolean {
  if (!hexStr) return false;
  try {
    const bigNum = BigInt(`0x${hexStr}`);
    const mask = BigInt(1) << BigInt(bitIndex);
    return (bigNum & mask) !== BigInt(0);
  } catch (error) {
    return false;
  }
}

function getLockConnectionStatus(lock?: { featureValue?: string | null; hasGateway?: boolean | null; isOnline?: boolean | null } | null) {
  if (!lock) {
    return {
      type: "未知",
      online: false,
      label: "未知",
      colorClass: "text-muted-foreground"
    };
  }
  const isWifiSupported = testBitFromHex(lock.featureValue, 56);
  if (isWifiSupported) {
    const isOnline = !!lock.hasGateway || lock.isOnline === true;
    return {
      type: "WiFi锁",
      online: isOnline,
      label: isOnline ? "WiFi在线" : "WiFi离线",
      colorClass: isOnline 
        ? "text-emerald-600 dark:text-emerald-400 font-medium" 
        : "text-muted-foreground"
    };
  } else {
    const isOnline = !!lock.hasGateway || lock.isOnline === true;
    return {
      type: lock.hasGateway ? "网关锁" : "蓝牙锁",
      online: isOnline,
      label: lock.hasGateway ? "网关在线" : "蓝牙",
      colorClass: lock.hasGateway 
        ? "text-emerald-600 dark:text-emerald-400 font-medium" 
        : "text-muted-foreground"
    };
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {children}
    </label>
  );
}

export default function DoorLocksPage() {
  const { user, isLoading: userLoading } = useUser();
  const { showToast } = useToast();
  const canManage = hasPermission(user as SessionUser | null, "settings:manage");
  const hasAutoLoadedLocksRef = useRef(false);

  const [config, setConfig] = useState<TTLockIntegrationConfigPublic | null>(null);
  const [form, setForm] = useState<ConfigForm>(getDefaultForm);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingLocks, setIsLoadingLocks] = useState(false);
  const [locks, setLocks] = useState<TTLockLockSummary[]>([]);
  const [lockAliasFilter, setLockAliasFilter] = useState("");
  const [selectedLockId, setSelectedLockId] = useState<number | null>(null);
  const [lockDetail, setLockDetail] = useState<TTLockLockDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const hasSystemCredentials = Boolean(config?.usesSystemCredentials);
  const [qrPreviewLock, setQrPreviewLock] = useState<TTLockLockSummary | null>(null);

  const getScanUnlockUrl = useCallback((lock: Pick<TTLockLockSummary, "lockId" | "scanUnlockToken">) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/door-locks/scan-unlock?lockId=${lock.lockId}&token=${lock.scanUnlockToken || ""}`;
  }, []);

  const syncConfig = useCallback((next: TTLockIntegrationConfigPublic) => {
    setConfig(next);
    setForm((current) => ({
      ...current,
      ...toForm(next),
      password: "",
    }));
    setIsEditingPassword(false);
  }, []);

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    try {
      const response = await fetch("/api/ttlock/config", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "加载 TTLock 配置失败");
      }
      syncConfig(data as TTLockIntegrationConfigPublic);
    } catch (error) {
      console.error("Failed to load TTLock config:", error);
      showToast(error instanceof Error ? error.message : "加载 TTLock 配置失败", "error");
    } finally {
      setIsLoadingConfig(false);
    }
  }, [showToast]);

  const loadLockDetail = useCallback(async (lockId: number) => {
    setIsLoadingDetail(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, { cache: "no-store" });
      const data = await response.json() as { lock?: TTLockLockDetail; error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "加载门锁详情失败");
      }
      const fetchedLock = data.lock;
      setSelectedLockId(lockId);
      setLockDetail(fetchedLock || null);
    } catch (error) {
      console.error("Failed to load TTLock lock detail:", error);
      showToast(error instanceof Error ? error.message : "加载门锁详情失败", "error");
    } finally {
      setIsLoadingDetail(false);
    }
  }, [showToast]);

  const loadLocks = useCallback(async (lockIdToKeep?: number | null) => {
    setIsLoadingLocks(true);
    try {
      const query = lockAliasFilter.trim()
        ? `?lockAlias=${encodeURIComponent(lockAliasFilter.trim())}`
        : "";
      const response = await fetch(`/api/ttlock/locks${query}`, { cache: "no-store" });
      const data = await response.json() as LocksResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "加载门锁列表失败");
      }

      setLocks(Array.isArray(data.locks) ? data.locks : []);
      syncConfig(data.config);

      const nextSelected = lockIdToKeep
        || selectedLockId
        || data.config.defaultLockId
        || data.locks?.[0]?.lockId
        || null;

      setSelectedLockId(nextSelected);
      if (nextSelected) {
        void loadLockDetail(nextSelected);
      } else {
        setLockDetail(null);
      }
    } catch (error) {
      console.error("Failed to load TTLock locks:", error);
      showToast(error instanceof Error ? error.message : "加载门锁列表失败", "error");
    } finally {
      setIsLoadingLocks(false);
    }
  }, [loadLockDetail, lockAliasFilter, selectedLockId, showToast, syncConfig]);

  useEffect(() => {
    if (!canManage) {
      setIsLoadingConfig(false);
      return;
    }
    void loadConfig();
  }, [canManage, loadConfig]);

  useEffect(() => {
    if (!canManage || isLoadingConfig || !config?.linked || hasAutoLoadedLocksRef.current) {
      return;
    }
    hasAutoLoadedLocksRef.current = true;
    void loadLocks(config.defaultLockId || null);
  }, [canManage, config?.defaultLockId, config?.linked, isLoadingConfig, loadLocks]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // 登录前先保存当前输入的配置
      const saveResponse = await fetch("/api/ttlock/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: form.region,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          username: form.username,
          password: form.password,
          defaultLockId: Number(form.defaultLockId || 0) || null,
        }),
      });
      const saveData = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saveData?.error || "保存 TTLock 配置失败");
      }
      syncConfig(saveData as TTLockIntegrationConfigPublic);

      // 发起登录获取 token
      const response = await fetch("/api/ttlock/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "authorize" }),
      });
      const data = await response.json() as { config?: TTLockIntegrationConfigPublic; error?: string };
      if (!response.ok || !data.config) {
        throw new Error(data?.error || "TTLock 登录失败");
      }
      syncConfig(data.config);
      showToast("TTLock 登录成功并获取门锁", "success");
      await loadLocks(data.config.defaultLockId || selectedLockId);
    } catch (error) {
      console.error("Failed to connect TTLock:", error);
      showToast(error instanceof Error ? error.message : "TTLock 登录失败", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUnlock = async (lockId: number) => {
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}/unlock`, {
        method: "POST",
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "远程开锁失败");
      }
      showToast("远程开锁指令已发送", "success");
      await loadLockDetail(lockId);
    } catch (error) {
      console.error("Failed to unlock TTLock lock:", error);
      showToast(error instanceof Error ? error.message : "远程开锁失败", "error");
    } finally {
      setIsUnlocking(false);
    }
  };

  const passwordDisplayValue = isEditingPassword
    ? form.password
    : form.password || (config?.hasPassword ? "********" : "");

  if (userLoading || isLoadingConfig) {
    return (
      <div className="flex h-[60dvh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 size={18} className="mr-2 animate-spin" />
        读取门锁配置中...
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-black text-foreground">当前账号没有门锁管理权限</div>
          <div className="mt-2 text-sm text-muted-foreground">需要系统设置权限后才能配置 TTLock 与执行远程开锁。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pb-10 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
      {/* 门锁管理头部和基础状态 */}
      <section className="overflow-hidden rounded-[28px] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0.62))] p-4 sm:p-6 shadow-sm dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
        <div className="flex flex-col gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-muted-foreground">
              <ShieldCheck size={12} />
              TTLOCK
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-foreground">门锁管理</h1>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-4 text-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">授权状态</div>
              <div className="mt-2 text-2xl font-black text-foreground">{config?.linked ? "已连接" : "未连接"}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/75 px-4 py-4 text-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">门锁数量</div>
              <div className="mt-2 text-2xl font-black text-foreground">{locks.length}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 账号配置 */}
      <section className="rounded-[28px] border border-border/60 bg-white/75 p-4 sm:p-6 shadow-sm dark:bg-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2">
          <h2 className="text-xl font-black tracking-tight text-foreground">账号配置</h2>
          <button
            type="button"
            onClick={() => {
              if (isConnecting || !hasSystemCredentials) return;
              void handleConnect();
            }}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-slate-950 transition hover:opacity-92 dark:bg-white dark:text-slate-950 shadow-sm border border-border/10 w-full sm:w-auto ${
              isConnecting || !hasSystemCredentials ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {isConnecting ? <Loader2 size={14} className="animate-spin" /> : null}
            {!hasSystemCredentials
              ? "请先配置系统 TTLock 参数"
              : config?.linked
              ? "刷新授权并同步门锁"
              : "登录并获取门锁"}
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="TTLock App 账号">
            <input
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="手机号或邮箱"
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
            />
          </Field>
          <Field label="TTLock App 密码">
            <input
              type={isEditingPassword || !config?.hasPassword ? "password" : "text"}
              value={passwordDisplayValue}
              onFocus={() => {
                if (!isEditingPassword) {
                  setIsEditingPassword(true);
                  if (!form.password) {
                    setForm((current) => ({ ...current, password: "" }));
                  }
                }
              }}
              onBlur={() => {
                if (!form.password && config?.hasPassword) {
                  setIsEditingPassword(false);
                }
              }}
              onChange={(event) => {
                if (!isEditingPassword) {
                  setIsEditingPassword(true);
                }
                setForm((current) => ({ ...current, password: event.target.value }));
              }}
              placeholder={config?.hasPassword ? "" : "请输入密码"}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
            />
          </Field>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          {!hasSystemCredentials
            ? "TTLock 的接口区域、应用 ID 和应用密钥已改为系统固定参数。请先到系统设置中完成配置，然后再回到这里填写账号密码登录。"
            : config?.linked
            ? "当前 TTLock 已连接。这个按钮用于刷新授权状态，并重新同步门锁列表。"
            : "填好账号密码后，直接登录并获取门锁。密码会在服务端转成 MD5 保存。"}
        </div>

        {config?.lastTokenError ? (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-100">
            登录失败原因：{config.lastTokenError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground">TTLock 用户 ID</div>
            <div className="mt-1 font-bold text-foreground">{config?.ttlockUserId || "未获取"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground">访问令牌到期</div>
            <div className="mt-1 font-bold text-foreground">{formatTime(config?.accessTokenExpiresAt)}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground">最近授权时间</div>
            <div className="mt-1 font-bold text-foreground">{formatTime(config?.lastAuthorizedAt)}</div>
          </div>
        </div>
      </section>

      {/* 门锁控制台 */}
      <section className="rounded-[28px] border border-border/60 bg-white/75 p-4 sm:p-6 shadow-sm dark:bg-white/5">
        {/* 头部控制区 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/40">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">门锁列表</h2>
            <p className="mt-1 text-xs text-muted-foreground">展开各行门锁以查看详情或执行远程开锁。</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={lockAliasFilter}
              onChange={(event) => setLockAliasFilter(event.target.value)}
              placeholder="按别名过滤"
              className="h-10 rounded-2xl border border-border bg-white px-3.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5 flex-1 sm:w-40 sm:flex-none"
            />
            <button
              type="button"
              onClick={() => void loadLocks()}
              disabled={isLoadingLocks}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-bold text-slate-950 transition hover:opacity-92 disabled:opacity-50 dark:bg-white dark:text-slate-950 shadow-sm border border-border/10 flex-1 sm:flex-none"
            >
              {isLoadingLocks ? <Loader2 size={12} className="animate-spin" /> : null}
              加载门锁
            </button>
          </div>
        </div>

        {/* 门锁单行列表展开区 */}
        <div className="mt-5 border border-border/60 rounded-2xl overflow-hidden bg-background/35 divide-y divide-border/60">
          {locks.length > 0 ? (
            locks.map((lock) => {
              const isActive = selectedLockId === lock.lockId;
              const status = getLockConnectionStatus(lock);
              return (
                <div key={lock.lockId} className="flex flex-col">
                  {/* 行首（主按钮，控制展开与折叠） */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isActive) {
                        setSelectedLockId(null);
                        setLockDetail(null);
                      } else {
                        void loadLockDetail(lock.lockId);
                      }
                    }}
                    className={`w-full px-4 sm:px-5 py-4 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.02] flex items-start sm:items-center justify-between gap-3 sm:gap-4 ${
                      isActive ? "bg-primary/[0.04]" : "bg-transparent"
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pr-2">
                        <div className="min-w-0 font-semibold text-foreground text-base sm:text-sm sm:w-48 shrink-0 truncate">
                          {lock.lockAlias || lock.lockName}
                        </div>
                        {/* 移动端展示的在线状态胶囊 */}
                        <span className={`text-[10px] sm:hidden px-2 py-1 rounded-full border inline-flex items-center gap-1 font-medium whitespace-nowrap bg-background/80 border-border/50 ${status.colorClass}`}>
                          {status.online ? <Wifi size={10} /> : <WifiOff size={10} />}
                          {status.label}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 sm:mt-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigator.clipboard.writeText(String(lock.lockId));
                            showToast("门锁 ID 已复制", "success");
                          }}
                          className="inline-flex items-center gap-1 cursor-pointer rounded-lg border border-border/40 bg-background/60 px-2 py-1 transition whitespace-nowrap hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                          title="点击复制门锁 ID"
                        >
                          ID: {lock.lockId}
                          <Copy size={10} className="text-muted-foreground/60 hover:text-foreground transition-colors" />
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrPreviewLock(lock);
                          }}
                          className="inline-flex items-center rounded-lg border border-border/40 bg-background/60 p-1"
                          title="点击查看扫码开锁二维码"
                        >
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(getScanUnlockUrl(lock))}`}
                            alt="QR Code"
                            className="h-5 w-5 rounded border border-border bg-white p-0.5"
                          />
                        </button>
                        <span className="hidden sm:inline text-muted-foreground/40">·</span>
                        <span className="font-medium text-foreground/80 bg-background/50 border border-border/40 px-2 py-1 rounded-full text-[10px] whitespace-nowrap">
                          {status.type}
                        </span>
                        <span className="hidden sm:inline text-muted-foreground/40">·</span>
                        <span className="rounded-full border border-border/40 bg-background/50 px-2 py-1 whitespace-nowrap text-[10px] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
                          电量: {formatBattery(lock.electricQuantity)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 shrink-0 pt-0.5 sm:pt-0">
                      {/* 桌面端展示的在线状态 */}
                      <span className={`text-xs hidden sm:flex items-center gap-1 ${status.colorClass}`}>
                        {status.online ? <Wifi size={12} /> : <WifiOff size={12} />}
                        {status.label}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-muted-foreground/60 transition-transform duration-200 ${
                          isActive ? "rotate-180 text-foreground" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {/* 展开部分 */}
                  {isActive ? (
                    <div className="border-t border-border/40 bg-background/20 px-4 sm:px-5 py-4 space-y-4">
                      {isLoadingDetail ? (
                        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                          <Loader2 size={14} className="animate-spin" />
                          <span>正在加载门锁详情...</span>
                        </div>
                      ) : lockDetail ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 w-full">
                            {/* 设备类型 */}
                            <div className="bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Cpu size={12} className="text-muted-foreground/70" />
                                设备类型
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate">
                                {status.type}
                              </div>
                            </div>

                            {/* 连接状态 */}
                            <div className="bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                {status.online ? (
                                  <Wifi size={12} className="text-emerald-500" />
                                ) : (
                                  <WifiOff size={12} className="text-muted-foreground/75" />
                                )}
                                连接状态
                              </div>
                              <div className={`text-[13px] font-semibold mt-1 truncate ${status.colorClass}`}>
                                {status.label}
                              </div>
                            </div>

                            {/* 当前电量 */}
                            <div className="bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Battery size={12} className="text-emerald-500" />
                                当前电量
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate">
                                {formatBattery(lockDetail.electricQuantity)}
                              </div>
                            </div>

                            {/* 自动锁门 */}
                            <div className="bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Timer size={12} className="text-muted-foreground/70" />
                                自动锁门
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate">
                                {Number(lockDetail.autoLockTime) > 0 ? `${lockDetail.autoLockTime} 秒` : "已禁用"}
                              </div>
                            </div>

                            {/* 固件版本 */}
                            <div className="bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Layers size={12} className="text-muted-foreground/70" />
                                固件版本
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate">
                                {lockDetail.firmwareRevision || "--"}
                              </div>
                            </div>

                            {/* 产品型号 */}
                            <div className="col-span-2 sm:col-span-2 bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Fingerprint size={12} className="text-muted-foreground/70" />
                                产品型号
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate" title={lockDetail.modelNum || ""}>
                                {lockDetail.modelNum || "--"}
                              </div>
                            </div>

                            {/* 远程操作（磁贴动作卡片） */}
                            <button
                              type="button"
                              onClick={() => void handleUnlock(lockDetail.lockId)}
                              disabled={isUnlocking || !status.online}
                              className={`col-span-1 sm:col-span-1 border rounded-xl p-3 flex flex-col justify-between min-h-[64px] text-left transition-all ${
                                !status.online
                                  ? "bg-slate-400/5 dark:bg-slate-700/5 border-border/40 cursor-not-allowed opacity-50"
                                  : "bg-rose-500/10 dark:bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20 active:scale-[0.98] cursor-pointer"
                              }`}
                            >
                              <div className="text-[10px] text-rose-500 dark:text-rose-400 font-medium uppercase tracking-wider flex items-center gap-1.5">
                                {isUnlocking ? (
                                  <Loader2 size={12} className="animate-spin text-rose-500" />
                                ) : (
                                  <LockKeyhole size={12} className="text-rose-500 dark:text-rose-400" />
                                )}
                                远程操作
                              </div>
                              <div className={`text-[13px] font-semibold mt-1 truncate ${
                                !status.online ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400"
                              }`}>
                                {!status.online ? "设备离线" : isUnlocking ? "正在开锁..." : "点击远程开锁"}
                              </div>
                            </button>

                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground py-2">
                          加载详情失败，请重试。
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="flex min-h-[120px] flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
              <span>没有加载到门锁</span>
              <span className="text-[10px] text-muted-foreground/60 mt-1">请先保存授权再点击“加载门锁”</span>
            </div>
          )}
        </div>
      </section>

      {qrPreviewLock ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setQrPreviewLock(null)}
        >
          <div
            className="w-full max-w-[320px] rounded-[28px] border border-border/60 bg-white p-4 shadow-2xl dark:bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-black text-foreground">
                  {qrPreviewLock.lockAlias || qrPreviewLock.lockName}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">扫码开锁</div>
              </div>
              <button
                type="button"
                onClick={() => setQrPreviewLock(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-black/5 dark:hover:bg-white/10"
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-border/60 bg-white p-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(getScanUnlockUrl(qrPreviewLock))}`}
                alt="Scan Unlock QR Code"
                className="w-full rounded-xl bg-white"
              />
            </div>

            <div className="mt-3 text-center text-xs text-muted-foreground">
              点击外部空白区域也可以关闭
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
