"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: Record<string, unknown>[]) => void;
  title?: string;
  description?: string;
  templateData?: Record<string, unknown>[];
  templateFileName?: string;
}

export function ImportModal({ 
  isOpen, 
  onClose, 
  onImport,
  title = "导入数据",
  description = "点击上传或拖拽 Excel 文件",
  templateData,
  templateFileName = "导入模版.xlsx"
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
        setPreviewData(json.slice(0, 5)); // Preview first 5 rows
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
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
            onImport(json);
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
            className="fixed left-1/2 top-1/2 z-9999 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl p-0 shadow-2xl border border-border/50 flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">{title}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 min-h-0">
              {/* Drop Zone */}
              {!previewData.length ? (
                <div
                  className={`relative flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300 ${
                    dragActive
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
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
                  <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
                    <Upload size={32} />
                  </div>
                  <p className="text-lg font-medium">{description}</p>
                  <p className="mt-2 text-sm text-muted-foreground">支持 .xlsx, .xls, .csv 格式</p>
                  {templateData && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadTemplate();
                      }}
                      className="mt-6 text-sm text-primary font-bold hover:underline flex items-center gap-1.5"
                    >
                      <FileSpreadsheet size={16} />
                      下载模版文件
                    </button>
                  )}
                  {error && (
                    <div className="mt-4 flex items-center text-destructive">
                      <AlertCircle size={16} className="mr-2" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                      <FileSpreadsheet size={24} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{file?.name}</p>
                      <p className="text-xs text-muted-foreground">解析完成，准备导入</p>
                    </div>
                    <button 
                        onClick={() => { setFile(null); setPreviewData([]); }}
                        className="ml-auto text-sm text-destructive hover:underline"
                    >
                        移除
                    </button>
                  </div>

                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        数据预览 (前5条)
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                                <tr>
                                    {Object.keys(previewData[0] || {}).map((key) => (
                                        <th key={key} className="px-4 py-2 font-medium">
                                            {key.startsWith("*") ? (
                                                <>
                                                    <span className="text-red-500">*</span>
                                                    {key.slice(1)}
                                                </>
                                            ) : (
                                                key
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {previewData.map((row, i) => (
                                    <tr key={i} className="hover:bg-muted/20">
                                        {Object.values(row).map((val, j) => (
                                            <td key={j} className="px-4 py-2 text-foreground/80 truncate max-w-[150px]">{String(val)}</td>
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
            <div className="flex justify-end gap-3 border-t border-white/10 p-8 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={handleConfirm}
                className="flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none pointer-events-auto"
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
