import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface ActionBarProps {
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onClear: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  label?: string;
}

export function ActionBar({ 
  selectedCount, 
  totalCount,
  onToggleSelectAll,
  onClear, 
  onDelete, 
  onEdit,
  label = "项" 
}: ActionBarProps) {
  const [mounted, setMounted] = useState(false);
  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  useEffect(() => {
    requestAnimationFrame(() => {
      setMounted(true);
    });
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0, x: "-50%" }}
          animate={{ y: 0, opacity: 1, x: "-50%" }}
          exit={{ y: 100, opacity: 0, x: "-50%" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          style={{ 
            left: "calc(50% + (var(--sidebar-width, 0px) / 2))"
          } as React.CSSProperties}
          className="fixed bottom-6 lg:bottom-10 z-9999 pointer-events-none w-fit max-w-[calc(100%-2rem)]"
        >
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-6 pl-3 sm:pl-6 pr-2 sm:pr-4 h-14 sm:h-12 rounded-[24px] sm:rounded-full bg-white/90 dark:bg-zinc-900/90 border border-black/5 dark:border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] backdrop-blur-xl pointer-events-auto">
            {/* Select All Checkbox - Minimal on mobile */}
            <button 
              onClick={onToggleSelectAll}
              className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isAllSelected 
                ? "bg-foreground border-foreground text-background" 
                : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
              }`}
            >
              {isAllSelected && <Check size={12} strokeWidth={4} />}
            </button>

            {/* Left Info */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-[13px] sm:text-sm font-black text-black dark:text-white whitespace-nowrap truncate">已选 {selectedCount} {label}</span>
              <span className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest hidden md:inline">批量管理</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="h-9 sm:h-8 px-4 sm:px-6 rounded-full bg-foreground hover:bg-foreground/90 text-background text-[11px] sm:text-xs font-black shadow-lg shadow-black/10 active:scale-[0.98] transition-all whitespace-nowrap"
                >
                  批量修改
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="h-9 sm:h-8 px-4 sm:px-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-[11px] sm:text-xs font-black shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all whitespace-nowrap"
                >
                  删除
                </button>
              )}
              <div className="w-px h-6 sm:h-8 bg-black/5 dark:bg-white/10 mx-1 sm:mx-2" />

              <button 
                onClick={onClear}
                className="p-2 rounded-full text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all outline-none"
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
