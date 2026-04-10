"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

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
}

export function StoreModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  title = "店铺信息",
}: StoreModalProps) {
  const [formData, setFormData] = useState<Partial<Shop>>({
    name: "",
    externalId: "",
    address: "",
    isSource: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name || "",
          externalId: initialData.externalId || "",
          address: initialData.address || "",
          isSource: initialData.isSource ?? true,
        });
      } else {
        setFormData({
          name: "",
          externalId: "",
          address: "",
          isSource: true,
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[24px] border border-border/60 bg-background shadow-2xl animate-in fade-in zoom-in duration-200 backdrop-blur-xl sm:rounded-[28px]">
        <div className="border-b border-border/60 bg-white/[0.02] px-5 py-5 dark:bg-white/[0.03] sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[24px] font-black tracking-tight text-foreground sm:text-[28px]">
                {title !== "店铺信息" ? title : (initialData?.id ? "编辑店铺" : "新增店铺")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                录入门店名称、POI_ID 和详细地址后即可加入调货测算。
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-7">
          <div className="space-y-6">
            <div className="grid gap-5">
              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">
                  门店名称 <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入门店名称"
                  className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-foreground outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/70 focus:border-primary/20 focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:hover:bg-white/[0.07]"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">
                  POI_ID <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={formData.externalId || ""}
                  onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                  placeholder="例如：27678090"
                  className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-foreground outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/70 focus:border-primary/20 focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:hover:bg-white/[0.07]"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-foreground">
                  详细地址 <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="例如：广东省广州市天河区广州大道中..."
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none ring-1 ring-transparent transition-all placeholder:text-muted-foreground/70 focus:border-primary/20 focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:hover:bg-white/[0.07]"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              三项均为必填，用于门店去重、定位和路线测算。
            </div>
          </div>

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-border/60 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-muted sm:min-w-[120px]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.externalId || !formData.address}
              className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[140px]"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {initialData?.id ? "保存修改" : "确认新增"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
