"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, Filter } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { SubmissionCard } from "./SubmissionCard";
import { SubmissionReviewModal } from "./SubmissionReviewModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";

export interface Submission {
    id: string;
    urls: { url: string; type: 'image' | 'video' }[];
    sku?: string;
    productName?: string;
    productId?: string;
    selectedIndices?: number[];
    status: string;
    createdAt: string;
}

export function SubmissionsReviewPage() {
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    
    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("pending"); // Default to pending

    const { user, isLoading: isUserLoading } = useUser();
    const { showToast } = useToast();

    const fetchSubmissions = useCallback(async () => {
        if (!user || !hasPermission(user as SessionUser, "gallery:audit")) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/gallery/submissions?status=${statusFilter}`);
            if (res.ok) {
                const data = await res.json();
                setSubmissions(data);
            }
        } catch {
            console.error("Failed to fetch submissions");
            showToast("加载失败", "error");
        } finally {
            setIsLoading(false);
        }
    }, [showToast, statusFilter, user]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    // Filter logic
    useEffect(() => {
        let result = submissions;

        // Status Filter
        if (statusFilter !== 'all') {
            result = result.filter(s => s.status === statusFilter);
        }

        // Search Filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s => 
                (s.sku && s.sku.toLowerCase().includes(query)) ||
                (s.productName && s.productName.toLowerCase().includes(query))
            );
        }

        setFilteredSubmissions(result);
    }, [submissions, searchQuery, statusFilter]);



    const handleCardClick = (submission: Submission) => {
        setSelectedSubmission(submission);
        setIsReviewModalOpen(true);
    };

    const handleApprove = async (id: string, productId: string, selectedMediaIndices?: number[]) => {
        try {
            const res = await fetch(`/api/gallery/submissions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "approved",
                    productId: productId,
                    selectedIndices: selectedMediaIndices
                })
            });

            if (res.ok) {
                showToast("已批准并关联至商品", "success");
                fetchSubmissions(); // Refresh list to update status/remove from pending
            } else {
                throw new Error("Failed");
            }
        } catch {
            showToast("操作失败", "error");
            throw new Error("Failed");
        }
    };

    const handleReject = async (id: string) => {
        try {
            const res = await fetch(`/api/gallery/submissions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "rejected",
                    notes: "不符合要求"
                })
            });

            if (res.ok) {
                showToast("已拒绝提交", "success");
                fetchSubmissions();
            } else {
                throw new Error("Failed");
            }
        } catch {
            showToast("操作失败", "error");
            throw new Error("Failed");
        }
    };

    if (isUserLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <RefreshCw className="animate-spin text-primary" size={40} />
                <p className="text-muted-foreground animate-pulse text-sm">正在核验访问许可...</p>
            </div>
        );
    }

    if (!user || !hasPermission(user as SessionUser, "gallery:audit")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-2">
                    <ShieldAlert size={40} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-foreground">访问受限</h2>
                    <p className="text-muted-foreground mt-2 max-w-sm">
                        此页面仅限具备实拍审核权限的管理员访问。请先登录或联系超级管理员分配权限。
                    </p>
                </div>
                <button 
                    onClick={() => window.location.href = "/login"}
                    className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg hover:scale-105 transition-all outline-none"
                >
                    立即登录
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header section with unified style */}
            <div className="flex items-start justify-between mb-6 sm:mb-8 transition-all relative z-10 gap-4">
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">实拍审核</h1>
                    <p className="text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
                        {isLoading ? "正在加载投稿..." : `管理用户提交的实拍图片与视频资源 (${submissions.length} 项)`}
                    </p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0 self-start mt-1 sm:mt-2">
                    <button 
                        onClick={fetchSubmissions}
                        disabled={isLoading}
                        className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-all active:rotate-180 duration-500"
                        title="刷新列表"
                    >
                        <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-row gap-2">
                <div className="h-10 sm:h-11 px-4 sm:px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-2 sm:gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 shrink-0">
                    <Search size={16} className="text-muted-foreground shrink-0" />
                    <input
                        type="text"
                        placeholder="搜索(SKU)或名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-[13px] sm:text-sm h-full"
                    />
                </div>
                
                <div className="w-[100px] sm:w-48 h-10 sm:h-11">
                     <CustomSelect 
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                            { value: 'pending', label: '待审核' },
                            { value: 'all', label: '所有' },
                            { value: 'approved', label: '已准' },
                            { value: 'rejected', label: '已拒' }
                        ]}
                        className="h-full"
                        triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-[13px] sm:text-sm py-0 px-3"
                    />
                </div>
            </div>

            {/* Content List */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-20 w-full rounded-2xl bg-muted/10 animate-pulse border border-border/50" />
                    ))}
                </div>
            ) : filteredSubmissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 border border-dashed border-border rounded-3xl bg-muted/5">
                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground/30">
                        <Filter size={32} />
                    </div>
                    <p className="text-lg font-bold text-muted-foreground">没有找到符合条件的投稿</p>
                    <p className="text-sm text-muted-foreground/50">尝试更改搜索条件或筛选状态</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* List Header - Perfect alignment with Card Row */}
                    <div className="hidden md:grid grid-cols-6 gap-4 px-3 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border mb-2 bg-muted/5 rounded-t-2xl">
                        <div className="col-span-3 flex gap-4 pl-3">素材与商品信息</div>
                        <div className="text-center">审核状态</div>
                        <div className="text-center">提交时间</div>
                        <div className="text-center">操作</div>
                    </div>
                    
                    <div className="space-y-2">
                        {filteredSubmissions.map((sub) => (
                            <SubmissionCard 
                                key={sub.id} 
                                submission={sub} 
                                onClick={handleCardClick} 
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Review Modal */}
            <SubmissionReviewModal 
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                submission={selectedSubmission}
                onApprove={handleApprove}
                onReject={handleReject}
            />
        </div>
    );
}
