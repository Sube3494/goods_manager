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
            className="group relative md:grid md:grid-cols-6 flex flex-col gap-4 p-3 rounded-2xl transition-all duration-300 bg-white/40 dark:bg-white/5 border border-border/50 hover:border-primary/30 hover:bg-white dark:hover:bg-white/10 hover:shadow-lg hover:shadow-primary/5 cursor-pointer items-center"
        >
            {/* Media + Info (Column 1-3) */}
            <div className="md:col-span-3 flex items-center gap-4 w-full">
                {/* Thumbnail Preview */}
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary/30 border border-border/50 shadow-inner">
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
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors pr-4">
                        {submission.productName || "未填写商品名称"}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] font-mono text-primary/80 truncate uppercase bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                            {submission.sku ? `SKU: ${submission.sku}` : "无货号"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Status Column (Column 4) */}
            <div className="md:col-span-1 flex items-center justify-between md:justify-center text-xs w-full">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border shadow-sm shrink-0 uppercase tracking-tighter ${
                    submission.status === 'approved' 
                        ? 'bg-green-500/10 text-green-600 border-green-500/20'
                        : submission.status === 'rejected' 
                        ? 'bg-red-500/10 text-red-600 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                }`}>
                    {submission.status === 'approved' ? '已批准' : submission.status === 'rejected' ? '已拒绝' : '待审核'}
                </span>
                
                {/* Mobile Only Meta */}
                <div className="md:hidden flex items-center gap-1.5 text-muted-foreground/60">
                    <Clock size={12} />
                    <span className="font-mono text-[10px]">{new Date(submission.createdAt).toLocaleDateString()}</span>
                    <Plus size={16} className="ml-2 text-primary/30" />
                </div>
            </div>

            {/* Time Column (Column 5) */}
            <div className="md:col-span-1 hidden md:flex items-center justify-center gap-1.5 text-muted-foreground/60 w-full">
                <Clock size={12} className="text-muted-foreground/40" />
                <span className="font-mono text-[10px] tracking-tight">{new Date(submission.createdAt).toLocaleDateString()}</span>
            </div>

            {/* Action Indicator (Column 6) */}
            <div className="md:col-span-1 hidden md:flex justify-center w-full">
                <div className="h-9 w-9 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary group-hover:scale-110 transition-all shadow-sm">
                    <Plus size={18} />
                </div>
            </div>
        </motion.div>
    );
}
