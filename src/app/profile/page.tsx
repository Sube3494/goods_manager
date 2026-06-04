"use client";

import Link from "next/link";
import { ArrowLeft, Shield, User, Mail, Calendar } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center gap-3">
        <Link href="/" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-all hover:bg-muted/40 dark:border-white/10 dark:bg-white/5">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">个人中心</h1>
      </div>

      <section className="overflow-hidden rounded-[26px] border border-border/70 bg-white/78 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
        <div className="flex flex-col items-center text-center pb-6 border-b border-border/60 dark:border-white/10">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border/60 bg-primary/10 text-primary dark:border-white/10">
            <User size={40} className="text-primary" />
          </div>
          <h2 className="mt-4 text-xl font-black text-foreground">苏白</h2>
          <p className="text-xs text-muted-foreground mt-1">系统管理员</p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border/50 bg-white/60 dark:border-white/8 dark:bg-white/[0.035]">
            <Mail size={18} className="text-muted-foreground" />
            <div className="text-left">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">电子邮箱</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">sube@example.com</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border/50 bg-white/60 dark:border-white/8 dark:bg-white/[0.035]">
            <Shield size={18} className="text-muted-foreground" />
            <div className="text-left">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">账号权限</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">超级管理员 (Owner)</p>
            </div>
          </div>

          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border/50 bg-white/60 dark:border-white/8 dark:bg-white/[0.035]">
            <Calendar size={18} className="text-muted-foreground" />
            <div className="text-left">
              <p className="text-[10px] font-bold text-muted-foreground uppercase">注册时间</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">2026-06-02</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
