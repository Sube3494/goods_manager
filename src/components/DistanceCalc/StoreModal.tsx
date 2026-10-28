"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Shop {
  id?: string;
  name: string;
  externalId?: string | null;
  address?: string | null;
  isSource: boolean;
}

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (shop: Partial<Shop>) => Promise<void>;
  initialData?: Partial<Shop> | null;
  title?: string;
  libraryName?: string;
}

export function StoreModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = "网点信息",
  libraryName,
}: StoreModalProps) {
  const [mounted, setMounted] = useState(false);
  const [formData, setFormData] = useState<Partial<Shop>>({
    id: undefined,
    name: "",
    externalId: "",
    address: "",
    isSource: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          id: initialData.id,
          name: initialData.name || "",
          externalId: initialData.externalId || "",
          address: initialData.address || "",
          isSource: initialData.isSource ?? true,
        });
      } else {
        setFormData({
          id: undefined,
          name: "",
          externalId: "",
          address: "",
          isSource: true,
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.externalId || !formData.address) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Failed to save shop:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 bg-slate-950/42 backdrop-blur-sm">
      <div
        className="absolute inset-0 transition-opacity duration-300"
        onClick={() => { if (!isSubmitting) onClose(); }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-location-title"
        className="relative flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-[32px] sm:rounded-[36px] border border-black/8 bg-white/95 dark:border-white/10 dark:bg-[#0b111e]/98 text-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="pt-6 px-6 pb-2 sm:pt-7 sm:px-7 sm:pb-3 bg-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MapPin size={20} />
              </div>
              <div>
                <h2 id="dispatch-location-title" className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                  {title !== "网点信息" ? title : (initialData?.id ? "编辑网点" : "新增网点")}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground font-medium">
                  {libraryName ? `保存至${libraryName}，获授权成员可查看和管理。` : "添加常用取货点，让每次调货更顺路。"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="关闭网点编辑"
              disabled={isSubmitting}
              className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 sm:px-7 sm:pb-7 pt-2">
          <div className="space-y-4">
            <div className="grid gap-3.5">
              <div className="space-y-1.5">
                <label htmlFor="dispatch-name" className="text-xs sm:text-sm font-semibold text-foreground">
                  网点名称 <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  required
                  id="dispatch-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入网点名称"
                  className="h-10 w-full rounded-full border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/4 px-4 text-xs sm:text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10 shadow-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dispatch-poi" className="text-xs sm:text-sm font-semibold text-foreground">
                  POI_ID <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  required
                  id="dispatch-poi"
                  value={formData.externalId || ""}
                  onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                  placeholder="例如：27678090"
                  className="h-10 w-full rounded-full border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/4 px-4 text-xs sm:text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10 shadow-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dispatch-address" className="text-xs sm:text-sm font-semibold text-foreground">
                  详细地址 <span className="text-rose-500 font-bold">*</span>
                </label>
                <textarea
                  required
                  id="dispatch-address"
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="例如：广东省广州市天河区广州大道中..."
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/4 px-4 py-3 text-xs sm:text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/10 shadow-xs"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/4 px-4 py-3 text-xs text-muted-foreground leading-relaxed font-medium">
              此处仅管理调货网点，可放心编辑，不会修改个人收货地址。
            </div>
          </div>

          <div className="sticky bottom-0 mt-6 flex gap-2.5 border-t border-black/8 dark:border-white/10 bg-transparent pb-[env(safe-area-inset-bottom)] pt-4 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 flex-1 px-5 sm:flex-none flex items-center justify-center rounded-full border border-black/8 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8 text-foreground text-xs sm:text-sm font-medium transition-all active:scale-95 cursor-pointer sm:min-w-[90px] shadow-xs"
            >
              取消
            </button>
            {(() => {
              const isFormInvalid = !formData.name || !formData.externalId || !formData.address;
              return (
                <button
                  type="submit"
                  disabled={isSubmitting || isFormInvalid}
                  className={cn(
                    "h-10 flex flex-1 items-center sm:flex-none justify-center gap-1.5 rounded-full px-6 text-xs sm:text-sm font-medium transition-all active:scale-95 cursor-pointer sm:min-w-[120px] shadow-xs",
                    isFormInvalid
                      ? "border border-black/8 bg-black/5 dark:border-white/10 dark:bg-white/5 text-muted-foreground/40 cursor-not-allowed shadow-none"
                      : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20"
                  )}
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  {initialData?.id ? "保存修改" : "确认新增"}
                </button>
              );
            })()}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
