"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Loader2, Package, Check, X, Tag } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

interface MeituanCandidateItem {
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

interface MeituanSelectPopoverProps {
  initialQuery?: string;
  batchId?: string;
  onSelect: (item: MeituanCandidateItem) => void;
  onClose: () => void;
}

export function MeituanSelectPopover({
  initialQuery = "",
  batchId,
  onSelect,
  onClose,
}: MeituanSelectPopoverProps) {
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, 250);
  const [results, setResults] = useState<MeituanCandidateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 聚焦输入框
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // 检索美团候选池
  const searchMeituan = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      try {
        setLoading(true);
        const params = new URLSearchParams({ query: q });
        if (batchId && batchId !== "ALL") {
          params.append("batchId", batchId);
        }
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
    [batchId]
  );

  useEffect(() => {
    searchMeituan(debouncedQuery);
  }, [debouncedQuery, searchMeituan]);

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2.5 z-[10010] w-96 rounded-3xl border border-border/80 dark:border-white/10 bg-card/98 dark:bg-[#0b111e]/98 backdrop-blur-2xl p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2 text-xs font-black text-foreground">
          <Tag className="h-4 w-4 text-amber-500" />
          <span>从美团数据池中选择商品</span>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 搜索输入框 */}
      <div className="relative mt-3 mb-2.5 group">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入美团品名 / 美团ID / 条码搜索..."
          className="w-full pl-10 pr-4 h-10 text-xs font-medium rounded-full bg-white dark:bg-white/5 border border-border/80 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all shadow-xs"
        />
      </div>

      {/* 搜索结果列表 */}
      <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>正在检索美团数据池...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {query.trim()
              ? "未在美团数据池中找到匹配的商品"
              : "输入关键词开始检索"}
          </div>
        ) : (
          results.map((item) => {
            const isAlreadyBound = item.status === "BOUND" && item.bindProduct;
            return (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                className={cn(
                  "flex items-start gap-2.5 p-2 rounded-xl border border-transparent hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition text-left group",
                  isAlreadyBound && "opacity-80"
                )}
              >
                <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/50">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-4 w-4 opacity-40" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-foreground group-hover:text-primary transition line-clamp-1">
                      {item.name}
                    </span>
                    {item.spec && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                        {item.spec}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                    <span className="font-mono bg-muted/80 px-1 py-0.2 rounded text-[10px] text-foreground font-medium">
                      ID: {item.meituanSkuId}
                    </span>
                    {item.barcode && (
                      <span className="font-mono text-[10px]">
                        条码: {item.barcode}
                      </span>
                    )}
                    {item.price !== null && (
                      <span className="font-number text-foreground font-semibold">
                        ¥{item.price}
                      </span>
                    )}
                  </div>

                  {isAlreadyBound && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      ⚠️ 已关联到: {item.bindProduct?.name} (
                      {item.bindProduct?.sku || "无SKU"})，点击将重新分配
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
