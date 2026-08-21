"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Package,
  LayoutGrid,
  List,
  Loader2,
  Check,
  Tag,
  Store,
  Sparkles,
  Link2,
  CheckCircle2,
  Filter,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { cn } from "@/lib/utils";

export interface MeituanCandidateItem {
  id: string;
  batchId: string;
  meituanSkuId: string;
  meituanSpuId?: string | null;
  name: string;
  spec?: string | null;
  barcode?: string | null;
  price?: number | null;
  imageUrl?: string | null;
  status: string;
  bindProduct?: {
    id: string;
    name: string;
    sku: string | null;
  } | null;
}

interface ImportBatch {
  id: string;
  fileName: string;
  totalCount: number;
  matchedCount: number;
}

interface MeituanProductSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetProduct: {
    id: string;
    name: string;
    sku: string | null;
    image?: string | null;
  } | null;
  batches: ImportBatch[];
  currentBatchId?: string;
  platform?: string;
  platformLabel?: string;
  onSelect: (item: MeituanCandidateItem) => void;
}

export function MeituanProductSelectionModal({
  isOpen,
  onClose,
  targetProduct,
  batches,
  currentBatchId = "ALL",
  platform = "meituan",
  platformLabel = "美团",
  onSelect,
}: MeituanProductSelectionModalProps) {
  const [selectedBatchId, setSelectedBatchId] = useState(currentBatchId);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "UNBOUND" | "BOUND">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [results, setResults] = useState<MeituanCandidateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const inputRef = useRef<HTMLInputElement>(null);

  // 初始化设置搜索词为目标商品名
  useEffect(() => {
    if (isOpen && targetProduct) {
      setSearchQuery(targetProduct.name || "");
      setSelectedBatchId(currentBatchId);
      setFilterStatus("ALL");
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, targetProduct, currentBatchId]);

  // 检索美团候选数据池
  const searchMeituan = useCallback(
    async (q: string, batchId: string, status: "ALL" | "UNBOUND" | "BOUND") => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (q.trim()) params.append("query", q.trim());
        if (batchId && batchId !== "ALL") params.append("batchId", batchId);
        params.append("platform", platform);
        if (status !== "ALL") params.append("filterStatus", status);

        const res = await fetch(
          `/api/meituan-mapping/search-meituan-pool?${params.toString()}`
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.items || []);
        }
      } catch (err) {
        console.error("搜索美团数据池失败", err);
      } finally {
        setLoading(false);
      }
    },
    [platform]
  );

  useEffect(() => {
    if (isOpen) {
      searchMeituan(debouncedSearch, selectedBatchId, filterStatus);
    }
  }, [isOpen, debouncedSearch, selectedBatchId, filterStatus, searchMeituan]);

  if (!isOpen || !targetProduct) return null;

  const unboundCount = results.filter((r) => r.status !== "BOUND").length;
  const boundCount = results.filter((r) => r.status === "BOUND").length;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10015] flex items-center justify-center bg-black/60 dark:bg-[#080c16]/75 backdrop-blur-md p-3 sm:p-6 md:p-8 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-5xl h-[88vh] max-h-[88vh] rounded-[28px] sm:rounded-[36px] border border-border/80 dark:border-white/10 bg-card/98 dark:bg-[#0b111e]/98 backdrop-blur-2xl shadow-2xl overflow-hidden"
        >
          {/* 装饰光晕背景 */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 dark:bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* 1. 顶部 Header */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 sm:px-8 py-4 sm:py-5 border-b border-border/60 dark:border-white/10 bg-muted/20 dark:bg-white/[0.02] shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 sm:h-12 w-11 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
                <Tag className="h-5 sm:h-6 w-5 sm:w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-foreground">
                    挑选{platformLabel}商品进行配对
                  </h3>
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-black bg-primary/10 text-primary border border-primary/20">
                    <span>目标: {targetProduct.name}</span>
                    {targetProduct.sku && (
                      <span className="font-mono opacity-80 font-bold">
                        ({targetProduct.sku})
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  从已导入的{platformLabel}数据池中挑选商品，点击直接将{platformLabel}商品 ID 赋给当前系统商品
                </p>
              </div>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="h-10 w-10 flex items-center justify-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all self-end sm:self-auto"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* 2. 工具栏：搜索、美团批次、配对状态分类筛选与视图模式 */}
          <div className="relative z-10 flex flex-col gap-3 px-6 sm:px-8 py-3.5 border-b border-border/60 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.01] shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* 搜索框 */}
              <div className="relative flex-1 min-w-[240px] group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索美团品名 / 美团ID / 条形码..."
                  className="w-full pl-11 pr-10 h-10 sm:h-11 text-xs sm:text-sm rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all shadow-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-full"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* 批次选择 */}
              <div className="w-48 sm:w-56 h-10 sm:h-11">
                <CustomSelect
                  value={selectedBatchId}
                  onChange={setSelectedBatchId}
                  options={[
                    { value: "ALL", label: "全部美团数据" },
                    ...batches.map((b) => ({
                      value: b.id,
                      label: b.fileName,
                    })),
                  ]}
                  placeholder="筛选数据批次"
                  triggerClassName="h-10 sm:h-11 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 text-xs font-bold text-foreground hover:border-primary/40 transition-all shadow-xs truncate"
                />
              </div>

              {/* 配对分类分段胶囊 */}
              <div className="flex items-center gap-1 p-1 bg-muted/60 dark:bg-white/10 rounded-full border border-border/50 dark:border-white/10 shrink-0 shadow-inner">
                {[
                  { key: "ALL", label: "全部" },
                  { key: "UNBOUND", label: "未配对" },
                  { key: "BOUND", label: "已配对" },
                ].map((tab) => {
                  const isActive = filterStatus === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilterStatus(tab.key as any)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer",
                        isActive
                          ? "bg-white dark:bg-white/20 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 视图切换按钮：大图网格 / 列表 */}
              <div className="flex items-center p-1 bg-muted/60 dark:bg-white/10 rounded-full border border-border/50 dark:border-white/10 shrink-0 shadow-inner">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  title="大图网格"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer",
                    viewMode === "grid"
                      ? "bg-white dark:bg-white/20 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">大图</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  title="列表视图"
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer",
                    viewMode === "list"
                      ? "bg-white dark:bg-white/20 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">列表</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3. 候选美团商品展示区 */}
          <div className="relative z-10 flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-28 text-muted-foreground gap-3.5">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-bold">正在检索美团候选数据池...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-28 text-center space-y-3">
                <div className="p-4 rounded-3xl bg-muted/60 dark:bg-[#111827] text-muted-foreground">
                  <Package className="h-10 w-10 opacity-40" />
                </div>
                <div>
                  <h4 className="text-base font-black text-foreground">
                    未在美团候选池中找到匹配的商品
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    可以尝试修改上方搜索关键词，或切换“全部/未配对”筛选
                  </p>
                </div>
              </div>
            ) : viewMode === "grid" ? (
              /* ===== 大图网格模式（缩略图+名称） ===== */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {results.map((item) => {
                  const isBound = item.status === "BOUND" && item.bindProduct;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className={cn(
                        "group relative flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border transition-all duration-200 cursor-pointer text-left shadow-xs hover:shadow-xl hover:-translate-y-1 active:scale-[0.98]",
                        isBound
                          ? "border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-950/[0.08]"
                          : "border-border/70 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-primary/50"
                      )}
                    >
                      {/* 缩略大图 */}
                      <div className="relative aspect-square w-full overflow-hidden bg-muted/50 dark:bg-[#080c16] border-b border-border/50 dark:border-white/5">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Package className="h-10 w-10 opacity-30" />
                          </div>
                        )}

                        {/* 价格徽章 */}
                        {item.price !== undefined && item.price !== null && (
                          <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white font-number text-xs font-black shadow-md">
                            ¥{item.price}
                          </div>
                        )}

                        {/* 配对完成标记 */}
                        {isBound ? (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600/90 backdrop-blur-md text-white text-[10px] font-black shadow-md">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>已配对</span>
                          </div>
                        ) : (
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/40 backdrop-blur-md text-white/80 text-[10px] font-bold">
                            待配对
                          </div>
                        )}
                      </div>

                      {/* 文本信息 */}
                      <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-black text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {item.name}
                          </h4>
                          {item.spec && (
                            <span className="inline-block text-[10px] font-bold bg-muted dark:bg-white/10 px-2 py-0.5 rounded-md text-muted-foreground mt-1">
                              {item.spec}
                            </span>
                          )}
                        </div>

                        {/* 绑定状态说明与选择指引 */}
                        <div className="pt-2 border-t border-border/40 dark:border-white/5 space-y-1">
                          {isBound ? (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate">
                              已绑定: {item.bindProduct?.name} ({item.bindProduct?.sku || "无SKU"})
                            </p>
                          ) : (
                            <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                              <span className="font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md text-[10px] truncate">
                                ID: {item.meituanSkuId}
                              </span>
                              <span className="text-[11px] font-black text-primary group-hover:underline">
                                选用此ID →
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ===== 列表紧凑模式 ===== */
              <div className="space-y-2.5">
                {results.map((item) => {
                  const isBound = item.status === "BOUND" && item.bindProduct;
                  return (
                    <div
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className={cn(
                        "group flex items-center justify-between gap-4 p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer text-left shadow-xs hover:shadow-md",
                        isBound
                          ? "border-emerald-500/40 bg-emerald-500/[0.03] dark:bg-emerald-950/[0.08]"
                          : "border-border/70 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-primary/50 hover:bg-primary/[0.02]"
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* 缩略图 */}
                        <div className="relative h-14 w-14 shrink-0 rounded-2xl overflow-hidden bg-muted border border-border/60 shadow-inner">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <Package className="h-6 w-6 opacity-30" />
                            </div>
                          )}
                        </div>

                        {/* 信息 */}
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground group-hover:text-primary transition-colors">
                              {item.name}
                            </span>
                            {item.spec && (
                              <span className="text-[10px] font-bold bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                {item.spec}
                              </span>
                            )}
                            {isBound && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>已配对: {item.bindProduct?.name}</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            <span className="font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md text-xs">
                              美团ID: {item.meituanSkuId}
                            </span>
                            {item.barcode && (
                              <span className="font-mono text-[11px]">
                                条码: {item.barcode}
                              </span>
                            )}
                            {item.price !== undefined && item.price !== null && (
                              <span className="font-number font-black text-foreground">
                                ¥{item.price}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <button
                        type="button"
                        className={cn(
                          "px-5 h-9 rounded-full text-xs font-black transition-all shadow-sm shrink-0",
                          isBound
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        {isBound ? "重新关联" : "选择此项"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
