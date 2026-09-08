"use client";

import { AlertTriangle, KeyRound, Monitor, Moon, Save, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneralTabProps {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  lowStockThreshold: number | "";
  setLowStockThreshold: (val: number | "") => void;
  ttlockClientId: string;
  setTtlockClientId: (value: string) => void;
  ttlockClientSecret: string;
  setTtlockClientSecret: (value: string) => void;
  saveSettings: (newSettings: Record<string, unknown>, options?: { silent?: boolean }) => Promise<void>;
}

export function GeneralTab({
  theme,
  setTheme,
  lowStockThreshold,
  setLowStockThreshold,
  ttlockClientId,
  setTtlockClientId,
  ttlockClientSecret,
  setTtlockClientSecret,
  saveSettings,
}: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {[
          { label: "当前主题", value: theme === "dark" ? "深色模式" : "浅色模式", hint: "切换系统主要视觉外观" },
          { label: "预警阈值", value: `${lowStockThreshold === "" ? 10 : lowStockThreshold} 件`, hint: "低于该库存值时进入预警状态" },
          { label: "工作区风格", value: "即时生效", hint: "大部分常规设置改动会直接应用" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-white/80 dark:bg-white/[0.03] p-4 shadow-2xs transition-all hover:border-primary/20">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">{item.label}</div>
            <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
              <Monitor size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">个性化设置</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">随时切换明亮或暗光主题，提供更惬意的视觉体验。</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {[
              { id: "light", label: "浅色模式", desc: "更适合明亮环境和长时间浏览复杂表格。", icon: Sun },
              { id: "dark", label: "深色模式", desc: "降低夜间眩光，适合暗光专注工作环境。", icon: Moon },
            ].map((option) => (
              <button
                key={option.id}
                onClick={(e) => {
                  if (theme === option.id) return;
                  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
                  if (!doc.startViewTransition) {
                    setTheme(option.id);
                    return;
                  }
                  const transition = doc.startViewTransition(() => setTheme(option.id));
                  if (transition) {
                    const x = e.clientX;
                    const y = e.clientY;
                    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                    transition.ready.then(() => {
                      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];
                      document.documentElement.animate({ clipPath }, { duration: 500, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" });
                    });
                  }
                }}
                className={cn(
                  "rounded-2xl sm:rounded-[22px] border p-4 sm:p-5 text-left transition-all cursor-pointer",
                  theme === option.id
                    ? "border-primary/40 bg-primary/[0.08] shadow-xs ring-2 ring-primary/20"
                    : "border-border/60 bg-white/70 hover:border-border hover:bg-white dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all",
                    theme === option.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-foreground/70"
                  )}>
                    <option.icon size={19} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-foreground">{option.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{option.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25">
                <KeyRound size={17} />
              </div>
              <div>
                <h3 className="text-base font-black text-foreground">TTLock 应用凭据</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">全局保存后，门锁管理页仅需输入 App 账号密码即可一键登录。</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                void saveSettings({
                  ttlockRegion: "cn",
                  ttlockClientId,
                  ttlockClientSecret,
                });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-5 text-xs font-black text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer self-start sm:self-auto"
            >
              <Save size={13} />
              保存凭据
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <label className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">应用 ID (Client ID)</div>
              <input
                type="text"
                value={ttlockClientId}
                onChange={(e) => {
                  setTtlockClientId(e.target.value);
                  void saveSettings({ ttlockClientId: e.target.value }, { silent: true });
                }}
                placeholder="TTLock clientId"
                className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </label>

            <label className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">应用密钥 (Client Secret)</div>
              <input
                type="password"
                value={ttlockClientSecret}
                onChange={(e) => {
                  setTtlockClientSecret(e.target.value);
                  void saveSettings({ ttlockClientSecret: e.target.value }, { silent: true });
                }}
                placeholder="TTLock clientSecret"
                className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </label>
          </div>

          <div className="rounded-2xl border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-muted-foreground shadow-2xs">
            💡 保存的是 TTLock 开发者应用凭据，用于为门锁页换取授权 Token。登录具体门锁账号时，请在门锁管理页直接输入 TTLock App 账号密码。
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/25">
              <AlertTriangle size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">库存预警逻辑</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">全局库存阈值，影响首页汇总与库存列表中的预警标记。</p>
            </div>
          </div>
        </div>
        <div className="p-5">
          <div className="flex flex-col gap-4 rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="text-sm font-black text-foreground">库存低位预警阈值</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">当商品可售库存数量低于此值时，系统将在首页概览及商品列表中自动打上“库存预警”标签。</div>
            </div>
            <div className="relative w-full shrink-0 md:w-36">
              <input
                type="number"
                value={lowStockThreshold ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setLowStockThreshold("");
                    return;
                  }
                  const num = parseInt(val);
                  setLowStockThreshold(isNaN(num) ? "" : num);
                  if (!isNaN(num)) saveSettings({ lowStockThreshold: num }, { silent: true });
                }}
                onBlur={() => {
                  if (lowStockThreshold === "" || (typeof lowStockThreshold === "number" && lowStockThreshold < 0)) {
                    setLowStockThreshold(10);
                    saveSettings({ lowStockThreshold: 10 });
                  }
                }}
                className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 pr-10 pl-4 text-center text-sm font-black outline-none no-spinner focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
              />
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">件</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
