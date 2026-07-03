"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, LockKeyhole, LockKeyholeOpen, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { useToast } from "@/components/ui/Toast";
import type { TTLockLockDetail } from "@/lib/types";

function ScanUnlockInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const lockIdParam = searchParams.get("lockId");
  const lockId = lockIdParam ? Number(lockIdParam) : null;
  const token = searchParams.get("token") || "";

  const [lock, setLock] = useState<TTLockLockDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const previousThemeRef = useRef<string | null>(null);
  const hasForcedSystemThemeRef = useRef(false);

  useEffect(() => {
    if (hasForcedSystemThemeRef.current) {
      return;
    }
    previousThemeRef.current = theme ?? null;
    hasForcedSystemThemeRef.current = true;
    setTheme("system");

    return () => {
      if (previousThemeRef.current) {
        setTheme(previousThemeRef.current);
      }
    };
  }, [setTheme, theme]);

  useEffect(() => {
    if (!lockId) {
      setErrorMsg("无效的门锁 ID");
      setIsLoading(false);
      return;
    }
    if (!token) {
      setErrorMsg("缺少开锁授权凭证 (Token)");
      setIsLoading(false);
      return;
    }

    const loadDetail = async () => {
      try {
        const response = await fetch(`/api/ttlock/locks/${lockId}/public-detail?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await response.json() as { lock?: TTLockLockDetail; error?: string };
        if (!response.ok) {
          throw new Error(data?.error || "加载安全直达页失败");
        }
        setLock(data.lock || null);
      } catch (error) {
        console.error("Failed to load lock detail:", error);
        setErrorMsg(error instanceof Error ? error.message : "获取门锁详情失败，请检查链接或网络。");
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetail();
  }, [lockId, token]);

  const handleUnlock = async () => {
    if (!lockId || !token) return;
    const normalizedCode = verificationCode.replace(/\D/g, "").slice(-4);
    if (normalizedCode.length !== 4) {
      showToast("请输入订单号后四位或顾客手机号后四位", "error");
      return;
    }
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}/public-unlock?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verificationCode: normalizedCode,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        throw new Error(data?.error || "开锁失败");
      }
      setUnlockSuccess(true);
      showToast("开锁指令已发送", "success");
      setTimeout(() => setUnlockSuccess(false), 5000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "开锁失败", "error");
    } finally {
      setIsUnlocking(false);
    }
  };

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center text-slate-100 p-6">
        <Loader2 size={32} className="text-rose-500" />
        <span className="mt-4 text-sm text-slate-400">正在建立安全通道...</span>
      </div>
    );
  }

  // 2. Error View (Token verification failed or lock not found)
  if (errorMsg || !lock) {
    return (
      <div className="flex h-[80dvh] flex-col items-center justify-center text-slate-100 p-6 text-center">
        <div className="rounded-full bg-red-500/10 border border-red-500/20 p-4">
          <ShieldAlert size={36} className="text-red-500" />
        </div>
        <h1 className="mt-4 text-xl font-bold">安全校验失败</h1>
        <p className="mt-2 text-xs text-slate-400 max-w-xs">
          {errorMsg || "无法识别此二维码链接，或开锁授权已失效。"}
        </p>
        <p className="text-[10px] text-slate-600 mt-4 max-w-xs">
          为了安全起见，非系统生成的合法二维码将无法访问此页面，请联系管理员重新获取。
        </p>
      </div>
    );
  }

  // 3. Success/Normal View
  const isOnline = !!lock.hasGateway;
  const normalizedVerificationCode = verificationCode.replace(/\D/g, "").slice(-4);
  const hasValidVerificationCode = normalizedVerificationCode.length === 4;

  return (
    <div className="flex min-h-[85dvh] flex-col justify-between bg-white p-4 text-slate-900 dark:bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] dark:text-slate-100 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-rose-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">扫码远程快捷开锁</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center my-8 text-center max-w-sm mx-auto w-full">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">扫码开锁</h1>
        <div className="mt-4 w-full rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-left shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">开锁前验证</div>
          <p className="mt-1.5 text-base font-black leading-7 text-rose-900 dark:text-rose-50 sm:text-lg">
            请输入
            <span className="rounded-md bg-amber-300 px-1.5 py-0.5 text-amber-950 dark:bg-amber-300 dark:text-amber-950">
              订单号后四位
            </span>
            <span className="px-1 text-rose-500 dark:text-rose-300">或者</span>
            <span className="rounded-md bg-yellow-300 px-1.5 py-0.5 text-yellow-950 dark:bg-yellow-300 dark:text-yellow-950">
              顾客手机后四位
            </span>
          </p>
        </div>

        <input
          inputMode="numeric"
          maxLength={4}
          value={verificationCode}
          onChange={(event) => {
            setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 4));
          }}
          placeholder="请输入 4 位数字"
          className="mt-6 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-center text-lg font-black tracking-[0.35em] text-slate-900 shadow-sm outline-none transition focus:border-rose-500/40 focus:ring-2 focus:ring-rose-500/15 dark:border-white/10 dark:bg-slate-950/40 dark:text-white"
        />

        <div className="mt-8 flex flex-col items-center justify-center w-full">
          <button
            type="button"
            onClick={handleUnlock}
            disabled={isUnlocking || !isOnline || !hasValidVerificationCode}
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer ${
              unlockSuccess
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : !isOnline || !hasValidVerificationCode
                ? "cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-700/50 dark:bg-slate-800 dark:text-slate-500"
                : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25 hover:shadow-rose-600/40 active:scale-95"
             }`}
           >
            {isUnlocking ? (
              <Loader2 size={36} />
            ) : unlockSuccess ? (
              <LockKeyholeOpen size={36} />
            ) : (
              <LockKeyhole size={36} />
            )}
            
            <span className="mt-2 text-sm font-black">
              {isUnlocking
                ? "开锁中..."
                : unlockSuccess
                ? "已成功开锁"
                : !isOnline
                ? "设备已离线"
                : !hasValidVerificationCode
                ? "先输入后四位"
                : "验证并开锁"}
            </span>
          </button>
          
          {!isOnline ? (
            <p className="mt-6 rounded-xl border border-red-500/15 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700 dark:bg-red-500/10 dark:text-red-300">
              警告：当前门锁已离线，无法通过云端远程开启。请前往门前使用本地蓝牙或物理钥匙。
            </p>
          ) : !hasValidVerificationCode ? (
            <p className="mt-6 rounded-xl border border-amber-500/15 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              请输入 4 位校验码后再执行开锁
            </p>
          ) : null}
        </div>

        <p className="mt-10 text-center text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
          如果还是打不开，请直接联系商家处理
        </p>
      </div>

    </div>
  );
}

export default function ScanUnlockPage() {
  return (
    <Suspense
        fallback={
          <div className="flex h-[80dvh] flex-col items-center justify-center text-slate-100 p-6">
            <Loader2 size={32} className="text-rose-500" />
            <span className="mt-4 text-sm text-slate-400">正在初始化页面...</span>
          </div>
        }
    >
      <ScanUnlockInner />
    </Suspense>
  );
}
