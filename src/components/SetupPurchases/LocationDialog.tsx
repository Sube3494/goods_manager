"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StoreLocationMap } from "./StoreLocationMap";
import { useUser } from "@/hooks/useUser";
import { hasPermission, type SessionUser } from "@/lib/permissions";

export function LocationDialog({ triggerClassName }: { triggerClassName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useUser();
  if (!user || (!hasPermission(user as SessionUser, "setup_purchase:manage") || !hasPermission(user as SessionUser, "setup_purchase:location"))) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-black/8 bg-white/80 px-4 text-xs font-semibold text-foreground shadow-xs transition-all hover:bg-white active:scale-95 md:h-10 md:px-5 md:text-sm dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 cursor-pointer",
          triggerClassName
        )}
      >
        <MapPin size={16} className="text-primary shrink-0" />
        <span>选址分析</span>
      </button>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-100 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/45 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="absolute inset-0 transition-opacity"
              onClick={() => setIsOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="开店选址分析"
              className="relative z-10 flex flex-col overflow-hidden rounded-[24px] sm:rounded-[32px] md:rounded-[36px] border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 text-foreground shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-200"
              style={{
                width: "min(1600px, calc(100vw - 24px))",
                height: "min(960px, calc(100dvh - 24px))",
              }}
            >
              {/* 弹窗顶部标头 */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/8 dark:border-white/10 px-4 py-3 sm:px-6 sm:py-3.5 bg-black/[0.015] dark:bg-white/[0.015]">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <MapPin size={18} className="sm:size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                        开店选址 · 空间分析
                      </h2>
                      <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        原生 React 驱动
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground font-medium truncate">
                      全国地点精准检索 · 辐射半径与覆盖重叠率实时测算 · 本机自动保存
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setIsOpen(false)}
                    aria-label="关闭选址"
                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 transition-all active:scale-95 cursor-pointer shadow-xs"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* 纯正的 React 地图分析组件 */}
              <div className="relative flex-1 min-h-0 w-full overflow-hidden bg-background">
                <StoreLocationMap key={user.id} userId={user.id} />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
