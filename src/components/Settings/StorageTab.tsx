"use client";

import { Database, HardDrive, ImageUp, Link2, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";

interface StorageTabProps {
  storageType: "local" | "minio";
  setStorageType: (val: "local" | "minio") => void;
  uploadConflictStrategy: "overwrite" | "rename" | "skip";
  setUploadConflictStrategy: (val: "overwrite" | "rename" | "skip") => void;
  minioEndpoint: string;
  setMinioEndpoint: (val: string) => void;
  minioPort: number | "";
  setMinioPort: (val: number | "") => void;
  minioAccessKey: string;
  setMinioAccessKey: (val: string) => void;
  minioSecretKey: string;
  setMinioSecretKey: (val: string) => void;
  minioBucket: string;
  setMinioBucket: (val: string) => void;
  minioUseSSL: boolean;
  setMinioUseSSL: (val: boolean) => void;
  minioPublicUrl: string;
  setMinioPublicUrl: (val: string) => void;
  testConnection: () => Promise<void>;
  isTesting: boolean;
  backfillGalleryThumbnails: () => Promise<void>;
  isBackfillingThumbnails: boolean;
  thumbnailBackfillRemaining: number | null;
  saveSettings: (newSettings: Record<string, unknown>, options?: { silent?: boolean }) => Promise<void>;
}

export function StorageTab({
  storageType, setStorageType,
  uploadConflictStrategy, setUploadConflictStrategy,
  minioEndpoint, setMinioEndpoint,
  minioPort, setMinioPort,
  minioAccessKey, setMinioAccessKey,
  minioSecretKey, setMinioSecretKey,
  minioBucket, setMinioBucket,
  minioUseSSL, setMinioUseSSL,
  minioPublicUrl, setMinioPublicUrl,
  testConnection, isTesting,
  backfillGalleryThumbnails, isBackfillingThumbnails,
  thumbnailBackfillRemaining,
  saveSettings,
}: StorageTabProps) {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[26px] border border-border/60 bg-white/75 shadow-sm dark:bg-white/5">
        <div className="border-b border-border/50 bg-white/50 px-4 py-4 md:px-5 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/25">
                <Database size={17} />
              </div>
              <div>
                <h3 className="text-base font-black text-foreground">存储驱动与策略</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">先确定文件放在哪里，再定义重名文件如何处理，避免基础行为分散在不同卡片里。</p>
              </div>
            </div>
            <button onClick={testConnection} disabled={isTesting || storageType === "local"} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40 lg:w-auto">
              {isTesting ? <div className="h-3 w-3 rounded-full border-2 border-background border-t-transparent animate-spin" /> : <Zap size={14} />}
              测试连接
            </button>
          </div>
        </div>
        <div className="space-y-3 p-4 md:p-5">
          <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div className="rounded-3xl border border-border/60 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500"><HardDrive size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">存储驱动</div>
                  <div className="mt-1 text-xs text-muted-foreground">选择系统如何保存附件、图片与其它静态文件。</div>
                </div>
              </div>
              <div className="mt-4 inline-flex rounded-2xl border border-border/60 bg-white/75 p-1 dark:bg-white/[0.04]">
                {[
                  { id: "local", label: "本地" },
                  { id: "minio", label: "MinIO" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => { setStorageType(mode.id as "local" | "minio"); saveSettings({ storageType: mode.id }); }}
                    className={cn("rounded-xl px-4 py-2 text-xs font-black transition-all", storageType === mode.id ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-muted-foreground hover:text-foreground")}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500"><Link2 size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">同名文件处理逻辑</div>
                  <div className="mt-1 text-xs text-muted-foreground">控制重复文件名上传时的系统行为，避免误覆盖或重复写入。</div>
                </div>
              </div>
              <div className="mt-4">
                <CustomSelect
                  value={uploadConflictStrategy}
                  triggerClassName="h-10 w-full rounded-2xl border border-border bg-white dark:bg-white/5 dark:border-white/10 text-xs font-bold"
                  onChange={(val) => {
                    setUploadConflictStrategy(val as "overwrite" | "rename" | "skip");
                    saveSettings({ uploadConflictStrategy: val });
                  }}
                  options={[
                    { value: "overwrite", label: "直接覆盖" },
                    { value: "rename", label: "自动重命名" },
                    { value: "skip", label: "跳过上传" },
                  ]}
                />
              </div>
            </div>
          </div>

          {storageType === "minio" ? (
            <div className="rounded-3xl border border-border/60 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><ShieldCheck size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">MinIO 连接信息</div>
                  <div className="mt-1 text-xs text-muted-foreground">把主机、凭据、存储桶和公开访问地址聚合到同一块里，方便统一检查。</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">服务端点</label>
                  <input type="text" value={minioEndpoint} onChange={(e) => { setMinioEndpoint(e.target.value); saveSettings({ minioEndpoint: e.target.value }, { silent: true }); }} placeholder="127.0.0.1 或 api.example.com" className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">服务端口</label>
                  <input type="number" value={minioPort} onChange={(e) => { const val = e.target.value === "" ? "" : Number(e.target.value); setMinioPort(val); saveSettings({ minioPort: val }, { silent: true }); }} placeholder="9000" className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm no-spinner outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">访问密钥</label>
                  <input type="text" value={minioAccessKey} onChange={(e) => { setMinioAccessKey(e.target.value); saveSettings({ minioAccessKey: e.target.value }, { silent: true }); }} className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">密钥凭证</label>
                  <input type="password" value={minioSecretKey} onChange={(e) => { setMinioSecretKey(e.target.value); saveSettings({ minioSecretKey: e.target.value }, { silent: true }); }} className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">存储桶名称</label>
                  <input type="text" value={minioBucket} onChange={(e) => { setMinioBucket(e.target.value); saveSettings({ minioBucket: e.target.value }, { silent: true }); }} placeholder="my-bucket" className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">加密连接</label>
                  <div className="flex h-10 items-center rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3">
                    <Switch checked={minioUseSSL} onChange={(val) => { setMinioUseSSL(val); saveSettings({ minioUseSSL: val }); }} />
                    <span className="ml-3 text-xs text-muted-foreground">{minioUseSSL ? "已启用 HTTPS" : "当前使用 HTTP"}</span>
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">公开访问地址</label>
                  <input type="text" value={minioPublicUrl} onChange={(e) => { setMinioPublicUrl(e.target.value); saveSettings({ minioPublicUrl: e.target.value }, { silent: true }); }} placeholder="https://static.example.com" className="h-10 w-full rounded-xl border border-border bg-white dark:bg-white/5 dark:border-white/10 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border/70 bg-white/60 px-5 py-4 dark:bg-white/[0.03]">
              <div className="text-sm font-black text-foreground">本地存储模式</div>
              <div className="mt-1 text-xs text-muted-foreground">当前文件将直接保存在服务器本地目录中，不需要额外配置对象存储连接。</div>
            </div>
          )}

          <div className="rounded-3xl border border-border/60 bg-white/72 p-5 shadow-sm dark:bg-white/[0.04]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                  <ImageUp size={16} />
                </div>
                <div>
                  <div className="text-sm font-black text-foreground">历史缩略图补齐</div>
                  <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    为旧相册图片补生成缩略图，完成后列表封面会优先走小图，首屏加载会更轻一些。
                  </div>
                  <div className="mt-2 text-xs font-bold text-foreground/80">
                    {thumbnailBackfillRemaining === null ? "正在统计待补数量..." : `待补 ${thumbnailBackfillRemaining} 张`}
                  </div>
                </div>
              </div>
              <button
                onClick={backfillGalleryThumbnails}
                disabled={isBackfillingThumbnails}
                className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-xs font-black text-background disabled:opacity-40 lg:w-auto"
              >
                {isBackfillingThumbnails ? <div className="h-3 w-3 rounded-full border-2 border-background border-t-transparent animate-spin" /> : <ImageUp size={14} />}
                一键补齐
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
