"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, Check, Package, X } from "lucide-react";
import Image from "next/image";

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  image: string | null;
  costPrice: number;
  specs?: any;
}

interface ProductSelectPopoverProps {
  onSelect: (product: ProductOption) => void;
  onClose: () => void;
  initialQuery?: string;
}

export function ProductSelectPopover({
  onSelect,
  onClose,
  initialQuery = "",
}: ProductSelectPopoverProps) {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // 搜索商品
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/meituan-mapping/search-products?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setProducts(data.products || []);
          }
        }
      } catch (err) {
        console.error("搜索失败", err);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 z-50 w-96 rounded-xl border border-border bg-card/95 backdrop-blur-md p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="输入自编SKU / 品名 / 拼音..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-muted/50 border border-input focus:outline-none focus:ring-1 focus:ring-primary focus:bg-background transition"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 max-h-64 overflow-y-auto space-y-1 divide-y divide-border/20 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>正在检索商品库...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground">
            未找到相关系统商品
          </div>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelect(p)}
              className="group flex items-center gap-3 p-2 rounded-lg hover:bg-primary/10 hover:border-primary/30 border border-transparent cursor-pointer transition"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted border border-border/50">
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Package className="h-5 w-5 opacity-40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-xs text-foreground truncate">
                    {p.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-mono bg-muted/80 px-1 py-0.5 rounded text-[10px] text-primary">
                    SKU: {p.sku || "未设置"}
                  </span>
                  {p.costPrice !== undefined && (
                    <span>成本: ¥{p.costPrice}</span>
                  )}
                </div>
              </div>
              <span className="text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition">
                绑定
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
