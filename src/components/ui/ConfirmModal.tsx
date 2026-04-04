"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Info, CheckCircle2, LogIn, Fingerprint, ShieldAlert } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "warning" | "info" | "success";
  className?: string;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "确认操作",
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  variant = "warning",
  className
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalStyle; };
    }
  }, [isOpen]);

  // Use a simple boolean to track if we're on the client
  if (typeof window === "undefined") return null;

  const isAuth = title.includes("登录");

  const icons = {
    primary: isAuth ? <Fingerprint size={28} /> : <LogIn size={28} />,
    danger: <ShieldAlert size={28} />,
    warning: <AlertTriangle size={28} />,
    info: <Info size={28} />,
    success: <CheckCircle2 size={28} />
  };

  const variantStyles = {
    primary: {
      iconBg: "bg-primary/10 border-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.2)]",
      confirm: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_20px_-5px_rgba(var(--primary-rgb),0.4)]",
      accent: "from-primary/20 via-transparent to-transparent"
    },
    danger: {
      iconBg: "bg-destructive/10 border-destructive/20 text-destructive shadow-[0_0_20px_rgba(239,68,68,0.2)]",
      confirm: "bg-destructive text-white hover:bg-destructive/90 shadow-[0_10px_20px_-5px_rgba(239,68,68,0.4)]",
      accent: "from-destructive/20 via-transparent to-transparent"
    },
    warning: {
      iconBg: "bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)]",
      confirm: "bg-amber-500 text-white hover:bg-amber-600 shadow-[0_10px_20px_-5px_rgba(245,158,11,0.4)]",
      accent: "from-amber-500/20 via-transparent to-transparent"
    },
    info: {
      iconBg: "bg-blue-500/10 border-blue-500/20 text-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.2)]",
      confirm: "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_10px_20px_-5px_rgba(59,130,246,0.4)]",
      accent: "from-blue-500/20 via-transparent to-transparent"
    },
    success: {
      iconBg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)]",
      confirm: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_10px_20px_-5px_rgba(16,185,129,0.4)]",
      accent: "from-emerald-500/20 via-transparent to-transparent"
    }
  };

  const currentStyle = variantStyles[variant as keyof typeof variantStyles] || variantStyles.warning;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className={cn("fixed inset-0 z-100000 flex items-center justify-center p-4 sm:p-6 safe-y safe-x lg:pl-(--sidebar-width) transition-[padding] duration-200", className)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-xl transition-all duration-500"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={cn(
              "relative z-10 w-full max-h-safe-modal rounded-[26px] sm:rounded-[32px] bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 shadow-2xl overflow-hidden flex flex-col",
              isAuth
                ? "max-w-[min(calc(100vw-2rem),22rem)] sm:max-w-[420px]"
                : "max-w-[min(calc(100vw-2rem),24rem)] sm:max-w-[420px]"
            )}
          >
            {/* Subtle Gradient Accent */}
            <div className={cn("absolute top-0 left-0 right-0 h-40 bg-linear-to-b opacity-20 pointer-events-none", currentStyle.accent)} />

            {/* Close Button */}
            <button 
              onClick={onClose} 
              className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 z-20 rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all active:scale-90"
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            <div className="px-5 sm:px-8 pt-6 sm:pt-10 pb-5 sm:pb-8 flex flex-col items-center text-center overflow-y-auto min-w-0">
              {/* Icon Section */}
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 20 }}
                className={cn(
                  "w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] sm:rounded-[28px] flex items-center justify-center border-2 mb-4 sm:mb-8 relative group shrink-0",
                  currentStyle.iconBg
                )}
              >
                <div className="absolute inset-0 rounded-[28px] bg-inherit opacity-50 blur-xl group-hover:blur-2xl transition-all duration-500" />
                <div className="relative z-10 scale-100 sm:scale-110">
                  {icons[variant as keyof typeof icons] || icons.warning}
                </div>
              </motion.div>

              {/* Text Section */}
              <div className="space-y-2.5 sm:space-y-3 relative z-10">
                <h2 className="text-[1.9rem] sm:text-2xl font-black text-foreground tracking-tight leading-none sm:leading-tight break-words">
                  {title}
                </h2>
                <div className="max-w-[17.5rem] sm:max-w-none text-[15px] sm:text-[15px] font-medium text-muted-foreground leading-7 sm:leading-relaxed px-1 sm:px-2 break-words">
                  {message}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="px-5 sm:px-8 pb-5 sm:pb-8 pt-1 sm:pt-0 flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:gap-4 relative z-10 min-w-0">
              <button
                onClick={onClose}
                className="order-1 sm:order-none min-w-0 h-11 sm:h-14 rounded-2xl px-4 text-[15px] sm:text-[15px] font-bold text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/10 sm:border-transparent hover:border-black/5 dark:hover:border-white/5 transition-all active:scale-[0.97]"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "min-w-0 h-13 sm:h-14 rounded-[20px] sm:rounded-2xl px-4 text-[15px] sm:text-[15px] font-black transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 sm:gap-2 text-center leading-tight",
                  currentStyle.confirm
                )}
              >
                {confirmLabel}
                {isAuth && <LogIn size={18} strokeWidth={3} />}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
