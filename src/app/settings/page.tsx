"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ShieldCheck, Database, Zap, Info, ShieldAlert, Users } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { GeneralTab } from "@/components/Settings/GeneralTab";
import { StorageTab } from "@/components/Settings/StorageTab";
import { DataTab } from "@/components/Settings/DataTab";
import { SystemTab } from "@/components/Settings/SystemTab";
import { hasAdminAccess, SessionUser } from "@/lib/permissions";

type ActiveTab = "general" | "storage" | "data" | "system";

interface TabMeta {
  id: ActiveTab;
  label: string;
  icon: typeof Zap;
  desc: string;
  accent: string;
}

interface SystemInfo {
  version: string;
  dbType: string;
  nodeVersion: string;
  lastBackup: string;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[60dvh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">准备配置中心...</div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const sessionUser = user as SessionUser | null;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const canManageRoles = hasAdminAccess(sessionUser, "roles:manage");
  const canManageMembers = hasAdminAccess(sessionUser, "members:manage");
  const [lowStockThreshold, setLowStockThreshold] = useState<number | "">(10);
  const [allowGalleryUpload, setAllowGalleryUpload] = useState<boolean>(true);
  const [requireLoginForLightbox, setRequireLoginForLightbox] = useState<boolean>(false);
  const [gallerySortDesc, setGallerySortDesc] = useState<boolean>(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  // Initialize tab based on search params
  const initialTab = (searchParams.get("tab") as ActiveTab) || (isSuperAdmin ? "general" : "data");
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);

  // Storage settings
  const [storageType, setStorageType] = useState<"local" | "minio">("local");
  const [minioEndpoint, setMinioEndpoint] = useState("");
  const [minioPort, setMinioPort] = useState<number | "">("");
  const [minioAccessKey, setMinioAccessKey] = useState("");
  const [minioSecretKey, setMinioSecretKey] = useState("");
  const [minioBucket, setMinioBucket] = useState("");
  const [minioUseSSL, setMinioUseSSL] = useState(true);
  const [minioPublicUrl, setMinioPublicUrl] = useState("");
  const [uploadConflictStrategy, setUploadConflictStrategy] = useState<"overwrite" | "rename" | "skip">("rename");
  const [shareExpireDuration, setShareExpireDuration] = useState<number | "">(1);
  const [shareExpireUnit, setShareExpireUnit] = useState<"minutes" | "hours" | "days">("hours");
  
  // Use refs to track last saved values to prevent initial auto-save and loops
  const lastSavedSettings = useRef<Record<string, unknown>>({});
  const isInitialized = useRef(false);

  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const res = await fetch("/api/system/settings/test-storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageType,
          minioEndpoint,
          minioPort,
          minioAccessKey,
          minioSecretKey,
          minioBucket,
          minioUseSSL
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "连接测试成功", "success");
      } else {
        showToast(data.error || "连接测试失败", "error");
      }
    } catch {
      showToast("连接请求失败", "error");
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    const initData = async () => {
        try {
            const [settingsRes, infoRes] = await Promise.all([
                fetch("/api/system/settings"),
                fetch("/api/system/info")
            ]);

            if (settingsRes.ok) {
                const data = await settingsRes.json();
                setLowStockThreshold(data.lowStockThreshold);
                setAllowGalleryUpload(data.allowGalleryUpload ?? true);
                setRequireLoginForLightbox(data.requireLoginForLightbox ?? false);
                setGallerySortDesc(data.gallerySortDesc ?? true);
                
                // Storage settings
                setStorageType(data.storageType || "local");
                setMinioEndpoint(data.minioEndpoint || "");
                setMinioPort(data.minioPort || "");
                setMinioAccessKey(data.minioAccessKey || "");
                setMinioSecretKey(data.minioSecretKey || "");
                setMinioBucket(data.minioBucket || "");
                setMinioUseSSL(data.minioUseSSL ?? true);
                setMinioPublicUrl(data.minioPublicUrl || "");
                setUploadConflictStrategy(
                    data.uploadConflictStrategy || "uuid"
                );
                setShareExpireDuration(data.shareExpireDuration ?? 1);
                setShareExpireUnit(data.shareExpireUnit || "hours");

                lastSavedSettings.current = data;
            }

            if (infoRes.ok) {
                setSystemInfo(await infoRes.json());
            }
        } catch (_error) {
            console.error("Failed to load settings:", _error);
            showToast("加载配置失败", "error");
        } finally {
            setIsLoading(false);
            setTimeout(() => { isInitialized.current = true; }, 100);
        }
    };
    initData();
  }, [showToast]);

  const saveSettings = useCallback(async (newSettings: Record<string, unknown>, options: { silent?: boolean } = {}) => {
    setSaveStatus("saving");
    
    const payload = {
        lowStockThreshold,
        allowGalleryUpload,
        requireLoginForLightbox,
        gallerySortDesc,
        storageType,
        minioEndpoint,
        minioPort,
        minioAccessKey,
        minioSecretKey,
        minioBucket,
        minioUseSSL,
        minioPublicUrl,
        uploadConflictStrategy,
        shareExpireDuration,
        shareExpireUnit,
        ...newSettings
    };

    try {
      const res = await fetch("/api/system/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setSaveStatus("saved");
        lastSavedSettings.current = { ...lastSavedSettings.current, ...payload };
        if (!options.silent) {
            showToast("系统设置已更新", "success");
        }
      } else {
        setSaveStatus("error");
        showToast("自动保存失败", "error");
      }
    } finally {
      // Done saving
    }
  }, [
    lowStockThreshold, 
    allowGalleryUpload, 
    requireLoginForLightbox,
    gallerySortDesc,
    storageType, 
    minioEndpoint, 
    minioPort, 
    minioAccessKey, 
    minioSecretKey, 
    minioBucket, 
    minioUseSSL, 
    minioPublicUrl, 
    uploadConflictStrategy, 
    shareExpireDuration,
    shareExpireUnit,
    showToast
  ]);

  // Debounced save for text inputs
  useEffect(() => {
    if (!isInitialized.current) return;
    if (lowStockThreshold === lastSavedSettings.current.lowStockThreshold) return;

    const timer = setTimeout(() => {
      saveSettings({ lowStockThreshold }, { silent: true });
    }, 800);

    return () => clearTimeout(timer);
  }, [lowStockThreshold, saveSettings]);

  // Sync tab from URL if it changes while on page
  useEffect(() => {
    const tab = searchParams.get("tab") as ActiveTab | null;
    if (tab && ["general", "storage", "data", "system"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const tabs = useMemo<TabMeta[]>(() => {
    if (isSuperAdmin) {
      return [
        { id: "general", label: "常规设置", icon: Zap, desc: "主题偏好、预警阈值与工作台体验。", accent: "from-amber-500/20 via-orange-500/10 to-transparent" },
        { id: "storage", label: "存储中心", icon: Database, desc: "文件驱动、对象存储与冲突处理策略。", accent: "from-sky-500/20 via-cyan-500/10 to-transparent" },
        { id: "data", label: "数据管理", icon: ShieldCheck, desc: "备份归档、恢复流程和高风险数据操作。", accent: "from-emerald-500/20 via-teal-500/10 to-transparent" },
        { id: "system", label: "关于系统", icon: Info, desc: "版本、运行环境与模块概览。", accent: "from-violet-500/20 via-fuchsia-500/10 to-transparent" },
      ];
    }

    return [
      { id: "data", label: "备份与恢复", icon: Database, desc: "导出当前数据、查看归档并下载备份。", accent: "from-emerald-500/20 via-teal-500/10 to-transparent" },
    ];
  }, [isSuperAdmin]);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const overviewCards = [
    {
      label: "当前工作区",
      value: activeTabMeta.label,
      hint: activeTabMeta.desc,
      tone: "text-foreground",
    },
    {
      label: "自动同步",
      value: saveStatus === "saving" ? "同步中" : saveStatus === "error" ? "异常" : "正常",
      hint: saveStatus === "saving" ? "设置变更正在写入系统。" : saveStatus === "error" ? "最近一次保存失败，请重试。" : "最近一次设置已落盘。",
      tone: saveStatus === "error" ? "text-red-500" : saveStatus === "saving" ? "text-primary" : "text-emerald-500",
    },
    {
      label: "管理边界",
      value: isSuperAdmin ? "超级管理员" : "系统管理员",
      hint: isSuperAdmin ? "可访问高风险系统级配置与恢复能力。" : "仅展示授权范围内的系统能力。",
      tone: "text-foreground",
    },
  ];

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [activeTab, tabs]);

  // Immediate save for toggle
  const toggleGalleryUpload = () => {
    const newValue = !allowGalleryUpload;
    setAllowGalleryUpload(newValue);
    saveSettings({ allowGalleryUpload: newValue });
  };

  const toggleRequireLoginForLightbox = () => {
    const newValue = !requireLoginForLightbox;
    setRequireLoginForLightbox(newValue);
    saveSettings({ requireLoginForLightbox: newValue });
  };

  if (isLoading) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">读取系统配置中...</div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 overflow-x-hidden">
      <div className="relative overflow-hidden rounded-[24px] md:rounded-[28px] border border-border/60 bg-white/70 dark:bg-white/5 shadow-sm backdrop-blur-xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className={cn("absolute right-8 top-8 h-28 w-28 rounded-full opacity-60 blur-3xl", activeTabMeta.accent)} />
        </div>
        <div className="relative p-4 md:p-7 space-y-5 md:space-y-6">
          <div className="flex flex-col gap-4 md:gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-black tracking-[0.18em] text-muted-foreground uppercase backdrop-blur">
                <ShieldCheck size={12} className="text-primary" />
                配置中心
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-4xl font-black tracking-tight text-foreground">
                  {isSuperAdmin ? "系统管理中心" : "系统工作台"}
                </h1>
                <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">
                  {isSuperAdmin
                    ? "把全局逻辑、文件存储、备份恢复和系统状态放到一个更清楚的工作区里。"
                    : "只展示你被授权管理的系统能力，避免把危险操作和日常工作混在一起。"}
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-background/80 px-3 py-2 text-[11px] md:text-xs font-bold shadow-sm backdrop-blur self-start">
              {saveStatus === "saving" && (
                <>
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-primary">设置正在同步</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span className="text-muted-foreground">最近一次改动已同步</span>
                </>
              )}
              {saveStatus === "error" && <span className="text-red-500">最近一次同步失败</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overviewCards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-border/60 bg-background/70 px-4 py-4 backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">{card.label}</div>
                <div className={cn("mt-2 text-lg font-black", card.tone)}>{card.value}</div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{card.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4">
          <div className="rounded-[24px] md:rounded-[26px] border border-border/60 bg-white/70 dark:bg-white/5 p-3 shadow-sm backdrop-blur-xl">
            <div className="mb-2 px-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
              设置分区
            </div>
            <div className="-mx-1 overflow-x-auto px-1 xl:mx-0 xl:px-0">
            <div className="flex gap-2 xl:block xl:space-y-1.5 xl:gap-0 min-w-max xl:min-w-0">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "group relative min-w-[170px] sm:min-w-[220px] xl:min-w-0 xl:w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all",
                      isActive
                        ? "border-primary/20 bg-primary/[0.07] shadow-sm"
                        : "border-transparent hover:border-border/60 hover:bg-black/[0.025] dark:hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border", isActive ? "border-primary/15 bg-primary text-primary-foreground" : "border-border/60 bg-background text-foreground/70")}>
                        <tab.icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className={cn("text-sm font-black", isActive ? "text-foreground" : "text-foreground/85")}>{tab.label}</div>
                        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{tab.desc}</div>
                      </div>
                    </div>
                    {isActive && (
                      <motion.div
                        layoutId="activeSettingTab"
                        className="absolute inset-0 rounded-2xl ring-1 ring-primary/15"
                        transition={{ type: "spring", bounce: 0.18, duration: 0.55 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            </div>
          </div>

          {canManageRoles && (
            <div className="rounded-[24px] md:rounded-[26px] border border-border/60 bg-white/70 dark:bg-white/5 p-3 shadow-sm backdrop-blur-xl">
              <div className="mb-2 px-2 pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">
                管理入口
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <Link
                  href="/admin/roles"
                  className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 hover:border-primary/25 hover:bg-primary/[0.04] transition-all"
                >
                  <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary ring-1 ring-primary/20">
                    <ShieldAlert size={15} />
                  </div>
                  <div>
                    <div className="text-sm font-black text-foreground">角色管理</div>
                    <div className="mt-1 text-xs text-muted-foreground leading-relaxed">维护角色模板、权限矩阵与岗位职责边界。</div>
                  </div>
                </Link>
                {canManageMembers && (
                  <Link
                    href="/admin/members"
                    className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3 hover:border-sky-500/25 hover:bg-sky-500/[0.04] transition-all"
                  >
                    <div className="mt-0.5 rounded-xl bg-sky-500/10 p-2 text-sky-500 ring-1 ring-sky-500/20">
                      <Users size={15} />
                    </div>
                    <div>
                      <div className="text-sm font-black text-foreground">成员管理</div>
                      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">维护成员状态、白名单与邀请准入。</div>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0 overflow-hidden rounded-[24px] md:rounded-[28px] border border-border/60 bg-white/70 dark:bg-white/5 p-4 md:p-6 shadow-sm backdrop-blur-xl">
          <div className="mb-4 md:mb-5 flex flex-col gap-2 border-b border-border/50 pb-4">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">当前分区</div>
            <div className="text-xl md:text-2xl font-black tracking-tight text-foreground">{activeTabMeta.label}</div>
            <div className="text-sm text-muted-foreground leading-relaxed">{activeTabMeta.desc}</div>
          </div>

          <div className="grid grid-cols-1 w-full gap-6 min-w-0 overflow-hidden">
        {activeTab === "general" && (
          <GeneralTab
            theme={theme}
            setTheme={setTheme}
            lowStockThreshold={lowStockThreshold}
            setLowStockThreshold={setLowStockThreshold}
            saveSettings={saveSettings}
          />
        )}

        {activeTab === "storage" && (
          <StorageTab
            storageType={storageType}
            setStorageType={setStorageType}
            uploadConflictStrategy={uploadConflictStrategy}
            setUploadConflictStrategy={setUploadConflictStrategy}
            minioEndpoint={minioEndpoint}
            setMinioEndpoint={setMinioEndpoint}
            minioPort={minioPort}
            setMinioPort={setMinioPort}
            minioAccessKey={minioAccessKey}
            setMinioAccessKey={setMinioAccessKey}
            minioSecretKey={minioSecretKey}
            setMinioSecretKey={setMinioSecretKey}
            minioBucket={minioBucket}
            setMinioBucket={setMinioBucket}
            minioUseSSL={minioUseSSL}
            setMinioUseSSL={setMinioUseSSL}
            minioPublicUrl={minioPublicUrl}
            setMinioPublicUrl={setMinioPublicUrl}
            testConnection={testConnection}
            isTesting={isTesting}
            saveSettings={saveSettings}
          />
        )}

        {activeTab === "data" && (
          <DataTab
            allowGalleryUpload={allowGalleryUpload}
            toggleGalleryUpload={toggleGalleryUpload}
            requireLoginForLightbox={requireLoginForLightbox}
            toggleRequireLoginForLightbox={toggleRequireLoginForLightbox}
            gallerySortDesc={gallerySortDesc}
            setGallerySortDesc={setGallerySortDesc}
            shareExpireDuration={shareExpireDuration}
            setShareExpireDuration={setShareExpireDuration}
            shareExpireUnit={shareExpireUnit}
            setShareExpireUnit={setShareExpireUnit}
            saveSettings={saveSettings}
            mode={isSuperAdmin ? "full" : "backup_only"}
            canManageDangerZone={isSuperAdmin}
          />
        )}

        {activeTab === "system" && (
          <SystemTab systemInfo={systemInfo} />
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
