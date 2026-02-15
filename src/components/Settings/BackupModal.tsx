"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Upload, X, Loader2, CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "export" | "import";
  file?: File;
  onAction: (password: string, onProgress: (p: number) => void) => Promise<void>;
}

type ModalState = "password" | "processing" | "success" | "error";

export function BackupModal({ isOpen, onClose, type, file, onAction }: BackupModalProps) {
  const [state, setState] = useState<ModalState>("password");
  const [password, setPassword] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (password.length < 6) {
      setError("密码至少需要 6 位字符");
      return;
    }
    
    setError("");
    setState("processing");
    
    try {
      await onAction(password, (p) => setProgress(p));
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作执行失败");
      setState("error");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-2xl ring-1",
                  type === "export" ? "bg-primary/10 text-primary ring-primary/20" : "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20"
                )}>
                  {type === "export" ? <Download size={20} /> : <Upload size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{type === "export" ? "数据加密备份" : "系统灾难恢复"}</h3>
                  <p className="text-xs text-muted-foreground">{type === "export" ? "打包并加密所有业务数据" : "解密并全量覆盖现有数据"}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
                disabled={state === "processing"}
              >
                <X size={16} />
              </button>
            </div>

            {/* Content States */}
            <div className="space-y-6">
              {state === "password" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
                      <KeyRound size={16} className="text-primary" />
                      {type === "export" ? "设置备份加密密码" : "输入备份解密密码"}
                    </div>
                    <input
                      type="password"
                      autoFocus
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-12 bg-background border border-border rounded-xl px-4 focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
                      onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                    />
                    {error && (
                      <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} /> {error}
                      </p>
                    )}
                    <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
                      {type === "export" 
                        ? "请务必牢记此密码。如果丢失，该备份文件将永久无法被解密恢复。" 
                        : `正在准备恢复文件: ${file?.name || "未知"}`}
                    </p>
                  </div>
                  
                  <button
                    onClick={handleConfirm}
                    className={cn(
                      "w-full h-12 rounded-2xl font-bold transition-all active:scale-[0.98]",
                      type === "export" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    )}
                  >
                    {type === "export" ? "开始加密导出" : "校验并开始恢复"}
                  </button>
                </motion.div>
              )}

              {state === "processing" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 flex flex-col items-center text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full animate-pulse" />
                    <Loader2 size={48} className="text-primary animate-spin relative" />
                  </div>
                  <h4 className="text-lg font-bold mb-2">正在{type === "export" ? "聚合数据并处理加密" : "解密并同步数据库"}...</h4>
                  <p className="text-sm text-muted-foreground mb-6">请勿关闭窗口或断开网络连接</p>
                  
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs font-mono text-muted-foreground">{progress}%</div>
                </motion.div>
              )}

              {state === "success" && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-8 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6">
                    <CheckCircle2 size={40} />
                  </div>
                  <h4 className="text-xl font-bold mb-2">{type === "export" ? "导出准备就绪" : "系统恢复成功"}</h4>
                  <p className="text-sm text-muted-foreground mb-8">
                    {type === "export" ? "加密包已生成并已触发浏览器下载。" : "所有核心模型已完全同步，系统将自动重新加载。"}
                  </p>
                  <button
                    onClick={onClose}
                    className="h-11 px-8 rounded-xl bg-secondary hover:bg-muted font-bold transition-all"
                  >
                    关闭窗口
                  </button>
                </motion.div>
              )}

              {state === "error" && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="py-8 flex flex-col items-center text-center">
                  <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                    <AlertCircle size={40} />
                  </div>
                  <h4 className="text-lg font-bold mb-2">操作发生错误</h4>
                  <p className="text-sm text-red-400 mb-8">{error}</p>
                  <button
                    onClick={() => setState("password")}
                    className="h-11 px-8 rounded-xl bg-secondary hover:bg-muted font-bold transition-all"
                  >
                    返回重试
                  </button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
