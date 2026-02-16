"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Truck, Plus, Trash2, CheckCircle2, Camera, ExternalLink, Copy } from "lucide-react";
import { TrackingInfo } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export interface TrackingNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (trackingData: TrackingInfo[], paymentVouchers?: string[]) => void;
  initialValue?: TrackingInfo[];
  paymentVouchers?: string[];
  paymentVoucher?: string;
  readOnly?: boolean;
  lockPackages?: boolean;
  onViewImages?: (images: string[], index?: number) => void;
  mode?: "all" | "payment" | "tracking" | "waybill";
}

const COURIER_OPTIONS = [
  "顺丰速运", "圆通速递", "中通快递", "申通快递", "韵达快递", 
  "极兔速递", "EMS", "邮政快递", "京东快递", "德邦快递", "安能物流", "顺心捷达", "跨越速运", "其他"
];

const COURIER_CODES: Record<string, string> = {
  "顺丰速运": "shunfeng",
  "圆通速递": "yuantong",
  "中通快递": "zhongtong",
  "申通快递": "shentong",
  "韵达快递": "yunda",
  "极兔速递": "jtexpress",
  "EMS": "ems",
  "邮政快递": "youzhengguonei",
  "京东快递": "jd",
  "德邦快递": "debangwuliu",
  "安能物流": "annengwuliu",
  "跨越速运": "kuayue"
};

const getTrackingUrl = (num: string, courierName?: string) => {
  const code = courierName ? COURIER_CODES[courierName] : "";
  if (!num || !code) return null;
  return `https://www.kuaidi100.com/chaxun?com=${code}&nu=${num.trim()}`;
};

const CourierSelect: React.FC<{
  value: string;
  isStandard: boolean;
  onSelect: (val: string) => void;
  readOnly?: boolean;
}> = ({ value, isStandard, onSelect, readOnly }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const updatePosition = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      updatePosition();
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", updatePosition);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={readOnly}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full h-11 rounded-xl bg-zinc-500/5 dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all flex items-center justify-between group overflow-hidden disabled:opacity-70 disabled:cursor-default"
      >
        <span className="truncate">{isStandard ? value : "其他"}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          className="text-muted-foreground group-hover:text-foreground transition-colors"
        >
          <Plus size={14} className={isOpen ? "rotate-45" : ""} />
        </motion.span>
      </button>

      {createPortal(
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              style={{ 
                position: 'fixed',
                top: coords.top + 8,
                left: coords.left,
                width: coords.width,
                zIndex: 999999
              }}
              className="rounded-2xl border border-border/40 dark:border-white/10 bg-white dark:bg-zinc-900 shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] p-1.5 overflow-hidden ring-1 ring-black/5 max-w-[calc(100vw-2rem)]"
            >
              <div className="max-h-60 overflow-y-auto px-1 space-y-1">
                {COURIER_OPTIONS.map((opt) => {
                  const isSelected = (isStandard ? value : "其他") === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onSelect(opt);
                        setIsOpen(false);
                      }}
                      className={`relative w-full rounded-xl px-4 py-2 text-left text-sm transition-all duration-200 group flex items-center justify-between ${
                        isSelected 
                          ? "bg-primary/10 text-primary font-bold" 
                          : "text-foreground/70 hover:bg-zinc-500/10 hover:text-foreground"
                      }`}
                    >
                      <span className="relative z-10">{opt}</span>
                      {isSelected && (
                          <motion.div 
                              layoutId="active-indicator"
                              className="h-1.5 w-1.5 rounded-full bg-primary"
                          />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

const TrackingNumberModal: React.FC<TrackingNumberModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialValue = [],
  paymentVouchers: paymentVouchersProp,
  paymentVoucher: paymentVoucherProp,
  readOnly = false,
  lockPackages = false,
  onViewImages,
  mode = "all",
}) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<TrackingInfo[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<string[]>([]);
  const [isUploadingVoucher, setIsUploadingVoucher] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  // Initialize rows when modal opens or initialValue changes
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  if (isOpen && initialValue && initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    setRows(initialValue.length > 0 ? initialValue : [{ courier: "顺丰速运", number: "" }]);
    const initialVouchers = paymentVouchersProp && paymentVouchersProp.length > 0 
      ? paymentVouchersProp 
      : (paymentVoucherProp ? [paymentVoucherProp] : []);
    setPaymentVouchers(initialVouchers);
  }

  const addRow = () => {
    setRows([...rows, { courier: "顺丰速运", number: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = React.useCallback((index: number, field: keyof TrackingInfo, value: string | string[]) => {
    setRows(prev => {
        const newRows = [...prev];
        newRows[index] = { ...newRows[index], [field]: value } as TrackingInfo;
        return newRows;
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const validRows = rows.filter(r => r.number.trim());
    onConfirm(validRows, paymentVouchers);
    onClose();
  };

  const handleVoucherUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingVoucher(true);
    
    const uploadPromises = Array.from(files).map(async (file) => {
      const uploadData = new FormData();
      uploadData.append("file", file);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
          headers: {
            "x-folder": "vouchers",
            "x-use-timestamp": "true"
          }
        });
        if (res.ok) {
          const { url } = await res.json();
          return url;
        }
      } catch (error) {
        console.error("Voucher upload failed:", error);
      }
      return null;
    });

    try {
      const urls = (await Promise.all(uploadPromises)).filter(url => url !== null) as string[];
      if (urls.length > 0) {
        setPaymentVouchers(prev => [...prev, ...urls]);
      }
    } finally {
      setIsUploadingVoucher(false);
    }
  };

  const handlePasteUpload = React.useCallback(async (e: React.ClipboardEvent | ClipboardEvent, type: 'payment' | 'waybill', rowIndex?: number) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;

      e.preventDefault();
      setIsUploadingVoucher(true); // Reusing this loading state for simplicity, or could add isUploadingWaybill

      // Only process the first image found to avoid duplicates (e.g. multiple formats of same image)
      const item = imageItems[0];
      const file = item.getAsFile();
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      
      try {
          const res = await fetch("/api/upload", { 
            method: "POST", 
            body: formData,
            headers: {
                "x-folder": type === 'payment' ? 'vouchers' : 'labels',
                "x-use-timestamp": "true"
            }
          });
          if (res.ok) {
              const { url } = await res.json();
              if (url) {
                  if (type === 'payment') {
                      setPaymentVouchers(prev => [...prev, url]);
                      showToast("支付凭证上传成功", "success");
                  } else if (type === 'waybill' && typeof rowIndex === 'number') {
                       setRows(prev => {
                           const newRows = [...prev];
                           const currentRow = newRows[rowIndex];
                           const currentImages = currentRow.waybillImages || (currentRow.waybillImage ? [currentRow.waybillImage] : []);
                           newRows[rowIndex] = { ...currentRow, waybillImages: [...currentImages, url] };
                           return newRows;
                       });
                       showToast("面单上传成功", "success");
                  }
              }
          }
      } catch (error) {
          console.error("Paste upload failed:", error);
      }
      return;


  }, [showToast, setRows]);

  // Global paste listener for Payment Mode

  useEffect(() => {
      if (!isOpen || mode !== 'payment') return;

      const handleGlobalPaste = (e: ClipboardEvent) => {
          handlePasteUpload(e, 'payment');
      };

      document.addEventListener('paste', handleGlobalPaste);
      return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [isOpen, mode, handlePasteUpload]); // Dependencies


  if (!mounted) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-9998 bg-black/40 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className={`fixed left-1/2 top-1/2 z-9999 w-[calc(100%-32px)] sm:w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-4xl sm:rounded-[2.5rem] bg-white/95 dark:bg-gray-900/60 backdrop-blur-3xl border border-border/40 dark:border-white/10 shadow-2xl flex flex-col ${mode === 'payment' ? 'min-h-[300px] sm:min-h-[360px]' : 'min-h-[400px] sm:min-h-[500px]'} max-h-[90vh] sm:max-h-[85vh] overflow-hidden`}
          >
            <div className="relative p-6 sm:p-10 border-b border-border/40 shrink-0 flex items-center gap-4 sm:gap-6">
              <div className="h-12 w-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                <Truck size={24} />
              </div>
              
              <div className="flex flex-col">
                <h3 className="text-xl font-black text-foreground tracking-tight">
                    {mode === "payment" ? "上传支付凭证" : mode === "tracking" ? "录入物流单号" : mode === "waybill" ? "上传物流面单" : "补全进货资料"}
                </h3>
                <p className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">
                    {mode === "payment" ? "请上传付款成功截图" : mode === "tracking" ? "请填写物流追踪信息" : mode === "waybill" ? "请上传对应的物流面单截图" : "录入支付凭证与包裹追踪信息"}
                </p>
              </div>

              <button 
                onClick={onClose}
                className="ml-auto rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X size={20} />
              </button>
            </div>

             <form onSubmit={handleSubmit} className={`flex flex-col min-h-0 bg-background/20 ${mode === 'payment' ? 'justify-center' : ''}`}>
              <div className={`flex-1 overflow-y-auto p-6 sm:p-12 ${mode !== "payment" ? "space-y-6 sm:space-y-8" : "space-y-0"}`}>
                {mode !== "payment" && rows.map((row, index) => {
                  const isStandard = COURIER_OPTIONS.filter(o => o !== "其他").includes(row.courier);
                  const showCustomInput = !isStandard;

                  // Normalize images list
                  const images = row.waybillImages && row.waybillImages.length > 0
                    ? row.waybillImages
                    : (row.waybillImage ? [row.waybillImage] : []);


                  return (
                    <div 
                      key={index} 
                      className="relative flex flex-col gap-4 p-5 rounded-2xl bg-zinc-500/5 dark:bg-white/5 border border-border/40 dark:border-white/5 group animate-in fade-in slide-in-from-top-2 duration-300"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest bg-zinc-500/5 dark:bg-white/5 px-3 py-1.5 rounded-full">包裹 #{index + 1}</span>
                        {rows.length > 1 && !readOnly && !lockPackages && mode !== "waybill" && (
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-muted-foreground/50 uppercase tracking-tighter ml-1">快递公司</label>
                          <div className="relative">
                            {showCustomInput ? (
                              <div className="relative group/custom animate-in zoom-in-95 duration-200">
                                <input
                                  type="text"
                                  placeholder="输入快递名称"
                                  value={row.courier === "其他" ? "" : row.courier}
                                  readOnly={readOnly || lockPackages || mode === "waybill"}
                                  onChange={(e) => updateRow(index, "courier", e.target.value)}
                                  className="w-full h-11 rounded-xl bg-zinc-500/5 dark:bg-white/5 border border-border dark:border-white/10 px-4 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all read-only:opacity-70"
                                  onPaste={(e) => handlePasteUpload(e, 'waybill', index)}
                                />
                                {!readOnly && !lockPackages && (
                                  <button 
                                    type="button"
                                    onClick={() => updateRow(index, "courier", "顺丰速运")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground p-1.5 rounded-lg hover:bg-zinc-500/10 transition-all"
                                    title="返回列表"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            ) : (
                                <CourierSelect 
                                value={row.courier} 
                                isStandard={isStandard}
                                readOnly={readOnly || lockPackages || mode === "waybill"}
                                onSelect={(val) => updateRow(index, "courier", val)} 
                              />
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-muted-foreground/50 uppercase tracking-tighter ml-1">快递单号</label>
                          <div className="relative group">
                            <input
                              type="text"
                              placeholder={readOnly ? "未填写" : "单号..."}
                              value={row.number}
                              readOnly={readOnly || lockPackages || mode === "waybill"}
                              onChange={(e) => updateRow(index, "number", e.target.value)}
                              className="w-full h-11 rounded-xl bg-zinc-500/5 dark:bg-white/5 border border-border dark:border-white/10 px-4 pr-12 text-sm text-foreground outline-none ring-primary/20 focus:ring-2 focus:border-primary transition-all font-mono read-only:opacity-70"
                              onPaste={(e) => handlePasteUpload(e, 'waybill', index)}
                            />
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                      navigator.clipboard.writeText(row.number);
                                      showToast("单号已复制到剪贴板", "success");
                                  }}
                                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                                  title="复制单号"
                                >
                                  <Copy size={14} />
                                </button>
                                {(() => {
                                  const url = getTrackingUrl(row.number, row.courier);
                                  if (!url) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => window.open(url, '_blank')}
                                      className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-all"
                                      title="快递100查询"
                                    >
                                      <ExternalLink size={14} />
                                    </button>
                                  );
                                })()}
                              </div>
                          </div>
                        </div>
                      </div>




                      {/* Waybill Images Management - Only visible if not in pure tracking entry mode */}
                      {mode !== "tracking" && (
                      <div className="space-y-2 pt-2">
                        <label className="text-xs font-bold text-muted-foreground/50 uppercase tracking-tighter ml-1">物流面单</label>
                        <div className="flex flex-wrap gap-3">
                          {/* Existing Images */}
                          {images.map((img, imgIdx) => (
                            <div key={imgIdx} className="group/img relative h-20 w-28 rounded-xl overflow-hidden border border-border bg-muted/30 shadow-sm animate-in zoom-in-50 duration-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={img} 
                                alt="waybill" 
                                className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform" 
                                onClick={() => {
                                  if (onViewImages) {
                                    // Collect all images across all rows for a unified gallery experience if possible, 
                                    // but usually we just view the current row's images.
                                    onViewImages(images, imgIdx);
                                  }
                                }}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newImages = [...images];
                                    newImages.splice(imgIdx, 1);
                                    updateRow(index, "waybillImages", newImages);
                                  }}
                                  className="p-1.5 rounded-lg bg-white/20 hover:bg-destructive/80 text-white transition-colors"
                                  title="移除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* Upload Button */}
                          {!readOnly && (
                            <label className="h-20 w-28 rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 group/up">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                  const files = e.target.files;
                                  if (!files || files.length === 0) return;
                                  
                                  const uploadPromises = Array.from(files).map(async (file) => {
                                      const formData = new FormData();
                                      formData.append("file", file);
                                      try {
                                          const res = await fetch("/api/upload", { 
                                            method: "POST", 
                                            body: formData,
                                            headers: {
                                                "x-folder": "labels",
                                                "x-use-timestamp": "true"
                                            }
                                          });
                                          if (res.ok) {
                                              const { url } = await res.json();
                                              return url;
                                          }
                                      } catch (error) {
                                          console.error("Upload failed:", error);
                                      }
                                      return null;
                                  });

                                  const uploadedUrls = (await Promise.all(uploadPromises)).filter(url => url !== null);
                                  if (uploadedUrls.length > 0) {
                                      const newImages = [...images, ...uploadedUrls];
                                      updateRow(index, "waybillImages", newImages);
                                  }
                                }}
                              />
                              <Camera size={20} className="text-muted-foreground group-hover/up:text-primary transition-colors" />
                              <div className="flex flex-col items-center">
                                  <span className="text-[10px] font-bold text-muted-foreground/60 group-hover/up:text-primary mb-0.5">上传凭证</span>
                                  <span className="text-[10px] scale-90 text-muted-foreground/40 font-medium group-hover/up:text-primary/60 transition-colors">支持 Ctrl+V</span>
                              </div>
                            </label>
                          )}
                          
                          {images.length === 0 && readOnly && (
                            <div className="h-20 w-28 rounded-xl border border-dashed border-border/40 bg-muted/5 flex items-center justify-center">
                              <span className="text-[10px] font-bold text-muted-foreground/40 italic">暂无凭证</span>
                            </div>
                          )}
                        </div>
                      </div>
                      )}


                    </div>
                  );
                })}

                  {mode !== "payment" && mode !== "waybill" && !readOnly && !lockPackages && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="w-full py-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground/60 hover:text-primary text-sm font-bold mt-4 group outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                    继续添加包裹
                  </button>
                )}

                {/* Unified Payment Voucher Section */}
                {mode !== "tracking" && mode !== "waybill" && (
                <div className={`space-y-4 ${mode === "all" ? "pt-8 border-t border-border/40" : ""} ${mode === 'payment' ? 'flex flex-col items-center w-full' : ''}`}>
                    <div className="flex items-center gap-2">
                        <Camera size={18} className="text-primary" />
                        <span className="text-sm font-bold text-foreground">支付凭证 (必填)</span>
                    </div>
                    
                    <div className={`flex flex-wrap gap-3 sm:gap-4 ${mode === 'payment' ? 'justify-center' : ''}`}>
                        {paymentVouchers.map((url, vIdx) => (
                            <div key={vIdx} className={`group/voucher relative rounded-2xl overflow-hidden border border-border shadow-sm animate-in zoom-in-95 duration-200 ${mode === 'payment' ? 'h-32 sm:h-40 w-full sm:w-56' : 'h-20 sm:h-32 w-28 sm:w-48'}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                    src={url} 
                                    alt={`payment voucher ${vIdx + 1}`} 
                                    className="h-full w-full object-cover cursor-zoom-in"
                                    onClick={() => onViewImages?.(paymentVouchers, vIdx)}
                                />
                                {!readOnly && (
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/voucher:opacity-100 transition-opacity flex items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentVouchers(prev => prev.filter((_, i) => i !== vIdx))}
                                            className="p-2 rounded-full bg-destructive text-white shadow-xl hover:scale-110 transition-transform"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        
                        {!readOnly && (
                            <label className={`rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group/up ${mode === 'payment' ? 'h-32 sm:h-40 w-full sm:w-56' : 'h-20 sm:h-32 w-28 sm:w-48'}`}>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleVoucherUpload}
                                    disabled={isUploadingVoucher}
                                />
                                <div className="p-2 sm:p-3 rounded-full bg-muted group-hover/up:bg-primary/10 transition-colors">
                                    <Camera size={24} className={`${isUploadingVoucher ? 'animate-spin' : 'text-muted-foreground group-hover/up:text-primary'}`} />
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold text-muted-foreground group-hover/up:text-primary">{isUploadingVoucher ? "上传中..." : "上传支付截图"}</span>
                                    <span className="text-[10px] scale-90 text-muted-foreground/50 font-medium mt-0.5 group-hover/up:text-primary/60 transition-colors">支持 Ctrl+V 粘贴</span>
                                </div>
                            </label>
                        )}
                    </div>
                </div>
                )}
              </div>

               <div className="p-6 sm:p-10 border-t border-border/40 shrink-0 bg-muted/10">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-12 rounded-xl px-2 sm:px-4 text-xs sm:text-sm font-bold border border-border dark:border-white/10 hover:bg-secondary transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={readOnly || (paymentVouchers.length === 0 && rows.some(r => r.number.trim()))}
                    className={`flex-2 sm:flex-1 h-12 rounded-xl px-2 sm:px-4 text-xs sm:text-sm font-black shadow-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:pointer-events-none ${
                        readOnly 
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                        : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-black/10 dark:shadow-white/5 hover:brightness-110 active:scale-[0.98]'
                    }`}
                  >
                    {readOnly ? (
                        <>
                            <CheckCircle2 size={18} />
                            <span className="truncate">数据锁定</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 size={18} />
                            <span className="truncate">
                                {mode === "payment" ? "保存支付凭证" : mode === "tracking" ? "保存物流单号" : mode === "waybill" ? "保存物流面单" : "保存进货资料"}
                            </span>
                        </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default TrackingNumberModal;
