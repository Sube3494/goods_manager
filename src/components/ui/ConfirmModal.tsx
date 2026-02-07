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
  message: string;
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
    danger: <AlertTriangle className="text-destructive" size={24} />,
    warning: <AlertTriangle className="text-yellow-500" size={24} />,
    info: <Info className="text-primary" size={24} />,
    success: <CheckCircle2 className="text-green-500" size={24} />
  };

  const buttonStyles = {
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/20",
    warning: "bg-yellow-500 text-white hover:bg-yellow-600 shadow-yellow-500/20",
    info: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20",
    success: "bg-green-500 text-white hover:bg-green-600 shadow-green-500/20"
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-10000 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
            className="relative z-10 w-full max-w-sm rounded-4xl bg-white dark:bg-gray-900/70 backdrop-blur-2xl border border-border/50 shadow-2xl overflow-hidden p-8 flex flex-col items-center text-center gap-6"
          >
            <div className={cn(
                "w-16 h-16 rounded-3xl flex items-center justify-center mb-2 shadow-inner",
                variant === "danger" ? "bg-destructive/10" : 
                variant === "warning" ? "bg-yellow-500/10" : 
                variant === "info" ? "bg-primary/10" : "bg-green-500/10"
            )}>
              {icons[variant]}
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black tracking-tight text-foreground">{title}</h3>
              <p className="text-muted-foreground font-medium leading-relaxed">{message}</p>
            </div>

            <div className="flex gap-3 w-full mt-2">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-4 rounded-2xl bg-secondary/50 hover:bg-secondary text-foreground font-bold transition-all active:scale-95"
              >
                {cancelLabel}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "flex-1 px-6 py-4 rounded-2xl font-black shadow-lg transition-all active:scale-95",
                  buttonStyles[variant]
                )}
              >
                {confirmLabel}
              </button>
            </div>

            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X size={20} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
