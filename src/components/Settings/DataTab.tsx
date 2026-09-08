"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart2, Calendar, ChevronDown, ChevronUp, Cloud, Database, Download, Eye, RotateCcw, ShieldCheck, Trash2, TrendingUp, Upload, Users, Zap } from "lucide-react";
import { BackupModal } from "@/components/Settings/BackupModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  maxLoginDevices: number | "";
  setMaxLoginDevices: (val: number | "") => void;
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
  allowGalleryUpload, maxLoginDevices, setMaxLoginDevices, toggleGalleryUpload, requireLoginForLightbox, toggleRequireLoginForLightbox, gallerySortDesc, setGallerySortDesc,
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
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<string | null>(null);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);

  const showAnalytics = mode === "full";
  const showLogicControls = mode === "full";
  const showDangerZone = canManageDangerZone;

  const handleDeleteBackup = async () => {
    if (!deleteBackupTarget) return;
    setIsDeletingBackup(true);
    try {
      const res = await fetch(`/api/system/backup?fileName=${encodeURIComponent(deleteBackupTarget)}`, { method: "DELETE" });
      if (res.ok) {
        showToast("备份归档已成功删除", "success");
        setBackups((prev) => prev.filter((row) => row.name !== deleteBackupTarget));
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "删除失败", "error");
      }
    } catch {
      showToast("删除请求失败", "error");
    } finally {
      setIsDeletingBackup(false);
      setDeleteBackupTarget(null);
    }
  };

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
    <div className="min-w-0 space-y-6">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {overview.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-white/80 dark:bg-white/[0.03] p-4 shadow-2xs transition-all hover:border-primary/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">{item.label}</div>
            <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      {showAnalytics && (
        <section className="min-w-0 overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
          <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/25">
                  <BarChart2 size={17} />
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground">访问量统计</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">近期页面浏览与独立访客数据趋势分析。</p>
                </div>
              </div>
              <div className="inline-flex rounded-full border border-border/70 bg-muted/40 p-1">
                {(["7d", "30d", "12m"] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setAnalyticsRange(range)}
                    className={cn(
                      "rounded-full px-3.5 py-1 text-xs font-bold transition-all cursor-pointer",
                      analyticsRange === range
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {range === "7d" ? "近 7 天" : range === "30d" ? "近 30 天" : "近 12 月"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-3">
              {[
                { label: "今日访问", icon: Eye, color: "text-violet-500", bg: "bg-violet-500/10", pv: analytics?.today.pv ?? 0, uv: analytics?.today.uv ?? 0 },
                { label: "本月访问", icon: TrendingUp, color: "text-sky-500", bg: "bg-sky-500/10", pv: analytics?.month.pv ?? 0, uv: analytics?.month.uv ?? 0 },
                { label: "累计总量", icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10", pv: analytics?.total.pv ?? 0, uv: analytics?.total.uv ?? 0 },
              ].map((card) => (
                <div key={card.label} className={cn("rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs", isLoadingAnalytics && "animate-pulse")}>
                  <div className="flex items-center gap-2">
                    <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", card.bg)}><card.icon size={13} className={card.color} /></div>
                    <div className="text-xs font-black text-muted-foreground">{card.label}</div>
                  </div>
                  <div className="mt-2.5 text-2xl font-black tabular-nums leading-none text-foreground">{card.pv.toLocaleString()}</div>
                  <div className="mt-1 text-[11px] font-bold text-muted-foreground">浏览量 (PV)</div>
                  <div className="mt-2 text-lg font-black tabular-nums leading-none text-foreground/80">{card.uv.toLocaleString()}</div>
                  <div className="mt-0.5 text-[11px] font-bold text-muted-foreground">独立访客 (UV)</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs">
              <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-muted-foreground">
                <div className="flex items-center gap-1.5"><div className="h-1 w-4 rounded-full bg-violet-500" />浏览量 (PV)</div>
                <div className="flex items-center gap-1.5"><div className="w-4 border-t-2 border-dashed border-emerald-500" />独立访客 (UV)</div>
              </div>
              {isLoadingAnalytics ? (
                <div className="flex h-24 items-center justify-center"><div className="h-5 w-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" /></div>
              ) : trend.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-xs text-muted-foreground/50">暂无统计数据</div>
              ) : (
                <>
                  <svg viewBox="0 0 400 80" className="w-full" style={{ height: 80 }} preserveAspectRatio="none">
                    <defs><linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
                    {trend.length > 1 && <path d={`${path("pv", maxPV)} L400,80 L0,80 Z`} fill="url(#pvGrad)" />}
                    <path d={path("pv", maxPV)} fill="none" stroke="#8b5cf6" strokeWidth="2.5" />
                    <path d={path("uv", maxUV)} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="4 3" />
                  </svg>
                  <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] px-0.5">
                    {trend.map((point, index) => (
                      <span
                        key={`${point.label}-${index}`}
                        className={cn(
                          "truncate text-center text-[10px] font-medium text-muted-foreground/60",
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
        <section className="space-y-3.5 overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] p-5 shadow-sm backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/25">
              <ShieldCheck size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">业务与分享策略</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">控制相册访问门槛、设备并发登录上限及外部链接时效。</p>
            </div>
          </div>
          <div className="space-y-3 pt-1">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-black text-foreground">允许实物照片上传</div><div className="mt-0.5 text-xs text-muted-foreground">开启后，应用前端及管理台允许向存储中上传物理文件。</div></div>
              <Switch checked={allowGalleryUpload} onChange={toggleGalleryUpload} />
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-black text-foreground">实物相册需要登录</div><div className="mt-0.5 text-xs text-muted-foreground">开启后，游客无法浏览实物相册，必须登录后方可进入。</div></div>
              <Switch checked={requireLoginForLightbox} onChange={toggleRequireLoginForLightbox} />
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-black text-foreground">实物相册排序方式</div><div className="mt-0.5 text-xs text-muted-foreground">决定相册商品组默认按编号升序还是降序展示。</div></div>
              <CustomSelect value={gallerySortDesc ? "desc" : "asc"} triggerClassName="h-9 w-32 rounded-full border-border/80 bg-white dark:bg-white/5 text-xs font-bold shadow-2xs" onChange={(val) => { const next = val === "desc"; setGallerySortDesc(next); saveSettings({ gallerySortDesc: next }); }} options={[{ value: "desc", label: "编号降序" }, { value: "asc", label: "编号升序" }]} />
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-black text-foreground">同时登录设备数限制</div><div className="mt-0.5 text-xs text-muted-foreground">超出阈值将自动置换踢出最早在线的设备会话。</div></div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={maxLoginDevices ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") return setMaxLoginDevices("");
                    const num = parseInt(val, 10);
                    setMaxLoginDevices(Number.isNaN(num) ? "" : num);
                  }}
                  onBlur={() => {
                    const next = typeof maxLoginDevices === "number" && maxLoginDevices >= 1 ? Math.floor(maxLoginDevices) : 2;
                    setMaxLoginDevices(next);
                    saveSettings({ maxLoginDevices: next });
                  }}
                  className="h-9 w-20 rounded-full border border-border/80 bg-white dark:bg-white/5 px-2 text-center text-sm font-black outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <span className="text-xs font-bold text-muted-foreground">台</span>
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
              <div><div className="text-sm font-black text-foreground">外部分享链接有效期</div><div className="mt-0.5 text-xs text-muted-foreground">向外部发送的照片及视频直链自动失效时间。</div></div>
              <div className="flex items-center gap-2">
                <input type="number" min="1" value={shareExpireDuration ?? ""} onChange={(e) => { const val = e.target.value; if (val === "") return setShareExpireDuration(""); const num = parseInt(val); setShareExpireDuration(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ shareExpireDuration: num }, { silent: true }); }} onBlur={() => { if (shareExpireDuration === "" || (typeof shareExpireDuration === "number" && shareExpireDuration <= 0)) { setShareExpireDuration(1); saveSettings({ shareExpireDuration: 1 }); } }} className="h-9 w-18 rounded-full border border-border/80 bg-white dark:bg-white/5 px-2 text-center text-sm font-bold outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                <CustomSelect value={shareExpireUnit} triggerClassName="h-9 w-24 rounded-full border-border/80 bg-white dark:bg-white/5 text-xs font-bold shadow-2xs" onChange={(val) => { setShareExpireUnit(val as "minutes" | "hours" | "days"); saveSettings({ shareExpireUnit: val }); }} options={[{ value: "minutes", label: "分钟" }, { value: "hours", label: "小时" }, { value: "days", label: "天" }]} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4 overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] p-5 shadow-sm backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/25">
            <Database size={17} />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">数据备份与恢复</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{showDangerZone ? "统一管理数据快照、自动归档周期与 WebDAV 异地同步。" : "您可以在此导出系统快照，或下载历史归档备份文件。"}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Database size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-foreground">快速操作</div>
                <div className="mt-0.5 text-xs text-muted-foreground">手动快速触发导出或从归档包恢复系统。</div>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {showDangerZone && (
                <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                  <div>
                    <div className="text-sm font-black text-foreground">导入快照恢复</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">从外部 .pnk 备份文件还原系统全量数据。</div>
                  </div>
                  <button
                    onClick={openBackupImport}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs font-black text-foreground shadow-2xs transition-all hover:border-primary/40 hover:text-primary active:scale-95 cursor-pointer"
                  >
                    <Upload size={13} />
                    选择备份包
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                <div>
                  <div className="text-sm font-black text-foreground">全量数据导出</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">将数据库与核心配置打包为独立加密归档。</div>
                </div>
                <button
                  onClick={() => setBackupConfig({ isOpen: true, type: "export" })}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-xs font-black text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
                >
                  <Download size={13} />
                  立即导出
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-5 shadow-2xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-foreground">归档状态概览</div>
                <div className="mt-0.5 text-xs text-muted-foreground">当前归档数量、最新时间及调度模式。</div>
              </div>
              <div className="inline-flex w-fit rounded-full border border-border/70 bg-white/80 dark:bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground shadow-2xs">
                配额 {backups.length} / {backupRetention}
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3.5 shadow-2xs">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">可用归档</div>
                <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">{backups.length}</div>
                <div className="mt-1 text-xs text-muted-foreground">本地 {localBackupCount} · 云端 {cloudBackupCount}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3.5 shadow-2xs">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">最新归档</div>
                <div className="mt-1.5 text-xs font-black leading-snug text-foreground truncate">
                  {latestBackup ? formatLocalDateTime(new Date(latestBackup.createdAt)) : "暂无记录"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {latestBackup ? `${latestBackup.source === "webdav" ? "云端" : "本地"} · ${(latestBackup.size / 1024 / 1024).toFixed(2)} MB` : "待生成"}
                </div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3.5 shadow-2xs">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">调度策略</div>
                <div className="mt-1.5 text-xs font-black text-foreground">{backupEnabled ? "自动周期备份" : "仅手动导出"}</div>
                <div className={cn("mt-1.5 inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-black", backupEnabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {backupEnabled ? `每 ${backupIntervalValue}${backupIntervalUnit}` : "手动触发"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {showDangerZone ? (
          <div className="space-y-4">
            <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-5 shadow-2xs">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-black text-foreground">自动定时备份计划</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">周期执行全量归档，并在超出保留限额时自动淘汰最旧备份。</div>
                </div>
                <Switch checked={backupEnabled} onChange={(val) => { setBackupEnabled(val); saveSettings({ backupEnabled: val }); }} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
                <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-4 shadow-2xs">
                  <div className="text-sm font-black text-foreground">备份频率</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">自动快照生成时间间隔。</div>
                  <div className="mt-3.5 flex items-center gap-2">
                    <input type="number" min="1" value={backupIntervalValue} onChange={(e) => { const val = e.target.value; if (val === "") return setBackupIntervalValue(""); const num = parseInt(val); setBackupIntervalValue(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ backupIntervalValue: num }, { silent: true }); }} onBlur={() => { if (backupIntervalValue === "" || (typeof backupIntervalValue === "number" && backupIntervalValue <= 0)) { setBackupIntervalValue(1); saveSettings({ backupIntervalValue: 1 }); } }} className="h-9 w-20 rounded-full border border-border/80 bg-white dark:bg-white/5 px-2 text-center text-sm font-black outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                    <CustomSelect value={backupIntervalUnit} triggerClassName="h-9 w-24 rounded-full border border-border/80 bg-white dark:bg-white/5 text-xs font-bold shadow-2xs" onChange={(val) => { setBackupIntervalUnit(val); saveSettings({ backupIntervalUnit: val }); }} options={[{ value: "hours", label: "小时" }, { value: "days", label: "天" }, { value: "weeks", label: "周" }]} />
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-4 shadow-2xs">
                  <div className="text-sm font-black text-foreground">保留份数</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">达到上限后自动清理旧快照。</div>
                  <div className="mt-3.5 relative w-full max-w-[140px]">
                    <input type="number" min="1" max="100" value={backupRetention} onChange={(e) => { const val = e.target.value; if (val === "") return setBackupRetention(""); const num = parseInt(val); setBackupRetention(isNaN(num) ? "" : num); if (!isNaN(num)) saveSettings({ backupRetention: num }, { silent: true }); }} onBlur={() => { if (backupRetention === "" || (typeof backupRetention === "number" && backupRetention <= 0)) { setBackupRetention(10); saveSettings({ backupRetention: 10 }); } }} className="h-9 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 pl-4 pr-9 text-sm font-black outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/60">份</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-4 shadow-2xs">
                  <div className="text-sm font-black text-foreground">即时快照</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">立刻创建最新全量数据副本。</div>
                  <div className="mt-3.5">
                    <button onClick={handleManualBackup} disabled={isCreatingBackup} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-xs font-black text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-50 cursor-pointer">
                      {isCreatingBackup ? <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Zap size={13} fill="currentColor" />}
                      立即触发备份
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-5 shadow-2xs">
              <div role="button" tabIndex={0} onClick={() => setWebdavOpen(!webdavOpen)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWebdavOpen(!webdavOpen); } }} className="flex flex-col gap-4 cursor-pointer sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Cloud size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-black text-foreground">WebDAV 云端异地同步</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); void handleTestWebDAV(); }}
                        disabled={isTestingWebDAV}
                        title="测试 WebDAV 连接"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-white dark:bg-white/5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 shadow-2xs cursor-pointer"
                      >
                        {isTestingWebDAV ? <div className="h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" /> : <Cloud size={12} />}
                      </button>
                      {!webdavEnabled && <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">未启用</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">同步归档到群晖 NAS、坚果云或自建 WebDAV 服务器。</div>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 sm:justify-normal">
                  <div onClick={(e) => e.stopPropagation()}><Switch checked={webdavEnabled} onChange={(checked) => { setWebdavEnabled(checked); saveSettings({ webdavEnabled: checked }); if (checked) setWebdavOpen(true); }} /></div>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-white dark:bg-white/5 text-muted-foreground shadow-2xs">{webdavOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</div>
                </div>
              </div>
              {webdavOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} transition={{ duration: 0.2 }} className="mt-4 border-t border-border/40 pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input type="text" value={webdavUrl} onChange={(e) => { setWebdavUrl(e.target.value); saveSettings({ webdavUrl: e.target.value }, { silent: true }); }} placeholder="https://nas.example.com/dav" className="h-10 rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all sm:col-span-2" />
                    <input type="text" value={webdavUser} onChange={(e) => { setWebdavUser(e.target.value); saveSettings({ webdavUser: e.target.value }, { silent: true }); }} placeholder="WebDAV 账号" className="h-10 rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                    <input type="password" value={webdavPassword} onChange={(e) => { setWebdavPassword(e.target.value); saveSettings({ webdavPassword: e.target.value }, { silent: true }); }} placeholder="WebDAV 密码" className="h-10 rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                    <input type="text" value={webdavPath} onChange={(e) => { setWebdavPath(e.target.value); saveSettings({ webdavPath: e.target.value }, { silent: true }); }} placeholder="/GoodsManager/Backups" className="h-10 rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all sm:col-span-2" />
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl sm:rounded-[22px] border border-dashed border-border/80 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5">
            <div className="text-sm font-black text-foreground">自动计划任务与云端异地同步</div>
            <div className="mt-1 text-xs text-muted-foreground">该项能力需要系统设置或备份管理特权，当前账号仅可查看归档。</div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] shadow-2xs">
          <div className="flex flex-col gap-2 border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-sm font-black text-foreground">归档历史列表</div><div className="mt-0.5 text-xs text-muted-foreground">查看、下载或按需恢复已有数据归档文件。</div></div>
            <div className="rounded-full border border-border/60 bg-white dark:bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground shadow-2xs">配额 {backups.length} / {backupRetention}</div>
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
                  <div key={item.name} className="rounded-2xl border border-border/60 bg-white dark:bg-white/5 p-4 shadow-2xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-black text-foreground break-all">{item.name}</div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black", item.source === "webdav" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20")}>
                        {item.source === "webdav" ? "云端" : "本地"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>同步时间</span>
                        <span className="text-right font-medium">{formatLocalDateTime(new Date(item.createdAt))}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>文件体积</span>
                        <span className="font-mono">{(item.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    </div>
                    <div className="mt-3.5 flex items-center gap-2">
                      <button onClick={() => downloadBackupFile(item.name)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border border-border/80 bg-white dark:bg-white/5 text-xs font-bold text-primary shadow-2xs active:scale-95 cursor-pointer">
                        <Download size={13} />
                        下载
                      </button>
                      {showDangerZone && <button onClick={() => setBackupConfig({ isOpen: true, type: "import", file: { name: item.name } as File })} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400 active:scale-95 cursor-pointer"><RotateCcw size={13} />恢复</button>}
                      {showDangerZone && <button onClick={() => setDeleteBackupTarget(item.name)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-500/25 bg-rose-500/10 text-rose-500 active:scale-95 cursor-pointer" title="删除备份"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead><tr className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02]"><th className="px-5 py-3 font-black text-foreground">文件名</th><th className="px-5 py-3 text-center font-black text-foreground">生成时间</th><th className="px-5 py-3 text-right font-black text-foreground">文件体积</th><th className="px-5 py-3 text-center font-black text-foreground">操作</th></tr></thead>
              <tbody className="divide-y divide-border/40">
                {isLoadingBackups ? (
                  <tr><td colSpan={4} className="px-4 py-16 text-center"><div className="flex flex-col items-center gap-3"><div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" /><span className="text-xs text-muted-foreground">同步云端记录...</span></div></td></tr>
                ) : backups.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-20 text-center"><div className="flex flex-col items-center gap-3 opacity-40"><Database size={32} className="text-muted-foreground" /><div className="space-y-1"><p className="text-sm font-bold text-muted-foreground">暂无备份记录</p><p className="text-[10px] text-muted-foreground/60">开启自动备份后，系统会在这里展示归档文件。</p></div></div></td></tr>
                ) : (
                  backups.map((item) => (
                    <tr key={item.name} className="group transition-colors hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[240px] truncate font-mono text-xs text-foreground/85 group-hover:text-foreground font-semibold">{item.name}</span>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black", item.source === "webdav" ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20")}>
                            {item.source === "webdav" ? "云端" : "本地"}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-center tabular-nums text-muted-foreground"><div className="flex items-center justify-center gap-1.5"><Calendar size={11} className="opacity-40" />{formatLocalDateTime(new Date(item.createdAt))}</div></td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-muted-foreground font-mono">{(item.size / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="px-5 py-3"><div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => downloadBackupFile(item.name)} title="下载备份" className="flex h-7 w-7 items-center justify-center rounded-full text-primary hover:bg-primary/15 transition-all hover:scale-110 active:scale-95 cursor-pointer"><Download size={14} /></button>
                        {showDangerZone && <button onClick={() => setBackupConfig({ isOpen: true, type: "import", file: { name: item.name } as File })} title="从快照恢复" className="flex h-7 w-7 items-center justify-center rounded-full text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-all hover:scale-110 active:scale-95 cursor-pointer"><RotateCcw size={14} /></button>}
                        {showDangerZone && <button onClick={() => setDeleteBackupTarget(item.name)} title="删除备份" className="flex h-7 w-7 items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/15 transition-all hover:scale-110 active:scale-95 cursor-pointer"><Trash2 size={14} /></button>}
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

      <ConfirmModal
        isOpen={!!deleteBackupTarget}
        onClose={() => setDeleteBackupTarget(null)}
        onConfirm={handleDeleteBackup}
        title="删除备份归档"
        message={deleteBackupTarget ? `确定要删除归档文件「${deleteBackupTarget}」吗？此操作不可逆，已被清理的文件将无法找回。` : ""}
        confirmLabel="确认删除"
        cancelLabel="取消"
        variant="danger"
        confirmDisabled={isDeletingBackup}
      />
    </div>
  );
}
