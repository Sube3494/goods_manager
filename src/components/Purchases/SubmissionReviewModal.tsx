"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Check, Package, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { ProductSelectionModal } from "./ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

import { createPortal } from "react-dom";

interface Submission {
    id: string;
    urls: { url: string; type: 'image' | 'video' }[];
    sku?: string;
    productName?: string;
    productId?: string;
    selectedIndices?: number[];
    status: string;
    createdAt: string;
}

interface SubmissionReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    submission: Submission | null;
    onApprove: (id: string, productId: string, selectedIndices: number[]) => Promise<void>;
    onReject: (id: string) => Promise<void>;
}

export function SubmissionReviewModal({ 
    isOpen, 
    onClose, 
    submission, 
    onApprove, 
    onReject 
}: SubmissionReviewModalProps) {
    const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
    const [approvedProductId, setApprovedProductId] = useState<string>("");
    const [approvedProductName, setApprovedProductName] = useState<string>("");
    const [approvedProductImage, setApprovedProductImage] = useState<string>("");
    const [selectedMediaIndices, setSelectedMediaIndices] = useState<number[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;
    const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
    const { showToast } = useToast();

    // Fetch product name when ID changes
    useEffect(() => {
        if (approvedProductId) {
            fetch(`/api/products/${approvedProductId}`)
                .then(res => res.json())
                .then(data => {
                    if (data) {
                        if (data.name) setApprovedProductName(data.name);
                        if (data.image) setApprovedProductImage(data.image);
                    }
                })
                .catch(err => console.error("Error fetching product data:", err));
        } else {
            if (approvedProductName !== "") setApprovedProductName("");
            if (approvedProductImage !== "") setApprovedProductImage("");
        }
    }, [approvedProductId]);

    // Reset state when modal opens/closes or submission changes
    useEffect(() => {
        if (isOpen && submission) {
            if (submission.productId && approvedProductId !== submission.productId) {
                setApprovedProductId(submission.productId);
            }
            // If already approved, show the previously selected indices
            if (submission.selectedIndices && Array.isArray(submission.selectedIndices)) {
                // Only set if they are different to avoid unnecessary renders
                if (JSON.stringify(selectedMediaIndices) !== JSON.stringify(submission.selectedIndices)) {
                    setSelectedMediaIndices(submission.selectedIndices);
                }
            } else {
                // Start with no selection to allow previewing first for fresh pending ones
                if (selectedMediaIndices.length > 0) {
                    setSelectedMediaIndices([]);
                }
            }
        } else if (!isOpen) {
            if (approvedProductId !== "") setApprovedProductId("");
            if (approvedProductName !== "") setApprovedProductName("");
            if (approvedProductImage !== "") setApprovedProductImage("");
            if (selectedMediaIndices.length > 0) setSelectedMediaIndices([]);
            if (currentPage !== 1) setCurrentPage(1);
            if (previewMedia !== null) setPreviewMedia(null);
        }
    }, [isOpen, submission]);

    const handleApproveClick = async () => {
        if (!submission || !approvedProductId) return;
        if (selectedMediaIndices.length === 0) {
            showToast("请至少选择一个媒体文件发布", "error");
            return;
        }
        try {
            await onApprove(submission.id, approvedProductId, selectedMediaIndices);
            onClose();
        } catch (error) {
            console.error(error);
        }
    };

    const toggleMediaSelection = (index: number) => {
        setSelectedMediaIndices(prev => 
            prev.includes(index) 
                ? prev.filter(i => i !== index) 
                : [...prev, index]
        );
    };

    const handleMediaClick = (index: number, media: { url: string; type: 'image' | 'video' }) => {
        // If some items are already selected, we are in "selection mode"
        if (selectedMediaIndices.length > 0) {
            toggleMediaSelection(index);
        } else {
            // Otherwise, we preview the media
            setPreviewMedia(media);
        }
    };

    const toggleSelectAll = () => {
        if (!submission) return;
        if (selectedMediaIndices.length === submission.urls.length) {
            setSelectedMediaIndices([]);
        } else {
            setSelectedMediaIndices(submission.urls.map((_, i) => i));
        }
    };

    const handleRejectClick = async () => {
        if (!submission) return;
        try {
            await onReject(submission.id);
            onClose();
        } catch (error) {
            console.error(error);
        }
    };

    if (!submission) return null;

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-md" 
                    />
                    
                    {/* Modal */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative z-10 w-full max-w-6xl max-h-[90vh] bg-white/90 dark:bg-gray-900/40 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] sm:rounded-3xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 p-8 shrink-0">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-bold tracking-tight">
                                        {submission.productName || submission.sku ? `审核: ${submission.productName || submission.sku}` : '投稿详情审核'}
                                    </h2>
                                    {submission.status === 'approved' && (
                                        <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider">已批准</span>
                                    )}
                                    {submission.status === 'rejected' && (
                                        <span className="bg-destructive/10 text-destructive text-[10px] font-bold px-2 py-0.5 rounded-full border border-destructive/20 uppercase tracking-wider">已拒绝</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] uppercase font-bold tracking-wider">
                                    {submission.sku && <span className="text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">SKU: {submission.sku}</span>}
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-90"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
                                
                                {/* Left Column: Media Gallery */}
                                <div className="lg:col-span-3 space-y-6">
                                    <div className="flex items-center justify-between h-8 mb-6">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">媒体素材 ({submission.urls.length})</h3>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">已选 {selectedMediaIndices.length}</span>
                                        </div>
                                        <button 
                                            onClick={toggleSelectAll}
                                            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                        >
                                            {selectedMediaIndices.length === submission.urls.length ? "取消全选" : "全选"}
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 min-h-[420px] content-start">
                                        {submission.urls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((u, i) => {
                                            const originalIndex = (currentPage - 1) * itemsPerPage + i;
                                            const isItemSelected = selectedMediaIndices.includes(originalIndex);
                                            return (
                                                <div 
                                                    key={originalIndex} 
                                                    onClick={() => handleMediaClick(originalIndex, u)}
                                                    className={cn(
                                                        "aspect-4/5 rounded-2xl overflow-hidden border transition-all cursor-pointer relative group shadow-sm",
                                                        isItemSelected 
                                                            ? "ring-1 ring-primary border-primary scale-[0.98]" 
                                                            : "border-border/50 hover:scale-[1.02] active:scale-95"
                                                    )}
                                                >
                                                    {u.type === 'video' ? (
                                                        <video src={u.url} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Image src={u.url} alt="" fill className="object-cover" />
                                                    )}
                                                    
                                                    {/* Selection Checkbox - standard system style, slightly enlarged for usability */}
                                                    <div 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleMediaSelection(originalIndex);
                                                        }}
                                                        className={cn(
                                                            "absolute top-2.5 right-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all z-20 shadow-xl hover:scale-110",
                                                            isItemSelected 
                                                                ? "bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20" 
                                                                : "bg-black/20 dark:bg-black/40 border-white/50 backdrop-blur-sm"
                                                        )}
                                                    >
                                                        {isItemSelected && <Check size={14} strokeWidth={3.5} />}
                                                    </div>

                                                    <div className={cn(
                                                        "absolute inset-0 transition-colors z-10",
                                                        isItemSelected ? "bg-black/10" : "bg-transparent group-hover:bg-black/5"
                                                    )} />
                                                </div>
                                            );
                                        })}
                                        
                                        {/* Invisible placeholder slots to keep grid height stable on last page */}
                                        {Array.from({ length: Math.max(0, itemsPerPage - submission.urls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).length) }).map((_, i) => (
                                            <div key={`placeholder-${i}`} className="aspect-4/5" />
                                        ))}
                                    </div>

                                    {/* Pagination Controls */}
                                    {submission.urls.length > itemsPerPage && (
                                        <div className="flex items-center justify-center gap-6 pt-4">
                                            <button 
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1}
                                                className="p-2 rounded-full border border-black/5 dark:border-white/5 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <span className="text-sm font-bold font-mono">
                                                {currentPage} <span className="text-muted-foreground/50 mx-1">/</span> {Math.ceil(submission.urls.length / itemsPerPage)}
                                            </span>
                                            <button 
                                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(submission.urls.length / itemsPerPage), prev + 1))}
                                                disabled={currentPage === Math.ceil(submission.urls.length / itemsPerPage)}
                                                className="p-2 rounded-full border border-black/5 dark:border-white/5 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                            >
                                                <ChevronRight size={20} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Actions & Metadata */}
                                <div className="lg:col-span-2 space-y-8">
                                    {/* Metadata */}
                                    <div className="space-y-6">
                                        <div className="h-8 flex items-center mb-6">
                                            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">投稿信息</h3>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-colors">
                                                <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">投稿货号 (SKU)</p>
                                                <p className="font-mono text-lg font-medium text-foreground">{submission.sku || "未填写"}</p>
                                            </div>
                                            <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-primary/20 transition-colors">
                                                <p className="text-[10px] uppercase font-medium text-muted-foreground mb-1">投稿商品名称</p>
                                                <p className="text-base font-medium text-foreground leading-snug">{submission.productName || "未填写"}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Product Association */}
                                    <div className="space-y-4 pt-4 border-t border-white/5">
                                        <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                            关联正式商品
                                        </h3>
                                        
                                        <div 
                                            onClick={() => setIsProductSelectOpen(true)}
                                            className={`w-full p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                                                approvedProductId 
                                                ? "bg-primary/5 border-primary/30" 
                                                : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-primary/20 hover:bg-black/10 dark:hover:bg-white/10"
                                            }`}
                                        >
                                            <div className="flex items-center gap-4 relative z-10 w-full min-h-16">
                                                <div className={`h-16 w-16 rounded-xl flex items-center justify-center shrink-0 transition-colors overflow-hidden border border-border/50 ${
                                                    approvedProductId ? "bg-primary/5" : "bg-muted text-muted-foreground group-hover:text-primary"
                                                }`}>
                                                    {approvedProductImage ? (
                                                        <Image 
                                                            src={approvedProductImage} 
                                                            alt="Product" 
                                                            width={64} 
                                                            height={64} 
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <Package size={28} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1 flex flex-col justify-center py-1">
                                                    <p className={`text-[15px] font-medium line-clamp-2 leading-snug ${approvedProductId ? "text-primary" : "text-foreground"}`}>
                                                        {approvedProductId 
                                                            ? (approvedProductName || "已关联商品 (加载中...)") 
                                                            : "选择关联商品..."}
                                                    </p>
                                                    {!approvedProductId && (
                                                        <p className="text-[11px] text-muted-foreground mt-1 truncate font-mono">
                                                            点击搜索并关联数据库中的商品
                                                        </p>
                                                    )}
                                                </div>
                                                {approvedProductId && (
                                                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 ml-2">
                                                        <Check size={14} strokeWidth={3.5} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="pt-8 mt-auto grid grid-cols-2 gap-4">
                                        <button 
                                            onClick={handleRejectClick}
                                            className="h-14 rounded-2xl bg-destructive text-destructive-foreground text-base font-medium flex items-center justify-center gap-2 hover:bg-destructive/90 transition-all active:scale-95 shadow-lg shadow-destructive/10"
                                        >
                                            拒绝
                                        </button>
                                        <button 
                                            onClick={handleApproveClick}
                                            disabled={(!approvedProductId || selectedMediaIndices.length === 0) || (submission.status === 'approved' && approvedProductId === submission.productId && JSON.stringify([...selectedMediaIndices].sort()) === JSON.stringify([...(submission.selectedIndices || [])].sort()))}
                                            className="h-14 rounded-2xl bg-primary text-primary-foreground text-base font-medium flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale transition-all hover:-translate-y-1 active:scale-95"
                                        >
                                            {submission.status === 'approved' ? '更新批准' : '批准'} {selectedMediaIndices.length > 0 && `(${selectedMediaIndices.length})`}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <ProductSelectionModal 
                        isOpen={isProductSelectOpen}
                        onClose={() => setIsProductSelectOpen(false)}
                        singleSelect={true}
                        selectedIds={approvedProductId ? [approvedProductId] : []}
                        onSelect={(products) => {
                            if (products.length > 0) {
                                setApprovedProductId(products[0].id);
                                setApprovedProductName(products[0].name);
                                setApprovedProductImage(products[0].image || "");
                                showToast(`已选择商品: ${products[0].name}`, "success");
                            }
                        }}
                    />

                    {/* Full-screen Media Preview Overlay */}
                    <AnimatePresence>
                        {previewMedia && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-10000 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 cursor-zoom-out"
                                onClick={() => setPreviewMedia(null)}
                            >
                                <motion.div 
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="relative max-w-5xl max-h-full aspect-auto flex items-center justify-center"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {previewMedia.type === 'video' ? (
                                        <video 
                                            src={previewMedia.url} 
                                            controls 
                                            autoPlay 
                                            className="max-h-[85vh] rounded-2xl shadow-2xl" 
                                        />
                                    ) : (
                                        <div className="relative w-[90vw] h-[85vh] flex items-center justify-center">
                                            <Image 
                                                src={previewMedia.url} 
                                                alt="Preview" 
                                                fill
                                                className="rounded-2xl shadow-2xl object-contain" 
                                            />
                                        </div>
                                    )}

                                    {/* Overlay Close Button - Restored style, fixed position */}
                                    <button 
                                        onClick={() => setPreviewMedia(null)}
                                        className="fixed top-8 right-8 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-xl transition-all hover:scale-110 active:scale-90 z-10001"
                                    >
                                        <X size={24} strokeWidth={2.5} />
                                    </button>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </AnimatePresence>
    );

    return typeof document !== "undefined" 
        ? createPortal(modalContent, document.body) 
        : null;
}

// Re-export type if needed or keep it in Page
