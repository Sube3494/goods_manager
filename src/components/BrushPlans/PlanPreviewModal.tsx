"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Package, Calendar, CheckCircle2, Copy, Check, Share2 } from "lucide-react";
import Image from "next/image";
import { BrushOrderPlan } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { copyToClipboard } from "@/lib/utils";
import { useState } from "react";


interface PlanPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan: BrushOrderPlan | null;
}

export function PlanPreviewModal({ isOpen, onClose, plan }: PlanPreviewModalProps) {
    const [copied, setCopied] = useState(false);

    if (!plan) return null;

    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/brush-plans/share/${plan.id}` : '';

    const handleCopy = async () => {
        const success = await copyToClipboard(shareUrl);
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };


    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-100000 bg-black/80 backdrop-blur-md"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 30 }}
                        className="fixed left-1/2 top-1/2 z-100001 w-[calc(100%-32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-[32px] bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header for preview - optimized for screenshot */}
                        <div className="bg-primary/5 p-6 border-b border-primary/10">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
                                        <Share2 size={22} className="text-white" />
                                    </div>
                                    <h2 className="text-xl font-black">分享任务清单</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleCopy}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all ${
                                            copied ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-95' : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50'
                                        }`}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        {copied ? '链接已复制' : '复制分享链接'}
                                    </button>
                                    <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-muted-foreground">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground opacity-60">
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-2"><Calendar size={14} /> {formatLocalDate(plan.date)}</span>
                                    <span>•</span>
                                    <span>共 {plan.items.length} 款任务</span>
                                </div>
                                <span className="hidden sm:inline">复制链接发给刷单员，或截图分享</span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 no-scrollbar bg-zinc-50/50 dark:bg-black/20">
                            {plan.items.map((item, index) => (
                                <div key={index} className="flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-2xl shadow-sm p-1.5 gap-2">
                                    <div className="relative aspect-square w-full rounded-xl bg-zinc-50 dark:bg-zinc-950 overflow-hidden">
                                        <div className="absolute top-1.5 left-1.5 z-10 px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-md text-white text-[11px] font-black shadow-sm flex items-center justify-center pointer-events-none">
                                            #{index + 1}
                                        </div>
                                        {item.product?.image ? (
                                            <Image 
                                                src={item.product.image} 
                                                fill 
                                                className="object-contain p-1" 
                                                alt="" 
                                                unoptimized 
                                            />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center text-zinc-300">
                                                <Package size={24} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2 p-2">
                                        <div className="flex items-start gap-1 p-1.5 rounded-md bg-primary/5 text-primary text-[11px] leading-snug w-full">
                                            <Search size={10} className="shrink-0 mt-[2px]" />
                                            <span className="line-clamp-2 break-all font-black">{item.searchKeyword || "暂无"}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5 pl-1">
                                            <span className="text-zinc-500 text-[11px] font-black">x{item.quantity}</span>
                                            {item.done ? <CheckCircle2 size={16} className="text-emerald-500" /> : <div className="w-4" />}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
