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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {overview.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-white/80 dark:bg-white/[0.03] p-4 shadow-2xs transition-all hover:border-primary/20">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
              <item.icon size={12} className="text-primary" />
              {item.label}
            </div>
            <div className={cn("mt-2.5 truncate text-xl font-black tracking-tight", item.tone)}>{item.value}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/25">
              <Code2 size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">系统诊断</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">当前运行状态评估、基础服务健康检查及安全建议。</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {overview.map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 shadow-2xs">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">{item.label}</div>
                <div className={cn("mt-1.5 text-sm font-black", item.tone)}>{item.value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3.5 shadow-2xs">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <div className="text-sm font-black text-amber-600 dark:text-amber-400">系统诊断建议</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">系统正在稳定运行中。建议定期在“数据与安全”页签下执行本地或云端归档备份，保障生产数据完整性。</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/25">
              <BookOpen size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">技术栈与模块</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">底层架构驱动技术与主要业务管理边界一览。</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
            <div className="text-sm font-black text-foreground">技术底座</div>
            <div className="mt-0.5 text-xs text-muted-foreground">现代高性能全栈工程框架与数据持久化生态。</div>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                { name: "Next.js 15", desc: "React 全栈应用框架", color: "text-foreground", bg: "bg-muted/30" },
                { name: "React 19", desc: "前端界面构建与 Hook", color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10" },
                { name: "TypeScript", desc: "端到端类型静态检查", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
                { name: "Prisma ORM", desc: "声明式数据库管理", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                { name: "Tailwind CSS", desc: "原子化现代响应式样式", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10" },
                { name: "Framer Motion", desc: "丝滑交互微动效引擎", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
                { name: "Lucide Icons", desc: "统一矢量线性图标集", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-500/10" },
                { name: "MinIO", desc: "S3 协议对象存储 (可选)", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
              ].map((tech) => (
                <div key={tech.name} className="rounded-xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3 shadow-2xs">
                  <div className={cn("text-xs font-black", tech.color)}>{tech.name}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{tech.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
            <div className="text-sm font-black text-foreground">功能模块</div>
            <div className="mt-0.5 text-xs text-muted-foreground">当前系统覆盖的核心业务能力与控制边界。</div>
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                { name: "商品管理", desc: "SKU / 批次 / 库存流水", icon: Database },
                { name: "分类管理", desc: "多级分类与属性树", icon: GitBranch },
                { name: "供应商管理", desc: "供应链伙伴信息维护", icon: Server },
                { name: "采购管理", desc: "采购单进货与账单结算", icon: Code2 },
                { name: "出入库管理", desc: "进出库单审核与追溯", icon: Zap },
                { name: "实物相册", desc: "商品高清图库与缩略图", icon: Globe },
                { name: "刷单管理", desc: "计划与多店铺订单映射", icon: BookOpen },
                { name: "权限与安全", desc: "RBAC 角色与白名单控制", icon: Shield },
              ].map((mod) => (
                <div key={mod.name} className="rounded-xl border border-border/50 bg-white/70 dark:bg-white/[0.02] p-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <mod.icon size={13} className="text-primary/70 shrink-0" />
                    <div className="text-xs font-black text-foreground">{mod.name}</div>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground pl-5">{mod.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/25">
              <Heart size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">版权与技术支持</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">系统版权归属、运行声明及相关支持信息。</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Shield size={18} />
              </div>
              <div>
                <div className="text-sm font-black text-foreground">Goods Manager 供应链管理系统</div>
                <div className="text-[11px] text-muted-foreground">Copyright © {new Date().getFullYear()} All rights reserved.</div>
              </div>
            </div>
            <div className="mt-3.5 border-t border-border/50 pt-3.5 text-xs leading-relaxed text-muted-foreground">
              <p>专为精细化库存、供应链与多平台销售订单协同而设计，涵盖完整的商品主库、店铺进货、麦芽田订单对接与门锁物联网联动。</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
