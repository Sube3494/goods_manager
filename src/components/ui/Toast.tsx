"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Info, AlertCircle } from "lucide-react";
import { useState, createContext, useContext, useEffect, ReactNode, useCallback } from "react";

export type ToastType = "success" | "info" | "error" | "warning";

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onClose: (id: string) => void;
}

const ToastContext = createContext<{
  showToast: (message: string, type?: ToastType, duration?: number) => string;
  updateToast: (id: string, message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
} | null>(null);

function Toast({ id, message, type, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [id, onClose, duration]);

  const icons = {
    success: <CheckCircle className="text-green-500" size={18} />,
    info: <Info className="text-blue-500" size={18} />,
    error: <AlertCircle className="text-red-500" size={18} />,
    warning: <AlertCircle className="text-orange-500" size={18} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      layout
      className="flex w-full min-w-[260px] max-w-[calc(100vw-32px)] items-center gap-3 rounded-xl glass p-3.5 shadow-lg sm:min-w-[300px] sm:max-w-md sm:p-4"
    >
      <div className="shrink-0">{icons[type]}</div>
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground break-words">{message}</p>
      <button onClick={() => onClose(id)} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType; duration?: number }[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 3000) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, message: string, type?: ToastType) => {
    setToasts((prev) => prev.map((t) => 
      t.id === id ? { ...t, message, type: type || t.type } : t
    ));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, updateToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 left-1/2 z-[1000000] flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-none w-full max-w-[calc(100vw-32px)] sm:left-auto sm:right-6 sm:translate-x-0 sm:items-end sm:w-auto">
        <AnimatePresence>
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto w-full sm:w-auto">
               <Toast {...toast} onClose={removeToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
