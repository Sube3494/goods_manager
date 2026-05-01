"use client";

import { AlertTriangle, BookOpen, Clock, Code2, Database, ExternalLink, GitBranch, Globe, Heart, Server, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemInfo {
  version: string;
  dbType: string;
  nodeVersion: string;
  lastBackup: string;
}

interface SystemTabProps {
  systemInfo: SystemInfo | null;
}

export function SystemTab({ systemInfo }: SystemTabProps) {
  const overview = [
    { label: "核心版本", value: systemInfo?.version || "v1.2.4-stable", icon: Code2, tone: "text-primary" },
    { label: "数据库", value: systemInfo?.dbType || "PostgreSQL", icon: Database, tone: "text-foreground" },
    { label: "运行环境", value: `Node ${systemInfo?.nodeVersion || "v20.x"}`, icon: Server, tone: "text-foreground" },
    { label: "最后全备", value: systemInfo?.lastBackup || "未执行", icon: Clock, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        {overview.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-white/75 px-4 py-4 shadow-sm dark:bg-white/5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
              <item.icon size={11} />
              {item.label}
            </div>
            <div className={cn("mt-3 truncate text-xl font-black tracking-tight", item.tone)}>{item.value}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/25">
              <Code2 size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">系统诊断</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把版本、运行环境和备份状态放到同一层，先判断系统是否健康。</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {overview.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/50 bg-white/72 px-4 py-4 shadow-sm dark:bg-white/[0.04]">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">{item.label}</div>
                <div className={cn("mt-2 text-sm font-black", item.tone)}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-3xl border border-amber-500/15 bg-white/72 px-5 py-4 shadow-sm dark:bg-white/[0.04]">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <div className="text-sm font-black text-amber-500/90">系统诊断提示</div>
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">PickNote 正在生产环境下运行。请定期执行数据备份，并确认当前版本与运行环境保持在预期状态。</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/25">
              <BookOpen size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">技术栈与模块</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把底层技术和业务模块拆成两组，阅读时不会再混成一片。</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 md:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border/50 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
            <div className="text-sm font-black text-foreground">技术栈</div>
            <div className="mt-1 text-xs text-muted-foreground">系统构建依赖的主要框架、运行库和数据层。</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { name: "Next.js 15", desc: "React 全栈框架", color: "text-foreground", bg: "bg-muted/20" },
                { name: "React 19", desc: "UI 组件库", color: "text-cyan-500", bg: "bg-cyan-500/5" },
                { name: "TypeScript", desc: "类型安全", color: "text-blue-500", bg: "bg-blue-500/5" },
                { name: "Prisma ORM", desc: "数据库访问层", color: "text-emerald-500", bg: "bg-emerald-500/5" },
                { name: "Tailwind CSS", desc: "原子化样式", color: "text-sky-500", bg: "bg-sky-500/5" },
                { name: "Framer Motion", desc: "动画引擎", color: "text-purple-500", bg: "bg-purple-500/5" },
                { name: "Lucide Icons", desc: "图标库", color: "text-pink-500", bg: "bg-pink-500/5" },
                { name: "MinIO", desc: "对象存储 (可选)", color: "text-amber-500", bg: "bg-amber-500/5" },
              ].map((tech) => (
                <div key={tech.name} className={cn("rounded-2xl border border-border/40 bg-white/68 px-4 py-3 shadow-sm dark:bg-white/[0.04]", tech.bg)}>
                  <div className={cn("text-sm font-black", tech.color)}>{tech.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{tech.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border/50 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
            <div className="text-sm font-black text-foreground">功能模块</div>
            <div className="mt-1 text-xs text-muted-foreground">当前系统覆盖的业务能力与主要管理边界。</div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { name: "商品管理", desc: "SKU / 批次 / 入库", icon: Database },
                { name: "分类管理", desc: "多级分类体系", icon: GitBranch },
                { name: "供应商管理", desc: "供应链信息维护", icon: Server },
                { name: "采购管理", desc: "采购单与结算", icon: Code2 },
                { name: "出入库管理", desc: "库存流水追踪", icon: Zap },
                { name: "实物相册", desc: "商品图片管理", icon: Globe },
                { name: "刷单管理", desc: "计划与订单", icon: BookOpen },
                { name: "系统设置", desc: "全局配置中心", icon: Shield },
              ].map((mod) => (
                <div key={mod.name} className="rounded-2xl border border-border/40 bg-white/68 px-4 py-3 shadow-sm dark:bg-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <mod.icon size={13} className="text-muted-foreground/70" />
                    <div className="text-sm font-black text-foreground">{mod.name}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{mod.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/25">
              <Heart size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">许可与声明</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把版权说明和支持信息放到最后，作为补充信息而不是主内容。</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-4 md:p-5">
          <div className="rounded-3xl border border-border/50 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Shield size={20} />
              </div>
              <div>
                <div className="text-sm font-black text-foreground">PickNote 库存管理系统</div>
                <div className="text-[11px] text-muted-foreground">Copyright © {new Date().getFullYear()} PickNote. All rights reserved.</div>
              </div>
            </div>
            <div className="mt-4 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted-foreground">
              <p>本系统为 PickNote 内部业务管理工具，涵盖商品管理、采购结算、库存追踪、实物相册及刷单管理等核心业务场景。</p>
              <p className="mt-2">未经授权不得转载、修改或用于商业用途。系统数据仅供授权人员访问，请妥善保管账号凭证。</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-border/50 bg-white/72 px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:bg-white/[0.04]">
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <BookOpen size={13} />
              文档与帮助
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <ExternalLink size={13} />
              技术支持请联系管理员
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
