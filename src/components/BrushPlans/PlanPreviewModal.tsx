"use client";

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Package, Calendar, CheckCircle2, Copy, Check, Share2 } from "lucide-react";
import Image from "next/image";
import { BrushOrderPlan, BrushOrderPlanItem } from "@/lib/types";
import { formatLocalDate } from "@/lib/dateUtils";
import { copyToClipboard } from "@/lib/utils";
import { useState } from "react";


interface PlanPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    plan?: BrushOrderPlan | null;
    plans?: BrushOrderPlan[];
    title?: string;
    date?: string;
}

export function PlanPreviewModal({ isOpen, onClose, plan = null, plans = [], title, date }: PlanPreviewModalProps) {
    const [copied, setCopied] = useState(false);

    const activePlans = plan ? [plan] : plans;
    if (activePlans.length === 0) return null;

    const flattenedItems = activePlans.flatMap((currentPlan) =>
        currentPlan.items.map((item) => ({
            ...item,
            __planId: currentPlan.id,
            __shopName: currentPlan.shopName || "通用店铺",
            __platform: normalizePlatform(item.platform),
        }))
    ) as Array<BrushOrderPlanItem & { __planId: string; __shopName: string; __platform: string }>;
    const groupedPreview = Array.from(
        flattenedItems.reduce((shopMap, item) => {
            const shopName = item.__shopName;
            const platform = item.__platform;
            const currentShop = shopMap.get(shopName) || new Map<string, typeof flattenedItems>();
            const currentPlatformItems = currentShop.get(platform) || [];
            currentPlatformItems.push(item);
            currentShop.set(platform, currentPlatformItems);
            shopMap.set(shopName, currentShop);
            return shopMap;
        }, new Map<string, Map<string, typeof flattenedItems>>())
    ).map(([shopName, platformMap]) => ({
        shopName,
        platforms: Array.from(platformMap.entries()).map(([platform, items]) => ({
            platform,
            items,
        })),
    }));
    const previewDate = date || (plan ? formatLocalDate(plan.date) : formatLocalDate(activePlans[0].date));
    const previewTitle = title || (plan ? "分享任务清单" : "当天全店安排预览");
    const shareUrl = plan && typeof window !== 'undefined' ? `${window.location.origin}/brush-plans/share/${plan.id}` : '';
    const canCopyShare = Boolean(plan && shareUrl);

    const handleCopy = async () => {
        if (!canCopyShare) return;
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
                        initial={{ opacity: 0, scale: 0.96, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 20 }}
                        className="fixed inset-x-2 bottom-2 top-2 z-100001 flex flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/8 dark:bg-[#101216] sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[calc(100%-32px)] sm:max-w-6xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px] sm:max-h-safe-modal"
                    >
                        {/* Header for preview - optimized for screenshot */}
                        <div className="border-b border-black/6 bg-linear-to-r from-zinc-50 to-white p-4 dark:border-white/8 dark:from-[#171a21] dark:to-[#12141a] sm:p-6">
                            <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
                                <div className="min-w-0 flex items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                        <Share2 size={22} className="text-white" />
                                    </div>
                                    <h2 className="truncate pr-2 text-lg font-black sm:text-xl">{previewTitle}</h2>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    {canCopyShare ? (
                                        <button 
                                            onClick={handleCopy}
                                            className={`hidden items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all sm:flex ${
                                                copied ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 scale-95' : 'bg-white dark:bg-[#1b1f27] border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#232833]'
                                            }`}
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? '链接已复制' : '复制分享链接'}
                                        </button>
                                    ) : null}
                                    <button onClick={onClose} className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-muted-foreground">
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 text-xs font-bold text-muted-foreground/80 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <span className="flex items-center gap-2"><Calendar size={14} /> {previewDate}</span>
                                    <span>共 {flattenedItems.length} 款任务</span>
                                    {activePlans.length > 1 ? (
                                        <span>{activePlans.length} 家店铺</span>
                                    ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-3 sm:block">
                                    <span className="text-[11px] sm:hidden">{canCopyShare ? "复制链接发给刷单员，或截图分享" : "截图或直接预览当天全部安排"}</span>
                                    {canCopyShare ? (
                                        <button
                                            onClick={handleCopy}
                                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold transition-all sm:hidden ${
                                                copied ? "scale-95 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "border border-zinc-200 bg-white dark:border-white/10 dark:bg-[#1b1f27]"
                                            }`}
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? "已复制" : "复制链接"}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto bg-zinc-50/70 p-3 no-scrollbar dark:bg-[#0d0f14] sm:space-y-5 sm:p-6">
                            {groupedPreview.map((shopGroup, shopIndex) => (
                                <section key={`${shopGroup.shopName}-${shopIndex}`} className="space-y-3">
                                    <div className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm dark:border-white/8 dark:bg-[#1a1d24]">
                                        <div className="text-sm font-black text-foreground sm:text-base">{shopGroup.shopName}</div>
                                        <div className="mt-1 text-xs font-medium text-muted-foreground dark:text-zinc-400">
                                                {shopGroup.platforms.reduce((sum, platformGroup) => sum + platformGroup.items.length, 0)} 款任务 · {shopGroup.platforms.length} 个平台
                                        </div>
                                    </div>

                                    {shopGroup.platforms.map((platformGroup) => {
                                        const platformMeta = getPlatformBadgeMeta(platformGroup.platform);
                                        return (
                                            <div key={`${shopGroup.shopName}-${platformGroup.platform}`} className="space-y-3 rounded-[24px] border border-zinc-200/70 bg-zinc-50/85 p-3 shadow-sm dark:border-white/8 dark:bg-[#141820] sm:p-4">
                                                <div className="flex flex-wrap items-center gap-2 border-b border-black/6 pb-3 dark:border-white/8">
                                                    <span className={platformMeta.badgeClassName}>
                                                        <Image
                                                            src={platformMeta.iconSrc}
                                                            alt={platformMeta.iconAlt}
                                                            width={16}
                                                            height={16}
                                                            className="h-4 w-4 object-cover"
                                                            unoptimized
                                                        />
                                                        {platformGroup.platform}
                                                    </span>
                                                    <span className="text-xs font-medium text-muted-foreground dark:text-zinc-400">
                                                        {platformGroup.items.length} 款任务
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                                    {platformGroup.items.map((item, index) => (
                                                        <div key={`${shopGroup.shopName}-${platformGroup.platform}-${index}`} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-white/8 dark:bg-[#1b1f27] min-[420px]:flex-col min-[420px]:p-1.5 min-[420px]:gap-2">
                                                            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100 dark:bg-[#0f1218] min-[420px]:aspect-square min-[420px]:h-auto min-[420px]:w-full">
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
                                                            <div className="flex min-w-0 flex-1 flex-col gap-2 p-0.5 min-[420px]:p-2">
                                                                <div className="flex items-start gap-1 p-1.5 rounded-md bg-zinc-100 text-zinc-700 text-[11px] leading-snug w-full dark:bg-white/6 dark:text-zinc-100">
                                                                    <Search size={10} className="shrink-0 mt-[2px]" />
                                                                    <span className="line-clamp-2 break-all font-black">{item.searchKeyword || "暂无"}</span>
                                                                </div>
                                                                <div className="mt-auto flex items-center justify-between pl-1">
                                                                    <span className="text-zinc-500 dark:text-zinc-400 text-[11px] font-black">x{item.quantity}</span>
                                                                    {item.done ? <CheckCircle2 size={16} className="text-emerald-500" /> : <div className="w-4" />}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </section>
                            ))}
                        </div>

                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}

function normalizePlatform(platform?: string | null) {
    const text = String(platform || "").trim();
    if (!text) return "其他";
    if (text.includes("美团")) return "美团";
    if (text.includes("淘宝")) return "淘宝";
    if (text.includes("京东")) return "京东";
    return text;
}

function getPlatformBadgeMeta(platform?: string | null) {
    const normalized = normalizePlatform(platform);
    if (normalized === "美团") {
        return {
            iconSrc: "/platform/美团.svg",
            iconAlt: "美团",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-[#FFD000]/30 bg-[#FFF7CC] px-3 py-1 text-xs font-black text-[#8A6A00] dark:bg-[#3a3008] dark:text-[#FFD84D] dark:border-[#FFD000]/20",
        };
    }
    if (normalized === "淘宝") {
        return {
            iconSrc: "/platform/淘宝.svg",
            iconAlt: "淘宝",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-[#FF5000]/20 bg-[#FFF0E8] px-3 py-1 text-xs font-black text-[#E65400] dark:bg-[#35180b] dark:text-[#FF8A4D] dark:border-[#FF5000]/18",
        };
    }
    if (normalized === "京东") {
        return {
            iconSrc: "/platform/京东.svg",
            iconAlt: "京东",
            badgeClassName: "inline-flex items-center gap-2 rounded-full border border-[#E1251B]/20 bg-[#FFF0EF] px-3 py-1 text-xs font-black text-[#C9281F] dark:bg-[#341314] dark:text-[#FF7B72] dark:border-[#E1251B]/18",
        };
    }
    return {
        iconSrc: "/platform/其他.svg",
        iconAlt: normalized || "其他",
        badgeClassName: "inline-flex items-center gap-2 rounded-full border border-zinc-300/80 bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-600 dark:border-white/10 dark:bg-[#232833] dark:text-zinc-300",
    };
}
