"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Monitor, Globe, Shield, Save, HardDrive } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">系统设置</h1>
        <p className="text-muted-foreground mt-2">管理您的偏好设置与系统参数。</p>
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
               <span className="text-muted-foreground">版本号</span>
               <span className="font-mono font-bold">v1.2.0 (Crystal)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">数据存储</span>
               <span className="font-mono font-bold">SQLite (Local)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
               <span className="text-muted-foreground">最后备份</span>
               <span className="font-mono">2026-02-06 14:30</span>
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
      
      <div className="flex justify-end pt-4">
         <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg hover:opacity-90 transition-opacity">
            <Save size={18} />
            保存更改
         </button>
      </div>
    </div>
  );
}
