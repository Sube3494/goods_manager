"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isOpen: boolean;
  isImporting: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
  footer: ReactNode;
}

export const importCancelClassName = "h-11 px-6 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
export const importConfirmClassName = "flex items-center justify-center gap-2 h-11 px-8 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:grayscale shrink-0 disabled:cursor-not-allowed";

export function ImportModalLayout({ isOpen, isImporting, title, description, onClose, className, children, footer }: Props) {
  const [mounted, setMounted] = useState(false);
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented && !isImporting) onClose();
  });

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => handleEscape(event);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60000 bg-black/60 backdrop-blur-sm"
            onClick={isImporting ? undefined : onClose}
          />
          <motion.div
            role="dialog"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={cn("fixed left-1/2 top-1/2 z-60000 w-[calc(100%-32px)] sm:w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-card/95 backdrop-blur-2xl p-0 shadow-2xl border border-border/70 flex flex-col max-h-safe-modal transition-all duration-300 ease-out", className)}
          >
            <div className="flex shrink-0 flex-col border-b border-border/60 p-6 md:p-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground md:text-2xl">{title}</h2>
                <button type="button" aria-label="关闭" disabled={isImporting} onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <X size={20} className="md:size-6" />
                </button>
              </div>
              {description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">{children}</div>
            <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-border/50 p-6 md:p-8">{footer}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
