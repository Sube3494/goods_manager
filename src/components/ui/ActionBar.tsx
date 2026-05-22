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
          className="fixed bottom-4 lg:bottom-10 z-50000 pointer-events-none w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] left-1/2 lg:left-[calc(50%+(var(--sidebar-width,0px)/2))] will-change-transform"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-3 pr-2 py-2 md:flex-nowrap md:justify-start md:gap-6 md:pl-6 md:pr-4 md:h-12 md:py-0 rounded-[24px] md:rounded-full glass-panel shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] pointer-events-auto">

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
            <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none md:gap-3">
              <span className="text-[13px] md:text-sm font-black text-black dark:text-white whitespace-nowrap truncate">已选 <span className="font-number">{selectedCount}</span> {label}</span>
              <span className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest hidden lg:inline">批量管理</span>
            </div>

            {/* Actions */}
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 md:w-auto md:flex-none md:flex-nowrap md:gap-3">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground hover:bg-foreground/90 text-background dark:text-black shadow-lg shadow-black/10 active:scale-[0.98] transition-all whitespace-nowrap md:h-8 md:w-auto md:px-6"
                  title="批量修改"
                >
                  <Pencil size={16} className="md:hidden" />
                  <span className="hidden whitespace-nowrap md:inline text-xs font-black">批量修改</span>
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap md:h-8 md:w-auto md:px-6"
                  title="删除"
                >
                  <Trash2 size={16} className="md:hidden" />
                  <span className="hidden whitespace-nowrap md:inline text-xs font-black">删除</span>
                </button>
              )}
              {extraActions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  title={action.title || action.label}
                  className={
                    action.variant === "danger"
                      ? "flex h-9 w-9 shrink-0 md:h-8 md:w-auto items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap hover:bg-red-600 md:px-6"
                      : "flex h-9 w-9 shrink-0 md:h-8 md:w-auto items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-[0.98] transition-all whitespace-nowrap hover:bg-primary/90 md:px-6"
                  }
                >
                  {action.icon ? <span className="md:hidden">{action.icon}</span> : null}
                  <span className={action.icon ? "hidden md:inline text-xs font-black" : "text-[11px] md:text-xs font-black"}>{action.label}</span>
                </button>
              ))}
              <div className="hidden md:block w-px h-6 md:h-8 bg-black/5 dark:bg-white/10 mx-1 md:mx-2" />

              <button 
                onClick={onClear}
                className="h-9 w-9 shrink-0 rounded-full text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all outline-none md:h-auto md:w-auto md:p-2"
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
