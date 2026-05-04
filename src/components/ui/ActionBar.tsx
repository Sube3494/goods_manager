import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Pencil, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";

interface ActionBarProps {
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onClear: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  label?: string;
  extraActions?: Array<{
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    title?: string;
    variant?: "default" | "danger";
  }>;
}

export function ActionBar({ 
  selectedCount, 
  totalCount,
  onToggleSelectAll,
  onClear, 
  onDelete, 
  onEdit,
  label = "项",
  extraActions = [],
}: ActionBarProps) {
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 80, x: "-50%" }}
          animate={{ y: 0, x: "-50%" }}
          exit={{ y: 80, x: "-50%" }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-4 lg:bottom-10 z-50000 pointer-events-none w-[calc(100%-1rem)] sm:w-fit sm:max-w-[calc(100%-2rem)] left-1/2 lg:left-[calc(50%+(var(--sidebar-width,0px)/2))] will-change-transform"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-3 pr-2 py-2 sm:flex-nowrap sm:justify-start sm:gap-6 sm:pl-6 sm:pr-4 sm:h-12 sm:py-0 rounded-[24px] sm:rounded-full glass-panel shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] pointer-events-auto">

            {/* Select All Checkbox - Minimal on mobile */}
            <button 
              onClick={onToggleSelectAll}
              className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isAllSelected 
                ? "bg-foreground border-foreground text-background dark:text-black" 
                : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
              }`}
            >
              {isAllSelected && <Check size={12} strokeWidth={4} />}
            </button>

            {/* Left Info */}
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
              <span className="text-[13px] sm:text-sm font-black text-black dark:text-white whitespace-nowrap truncate">已选 <span className="font-number">{selectedCount}</span> {label}</span>
              <span className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest hidden md:inline">批量管理</span>
            </div>

            {/* Actions */}
            <div className="flex w-auto items-center gap-2 sm:w-auto sm:gap-3">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground hover:bg-foreground/90 text-background dark:text-black shadow-lg shadow-black/10 active:scale-[0.98] transition-all sm:h-8 sm:w-auto sm:px-6"
                  title="批量修改"
                >
                  <Pencil size={16} className="sm:hidden" />
                  <span className="hidden sm:inline text-xs font-black">批量修改</span>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all sm:h-8 sm:w-auto sm:px-6"
                  title="删除"
                >
                  <Trash2 size={16} className="sm:hidden" />
                  <span className="hidden sm:inline text-xs font-black">删除</span>
                </button>
              )}
              {extraActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  title={action.title || action.label}
                  className={
                    action.variant === "danger"
                      ? "flex h-9 w-9 sm:h-8 sm:w-auto items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap hover:bg-red-600 sm:px-6"
                      : "flex h-9 w-9 sm:h-8 sm:w-auto items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition-all whitespace-nowrap hover:bg-primary/90 sm:px-6"
                  }
                >
                  {action.icon ? <span className="sm:hidden">{action.icon}</span> : null}
                  <span className={action.icon ? "hidden sm:inline text-xs font-black" : "text-[11px] sm:text-xs font-black"}>{action.label}</span>
                </button>
              ))}
              <div className="hidden sm:block w-px h-6 sm:h-8 bg-black/5 dark:bg-white/10 mx-1 sm:mx-2" />

              <button 
                onClick={onClear}
                className="h-9 w-9 shrink-0 rounded-full text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all outline-none sm:h-auto sm:w-auto sm:p-2"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
