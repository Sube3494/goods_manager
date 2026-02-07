"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Info, AlertCircle } from "lucide-react";
import { useState, createContext, useContext, useEffect, ReactNode } from "react";

export type ToastType = "success" | "info" | "error";

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: (id: string) => void;
}

const ToastContext = createContext<{
  showToast: (message: string, type?: ToastType) => void;
} | null>(null);

function Toast({ id, message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const icons = {
    success: <CheckCircle className="text-green-500" size={18} />,
    info: <Info className="text-blue-500" size={18} />,
    error: <AlertCircle className="text-red-500" size={18} />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      layout
      className="flex items-center gap-3 rounded-xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur-md min-w-[300px]"
    >
      <div className="shrink-0">{icons[type]}</div>
      <p className="flex-1 text-sm font-medium text-foreground">{message}</p>
      <button onClick={() => onClose(id)} className="text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([]);

  const showToast = (message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-100 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
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
