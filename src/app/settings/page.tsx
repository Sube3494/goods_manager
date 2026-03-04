"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Database, Zap, Moon, Sun, Monitor, Download, Upload, Info, BarChart2, Users, Eye, TrendingUp, Trash2, Clock, Calendar, Cloud, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { BackupModal } from "@/components/Settings/BackupModal";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/dateUtils";

interface BackupFile {
  name: string;
  size: number;
  createdAt: string | Date;
}

interface SystemInfo {
  version: string;
  dbType: string;
  nodeVersion: string;
  lastBackup: string;
}

interface TrendPoint { label: string; pv: number; uv: number; }
interface AnalyticsData {
  today: { pv: number; uv: number };
  month: { pv: number; uv: number };
  total: { pv: number; uv: number };
  trend: TrendPoint[];
}

// View transitions types are built into modern TS versions, but we'll use a safer approach for the animation logic below.

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">准备配置中心...</div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [lowStockThreshold, setLowStockThreshold] = useState<number | "">(10);
  const [allowGalleryUpload, setAllowGalleryUpload] = useState<boolean>(true);
  const [gallerySortDesc, setGallerySortDesc] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<"7d" | "30d" | "12m">("7d");
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  
  // Backup settings
  const [backupEnabled, setBackupEnabled] = useState<boolean>(false);
  const [backupIntervalUnit, setBackupIntervalUnit] = useState<string>("days");
  const [backupIntervalValue, setBackupIntervalValue] = useState<number | "">(1);
  const [backupRetention, setBackupRetention] = useState<number | "">(10);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  
  // WebDAV settings
  const [webdavEnabled, setWebdavEnabled] = useState<boolean>(false);
  const [webdavUrl, setWebdavUrl] = useState<string>("");
  const [webdavUser, setWebdavUser] = useState<string>("");
  const [webdavPassword, setWebdavPassword] = useState<string>("");
  const [webdavPath, setWebdavPath] = useState<string>("");
  const [webdavManualOpen, setWebdavManualOpen] = useState(false);
  const [isTestingWebDAV, setIsTestingWebDAV] = useState(false);

  // Initialize tab based on search params
  const initialTab = (searchParams.get("tab") as "general" | "storage" | "data" | "system") || "general";
  const [activeTab, setActiveTab] = useState<"general" | "storage" | "data" | "system">(initialTab);

  const [backupConfig, setBackupConfig] = useState<{
      isOpen: boolean;
      type: "export" | "import";
      file?: File;
  }>({ isOpen: false, type: "export" });

  const tabs = [
    { id: "general", label: "常规设置", icon: Zap },
    { id: "storage", label: "存储中心", icon: Database },
    { id: "data", label: "数据管理", icon: ShieldCheck },
    { id: "system", label: "关于系统", icon: Info },
  ] as const;

  // Storage settings
  const [storageType, setStorageType] = useState<"local" | "minio">("local");
  const [minioEndpoint, setMinioEndpoint] = useState("");
  const [minioPort, setMinioPort] = useState<number | "">("");
  const [minioAccessKey, setMinioAccessKey] = useState("");
  const [minioSecretKey, setMinioSecretKey] = useState("");
  const [minioBucket, setMinioBucket] = useState("");
  const [minioUseSSL, setMinioUseSSL] = useState(true);
  const [minioPublicUrl, setMinioPublicUrl] = useState("");
  const [uploadConflictStrategy, setUploadConflictStrategy] = useState<"overwrite" | "rename" | "skip">("rename");
  const [shareExpireDuration, setShareExpireDuration] = useState<number | "">(1);
  const [shareExpireUnit, setShareExpireUnit] = useState<"minutes" | "hours" | "days">("hours");
  // Use refs to track last saved values to prevent initial auto-save and loops
  const lastSavedSettings = useRef<Record<string, unknown>>({});
  // Add a ref to track if we should verify changes, only true after initial load
  const isInitialized = useRef(false);

  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/system/settings/test-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageType,
          minioEndpoint,
          minioPort,
          minioAccessKey,
          minioSecretKey,
          minioBucket,
          minioUseSSL
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "连接测试成功", "success");
      } else {
        showToast(data.error || "连接测试失败", "error");
      }
    } catch {
      showToast("连接请求失败", "error");
    } finally {
      setIsTesting(false);
    }
  };

  const fetchAnalytics = async (range: "7d" | "30d" | "12m") => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/analytics/stats?range=${range}`);
      if (res.ok) setAnalytics(await res.json());
    } catch { /* 静默失败 */ } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch("/api/system/backup");
      if (res.ok) setBackups(await res.json());
    } catch { /* 静默失败 */ } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleManualBackup = async () => {
    setIsCreatingBackup(true);
    showToast("正在创建备份...", "info");
    try {
      const res = await fetch("/api/system/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.webdav?.success) {
            showToast(`备份创建并已同步至 WebDAV: ${data.webdav.fullPath}`, "success");
        } else if (data.webdav?.success === false) {
            showToast(`备份创建成功，但 WebDAV 同步失败: ${data.webdav.error}`, "warning");
        } else {
            showToast("备份创建成功", "success");
        }
        fetchBackups();
      } else {
        showToast(data.error || "备份失败", "error");
      }
    } catch {
      showToast("请求失败", "error");
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (fileName: string) => {
    try {
      const res = await fetch(`/api/system/backup?fileName=${fileName}`, { method: "DELETE" });
      if (res.ok) {
        showToast("备份已删除", "success");
        setBackups(prev => prev.filter(b => b.name !== fileName));
      }
    } catch {
      showToast("操作失败", "error");
    }
  };

  const handleDownloadBackup = (fileName: string) => {
    window.open(`/api/system/backup/download?fileName=${fileName}`, '_blank');
  };

  const handleTestWebDAV = async () => {
    if (!webdavUrl) {
      showToast("请输入 WebDAV 服务器地址", "warning");
      return;
    }
    setIsTestingWebDAV(true);
    try {
      const res = await fetch("/api/system/backup/test-webdav", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webdavUrl, user: webdavUser, password: webdavPassword })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "WebDAV 连接成功", "success");
      } else {
        showToast(data.error || "连接测试失败", "error");
      }
    } catch {
      showToast("连接请求失败", "error");
    } finally {
      setIsTestingWebDAV(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
        try {
            const [settingsRes, infoRes] = await Promise.all([
                fetch("/api/system/settings"),
                fetch("/api/system/info")
            ]);

            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setLowStockThreshold(data.lowStockThreshold);
                setAllowGalleryUpload(data.allowGalleryUpload ?? true);
                setGallerySortDesc(data.gallerySortDesc ?? true);
                
                // Storage settings
                setStorageType(data.storageType || "local");
                setMinioEndpoint(data.minioEndpoint || "");
                setMinioPort(data.minioPort || "");
                setMinioAccessKey(data.minioAccessKey || "");
                setMinioSecretKey(data.minioSecretKey || "");
                setMinioBucket(data.minioBucket || "");
                setMinioUseSSL(data.minioUseSSL ?? true);
                setMinioPublicUrl(data.minioPublicUrl || "");
                setUploadConflictStrategy(
                    data.uploadConflictStrategy || "uuid"
                );
                setShareExpireDuration(data.shareExpireDuration ?? 1);
                setShareExpireUnit(data.shareExpireUnit || "hours");
                
                // Backup settings
                setBackupEnabled(data.backupEnabled ?? false);
                setBackupIntervalUnit(data.backupIntervalUnit || "days");
                setBackupIntervalValue(data.backupIntervalValue ?? 1);
                setBackupRetention(data.backupRetention ?? 10);
                
                // WebDAV settings
                setWebdavEnabled(data.webdavEnabled ?? false);
                setWebdavUrl(data.webdavUrl || "");
                setWebdavUser(data.webdavUser || "");
                setWebdavPassword(data.webdavPassword || "");
                setWebdavPath(data.webdavPath || "");

                lastSavedSettings.current = data;
            }

            if (infoRes.ok) {
                setSystemInfo(await infoRes.json());
            }
        } catch (_error) {
            console.error("Failed to load settings:", _error);
            showToast("加载配置失败", "error");
        } finally {
            setIsLoading(false);
            // Small delay to allow state to settle before enabling auto-save monitoring
            setTimeout(() => { isInitialized.current = true; }, 100);
        }
    };
    initData();
  }, [showToast]);

  // 当切换到「数据管理」tab 或切换 range 时加载 analytics
  useEffect(() => {
    if (activeTab === "data") {
      fetchAnalytics(analyticsRange);
      fetchBackups();
    }
  }, [activeTab, analyticsRange]);

  const saveSettings = useCallback(async (newSettings: Record<string, unknown>, options: { silent?: boolean } = {}) => {
    setSaveStatus("saving");
    
    // Merge with current state (or provided overrides)
    const payload = {
        lowStockThreshold,
        allowGalleryUpload,
        gallerySortDesc,
        storageType,
        minioEndpoint,
        minioPort,
        minioAccessKey,
        minioSecretKey,
        minioBucket,
        minioUseSSL,
        minioPublicUrl,
        uploadConflictStrategy,
        shareExpireDuration,
        shareExpireUnit,
        backupEnabled,
        backupIntervalUnit,
        backupIntervalValue,
        backupRetention,
        webdavEnabled,
        webdavUrl,
        webdavUser,
        webdavPassword,
        webdavPath,
        ...newSettings
    };

    try {
      const res = await fetch("/api/system/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setSaveStatus("saved");
        lastSavedSettings.current = { ...lastSavedSettings.current, ...payload };
        if (!options.silent) {
            showToast("系统设置已更新", "success");
        }
      } else {
        setSaveStatus("error");
        showToast("自动保存失败", "error");
      }
    } finally {
      // Done saving
    }
  }, [
    lowStockThreshold, 
    allowGalleryUpload, 
    gallerySortDesc,
    storageType, 
    minioEndpoint, 
    minioPort, 
    minioAccessKey, 
    minioSecretKey, 
    minioBucket, 
    minioUseSSL, 
    minioPublicUrl, 
    uploadConflictStrategy, 
    shareExpireDuration,
    shareExpireUnit,
    backupEnabled,
    backupIntervalUnit,
    backupIntervalValue,
    backupRetention,
    webdavEnabled,
    webdavUrl,
    webdavUser,
    webdavPassword,
    webdavPath,
    showToast
  ]);

  // Debounced save for text inputs
  useEffect(() => {
    if (!isInitialized.current) return;
    if (lowStockThreshold === lastSavedSettings.current.lowStockThreshold) return;

    const timer = setTimeout(() => {
      saveSettings({ lowStockThreshold }, { silent: true });
    }, 800);

    return () => clearTimeout(timer);
  }, [lowStockThreshold, saveSettings]);

  // Debounced save for WebDAV settings
  useEffect(() => {
    if (!isInitialized.current) return;
    if (webdavUrl === lastSavedSettings.current.webdavUrl && 
        webdavUser === lastSavedSettings.current.webdavUser && 
        webdavPassword === lastSavedSettings.current.webdavPassword &&
        webdavPath === lastSavedSettings.current.webdavPath) return;

    const timer = setTimeout(() => {
      saveSettings({ webdavUrl, webdavUser, webdavPassword, webdavPath }, { silent: true });
    }, 1000);

    return () => clearTimeout(timer);
  }, [webdavUrl, webdavUser, webdavPassword, webdavPath, saveSettings]);

  // Sync tab from URL if it changes while on page
  useEffect(() => {
    const tab = searchParams.get("tab") as "general" | "storage" | "data" | "system";
    if (tab && ["general", "storage", "data", "system"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Immediate save for toggle
  const toggleGalleryUpload = () => {
    const newValue = !allowGalleryUpload;
    setAllowGalleryUpload(newValue);
    saveSettings({ allowGalleryUpload: newValue });
  };



  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">读取系统配置中...</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Unified Header with Auto-save Status */}
      <div className="relative flex flex-col gap-2 mb-6">
        <div className="flex-1 min-w-0 pr-24 sm:pr-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            系统管理
          </h1>
          <p className="text-muted-foreground mt-1 text-xs sm:text-sm">
            配置全局核心逻辑、文件仓库与数据安全。
          </p>
        </div>
        <div className="absolute top-0 right-0 flex items-center gap-2 bg-muted/30 px-2.5 py-1.5 rounded-xl border border-border/50 backdrop-blur-sm shrink-0 shadow-sm">
          {saveStatus === "saving" && (
            <div className="flex items-center gap-1.5 text-primary font-bold text-[10px]">
              <div className="h-1 w-1 bg-primary rounded-full animate-ping" />
              正在同步
            </div>
          )}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-1.5 text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
              <ShieldCheck size={12} className="text-emerald-500" />
              已同步
            </div>
          )}
          {saveStatus === "error" && <span className="text-[10px] text-red-500 font-bold">同步失败</span>}
        </div>
      </div>

      {/* Tab Navigation - Segmented Control Style */}
      <div className="flex p-1 bg-muted/40 backdrop-blur-md rounded-xl border border-border/50 max-w-full overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1 min-w-max">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300",
                  isActive 
                    ? "text-white dark:text-slate-900" 
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <tab.icon size={14} className={isActive ? "text-white dark:text-slate-900" : "text-muted-foreground/60"} />
                <span>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeSettingTab"
                    className="absolute inset-0 bg-slate-900 dark:bg-white rounded-lg -z-10 shadow-md ring-1 ring-black/5"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

        <div className="grid grid-cols-1 w-full gap-6 pt-6 min-w-0 overflow-hidden">
          {/* Content sections will be rendered here based on activeTab */}
          {activeTab === "general" && (
            <div key="general" className="space-y-6">
              {/* Personalization Section */}
              <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/50 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/30">
                      <Monitor size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">个性化设置</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">定制你的工作环境视觉风格</p>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">界面主题</h4>
                      <p className="text-xs text-muted-foreground mt-1">切换系统外观模式，适应不同的光照环境。</p>
                    </div>
                    <div className="flex bg-muted/50 p-1 rounded-xl w-fit shrink-0 backdrop-blur-sm self-start sm:self-center">
                      {[
                        { id: 'light', label: '浅色', icon: Sun },
                        { id: 'dark', label: '深色', icon: Moon }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            if (theme === t.id) return;
                            const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
                            if (!doc.startViewTransition) {
                              setTheme(t.id);
                              return;
                            }
                            const transition = doc.startViewTransition(() => setTheme(t.id));
                            if (transition) {
                              const x = e.clientX;
                              const y = e.clientY;
                              const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                              transition.ready.then(() => {
                                const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];
                                document.documentElement.animate(
                                  { clipPath: clipPath },
                                  { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" }
                                );
                              });
                            }
                          }}
                          className={cn(
                            "flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold",
                            theme === t.id 
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' 
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <t.icon size={14} className={theme === t.id ? "text-white dark:text-slate-900" : ""} />
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inventory Logic Section */}
              <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/30">
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">库存逻辑</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">定义全局财务与缺货预警规则</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <label className="text-sm font-bold text-foreground">库存低位预警阈值</label>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        当商品库存数量低于此数值时，系统将会在首页及库存列表中标记为“预警”状态。
                      </p>
                    </div>
                    <div className="relative w-full sm:w-32 shrink-0">
                      <input
                        type="number"
                        value={lowStockThreshold ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setLowStockThreshold("");
                          } else {
                            const num = parseInt(val);
                            setLowStockThreshold(isNaN(num) ? "" : num);
                            if (!isNaN(num)) saveSettings({ lowStockThreshold: num }, { silent: true });
                          }
                        }}
                        onBlur={() => {
                          if (lowStockThreshold === "" || (typeof lowStockThreshold === 'number' && lowStockThreshold < 0)) {
                            setLowStockThreshold(10);
                            saveSettings({ lowStockThreshold: 10 });
                          }
                        }}
                        className="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-3 pr-10 text-base font-mono font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none no-spinner text-center"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground/40 pointer-events-none">
                        件
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {activeTab === "data" && (
            <div key="data" className="space-y-6 w-full min-w-0">
              {/* Analytics Panel */}
              {(() => {
                const maxPV = analytics?.trend?.length
                  ? Math.max(...analytics.trend.map((p) => p.pv), 1)
                  : 1;
                const maxUV = analytics?.trend?.length
                  ? Math.max(...analytics.trend.map((p) => p.uv), 1)
                  : 1;
                const W = 400, H = 80, pts = analytics?.trend ?? [];
                const toX = (i: number) => pts.length > 1 ? (i / (pts.length - 1)) * W : W / 2;
                const toPVY = (v: number) => H - (v / maxPV) * (H - 8);
                const toUVY = (v: number) => H - (v / maxUV) * (H - 8);
                const pvPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toPVY(p.pv).toFixed(1)}`).join(" ");
                const uvPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toUVY(p.uv).toFixed(1)}`).join(" ");

                return (
                  <div className="glass-panel w-full rounded-2xl border border-border overflow-hidden min-w-0">
                    {/* Header */}
                    <div className="p-4 md:p-5 border-b border-border/50 bg-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <div className="p-2 rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/30 shrink-0">
                          <BarChart2 size={16} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-foreground">访问量统计</h3>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">全站 PV / UV 统计</p>
                        </div>
                      </div>
                      {/* Range Switcher */}
                      <div className="flex bg-muted/50 p-0.5 rounded-lg self-start sm:self-auto shrink-0">
                        {(["7d", "30d", "12m"] as const).map((r) => (
                          <button
                            key={r}
                            onClick={() => setAnalyticsRange(r)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[10px] font-bold",
                              analyticsRange === r
                                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {r === "7d" ? "近7天" : r === "30d" ? "近30天" : "近12月"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 md:p-5 space-y-5">
                      {/* 三个数字卡片 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                          {
                            label: "今日访问",
                            icon: Eye,
                            color: "text-violet-500",
                            bg: "bg-violet-500/10",
                            ring: "ring-violet-500/20",
                            pv: analytics?.today.pv ?? 0,
                            uv: analytics?.today.uv ?? 0,
                          },
                          {
                            label: "本月访问",
                            icon: TrendingUp,
                            color: "text-blue-500",
                            bg: "bg-blue-500/10",
                            ring: "ring-blue-500/20",
                            pv: analytics?.month.pv ?? 0,
                            uv: analytics?.month.uv ?? 0,
                          },
                          {
                            label: "累计总量",
                            icon: Users,
                            color: "text-emerald-500",
                            bg: "bg-emerald-500/10",
                            ring: "ring-emerald-500/20",
                            pv: analytics?.total.pv ?? 0,
                            uv: analytics?.total.uv ?? 0,
                          },
                        ].map((card, idx) => (
                          <div
                            key={card.label}
                            className={cn(
                              "relative rounded-xl border border-border p-3 space-y-2 overflow-hidden bg-white/5 dark:bg-white/3 min-w-0",
                              isLoadingAnalytics && "animate-pulse",
                              idx === 2 && "sm:col-span-2 lg:col-span-1"
                            )}
                          >
                            <div className="flex items-center gap-1.5">
                              <div className={cn("p-1 rounded-lg ring-1", card.bg, card.ring)}>
                                <card.icon size={11} className={card.color} />
                              </div>
                              <span className="text-[10px] font-bold text-muted-foreground">{card.label}</span>
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-baseline gap-1">
                                <span className="text-xl font-black text-foreground tabular-nums">
                                  {card.pv.toLocaleString()}
                                </span>
                                <span className="text-[9px] font-bold text-muted-foreground/60">PV</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-muted-foreground tabular-nums">
                                  {card.uv.toLocaleString()}
                                </span>
                                <span className="text-[9px] font-bold text-muted-foreground/50">UV</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* SVG 趋势图 */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <div className="h-0.5 w-4 rounded bg-violet-500" />
                            PV 浏览量
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 border-t-2 border-dashed border-emerald-500/70" />
                            UV 独立访客
                          </div>
                        </div>
                        <div className="relative w-full overflow-hidden rounded-xl bg-muted/30 border border-border/40 p-3">
                          {isLoadingAnalytics ? (
                            <div className="h-20 flex items-center justify-center">
                              <div className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                            </div>
                          ) : pts.length === 0 ? (
                            <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/50">暂无数据</div>
                          ) : (
                            <>
                              <svg
                                viewBox={`0 0 ${W} ${H}`}
                                className="w-full"
                                style={{ height: 80 }}
                                preserveAspectRatio="none"
                              >
                                <defs>
                                  <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                {/* PV area fill */}
                                {pts.length > 1 && (
                                  <path
                                    d={`${pvPath} L${toX(pts.length - 1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`}
                                    fill="url(#pvGrad)"
                                  />
                                )}
                                {/* PV line */}
                                <path d={pvPath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                {/* UV line */}
                                <path d={uvPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3" />
                                {/* PV dots */}
                                {pts.map((p, i) => (
                                  <circle key={i} cx={toX(i)} cy={toPVY(p.pv)} r="2.5" fill="#8b5cf6" />
                                ))}
                              </svg>
                              {/* X 轴标签（只显示首尾及中间部分） */}
                              <div className="flex justify-between mt-1 px-0.5">
                                {pts.map((p, i) => {
                                  const show = i === 0 || i === pts.length - 1 || (pts.length <= 12 && i % Math.ceil(pts.length / 6) === 0);
                                  return (
                                    <span key={i} className={cn("text-[9px] text-muted-foreground/50 font-medium", !show && "invisible")}>
                                      {p.label}
                                    </span>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Data Management Section */}

              <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/50 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/30">
                      <Database size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">数据逻辑控制</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">控制业务数据的导入权限与备份机制</p>
                    </div>
                  </div>
                </div>

                <div className="p-0 divide-y divide-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">允许实物照片上传</h4>
                      <p className="text-xs text-muted-foreground mt-1 text-pretty">开启后，应用前端及管理台将允许用户向后端存储上传物理文件。</p>
                    </div>
                    <div className="shrink-0 self-start sm:self-center">
                      <Switch
                        checked={allowGalleryUpload}
                        onChange={toggleGalleryUpload}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">实物相册排序方式控制</h4>
                      <p className="text-xs text-muted-foreground mt-1 text-pretty">配置实物相册中商品组的排列顺序。降序：最新/最大编号在前；升序：最小编号在前。</p>
                    </div>
                    <div className="shrink-0 self-start sm:self-center">
                      <CustomSelect
                        value={gallerySortDesc ? "desc" : "asc"}
                        triggerClassName="h-9 w-32 rounded-lg border-border bg-white dark:bg-white/5 text-xs font-bold"
                        onChange={(val) => {
                          const newValue = val === "desc";
                          setGallerySortDesc(newValue);
                          saveSettings({ gallerySortDesc: newValue });
                        }}
                        options={[
                          { value: "desc", label: "编号降序" },
                          { value: "asc", label: "编号升序" }
                        ]}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">分享链接时效</h4>
                      <p className="text-xs text-muted-foreground mt-1">配置分享给外部的图片及视频链接多久后自动失效。</p>
                    </div>
                    <div className="flex items-center gap-2 w-fit">
                      <input
                        type="number"
                        min="1"
                        value={shareExpireDuration ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            setShareExpireDuration("");
                          } else {
                            const num = parseInt(val);
                            setShareExpireDuration(isNaN(num) ? "" : num);
                            if (!isNaN(num)) saveSettings({ shareExpireDuration: num }, { silent: true });
                          }
                        }}
                        onBlur={() => {
                          if (shareExpireDuration === "" || (typeof shareExpireDuration === 'number' && shareExpireDuration <= 0)) {
                            setShareExpireDuration(1);
                            saveSettings({ shareExpireDuration: 1 });
                          }
                        }}
                        className="w-16 h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-2 text-center text-sm transition-all focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      <CustomSelect
                        value={shareExpireUnit}
                        triggerClassName="h-9 w-24 rounded-lg border-border bg-white dark:bg-white/5 text-xs"
                        onChange={(val) => {
                          setShareExpireUnit(val as "minutes" | "hours" | "days");
                          saveSettings({ shareExpireUnit: val });
                        }}
                        options={[
                          { value: "minutes", label: "分钟" },
                          { value: "hours", label: "小时" },
                          { value: "days", label: "天" }
                        ]}
                      />
                    </div>
                  </div>


                  <div className="p-4 md:p-5 bg-muted/5 backdrop-blur-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-foreground">数据迁移与离线管理 (导入/导出)</h4>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 text-balance">
                          用于跨设备数据转移、手动下载冷备份或在紧急情况下从本地文件恢复系统。
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file";
                            input.accept = ".pnk";
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) setBackupConfig({ isOpen: true, type: "import", file });
                            };
                            input.click();
                          }}
                          className="h-9 px-4 rounded-xl bg-white dark:bg-white/5 border border-border hover:bg-muted text-xs font-bold transition-all flex items-center gap-2"
                        >
                          <Upload size={14} className="text-emerald-500" />
                          导入恢复
                        </button>
                        <button
                          onClick={() => setBackupConfig({ isOpen: true, type: "export" })}
                          className="h-9 px-4 rounded-xl bg-white dark:bg-white/5 border border-border hover:bg-muted text-xs font-bold transition-all flex items-center gap-2"
                        >
                          <Download size={14} />
                          手动导出
                        </button>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-border/40">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-foreground font-number">自动备份配置</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            配置系统定期全量自动备份，并将结果直接存储在服务器本地空间中。
                          </p>
                        </div>
                        <div className="shrink-0">
                          <Switch 
                            checked={backupEnabled} 
                            onChange={(val) => {
                              setBackupEnabled(val);
                              saveSettings({ backupEnabled: val });
                            }} 
                          />
                        </div>
                      </div>

                      {backupEnabled && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-border/50">
                            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 px-0.5">
                              <Clock size={10} /> 备份频率
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                value={backupIntervalValue}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "") {
                                    setBackupIntervalValue("");
                                  } else {
                                    const num = parseInt(val);
                                    setBackupIntervalValue(isNaN(num) ? "" : num);
                                    if (!isNaN(num)) saveSettings({ backupIntervalValue: num }, { silent: true });
                                  }
                                }}
                                onBlur={() => {
                                  if (backupIntervalValue === "" || (typeof backupIntervalValue === 'number' && backupIntervalValue <= 0)) {
                                    setBackupIntervalValue(1);
                                    saveSettings({ backupIntervalValue: 1 });
                                  }
                                }}
                                className="w-14 h-8 rounded-lg bg-white dark:bg-white/5 border border-border px-1.5 text-center text-xs font-bold transition-all focus:ring-1 focus:ring-primary outline-none"
                              />
                              <CustomSelect 
                                value={backupIntervalUnit}
                                triggerClassName="h-8 w-18 rounded-lg text-xs font-bold px-2.5"
                                onChange={(val) => {
                                  setBackupIntervalUnit(val);
                                  saveSettings({ backupIntervalUnit: val });
                                }}
                                options={[
                                  { value: "hours", label: "小时" },
                                  { value: "days", label: "天" },
                                  { value: "weeks", label: "周" }
                                ]}
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-border/50">
                            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 px-0.5">
                              <ShieldCheck size={10} /> 保留份数
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={backupRetention}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "") {
                                      setBackupRetention("");
                                    } else {
                                      const num = parseInt(val);
                                      setBackupRetention(isNaN(num) ? "" : num);
                                      if (!isNaN(num)) saveSettings({ backupRetention: num }, { silent: true });
                                    }
                                  }}
                                  onBlur={() => {
                                    if (backupRetention === "" || (typeof backupRetention === 'number' && backupRetention <= 0)) {
                                      setBackupRetention(10);
                                      saveSettings({ backupRetention: 10 });
                                    }
                                  }}
                                  className="w-full h-8 rounded-lg bg-white dark:bg-white/5 border border-border pl-3 pr-10 text-xs font-bold transition-all focus:ring-1 focus:ring-primary outline-none"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-muted-foreground/60 pointer-events-none">份</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-border/50">
                            <label className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 px-0.5">
                              <Zap size={10} /> 立即执行
                            </label>
                            <button
                              onClick={handleManualBackup}
                              disabled={isCreatingBackup}
                              className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isCreatingBackup ? (
                                <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Zap size={12} fill="currentColor" />
                              )}
                              立即触发备份
                            </button>
                          </div>

                          {/* WebDAV 备份配置 */}
                          <div className="md:col-span-3 space-y-0 rounded-2xl bg-white/5 border border-border/50 overflow-hidden">
                            <div 
                              role="button"
                              tabIndex={0}
                              onClick={() => setWebdavManualOpen(!webdavManualOpen)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setWebdavManualOpen(!webdavManualOpen);
                                }
                              }}
                              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer outline-none focus-visible:bg-white/5"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10 text-primary shrink-0">
                                  <Cloud size={14} />
                                </div>
                                <div className="text-left min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-[11px] font-bold text-foreground whitespace-nowrap">WebDAV 云端同步</h4>
                                    {!webdavEnabled && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">已禁用</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground/60 hidden sm:block">将加密备份自动同步至远程 WebDAV 服务器</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Switch 
                                    checked={webdavEnabled} 
                                    onChange={(checked) => {
                                      setWebdavEnabled(checked);
                                      saveSettings({ webdavEnabled: checked });
                                      if (checked) setWebdavManualOpen(true);
                                    }}
                                  />
                                </div>
                                <div className="p-1 rounded-md bg-white/5 border border-border/10 text-muted-foreground/40">
                                  {webdavManualOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </div>
                              </div>
                            </div>

                            {webdavManualOpen && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-4 pt-4 pb-4 px-4 border-t border-border/20"
                              >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[10px] font-bold text-muted-foreground ml-0.5">服务器地址 (URL)</label>
                                    <input
                                      type="text"
                                      value={webdavUrl}
                                      onChange={(e) => setWebdavUrl(e.target.value)}
                                      placeholder="https://nas.example.com/dav"
                                      className="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-4 text-xs transition-all focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground ml-0.5">账号</label>
                                    <input
                                      type="text"
                                      value={webdavUser}
                                      onChange={(e) => setWebdavUser(e.target.value)}
                                      className="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-4 text-xs transition-all focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-muted-foreground ml-0.5">密码</label>
                                    <input
                                      type="password"
                                      value={webdavPassword}
                                      onChange={(e) => setWebdavPassword(e.target.value)}
                                      className="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-4 text-xs transition-all focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1.5 md:col-span-2">
                                    <label className="text-[10px] font-bold text-muted-foreground ml-0.5">备份路径(可选)</label>
                                    <input
                                      type="text"
                                      value={webdavPath}
                                      onChange={(e) => setWebdavPath(e.target.value)}
                                      placeholder="/PickNote/Backups"
                                      className="w-full h-10 rounded-xl bg-white dark:bg-white/5 border border-border px-4 text-xs transition-all focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                </div>
                                <button
                                  onClick={handleTestWebDAV}
                                  disabled={isTestingWebDAV}
                                  className="w-full h-9 mt-2 rounded-lg bg-white/10 text-foreground text-[10px] font-bold transition-all hover:bg-white/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 border border-border/50"
                                >
                                  {isTestingWebDAV ? (
                                    <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Cloud size={12} />
                                  )}
                                  测试 WebDAV 连接
                                </button>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 备份历史列表 */}
                      <div className="mt-4 rounded-2xl overflow-hidden border border-border/50 bg-white/40 dark:bg-black/20 backdrop-blur-xl">
                        <div className="px-4 py-3 bg-white/10 dark:bg-white/5 border-b border-border/50 flex items-center justify-between text-foreground">
                          <div className="flex items-center">
                             <h5 className="text-[10px] font-bold text-foreground/70 uppercase tracking-wider">备份历史记录</h5>
                          </div>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20 dark:bg-white/5 text-muted-foreground/60 border border-border/10">
                            配额: {backups.length} / {backupRetention}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead>
                              <tr className="bg-white/10 dark:bg-white/5 border-b border-border/20">
                                <th className="px-4 py-3 font-bold text-muted-foreground/70 whitespace-nowrap">文件名</th>
                                <th className="px-4 py-3 font-bold text-muted-foreground/70 text-center whitespace-nowrap">同步时间</th>
                                <th className="px-4 py-3 font-bold text-muted-foreground/70 text-right whitespace-nowrap">文件体积</th>
                                <th className="px-4 py-3 font-bold text-muted-foreground/70 text-center whitespace-nowrap">操作</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                              {isLoadingBackups ? (
                                <tr>
                                  <td colSpan={4} className="px-4 py-16 text-center">
                                    <div className="flex flex-col items-center gap-3">
                                      <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                      <span className="text-xs text-muted-foreground animate-pulse">同步云端记录...</span>
                                    </div>
                                  </td>
                                </tr>
                              ) : backups.length === 0 ? (
                                <tr>
                                  <td colSpan={4} className="px-4 py-20 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                      <Database size={32} className="text-muted-foreground" />
                                      <div className="space-y-1">
                                        <p className="text-sm font-bold text-muted-foreground">暂无自动备份记录</p>
                                        <p className="text-[10px] text-muted-foreground/60">开启自动备份后，系统将按计划在此罗列归档文件</p>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                backups.map((b) => (
                                  <tr key={b.name} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-4 py-3 font-mono text-muted-foreground group-hover:text-foreground transition-colors max-w-[120px] truncate">{b.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <Calendar size={10} className="opacity-40" />
                                        {formatLocalDateTime(new Date(b.createdAt))}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground text-right tabular-nums whitespace-nowrap">
                                      {(b.size / 1024 / 1024).toFixed(2)} MB
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        <button 
                                          onClick={() => handleDownloadBackup(b.name)}
                                          className="p-1.5 rounded-lg hover:bg-primary/20 text-primary transition-all"
                                          title="下载"
                                        >
                                          <Download size={14} />
                                        </button>
                                        <button 
                                          onClick={() => setBackupConfig({ isOpen: true, type: "import", file: { name: b.name } as File })}
                                          className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-all"
                                          title="恢复此备份"
                                        >
                                          <RotateCcw size={14} />
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteBackup(b.name)}
                                          className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-500 transition-all"
                                          title="删除"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

                  <BackupModal 
                    key={backupConfig.isOpen ? "open" : "closed"}
                    isOpen={backupConfig.isOpen}
                    type={backupConfig.type}
                    file={backupConfig.file}
                    onClose={() => setBackupConfig(prev => ({ ...prev, isOpen: false }))}
                    onAction={async (password: string, onProgress: (p: number) => void) => {
                        // 模拟更平稳的进度展示，增加专业感
                        onProgress(10);
                        await new Promise(r => setTimeout(r, 600));
                        onProgress(35);

                        if (backupConfig.type === "export") {
                            const res = await fetch("/api/backup/export", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ password })
                            });
                            onProgress(85);
                            if (!res.ok) {
                                const err = await res.json();
                                throw new Error(err.error || "导出失败");
                            }
                            const blob = await res.blob();
                            onProgress(100);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `PickNote_备份数据_${new Date().toISOString().split('T')[0]}.pnk`;
                            a.click();
                        } else {
                            // 如果有 file.size 说明是本地上传的 File 对象
                            // 否则是我们手动构造的 { name: string } 伪 File，表示服务器端恢复
                            const isServerRestore = !backupConfig.file || !('size' in backupConfig.file);
                            
                            if (isServerRestore) {
                                if (!backupConfig.file?.name) return;
                                const res = await fetch("/api/system/backup/restore", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ fileName: backupConfig.file.name, password })
                                });
                                onProgress(90);
                                if (!res.ok) {
                                    const err = await res.json();
                                    throw new Error(err.error || "恢复失败");
                                }
                            } else {
                                if (!backupConfig.file) return;
                                const formData = new FormData();
                                formData.append("file", backupConfig.file);
                                formData.append("password", password);
                                
                                const res = await fetch("/api/backup/import", {
                                    method: "POST",
                                    body: formData
                                });
                                onProgress(90);
                                if (!res.ok) {
                                    const err = await res.json();
                                    throw new Error(err.error || "恢复失败");
                                }
                            }
                            onProgress(100);
                            setTimeout(() => window.location.reload(), 2000);
                        }
                    }}
                  />



            </div>
          )}
        
          {activeTab === "storage" && (
            <div key="storage" className="space-y-6">
              {/* Storage Section */}
              <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/50 bg-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/30">
                      <Database size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">存储中心</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">管理系统附件与静态文件存储后端</p>
                    </div>
                  </div>
                  <button
                    onClick={testConnection}
                    disabled={isTesting}
                    className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isTesting ? (
                      <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Zap size={14} />
                    )}
                    测试连接
                  </button>
                </div>

                <div className="p-0 divide-y divide-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">存储驱动</h4>
                      <p className="text-xs text-muted-foreground mt-1">选择系统如何存储和访问物理文件。</p>
                    </div>
                    <div className="flex bg-muted/50 p-1 rounded-xl w-full sm:w-64">
                      {[
                        { id: 'local', label: '本地' },
                        { id: 'minio', label: 'MinIO' }
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => { setStorageType(mode.id as "local" | "minio"); saveSettings({ storageType: mode.id }); }}
                          className={cn(
                            "flex-1 flex items-center justify-center px-4 py-1.5 rounded-lg text-xs font-bold",
                            storageType === mode.id 
                              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm' 
                              : 'text-muted-foreground hover:bg-white/5'
                          )}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 hover:bg-muted/5 transition-colors">
                    <div className="max-w-md">
                      <h4 className="text-sm font-bold text-foreground">同名文件处理逻辑</h4>
                      <p className="text-xs text-muted-foreground mt-1">重复文件名上传时的系统行为。</p>
                    </div>
                    <CustomSelect
                      value={uploadConflictStrategy}
                      triggerClassName="h-9 w-full sm:w-64 rounded-xl border-border bg-white dark:bg-white/5 text-xs"
                      onChange={(val) => {
                        setUploadConflictStrategy(val as "overwrite" | "rename" | "skip");
                        saveSettings({ uploadConflictStrategy: val });
                      }}
                      options={[
                        { value: "overwrite", label: "直接覆盖" },
                        { value: "rename", label: "自动重命名" },
                        { value: "skip", label: "跳过上传" }
                      ]}
                    />
                  </div>

                  {storageType === "minio" && (
                    <div className="p-4 md:p-5 bg-muted/5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">服务端点 (Endpoint)</label>
                          <input
                            type="text"
                            value={minioEndpoint}
                            onChange={(e) => { setMinioEndpoint(e.target.value); saveSettings({ minioEndpoint: e.target.value }, { silent: true }); }}
                            placeholder="127.0.0.1 或 api.example.com"
                            className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">服务端口 (Port)</label>
                          <input
                            type="number"
                            value={minioPort}
                            onChange={(e) => { 
                              const val = e.target.value === "" ? "" : Number(e.target.value);
                              setMinioPort(val); 
                              saveSettings({ minioPort: val }, { silent: true }); 
                            }}
                            placeholder="9000"
                            className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all no-spinner"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">访问密钥 (Access Key)</label>
                          <input
                            type="text"
                            value={minioAccessKey}
                            onChange={(e) => { setMinioAccessKey(e.target.value); saveSettings({ minioAccessKey: e.target.value }, { silent: true }); }}
                            className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all font-mono"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">密钥凭证 (Secret Key)</label>
                          <input
                            type="password"
                            value={minioSecretKey}
                            onChange={(e) => { setMinioSecretKey(e.target.value); saveSettings({ minioSecretKey: e.target.value }, { silent: true }); }}
                            className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">存储桶名称 (Bucket Name)</label>
                          <input
                            type="text"
                            value={minioBucket}
                            onChange={(e) => { setMinioBucket(e.target.value); saveSettings({ minioBucket: e.target.value }, { silent: true }); }}
                            placeholder="my-bucket"
                            className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground px-1">安全连接 (HTTPS)</label>
                          <div className="h-9 flex items-center px-1">
                            <Switch
                              checked={minioUseSSL}
                              onChange={(val) => { setMinioUseSSL(val); saveSettings({ minioUseSSL: val }); }}
                            />
                            <span className="ml-3 text-xs text-muted-foreground">{minioUseSSL ? "已启用加密传输" : "使用明文传输"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground px-1">CDN 分发地址 / 公开直连地址 (选填)</label>
                        <input
                          type="text"
                          value={minioPublicUrl}
                          onChange={(e) => { setMinioPublicUrl(e.target.value); saveSettings({ minioPublicUrl: e.target.value }, { silent: true }); }}
                          placeholder="https://static.example.com"
                          className="w-full h-9 rounded-lg bg-white dark:bg-white/5 border border-border px-3 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div key="system" className="space-y-6">
              <div className="glass-panel rounded-2xl border border-border overflow-hidden">
                <div className="p-4 md:p-5 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/30">
                      <Info size={16} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">关于系统</h3>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">软件版本、环境信息与运行诊断</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 md:p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "核心版本", value: systemInfo?.version || "v1.2.4-stable", color: "text-primary" },
                      { label: "数据库", value: systemInfo?.dbType || "PostgreSQL" },
                      { label: "运行环境", value: `Node ${systemInfo?.nodeVersion || "v20.x"}` },
                      { label: "最后全备", value: systemInfo?.lastBackup || "未执行", muted: true }
                    ].map((item, i) => (
                      <div key={i} className="p-4 rounded-xl bg-muted/10 border border-border/30 space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{item.label}</p>
                        <p className={cn("text-sm font-mono font-bold truncate", item.color, item.muted && "text-muted-foreground/40")}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={14} />
                    <div className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                      <p className="font-bold text-amber-500/80 mb-0.5">系统诊断提示：</p>
                      PickNote 正在生产环境下运行。请定期执行数据备份。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

  );
}
