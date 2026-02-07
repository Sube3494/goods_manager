"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Monitor, Globe, Shield, Save, HardDrive, Loader2, Zap } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";

export default function SettingsPage() {
  const { user, isLoading } = useUser();
  const { showToast } = useToast();
  const [allowUpload, setAllowUpload] = useState(true);
  const [systemInfo, setSystemInfo] = useState({
    version: "...",
    dbType: "...",
    lastBackup: "...",
    nodeVersion: "..."
  });

  useEffect(() => {
    fetch("/api/system/info")
      .then(res => res.json())
      .then(data => {
        if (!data.error) setSystemInfo(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    // 使用异步方式加载存储的数据，避免同步渲染冲突
    const saved = localStorage.getItem("app_allow_upload");
    if (saved !== null) {
      setAllowUpload(saved === "true");
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("app_allow_upload", allowUpload.toString());
    showToast("系统设置已保存", "success");
    // 强制触发存储事件以通知其他页面（如果需要实时的话，虽然同源自动有效）
    window.dispatchEvent(new Event("storage"));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium">验证访问权限...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">系统设置</h1>
          <p className="text-muted-foreground mt-2">管理您的偏好设置与系统参数。</p>
        </div>
        
        <button 
          onClick={handleSave}
          className="h-10 flex items-center gap-2 px-8 rounded-full bg-primary text-primary-foreground font-bold shadow-lg hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          <Save size={18} />
          保存更改
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Appearance Section */}
        <section className="glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">
              <Monitor size={20} />
            </div>
            <h2 className="text-lg font-bold">外观与显示</h2>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">主题模式</p>
              <p className="text-sm text-muted-foreground">切换明亮/暗黑主题</p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        {/* System Info */}
        <section className="glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">
              <HardDrive size={20} />
            </div>
            <h2 className="text-lg font-bold">系统信息</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">软件版本</span>
               <span className="font-mono font-bold text-primary">v{systemInfo.version}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">数据架构</span>
               <span className="font-mono font-bold text-primary">{systemInfo.dbType}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">运行内核</span>
               <span className="font-mono text-xs opacity-70">{systemInfo.nodeVersion}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">备份记录</span>
               <span className="text-xs italic opacity-60">{systemInfo.lastBackup}</span>
            </div>
          </div>
        </section>

        {/* Localization */}
        <section className="glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">
              <Globe size={20} />
            </div>
            <h2 className="text-lg font-bold">语言与区域</h2>
          </div>
          
           <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">系统语言</p>
              <p className="text-sm text-muted-foreground">当前仅支持简体中文</p>
            </div>
            <div className="px-3 py-1 rounded-md bg-secondary/50 text-xs font-bold border border-border">
              简体中文
            </div>
          </div>
        </section>

        {/* Feature Management */}
        <section className="glass-panel rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">
              <Zap size={20} />
            </div>
            <h2 className="text-lg font-bold">功能管控</h2>
          </div>
          
           <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">允许上传照片</p>
              <p className="text-sm text-muted-foreground">控制相册页面上传按钮的可见性</p>
            </div>
            <Switch checked={allowUpload} onChange={setAllowUpload} />
          </div>
        </section>

         {/* Security */}
         <section className="glass-panel rounded-2xl p-6 space-y-6 opacity-60 pointer-events-none grayscale">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="p-2 rounded-lg bg-primary/5 text-primary">
              <Shield size={20} />
            </div>
            <h2 className="text-lg font-bold">安全 (开发中)</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            用户权限管理与审计日志功能正在开发中。
          </p>
        </section>
      </div>
      
      <div className="h-4" />
    </div>
  );
}
