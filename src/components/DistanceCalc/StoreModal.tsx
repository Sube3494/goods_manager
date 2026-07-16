"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

interface Shop {
  id?: string;
  name: string;
  externalId?: string | null;
  address?: string | null;
  isSource: boolean;
  libraryId?: string | null;
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
  const [mounted, setMounted] = useState(false);
  const [libraries, setLibraries] = useState<any[]>([]);
  const [formData, setFormData] = useState<Partial<Shop>>({
    id: undefined,
    name: "",
    externalId: "",
    address: "",
    isSource: true,
    libraryId: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // 预先拉取当前用户有权限的商品库列表
      void fetch("/api/product-libraries")
        .then((res) => res.json())
        .then((data) => {
          const libs = Array.isArray(data) ? data : (data.libraries || []);
          setLibraries(libs);
          
          if (libs.length > 0) {
            setFormData((prev) => {
              const hasValidLib = prev.libraryId && libs.some((l: any) => l.id === prev.libraryId);
              if (!hasValidLib) {
                return { ...prev, libraryId: libs[0].id };
              }
              return prev;
            });
          }
        })
        .catch((err) => console.error("Failed to load libraries:", err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          id: initialData.id,
          name: initialData.name || "",
          externalId: initialData.externalId || "",
          address: initialData.address || "",
          isSource: initialData.isSource ?? true,
          libraryId: initialData.libraryId || null,
        });
      } else {
        setFormData({
          id: undefined,
          name: "",
          externalId: "",
          address: "",
          isSource: true,
          libraryId: null,
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.externalId || !formData.address) return;
    if (libraries.length > 0 && !formData.libraryId) return;

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
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/40 dark:bg-[#020617]/75 backdrop-blur-md dark:backdrop-blur-2xl transition-all duration-300" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-[480px] overflow-hidden rounded-3xl border border-black/[0.08] dark:border-white/10 bg-white/98 dark:bg-[#0c101d] shadow-2xl dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in-95 duration-300">
        <div className="pt-7 px-7 pb-3 sm:pt-8 sm:px-8 sm:pb-4 bg-transparent">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-wide">
                {title !== "店铺信息" ? title : (initialData?.id ? "编辑店铺" : "新增店铺")}
              </h2>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-normal">
                录入门店名称、POI_ID 和详细地址后即可加入调货测算。
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] transition-all duration-300 hover:rotate-90 active:scale-90"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-7 pb-7 sm:px-8 sm:pb-8 pt-2">
          <div className="space-y-5">
            <div className="grid gap-4.5">
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                  门店名称 <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入门店名称"
                  className="h-12 w-full rounded-2xl border border-black/10 dark:border-white/[0.05] bg-black/[0.01] dark:bg-[#131926] px-4.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500/80 focus:border-blue-500/30 focus:bg-white dark:focus:bg-[#161d2d] focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                  POI_ID <span className="text-rose-500 font-bold">*</span>
                </label>
                <input
                  required
                  value={formData.externalId || ""}
                  onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
                  placeholder="例如：27678090"
                  className="h-12 w-full rounded-2xl border border-black/10 dark:border-white/[0.05] bg-black/[0.01] dark:bg-[#131926] px-4.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500/80 focus:border-blue-500/30 focus:bg-white dark:focus:bg-[#161d2d] focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                  详细地址 <span className="text-rose-500 font-bold">*</span>
                </label>
                <textarea
                  required
                  value={formData.address || ""}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="例如：广东省广州市天河区广州大道中..."
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-black/10 dark:border-white/[0.05] bg-black/[0.01] dark:bg-[#131926] px-4.5 py-3.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500/80 focus:border-blue-500/30 focus:bg-white dark:focus:bg-[#161d2d] focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5"
                />
              </div>

              {libraries.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                    绑定商品库 <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={formData.libraryId || ""}
                      onChange={(e) => setFormData({ ...formData, libraryId: e.target.value })}
                      className="h-12 w-full appearance-none rounded-2xl border border-black/10 dark:border-white/[0.05] bg-black/[0.01] dark:bg-[#131926] px-4.5 text-xs sm:text-sm text-slate-900 dark:text-white outline-none transition-all focus:border-blue-500/30 focus:bg-white dark:focus:bg-[#161d2d] focus:ring-4 focus:ring-blue-500/10 dark:focus:ring-blue-500/5 cursor-pointer"
                    >
                      {libraries.map((lib) => (
                        <option key={lib.id} value={lib.id} className="dark:bg-[#131926] dark:text-white">
                          {lib.name}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400 dark:text-slate-500">
                      <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-black/[0.03] dark:border-white/[0.02] bg-slate-50/60 dark:bg-[#131926]/40 px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400/80 font-medium leading-relaxed">
              {libraries.length > 0 ? "四项均为必填，用于门店去重、定位、商品库隔离和路线测算。" : "三项均为必填，用于门店去重、定位和路线测算。"}
            </div>
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-black/[0.05] dark:border-white/[0.05] pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-6 flex items-center justify-center rounded-full border border-black/5 dark:border-white/10 bg-slate-100 dark:bg-transparent hover:bg-slate-200 dark:hover:bg-white/5 text-slate-700 dark:text-white text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer sm:min-w-[110px]"
            >
              取消
            </button>
            {(() => {
              const isFormInvalid = !formData.name || !formData.externalId || !formData.address || (libraries.length > 0 && !formData.libraryId);
              return (
                <button
                  type="submit"
                  disabled={isSubmitting || isFormInvalid}
                  className={`h-11 flex items-center justify-center gap-1.5 rounded-full px-6 text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer sm:min-w-[140px] ${
                    isFormInvalid
                      ? "bg-slate-200/80 text-slate-400 dark:bg-[#202737] dark:text-[#555d70] cursor-not-allowed border-transparent shadow-none"
                      : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-[#0c101d] dark:hover:bg-slate-100 shadow-lg dark:shadow-[0_4px_20px_rgba(255,255,255,0.12)]"
                  }`}
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
