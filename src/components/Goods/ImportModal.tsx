"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Record<string, unknown>[] | Record<string, unknown[]>) => void;
  title?: string;
  description?: string;
  templateData?: Record<string, unknown>[];
  templateFileName?: string;
  multiSheet?: boolean;
}

export function ImportModal({ 
  isOpen, 
  onClose, 
  onImport,
  title = "导入数据",
  description = "点击上传或拖拽 Excel 文件",
  templateData,
  templateFileName = "导入模版.xlsx",
  multiSheet = false
}: ImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        reader.onload = (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: "binary" });
            
            if (multiSheet) {
                const result: Record<string, unknown[]> = {};
                workbook.SheetNames.forEach(name => {
                    const sheet = workbook.Sheets[name];
                    result[name] = XLSX.utils.sheet_to_json(sheet);
                });
                onImport(result);
            } else {
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
                onImport(json);
            }
            onClose();
        };
        reader.readAsBinaryString(file);
     }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-32px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl p-0 shadow-2xl border border-border/50 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/50 p-6 md:p-8 shrink-0">
              <h2 className="text-xl md:text-2xl font-bold text-foreground">{title}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={20} className="md:size-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 min-h-0">
              {/* Drop Zone */}
              {!previewData.length ? (
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
                  <p className="text-lg font-medium text-foreground">{description}</p>
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
                        onClick={() => { setFile(null); setPreviewData([]); }}
                        className="h-9 px-4 rounded-full text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                        移除文件
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border overflow-hidden bg-white/5">
                    <div className="bg-muted/50 px-5 py-3 text-[10px] font-black text-muted-foreground uppercase tracking-widest border-b border-border">
                        数据预览 (前 5 条)
                    </div>
                    <div className="max-h-64 overflow-y-auto scrollbar-none">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/30 text-muted-foreground sticky top-0 backdrop-blur-md">
                                <tr>
                                    {Object.keys(previewData[0] || {}).map((key) => (
                                        <th key={key} className="px-5 py-3 font-bold whitespace-nowrap">
                                            {key.startsWith("*") ? (
                                                <span className="flex items-center gap-0.5">
                                                    <span className="text-red-500 text-xs">*</span>
                                                    {key.slice(1)}
                                                </span>
                                            ) : (
                                                key
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewData.map((row, i) => (
                                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-5 py-3 text-foreground/70 truncate max-w-[200px]">{String(val || "-")}</td>
                                        ))}
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
                onClick={onClose}
                className="h-11 px-6 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={handleConfirm}
                className="flex items-center gap-2 h-11 px-8 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:grayscale shrink-0"
              >
                <CheckCircle size={18} />
                确认导入
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
