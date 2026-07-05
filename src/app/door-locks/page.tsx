"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Battery, ChevronDown, Copy, Cpu, DoorOpen, Fingerprint, KeyRound, Layers, Loader2, LockKeyhole, ShieldCheck, Timer, Wifi, WifiOff, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { format } from "date-fns";
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

          <div className="grid gap-3 grid-cols-2">
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

        <div className="mt-5 grid gap-2 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground text-[11px]">TTLock 用户 ID</div>
            <div className="mt-1 font-bold text-foreground text-xs truncate">{config?.ttlockUserId || "未获取"}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm">
            <div className="text-muted-foreground text-[11px]">令牌到期</div>
            <div className="mt-1 font-bold text-foreground text-xs truncate">{formatTime(config?.accessTokenExpiresAt)}</div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm col-span-2 sm:col-span-1">
            <div className="text-muted-foreground text-[11px]">最近授权时间</div>
            <div className="mt-1 font-bold text-foreground text-xs truncate">{formatTime(config?.lastAuthorizedAt)}</div>
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
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 sm:mt-0">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            void navigator.clipboard.writeText(String(lock.lockId));
                            showToast("门锁 ID 已复制", "success");
                          }}
                          className="inline-flex items-center gap-1 cursor-pointer rounded-lg border border-border/40 bg-background/60 px-2 py-0.5 transition whitespace-nowrap hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
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
                          className="inline-flex items-center rounded-lg border border-border/40 bg-background/60 p-0.5"
                          title="点击查看扫码开锁二维码"
                        >
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(getScanUnlockUrl(lock))}`}
                            alt="QR Code"
                            className="h-4 w-4 rounded border border-border bg-white p-0.5"
                          />
                        </button>
                        <span className="hidden sm:inline text-muted-foreground/40">·</span>
                        <span className="font-medium text-foreground/80 bg-background/50 border border-border/40 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                          {status.type}
                        </span>
                        <span className="hidden sm:inline text-muted-foreground/40">·</span>
                        <span className="rounded-full border border-border/40 bg-background/50 px-2 py-0.5 whitespace-nowrap text-[10px] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs">
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

                            {/* 当前电量（磁贴动作卡片） */}
                            <button
                              type="button"
                              onClick={() => void handleSyncBattery(lockDetail.lockId)}
                              disabled={isSyncingBattery || !status.online}
                              className={`col-span-1 sm:col-span-1 border rounded-xl p-3 flex flex-col justify-between min-h-[64px] text-left transition-all ${
                                !status.online
                                  ? "bg-slate-400/5 dark:bg-slate-700/5 border-border/40 cursor-not-allowed opacity-50"
                                  : "bg-black/[0.015] dark:bg-white/[0.02] border-border/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] active:scale-[0.98] cursor-pointer"
                              }`}
                              title={!status.online ? "设备离线，无法校准" : "点击强制校准并同步最新电量"}
                            >
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                {isSyncingBattery ? (
                                  <Loader2 size={12} className="animate-spin text-primary" />
                                ) : (
                                  <Battery size={12} className="text-emerald-500" />
                                )}
                                当前电量
                              </div>
                              <div className={`text-[13px] font-semibold mt-1 truncate ${
                                !status.online ? "text-muted-foreground" : "text-foreground"
                              }`}>
                                {!status.online
                                  ? "设备离线"
                                  : isSyncingBattery
                                    ? "同步中..."
                                    : `${formatBattery(lockDetail.electricQuantity)}`}
                              </div>
                            </button>

                            {/* 自动锁门 */}
                            <div
                              className={`col-span-1 sm:col-span-1 border rounded-xl p-3 flex flex-col justify-between min-h-[64px] text-left transition-all ${
                                !status.online
                                  ? "bg-slate-400/5 dark:bg-slate-700/5 border-border/40 cursor-not-allowed opacity-50"
                                  : "bg-black/[0.015] dark:bg-white/[0.02] border-border/50"
                              }`}
                            >
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5 w-full justify-between">
                                <span className="flex items-center gap-1.5">
                                  {isSettingAutoLock ? (
                                    <Loader2 size={12} className="animate-spin text-primary" />
                                  ) : (
                                    <Timer size={12} className="text-muted-foreground/70" />
                                  )}
                                  自动锁门
                                </span>
                                {status.online && !isSettingAutoLock && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowAutoLockSelector(!showAutoLockSelector);
                                      setIsCustomAutoLock(false);
                                      setCustomAutoLockSec("");
                                    }}
                                    className="text-[10px] text-rose-500 dark:text-rose-400 hover:underline font-medium cursor-pointer"
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
                                      className="h-5 rounded bg-black/5 dark:bg-white/5 border border-border/40 px-1 text-[10px] w-12 text-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                                      autoFocus
                                    />
                                    <button
                                      type="submit"
                                      disabled={!customAutoLockSec}
                                      className="h-5 px-1.5 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-[9px] font-medium text-white flex items-center justify-center transition cursor-pointer"
                                    >
                                      确定
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setIsCustomAutoLock(false)}
                                      className="h-5 px-1.5 rounded bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[9px] font-medium text-foreground flex items-center justify-center transition cursor-pointer"
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
                                        className="h-5 px-1 rounded bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[9px] font-medium text-foreground flex items-center justify-center transition cursor-pointer flex-1 min-w-[28px]"
                                        title={sec === 0 ? "禁用自动锁门" : `设置自动锁门时间为 ${sec} 秒`}
                                      >
                                        {sec === 0 ? "禁用" : `${sec}s`}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setIsCustomAutoLock(true)}
                                      className="h-5 px-2 rounded bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[9px] font-medium text-foreground flex items-center justify-center transition cursor-pointer flex-initial"
                                      title="自定义时间"
                                    >
                                      自定义
                                    </button>
                                  </div>
                                )
                              ) : (
                                <div className={`text-[13px] font-semibold mt-1 truncate ${
                                  !status.online ? "text-muted-foreground" : "text-foreground"
                                }`}>
                                  {!status.online
                                    ? "设备离线"
                                    : isSettingAutoLock
                                      ? "设置中..."
                                      : Number(lockDetail.autoLockTime) > 0
                                        ? `${lockDetail.autoLockTime} 秒`
                                        : "已禁用"}
                                </div>
                              )}
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
                            <div className="col-span-1 sm:col-span-1 bg-black/[0.015] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col justify-between min-h-[64px]">
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                <Fingerprint size={12} className="text-muted-foreground/70" />
                                产品型号
                              </div>
                              <div className="text-[13px] font-semibold text-foreground mt-1 truncate" title={lockDetail.modelNum || ""}>
                                {lockDetail.modelNum || "--"}
                              </div>
                            </div>

                            {/* 常开模式（磁贴动作卡片） */}
                            <button
                              type="button"
                              onClick={() => void handleTogglePassageMode(lockDetail.lockId, lockDetail.passageMode)}
                              disabled={isConfiguringPassageMode || !status.online}
                              className={`col-span-1 sm:col-span-1 border rounded-xl p-3 flex flex-col justify-between min-h-[64px] text-left transition-all ${
                                !status.online
                                  ? "bg-slate-400/5 dark:bg-slate-700/5 border-border/40 cursor-not-allowed opacity-50"
                                  : lockDetail.passageMode === 1
                                    ? "bg-emerald-500/10 dark:bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 active:scale-[0.98] cursor-pointer"
                                    : "bg-black/[0.015] dark:bg-white/[0.02] border-border/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] active:scale-[0.98] cursor-pointer"
                              }`}
                              title={!status.online ? "设备离线，无法配置" : lockDetail.passageMode === 1 ? "点击关闭常开模式" : "点击开启常开模式"}
                            >
                              <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                                {isConfiguringPassageMode ? (
                                  <Loader2 size={12} className="animate-spin text-primary" />
                                ) : (
                                  <DoorOpen size={12} className={lockDetail.passageMode === 1 ? "text-emerald-500" : "text-muted-foreground/70"} />
                                )}
                                常开模式
                              </div>
                              <div className={`text-[13px] font-semibold mt-1 truncate ${
                                !status.online
                                  ? "text-muted-foreground"
                                  : lockDetail.passageMode === 1
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-foreground/80"
                              }`}>
                                {!status.online
                                  ? "设备离线"
                                  : isConfiguringPassageMode
                                    ? "正在配置..."
                                    : lockDetail.passageMode === 1
                                      ? "已开启 (点击关闭)"
                                      : "已关闭 (点击开启)"}
                              </div>
                            </button>

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

                          {/* 密码管理与远程下发区 */}
                          <div className="border border-border/50 rounded-xl bg-black/[0.005] dark:bg-white/[0.005] p-3 sm:p-4 mt-4">
                            {/* 功能切换标签 */}
                            <div className="flex border-b border-border/40 pb-1.5 mb-3 gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdMode("offline");
                                  setGeneratedPwd("");
                                }}
                                className={`text-[11px] font-semibold pb-1.5 px-3 border-b-2 transition cursor-pointer ${
                                  pwdMode === "offline"
                                    ? "border-rose-500 text-rose-600 dark:text-rose-400 font-bold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                随机离线密码
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setPwdMode("custom");
                                  setGeneratedPwd("");
                                }}
                                className={`text-[11px] font-semibold pb-1.5 px-3 border-b-2 transition cursor-pointer ${
                                  pwdMode === "custom"
                                    ? "border-rose-500 text-rose-600 dark:text-rose-400 font-bold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                自定义远程下发
                              </button>
                            </div>

                            {pwdMode === "offline" ? (
                              <div className="space-y-3">
                                <div>
                                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <KeyRound size={13} className="text-muted-foreground" />
                                    生成随机离线密码 (键盘密码)
                                  </h3>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    通过内置算法离线计算限时密码。即使门锁离线（无网络/无网关），在锁键盘输入此密码亦可开门。
                                  </p>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
                                  {/* 密码有效期限选择 */}
                                  <div className="flex-1 space-y-1.5">
                                    <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">密码有效期限</label>
                                    <div className="flex flex-wrap gap-1">
                                      {(["1h", "24h", "3d", "custom"] as const).map((type) => (
                                        <button
                                          key={type}
                                          type="button"
                                          onClick={() => {
                                            setPwdDurationType(type);
                                            setGeneratedPwd("");
                                          }}
                                          className={`h-6 px-3 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                            pwdDurationType === type
                                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                              : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-muted-foreground border border-transparent"
                                          }`}
                                        >
                                          {type === "1h" ? "1 小时" : type === "24h" ? "24 小时" : type === "3d" ? "3 天" : "自定义"}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 自定义起止时间选择器 */}
                                  {pwdDurationType === "custom" && (
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                                      <div className="space-y-1">
                                        <span className="text-[9px] text-muted-foreground block font-medium">开始时间</span>
                                        <div className="flex items-center gap-1.5">
                                          <DatePicker
                                            value={pwdCustomStartDate}
                                            onChange={(val) => {
                                              setPwdCustomStartDate(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[100px]"
                                          />
                                          <TimePicker
                                            value={pwdCustomStartTime}
                                            onChange={(val) => {
                                              setPwdCustomStartTime(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[66px]"
                                          />
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <span className="text-[9px] text-muted-foreground block font-medium">结束时间</span>
                                        <div className="flex items-center gap-1.5">
                                          <DatePicker
                                            value={pwdCustomEndDate}
                                            onChange={(val) => {
                                              setPwdCustomEndDate(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[100px]"
                                          />
                                          <TimePicker
                                            value={pwdCustomEndTime}
                                            onChange={(val) => {
                                              setPwdCustomEndTime(val);
                                              setGeneratedPwd("");
                                            }}
                                            triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[66px]"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 生成按钮 */}
                                  <button
                                    type="button"
                                    onClick={() => void handleGeneratePwd(lockDetail.lockId, lockDetail.keyboardPwdVersion || 4)}
                                    disabled={isGeneratingPwd}
                                    className="inline-flex h-7 items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-[10px] font-semibold text-white px-4 shrink-0 cursor-pointer w-full sm:w-auto shadow-sm shadow-rose-600/10 transition"
                                  >
                                    {isGeneratingPwd ? <Loader2 size={10} className="animate-spin" /> : null}
                                    生成密码
                                  </button>
                                </div>

                                {/* 生成密码显示 */}
                                {generatedPwd && (
                                  <div className="mt-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex items-center justify-between gap-3 animate-fadeIn">
                                    <div className="space-y-1 min-w-0">
                                      <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-wider uppercase">已生成的临时开锁密码</div>
                                      <div className="text-xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400 font-mono">
                                        {generatedPwd}
                                      </div>
                                      <p className="text-[9px] text-muted-foreground">
                                        提示：请引导客人在门锁键盘上输入此密码，并以 **“#”** 键结尾即可开锁。
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(generatedPwd);
                                        showToast("开锁密码已复制", "success");
                                      }}
                                      className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition shrink-0 cursor-pointer"
                                    >
                                      <Copy size={10} />
                                      复制密码
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div>
                                  <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <KeyRound size={13} className="text-muted-foreground" />
                                    添加并远程下发自定义密码
                                  </h3>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    设定并下发您指定的个性化数字密码，可选永久有效或指定限时。此操作需要门锁在线（连接网关）。
                                  </p>
                                </div>

                                {!status.online && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-2 leading-relaxed">
                                    ⚠️ 门锁目前处于离线状态。添加自定义密码需要云端实时通过网关写入门锁，因此在设备离线时暂时无法下发。
                                  </div>
                                )}

                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-muted-foreground block font-medium">自定义开锁密码 (4 - 9位纯数字)</span>
                                      <input
                                        type="text"
                                        pattern="\d*"
                                        maxLength={9}
                                        placeholder="例如：123456"
                                        value={customPwdVal}
                                        onChange={(e) => setCustomPwdVal(e.target.value.replace(/\D/g, ""))}
                                        className="h-8 rounded-lg border border-border bg-white px-2.5 text-[11px] outline-none dark:border-white/10 dark:bg-white/5 text-foreground w-full focus:ring-1 focus:ring-rose-500"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[9px] text-muted-foreground block font-medium">密码名称 / 备注</span>
                                      <input
                                        type="text"
                                        placeholder="例如：保洁长期密码 / 租客小李"
                                        value={customPwdName}
                                        onChange={(e) => setCustomPwdName(e.target.value)}
                                        className="h-8 rounded-lg border border-border bg-white px-2.5 text-[11px] outline-none dark:border-white/10 dark:bg-white/5 text-foreground w-full focus:ring-1 focus:ring-rose-500"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                                    <div className="flex-1 space-y-1.5">
                                      <span className="text-[9px] text-muted-foreground block font-medium">有效期限</span>
                                      <div className="flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setCustomPwdIsPermanent(true)}
                                          className={`h-6 px-3 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                            customPwdIsPermanent
                                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                              : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-muted-foreground border border-transparent"
                                          }`}
                                        >
                                          永久有效
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setCustomPwdIsPermanent(false)}
                                          className={`h-6 px-3 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                                            !customPwdIsPermanent
                                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                              : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-muted-foreground border border-transparent"
                                          }`}
                                        >
                                          限时有效
                                        </button>
                                      </div>
                                    </div>

                                    {!customPwdIsPermanent && (
                                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0 animate-fadeIn">
                                        <div className="space-y-1">
                                          <span className="text-[9px] text-muted-foreground block font-medium">生效时间</span>
                                          <div className="flex items-center gap-1.5">
                                            <DatePicker
                                              value={customPwdStartDate}
                                              onChange={(val) => setCustomPwdStartDate(val)}
                                              triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[100px]"
                                            />
                                            <TimePicker
                                              value={customPwdStartTime}
                                              onChange={(val) => setCustomPwdStartTime(val)}
                                              triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[66px]"
                                            />
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          <span className="text-[9px] text-muted-foreground block font-medium">失效时间</span>
                                          <div className="flex items-center gap-1.5">
                                            <DatePicker
                                              value={customPwdEndDate}
                                              onChange={(val) => setCustomPwdEndDate(val)}
                                              triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[100px]"
                                            />
                                            <TimePicker
                                              value={customPwdEndTime}
                                              onChange={(val) => setCustomPwdEndTime(val)}
                                              triggerClassName="h-7 text-[10px] py-1 px-2.5 min-w-[66px]"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => void handleSendCustomPwd(lockDetail.lockId)}
                                      disabled={isAddingCustomPwd || !status.online || !customPwdVal}
                                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-semibold text-white px-4 shrink-0 cursor-pointer w-full sm:w-auto shadow-sm shadow-rose-600/10 transition"
                                    >
                                      {isAddingCustomPwd ? <Loader2 size={10} className="animate-spin" /> : null}
                                      远程下发
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
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
