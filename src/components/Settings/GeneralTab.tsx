"use client";

import { AlertTriangle, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneralTabProps {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  lowStockThreshold: number | "";
  setLowStockThreshold: (val: number | "") => void;
  saveSettings: (newSettings: Record<string, unknown>, options?: { silent?: boolean }) => Promise<void>;
}

export function GeneralTab({ theme, setTheme, lowStockThreshold, setLowStockThreshold, saveSettings }: GeneralTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {[
          { label: "当前主题", value: theme === "dark" ? "深色模式" : "浅色模式", hint: "切换系统主要视觉外观" },
          { label: "预警阈值", value: `${lowStockThreshold === "" ? 10 : lowStockThreshold} 件`, hint: "低于该库存值时进入预警状态" },
          { label: "工作区风格", value: "即时生效", hint: "大部分常规设置改动会直接应用" },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-white/75 px-4 py-4 shadow-sm dark:bg-white/5">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">{item.label}</div>
            <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{item.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.hint}</div>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/25">
              <Monitor size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">个性化设置</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把主题切换做成更明确的选择卡，不再像一条普通表单项。</p>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[
              { id: "light", label: "浅色模式", desc: "更适合明亮环境和长时间浏览表格。", icon: Sun },
              { id: "dark", label: "深色模式", desc: "降低夜间眩光，适合暗光工作环境。", icon: Moon },
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
                  "rounded-3xl border px-5 py-5 text-left transition-all",
                  theme === option.id ? "border-primary/25 bg-primary/[0.07] shadow-sm" : "border-border/60 bg-background/70 hover:border-border hover:bg-background"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl", theme === option.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70")}>
                    <option.icon size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-foreground">{option.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/25">
              <AlertTriangle size={17} />
            </div>
            <div>
              <h3 className="text-base font-black text-foreground">库存预警逻辑</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">把预警阈值单独抬出来，强调这是影响首页和库存列表状态的全局规则。</p>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-background/75 px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="text-sm font-black text-foreground">库存低位预警阈值</div>
              <div className="mt-1 text-xs leading-relaxed text-muted-foreground">当商品库存数量低于这个值时，系统会在首页及库存列表中标记为“预警”状态。</div>
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
                className="h-11 w-full rounded-2xl border border-border bg-background px-3 pr-10 text-center text-base font-black outline-none no-spinner"
              />
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/50">件</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
