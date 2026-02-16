"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info" | "success";
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "确认操作",
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  variant = "warning"
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);


  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);


  if (!mounted) return null;

  const icons = {
    danger: <AlertTriangle className="text-destructive mb-0.5" size={24} />,
    warning: <AlertTriangle className="text-amber-500 mb-0.5" size={24} />,
    info: <Info className="text-primary mb-0.5" size={24} />,
    success: <CheckCircle2 className="text-emerald-500 mb-0.5" size={24} />
  };

  const buttonStyles = {
    danger: "bg-destructive text-white hover:bg-destructive/90 shadow-lg shadow-destructive/20",
    warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20",
    info: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
  };

  const variantBgs = {
    danger: "bg-destructive/10 border-destructive/20 text-destructive",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-500",
    info: "bg-primary/10 border-primary/20 text-primary",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-20000 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative z-10 w-full max-w-md rounded-3xl bg-white/90 dark:bg-gray-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 p-6 shrink-0">
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                {title}
              </h2>
              <button 
                onClick={onClose} 
                className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 flex gap-6 items-center">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0 shadow-inner",
                variantBgs[variant]
              )}>
                {icons[variant]}
              </div>
              <div className="space-y-1">
                <p className="text-[15px] font-medium text-foreground/90 leading-relaxed text-left">
                  {message}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 p-6 pt-0 shrink-0">
              <button
                onClick={onClose}
                className="rounded-full px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "rounded-full px-10 py-2.5 text-sm font-bold transition-all active:scale-[0.98] shadow-lg",
                  buttonStyles[variant]
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
