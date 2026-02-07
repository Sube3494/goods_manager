"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, User, Phone, Mail, MapPin, Truck } from "lucide-react";
import { Supplier } from "@/lib/types";

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Supplier, "id"> & { id?: string }) => void;
  initialData?: Supplier | null;
}

export function SupplierModal({ isOpen, onClose, onSubmit, initialData }: SupplierModalProps) {
  const [formData, setFormData] = useState<Omit<Supplier, "id"> & { id?: string }>({
    name: initialData?.name || "",
    contact: initialData?.contact || "",
    phone: initialData?.phone || "",
    email: initialData?.email || "",
    address: initialData?.address || "",
    id: initialData?.id
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-border p-8 bg-muted/30 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">
                {initialData ? "编辑供应商" : "新建供应商"}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Truck size={16} /> 供应商名称
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="例如：卓越物流供应链"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Contact */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <User size={16} /> 联系人
                            </label>
                            <input 
                                type="text" 
                                value={formData.contact}
                                onChange={(e) => setFormData({...formData, contact: e.target.value})}
                                className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="联系人姓名"
                            />
                        </div>

                        {/* Phone */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Phone size={16} /> 联系电话
                            </label>
                            <input 
                                type="tel" 
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                                placeholder="电话号码"
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Mail size={16} /> 电子邮箱
                        </label>
                        <input 
                            type="email" 
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all"
                            placeholder="example@supplier.com"
                        />
                    </div>
                    
                    {/* Address */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <MapPin size={16} /> 地址
                        </label>
                        <textarea 
                            value={formData.address}
                            onChange={(e) => setFormData({...formData, address: e.target.value})}
                            className="w-full rounded-xl bg-secondary/50 border-transparent focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary/20 transition-all resize-none h-20"
                            placeholder="公司地址..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-border p-8 bg-muted/30 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
                    >
                        <CheckCircle size={18} />
                        保存供应商
                    </button>
                </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
