"use client";

import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, X, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface UploadMeituanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (batchId: string) => void;
  platform?: string;
  platformLabel?: string;
}

export function UploadMeituanModal({
  isOpen,
  onClose,
  onSuccess,
  platform = "meituan",
  platformLabel = "美团",
}: UploadMeituanModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (!selected.name.match(/\.(xlsx|xls|csv)$/i)) {
        showToast("请上传 .xlsx / .xls / .csv 格式的文件", "error");
        return;
      }
      setFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (!dropped.name.match(/\.(xlsx|xls|csv)$/i)) {
        showToast("请上传 .xlsx / .xls / .csv 格式的文件", "error");
        return;
      }
      setFile(dropped);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("platform", platform);

      const res = await fetch("/api/meituan-mapping/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "上传失败");
      }

      showToast(data.message || "导入成功", "success");
      onSuccess(data.batchId);
      onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "导入失败，请检查文件", "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/60 dark:bg-[#080c16]/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-[28px] sm:rounded-[32px] border border-border/80 dark:border-white/10 bg-card/98 dark:bg-[#0b111e]/98 p-6 sm:p-7 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-inner">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-foreground">导入{platformLabel}商品表格</h3>
              <p className="text-xs text-muted-foreground mt-0.5">支持油猴脚本导出的 Excel 表格或{platformLabel}商品表</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="h-10 w-10 flex items-center justify-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 拖拽区域 */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl sm:rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
            dragOver
              ? "border-primary bg-primary/5 scale-[0.99]"
              : file
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-border/80 dark:border-white/10 hover:border-primary/40 hover:bg-muted/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <>
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-500 shadow-inner">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-foreground truncate max-w-[300px]">
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {(file.size / 1024).toFixed(1)} KB · 点击可重新选择
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 rounded-2xl bg-muted text-muted-foreground shadow-inner">
                <UploadCloud className="h-8 w-8" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-foreground">
                  点击选择文件 或 将表格拖拽至此处
                </p>
                <p className="text-xs text-muted-foreground">
                  支持格式：.xlsx, .xls, .csv（自动嗅探商品ID、商品名称等列）
                </p>
              </div>
            </>
          )}
        </div>

        {/* 提示信息 */}
        <div className="rounded-2xl bg-muted/40 dark:bg-white/[0.02] p-4 text-xs text-muted-foreground space-y-1.5 border border-border/50 dark:border-white/5">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <AlertCircle className="h-4 w-4 text-primary" />
            <span>智能处理说明：</span>
          </div>
          <p>1. 上传后系统会自动建立待配对池，支持随时断点继续配对。</p>
          <p>2. 系统将自动初筛相同品名或条形码的商品并打上推荐标记。</p>
        </div>

        {/* 按钮 */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="h-10 px-5 text-xs font-black rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted text-foreground active:scale-95 transition-all"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex items-center gap-2 h-10 px-6 text-xs font-black rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-primary/20"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>正在解析中...</span>
              </>
            ) : (
              <span>开始解析与建档</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
