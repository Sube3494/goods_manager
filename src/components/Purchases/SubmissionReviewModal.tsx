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
    const [itemsPerPage, setItemsPerPage] = useState(6);
    useEffect(() => {
        const handleResize = () => {
            const newItemsPerPage = window.innerWidth < 768 ? 4 : 6;
            setItemsPerPage(newItemsPerPage);
            // Reset to page 1 on resize to avoid out-of-bounds page issues
            setCurrentPage(1);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
    const { showToast } = useToast();

    // Derived state / render-time update pattern to avoid useEffect cascading renders
    const [prevSubmissionId, setPrevSubmissionId] = useState<string | null>(null);
    const [prevIsOpen, setPrevIsOpen] = useState(false);

    if (isOpen && submission && submission.id !== prevSubmissionId) {
        setPrevSubmissionId(submission.id);
        setPrevIsOpen(true);
        // Initialize state from submission data
        setApprovedProductId(submission.productId || "");
        if (submission.selectedIndices && Array.isArray(submission.selectedIndices)) {
            setSelectedMediaIndices(submission.selectedIndices);
        } else {
            setSelectedMediaIndices([]);
        }
        setCurrentPage(1);
        setPreviewMedia(null);
    }

    if (!isOpen && prevIsOpen) {
        setPrevIsOpen(false);
        setPrevSubmissionId(null);
        // Reset all ephemeral state
        setApprovedProductId("");
        setApprovedProductName("");
        setApprovedProductImage("");
        setSelectedMediaIndices([]);
        setCurrentPage(1);
        setPreviewMedia(null);
    }

    // Fetch product name when ID changes
    useEffect(() => {
        if (!approvedProductId) {
            return;
        }

        let isCancelled = false;
        fetch(`/api/products/${approvedProductId}`)
            .then(res => res.json())
            .then(data => {
                if (!isCancelled && data) {
                    if (data.name) setApprovedProductName(data.name);
                    if (data.image) setApprovedProductImage(data.image);
                }
            })
            .catch(err => console.error("Error fetching product data:", err));

        return () => { isCancelled = true; };
    }, [approvedProductId]);

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
                        className="relative z-10 w-full max-w-6xl max-h-[90vh] bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl md:rounded-3xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 md:p-6 shrink-0">
                            <h2 className="text-lg md:text-xl font-bold tracking-tight">投稿详情审核</h2>
                            <button 
                                onClick={onClose}
                                className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-90"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content Container - Flex Col on Mobile, Row on Desktop */}
                        <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
                            
                            {/* Left Column (Desktop) / Bottom (Mobile): Media Gallery */}
                            <div className="flex-1 p-4 md:p-8 custom-scrollbar order-2 md:order-1 shrink-0 md:overflow-y-auto">
                                <div className="max-w-5xl mx-auto space-y-6 h-full flex flex-col">
                                    <div className="flex items-center justify-between h-8 shrink-0">
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

                                    <div className="flex-1 min-h-0">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 content-start pb-4">
                                            {(() => {
                                                const currentItems = submission.urls.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
                                                const emptySlots = itemsPerPage - currentItems.length;
                                                
                                                return (
                                                    <>
                                                        {currentItems.map((u, i) => {
                                                            const originalIndex = (currentPage - 1) * itemsPerPage + i;
                                                            const isItemSelected = selectedMediaIndices.includes(originalIndex);
                                                            return (
                                                                <div 
                                                                    key={originalIndex} 
                                                                    onClick={() => handleMediaClick(originalIndex, u)}
                                                                    className={cn(
                                                                        "aspect-square rounded-2xl overflow-hidden border transition-all cursor-pointer relative group shadow-sm bg-white dark:bg-white/5",
                                                                        isItemSelected 
                                                                            ? "ring-2 ring-primary border-primary scale-[0.98]" 
                                                                            : "border-border/50 hover:scale-[1.02] active:scale-95"
                                                                    )}
                                                                >
                                                                    {u.type === 'video' ? (
                                                                        <video src={u.url} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <Image src={u.url} alt="" fill className="object-cover" />
                                                                    )}
                                                                    
                                                                    {/* Selection Checkbox */}
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
                                                                        {isItemSelected && <Check size={14} strokeWidth={2} />}
                                                                    </div>

                                                                    <div className={cn(
                                                                        "absolute inset-0 transition-colors z-10",
                                                                        isItemSelected ? "bg-black/10" : "bg-transparent group-hover:bg-black/5"
                                                                    )} />
                                                                </div>
                                                            );
                                                        })}
                                                        {/* Render empty placeholders to maintain grid height on Desktop */}
                                                        {Array.from({ length: emptySlots }).map((_, i) => (
                                                            <div key={`empty-${i}`} className="hidden md:block aspect-square" aria-hidden="true" />
                                                        ))}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Pagination Controls - Always render on PC for layout stability, conditional on Mobile */}
                                    <div className={cn(
                                        "items-center justify-center gap-6 pt-2 pb-6 shrink-0",
                                        submission.urls.length > itemsPerPage ? "flex" : "hidden md:flex opacity-50 pointer-events-none"
                                    )}>
                                        <button 
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-full border border-black/5 dark:border-white/5 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10 transition-colors bg-white dark:bg-white/5"
                                        >
                                            <ChevronLeft size={20} />
                                        </button>
                                        <span className="text-sm font-bold font-mono">
                                            {currentPage} <span className="text-muted-foreground/50 mx-1">/</span> {Math.max(1, Math.ceil(submission.urls.length / itemsPerPage))}
                                        </span>
                                        <button 
                                            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(submission.urls.length / itemsPerPage), prev + 1))}
                                            disabled={currentPage === Math.ceil(submission.urls.length / itemsPerPage)}
                                            className="p-2 rounded-full border border-black/5 dark:border-white/5 disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/10 transition-colors bg-white dark:bg-white/5"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column (Desktop) / Top (Mobile): Info & Sidebar */}
                            <div className="w-full md:w-[360px] lg:w-[400px] shrink-0 flex flex-col order-1 md:order-2 h-auto md:h-full md:overflow-hidden">
                                <div className="flex-1 md:overflow-y-auto p-4 md:p-8 custom-scrollbar">
                                    <div className="space-y-6 md:space-y-8 h-full flex flex-col">
                                        
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between h-8 shrink-0">
                                                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                                    投稿信息
                                                </h3>
                                                <div className="flex gap-2">
                                                    {submission.status === 'approved' && (
                                                        <span className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-wider whitespace-nowrap">已批准</span>
                                                    )}
                                                    {submission.status === 'rejected' && (
                                                        <span className="bg-destructive/10 text-destructive text-[10px] font-bold px-2 py-0.5 rounded-full border border-destructive/20 uppercase tracking-wider whitespace-nowrap">已拒绝</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-border/60 shadow-sm hover:border-primary/20 transition-all">
                                                    <p className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-1 tracking-tight">投稿货号 (SKU)</p>
                                                    <p className="font-mono text-base font-bold text-foreground break-all">{submission.sku || "未填写"}</p>
                                                </div>
                                                <div className="p-4 rounded-2xl bg-white dark:bg-white/5 border border-border/60 shadow-sm hover:border-primary/20 transition-all">
                                                    <p className="text-[10px] uppercase font-bold text-muted-foreground/60 mb-1 tracking-tight">投稿商品原名</p>
                                                    <p className="text-sm font-bold text-foreground leading-snug line-clamp-4">{submission.productName || "未填写"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Product Association */}
                                    <div className="space-y-4 md:space-y-6">
                                        <div className="flex items-center justify-between h-8 shrink-0">
                                            <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                                                关联正式商品
                                            </h3>
                                        </div>    <div 
                                                onClick={() => setIsProductSelectOpen(true)}
                                                className="w-full p-4 rounded-2xl border border-border/60 bg-white dark:bg-white/5 shadow-sm transition-all cursor-pointer relative overflow-hidden group flex flex-col justify-center hover:border-primary/20 hover:bg-zinc-50 dark:hover:bg-white/10"
                                            >
                                                <div className="flex items-center gap-4 relative z-10 w-full">
                                                    <div className={`h-14 w-14 rounded-xl flex items-center justify-center shrink-0 transition-colors overflow-hidden border border-border/50 bg-white dark:bg-black/20 ${
                                                        approvedProductId ? "border-primary/20 shadow-sm shadow-primary/5" : "text-muted-foreground group-hover:text-primary"
                                                    }`}>
                                                        {approvedProductImage ? (
                                                            <Image 
                                                                src={approvedProductImage} 
                                                                alt="Product" 
                                                                width={56} 
                                                                height={56} 
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <Package size={24} />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1 flex flex-col justify-center py-1">
                                                        <p className={`text-sm font-bold line-clamp-2 leading-tight ${approvedProductId ? "text-primary" : "text-foreground"}`}>
                                                            {approvedProductId 
                                                                ? (approvedProductName || "已关联商品") 
                                                                : "点击关联正式商品..."}
                                                        </p>
                                                        {!approvedProductId && (
                                                            <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                                                                自动同步素材至商品库
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions Footer - Inside Sidebar (Desktop Only) */}
                                <div className="hidden md:block p-4 md:p-6 pt-2 md:pt-4 border-t border-border/30 shrink-0 bg-white dark:bg-transparent">
                                    {/* Action Buttons */}
                                    <div className="grid grid-cols-2 gap-3 md:gap-4">
                                        <button 
                                            onClick={handleRejectClick}
                                            className="h-11 md:h-12 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                                        >
                                            拒绝
                                        </button>
                                        <button 
                                            onClick={handleApproveClick}
                                        disabled={(!approvedProductId || selectedMediaIndices.length === 0) || (submission.status === 'approved' && approvedProductId === submission.productId && JSON.stringify([...selectedMediaIndices].sort()) === JSON.stringify([...(submission.selectedIndices || [])].sort()))}
                                        className="h-11 md:h-12 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale transition-all hover:-translate-y-1 active:scale-95"
                                    >
                                        {submission.status === 'approved' ? '更新' : '批准'} {selectedMediaIndices.length > 0 && `(${selectedMediaIndices.length})`}
                                    </button>
                                    </div>
                                </div>
                            </div>

                            {/* Mobile Actions Footer - Order 3 */}
                             <div className="md:hidden p-4 pt-0 shrink-0 order-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={handleRejectClick}
                                        className="h-11 rounded-xl bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors"
                                    >
                                        拒绝
                                    </button>
                                    <button 
                                        onClick={handleApproveClick}
                                        disabled={(!approvedProductId || selectedMediaIndices.length === 0) || (submission.status === 'approved' && approvedProductId === submission.productId && JSON.stringify([...selectedMediaIndices].sort()) === JSON.stringify([...(submission.selectedIndices || [])].sort()))}
                                        className="h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
                                    >
                                        {submission.status === 'approved' ? '更新' : '批准'} {selectedMediaIndices.length > 0 && `(${selectedMediaIndices.length})`}
                                    </button>
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
