"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, Database, Zap, Moon, Sun, Monitor, Download, Upload, Info } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { BackupModal } from "@/components/Settings/BackupModal";
import { cn } from "@/lib/utils";

interface SystemInfo {
  version: string;
  dbType: string;
  nodeVersion: string;
  lastBackup: string;
}

interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

interface DocumentWithViewTransition extends Document {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
}

export default function SettingsPage() {
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [allowGalleryUpload, setAllowGalleryUpload] = useState<boolean>(true);
  const [allowDataImport, setAllowDataImport] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "storage" | "data" | "system">("general");

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
                setAllowDataImport(data.allowDataImport ?? true);
                
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

  const saveSettings = useCallback(async (newSettings: Record<string, unknown>, options: { silent?: boolean } = {}) => {
    setSaveStatus("saving");
    
    // Merge with current state (or provided overrides)
    const payload = {
        lowStockThreshold,
        allowGalleryUpload,
        allowDataImport,
        storageType,
        minioEndpoint,
        minioPort,
        minioAccessKey,
        minioSecretKey,
        minioBucket,
        minioUseSSL,
        minioPublicUrl,
        uploadConflictStrategy,
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
    allowDataImport,
    storageType, 
    minioEndpoint, 
    minioPort, 
    minioAccessKey, 
    minioSecretKey, 
    minioBucket, 
    minioUseSSL, 
    minioPublicUrl, 
    uploadConflictStrategy, 
    showToast
  ]);

  // Debounced save for text inputs
  useEffect(() => {
    if (!isInitialized.current) return;
    
    // Check if actually changed to avoid redundant saves
    if (lowStockThreshold === lastSavedSettings.current.lowStockThreshold) return;

    const timer = setTimeout(() => {
        saveSettings({ lowStockThreshold }, { silent: true });
    }, 800);

    return () => clearTimeout(timer);
  }, [lowStockThreshold, saveSettings]);

  // Immediate save for toggle
  const toggleGalleryUpload = () => {
    const newValue = !allowGalleryUpload;
    setAllowGalleryUpload(newValue);
    saveSettings({ allowGalleryUpload: newValue });
  };

  const toggleDataImport = () => {
    const newValue = !allowDataImport;
    setAllowDataImport(newValue);
    saveSettings({ allowDataImport: newValue });
  };


  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">读取系统配置中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-700">
      {/* Unified Header with Auto-save Status */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 transition-all">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            系统管理
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">
            配置全局核心逻辑、文件仓库与数据安全。
          </p>
        </div>
        <div className="flex items-center gap-3 bg-muted/30 px-4 py-2 rounded-2xl border border-border/50 backdrop-blur-sm self-start md:self-auto">
          {saveStatus === "saving" && (
            <div className="flex items-center gap-2 text-primary font-medium text-xs">
              <div className="h-2 w-2 bg-primary rounded-full animate-ping" />
              正在同步...
            </div>
          )}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-2 text-muted-foreground/60 text-xs">
              <ShieldCheck size={14} className="text-emerald-500" />
              所有更改已保存
            </div>
          )}
          {saveStatus === "error" && <span className="text-xs text-red-500 font-bold">同步失败</span>}
        </div>
      </div>

      {/* Tab Navigation - Segmented Control Style */}
      <div className="flex p-1.5 bg-muted/40 backdrop-blur-md rounded-2xl border border-border/50 w-fit max-w-full overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap",
                isActive 
                  ? "text-primary-foreground shadow-lg shadow-primary/20" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeSettingTab"
                  className="absolute inset-0 bg-primary z-0 rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <tab.icon size={18} className={cn("relative z-10", isActive ? "" : "opacity-70")} />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-8">
        {/* Content sections will be rendered here based on activeTab */}

        <AnimatePresence mode="wait">
          {activeTab === "general" && (
            <motion.div
              key="general"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Personalization Section */}
              <div className="glass-panel rounded-3xl border border-border overflow-hidden">
                <div className="p-8 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/30">
                      <Monitor size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">个性化设置</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">定制你的工作环境视觉风格</p>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-2xl bg-muted/20 border border-border/40">
                    <div className="max-w-md">
                      <h4 className="font-bold text-foreground flex items-center gap-2">
                        界面主题
                      </h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        切换系统外观模式，适应不同的光照环境。
                      </p>
                    </div>
                    <div className="flex bg-muted/50 p-1 rounded-2xl w-fit shrink-0 backdrop-blur-sm">
                      {[
                        { id: 'light', label: '浅色', icon: Sun },
                        { id: 'dark', label: '深色', icon: Moon }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={(e) => {
                            if (theme === t.id) return;
                            const doc = document as DocumentWithViewTransition;
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
                            "flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 text-sm font-medium",
                            theme === t.id 
                              ? 'bg-white dark:bg-slate-800 shadow-md text-primary dark:text-white' 
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <t.icon size={18} className={theme === t.id ? "fill-current" : ""} />
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Inventory Logic Section */}
              <div className="glass-panel rounded-3xl border border-border overflow-hidden">
                <div className="p-8 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/30">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">库存逻辑</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">定义全局财务与缺货预警规则</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-8">
                  <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="max-w-md">
                        <label className="text-sm font-bold text-foreground">库存低位预警阈值</label>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          当商品库存数量低于此数值时，系统将会在首页及库存列表中标记为“预警”状态。
                        </p>
                      </div>
                      <div className="relative w-full md:w-48 shrink-0">
                        <input
                          type="number"
                          value={lowStockThreshold || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setLowStockThreshold(val === "" ? 0 : parseInt(val) || 0);
                          }}
                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 pr-12 text-lg font-mono font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none no-spinner text-center"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/30 pointer-events-none">
                          件
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}


          {activeTab === "data" && (
            <motion.div
              key="data"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Data Management Section */}
              <div className="glass-panel rounded-3xl border border-border overflow-hidden">
                <div className="p-8 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/30">
                      <Database size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">数据逻辑控制</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">控制业务数据的导入权限与备份机制</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-2xl bg-muted/20 border border-border/40">
                    <div className="max-w-md">
                      <h4 className="font-bold text-foreground">允许实物照片上传</h4>
                      <p className="text-sm text-muted-foreground mt-1">开启后，应用前端及管理台将允许用户向后端存储上传物理文件。</p>
                    </div>
                    <Switch
                      checked={allowGalleryUpload}
                      onChange={toggleGalleryUpload}
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 rounded-2xl bg-muted/20 border border-border/40">
                    <div className="max-w-md">
                      <h4 className="font-bold text-foreground">允许 Excel 批量中转导入</h4>
                      <p className="text-sm text-muted-foreground mt-1">启用全局 Excel 解析引擎，适用于大规模同步历史库存或供应商数据。</p>
                    </div>
                    <Switch
                      checked={allowDataImport}
                      onChange={toggleDataImport}
                    />
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pt-8 px-6 border-t border-border/50">
                    <div className="flex-1">
                      <h4 className="font-bold text-foreground">系统级加密备份与灾难恢复</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                          通过 AES-256-GCM 高强度加密技术，全量导出系统所有业务模型。恢复时需严格匹配备份密码。
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
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
                        className="h-12 px-8 rounded-2xl bg-white dark:bg-white/5 border border-border hover:bg-muted font-medium transition-all hover:-translate-y-0.5 whitespace-nowrap flex items-center gap-2"
                      >
                        <Upload size={18} className="text-emerald-500" />
                        系统恢复
                      </button>
                      <button
                        onClick={() => setBackupConfig({ isOpen: true, type: "export" })}
                        className="h-12 px-8 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 font-medium transition-all hover:-translate-y-0.5 whitespace-nowrap flex items-center gap-2"
                      >
                        <Download size={18} />
                        立即备份
                      </button>
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
                            a.download = `PickNote_Backup_${new Date().toISOString().split('T')[0]}.pnk`;
                            a.click();
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
                            onProgress(100);
                            setTimeout(() => window.location.reload(), 2000);
                        }
                    }}
                  />

                  </div>
                </div>

              {/* Security Placeholder */}
              <div className="glass-panel rounded-3xl border border-border p-8 opacity-60 grayscale hover:grayscale-0 transition-all hover:opacity-100 bg-white/5 border-dashed">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-blue-500/10 text-blue-500">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold">高级访问许可</h3>
                      <p className="text-xs text-muted-foreground">多级管理员 RBAC 权限分配 (即将推出)</p>
                    </div>
                  </div>
                  <Zap size={20} className="text-muted-foreground/20" />
                </div>
              </div>
            </motion.div>
          )}
        
          {activeTab === "storage" && (
            <motion.div
              key="storage"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Storage Section */}
              <div className="glass-panel rounded-3xl border border-border overflow-hidden bg-white/5 backdrop-blur-xl transition-all">
                  <div className="p-8 border-b border-border/50 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/30">
                              <Database size={20} />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold">存储中心</h3>
                            <p className="text-xs text-muted-foreground mt-0.5">管理系统附件与静态文件存储后端</p>
                          </div>
                      </div>
                      <button
                          onClick={testConnection}
                          disabled={isTesting}
                          className="group relative flex items-center justify-center gap-2 h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-medium transition-all hover:opacity-90 hover:shadow-xl hover:shadow-primary/30 active:scale-95 disabled:opacity-50 disabled:grayscale shrink-0 whitespace-nowrap overflow-hidden"
                      >
                          <div className="absolute inset-0 bg-linear-to-tr from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                          {isTesting ? (
                              <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          ) : (
                              <Zap size={18} className="transition-transform group-hover:scale-125 group-hover:rotate-12" />
                          )}
                          <span className="relative z-10">测试连接</span>
                      </button>
                  </div>

                  <div className="p-8 space-y-8">
                      {/* Storage Type & Strategy */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                          {/* Storage Type */}
                          <div className="space-y-5">
                              <div>
                                  <h4 className="font-bold text-foreground flex items-center gap-2">
                                      存储驱动
                                  </h4>
                                  <p className="text-sm text-muted-foreground mt-1">
                                      选择系统如何存储和访问物理文件。
                                  </p>
                              </div>
                              <div className="flex bg-muted/50 p-1.5 rounded-2xl w-full">
                                  {[
                                    { id: 'local', label: '本地存储' },
                                    { id: 'minio', label: 'MinIO 对象存储' }
                                  ].map((mode) => (
                                    <button
                                      key={mode.id}
                                      onClick={() => { setStorageType(mode.id as "local" | "minio"); saveSettings({ storageType: mode.id }); }}
                                      className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 text-sm font-medium",
                                        storageType === mode.id 
                                          ? 'bg-white dark:bg-white/10 shadow-md text-primary dark:text-white' 
                                          : 'text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5'
                                      )}
                                    >
                                      {mode.label}
                                    </button>
                                  ))}
                              </div>
                          </div>

                          {/* Conflict Strategy */}
                          <div className="space-y-5">
                              <div>
                                  <h4 className="font-bold text-foreground">同名文件处理逻辑</h4>
                                  <p className="text-sm text-muted-foreground mt-1">
                                      当上传的文件名与现有文件重复时的行为。
                                  </p>
                              </div>
                              <div className="w-full">
                                  <CustomSelect
                                      value={uploadConflictStrategy}
                                      triggerClassName="h-[54px] rounded-2xl border-border bg-muted/20"
                                      onChange={(val) => {
                                          setUploadConflictStrategy(val as "overwrite" | "rename" | "skip");
                                          saveSettings({ uploadConflictStrategy: val });
                                      }}
                                      options={[
                                          { value: "overwrite", label: "直接覆盖 (覆盖现有文件)" },
                                          { value: "rename", label: "自动重命名 (加数字序号)" },
                                          { value: "skip", label: "跳过上传 (保持现有文件)" }
                                      ]}
                                  />
                              </div>
                          </div>
                      </div>

                      {storageType === "minio" && (
                          <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="space-y-8 p-8 rounded-3xl bg-blue-500/5 border border-blue-500/10"
                          >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">Endpoint (服务器地址)</label>
                                      <input
                                          type="text"
                                          value={minioEndpoint}
                                          onChange={(e) => { setMinioEndpoint(e.target.value); saveSettings({ minioEndpoint: e.target.value }, { silent: true }); }}
                                          placeholder="例如: 127.0.0.1"
                                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none"
                                      />
                                  </div>
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">Port (通讯端口)</label>
                                      <input
                                          type="number"
                                          value={minioPort}
                                          onChange={(e) => { 
                                              const val = e.target.value === "" ? "" : Number(e.target.value);
                                              setMinioPort(val); 
                                              saveSettings({ minioPort: val }, { silent: true }); 
                                          }}
                                          placeholder="例如: 9000"
                                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all no-spinner focus:ring-2 focus:ring-blue-500/20 outline-none"
                                      />
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">Access Key ID</label>
                                      <input
                                          type="text"
                                          value={minioAccessKey}
                                          onChange={(e) => { setMinioAccessKey(e.target.value); saveSettings({ minioAccessKey: e.target.value }, { silent: true }); }}
                                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                                      />
                                  </div>
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">Secret Access Key</label>
                                      <input
                                          type="password"
                                          value={minioSecretKey}
                                          onChange={(e) => { setMinioSecretKey(e.target.value); saveSettings({ minioSecretKey: e.target.value }, { silent: true }); }}
                                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none font-mono"
                                      />
                                  </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">Bucket Name (存储桶)</label>
                                      <input
                                          type="text"
                                          value={minioBucket}
                                          onChange={(e) => { setMinioBucket(e.target.value); saveSettings({ minioBucket: e.target.value }, { silent: true }); }}
                                          placeholder="例如: picknote-assets"
                                          className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none font-bold"
                                      />
                                  </div>
                                  <div className="space-y-2.5">
                                      <label className="text-sm font-bold text-foreground ml-1">连接安全性</label>
                                      <div className="flex items-center justify-between px-5 h-12 rounded-xl border border-border bg-white dark:bg-white/5">
                                          <span className="text-sm text-muted-foreground">启用 SSL (HTTPS)</span>
                                          <Switch
                                              checked={minioUseSSL}
                                              onChange={(val) => {
                                                  setMinioUseSSL(val);
                                                  saveSettings({ minioUseSSL: val });
                                              }}
                                          />
                                      </div>
                                  </div>
                              </div>

                              <div className="space-y-2.5">
                                  <label className="text-sm font-bold text-foreground ml-1">CDN 访问节点 (可选)</label>
                                  <input
                                      type="text"
                                      value={minioPublicUrl}
                                      onChange={(e) => { setMinioPublicUrl(e.target.value); saveSettings({ minioPublicUrl: e.target.value }, { silent: true }); }}
                                      placeholder="例如: https://static.your-domain.com"
                                      className="w-full h-12 rounded-xl bg-white dark:bg-white/5 border border-border px-4 transition-all focus:ring-2 focus:ring-blue-500/20 outline-none"
                                  />
                                  <p className="text-xs text-muted-foreground/60 px-1">如果你在服务器前置了 Nginx 或 CDN 反向代理，请填写对外公开的域名。</p>
                              </div>
                          </motion.div>
                      )}
                  </div>
              </div>
            </motion.div>
          )}

          {activeTab === "system" && (
            <motion.div
              key="system"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="glass-panel rounded-3xl border border-border overflow-hidden">
                <div className="p-8 border-b border-border/50 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/30">
                      <Info size={20} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">关于系统</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">软件版本、环境信息与运行诊断</p>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">核心版本</p>
                      <p className="text-xl font-mono font-bold text-primary">{systemInfo?.version || "v1.2.4-stable"}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">数据库</p>
                      <p className="text-xl font-mono font-bold truncate">{systemInfo?.dbType || "PostgreSQL"}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">运行环境</p>
                      <p className="text-xl font-mono font-bold truncate">Node {systemInfo?.nodeVersion || "v20.x"}</p>
                    </div>
                    <div className="p-6 rounded-2xl bg-muted/20 border border-border/40 space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">最后全备</p>
                      <p className="text-xl font-mono font-bold text-muted-foreground/30">{systemInfo?.lastBackup || "未执行"}</p>
                    </div>
                  </div>

                  <div className="mt-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-4">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-1" size={18} />
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      <p className="font-bold text-amber-500/80 mb-1">系统诊断提示：</p>
                      GoodsManager 正在生产环境下运行。请定期执行数据备份。
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
