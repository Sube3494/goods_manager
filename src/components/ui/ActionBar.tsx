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
          className="fixed bottom-10 left-[calc(50%+144px)] z-9999 w-fit"
        >
          <div className="flex items-center gap-6 pl-6 pr-4 h-12 rounded-full bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            {/* Select All Checkbox */}
            <button 
              onClick={onToggleSelectAll}
              className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                isAllSelected 
                ? "bg-foreground border-foreground text-background" 
                : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
              }`}
            >
              {isAllSelected && <Check size={12} strokeWidth={4} />}
            </button>

            {/* Left Info */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-black dark:text-white whitespace-nowrap">已选择 {selectedCount} {label}</span>
              <span className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest hidden sm:inline">批量管理模式</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="h-8 px-6 rounded-full bg-foreground hover:bg-foreground/90 text-background text-xs font-black shadow-lg shadow-black/10 active:scale-[0.98] transition-all"
                >
                  批量修改
                </button>
              )}

              {onDelete && (
                <button
                  onClick={onDelete}
                  className="h-8 px-6 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-black shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
                >
                  删除
                </button>
              )}
              
              <div className="w-px h-8 bg-black/5 dark:bg-white/10 mx-2" />

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
