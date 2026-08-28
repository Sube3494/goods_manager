"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, EyeOff, Ban, Trash2 } from "lucide-react";
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

  const isRequiredColumn = (key: string) => {
    const norm = key.trim().toLowerCase();
    return norm.startsWith("*") || norm === "商品名称" || norm === "name" || norm === "名称";
  };

  const toggleIgnoreColumn = (colKey: string) => {
    if (isRequiredColumn(colKey)) return;
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
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
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
                  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
                  result[name] = rawData.map(filterRow);
              });
              importData = result;
            } else {
              const sheetName = workbook.SheetNames[0];
              const sheet = workbook.Sheets[sheetName];
              const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });
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

  const colCount = previewData.length > 0 ? Object.keys(previewData[0] || {}).length : 0;
  const dynamicMaxWidth = colCount >= 7 
    ? "max-w-5xl md:max-w-5xl lg:max-w-6xl" 
    : colCount >= 4 
    ? "max-w-3xl md:max-w-4xl" 
    : "max-w-2xl";

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
            className={cn(
              "fixed left-1/2 top-1/2 z-60000 w-[calc(100%-32px)] sm:w-full -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl p-0 shadow-2xl border border-border/50 flex flex-col max-h-safe-modal transition-all duration-300 ease-out",
              dynamicMaxWidth
            )}
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
                        className="h-8 px-3 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 dark:border-rose-500/30 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-600 dark:hover:text-white hover:border-transparent transition-all duration-200 shrink-0 inline-flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                        title="移除已上传文件并重新选择"
                    >
                        <Trash2 size={13} />
                        <span>移除文件</span>
                    </button>
                  </div>

                  <div className="relative rounded-2xl border border-border overflow-hidden bg-white/5 shadow-sm">
                    <div className="bg-muted/50 px-5 py-3 flex items-center justify-between border-b border-border flex-wrap gap-2">
                        <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          数据预览 (前 5 条)
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="hidden sm:inline text-[11px] text-muted-foreground/80 mr-1">拖动底部滚动条可查看更多列</span>
                          <span>点击表头可 <strong className="text-amber-500 font-medium">忽略/恢复</strong> 列</span>
                          {ignoredColumns.size > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-[10px]">
                              已忽略 {ignoredColumns.size} 列
                            </span>
                          )}
                        </div>
                    </div>

                    <div className="relative">
                      <div 
                        onWheel={(e) => {
                          if (e.deltaY !== 0) {
                            e.currentTarget.scrollLeft += e.deltaY;
                          }
                        }}
                        onMouseDown={(e) => {
                          const ele = e.currentTarget;
                          const startX = e.pageX - ele.offsetLeft;
                          const scrollLeft = ele.scrollLeft;
                          const onMouseMove = (me: MouseEvent) => {
                            const x = me.pageX - ele.offsetLeft;
                            const walk = (x - startX) * 1.5;
                            ele.scrollLeft = scrollLeft - walk;
                          };
                          const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                          };
                          window.addEventListener('mousemove', onMouseMove);
                          window.addEventListener('mouseup', onMouseUp);
                        }}
                        className="max-h-72 overflow-x-auto overflow-y-auto pb-4 touch-pan-x touch-pan-y cursor-grab active:cursor-grabbing [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-black/10 dark:[&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb]:bg-slate-500 hover:[&::-webkit-scrollbar-thumb]:bg-primary [&::-webkit-scrollbar-thumb]:rounded-full"
                      >
                          {(() => {
                            const colKeys = Object.keys(previewData[0] || {});
                            const minWidthPx = Math.max(900, colKeys.length * 190);
                            return (
                              <table 
                                className="text-sm text-left border-collapse"
                                style={{ minWidth: `${minWidthPx}px`, width: "100%" }}
                              >
                                  <thead className="bg-slate-100 dark:bg-gray-800/90 text-muted-foreground sticky top-0 backdrop-blur-md z-10 border-b border-border">
                                      <tr>
                                          {colKeys.map((key) => {
                                              const isIgnored = ignoredColumns.has(key);
                                              const isReq = isRequiredColumn(key);
                                              return (
                                                  <th 
                                                    key={key} 
                                                    onClick={() => !isReq && toggleIgnoreColumn(key)}
                                                    className={cn(
                                                      "px-4 py-3 font-medium whitespace-nowrap select-none transition-all duration-200 group border-b border-border min-w-[150px]",
                                                      isReq ? "cursor-default" : "cursor-pointer",
                                                      !isReq && (isIgnored 
                                                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" 
                                                        : "hover:bg-primary/10 hover:text-primary")
                                                    )}
                                                    title={isReq ? "核心必填项目，不可忽略" : (isIgnored ? "点击取消忽略，恢复导入此列" : "点击忽略此列，不导入系统")}
                                                  >
                                                      <div className="flex items-center justify-between gap-2">
                                                          <span className={cn("font-medium", isIgnored && "line-through opacity-60 text-amber-600 dark:text-amber-400")}>
                                                            {key.startsWith("*") ? (
                                                                <span className="inline-flex items-center gap-0.5">
                                                                    <span className="text-red-500 text-xs">*</span>
                                                                    {key.slice(1)}
                                                                </span>
                                                            ) : (
                                                                key
                                                            )}
                                                          </span>
                                                          {isReq ? (
                                                            <span className="text-[10px] text-muted-foreground/60 font-normal shrink-0">
                                                              必填
                                                            </span>
                                                          ) : isIgnored ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium shrink-0 shadow-sm">
                                                              <Ban size={11} />
                                                              已忽略
                                                            </span>
                                                          ) : (
                                                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-amber-500 text-xs shrink-0">
                                                              <EyeOff size={13} />
                                                            </span>
                                                          )}
                                                      </div>
                                                  </th>
                                              );
                                          })}
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/60">
                                      {previewData.map((row, i) => (
                                          <tr key={i} className="hover:bg-muted/30 transition-colors">
                                              {Object.entries(row).map(([colKey, val], j) => {
                                                  const isIgnored = ignoredColumns.has(colKey);
                                                  return (
                                                    <td 
                                                      key={j} 
                                                      className={cn(
                                                        "px-4 py-3 text-foreground/80 truncate max-w-[240px] transition-all duration-200 font-normal",
                                                        isIgnored && "opacity-35 line-through bg-amber-500/5 text-amber-700/60 dark:text-amber-300/60"
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
                            );
                          })()}
                      </div>
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
