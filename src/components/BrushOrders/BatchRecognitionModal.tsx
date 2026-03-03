"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { X, Wand2, Loader2, Image as ImageIcon, CheckCircle2, AlertCircle, Trash2, Save, Plus, Upload, Calendar, Search, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Product } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { GestureImage } from "@/components/ui/GestureImage";

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  progress: number;
  result?: {
    platformOrderId?: string;
    platform?: string;
    date?: string;
    paymentAmount?: number;
    receivedAmount?: number;
    items?: Array<{ name: string; quantity: number }>;
    note?: string;
    matchedItems?: Array<{ productId: string; product: Product; quantity: number }>;
    timeMissing?: boolean;
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
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editingItem = items.find(i => i.id === editingItemId);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // 弹窗关闭时：清理所有预览 URL 并清空列表
      items.forEach(item => URL.revokeObjectURL(item.preview));
      setItems([]);
      setIsProcessing(false);
      setEditingItemId(null);
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
    
    // 锁定背景滚动
    const originalStyle = window.getComputedStyle(document.body).overflow;
    const originalOverscroll = window.getComputedStyle(document.body).overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      window.removeEventListener('paste', handlePaste);
      document.body.style.overflow = originalStyle;
      document.body.style.overscrollBehavior = originalOverscroll;
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

  /**
   * 针对 AI 识别结果进行模糊匹配商品
   * 策略：
   * 1. 归一化：移除标点符号、空格及常见平台包裹符（如【美团】）
   * 2. 多级匹配：完全匹配 -> 双向包含匹配 -> 基于字符重合度的模糊匹配
   */
  const findBestMatch = (recognizedName: string, products: Product[]) => {
    if (!recognizedName || !products.length) return null;

    // 归一化：只移除标点和空格，不过滤关键词（过滤太激进反而有副作用）
    const normalize = (str: string) => {
      if (!str) return "";
      return str.toLowerCase()
        .replace(/[\[\]【】\(\)（）\s!@#\$%\^&\*\-_=\+\\\|;:'",<\.>\/\?？。，]/g, "")
        .replace(/美团|淘宝|京东|拼多多|点我达/g, ""); // 仅移除平台词
    };

    const normRecognized = normalize(recognizedName);
    if (!normRecognized) return null;


    // 第一阶段：SKU 精确匹配
    const skuMatch = products.find(p => p.sku && normalize(p.sku) === normRecognized);
    if (skuMatch) {
      return skuMatch;
    }

    // 第二阶段：名称精确或包含匹配（双向）
    // 详细打印每个商品名的归一化结果及包含关系，诊断问题
    let nameMatch: Product | undefined;
    for (const p of products) {
      const normName = normalize(p.name);
      const isExact = normName === normRecognized;
      const recognizedInProduct = normName.includes(normRecognized);
      const productInRecognized = normRecognized.includes(normName);
      if (isExact || recognizedInProduct || productInRecognized) {
        nameMatch = p;
        break;
      }
    }
    if (nameMatch) {
      return nameMatch;
    }

    // 第三阶段：基于关键词的模糊匹配
    // 提取有意义的词组（连续的中文词、英文词、数字）
    const extractKeywords = (str: string): string[] => {
      const segments: string[] = [];
      // 提取连续中文（长度 >= 2）
      const chineseMatches = str.match(/[\u4e00-\u9fa5]{2,}/g) || [];
      // 提取连续英文+数字（长度 >= 2）
      const alphaMatches = str.match(/[a-zA-Z0-9]{2,}/g) || [];
      segments.push(...chineseMatches, ...alphaMatches);
      return segments;
    };

    extractKeywords(normRecognized);

    let bestScore = 0;
    let bestProduct: Product | null = null;

    products.forEach(p => {
      const normName = normalize(p.name);
      if (!normName) return;

      const productKeywords = extractKeywords(normName);
      if (!productKeywords.length) return;

      // 计算关键词命中率：有多少个商品关键词在识别结果里能找到
      let hitCount = 0;
      productKeywords.forEach(kw => {
        if (normRecognized.includes(kw)) {
          hitCount++;
        }
      });

      const score = hitCount / productKeywords.length;

      if (score > bestScore) {
        bestScore = score;
        bestProduct = p;
      }

    });


    if (bestScore >= 0.6) {
      return bestProduct;
    }

    return null;
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
              const found = findBestMatch(ri.name, products);
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

    // 检查是否有缺失精确时间的项
    const hasMissingTime = successItems.some(i => i.result?.timeMissing);
    if (hasMissingTime) {
      const confirmSave = confirm("部分订单未能识别出精确时间（已标记为 00:00），是否确定直接保存？\n\n建议点击对应的预览图查看详情并手动修正。");
      if (!confirmSave) return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    try {
      for (const item of successItems) {
        try {
          const res = await fetch('/api/brush-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: item.result?.date as string,
              type: item.result?.platform || selectedPlatform,
              items: item.result?.matchedItems?.map(mi => ({
                productId: mi.productId,
                quantity: mi.quantity
              })) || [],
              paymentAmount: item.result?.paymentAmount || 0,
              receivedAmount: item.result?.receivedAmount || 0,
              commission: 0,
              note: item.result?.note || "AI识别",
              status: "Completed",
              platformOrderId: item.result?.platformOrderId
            })
          });

          if (res.status === 409) {
            duplicateCount++;
            continue;
          }

          if (!res.ok) {
            console.error(`Failed to save item ${item.file.name}:`, await res.text());
            errorCount++;
            continue;
          }
          
          successCount++;
        } catch (err) {
          console.error(`Exception saving item ${item.file.name}:`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        const msg = duplicateCount > 0 
          ? `成功导入 ${successCount} 条，跳过 ${duplicateCount} 条重复订单`
          : `成功导入 ${successCount} 条订单`;
        showToast(msg, "success");
        onBatchComplete();
        onClose();
      } else if (duplicateCount > 0 && errorCount === 0) {
        showToast(`订单已存在 (${duplicateCount} 条)，无需重复导入`, "info");
        onClose();
      } else {
        showToast("导入失败，订单可能已存在或发生系统错误", "error");
      }
    } catch (err) {
      console.error("Batch save parent error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!mounted || !isOpen) return null;

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
            "relative z-10 w-full max-w-6xl max-h-[90vh] overflow-hidden bg-white dark:bg-gray-900/80 backdrop-blur-2xl rounded-3xl shadow-2xl border transition-all flex flex-col",
            isDragging ? "border-primary scale-[1.01] ring-4 ring-primary/10" : "border-zinc-200 dark:border-white/10"
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
        <div className={cn(
          "p-4 sm:p-6 border-b border-zinc-100 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-white dark:bg-white/5 relative",
          editingItemId && "hidden sm:flex" // 在移动端编辑时隐藏主页眉，或者保持精简
        )}>
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
              <span className="text-xs font-bold text-zinc-400 shrink-0">平台:</span>
              <div className="flex bg-zinc-100/50 dark:bg-black/40 backdrop-blur-md rounded-xl p-1 shrink-0 border border-zinc-200/50 dark:border-transparent">
                {['美团', '淘宝', '京东'].map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPlatform(p)}
                    className={cn(
                      "px-3 sm:px-4 py-1.5 sm:py-1 text-xs font-black rounded-lg transition-all duration-200 whitespace-nowrap",
                      selectedPlatform === p 
                        ? "bg-zinc-900 dark:bg-foreground text-zinc-50 dark:text-black shadow-md scale-105" 
                        : "text-zinc-500/70 hover:text-foreground hover:bg-white/50 dark:hover:bg-white/5"
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
        <div className={cn(
          "flex-1 overflow-hidden flex flex-col",
          editingItemId && "md:flex-row"
        )}>
          {/* Left: List/Grid */}
          <div className={cn(
            "overflow-y-auto p-4 sm:p-6 transition-all duration-300",
            editingItemId ? "hidden md:block w-full md:w-80 lg:w-96 border-r border-gray-100 dark:border-white/10" : "flex flex-col flex-1 w-full"
          )}>
            {items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center min-h-[400px]">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-lg h-64 border-2 border-dashed border-zinc-100 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-primary/30 hover:bg-primary/2 transition-all group"
                >
                  <div className="p-5 rounded-full bg-zinc-50 dark:bg-white/5 group-hover:scale-110 transition-transform">
                    <ImageIcon size={40} className="text-zinc-300 group-hover:text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg">点击、拖拽或粘贴订单截图</p>
                    <p className="text-sm text-muted-foreground">支持多张图片同时处理</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className={cn(
                "grid gap-3",
                editingItemId ? "grid-cols-2 sm:grid-cols-2 md:grid-cols-2" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
              )}>
                {items.map((item, index) => (
                  <div 
                    key={item.id} 
                    onClick={() => {
                      if (item.status === 'success') {
                        setEditingItemId(item.id);
                      } else {
                        setPreviewImage(item.preview);
                      }
                    }}
                    className={cn(
                      "relative group rounded-2xl border overflow-hidden aspect-square transition-all cursor-pointer shadow-sm bg-white dark:bg-gray-800",
                      editingItemId === item.id ? "ring-2 ring-primary border-transparent" : "border-gray-100 dark:border-white/10 hover:ring-2 hover:ring-primary/20"
                    )}
                  >
                    <div className="relative w-full h-full">
                      <Image 
                        src={item.preview} 
                        alt="preview" 
                        fill
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                        unoptimized
                      />
                      
                      {/* Top-Left: Index Badge (Glassmorphism) */}
                      <div className="absolute top-2 left-2 z-10">
                        <div className="h-6 min-w-[24px] px-1.5 flex items-center justify-center rounded-lg bg-black/40 dark:bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-black text-white shadow-xl">
                          {(index + 1).toString().padStart(2, '0')}
                        </div>
                      </div>

                      {/* Top-Right: Action Button (Hover Only) */}
                      {!isProcessing && (
                        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100">
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeItem(item.id); if (editingItemId === item.id) setEditingItemId(null); }} 
                            className="p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg backdrop-blur-md transition-all shadow-lg shadow-red-500/20"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}

                      {/* Bottom-Right: Status Badge */}
                      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
                        {item.status === 'pending' && (
                          <div className="h-6 px-2 flex items-center gap-1.5 rounded-lg bg-white/90 dark:bg-black/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-[9px] font-bold text-muted-foreground shadow-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />
                            等待
                          </div>
                        )}
                        {item.status === 'processing' && (
                          <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl">
                            <Loader2 size={14} className="animate-spin" />
                          </div>
                        )}
                        {item.status === 'success' && (
                          <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-emerald-500 backdrop-blur-md border border-emerald-400/50 text-white shadow-lg shadow-emerald-500/20">
                            <CheckCircle2 size={14} />
                          </div>
                        )}
                        {item.status === 'error' && (
                          <div className="h-6 w-6 flex items-center justify-center rounded-lg bg-red-500 backdrop-blur-md border border-red-400/50 text-white shadow-lg shadow-red-500/20">
                            <AlertCircle size={13} />
                          </div>
                        )}
                      </div>

                      {/* Bottom-Left: Warning Indicators */}
                      {item.status === 'success' && (
                        <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1">
                          {item.result?.timeMissing && (
                            <motion.div 
                              initial={{ scale: 0 }} 
                              animate={{ scale: 1 }}
                              className="h-6 w-6 flex items-center justify-center rounded-lg bg-orange-500 backdrop-blur-md border border-orange-400/50 text-white shadow-lg shadow-orange-500/20" 
                              title="时间未能识别，请核对"
                            >
                              <Calendar size={12} />
                            </motion.div>
                          )}
                          {(!item.result?.matchedItems || item.result.matchedItems.length === 0) && (
                            <motion.div 
                              initial={{ scale: 0 }} 
                              animate={{ scale: 1 }}
                              className="h-6 w-6 flex items-center justify-center rounded-lg bg-red-500 backdrop-blur-md border border-red-400/50 text-white shadow-lg shadow-red-500/20" 
                              title="未识别到匹配商品，请手动添加"
                            >
                              <ShoppingBag size={12} />
                            </motion.div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {!isProcessing && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl flex flex-col items-center justify-center gap-1 aspect-square hover:border-primary/50 hover:bg-primary/5 transition-all text-gray-400 hover:text-primary group"
                  >
                    <Plus size={20} />
                    <span className="text-[9px] font-bold">添加</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Editor */}
          <AnimatePresence>
            {editingItemId && editingItem && editingItem.result ? (
              <motion.div 
                key={editingItemId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.1 }}
                className="flex-1 overflow-y-auto bg-white dark:bg-black/20"
              >
                <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
                  <div className="flex items-center justify-between">
                     <h3 className="text-lg font-bold flex items-center gap-2">
                       <ImageIcon size={18} className="text-primary" />
                       订单详情修正 #{(items.findIndex(i => i.id === editingItemId) + 1).toString().padStart(2, '0')}
                     </h3>
                     <button 
                       onClick={() => setEditingItemId(null)}
                       className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                     >
                       <X size={18} />
                     </button>
                  </div>

                  {/* Top: Image Preview & Main Info */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                     <div className="relative group aspect-video rounded-2xl overflow-hidden border border-border shadow-sm">
                        <Image 
                          src={editingItem.preview} 
                          alt="Edit Preview" 
                          fill
                          className="w-full h-full object-cover" 
                          unoptimized
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <button 
                              onClick={() => setPreviewImage(editingItem.preview)}
                              className="px-4 py-2 bg-white text-black text-xs font-bold rounded-full shadow-lg hover:scale-105 transition-all"
                           >
                             点击放大查看
                           </button>
                        </div>
                     </div>

                     <div className="space-y-4">
                         <div className="space-y-1.5">
                               <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                 <Calendar size={10} /> 订单日期
                               </label>
                                 <DatePicker 
                                   value={editingItem.result.date || ""} 
                                   onChange={(val) => {
                                     setItems(prev => prev.map(it => it.id === editingItemId ? {
                                       ...it,
                                       result: { ...it.result!, date: val, timeMissing: false }
                                     } : it));
                                   }}
                                   className="h-9"
                                   triggerClassName={cn(
                                     "justify-start px-3",
                                     editingItem.result.timeMissing && "border-orange-500 ring-1 ring-orange-500/50 bg-orange-500/5"
                                   )}
                                 />
                                 {editingItem.result.timeMissing && (
                                   <p className="text-[9px] text-orange-600 dark:text-orange-400 font-bold mt-1 flex items-center gap-1">
                                     <AlertCircle size={10} /> 未能精确识别时间，默认设为 00:00:00
                                   </p>
                                 )}
                              </div>


                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                ¥ 实付金额
                              </label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={editingItem.result.paymentAmount || 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setItems(prev => prev.map(it => it.id === editingItemId ? {
                                    ...it,
                                    result: { ...it.result!, paymentAmount: val }
                                  } : it));
                                }}
                                className="w-full h-9 rounded-xl bg-zinc-100/80 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white dark:focus:bg-white/10 outline-none transition-all"
                              />
                           </div>
                           <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                ¥ 到手金额
                              </label>
                              <input 
                                type="number" 
                                step="0.01"
                                value={editingItem.result.receivedAmount || 0}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setItems(prev => prev.map(it => it.id === editingItemId ? {
                                    ...it,
                                    result: { ...it.result!, receivedAmount: val }
                                  } : it));
                                }}
                                className="w-full h-9 rounded-xl bg-zinc-100/80 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 text-xs font-mono font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white dark:focus:bg-white/10 outline-none transition-all"
                              />
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Bottom: Items Adjustment */}
                  <div className="space-y-4">
                     <div className="flex items-center justify-between border-b border-border/50 pb-2">
                        <label className="text-xs font-bold text-foreground flex items-center gap-2">
                          <ShoppingBag size={14} className={cn("text-primary", (!editingItem.result.matchedItems || editingItem.result.matchedItems.length === 0) && "text-red-500")} />
                          匹配商品清单
                        </label>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full",
                          (!editingItem.result.matchedItems || editingItem.result.matchedItems.length === 0) 
                            ? "bg-red-500/10 text-red-500 animate-pulse" 
                            : "bg-emerald-500/10 text-emerald-500"
                        )}>
                          {(!editingItem.result.matchedItems || editingItem.result.matchedItems.length === 0) 
                            ? "未识别到匹配商品" 
                            : `已自动匹配 ${editingItem.result.matchedItems.length} 件商品`}
                        </span>
                     </div>

                     <div className="space-y-3">
                        {editingItem.result.matchedItems?.map((mi, idx) => (
                           <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50/30 dark:bg-white/5 border border-zinc-100 dark:border-white/10 group">
                              <div className="w-10 h-10 rounded-lg bg-white dark:bg-white/5 border border-border overflow-hidden shrink-0">
                                 {mi.product.image ? (
                                   <Image 
                                     src={mi.product.image} 
                                     alt="Match" 
                                     width={40} 
                                     height={40} 
                                     className="w-full h-full object-cover" 
                                     unoptimized
                                   />
                                 ) : <ShoppingBag size={16} className="m-auto mt-3 opacity-20" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-xs font-bold truncate leading-tight">{mi.product.name}</p>
                                 <p className="text-[10px] text-muted-foreground mt-0.5">SKU: {mi.product.sku || '未知'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="number"
                                  min="1"
                                  value={mi.quantity}
                                  onChange={(e) => {
                                    const qty = parseInt(e.target.value) || 1;
                                    setItems(prev => prev.map(it => it.id === editingItemId ? {
                                      ...it,
                                      result: { 
                                        ...it.result!, 
                                        matchedItems: it.result!.matchedItems?.map((m, i) => i === idx ? { ...m, quantity: qty } : m)
                                      }
                                    } : it));
                                  }}
                                  className="w-12 h-8 rounded-lg bg-white dark:bg-black/20 border border-border px-1.5 text-center text-xs font-bold"
                                />
                                <button 
                                  onClick={() => {
                                    setItems(prev => prev.map(it => it.id === editingItemId ? {
                                      ...it,
                                      result: { 
                                        ...it.result!, 
                                        matchedItems: it.result!.matchedItems?.filter((_, i) => i !== idx)
                                      }
                                    } : it));
                                  }}
                                  className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors text-muted-foreground"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                           </div>
                        ))}

                        {/* Add/Search Product Field */}
                        <div className="relative mt-4">
                           <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                              <Search size={14} />
                           </div>
                           <input 
                              type="text"
                              placeholder="搜索系统商品以添加..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="w-full h-10 rounded-xl bg-zinc-100/80 dark:bg-white/5 border border-zinc-200 dark:border-white/10 pl-9 pr-10 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white dark:focus:bg-white/10 outline-none transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                           />
                           
                           {productSearch && (
                             <button
                               onClick={() => setProductSearch("")}
                               className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                             >
                               <X size={14} />
                             </button>
                           )}
                           
                           {/* Search Results Dropdown */}
                           {productSearch && (
                             <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white dark:bg-gray-800 rounded-2xl border border-border shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                               {products.filter(p => p.name.includes(productSearch) || (p.sku && p.sku.includes(productSearch))).length > 0 ? (
                                 products.filter(p => p.name.includes(productSearch) || (p.sku && p.sku.includes(productSearch))).slice(0, 5).map(p => (
                                   <button
                                     key={p.id}
                                     onClick={() => {
                                       setItems(prev => prev.map(it => it.id === editingItemId ? {
                                         ...it,
                                         result: { 
                                           ...it.result!, 
                                           matchedItems: [...(it.result!.matchedItems || []), { productId: p.id, product: p, quantity: 1 }]
                                         }
                                       } : it));
                                       setProductSearch("");
                                     }}
                                       className="w-full flex items-center gap-3 p-2.5 hover:bg-zinc-50 dark:hover:bg-white/10 text-left transition-colors"
                                    >
                                      <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden shrink-0 relative">
                                        {p.image && (
                                          <Image 
                                            src={p.image} 
                                            alt="Search" 
                                            width={32} 
                                            height={32} 
                                            className="w-full h-full object-cover text-transparent"
                                            unoptimized
                                          />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                         <p className="text-[11px] font-bold truncate">{p.name}</p>
                                         <p className="text-[9px] text-muted-foreground">SKU: {p.sku || '-'}</p>
                                      </div>
                                      <Plus size={14} className="text-primary" />
                                   </button>
                                 ))
                               ) : (
                                 <div className="p-4 text-center text-[10px] text-muted-foreground">未找到相关商品</div>
                               )}
                             </div>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Note */}
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                        备注信息
                     </label>
                     <textarea 
                        value={editingItem.result.note || ""}
                        onChange={(e) => {
                          setItems(prev => prev.map(it => it.id === editingItemId ? {
                            ...it,
                            result: { ...it.result!, note: e.target.value }
                          } : it));
                        }}
                        placeholder="修正识别偏差或补充备注..."
                        className="w-full rounded-2xl bg-zinc-50/50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/10 p-4 text-xs min-h-[80px] focus:ring-2 focus:ring-primary focus:bg-white focus:border-transparent outline-none transition-all resize-none"
                     />
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-zinc-100 dark:border-white/10 bg-white dark:bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-medium hidden sm:block">
            {items.length > 0 && (
              <span>已添加 {items.length} 张图片</span>
            ) || "等待添加图片"}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2.5 rounded-2xl border border-gray-200 dark:border-white/20 font-black hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-sm text-gray-600 dark:text-gray-200 whitespace-nowrap"
            >
              取消
            </button>
            {items.length === 0 || items.some(i => i.status === 'pending' || i.status === 'processing' || i.status === 'error') ? (
              <button
                disabled={isProcessing || items.length === 0}
                onClick={processBatch}
                className="flex-1 sm:flex-none px-4 sm:px-8 py-2.5 rounded-2xl bg-primary text-primary-foreground font-black shadow-lg shadow-primary/40 hover:scale-105 transition-all flex items-center justify-center gap-1 sm:gap-2 text-sm disabled:opacity-50 disabled:transform-none whitespace-nowrap"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} className="hidden sm:block" />}
                开始识别
              </button>
            ) : (
              <button
                disabled={isProcessing}
                onClick={handleSaveAll}
                className="flex-1 sm:flex-none px-4 sm:px-8 py-2.5 rounded-2xl bg-emerald-500 text-white font-black shadow-lg shadow-emerald-500/40 hover:scale-105 transition-all flex items-center justify-center gap-1 sm:gap-2 text-sm disabled:opacity-50 disabled:transform-none whitespace-nowrap"
              >
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} className="hidden sm:block" />}
                保存全部到清单 ({items.filter(i => i.status === 'success').length})
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
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 backdrop-blur-sm touch-none overscroll-none"
            onClick={() => setPreviewImage(null)}
          >
            <button
              className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/40 rounded-full backdrop-blur-md transition-all z-10"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(null);
              }}
            >
              <X size={24} />
            </button>

            <div className="w-full h-full flex items-center justify-center p-4 sm:p-12 pointer-events-none">
              <div className="w-full h-full max-w-5xl max-h-[90vh] pointer-events-auto">
                {/* Assuming GestureImage is imported from './GestureImage' or similar */}
                <GestureImage src={previewImage} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
};
