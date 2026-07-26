"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, EyeOff, Ban } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Record<string, unknown>[] | Record<string, unknown[]>) => Promise<void> | void;
  title?: string;
  description?: string;
  dropzoneText?: string;
  templateData?: Record<string, unknown>[];
  templateFileName?: string;
  multiSheet?: boolean;
}

export function ImportModal({ 
  isOpen, 
  onClose, 
  onImport,
  title = "导入数据",
  description,
  dropzoneText = "点击上传或拖拽 Excel 文件",
  templateData,
  templateFileName = "导入模版.xlsx",
  multiSheet = false
}: ImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [ignoredColumns, setIgnoredColumns] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleIgnoreColumn = (colKey: string) => {
    setIgnoredColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) {
        next.delete(colKey);
      } else {
        next.add(colKey);
      }
      return next;
    });
  };

  const handleDownloadTemplate = () => {
    if (!templateData) return;
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, templateFileName);
  };

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    setError(null);
    setIgnoredColumns(new Set());
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      setError("请上传有效的 Excel 或 CSV 文件");
      return;
    }

    setFile(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        setPreviewData(json.slice(0, 5)); // Preview first sheet items
      } catch (err) {
        console.error(err);
        setError("文件解析失败");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleConfirm = () => {
     if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: "binary" });
            
            const filterRow = (row: Record<string, unknown>) => {
              if (ignoredColumns.size === 0) return row;
              const clean: Record<string, unknown> = {};
              Object.keys(row).forEach((key) => {
                if (!ignoredColumns.has(key)) {
                  clean[key] = row[key];
                }
              });
              return clean;
            };

            let importData: any = null;
            if (multiSheet) {
              const result: Record<string, unknown[]> = {};
              workbook.SheetNames.forEach(name => {
                  const sheet = workbook.Sheets[name];
                  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
                  result[name] = rawData.map(filterRow);
              });
              importData = result;
            } else {
              const sheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[sheetName];
              const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
              importData = rawData.map((row) => ({
                ...filterRow(row),
                __sheetName: sheetName,
              }));
            }

            setIsImporting(true);
            setProgress(0);

            // 模拟进度条平滑爬升
            const progressTimer = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 95) {
                  clearInterval(progressTimer);
                  return 95;
                }
                const step = Math.max(1, Math.floor((98 - prev) * 0.15));
                return prev + step;
              });
            }, 100);

            try {
              await onImport(importData);
              clearInterval(progressTimer);
              setProgress(100);
              setTimeout(() => {
                setIsImporting(false);
                setPreviewData([]);
                setFile(null);
                onClose();
              }, 300);
            } catch (err) {
              clearInterval(progressTimer);
              setIsImporting(false);
              setError(err instanceof Error ? err.message : "导入失败");
            }
        };
        reader.readAsBinaryString(file);
     }
  };

  useEffect(() => {
    if (isOpen) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalStyle; };
    }
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
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-60000 w-[calc(100%-32px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl p-0 shadow-2xl border border-border/50 flex flex-col max-h-safe-modal"
          >
            {/* Header */}
            <div className="flex flex-col border-b border-border/50 p-6 md:p-8 shrink-0">
              <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
                <button 
                  disabled={isImporting}
                  onClick={onClose} 
                  className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X size={20} className="md:size-6" />
                </button>
              </div>
              {description && (
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 min-h-0">
              {/* Drop Zone / Progress / Preview */}
              {isImporting ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 space-y-6 animate-in fade-in-50 duration-300">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
                    
                    <div className="relative w-28 h-28 flex items-center justify-center bg-white dark:bg-white/5 rounded-full shadow-lg border border-border/50">
                      <svg className="w-24 h-24 transform -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="transparent"
                          className="text-muted/20"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="40"
                          stroke="currentColor"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={251.2}
                          strokeDashoffset={251.2 - (251.2 * progress) / 100}
                          className="text-primary transition-all duration-300 ease-out"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-2xl font-bold text-foreground font-number">{progress}%</span>
                    </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                    <p className="text-lg font-bold text-foreground">正在安全导入商品数据...</p>
                    <p className="text-sm text-muted-foreground">正在写入库并生成关联关系，请勿关闭窗口</p>
                  </div>
                  
                  <div className="w-full max-w-md h-2 bg-muted dark:bg-white/5 rounded-full overflow-hidden border border-border/30">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : !previewData.length ? (
                <div
                  className={`group relative flex h-72 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all duration-500 ${
                    dragActive
                      ? "border-primary bg-primary/5 scale-[0.98]"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                  />
                  <div className="mb-6 relative">
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150 group-hover:bg-primary/30 transition-colors" />
                    <div className="relative rounded-2xl bg-white dark:bg-white/10 p-5 text-primary shadow-xl shadow-primary/10 transition-transform group-hover:-translate-y-2 duration-500">
                        <Upload size={32} />
                    </div>
                  </div>
                  <p className="text-lg font-medium text-foreground">{dropzoneText}</p>
                  <p className="mt-2 text-sm text-muted-foreground">支持 .xlsx, .xls, .csv 格式</p>
                  
                  {templateData && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadTemplate();
                      }}
                      className="mt-8 flex items-center gap-2 px-6 h-10 rounded-full bg-white dark:bg-white/5 border border-border hover:bg-muted font-medium text-sm transition-all hover:-translate-y-0.5"
                    >
                      <FileSpreadsheet size={16} className="text-green-500" />
                      下载模板文件
                    </button>
                  )}
                  {error && (
                    <div className="mt-6 flex items-center px-4 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
                      <AlertCircle size={16} className="mr-2" />
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-5 animate-in slide-in-from-top-2">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-500 shadow-sm">
                      <FileSpreadsheet size={24} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{file?.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">文件解析完成，准备导入系统</p>
                    </div>
                    <button 
                        onClick={() => { setFile(null); setPreviewData([]); setIgnoredColumns(new Set()); }}
                        className="h-9 px-4 rounded-full text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                        移除文件
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border overflow-hidden bg-white/5">
                    <div className="bg-muted/50 px-5 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          数据预览 (前 5 条)
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>点击表头图标可 <strong className="text-amber-500 font-semibold">忽略/恢复</strong> 对应的列</span>
                          {ignoredColumns.size > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px]">
                              已忽略 {ignoredColumns.size} 列
                            </span>
                          )}
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto scrollbar-none">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-muted/30 text-muted-foreground sticky top-0 backdrop-blur-md z-10">
                                <tr>
                                    {Object.keys(previewData[0] || {}).map((key) => {
                                        const isIgnored = ignoredColumns.has(key);
                                        return (
                                            <th 
                                              key={key} 
                                              onClick={() => toggleIgnoreColumn(key)}
                                              className={cn(
                                                "px-4 py-3 font-bold whitespace-nowrap cursor-pointer select-none transition-colors group border-b border-border",
                                                isIgnored ? "bg-amber-500/10 text-amber-600/70 dark:text-amber-400/70" : "hover:bg-muted/60"
                                              )}
                                              title={isIgnored ? "点击取消忽略，恢复导入此列" : "点击忽略此列，不导入系统"}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <span className={cn(isIgnored && "line-through opacity-60")}>
                                                      {key.startsWith("*") ? (
                                                          <span className="inline-flex items-center gap-0.5">
                                                              <span className="text-red-500 text-xs">*</span>
                                                              {key.slice(1)}
                                                          </span>
                                                      ) : (
                                                          key
                                                      )}
                                                    </span>
                                                    {isIgnored ? (
                                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                                                        <Ban size={11} />
                                                        已忽略
                                                      </span>
                                                    ) : (
                                                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-amber-500 text-xs">
                                                        <EyeOff size={13} />
                                                      </span>
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewData.map((row, i) => (
                                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                                        {Object.entries(row).map(([colKey, val], j) => {
                                            const isIgnored = ignoredColumns.has(colKey);
                                            return (
                                              <td 
                                                key={j} 
                                                className={cn(
                                                  "px-4 py-3 text-foreground/70 truncate max-w-[200px] transition-opacity",
                                                  isIgnored && "opacity-30 line-through bg-amber-500/5 text-muted-foreground"
                                                )}
                                              >
                                                {String(val ?? "-")}
                                              </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t border-border/50 p-6 md:p-8 shrink-0">
              <button
                type="button"
                disabled={isImporting}
                onClick={onClose}
                className="h-11 px-6 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!file || isImporting}
                onClick={handleConfirm}
                className="flex items-center gap-2 h-11 px-8 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:grayscale shrink-0 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    正在导入...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    确认导入
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
