"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, FileSpreadsheet, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface ExportProgressModalProps {
  isOpen: boolean;
  current: number;
  total: number;
  title?: string;
  subtitle?: string;
}

export function ExportProgressModal({
  isOpen,
  current,
  total,
  title = "正在生成 Excel 数据表格",
  subtitle = "正在处理商品数据与图片嵌入，请稍候...",
}: ExportProgressModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const validTotal = total > 0 ? total : 1;
  const percentage = Math.min(100, Math.max(0, Math.round((current / validTotal) * 100)));

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full max-w-md bg-background border border-border/80 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
          >
            {/* 顶栏图标 */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 relative overflow-hidden">
                <FileSpreadsheet size={24} className="relative z-10 animate-pulse" />
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground truncate">{title}</h3>
                  <Sparkles size={14} className="text-amber-500 shrink-0 animate-bounce" />
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
              </div>
            </div>

            {/* 进度显示数字 */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">处理进度</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black tracking-tight text-primary font-mono">{percentage}%</span>
                <span className="text-xs text-muted-foreground font-mono">
                  ({current} / {total} 条)
                </span>
              </div>
            </div>

            {/* 百分比进度条轨道 */}
            <div className="h-3.5 w-full bg-secondary/80 rounded-full p-0.5 border border-border/60 overflow-hidden relative">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-primary relative overflow-hidden shadow-sm"
                initial={{ width: "0%" }}
                animate={{ width: `${percentage}%` }}
                transition={{ ease: "easeOut", duration: 0.15 }}
              />
            </div>

            {/* 状态底部提示 */}
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin text-primary shrink-0" />
                正在并发抓取图片并整合工作表...
              </span>
              <span className="font-mono text-muted-foreground/80">ExcelJS Engine</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
