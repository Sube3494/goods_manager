"use client";

import { useState, useEffect } from "react";
import { User, Mail, Save, Loader2, ArrowLeft } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/ui/Toast";
import { motion } from "framer-motion";
import Link from "next/link";

export default function ProfilePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        showToast("个人信息已更新", "success");
        // Reload to sync state across app
        window.location.reload();
      } else {
        showToast("更新失败", "error");
      }
    } catch (error) {
      console.error("Save profile failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Header */}
      <div className="mb-10 flex items-center gap-5">
        <Link 
          href="/" 
          className="group p-2.5 rounded-2xl bg-white dark:bg-white/5 border border-border/50 hover:border-primary/50 transition-all shadow-sm"
        >
          <ArrowLeft size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">个人信息</h1>
          <p className="text-sm text-muted-foreground mt-0.5">管理您的个人资料和账号设置</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
        {/* Left: Info Card */}
        <div className="md:col-span-1 h-full">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-border bg-white dark:bg-white/5 p-8 flex flex-col items-center h-full shadow-sm"
          >
            <div className="h-28 w-28 rounded-full bg-primary/10 flex items-center justify-center mb-6 border-4 border-white dark:border-white/10 shadow-md">
               <User size={56} className="text-primary" />
            </div>
            <h2 className="font-bold text-xl text-foreground truncate w-full text-center px-2">{user?.name || "未命名用户"}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 truncate w-full text-center">{user?.email}</p>
            
            <div className="mt-8 pt-8 border-t border-border/50 w-full space-y-4">
               <div className="flex justify-between items-center text-sm">
                 <span className="text-muted-foreground/80">用户角色</span>
                 <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider">
                    {user?.role === 'SUPER_ADMIN' ? '超级管理员' : '普通成员'}
                 </span>
               </div>
            </div>
          </motion.div>
        </div>

        {/* Right: Form */}
        <div className="md:col-span-2">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm flex flex-col"
          >
            <div className="px-8 py-5 border-b border-border bg-muted/5">
              <h3 className="font-bold text-sm tracking-wide">基本资料</h3>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Email */}
              <div className="space-y-3">
                <label className="text-xs font-black text-muted-foreground/70 uppercase tracking-widest flex items-center gap-2 px-1">
                  <Mail size={14} className="text-primary" /> 电子邮箱
                </label>
                <div className="relative group">
                  <input 
                    type="email" 
                    value={user?.email || ""} 
                    disabled 
                    className="w-full h-12 px-5 rounded-2xl bg-muted/30 border border-border/50 text-muted-foreground/60 cursor-not-allowed text-sm transition-all"
                  />
                  <div className="absolute inset-0 rounded-2xl bg-black/5 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
                <p className="text-[11px] text-muted-foreground/50 italic px-1 flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-primary/40" />
                  邮箱作为登录账号，不可手动更改
                </p>
              </div>

              {/* Name */}
              <div className="space-y-3">
                <label className="text-xs font-black text-muted-foreground/70 uppercase tracking-widest flex items-center gap-2 px-1">
                  <User size={14} className="text-primary" /> 显示名称
                </label>
                <div className="relative group">
                  <input 
                    type="text" 
                    placeholder="请输入您的真实姓名或昵称"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-12 px-5 rounded-2xl bg-white dark:bg-white/5 border border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all outline-none text-sm placeholder:text-muted-foreground/30 shadow-none hover:border-border-foreground/20"
                  />
                </div>
              </div>

              <div className="pt-6">
                <button 
                  onClick={handleSave}
                  disabled={isSaving || name === user?.name}
                  className="w-full h-12 bg-foreground text-background dark:bg-white dark:text-black rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 shadow-xl shadow-foreground/10 dark:shadow-white/5"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>保存个人信息</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
