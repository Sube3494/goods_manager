"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Settings, Save, AlertTriangle, ShieldCheck, Database, Zap, Moon, Sun, Monitor, Download, Info } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(10);
  const [allowGalleryUpload, setAllowGalleryUpload] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isLoading, setIsLoading] = useState(true);
  
  // Use refs to track last saved values to prevent initial auto-save and loops
  const lastSavedSettings = useRef({ lowStockThreshold: 10, allowGalleryUpload: true });
  // Add a ref to track if we should verify changes, only true after initial load
  const isInitialized = useRef(false);

  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();

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
                lastSavedSettings.current = {
                    lowStockThreshold: data.lowStockThreshold,
                    allowGalleryUpload: data.allowGalleryUpload ?? true
                };
            }

            if (infoRes.ok) {
                setSystemInfo(await infoRes.json());
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
            showToast("加载配置失败", "error");
        } finally {
            setIsLoading(false);
            // Small delay to allow state to settle before enabling auto-save monitoring
            setTimeout(() => { isInitialized.current = true; }, 100);
        }
    };
    initData();
  }, []);

  const saveSettings = async (newSettings: Partial<{ lowStockThreshold: number, allowGalleryUpload: boolean }>) => {
    setSaveStatus("saving");
    setIsSaving(true);
    
    // Merge with current state (or provided overrides)
    const payload = {
        lowStockThreshold,
        allowGalleryUpload,
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
      } else {
        setSaveStatus("error");
        showToast("自动保存失败", "error");
      }
    } catch (error) {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced save for text inputs
  useEffect(() => {
    if (!isInitialized.current) return;
    
    // Check if actually changed to avoid redundant saves
    if (lowStockThreshold === lastSavedSettings.current.lowStockThreshold) return;

    const timer = setTimeout(() => {
        saveSettings({ lowStockThreshold });
    }, 800);

    return () => clearTimeout(timer);
  }, [lowStockThreshold]);

  // Immediate save for toggle
  const toggleGalleryUpload = () => {
    const newValue = !allowGalleryUpload;
    setAllowGalleryUpload(newValue);
    // Directly call save to avoid waiting for useEffect
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
                                const transition = (document as any).startViewTransition ? (document as any).startViewTransition(() => setTheme("light")) : null;
                                if (!transition) setTheme("light");
                                
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
                                const transition = (document as any).startViewTransition ? (document as any).startViewTransition(() => setTheme("dark")) : null;
                                if (!transition) setTheme("dark");

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

        {/* System Info Placeholder */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
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


      </div>


        {/* Data Management Section */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
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

            <div className="p-8 flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-foreground">允许实物照片上传</h4>
                    <p className="text-sm text-muted-foreground mt-1">开启后，允许用户在实物相册中上传新照片。</p>
                </div>
                <button
                   onClick={toggleGalleryUpload}
                   className={`relative h-8 w-14 rounded-full cursor-pointer transition-all duration-300 ease-in-out group ${
                       allowGalleryUpload 
                       ? 'bg-linear-to-r from-primary to-primary/80 shadow-lg shadow-primary/30' 
                       : 'bg-muted hover:bg-muted/80'
                   }`}
                >
                    {/* Track glow effect */}
                    {allowGalleryUpload && (
                        <div className="absolute inset-0 rounded-full bg-primary/20 blur-md" />
                    )}
                    
                    {/* Slider */}
                    <div className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md transition-all duration-300 ease-in-out flex items-center justify-center ${
                        allowGalleryUpload ? 'left-7' : 'left-1'
                    }`}>
                        {/* Icon */}
                        <div className={`transition-all duration-200 ${allowGalleryUpload ? 'text-primary scale-100' : 'text-muted-foreground/40 scale-90'}`}>
                            {allowGalleryUpload ? (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            ) : (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                            )}
                        </div>
                    </div>
                </button>
            </div>
            
            <div className="p-8 border-t border-border/50 flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-foreground">导出全站数据</h4>
                    <p className="text-sm text-muted-foreground mt-1">将所有商品、订单及供应商数据导出为 Excel 备份。</p>
                </div>
                <button 
                  onClick={() => showToast("正在准备数据导出...", "info")}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                    <Download size={16} />
                    立即导出
                </button>
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
  );
}
