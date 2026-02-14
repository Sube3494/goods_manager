"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck, Database, Zap, Moon, Sun, Monitor, Download, Upload, Info } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import { ImportModal } from "@/components/Goods/ImportModal";

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
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleExportData = async () => {
    try {
      showToast("正在生成备份文件...", "info");
      const res = await fetch("/api/system/export");
      if (!res.ok) throw new Error("Export failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GoodsManager_Backup_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast("数据导出成功", "success");
    } catch (error) {
      console.error("Export error:", error);
      showToast("导出失败，请检查网络", "error");
    }
  };

  const handleImportData = async (data: Record<string, unknown>[] | Record<string, unknown[]>) => {
    try {
      showToast("正在处理并同步全量数据...", "info");
      const res = await fetch("/api/system/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.failCount > 0) {
            showToast(`导入完成：成功 ${result.successCount} 项，${result.failCount} 项失败。`, "warning");
        } else {
            showToast(`成功恢复并同步 ${result.successCount} 项数据`, "success");
        }
        // Force reload info to update any stats or times
        const infoRes = await fetch("/api/system/info");
        if (infoRes.ok) setSystemInfo(await infoRes.json());
      } else {
        const err = await res.json();
        showToast(err.error || "导入失败", "error");
      }
    } catch (error) {
      console.error("Import error:", error);
      showToast("网络请求失败", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">读取系统配置中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/60">
                系统设置
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                管理全局库存逻辑与系统行为。
                </p>
            </div>
            <div className="flex items-center gap-2">
                {saveStatus === "saving" && <span className="text-sm text-primary animate-pulse font-medium">自动保存中...</span>}
                {saveStatus === "saved" && <span className="text-sm text-muted-foreground/60 flex items-center gap-1"><ShieldCheck size={14}/> 已保存</span>}
                {saveStatus === "error" && <span className="text-sm text-red-500 font-bold">保存失败</span>}
            </div>
        </div>

      <div className="grid gap-6">
        {/* Personalization Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-3xl border border-border overflow-hidden"
        >
            <div className="p-8 border-b border-border/50 bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                        <Monitor size={20} />
                    </div>
                    <h3 className="text-xl font-bold">个性化设置</h3>
                </div>
            </div>
            <div className="p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="font-bold text-foreground">界面主题</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                            切换系统外观模式，适应不同的光照环境。
                        </p>
                    </div>
                    <div className="flex bg-muted/50 p-1 rounded-2xl w-full sm:w-fit shrink-0">
                        {/* Light Mode */}
                        <button
                            onClick={(e) => {
                                if (theme === 'light') return;
                                const doc = document as DocumentWithViewTransition;
                                if (!doc.startViewTransition) {
                                  setTheme("light");
                                  return;
                                }
                                
                                const transition = doc.startViewTransition(() => setTheme("light"));
                                
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
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                                theme === 'light' 
                                ? 'bg-white shadow-sm text-primary font-bold' 
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                            }`}
                        >
                            <Sun size={20} className={theme === 'light' ? "fill-current" : ""} />
                            <span>浅色模式</span>
                        </button>

                        {/* Dark Mode */}
                        <button
                            onClick={(e) => {
                                if (theme === 'dark') return;
                                const doc = document as DocumentWithViewTransition;
                                if (!doc.startViewTransition) {
                                  setTheme("dark");
                                  return;
                                }

                                const transition = doc.startViewTransition(() => setTheme("dark"));

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
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                                theme === 'dark' 
                                ? 'bg-slate-800 shadow-sm text-white font-bold' 
                                : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
                            }`}
                        >
                            <Moon size={20} className={theme === 'dark' ? "fill-current" : ""} />
                            <span>深色模式</span>
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>

        {/* Inventory Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-3xl border border-border overflow-hidden"
        >
          <div className="p-8 border-b border-border/50 bg-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-xl font-bold">库存逻辑</h3>
            </div>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid gap-6 md:grid-cols-2 items-center">
              <div className="space-y-1">
                <label className="text-sm font-bold text-foreground">库存低位预警阈值</label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  当商品库存数量低于此数值时，系统将会在首页及库存列表中标记为“预警”状态。
                </p>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={lowStockThreshold || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLowStockThreshold(val === "" ? 0 : parseInt(val) || 0);
                  }}
                  className="w-full rounded-2xl bg-white dark:bg-white/5 border border-border px-4 py-3 text-lg font-mono font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none no-spinner"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground/40">
                  件单位
                </div>
              </div>
            </div>
          </div>
        </motion.div>


        {/* Data Management Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel rounded-3xl border border-border overflow-hidden"
        >
            <div className="p-8 border-b border-border/50 bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                        <Database size={20} />
                    </div>
                    <h3 className="text-xl font-bold">数据管理</h3>
                </div>
            </div>

            <div className="p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="font-bold text-foreground">允许实物照片上传</h4>
                        <p className="text-sm text-muted-foreground mt-1">开启后，允许用户在实物相册中上传新照片。</p>
                    </div>
                    <div className="shrink-0">
                      <Switch
                          checked={allowGalleryUpload}
                          onChange={toggleGalleryUpload}
                      />
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-border/50">
                    <div>
                        <h4 className="font-bold text-foreground">允许 Excel 批量中转导入</h4>
                        <p className="text-sm text-muted-foreground mt-1">开启后，允许在入库管理中使用批量录入功能。</p>
                    </div>
                    <div className="shrink-0">
                      <Switch
                          checked={allowDataImport}
                          onChange={toggleDataImport}
                      />
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-border/50">
                    <div className="flex-1">
                        <h4 className="font-bold text-foreground">备份与恢复</h4>
                        <p className="text-sm text-muted-foreground mt-1">将所有商品、订单及供应商数据导出为 Excel，或通过备份文件恢复系统。</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => setShowImportModal(true)}
                            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-white dark:bg-white/5 border border-border hover:bg-muted font-bold transition-all hover:-translate-y-0.5 whitespace-nowrap"
                        >
                            <Upload size={18} className="text-emerald-500" />
                            导入备份
                        </button>
                        <button 
                            onClick={handleExportData}
                            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 font-bold transition-all hover:-translate-y-0.5 whitespace-nowrap"
                        >
                            <Download size={18} />
                            立即导出
                        </button>
                    </div>
                </div>

                <ImportModal 
                   isOpen={showImportModal}
                   onClose={() => setShowImportModal(false)}
                   onImport={handleImportData}
                   title="导入全站备份"
                   description="请选择之前导出的 GoodsManager 备份文件 (.xlsx)"
                   multiSheet={true}
                />
            </div>
        </motion.div>
        
        {/* Storage Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel rounded-3xl border border-border overflow-hidden"
        >
            <div className="p-8 border-b border-border/50 bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                        <Database size={20} />
                    </div>
                    <h3 className="text-xl font-bold">存储设置</h3>
                </div>
                <button
                    onClick={testConnection}
                    disabled={isTesting}
                    className="group relative flex items-center justify-center gap-2 h-10 px-6 rounded-full bg-primary text-primary-foreground font-bold transition-all hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 active:scale-95 disabled:opacity-50 disabled:grayscale shrink-0 whitespace-nowrap overflow-hidden"
                >
                    <div className="absolute inset-0 bg-linear-to-tr from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {isTesting ? (
                        <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <Zap size={16} className="transition-transform group-hover:scale-125 group-hover:rotate-12" />
                    )}
                    <span className="relative z-10">测试连接</span>
                </button>
            </div>

            <div className="p-8 space-y-8">
                {/* Storage Type & Strategy */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Storage Type */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-bold text-foreground">存储方式</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                选择系统如何存储和访问文件。
                            </p>
                        </div>
                        <div className="flex bg-muted/50 p-1 rounded-2xl w-full sm:w-fit">
                            <button
                                onClick={() => { setStorageType("local"); saveSettings({ storageType: "local" }); }}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 ${
                                    storageType === 'local' 
                                    ? 'bg-white dark:bg-white/10 shadow-sm text-primary dark:text-white font-bold' 
                                    : 'text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5'
                                }`}
                            >
                                <span>本地存储</span>
                            </button>
                            <button
                                onClick={() => { setStorageType("minio"); saveSettings({ storageType: "minio" }); }}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl transition-all duration-300 ${
                                    storageType === 'minio' 
                                    ? 'bg-white dark:bg-white/10 shadow-sm text-primary dark:text-white font-bold' 
                                    : 'text-muted-foreground hover:bg-white/50 dark:hover:bg-white/5'
                                }`}
                            >
                                <span>MinIO 存储</span>
                            </button>
                        </div>
                    </div>

                    {/* Conflict Strategy */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-bold text-foreground">同名冲突处理</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                当上传文件名重复时的处理逻辑。
                            </p>
                        </div>
                        <div className="w-full sm:w-80">
                            <CustomSelect
                                value={uploadConflictStrategy}
                                triggerClassName="h-[46px]"
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
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-6 pt-6 border-t border-border/50"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">Endpoint (服务器地址)</label>
                                <input
                                    type="text"
                                    value={minioEndpoint}
                                    onChange={(e) => { setMinioEndpoint(e.target.value); saveSettings({ minioEndpoint: e.target.value }, { silent: true }); }}
                                    placeholder="例如: 127.0.0.1"
                                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                 <label className="text-sm font-bold text-foreground">Port (端口)</label>
                                <input
                                    type="number"
                                    value={minioPort}
                                    onChange={(e) => { 
                                        const val = e.target.value === "" ? "" : Number(e.target.value);
                                        setMinioPort(val); 
                                        saveSettings({ minioPort: val }, { silent: true }); 
                                    }}
                                    placeholder="例如: 9000"
                                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all no-spinner"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">Access Key</label>
                                <input
                                    type="text"
                                    value={minioAccessKey}
                                    onChange={(e) => { setMinioAccessKey(e.target.value); saveSettings({ minioAccessKey: e.target.value }, { silent: true }); }}
                                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">Secret Key</label>
                                <input
                                    type="password"
                                    value={minioSecretKey}
                                    onChange={(e) => { setMinioSecretKey(e.target.value); saveSettings({ minioSecretKey: e.target.value }, { silent: true }); }}
                                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">Bucket (存储桶)</label>
                                <input
                                    type="text"
                                    value={minioBucket}
                                    onChange={(e) => { setMinioBucket(e.target.value); saveSettings({ minioBucket: e.target.value }, { silent: true }); }}
                                    placeholder="例如: goods-manager"
                                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-foreground">使用 SSL</label>
                                <div className="flex items-center justify-between px-4 h-[46px] rounded-xl border border-border bg-white dark:bg-white/5">
                                    <span className="text-xs text-muted-foreground">通过 HTTPS 协议连接</span>
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

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-foreground">自定义访问域名 (可选)</label>
                            <input
                                type="text"
                                value={minioPublicUrl}
                                onChange={(e) => { setMinioPublicUrl(e.target.value); saveSettings({ minioPublicUrl: e.target.value }, { silent: true }); }}
                                placeholder="例如: https://oss.example.com"
                                className="w-full rounded-xl bg-white dark:bg-white/5 border border-border px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                            <p className="text-xs text-muted-foreground">留空则直接使用服务器地址。用于配置反向代理后的 CDN 或域名称。</p>
                        </div>
                    </motion.div>
                )}
            </div>
        </motion.div>

        {/* Security & Permissions Placeholder (Moved to bottom) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-panel rounded-3xl border border-border p-8 opacity-60 grayscale hover:grayscale-0 transition-all hover:opacity-100"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                 <ShieldCheck size={20} />
               </div>
               <div>
                  <h3 className="font-bold">安全与权限</h3>
                  <p className="text-xs text-muted-foreground">多级管理员权限分配 (即将推出)</p>
               </div>
            </div>
            <Zap size={20} className="text-muted-foreground/20" />
          </div>
        </motion.div>

        {/* System Info Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel rounded-3xl border border-border overflow-hidden"
        >
            <div className="p-8 border-b border-border/50 bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-500/10 text-slate-500">
                        <Info size={20} />
                    </div>
                    <h3 className="text-xl font-bold">关于系统</h3>
                </div>
            </div>
            <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">当前版本</p>
                    <p className="text-lg font-mono font-medium">{systemInfo?.version || "Unknown"}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">数据库类型</p>
                    <p className="text-lg font-mono font-medium">{systemInfo?.dbType || "PostgreSQL"}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">运行时环境</p>
                    <p className="text-lg font-mono font-medium">Node.js {systemInfo?.nodeVersion || process.version}</p>
                </div>
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">最近备份</p>
                    <p className="text-lg font-mono font-medium text-muted-foreground/50">{systemInfo?.lastBackup || "未配置"}</p>
                </div>
            </div>
        </motion.div>

    </div>
    </div>
  );
}
