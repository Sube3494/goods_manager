"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Shop {
  id?: string;
  name: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  remark?: string | null;
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
    address: "",
    contactName: "",
    contactPhone: "",
    remark: "",
    isSource: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name || "",
          address: initialData.address || "",
          contactName: initialData.contactName || "",
          contactPhone: initialData.contactPhone || "",
          remark: initialData.remark || "",
          isSource: initialData.isSource ?? true,
        });
      } else {
        setFormData({
          name: "",
          address: "",
          contactName: "",
          contactPhone: "",
          remark: "",
          isSource: true,
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

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
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-slate-900 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <h2 className="text-xl font-black text-white">
            {title !== "店铺信息" ? title : (initialData?.id ? "编辑店铺" : "新增店铺")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-white/40">店铺名称 *</label>
              <input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入店铺名称"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-white/40">详细地址</label>
              <textarea
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="例如：广东省广州市天河区广州大道中..."
                rows={2}
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/40">联系人</label>
                <input
                  value={formData.contactName || ""}
                  onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                  placeholder="联系人姓名"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-white/40">联系电话</label>
                <input
                  value={formData.contactPhone || ""}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  placeholder="手机或座机"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-white/40">备注</label>
              <input
                value={formData.remark || ""}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                placeholder="其它补充信息"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isSource: !formData.isSource })}
                className={cn(
                  "flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-200 ease-in-out",
                  formData.isSource ? "bg-primary" : "bg-white/10"
                )}
              >
                <div className={cn(
                  "h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out",
                  formData.isSource ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
              <span className="text-sm font-bold text-white/60">设为本地区调货源</span>
            </div>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-sm font-black text-white hover:bg-white/10 transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-sm font-black text-white hover:bg-primary/90 disabled:opacity-50 transition-all shadow-xl shadow-primary/20"
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
