/*
 * @Date: 2026-02-14 22:47:58
 * @Author: Sube
 * @FilePath: SubmissionCard.tsx
 * @LastEditTime: 2026-02-15 00:30:40
 * @Description: 
 */
"use client";

import { motion } from "framer-motion";
import { Clock, Play, AlertCircle, Plus } from "lucide-react";
import Image from "next/image";
import { Submission } from "./SubmissionsReviewPage";

interface SubmissionCardProps {
    submission: Submission;
    onClick: (submission: Submission) => void;
}

export function SubmissionCard({ submission, onClick }: SubmissionCardProps) {
    const mainMedia = submission.urls[0];
    const isVideo = mainMedia?.type === 'video';

    return (
        <motion.div
            layout
            onClick={() => onClick(submission)}
            className="group relative flex flex-col md:grid md:grid-cols-6 gap-3 md:gap-4 p-3 rounded-2xl transition-all duration-300 bg-white dark:bg-white/5 border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 cursor-pointer md:items-center"
        >
            {/* Media + Info (Column 1-3) */}
            <div className="md:col-span-3 flex items-center gap-3 md:gap-4 min-w-0">
                {/* Thumbnail Preview */}
                <div className="relative h-14 w-14 md:h-16 md:w-16 shrink-0 overflow-hidden rounded-xl bg-secondary/30 border border-border/50 shadow-inner">
                    {isVideo ? (
                        <div className="w-full h-full relative">
                            <video 
                                src={mainMedia.url} 
                                className="w-full h-full object-cover"
                                muted
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                                <Play size={14} className="text-white fill-current drop-shadow-lg" />
                            </div>
                        </div>
                    ) : (
                        mainMedia ? (
                            <Image
                                src={mainMedia.url}
                                alt="Submission"
                                fill
                                className="object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                                <AlertCircle size={20} />
                            </div>
                        )
                    )}
                </div>

                {/* Product Info */}
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm md:text-base text-foreground truncate group-hover:text-primary transition-colors pr-2">
                        {submission.productName || "未填写商品名称"}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] font-mono text-primary/80 truncate uppercase bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                            {submission.sku ? `SKU: ${submission.sku}` : "无货号"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Desktop Only Columns */}
            {/* Status (Column 4) */}
            <div className="hidden md:flex md:col-span-1 items-center justify-center">
                <StatusBadge status={submission.status} />
            </div>

            {/* Time (Column 5) */}
            <div className="hidden md:flex md:col-span-1 items-center justify-center gap-1.5 text-muted-foreground">
                <Clock size={12} className="opacity-70" />
                <span className="font-mono text-[10px] tracking-tight">{new Date(submission.createdAt).toLocaleDateString()}</span>
            </div>

            {/* Action (Column 6) */}
            <div className="hidden md:flex md:col-span-1 justify-center">
                <div className="h-9 w-9 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary group-hover:scale-110 transition-all shadow-sm">
                    <Plus size={18} />
                </div>
            </div>

            {/* Mobile Only Footer Row */}
            <div className="md:hidden flex items-center justify-between pt-2 border-t border-border/40 mt-1">
                <div className="flex items-center gap-2">
                    <StatusBadge status={submission.status} />
                    <div className="flex items-center gap-1.5 text-muted-foreground pl-2 border-l border-border/50">
                        <Clock size={12} className="opacity-70" />
                        <span className="font-mono text-[10px]">{new Date(submission.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
                <div className="flex items-center text-primary/40">
                    <span className="text-[10px] font-medium mr-1">查看详情</span>
                    <Plus size={14} />
                </div>
            </div>
        </motion.div>
    );
}

// Helper component for cleaner code
function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shadow-sm shrink-0 uppercase tracking-tight ${
            status === 'approved' 
                ? 'bg-green-500/10 text-green-600 border-green-500/20'
                : status === 'rejected' 
                ? 'bg-red-500/10 text-red-600 border-red-500/20'
                : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
        }`}>
            {status === 'approved' ? '已批准' : status === 'rejected' ? '已拒绝' : '待审核'}
        </span>
    );
}
