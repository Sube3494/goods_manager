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
  const authPrimary = isAuth && variant === "primary";

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className={cn(
            "fixed inset-0 z-100000 flex items-end justify-center p-3 sm:items-center sm:p-6 safe-y safe-x lg:pl-(--sidebar-width) transition-[padding] duration-200",
            className
          )}
          style={{
            paddingTop: "max(12px, calc(env(safe-area-inset-top, 0px) + 12px))",
            paddingRight: "max(12px, calc(env(safe-area-inset-right, 0px) + 12px))",
            paddingBottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
            paddingLeft: "max(12px, calc(env(safe-area-inset-left, 0px) + 12px))",
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed inset-0 transition-all duration-500",
              authPrimary
                ? "bg-black/55 backdrop-blur-2xl"
                : "bg-black/60 backdrop-blur-xl"
            )}
            onClick={onClose}
          >
            {authPrimary && (
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute left-[-8%] top-[-6%] h-56 w-56 rounded-full bg-orange-500/18 blur-3xl" />
                <div className="absolute right-[-10%] bottom-[-10%] h-64 w-64 rounded-full bg-white/10 blur-3xl" />
              </div>
            )}
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={cn(
              "relative z-10 w-full overflow-hidden flex flex-col",
              authPrimary
                ? "rounded-[30px] border border-white/10 bg-[#1c1d22]/95 text-white shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:max-w-[400px]"
                : "rounded-[26px] sm:rounded-[32px] bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 shadow-2xl sm:max-w-[420px]"
            )}
            style={{
              width: authPrimary
                ? "min(calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 24px), 25rem)"
                : isAuth
                ? "min(calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 24px), 22rem)"
                : "min(calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 24px), 24rem)",
              maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)",
            }}
          >
            {/* Subtle Gradient Accent */}
            <div
              className={cn(
                "absolute top-0 left-0 right-0 pointer-events-none",
                authPrimary
                  ? "h-44 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_70%)] opacity-100"
                  : cn("h-40 bg-linear-to-b opacity-20", currentStyle.accent)
              )}
            />

            {/* Close Button */}
            <button 
              onClick={onClose} 
              className={cn(
                "absolute z-20 rounded-full p-2 transition-all active:scale-90",
                authPrimary
                  ? "top-4 right-4 text-[#c8ceda] hover:bg-white/6 hover:text-white"
                  : "top-3.5 right-3.5 sm:top-5 sm:right-5 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground"
              )}
            >
              <X size={18} strokeWidth={2.5} />
            </button>

            <div
              className={cn(
                "flex flex-col items-center text-center overflow-y-auto min-w-0",
                authPrimary
                  ? "px-8 pt-10 pb-6"
                  : "px-5 sm:px-8 pt-6 sm:pt-10 pb-5 sm:pb-8"
              )}
            >
              {/* Icon Section */}
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 20 }}
                className={cn(
                  "flex items-center justify-center relative group shrink-0",
                  authPrimary
                    ? "mb-8 h-22 w-22 rounded-[26px] border-2 border-white/14 bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_18px_30px_rgba(0,0,0,0.25)]"
                    : cn("w-16 h-16 sm:w-20 sm:h-20 rounded-[22px] sm:rounded-[28px] border-2 mb-4 sm:mb-8", currentStyle.iconBg)
                )}
              >
                <div
                  className={cn(
                    "absolute inset-0 bg-inherit opacity-50 transition-all duration-500",
                    authPrimary ? "rounded-[26px] blur-lg group-hover:blur-xl" : "rounded-[28px] blur-xl group-hover:blur-2xl"
                  )}
                />
                <div className="relative z-10 scale-100 sm:scale-110">
                  {icons[variant as keyof typeof icons] || icons.warning}
                </div>
              </motion.div>

              {/* Text Section */}
              <div className={cn("relative z-10", authPrimary ? "space-y-3" : "space-y-2.5 sm:space-y-3")}>
                <h2 className={cn(
                  "font-black tracking-tight break-words",
                  authPrimary
                    ? "text-[2.1rem] leading-none text-white"
                    : "text-[1.9rem] sm:text-2xl leading-none sm:leading-tight text-foreground"
                )}>
                  {title}
                </h2>
                <div className={cn(
                  "break-words",
                  authPrimary
                    ? "mx-auto max-w-[17rem] px-1 text-base font-medium leading-7 text-[#b6bdc9]"
                    : "max-w-[17.5rem] sm:max-w-none text-[15px] sm:text-[15px] font-medium text-muted-foreground leading-7 sm:leading-relaxed px-1 sm:px-2"
                )}>
                  {message}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div
              className={cn(
                "relative z-10 min-w-0",
                authPrimary
                  ? "grid grid-cols-2 gap-4 px-8 pb-8 pt-0"
                  : "px-5 sm:px-8 pb-5 sm:pb-8 pt-1 sm:pt-0 flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:gap-4"
              )}
            >
              <button
                onClick={onClose}
                className={cn(
                  "min-w-0 px-4 text-[15px] font-bold transition-all active:scale-[0.97]",
                  authPrimary
                    ? "h-14 rounded-3xl border border-white/8 bg-transparent text-[#c5ccd7] hover:border-white/14 hover:bg-white/4 hover:text-white"
                    : "order-1 sm:order-none h-11 sm:h-14 rounded-2xl sm:text-[15px] text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 border border-black/5 dark:border-white/10 sm:border-transparent hover:border-black/5 dark:hover:border-white/5"
                )}
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "min-w-0 px-4 text-[15px] font-black transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 sm:gap-2 text-center leading-tight",
                  authPrimary
                    ? "h-14 rounded-3xl bg-white text-[#17181c] shadow-[0_12px_30px_rgba(255,255,255,0.12)] hover:bg-white/92"
                    : cn("h-13 sm:h-14 rounded-[20px] sm:rounded-2xl sm:text-[15px]", currentStyle.confirm)
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
