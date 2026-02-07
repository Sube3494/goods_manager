"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Truck, Plus, Trash2, CheckCircle2, Camera, Eye, Image as ImageIcon } from "lucide-react";
import { TrackingInfo } from "@/lib/types";

interface TrackingNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (trackingData: TrackingInfo[]) => void;
  initialValue?: TrackingInfo[];
  onUpload?: (index: number) => void;
  onRemoveImage?: (rowIndex: number, imgIndex: number) => void;
  onViewImages?: (images: string[]) => void;
}

const COURIER_OPTIONS = [
  "顺丰速运", "圆通速递", "中通快递", "申通快递", "韵达快递", 
  "极兔速递", "EMS", "邮政快递", "京东快递", "德邦快递", "其他"
];

const CourierSelect: React.FC<{
  value: string;
  isStandard: boolean;
  onSelect: (val: string) => void;
}> = ({ value, isStandard, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-11 rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all flex items-center justify-between group overflow-hidden"
      >
        <span className="truncate">{isStandard ? value : "其他"}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          className="text-muted-foreground group-hover:text-foreground transition-colors"
        >
          <Plus size={14} className={isOpen ? "rotate-45" : ""} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute left-0 right-0 top-full z-100 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-border/50 dark:border-white/10 bg-white/90 dark:bg-gray-900/80 backdrop-blur-2xl p-1.5 shadow-2xl shadow-black/10 dark:shadow-black/50 ring-1 ring-black/5 dark:ring-white/10"
          >
            {COURIER_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onSelect(opt);
                  setIsOpen(false);
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm transition-all hover:bg-primary/20 hover:text-primary ${
                  (isStandard ? value : "其他") === opt ? "bg-primary/30 text-primary font-bold" : "text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TrackingNumberModal: React.FC<TrackingNumberModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onUpload,
  onRemoveImage,
  onViewImages,
  initialValue = [],
}) => {
  const [rows, setRows] = useState<TrackingInfo[]>([]);
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
  }

  const addRow = () => {
    setRows([...rows, { courier: "顺丰速运", number: "" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length === 1) return;
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof TrackingInfo, value: string) => {
    const newRows = [...rows];
    newRows[index] = { ...newRows[index], [field]: value };
    setRows(newRows);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = rows.filter(r => r.number.trim());
    if (validRows.length > 0) {
      onConfirm(validRows);
      onClose();
    }
  };

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
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white/95 dark:bg-gray-900/60 backdrop-blur-3xl border border-border/50 dark:border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          >
            <div className="relative p-10 border-b border-white/5 shrink-0 flex flex-col items-center text-center">
              <button 
                onClick={onClose}
                className="absolute right-6 top-6 rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <X size={20} />
              </button>
              
              <div className="h-16 w-16 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-500 mb-4 shadow-lg shadow-orange-500/10">
                <Truck size={32} />
              </div>
              
              <h3 className="text-2xl font-black text-foreground tracking-tight">管理物流单号</h3>
              <p className="text-sm text-muted-foreground mt-1">支持录入多个包裹的追踪信息与多张面单</p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {rows.map((row, index) => {
                  const isStandard = COURIER_OPTIONS.filter(o => o !== "其他").includes(row.courier);
                  const showCustomInput = !isStandard;

                  // Get images list (supporting both old single field and new array)
                  const images = row.waybillImages && row.waybillImages.length > 0 
                    ? row.waybillImages 
                    : (row.waybillImage ? [row.waybillImage] : []);

                  return (
                    <div key={index} className="relative flex flex-col gap-4 p-5 rounded-2xl bg-zinc-500/5 dark:bg-white/5 border border-border/40 dark:border-white/5 group animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest bg-zinc-500/5 dark:bg-white/5 px-2.5 py-1 rounded-full">包裹 #{index + 1}</span>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">快递公司</label>
                          <div className="space-y-2.5">
                            <CourierSelect 
                              value={row.courier} 
                              isStandard={isStandard}
                              onSelect={(val) => {
                                if (val === "其他") {
                                  updateRow(index, "courier", "");
                                } else {
                                  updateRow(index, "courier", val);
                                }
                              }}
                            />
                            
                            {showCustomInput && (
                              <input
                                autoFocus
                                type="text"
                                placeholder="输入快递品牌名称"
                                value={row.courier}
                                onChange={(e) => updateRow(index, "courier", e.target.value)}
                                className="w-full h-11 rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 transition-all animate-in fade-in zoom-in-95"
                              />
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider ml-1">快递单号</label>
                          <input
                            type="text"
                            placeholder="请输入单号"
                            value={row.number}
                            onChange={(e) => updateRow(index, "number", e.target.value)}
                            className="w-full h-11 rounded-xl bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-sm text-foreground outline-none ring-primary/20 focus:ring-2 focus:border-primary transition-all font-mono"
                          />
                        </div>
                      </div>

                      {/* Waybill Images Management Section */}
                      <div className="space-y-2 mt-1">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
                            <ImageIcon size={10} /> 物流面单 {images.length > 0 && `(${images.length})`}
                          </label>
                          {images.length > 0 && onViewImages && (
                            <button 
                              type="button" 
                              onClick={() => onViewImages(images)}
                              className="text-[10px] font-bold text-primary hover:text-primary/70 transition-colors flex items-center gap-1"
                            >
                              <Eye size={10} /> 全屏预览
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                          {images.map((img, imgIdx) => (
                            <div 
                              key={imgIdx} 
                              onClick={() => onViewImages?.([img])}
                              className="relative h-14 w-14 shrink-0 rounded-xl overflow-hidden border border-white/10 group/img cursor-pointer hover:border-primary/50 transition-all active:scale-95"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img} alt="waybill" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveImage?.(index, imgIdx);
                                }}
                                className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive/80 flex items-center justify-center text-white opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive shadow-sm"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => onUpload?.(index)}
                            className="h-14 w-14 shrink-0 rounded-xl border-2 border-dashed border-border dark:border-white/10 flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
                            title="添加面单"
                          >
                            <Camera size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addRow}
                  className="w-full py-4 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border dark:border-white/5 hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary text-sm font-bold mt-2 group"
                >
                  <Plus size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                  继续添加包裹
                </button>
              </div>

              <div className="p-8 border-t border-white/5 shrink-0">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 h-12 rounded-xl px-4 text-sm font-bold border border-border dark:border-white/10 hover:bg-secondary transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={rows.every(r => !r.number.trim())}
                    className="flex-1 h-12 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 text-sm font-black shadow-xl shadow-black/10 dark:shadow-white/5 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <CheckCircle2 size={20} />
                    保存追踪信息
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
