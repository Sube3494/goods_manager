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
      <section className="overflow-hidden rounded-[28px] border border-border/70 bg-white/80 dark:bg-white/[0.02] shadow-sm backdrop-blur-xs">
        <div className="border-b border-border/50 bg-muted/20 dark:bg-white/[0.02] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/25">
                <Database size={17} />
              </div>
              <div>
                <h3 className="text-base font-black text-foreground">存储驱动与策略</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">定义系统文件保存路径与重名冲突规则，保障附件存储稳定。</p>
              </div>
            </div>
            <button
              onClick={testConnection}
              disabled={isTesting || storageType === "local"}
              className="inline-flex h-9 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-primary px-5 text-xs font-black text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-40 cursor-pointer"
            >
              {isTesting ? <div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <Zap size={13} />}
              测试连接
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3.5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-500"><HardDrive size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">存储驱动</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">选择文件、图片及附件的持久化方案。</div>
                </div>
              </div>
              <div className="mt-3.5 inline-flex rounded-full border border-border/70 bg-muted/40 p-1">
                {[
                  { id: "local", label: "本地存储" },
                  { id: "minio", label: "MinIO 对象存储" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => { setStorageType(mode.id as "local" | "minio"); saveSettings({ storageType: mode.id }); }}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-xs font-bold transition-all cursor-pointer",
                      storageType === mode.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500"><Link2 size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">同名文件处理逻辑</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">控制重复文件名上传时的系统默认动作。</div>
                </div>
              </div>
              <div className="mt-3.5">
                <CustomSelect
                  value={uploadConflictStrategy}
                  triggerClassName="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs font-bold shadow-2xs"
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
            <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><ShieldCheck size={16} /></div>
                <div>
                  <div className="text-sm font-black text-foreground">MinIO 连接参数</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">服务端点、密钥与 Bucket 存储桶配置。</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">服务端点 (Endpoint)</label>
                  <input type="text" value={minioEndpoint} onChange={(e) => { setMinioEndpoint(e.target.value); saveSettings({ minioEndpoint: e.target.value }, { silent: true }); }} placeholder="127.0.0.1 或 s3.example.com" className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">服务端口 (Port)</label>
                  <input type="number" value={minioPort} onChange={(e) => { const val = e.target.value === "" ? "" : Number(e.target.value); setMinioPort(val); saveSettings({ minioPort: val }, { silent: true }); }} placeholder="9000" className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm no-spinner outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">访问密钥 (Access Key)</label>
                  <input type="text" value={minioAccessKey} onChange={(e) => { setMinioAccessKey(e.target.value); saveSettings({ minioAccessKey: e.target.value }, { silent: true }); }} className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm font-mono outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">密钥凭证 (Secret Key)</label>
                  <input type="password" value={minioSecretKey} onChange={(e) => { setMinioSecretKey(e.target.value); saveSettings({ minioSecretKey: e.target.value }, { silent: true }); }} className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm font-mono outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">存储桶名称 (Bucket)</label>
                  <input type="text" value={minioBucket} onChange={(e) => { setMinioBucket(e.target.value); saveSettings({ minioBucket: e.target.value }, { silent: true }); }} placeholder="goods-bucket" className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">加密连接 (SSL / HTTPS)</label>
                  <div className="flex h-10 items-center rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 shadow-2xs">
                    <Switch checked={minioUseSSL} onChange={(val) => { setMinioUseSSL(val); saveSettings({ minioUseSSL: val }); }} />
                    <span className="ml-3 text-xs text-muted-foreground font-semibold">{minioUseSSL ? "已启用 HTTPS 加密" : "当前使用 HTTP"}</span>
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">公开访问外部基础地址 (Public URL)</label>
                  <input type="text" value={minioPublicUrl} onChange={(e) => { setMinioPublicUrl(e.target.value); saveSettings({ minioPublicUrl: e.target.value }, { silent: true }); }} placeholder="https://cdn.example.com" className="h-10 w-full rounded-full border border-border/80 bg-white dark:bg-white/5 px-4 text-xs sm:text-sm outline-none shadow-2xs focus:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl sm:rounded-[22px] border border-dashed border-border/80 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5">
              <div className="text-sm font-black text-foreground">本地文件存储模式</div>
              <div className="mt-1 text-xs text-muted-foreground">当前附件和静态图片保存在本地服务器文件系统中，无需连接第三方对象存储。</div>
            </div>
          )}

          <div className="rounded-2xl sm:rounded-[22px] border border-border/60 bg-zinc-50/80 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/25">
                  <ImageUp size={16} />
                </div>
                <div>
                  <div className="text-sm font-black text-foreground">历史缩略图补齐</div>
                  <div className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    为历史图片补生成轻量缩略图，大幅缩短相册首屏加载时长。
                  </div>
                  <div className="mt-1 text-xs font-bold text-foreground/80">
                    {thumbnailBackfillRemaining === null ? "正在统计待补数量..." : `待补生成：${thumbnailBackfillRemaining} 张`}
                  </div>
                </div>
              </div>
              <button
                onClick={backfillGalleryThumbnails}
                disabled={isBackfillingThumbnails}
                className="inline-flex h-9 w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 text-xs font-black text-primary-foreground shadow-sm shadow-primary/20 hover:shadow-primary/35 hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isBackfillingThumbnails ? <div className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : <ImageUp size={14} />}
                一键补齐
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
