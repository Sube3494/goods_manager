"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart2, Calendar, ChevronDown, ChevronUp, Cloud, Database, Download, Eye, RotateCcw, ShieldCheck, Trash2, TrendingUp, Upload, Users, Zap } from "lucide-react";
import { BackupModal } from "@/components/Settings/BackupModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { triggerBlobDownload, triggerBrowserDownload } from "@/lib/download";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

interface BackupFile { name: string; size: number; createdAt: string | Date; source?: "local" | "webdav"; fullPath?: string }
interface TrendPoint { label: string; pv: number; uv: number }
interface AnalyticsData { today: { pv: number; uv: number }; month: { pv: number; uv: number }; total: { pv: number; uv: number }; trend: TrendPoint[] }
interface DataTabProps {
  allowGalleryUpload: boolean;
  toggleGalleryUpload: () => void;
  requireLoginForLightbox: boolean;
  toggleRequireLoginForLightbox: () => void;
  gallerySortDesc: boolean;
  setGallerySortDesc: (val: boolean) => void;
  shareExpireDuration: number | "";
  setShareExpireDuration: (val: number | "") => void;
  shareExpireUnit: "minutes" | "hours" | "days";
  setShareExpireUnit: (val: "minutes" | "hours" | "days") => void;
  saveSettings: (newSettings: Record<string, unknown>, options?: { silent?: boolean }) => Promise<void>;
  mode?: "full" | "backup_only";
  canManageDangerZone?: boolean;
}

export function DataTab({
  allowGalleryUpload, toggleGalleryUpload, requireLoginForLightbox, toggleRequireLoginForLightbox, gallerySortDesc, setGallerySortDesc,
  shareExpireDuration, setShareExpireDuration, shareExpireUnit, setShareExpireUnit,
  saveSettings, mode = "full", canManageDangerZone = true,
}: DataTabProps) {
  const { showToast } = useToast();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "12m">("7d");
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupIntervalUnit, setBackupIntervalUnit] = useState("days");
  const [backupIntervalValue, setBackupIntervalValue] = useState<number | "">(1);
  const [backupRetention, setBackupRetention] = useState<number | "">(10);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [webdavEnabled, setWebdavEnabled] = useState(false);
  const [webdavUrl, setWebdavUrl] = useState("");
  const [webdavUser, setWebdavUser] = useState("");
  const [webdavPassword, setWebdavPassword] = useState("");
  const [webdavPath, setWebdavPath] = useState("");
  const [webdavOpen, setWebdavOpen] = useState(false);
  const [isTestingWebDAV, setIsTestingWebDAV] = useState(false);
  const [backupConfig, setBackupConfig] = useState<{ isOpen: boolean; type: "export" | "import"; file?: File }>({ isOpen: false, type: "export" });

  const showAnalytics = mode === "full";
  const showLogicControls = mode === "full";
  const showDangerZone = canManageDangerZone;

  const downloadBackupFile = (fileName: string) => {
    triggerBrowserDownload(`/api/system/backup/download?fileName=${encodeURIComponent(fileName)}`, fileName);
  };

  const openBackupImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pnk";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) setBackupConfig({ isOpen: true, type: "import", file });
    };
    input.click();
  };

  useEffect(() => {
    const run = async () => {
      setIsLoadingBackups(true);
      try {
        const [settingsRes, backupsRes, analyticsRes] = await Promise.all([
          fetch("/api/system/settings"),
          fetch("/api/system/backup"),
          showAnalytics ? fetch(`/api/analytics/stats?range=${analyticsRange}`) : Promise.resolve(null),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setBackupEnabled(data.backupEnabled ?? false);
          setBackupIntervalUnit(data.backupIntervalUnit || "days");
          setBackupIntervalValue(data.backupIntervalValue ?? 1);
          setBackupRetention(data.backupRetention ?? 10);
          setWebdavEnabled(data.webdavEnabled ?? false);
          setWebdavUrl(data.webdavUrl || "");
          setWebdavUser(data.webdavUser || "");
          setWebdavPassword(data.webdavPassword || "");
          setWebdavPath(data.webdavPath || "");
        }
        if (backupsRes.ok) setBackups(await backupsRes.json());
        if (analyticsRes?.ok) {
          setIsLoadingAnalytics(true);
          setAnalytics(await analyticsRes.json());
          setIsLoadingAnalytics(false);
        }
      } finally {
        setIsLoadingBackups(false);
        setIsLoadingAnalytics(false);
      }
    };
    run();
  }, [analyticsRange, showAnalytics]);

  const refreshBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch("/api/system/backup");
      if (res.ok) setBackups(await res.json());
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleManualBackup = async () => {
    setIsCreatingBackup(true);
    showToast("正在创建备份...", "info");
    try {
      const res = await fetch("/api/system/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || "备份失败", "error");
      showToast(data.webdav?.success ? `备份创建并已同步至 WebDAV: ${data.webdav.fullPath}` : "备份创建成功", "success");
      await refreshBackups();
    } catch {
      showToast("请求失败", "error");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleTestWebDAV = async () => {
    if (!webdavUrl) return showToast("请输入 WebDAV 服务器地址", "warning");
    setIsTestingWebDAV(true);
    try {
      const res = await fetch("/api/system/backup/test-webdav", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: webdavUrl, user: webdavUser, password: webdavPassword }) });
      const data = await res.json();
      showToast(res.ok ? data.message || "WebDAV 连接成功" : data.error || "连接测试失败", res.ok ? "success" : "error");
    } catch {
      showToast("连接请求失败", "error");
    } finally {
      setIsTestingWebDAV(false);
    }
  };

  const trend = analytics?.trend ?? [];
  const maxPV = trend.length ? Math.max(...trend.map((p) => p.pv), 1) : 1;
  const maxUV = trend.length ? Math.max(...trend.map((p) => p.uv), 1) : 1;
  const path = (key: "pv" | "uv", max: number) => trend.map((p, i) => `${i === 0 ? "M" : "L"}${trend.length > 1 ? (i / (trend.length - 1)) * 400 : 200},${80 - (p[key] / max) * 72}`).join(" ");
  const localBackupCount = backups.filter((item) => item.source !== "webdav").length;
  const cloudBackupCount = backups.filter((item) => item.source === "webdav").length;
  const latestBackup = backups[0];
  const overview = useMemo(() => [
    { label: "备份状态", value: backupEnabled ? "已开启" : "未开启", hint: backupEnabled ? `每 ${backupIntervalValue}${backupIntervalUnit}` : "当前仅支持手动导出" },
    { label: "归档数量", value: String(backups.length), hint: showDangerZone ? `当前最多保留 ${backupRetention} 份` : "当前账号仅可查看归档" },
    { label: "分享时效", value: `${shareExpireDuration || 1}${shareExpireUnit === "minutes" ? "分钟" : shareExpireUnit === "hours" ? "小时" : "天"}`, hint: "外部分享链接到期后自动失效" },
  ], [backupEnabled, backupIntervalUnit, backupIntervalValue, backups.length, backupRetention, shareExpireDuration, shareExpireUnit, showDangerZone]);

  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {overview.map((item) => (
          <div key={item.label} className="rounded-[20px] border border-border/60 bg-white/75 px-4 py-3.5 shadow-sm dark:bg-white/5 md:rounded-2xl md:py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">{item.label}</div>
            <div className="mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">{item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      {showAnalytics && (
        <section className="min-w-0 overflow-hidden rounded-[22px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5 md:rounded-[26px]">
          <div className="border-b border-border/50 bg-white/50 px-4 py-3.5 md:px-5 md:py-4 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25 md:h-10 md:w-10">
                  <BarChart2 size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-black text-foreground md:text-base">访问量统计</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">先看近期访问趋势，再决定是否需要调整分享策略和备份频率。</p>
                </div>
              </div>
              <div className="grid w-full grid-cols-3 rounded-xl border border-border/60 bg-background/70 p-1 sm:w-auto sm:inline-grid">
                {(["7d", "30d", "12m"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setAnalyticsRange(range)}
                    className={cn(
                      "rounded-lg px-1.5 py-2 text-[11px] font-black transition-all text-center sm:px-2 sm:py-1.5",
                      analyticsRange === range ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {range === "7d" ? "近7天" : range === "30d" ? "近30天" : "近12月"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4 p-3.5 md:space-y-5 md:p-5">
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
              {[
                { label: "今日访问", icon: Eye, color: "text-violet-500", bg: "bg-violet-500/10", pv: analytics?.today.pv ?? 0, uv: analytics?.today.uv ?? 0 },
                { label: "本月访问", icon: TrendingUp, color: "text-sky-500", bg: "bg-sky-500/10", pv: analytics?.month.pv ?? 0, uv: analytics?.month.uv ?? 0 },
                { label: "累计总量", icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10", pv: analytics?.total.pv ?? 0, uv: analytics?.total.uv ?? 0 },
              ].map((card) => (
                <div key={card.label} className={cn("min-w-0 rounded-[20px] border border-border/50 bg-background/75 px-4 py-3.5 shadow-sm md:rounded-2xl md:py-4", isLoadingAnalytics && "animate-pulse")}>
                  <div className="flex items-center gap-2">
                    <div className={cn("rounded-xl p-2", card.bg)}><card.icon size={13} className={card.color} /></div>
                    <div className="text-xs font-black text-muted-foreground">{card.label}</div>
                  </div>
                  <div className="mt-3 text-[30px] font-black tabular-nums leading-none text-foreground sm:text-2xl">{card.pv.toLocaleString()}</div>
                  <div className="mt-1 text-[11px] font-bold text-muted-foreground">页面被查看次数</div>
                  <div className="mt-3 text-[28px] font-black tabular-nums leading-none text-foreground/90 sm:text-lg">{card.uv.toLocaleString()}</div>
                  <div className="mt-1 text-[11px] font-bold text-muted-foreground">访问人数</div>
                </div>
              ))}
            </div>
            <div className="min-w-0 rounded-[20px] border border-border/50 bg-background/75 px-4 py-3.5 shadow-sm md:rounded-2xl md:py-4">
              <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="h-0.5 w-5 rounded bg-violet-500" />页面被查看次数</div>
                <div className="flex items-center gap-1.5"><div className="w-5 border-t-2 border-dashed border-emerald-500/70" />访问人数</div>
              </div>
              {isLoadingAnalytics ? (
                <div className="flex h-24 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" /></div>
              ) : trend.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-xs text-muted-foreground/50">暂无统计数据</div>
              ) : (
                <>
                  <svg viewBox="0 0 400 80" className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
                    <defs><linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
                    {trend.length > 1 && <path d={`${path("pv", maxPV)} L400,80 L0,80 Z`} fill="url(#pvGrad)" />}
                    <path d={path("pv", maxPV)} fill="none" stroke="#8b5cf6" strokeWidth="2" />
                    <path d={path("uv", maxUV)} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 3" />
                  </svg>
                  <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] px-0.5">
                    {trend.map((point, index) => (
                      <span
                        key={`${point.label}-${index}`}
                        className={cn(
                          "truncate text-center text-[9px] font-medium text-muted-foreground/50",
                          !(index === 0 || index === trend.length - 1 || (trend.length <= 12 && index % Math.ceil(trend.length / 6) === 0)) && "invisible"
                        )}
                      >
                        {point.label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {showLogicControls && (
        <section className="space-y-3 overflow-hidden rounded-[26px] border border-border/60 bg-white/75 p-4 shadow-sm dark:bg-white/5 md:p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/25"><ShieldCheck size={17} /></div>
            <div>
              <h3 className="text-base font-black text-foreground">业务与分享策略</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把上传、排序和分享时效拆开，避免日常配置和系统恢复混在一起。</p>
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-black text-foreground">允许实物照片上传</div><div className="mt-1 text-xs text-muted-foreground">开启后，应用前端及管理台会允许用户向后端存储上传物理文件。</div></div>
            <Switch checked={allowGalleryUpload} onChange={toggleGalleryUpload} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-black text-foreground">灯箱预览需要登录</div><div className="mt-1 text-xs text-muted-foreground">开启后，游客仍可浏览实物相册列表，但点击进入灯箱大图或视频预览时会先跳转登录。</div></div>
            <Switch checked={requireLoginForLightbox} onChange={toggleRequireLoginForLightbox} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-black text-foreground">实物相册排序方式</div><div className="mt-1 text-xs text-muted-foreground">决定实物相册中商品组默认按编号升序还是降序排列。</div></div>
            <CustomSelect value={gallerySortDesc ? "desc" : "asc"} triggerClassName="h-10 w-32 rounded-xl border-border bg-background text-xs font-bold" onChange={(val) => { const next = val === "desc"; setGallerySortDesc(next); saveSettings({ gallerySortDesc: next }); }} options={[{ value: "desc", label: "编号降序" }, { value: "asc", label: "编号升序" }]} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-background/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-black text-foreground">分享链接时效</div><div className="mt-1 text-xs text-muted-foreground">配置分享给外部的图片及视频链接在多长时间后自动失效。</div></div>
            <div className="flex items-center gap-2">
              <input type="number" min="1" value={shareExpireDuration ?? ""} onChange={(e) => { const val = e.target.value; if (val === "") return setShareExpireDuration(""); const num = parseInt(val); setShareExpireDuration(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ shareExpireDuration: num }, { silent: true }); }} onBlur={() => { if (shareExpireDuration === "" || (typeof shareExpireDuration === "number" && shareExpireDuration <= 0)) { setShareExpireDuration(1); saveSettings({ shareExpireDuration: 1 }); } }} className="h-10 w-16 rounded-xl border border-border bg-background px-2 text-center text-sm font-bold" />
              <CustomSelect value={shareExpireUnit} triggerClassName="h-10 w-24 rounded-xl border-border bg-background text-xs font-bold" onChange={(val) => { setShareExpireUnit(val as "minutes" | "hours" | "days"); saveSettings({ shareExpireUnit: val }); }} options={[{ value: "minutes", label: "分钟" }, { value: "hours", label: "小时" }, { value: "days", label: "天" }]} />
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 overflow-hidden rounded-[26px] border border-border/60 bg-white/75 p-4 shadow-sm dark:bg-white/5 md:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/25"><Database size={17} /></div>
          <div>
            <h3 className="text-base font-black text-foreground">备份与恢复</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{showDangerZone ? "安全操作和危险操作拆开展示，导出、计划备份和云端同步各归其位。" : "你可以在这里导出数据、查看归档并下载已有备份文件。"}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="overflow-hidden rounded-[32px] border border-emerald-500/15 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.18),transparent_34%),linear-gradient(140deg,rgba(236,253,245,0.96),rgba(255,255,255,0.98)_52%,rgba(15,23,42,0.05))] shadow-[0_24px_60px_-36px_rgba(16,185,129,0.38)] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_30%),linear-gradient(140deg,rgba(6,78,59,0.32),rgba(255,255,255,0.04)_56%,rgba(15,23,42,0.2))]">
            <div className="flex h-full flex-col justify-between gap-6 p-5 lg:p-6">
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-[22px] bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
                    <Database size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-lg font-black tracking-tight text-foreground">{showDangerZone ? "数据迁移与恢复中心" : "归档下载与离线导出"}</div>
                    <div className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
                      {showDangerZone ? "把恢复、导出和归档查看收进一个主操作区。常用动作放前面，说明收短一点，出问题时你能直接下手处理。" : "用于查看当前可见归档、下载备份文件，并按需导出一份新的离线备份。"}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">导入恢复</div>
                    <div className="mt-2 text-sm font-black text-foreground">支持自动识别</div>
                    <div className="mt-1 text-xs leading-6 text-muted-foreground">系统自动备份和手动导出包都能直接走这条入口。</div>
                  </div>
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">手动导出</div>
                    <div className="mt-2 text-sm font-black text-foreground">适合留档快照</div>
                    <div className="mt-1 text-xs leading-6 text-muted-foreground">迁移设备或做高风险操作前，先留一份完整备份更稳妥。</div>
                  </div>
                  <div className="rounded-[24px] border border-white/70 bg-white/80 px-4 py-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.05]">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">云端归档</div>
                    <div className="mt-2 text-sm font-black text-foreground">{cloudBackupCount > 0 ? `${cloudBackupCount} 份已同步` : "可并入历史列表"}</div>
                    <div className="mt-1 text-xs leading-6 text-muted-foreground">本地和 WebDAV 归档会合并展示，不再只看见单边记录。</div>
                  </div>
                </div>
              </div>
              <div className={cn("grid gap-3", showDangerZone ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
                {showDangerZone && (
                  <button
                    onClick={openBackupImport}
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-[22px] border border-emerald-500/20 bg-white/88 px-5 text-sm font-black text-emerald-700 shadow-[0_16px_40px_-28px_rgba(16,185,129,0.55)] transition-all hover:-translate-y-0.5 hover:border-emerald-500/35 hover:bg-emerald-50 dark:bg-white/[0.06] dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  >
                    <Upload size={16} />
                    导入恢复
                  </button>
                )}
                <button
                  onClick={() => setBackupConfig({ isOpen: true, type: "export" })}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-[22px] bg-slate-950 px-5 text-sm font-black text-white shadow-[0_20px_50px_-28px_rgba(15,23,42,0.8)] transition-all hover:-translate-y-0.5 hover:opacity-95 dark:bg-white dark:text-slate-950"
                >
                  <Download size={16} />
                  手动导出
                </button>
              </div>
            </div>
          </div>
          <div className="rounded-[32px] border border-border/60 bg-background/80 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-black text-foreground">备份历史摘要</div>
                <div className="mt-1 text-xs leading-6 text-muted-foreground">先看现在有多少归档、最近一次是什么时候，再决定恢复还是清理。</div>
              </div>
              <div className="rounded-full border border-border/60 bg-background px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
                配额 {backups.length} / {backupRetention}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-border/50 bg-background px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">可见归档</div>
                <div className="mt-2 text-3xl font-black tracking-tight text-foreground">{backups.length}</div>
                <div className="mt-2 text-xs text-muted-foreground">本地 {localBackupCount} 份，云端 {cloudBackupCount} 份</div>
              </div>
              <div className="rounded-[24px] border border-border/50 bg-background px-4 py-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">最近归档</div>
                <div className="mt-2 text-base font-black tracking-tight text-foreground">
                  {latestBackup ? formatLocalDateTime(new Date(latestBackup.createdAt)) : "暂无记录"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {latestBackup ? `${latestBackup.source === "webdav" ? "云端" : "本地"} · ${(latestBackup.size / 1024 / 1024).toFixed(2)} MB` : "创建或同步后会显示在这里"}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-[24px] border border-border/50 bg-background px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">当前策略</div>
                  <div className="mt-2 text-sm font-black text-foreground">{backupEnabled ? `自动备份已开启` : "当前为手动备份模式"}</div>
                </div>
                <div className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]", backupEnabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                  {backupEnabled ? `每 ${backupIntervalValue}${backupIntervalUnit}` : "Manual"}
                </div>
              </div>
              <div className="mt-3 text-xs leading-6 text-muted-foreground">
                {webdavEnabled ? "自动备份到期时会补跑，并尝试同步到 WebDAV；历史列表会合并展示两边归档。" : "自动备份会在到期时补跑；如果要同时保留云端副本，可以在下方开启 WebDAV。"}
              </div>
            </div>
          </div>
        </div>

        {showDangerZone ? (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-3xl border border-border/60 bg-background/75 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><div className="text-sm font-black text-foreground">自动备份计划</div><div className="mt-1 text-xs text-muted-foreground">配置定期全量备份、保留数量和手动触发方式。</div></div>
                <Switch checked={backupEnabled} onChange={(val) => { setBackupEnabled(val); saveSettings({ backupEnabled: val }); }} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-border/50 bg-background px-4 py-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">备份频率</div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" value={backupIntervalValue} onChange={(e) => { const val = e.target.value; if (val === "") return setBackupIntervalValue(""); const num = parseInt(val); setBackupIntervalValue(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ backupIntervalValue: num }, { silent: true }); }} onBlur={() => { if (backupIntervalValue === "" || (typeof backupIntervalValue === "number" && backupIntervalValue <= 0)) { setBackupIntervalValue(1); saveSettings({ backupIntervalValue: 1 }); } }} className="h-9 w-16 rounded-xl border border-border bg-background px-2 text-center text-sm font-bold" />
                    <CustomSelect value={backupIntervalUnit} triggerClassName="h-9 w-24 rounded-xl border-border bg-background text-xs font-bold" onChange={(val) => { setBackupIntervalUnit(val); saveSettings({ backupIntervalUnit: val }); }} options={[{ value: "hours", label: "小时" }, { value: "days", label: "天" }, { value: "weeks", label: "周" }]} />
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background px-4 py-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">保留份数</div>
                  <div className="relative">
                    <input type="number" min="1" max="100" value={backupRetention} onChange={(e) => { const val = e.target.value; if (val === "") return setBackupRetention(""); const num = parseInt(val); setBackupRetention(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ backupRetention: num }, { silent: true }); }} onBlur={() => { if (backupRetention === "" || (typeof backupRetention === "number" && backupRetention <= 0)) { setBackupRetention(10); saveSettings({ backupRetention: 10 }); } }} className="h-9 w-full rounded-xl border border-border bg-background pl-3 pr-10 text-sm font-bold" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/50">份</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-background px-4 py-4">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">立即执行</div>
                  <button onClick={handleManualBackup} disabled={isCreatingBackup} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[11px] font-black text-primary-foreground disabled:opacity-50">
                    {isCreatingBackup ? <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Zap size={12} fill="currentColor" />}
                    立即触发备份
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-background/75 p-5 shadow-sm">
              <div role="button" tabIndex={0} onClick={() => setWebdavOpen(!webdavOpen)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWebdavOpen(!webdavOpen); } }} className="flex flex-col gap-4 cursor-pointer sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Cloud size={16} /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><div className="text-sm font-black text-foreground">WebDAV 云端同步</div>{!webdavEnabled && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">已禁用</span>}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">将备份自动同步至远程 WebDAV 服务器，减少单机归档风险。</div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 sm:justify-normal">
                  <div onClick={(e) => e.stopPropagation()}><Switch checked={webdavEnabled} onChange={(checked) => { setWebdavEnabled(checked); saveSettings({ webdavEnabled: checked }); if (checked) setWebdavOpen(true); }} /></div>
                  <div className="rounded-lg border border-border/50 bg-background p-1 text-muted-foreground/50">{webdavOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</div>
                </div>
              </div>
              {webdavOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }} className="mt-4 space-y-3 border-t border-border/40 pt-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input type="text" value={webdavUrl} onChange={(e) => { setWebdavUrl(e.target.value); saveSettings({ webdavUrl: e.target.value }, { silent: true }); }} placeholder="https://nas.example.com/dav" className="h-10 rounded-xl border border-border bg-background px-4 text-xs md:col-span-2" />
                    <input type="text" value={webdavUser} onChange={(e) => { setWebdavUser(e.target.value); saveSettings({ webdavUser: e.target.value }, { silent: true }); }} placeholder="账号" className="h-10 rounded-xl border border-border bg-background px-4 text-xs" />
                    <input type="password" value={webdavPassword} onChange={(e) => { setWebdavPassword(e.target.value); saveSettings({ webdavPassword: e.target.value }, { silent: true }); }} placeholder="密码" className="h-10 rounded-xl border border-border bg-background px-4 text-xs" />
                    <input type="text" value={webdavPath} onChange={(e) => { setWebdavPath(e.target.value); saveSettings({ webdavPath: e.target.value }, { silent: true }); }} placeholder="/PickNote/Backups" className="h-10 rounded-xl border border-border bg-background px-4 text-xs md:col-span-2" />
                  </div>
                  <button onClick={handleTestWebDAV} disabled={isTestingWebDAV} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 text-xs font-black text-foreground disabled:opacity-50">
                    {isTestingWebDAV ? <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" /> : <Cloud size={12} />}
                    测试 WebDAV 连接
                  </button>
                </motion.div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border/70 bg-background/60 px-5 py-4">
            <div className="text-sm font-black text-foreground">自动备份与远程同步</div>
            <div className="mt-1 text-xs text-muted-foreground">这部分涉及全局计划任务、远程存储与系统恢复能力，仅超级管理员可调整。你仍然可以手动导出并下载现有归档。</div>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-border/60 bg-background/75 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border/50 bg-white/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:bg-white/[0.03]">
            <div><div className="text-sm font-black text-foreground">备份历史记录</div><div className="mt-1 text-xs text-muted-foreground">查看服务器已有归档，按需下载、恢复或删除。</div></div>
            <div className="rounded-full border border-border/60 bg-background px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">配额 {backups.length} / {backupRetention}</div>
          </div>
          <div className="block sm:hidden">
            {isLoadingBackups ? (
              <div className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <span className="text-xs text-muted-foreground">同步云端记录...</span>
                </div>
              </div>
            ) : backups.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <div className="flex flex-col items-center gap-3 opacity-40">
                  <Database size={28} className="text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-muted-foreground">暂无备份记录</p>
                    <p className="text-[10px] text-muted-foreground/60">开启自动备份后，系统会在这里展示归档文件。</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {backups.map((item) => (
                  <div key={item.name} className="rounded-2xl border border-border/50 bg-background px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-black text-foreground break-all">{item.name}</div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", item.source === "webdav" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                        {item.source === "webdav" ? "云端" : "本地"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>同步时间</span>
                        <span className="text-right">{formatLocalDateTime(new Date(item.createdAt))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>文件体积</span>
                        <span>{(item.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <button onClick={() => downloadBackupFile(item.name)} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background text-xs font-black text-primary">
                        <Download size={13} />
                        下载
                      </button>
                      {showDangerZone && <button onClick={() => setBackupConfig({ isOpen: true, type: "import", file: { name: item.name } as File })} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-xs font-black text-emerald-500"><RotateCcw size={13} />恢复</button>}
                      {showDangerZone && <button onClick={async () => { try { const res = await fetch(`/api/system/backup?fileName=${item.name}`, { method: "DELETE" }); if (res.ok) { showToast("备份已删除", "success"); setBackups((prev) => prev.filter((row) => row.name !== item.name)); } } catch { showToast("操作失败", "error"); } }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-[11px]">
              <thead><tr className="border-b border-border/30 bg-white/20 dark:bg-white/[0.03]"><th className="px-4 py-3 font-black text-muted-foreground/70">文件名</th><th className="px-4 py-3 text-center font-black text-muted-foreground/70">同步时间</th><th className="px-4 py-3 text-right font-black text-muted-foreground/70">文件体积</th><th className="px-4 py-3 text-center font-black text-muted-foreground/70">操作</th></tr></thead>
              <tbody className="divide-y divide-border/20">
                {isLoadingBackups ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center"><div className="flex flex-col items-center gap-3"><div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /><span className="text-xs text-muted-foreground">同步云端记录...</span></div></td></tr>
                ) : backups.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-20 text-center"><div className="flex flex-col items-center gap-3 opacity-40"><Database size={32} className="text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-bold text-muted-foreground">暂无备份记录</p><p className="text-[10px] text-muted-foreground/60">开启自动备份后，系统会在这里展示归档文件。</p></div></div></td></tr>
                ) : (
                  backups.map((item) => (
                    <tr key={item.name} className="group transition-colors hover:bg-white/20 dark:hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[180px] truncate font-mono text-muted-foreground group-hover:text-foreground">{item.name}</span>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", item.source === "webdav" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")}>
                            {item.source === "webdav" ? "云端" : "本地"}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center tabular-nums text-muted-foreground"><div className="flex items-center justify-center gap-1.5"><Calendar size={10} className="opacity-40" />{formatLocalDateTime(new Date(item.createdAt))}</div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted-foreground">{(item.size / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="px-4 py-3"><div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => downloadBackupFile(item.name)} className="rounded-lg p-1.5 text-primary hover:bg-primary/15"><Download size={14} /></button>
                        {showDangerZone && <button onClick={() => setBackupConfig({ isOpen: true, type: "import", file: { name: item.name } as File })} className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-500/15"><RotateCcw size={14} /></button>}
                        {showDangerZone && <button onClick={async () => { try { const res = await fetch(`/api/system/backup?fileName=${item.name}`, { method: "DELETE" }); if (res.ok) { showToast("备份已删除", "success"); setBackups((prev) => prev.filter((row) => row.name !== item.name)); } } catch { showToast("操作失败", "error"); } }} className="rounded-lg p-1.5 text-red-500 hover:bg-red-500/15"><Trash2 size={14} /></button>}
                      </div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <BackupModal isOpen={backupConfig.isOpen} type={backupConfig.type} file={backupConfig.file} requirePassword={false} onClose={() => setBackupConfig((prev) => ({ ...prev, isOpen: false }))} onAction={async (password: string, onProgress: (p: number) => void) => {
        onProgress(10);
        await new Promise((resolve) => setTimeout(resolve, 600));
        onProgress(35);
        if (backupConfig.type === "export") {
          const res = await fetch("/api/backup/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
          onProgress(85);
          if (!res.ok) { const err = await res.json(); throw new Error(err.error || "导出失败"); }
          const blob = await res.blob();
          onProgress(100);
          triggerBlobDownload(blob, `PickNote_备份数据_${new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "_").replace(/:/g, "")}.pnk`);
          return;
        }
        const isServerRestore = !backupConfig.file || !("size" in backupConfig.file);
        if (isServerRestore) {
          if (!backupConfig.file?.name) return;
          const res = await fetch("/api/system/backup/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: backupConfig.file.name, password }) });
          onProgress(90);
          if (!res.ok) { const err = await res.json(); throw new Error(err.error || "恢复失败"); }
        } else {
          if (!backupConfig.file) return;
          const formData = new FormData();
          formData.append("file", backupConfig.file);
          formData.append("password", password);
          const res = await fetch("/api/backup/import", { method: "POST", body: formData });
          onProgress(90);
          if (!res.ok) { const err = await res.json(); throw new Error(err.error || "恢复失败"); }
        }
        onProgress(100);
        setTimeout(() => window.location.reload(), 2000);
      }} />
    </div>
  );
}
