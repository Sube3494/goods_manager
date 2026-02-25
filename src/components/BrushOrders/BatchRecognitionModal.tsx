"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wand2, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle, Trash2, Save, Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Product } from "@/lib/types";

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  result?: {
    orderId?: string;
    platform?: string;
    date?: string;
    paymentAmount?: number;
    receivedAmount?: number;
    items?: Array<{ name: string; quantity: number }>;
    note?: string;
    matchedItems?: Array<{ productId: string; product: Product; quantity: number }>;
  };
  error?: string;
}

interface BatchRecognitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onBatchComplete: () => void;
  showToast: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

export const BatchRecognitionModal = ({ isOpen, onClose, products, onBatchComplete, showToast }: BatchRecognitionModalProps) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("美团");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      // 弹窗关闭时：清理所有预览 URL 并清空列表
      items.forEach(item => URL.revokeObjectURL(item.preview));
      setItems([]);
      setIsProcessing(false);
      return;
    }

    const handlePaste = (e: ClipboardEvent) => {
      const clipboardItems = Array.from(e.clipboardData?.items || []);
      const files = clipboardItems
        .filter(item => item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null);
      
      if (files.length > 0) {
        processFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const processFiles = (files: File[]) => {
    const newItems: BatchItem[] = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0
    }));

    setItems(prev => [...prev, ...newItems]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    processFiles(files);
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const removeItem = (id: string) => {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  };

  const processBatch = async () => {
    if (isProcessing || items.length === 0) return;
    setIsProcessing(true);

    // 筛选待处理项
    const pendingItems = items.filter(i => i.status === 'pending' || i.status === 'error');
    
    // 简单的并发控制（一次处理 2 个）
    const concurrency = 2;
    const itemIds = pendingItems.map(i => i.id);
    
    for (let i = 0; i < itemIds.length; i += concurrency) {
      const chunk = itemIds.slice(i, i + concurrency);
      await Promise.all(chunk.map(async (id) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'processing', progress: 30 } : item));
        
        try {
          const item = items.find(it => it.id === id);
          if (!item) return;

          const formData = new FormData();
          formData.append('file', item.file);

          const res = await fetch('/api/brush-orders/recognize', {
            method: 'POST',
            body: formData
          });

          if (!res.ok) throw new Error('API 响应错误');

          const result = await res.json();
          
          if (!result.date) {
            throw new Error("未能识别出订单时间");
          }
          
          // 匹配商品
          const matchedItems: Array<{ productId: string; product: Product; quantity: number }> = [];
          if (result.items && Array.isArray(result.items)) {
            result.items.forEach((ri: { name: string; quantity: number }) => {
              const found = products.find(p => 
                p.name === ri.name || p.sku === ri.name || 
                p.name.includes(ri.name) || ri.name.includes(p.name)
              );
              if (found) {
                matchedItems.push({ productId: found.id, product: found, quantity: ri.quantity || 1 });
              }
            });
          }

          setItems(prev => prev.map(it => it.id === id ? { 
            ...it, 
            status: 'success', 
            progress: 100,
            result: { ...result, matchedItems }
          } : it));

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setItems(prev => prev.map(it => it.id === id ? { ...it, status: 'error', error: errorMessage } : it));
        }
      }));
    }

    setIsProcessing(false);
  };

  const handleSaveAll = async () => {
    const successItems = items.filter(i => i.status === 'success' && i.result);
    if (successItems.length === 0) return;

    setIsProcessing(true);
    let successCount = 0;

    try {
      for (const item of successItems) {
        try {
          const res = await fetch('/api/brush-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: item.result?.date as string,
              type: selectedPlatform,
              items: item.result?.matchedItems?.map(mi => ({
                productId: mi.productId,
                quantity: mi.quantity
              })) || [],
              paymentAmount: item.result?.paymentAmount || 0,
              receivedAmount: item.result?.receivedAmount || 0,
              commission: 0,
              note: "AI识别",
              status: "Completed"
            })
          });

          if (!res.ok) {
            console.error(`Failed to save item ${item.file.name}:`, await res.text());
            continue;
          }
          
          successCount++;
        } catch (err) {
          console.error(`Exception saving item ${item.file.name}:`, err);
        }
      }

      if (successCount === 0) {
        showToast("没有任何订单被成功导入，请刷新重试", "error");
        return;
      }

      showToast(`成功导入 ${successCount}/${successItems.length} 条订单`, "success");
      onBatchComplete();
      onClose();
    } catch (err) {
      console.error("Batch save parent error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
      />
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
            "relative z-10 w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white/90 dark:bg-gray-900/70 backdrop-blur-xl rounded-3xl shadow-2xl border transition-all flex flex-col",
            isDragging ? "border-primary scale-[1.01] ring-4 ring-primary/10" : "border-gray-200 dark:border-white/10"
        )}
      >
        {/* Drag Overlay */}
        <AnimatePresence>
            {isDragging && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none"
                >
                    <div className="p-8 rounded-full bg-primary/20 text-primary animate-bounce">
                        <Upload size={48} />
                    </div>
                    <p className="mt-4 text-xl font-bold text-primary">松开鼠标即可添加截图</p>
                </motion.div>
            )}
        </AnimatePresence>
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50/50 dark:bg-white/5 relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 pr-8 w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-primary/10 text-primary shrink-0">
                <Wand2 size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold">AI 一键识别录单</h2>
                <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">自动解析并创建订单。针对全满屏截图效果更佳。</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:pl-6 sm:border-l border-gray-200 dark:border-white/10 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbars-hide">
              <span className="text-xs font-bold text-gray-400 shrink-0">强制归属:</span>
              <div className="flex bg-gray-100/50 dark:bg-white/5 rounded-lg p-0.5 shrink-0">
                {['美团', '淘宝', '京东'].map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPlatform(p)}
                    className={cn(
                      "px-2.5 sm:px-3 py-1.5 sm:py-1 text-xs font-bold rounded-md transition-all whitespace-nowrap",
                      selectedPlatform === p 
                        ? "bg-white dark:bg-gray-800 text-primary shadow-sm" 
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="absolute right-4 top-4 sm:static sm:p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-gray-200 transition-colors rounded-xl z-10">
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="h-64 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group"
            >
              <div className="p-5 rounded-full bg-gray-50 dark:bg-white/5 group-hover:scale-110 transition-transform">
                <ImageIcon size={40} className="text-gray-400 group-hover:text-primary" />
              </div>
              <div className="text-center">
                <p className="font-bold text-lg">点击、拖拽或粘贴订单截图</p>
                <p className="text-sm text-gray-500">支持多张图片同时处理</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {items.map((item) => (
                <div key={item.id} className="relative group rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 overflow-hidden aspect-square transition-all hover:ring-2 hover:ring-primary/20">
                  <div className="relative w-full h-full bg-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={item.preview} 
                      alt="preview" 
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-300" 
                      onClick={() => setPreviewImage(item.preview)}
                    />
                    
                    {/* Status Badge Overlay */}
                    <div className="absolute top-1 left-1">
                      {item.status === 'pending' && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-md text-white font-bold">等待</span>}
                      {item.status === 'processing' && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/80 backdrop-blur-md text-white font-bold flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 识别中</span>}
                      {item.status === 'success' && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/80 backdrop-blur-md text-white font-bold flex items-center gap-1"><CheckCircle2 size={10} /> 成功</span>}
                      {item.status === 'error' && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-red-500/80 backdrop-blur-md text-white font-bold flex items-center gap-1"><AlertCircle size={10} /> 失败</span>}
                    </div>

                    {!isProcessing && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} 
                        className="absolute top-1 right-1 p-1 bg-black/20 hover:bg-red-500 text-white rounded-md backdrop-blur-md transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    {item.status === 'success' && item.result && (
                      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-black/60 backdrop-blur-md text-[9px] text-white space-y-0.5 leading-tight opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg">
                        <div className="flex justify-between text-gray-300">
                          <span>平台:</span> 
                          <span className={cn(
                            "font-bold",
                            selectedPlatform !== 'auto' && selectedPlatform !== item.result.platform ? "line-through text-gray-500" : "text-white"
                          )}>
                            {item.result.platform || '未知'}
                          </span>
                        </div>
                        {selectedPlatform !== 'auto' && selectedPlatform !== item.result.platform && (
                          <div className="flex justify-end text-emerald-400 font-bold mb-0.5">
                            ➔ {selectedPlatform}
                          </div>
                        )}
                        <div className="flex justify-between"><span>实付:</span> <span>¥{item.result.paymentAmount}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {!isProcessing && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 aspect-square hover:border-primary/50 hover:bg-primary/5 transition-all text-gray-400 hover:text-primary group"
                >
                  <Plus size={24} />
                  <span className="text-[10px] font-bold">添加</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-gray-100 dark:border-white/10 bg-gray-50/50 dark:bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            {items.length > 0 && (
              <span>已添加 {items.length} 张图片</span>
            ) || "等待添加图片"}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-2xl border border-gray-200 dark:border-white/20 font-bold hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-sm text-gray-600 dark:text-gray-200 whitespace-nowrap"
            >
              取消
            </button>
            {items.some(i => i.status === 'pending' || i.status === 'error') ? (
              <button
                disabled={isProcessing || items.length === 0}
                onClick={processBatch}
                className="flex-1 sm:flex-none px-4 sm:px-8 py-2.5 rounded-2xl bg-primary text-black font-black shadow-lg shadow-primary/40 hover:scale-105 transition-all flex items-center justify-center gap-1 sm:gap-2 text-sm disabled:opacity-50 disabled:transform-none whitespace-nowrap"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} className="hidden sm:block" />}
                开始识别
              </button>
            ) : (
              <button
                disabled={isProcessing || items.length === 0}
                onClick={handleSaveAll}
                className="flex-2 sm:flex-none px-4 sm:px-8 py-2.5 rounded-2xl bg-emerald-500 text-white font-black shadow-lg shadow-emerald-500/40 hover:scale-105 transition-all flex items-center justify-center gap-1 sm:gap-2 text-sm disabled:opacity-50 disabled:transform-none whitespace-nowrap"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="hidden sm:block" />}
                保存全部到清单
              </button>
            )}
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*"
          className="hidden"
        />
      </motion.div>

      {/* Preview Overlay */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 p-4 sm:p-8 backdrop-blur-sm cursor-zoom-out"
            onClick={() => setPreviewImage(null)}
          >
            <button
              className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-all z-10"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(null);
              }}
            >
              <X size={24} />
            </button>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-full max-h-full flex items-center justify-center cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage}
                alt="Full Preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl ring-1 ring-white/10"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
};
