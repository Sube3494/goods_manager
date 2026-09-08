"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Battery, ChevronDown, Copy, Cpu, DoorOpen, Fingerprint, KeyRound, Layers, Loader2, LockKeyhole, ShieldCheck, Timer, Wifi, WifiOff, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { format } from "date-fns";
import { useUser } from "@/hooks/useUser";
import { hasPermission, type SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";
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

function isTTLockAuthExpiredMessage(message: string) {
  return /授权已失效|refresh[_ ]token|invalid refresh/i.test(message);
}

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
  const [isConfiguringPassageMode, setIsConfiguringPassageMode] = useState(false);
  const [isSyncingBattery, setIsSyncingBattery] = useState(false);
  const [isSettingAutoLock, setIsSettingAutoLock] = useState(false);
  const [showAutoLockSelector, setShowAutoLockSelector] = useState(false);
  const [isCustomAutoLock, setIsCustomAutoLock] = useState(false);
  const [customAutoLockSec, setCustomAutoLockSec] = useState("");
  const [isGeneratingPwd, setIsGeneratingPwd] = useState(false);
  const [generatedPwd, setGeneratedPwd] = useState("");
  const [pwdDurationType, setPwdDurationType] = useState<"1h" | "24h" | "3d" | "custom">("1h");
  const [pwdCustomStartDate, setPwdCustomStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [pwdCustomStartTime, setPwdCustomStartTime] = useState("14:00");
  const [pwdCustomEndDate, setPwdCustomEndDate] = useState(() => format(new Date(Date.now() + 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [pwdCustomEndTime, setPwdCustomEndTime] = useState("12:00");
  const [pwdMode, setPwdMode] = useState<"offline" | "custom">("offline");
  const [customPwdVal, setCustomPwdVal] = useState("");
  const [customPwdName, setCustomPwdName] = useState("");
  const [customPwdIsPermanent, setCustomPwdIsPermanent] = useState(true);
  const [customPwdStartDate, setCustomPwdStartDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [customPwdStartTime, setCustomPwdStartTime] = useState("14:00");
  const [customPwdEndDate, setCustomPwdEndDate] = useState(() => format(new Date(Date.now() + 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [customPwdEndTime, setCustomPwdEndTime] = useState("12:00");
  const [isAddingCustomPwd, setIsAddingCustomPwd] = useState(false);
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
        if (data.config) {
          syncConfig(data.config);
        }
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
      const message = error instanceof Error ? error.message : "加载门锁列表失败";
      if (!isTTLockAuthExpiredMessage(message)) {
        console.error("Failed to load TTLock locks:", error);
      }
      showToast(message, "error");
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

  const handleTogglePassageMode = async (lockId: number, currentMode: number | null | undefined) => {
    setIsConfiguringPassageMode(true);
    const nextMode = currentMode === 1 ? 2 : 1;
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ passageMode: nextMode }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "配置常开模式失败");
      }
      showToast(nextMode === 1 ? "常开模式已开启（全天生效）" : "常开模式已关闭（已恢复自动关锁）", "success");
      await loadLockDetail(lockId);
    } catch (error) {
      console.error("Failed to config TTLock passage mode:", error);
      showToast(error instanceof Error ? error.message : "配置常开模式失败", "error");
    } finally {
      setIsConfiguringPassageMode(false);
    }
  };

  const handleSyncBattery = async (lockId: number) => {
    setIsSyncingBattery(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "syncBattery" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "同步电量失败");
      }
      showToast("门锁电量已校准并同步", "success");
      await loadLockDetail(lockId);
    } catch (error) {
      console.error("Failed to sync TTLock battery:", error);
      showToast(error instanceof Error ? error.message : "同步电量失败", "error");
    } finally {
      setIsSyncingBattery(false);
    }
  };

  const handleSetAutoLockTime = async (lockId: number, seconds: number) => {
    setIsSettingAutoLock(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "setAutoLockTime", seconds }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "设置自动锁门时间失败");
      }
      showToast(seconds === 0 ? "已成功禁用自动锁门" : `自动锁门时间已设为 ${seconds} 秒`, "success");
      setShowAutoLockSelector(false);
      await loadLockDetail(lockId);
    } catch (error) {
      console.error("Failed to set TTLock auto lock time:", error);
      showToast(error instanceof Error ? error.message : "设置自动锁门时间失败", "error");
    } finally {
      setIsSettingAutoLock(false);
    }
  };

  const handleGeneratePwd = async (lockId: number, keyboardPwdVersion: number) => {
    setIsGeneratingPwd(true);
    setGeneratedPwd("");

    let startDate = Date.now();
    let endDate = startDate;

    if (pwdDurationType === "1h") {
      endDate = startDate + 60 * 60 * 1000;
    } else if (pwdDurationType === "24h") {
      endDate = startDate + 24 * 60 * 60 * 1000;
    } else if (pwdDurationType === "3d") {
      endDate = startDate + 3 * 24 * 60 * 60 * 1000;
    } else {
      const startMs = pwdCustomStartDate && pwdCustomStartTime ? new Date(`${pwdCustomStartDate}T${pwdCustomStartTime}:00`).getTime() : 0;
      const endMs = pwdCustomEndDate && pwdCustomEndTime ? new Date(`${pwdCustomEndDate}T${pwdCustomEndTime}:00`).getTime() : 0;
      if (!startMs || !endMs || startMs >= endMs) {
        showToast("自定义起止时间无效", "error");
        setIsGeneratingPwd(false);
        return;
      }
      startDate = startMs;
      endDate = endMs;
    }

    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "getKeyboardPwd",
          keyboardPwdVersion,
          keyboardPwdType: 3,
          startDate,
          endDate,
        }),
      });
      const data = await response.json() as { error?: string; keyboardPwd?: string };
      if (!response.ok) {
        throw new Error(data?.error || "生成临时密码失败");
      }
      if (data.keyboardPwd) {
        setGeneratedPwd(data.keyboardPwd);
        showToast("临时开锁密码生成成功", "success");
      }
    } catch (error) {
      console.error("Failed to generate keyboard pwd:", error);
      showToast(error instanceof Error ? error.message : "生成临时密码失败", "error");
    } finally {
      setIsGeneratingPwd(false);
    }
  };

  const handleSendCustomPwd = async (lockId: number) => {
    if (!/^\d{4,9}$/.test(customPwdVal)) {
      showToast("自定义密码必须为 4 到 9 位纯数字", "error");
      return;
    }

    setIsAddingCustomPwd(true);

    let startDate = Date.now();
    let endDate = startDate;

    if (!customPwdIsPermanent) {
      const startMs = customPwdStartDate && customPwdStartTime ? new Date(`${customPwdStartDate}T${customPwdStartTime}:00`).getTime() : 0;
      const endMs = customPwdEndDate && customPwdEndTime ? new Date(`${customPwdEndDate}T${customPwdEndTime}:00`).getTime() : 0;
      if (!startMs || !endMs || startMs >= endMs) {
        showToast("自定义起止时间无效", "error");
        setIsAddingCustomPwd(false);
        return;
      }
      startDate = startMs;
      endDate = endMs;
    }

    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "addCustomKeyboardPwd",
          keyboardPwd: customPwdVal,
          keyboardPwdName: customPwdName || "自定义下发密码",
          isPermanent: customPwdIsPermanent,
          startDate,
          endDate,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "远程下发自定义密码失败");
      }
      showToast("自定义密码已成功通过网关写入门锁", "success");
      setCustomPwdVal("");
      setCustomPwdName("");
    } catch (error) {
      console.error("Failed to add custom keyboard pwd:", error);
      showToast(error instanceof Error ? error.message : "远程下发自定义密码失败", "error");
    } finally {
      setIsAddingCustomPwd(false);
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
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* 门锁管理平铺大标题 Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase bg-primary/10 border border-primary/20 text-primary mb-2 shadow-2xs">
            <ShieldCheck size={12} />
            <span>TTLOCK 智能硬件中枢</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">门锁管理</h1>
          <p className="hidden sm:block text-muted-foreground mt-1.5 text-sm">
            集成 TTLock 智能云门锁体系，支持实时在线监测、离线密码生成与远程极速开门。
          </p>
        </div>

        {/* 状态徽章组合 */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 shadow-2xs backdrop-blur-md">
            <span className={cn("h-2 w-2 rounded-full", config?.linked ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
            <span className="text-xs font-bold text-foreground">
              {config?.linked ? "已授权连接" : "未授权连接"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 shadow-2xs backdrop-blur-md">
            <DoorOpen size={14} className="text-primary" />
            <span className="text-xs font-bold text-foreground">{locks.length}</span>
            <span className="text-[11px] text-muted-foreground">台门锁</span>
          </div>
        </div>
      </div>

      {/* 账号配置卡片 */}
      <section className="rounded-3xl border border-border/60 bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/40 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">TTLock 账号授权</h2>
              <p className="text-xs text-muted-foreground mt-0.5">配置云端接口账号密码以同步门锁设备与指令权限</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isConnecting || !hasSystemCredentials) return;
              void handleConnect();
            }}
            disabled={isConnecting || !hasSystemCredentials}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer active:scale-95",
              isConnecting || !hasSystemCredentials
                ? "bg-muted text-muted-foreground opacity-60 cursor-not-allowed shadow-none"
                : "bg-primary text-primary-foreground shadow-primary/20 hover:scale-105"
            )}
          >
            {isConnecting ? <Loader2 size={13} className="animate-spin" /> : null}
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
              placeholder="请输入手机号或邮箱"
              className="h-11 w-full rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 px-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-sky-500/20 shadow-2xs transition-all"
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
              className="h-11 w-full rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 px-4 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-sky-500/20 shadow-2xs transition-all"
            />
          </Field>
        </div>

        <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
          {!hasSystemCredentials
            ? "TTLock 的接口区域、应用 ID 和应用密钥已改为系统固定参数。请先到系统设置中完成配置，然后再回到这里填写账号密码登录。"
            : config?.linked
            ? "当前 TTLock 已成功连接。如需重新拉取最新绑定的门锁列表，可点击上方按钮刷新授权。"
            : "填写好账号密码后直接点击登录。密码会在服务端加密传输并转成 MD5 安全存储。"}
        </div>

        {config?.lastTokenError ? (
          <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400">
            登录失败原因：{config.lastTokenError}
          </div>
        ) : null}

        {/* 授权元信息参数微条 */}
        <div className="mt-5 grid gap-2.5 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-white/40 dark:bg-white/[0.02] dark:border-white/5 px-4 py-3 shadow-2xs">
            <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">TTLock 用户 ID</div>
            <div className="mt-1 font-mono font-bold text-foreground text-xs truncate">{config?.ttlockUserId || "未获取"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-white/40 dark:bg-white/[0.02] dark:border-white/5 px-4 py-3 shadow-2xs">
            <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">令牌到期</div>
            <div className="mt-1 font-mono font-bold text-foreground text-xs truncate">{formatTime(config?.accessTokenExpiresAt)}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-white/40 dark:bg-white/[0.02] dark:border-white/5 px-4 py-3 shadow-2xs col-span-2 sm:col-span-1">
            <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">最近授权时间</div>
            <div className="mt-1 font-mono font-bold text-foreground text-xs truncate">{formatTime(config?.lastAuthorizedAt)}</div>
          </div>
        </div>
      </section>

      {/* 门锁控制台 */}
      <section className="rounded-3xl border border-border/60 bg-white/60 dark:bg-white/[0.03] backdrop-blur-xl p-5 sm:p-7 shadow-xs space-y-5">
        {/* 头部控制与筛选区 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-border/40 dark:border-white/5">
          <div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <DoorOpen size={18} className="text-primary" />
              <span>门锁设备列表</span>
              <span className="text-[11px] font-bold text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-full text-primary">
                {locks.length}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">展开各行门锁以查看实时状态、远程开锁或下发开门密码。</p>
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <input
              value={lockAliasFilter}
              onChange={(event) => setLockAliasFilter(event.target.value)}
              placeholder="按别名搜索门锁..."
              className="h-10 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 px-4 text-xs outline-none focus:ring-2 focus:ring-sky-500/20 shadow-2xs flex-1 sm:w-48 sm:flex-none text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => void loadLocks()}
              disabled={isLoadingLocks}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 px-4 text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isLoadingLocks ? <Loader2 size={13} className="animate-spin" /> : null}
              <span>加载门锁</span>
            </button>
          </div>
        </div>

        {/* 门锁独立卡片列表 */}
        <div className="space-y-3">
          {locks.length > 0 ? (
            locks.map((lock) => {
              const isActive = selectedLockId === lock.lockId;
              const status = getLockConnectionStatus(lock);
              return (
                <div 
                  key={lock.lockId} 
                  className={cn(
                    "rounded-2xl border transition-colors duration-150 overflow-hidden shadow-2xs",
                    isActive 
                      ? "border-sky-500/40 bg-white/90 dark:bg-white/[0.05] ring-2 ring-sky-500/10" 
                      : "border-border/60 dark:border-white/10 bg-white/70 dark:bg-white/[0.02] hover:border-sky-500/30 hover:bg-white/90 dark:hover:bg-white/[0.04]"
                  )}
                >
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
                    className="w-full px-4 sm:px-6 py-4 text-left transition-colors flex items-center justify-between gap-3 sm:gap-4 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      {/* 设备图标与名称 */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={cn(
                          "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-colors",
                          status.online
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-2xs"
                            : "bg-muted/50 text-muted-foreground border-border/60"
                        )}>
                          <LockKeyhole size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-foreground text-sm sm:text-base truncate max-w-[200px] sm:max-w-[260px]">
                            {lock.lockAlias || lock.lockName}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            ID: {lock.lockId}
                          </div>
                        </div>
                      </div>

                      {/* 辅助属性徽章 */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                        {/* 复制 ID 按钮 */}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigator.clipboard.writeText(String(lock.lockId));
                            showToast("门锁 ID 已复制", "success");
                          }}
                          className="inline-flex items-center gap-1 cursor-pointer rounded-full border border-border/50 bg-white/60 dark:bg-white/5 px-2.5 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-white dark:hover:bg-white/10 transition shadow-2xs"
                          title="点击复制门锁 ID"
                        >
                          <Copy size={10} />
                          <span>复制ID</span>
                        </span>

                        {/* 扫码开锁二维码图标 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrPreviewLock(lock);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-white/60 dark:bg-white/5 px-2.5 py-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30 transition shadow-2xs cursor-pointer"
                          title="点击查看扫码开锁二维码"
                        >
                          <span>扫码开门</span>
                        </button>

                        {/* 设备类型 */}
                        <span className="font-bold text-foreground/80 bg-muted/40 dark:bg-white/5 border border-border/50 px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap shadow-2xs">
                          {status.type}
                        </span>

                        {/* 电量胶囊 */}
                        <span className={cn(
                          "rounded-full border px-2.5 py-1 text-[10px] font-bold font-mono whitespace-nowrap shadow-2xs flex items-center gap-1",
                          Number(lock.electricQuantity) <= 20
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        )}>
                          <Battery size={11} />
                          <span>{formatBattery(lock.electricQuantity)}</span>
                        </span>

                        {/* 在线状态呼吸徽章 */}
                        <span className={cn(
                          "text-[10px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 font-bold whitespace-nowrap shadow-2xs",
                          status.online
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-muted/40 text-muted-foreground border-border/50"
                        )}>
                          {status.online ? <Wifi size={11} /> : <WifiOff size={11} />}
                          <span>{status.label}</span>
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 pl-2">
                      <ChevronDown
                        size={18}
                        className={cn(
                          "text-muted-foreground transition-transform duration-200",
                          isActive && "rotate-180 text-primary"
                        )}
                      />
                    </div>
                  </button>

                  {/* 展开设备控制面板 */}
                  {isActive ? (
                    <div className="border-t border-border/40 dark:border-white/5 bg-white/40 dark:bg-white/[0.01] px-4 sm:px-6 py-5 space-y-5 animate-in fade-in duration-200">
                      {isLoadingDetail ? (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                          <Loader2 size={16} className="animate-spin text-primary" />
                          <span>正在拉取门锁实时控制参数...</span>
                        </div>
                      ) : lockDetail ? (
                        <div className="space-y-5">
                          {/* 8格控制与状态微磁贴矩阵 */}
                          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 w-full">
                            {/* 1. 设备类型 */}
                            <div className="bg-white/70 dark:bg-white/[0.03] border border-border/60 dark:border-white/10 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Cpu size={12} className="text-sky-500" />
                                <span>设备类型</span>
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-foreground mt-2 truncate">
                                {status.type}
                              </div>
                            </div>

                            {/* 2. 连接状态 */}
                            <div className="bg-white/70 dark:bg-white/[0.03] border border-border/60 dark:border-white/10 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                                {status.online ? (
                                  <Wifi size={12} className="text-emerald-500" />
                                ) : (
                                  <WifiOff size={12} className="text-muted-foreground" />
                                )}
                                <span>连接状态</span>
                              </div>
                              <div className={cn("text-xs sm:text-sm font-bold mt-2 truncate", status.colorClass)}>
                                {status.label}
                              </div>
                            </div>

                            {/* 3. 当前电量（支持一键校准同步） */}
                            <button
                              type="button"
                              onClick={() => void handleSyncBattery(lockDetail.lockId)}
                              disabled={isSyncingBattery || !status.online}
                              className={cn(
                                "border rounded-2xl p-3.5 flex flex-col justify-between text-left transition-colors shadow-2xs",
                                !status.online
                                  ? "bg-muted/30 border-border/40 opacity-60 cursor-not-allowed"
                                  : "bg-white/70 dark:bg-white/[0.03] border-border/60 dark:border-white/10 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] active:scale-[0.98] cursor-pointer"
                              )}
                              title={!status.online ? "设备离线，无法校准" : "点击强制校准并同步最新电量"}
                            >
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center justify-between w-full">
                                <span className="flex items-center gap-1.5">
                                  {isSyncingBattery ? (
                                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                                  ) : (
                                    <Battery size={12} className="text-emerald-500" />
                                  )}
                                  <span>电量校准</span>
                                </span>
                                {status.online && !isSyncingBattery && (
                                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-normal">点击校准</span>
                                )}
                              </div>
                              <div className="text-xs sm:text-sm font-mono font-black mt-2 text-foreground truncate">
                                {isSyncingBattery ? "正在校准..." : formatBattery(lockDetail.electricQuantity)}
                              </div>
                            </button>

                            {/* 4. 自动锁门 */}
                            <div className={cn(
                              "border rounded-2xl p-3.5 flex flex-col justify-between text-left transition-colors shadow-2xs",
                              !status.online
                                ? "bg-muted/30 border-border/40 opacity-60"
                                : "bg-white/70 dark:bg-white/[0.03] border-border/60 dark:border-white/10"
                            )}>
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center justify-between w-full">
                                <span className="flex items-center gap-1.5">
                                  {isSettingAutoLock ? (
                                    <Loader2 size={12} className="animate-spin text-sky-500" />
                                  ) : (
                                    <Timer size={12} className="text-sky-500" />
                                  )}
                                  <span>自动关锁</span>
                                </span>
                                {status.online && !isSettingAutoLock && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowAutoLockSelector(!showAutoLockSelector);
                                      setIsCustomAutoLock(false);
                                      setCustomAutoLockSec("");
                                    }}
                                    className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline font-bold cursor-pointer"
                                  >
                                    {showAutoLockSelector ? "取消" : "设置"}
                                  </button>
                                )}
                              </div>
                              
                              {showAutoLockSelector && status.online && !isSettingAutoLock ? (
                                isCustomAutoLock ? (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const sec = parseInt(customAutoLockSec, 10);
                                      if (!isNaN(sec) && sec >= 0) {
                                        void handleSetAutoLockTime(lockDetail.lockId, sec);
                                      }
                                    }}
                                    className="flex flex-wrap items-center gap-1 mt-1.5 w-full"
                                  >
                                    <input
                                      type="number"
                                      min="0"
                                      max="900"
                                      value={customAutoLockSec}
                                      onChange={(e) => setCustomAutoLockSec(e.target.value)}
                                      placeholder="秒"
                                      className="h-6 rounded-md bg-white dark:bg-white/10 border border-border/60 px-1 text-[10px] w-14 text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
                                      autoFocus
                                    />
                                    <button
                                      type="submit"
                                      disabled={!customAutoLockSec}
                                      className="h-6 px-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50 text-[10px] font-bold transition cursor-pointer"
                                    >
                                      确定
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsCustomAutoLock(false)}
                                      className="h-6 px-2 rounded-md bg-muted text-muted-foreground text-[10px] font-bold transition cursor-pointer"
                                    >
                                      返回
                                    </button>
                                  </form>
                                ) : (
                                  <div className="flex flex-wrap gap-1 mt-1.5 w-full">
                                    {[0, 5, 10, 30].map((sec) => (
                                      <button
                                        key={sec}
                                        type="button"
                                        onClick={() => void handleSetAutoLockTime(lockDetail.lockId, sec)}
                                        className="h-6 px-1.5 rounded-md bg-white/90 dark:bg-white/10 border border-border/50 text-[10px] font-bold text-foreground hover:bg-sky-500/10 hover:text-sky-600 transition cursor-pointer flex-1"
                                      >
                                        {sec === 0 ? "禁用" : `${sec}s`}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setIsCustomAutoLock(true)}
                                      className="h-6 px-2 rounded-md bg-white/90 dark:bg-white/10 border border-border/50 text-[10px] font-bold text-foreground hover:bg-sky-500/10 hover:text-sky-600 transition cursor-pointer"
                                    >
                                      自定义
                                    </button>
                                  </div>
                                )
                              ) : (
                                <div className="text-xs sm:text-sm font-bold text-foreground mt-2 truncate">
                                  {isSettingAutoLock
                                    ? "设置中..."
                                    : Number(lockDetail.autoLockTime) > 0
                                      ? `${lockDetail.autoLockTime} 秒`
                                      : "已禁用"}
                                </div>
                              )}
                            </div>

                            {/* 5. 固件版本 */}
                            <div className="bg-white/70 dark:bg-white/[0.03] border border-border/60 dark:border-white/10 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Layers size={12} className="text-purple-500" />
                                <span>固件版本</span>
                              </div>
                              <div className="text-xs sm:text-sm font-mono font-bold text-foreground mt-2 truncate">
                                {lockDetail.firmwareRevision || "--"}
                              </div>
                            </div>

                            {/* 6. 产品型号 */}
                            <div className="bg-white/70 dark:bg-white/[0.03] border border-border/60 dark:border-white/10 rounded-2xl p-3.5 flex flex-col justify-between shadow-2xs">
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                                <Fingerprint size={12} className="text-amber-500" />
                                <span>产品型号</span>
                              </div>
                              <div className="text-xs sm:text-sm font-bold text-foreground mt-2 truncate" title={lockDetail.modelNum || ""}>
                                {lockDetail.modelNum || "--"}
                              </div>
                            </div>

                            {/* 7. 常开模式（开关微光磁贴） */}
                            <button
                              type="button"
                              onClick={() => void handleTogglePassageMode(lockDetail.lockId, lockDetail.passageMode)}
                              disabled={isConfiguringPassageMode || !status.online}
                              className={cn(
                                "border rounded-2xl p-3.5 flex flex-col justify-between text-left transition-colors shadow-2xs",
                                !status.online
                                  ? "bg-muted/30 border-border/40 opacity-60 cursor-not-allowed"
                                  : lockDetail.passageMode === 1
                                    ? "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15 cursor-pointer active:scale-[0.98]"
                                    : "bg-white/70 dark:bg-white/[0.03] border-border/60 dark:border-white/10 hover:border-sky-500/30 cursor-pointer active:scale-[0.98]"
                              )}
                              title={!status.online ? "设备离线，无法配置" : lockDetail.passageMode === 1 ? "点击关闭常开模式" : "点击开启常开模式"}
                            >
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                                {isConfiguringPassageMode ? (
                                  <Loader2 size={12} className="animate-spin text-primary" />
                                ) : (
                                  <DoorOpen size={12} className={lockDetail.passageMode === 1 ? "text-emerald-500" : "text-muted-foreground"} />
                                )}
                                <span>常开通道</span>
                              </div>
                              <div className={cn(
                                "text-xs sm:text-sm font-bold mt-2 truncate",
                                lockDetail.passageMode === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                              )}>
                                {isConfiguringPassageMode
                                  ? "正在配置..."
                                  : lockDetail.passageMode === 1
                                    ? "已开启常开"
                                    : "已关闭 (点开启)"}
                              </div>
                            </button>

                            {/* 8. 远程开锁 */}
                            <button
                              type="button"
                              onClick={() => void handleUnlock(lockDetail.lockId)}
                              disabled={isUnlocking || !status.online}
                              className={cn(
                                "border rounded-2xl p-3.5 flex flex-col justify-between text-left transition-colors shadow-2xs active:scale-[0.98]",
                                !status.online
                                  ? "bg-muted/30 border-border/40 opacity-60 cursor-not-allowed"
                                  : "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15 cursor-pointer"
                              )}
                              title={!status.online ? "设备离线，无法远程开锁" : "点击发送远程开锁指令"}
                            >
                              <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center justify-between w-full gap-2">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {isUnlocking ? (
                                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                                  ) : (
                                    <DoorOpen size={12} className={status.online ? "text-emerald-500" : "text-muted-foreground"} />
                                  )}
                                  <span className="truncate">远程开锁</span>
                                </span>
                                <span className={cn(
                                  "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold",
                                  status.online
                                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "border-border/50 bg-background/60 text-muted-foreground dark:border-white/10"
                                )}>
                                  即时
                                </span>
                              </div>
                              <div className={cn(
                                "text-xs sm:text-sm font-bold mt-2 truncate",
                                status.online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                              )}>
                                {!status.online ? "设备离线不可开锁" : isUnlocking ? "正在发送指令..." : "点击立即开门"}
                              </div>
                            </button>

                          </div>

                          {/* 密码管理与下发专区 */}
                          <div className="rounded-2xl border border-border/60 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs space-y-4">
                            {/* 功能切换标签栏 */}
                            <div className="flex items-center gap-1.5 p-1 rounded-full bg-muted/40 dark:bg-white/5 border border-border/50 dark:border-white/10 w-fit">
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdMode("offline");
                                  setGeneratedPwd("");
                                }}
                                className={cn(
                                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                                  pwdMode === "offline"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                随机离线密码
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdMode("custom");
                                  setGeneratedPwd("");
                                }}
                                className={cn(
                                  "px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer",
                                  pwdMode === "custom"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                自定义密码下发
                              </button>
                            </div>

                            {pwdMode === "offline" ? (
                              <div className="space-y-3.5">
                                <div>
                                  <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <KeyRound size={14} className="text-primary" />
                                    <span>生成随机离线键盘密码</span>
                                  </h3>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    内置高阶算法离线生成限时密码。即使门锁无网线/无网关处于离线状态，在键盘上输入即可开门。
                                  </p>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
                                  {/* 时长选择 */}
                                  <div className="flex-1 space-y-1.5">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">有效时长</span>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(["1h", "24h", "3d", "custom"] as const).map((type) => (
                                        <button
                                          key={type}
                                          type="button"
                                          onClick={() => {
                                            setPwdDurationType(type);
                                            setGeneratedPwd("");
                                          }}
                                          className={cn(
                                            "h-7 px-3 rounded-full text-[11px] font-bold transition cursor-pointer border shadow-2xs",
                                            pwdDurationType === type
                                              ? "bg-primary/10 border-primary/30 text-primary"
                                              : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 text-muted-foreground hover:text-foreground"
                                          )}
                                        >
                                          {type === "1h" ? "1 小时" : type === "24h" ? "24 小时" : type === "3d" ? "3 天" : "自定义"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 自定义起止时间 */}
                                  {pwdDurationType === "custom" && (
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                                      <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground block font-bold">开始时间</span>
                                        <div className="flex items-center gap-1.5">
                                          <DatePicker
                                            value={pwdCustomStartDate}
                                            onChange={(val) => {
                                              setPwdCustomStartDate(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[100px] rounded-full"
                                          />
                                          <TimePicker
                                            value={pwdCustomStartTime}
                                            onChange={(val) => {
                                              setPwdCustomStartTime(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[70px] rounded-full"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[10px] text-muted-foreground block font-bold">结束时间</span>
                                        <div className="flex items-center gap-1.5">
                                          <DatePicker
                                            value={pwdCustomEndDate}
                                            onChange={(val) => {
                                              setPwdCustomEndDate(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[100px] rounded-full"
                                          />
                                          <TimePicker
                                            value={pwdCustomEndTime}
                                            onChange={(val) => {
                                              setPwdCustomEndTime(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[70px] rounded-full"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => void handleGeneratePwd(lockDetail.lockId, lockDetail.keyboardPwdVersion || 4)}
                                    disabled={isGeneratingPwd}
                                    className="h-8 sm:h-9 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold px-5 shrink-0 cursor-pointer w-full sm:w-auto shadow-md shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                  >
                                    {isGeneratingPwd ? <Loader2 size={12} className="animate-spin" /> : null}
                                    <span>生成密码</span>
                                  </button>
                                </div>

                                {/* 生成成功大密码展示卡片 */}
                                {generatedPwd && (
                                  <div className="mt-3 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
                                    <div className="space-y-1 min-w-0">
                                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                                        已生成的限时键盘开锁密码
                                      </div>
                                      <div className="text-2xl sm:text-3xl font-black tracking-widest text-emerald-600 dark:text-emerald-400 font-mono select-all">
                                        {generatedPwd}
                                      </div>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        开锁指南：请在门锁按键面板上输入上方数字，并按下 **“#”** 键即可解锁开门。
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(generatedPwd);
                                        showToast("开锁密码已复制", "success");
                                      }}
                                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition shrink-0 cursor-pointer active:scale-95 shadow-2xs w-full sm:w-auto"
                                    >
                                      <Copy size={13} />
                                      <span>复制密码</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3.5">
                                <div>
                                  <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                                    <KeyRound size={14} className="text-primary" />
                                    <span>添加并远程下发自定义密码</span>
                                  </h3>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    下发您指定的个性化数字密码，可选永久有效或指定限时（需要门锁处于联网在线状态）。
                                  </p>
                                </div>

                                {!status.online && (
                                  <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 leading-relaxed font-bold">
                                    ⚠️ 提示：门锁目前处于离线状态。自定义密码需要实时通过网络写入门锁，请确保网关在线后再试。
                                  </div>
                                )}

                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-muted-foreground block font-bold">自定义开锁密码 (4 - 9位纯数字)</span>
                                      <input
                                        type="text"
                                        pattern="\d*"
                                        maxLength={9}
                                        placeholder="例如：668822"
                                        value={customPwdVal}
                                        onChange={(e) => setCustomPwdVal(e.target.value.replace(/\D/g, ""))}
                                        className="h-10 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 px-4 text-xs font-mono text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-sky-500/20 w-full shadow-2xs"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[10px] text-muted-foreground block font-bold">密码名称 / 备注说明</span>
                                      <input
                                        type="text"
                                        placeholder="例如：保洁定期密码 / 租客小张"
                                        value={customPwdName}
                                        onChange={(e) => setCustomPwdName(e.target.value)}
                                        className="h-10 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 px-4 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-sky-500/20 w-full shadow-2xs"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
                                    <div className="flex-1 space-y-1.5">
                                      <span className="text-[10px] text-muted-foreground block font-bold uppercase tracking-wider">有效期限</span>
                                      <div className="flex gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setCustomPwdIsPermanent(true)}
                                          className={cn(
                                            "h-7 px-3.5 rounded-full text-[11px] font-bold transition cursor-pointer border shadow-2xs",
                                            customPwdIsPermanent
                                              ? "bg-primary/10 border-primary/30 text-primary"
                                              : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 text-muted-foreground hover:text-foreground"
                                          )}
                                        >
                                          永久有效
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setCustomPwdIsPermanent(false)}
                                          className={cn(
                                            "h-7 px-3.5 rounded-full text-[11px] font-bold transition cursor-pointer border shadow-2xs",
                                            !customPwdIsPermanent
                                              ? "bg-primary/10 border-primary/30 text-primary"
                                              : "bg-white/70 dark:bg-white/5 border-border/60 dark:border-white/10 text-muted-foreground hover:text-foreground"
                                          )}
                                        >
                                          限时有效
                                        </button>
                                      </div>
                                    </div>

                                    {!customPwdIsPermanent && (
                                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0 animate-in fade-in duration-200">
                                        <div className="space-y-1">
                                          <span className="text-[10px] text-muted-foreground block font-bold">生效时间</span>
                                          <div className="flex items-center gap-1.5">
                                            <DatePicker
                                              value={customPwdStartDate}
                                              onChange={(val) => setCustomPwdStartDate(val)}
                                              triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[100px] rounded-full"
                                            />
                                            <TimePicker
                                              value={customPwdStartTime}
                                              onChange={(val) => setCustomPwdStartTime(val)}
                                              triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[70px] rounded-full"
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-[10px] text-muted-foreground block font-bold">失效时间</span>
                                          <div className="flex items-center gap-1.5">
                                            <DatePicker
                                              value={customPwdEndDate}
                                              onChange={(val) => setCustomPwdEndDate(val)}
                                              triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[100px] rounded-full"
                                            />
                                            <TimePicker
                                              value={customPwdEndTime}
                                              onChange={(val) => setCustomPwdEndTime(val)}
                                              triggerClassName="h-8 text-[11px] py-1 px-3 min-w-[70px] rounded-full"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => void handleSendCustomPwd(lockDetail.lockId)}
                                      disabled={isAddingCustomPwd || !status.online || !customPwdVal}
                                      className="h-8 sm:h-9 items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold px-5 shrink-0 cursor-pointer w-full sm:w-auto shadow-md shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                                    >
                                      {isAddingCustomPwd ? <Loader2 size={12} className="animate-spin" /> : null}
                                      <span>立即远程下发</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground py-4 text-center">
                          拉取门锁详情失败，请重新加载。
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="flex min-h-[160px] flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground bg-white/40 dark:bg-white/[0.01] rounded-2xl border border-dashed border-border/60">
              <DoorOpen size={28} className="text-muted-foreground/40 mb-2" />
              <span className="font-bold">暂无门锁设备</span>
              <span className="text-[11px] text-muted-foreground/70 mt-1">请先完成上方 TTLock 授权绑定，然后点击“加载门锁”</span>
            </div>
          )}
        </div>
      </section>

      {/* 扫码开锁二维码弹窗 */}
      {qrPreviewLock ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setQrPreviewLock(null)}
        >
          <div
            className="w-full max-w-[340px] rounded-[32px] border border-border/60 bg-white p-6 shadow-2xl dark:bg-gray-900/90 dark:border-white/10 backdrop-blur-2xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-foreground">
                  {qrPreviewLock.lockAlias || qrPreviewLock.lockName}
                </div>
                <div className="mt-0.5 text-xs text-primary font-bold">扫码极速开门通道</div>
              </div>
              <button
                type="button"
                onClick={() => setQrPreviewLock(null)}
                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border/60 bg-white p-4 flex items-center justify-center shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(getScanUnlockUrl(qrPreviewLock))}`}
                alt="Scan Unlock QR Code"
                className="w-full aspect-square rounded-xl object-contain"
              />
            </div>

            <div className="mt-4 text-center text-xs text-muted-foreground leading-relaxed">
              支持微信或手机扫码快速安全解锁<br />
              <span className="text-[10px] text-muted-foreground/60">点击弹窗外空白区域亦可快速关闭</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
