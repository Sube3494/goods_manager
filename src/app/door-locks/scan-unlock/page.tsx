"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Battery, Loader2, LockKeyhole, LockKeyholeOpen, ShieldAlert, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { TTLockLockDetail } from "@/lib/types";

function ScanUnlockInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const lockIdParam = searchParams.get("lockId");
  const lockId = lockIdParam ? Number(lockIdParam) : null;
  const token = searchParams.get("token") || "";

  const [lock, setLock] = useState<TTLockLockDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/ttlock/locks/${lockId}/public-unlock?token=${encodeURIComponent(token)}`, {
        method: "POST",
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
        <Loader2 size={32} className="animate-spin text-rose-500" />
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

  return (
    <div className="flex min-h-[85dvh] flex-col justify-between text-slate-100 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-rose-500" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">扫码远程快捷开锁</span>
        </div>
        <span className="text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
          安全通道已建立
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center my-8 text-center max-w-sm mx-auto w-full">
        <h1 className="text-2xl font-black tracking-tight text-foreground">{lock.lockAlias || lock.lockName}</h1>
        <p className="text-xs text-slate-400 mt-1">ID: {lock.lockId}</p>

        {/* Lock State Cards */}
        <div className="grid grid-cols-2 gap-3 w-full mt-6">
          <div className="bg-white/[0.02] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] text-slate-500 font-medium">当前电量</span>
            <div className="text-sm font-bold mt-1 flex items-center gap-1.5">
              <Battery size={14} className="text-emerald-500" />
              {lock.electricQuantity ? `${lock.electricQuantity}%` : "--"}
            </div>
          </div>
          <div className="bg-white/[0.02] dark:bg-white/[0.02] border border-border/50 rounded-xl p-3 flex flex-col items-center justify-center">
            <span className="text-[10px] text-slate-500 font-medium">设备状态</span>
            <div className={`text-sm font-bold mt-1 flex items-center gap-1.5 ${isOnline ? "text-emerald-500" : "text-slate-400"}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {isOnline ? "在线" : "离线"}
            </div>
          </div>
        </div>

        {/* Big Pulsating Lock Button */}
        <div className="mt-8 flex flex-col items-center justify-center w-full">
          <button
            type="button"
            onClick={handleUnlock}
            disabled={isUnlocking || !isOnline}
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all duration-300 relative cursor-pointer ${
              unlockSuccess
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-105"
                : !isOnline
                ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/25 hover:shadow-rose-600/40 active:scale-95"
            }`}
          >
            {isOnline && !unlockSuccess && !isUnlocking && (
              <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
            )}

            {isUnlocking ? (
              <Loader2 size={36} className="animate-spin" />
            ) : unlockSuccess ? (
              <LockKeyholeOpen size={36} className="animate-bounce" />
            ) : (
              <LockKeyhole size={36} />
            )}
            
            <span className="text-xs font-bold mt-2">
              {isUnlocking ? "开锁中..." : unlockSuccess ? "已成功开锁" : !isOnline ? "设备已离线" : "点击开锁"}
            </span>
          </button>
          
          {!isOnline && (
            <p className="mt-6 text-[11px] text-red-500 bg-red-500/5 border border-red-500/10 px-4 py-2.5 rounded-xl">
              警告：当前门锁已离线，无法通过云端远程开启。请前往门前使用本地蓝牙或物理钥匙。
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-[10px] text-center text-slate-600 border-t border-slate-800/80 pt-4">
        门锁系统安全加密保护中 · TTLOCK API V3
      </div>
    </div>
  );
}

export default function ScanUnlockPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80dvh] flex-col items-center justify-center text-slate-100 p-6">
          <Loader2 size={32} className="animate-spin text-rose-500" />
          <span className="mt-4 text-sm text-slate-400">正在初始化页面...</span>
        </div>
      }
    >
      <ScanUnlockInner />
    </Suspense>
  );
}
