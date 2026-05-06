"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Loader2,
  MessageCircleQuestion,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

interface ProductFaqItem {
  id: string;
  question: string;
  answer: string;
}

interface ProductFaqGroup {
  productId: string;
  productName: string;
  sku?: string | null;
  image?: string | null;
  categoryName?: string;
  faq: ProductFaqItem[];
  canEdit: boolean;
}

interface ProductFaqPanelProps {
  showBackLink?: boolean;
  compactHeader?: boolean;
}

function createFaqItem(): ProductFaqItem {
  return {
    id: `faq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    question: "",
    answer: "",
  };
}

function normalizeFaq(items: ProductFaqItem[]) {
  return items
    .map((item) => ({
      ...item,
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question || item.answer);
}

export function ProductFaqPanel({ showBackLink = true, compactHeader = false }: ProductFaqPanelProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<ProductFaqGroup[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [canEditAny, setCanEditAny] = useState(false);
  const [editing, setEditing] = useState<Record<string, ProductFaqItem[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let ignore = false;

    async function loadFaq() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery) params.set("search", debouncedQuery);
        params.set("includeEmpty", "true");
        params.set("pageSize", "500");

        const res = await fetch(`/api/gallery/faq?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load FAQ");
        const data = await res.json();

        if (!ignore) {
          setItems(data.items || []);
          setCanEditAny(Boolean(data.canEditAny));
          setEditing({});
        }
      } catch (error) {
        console.error(error);
        if (!ignore) showToast("商品问答加载失败", "error");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadFaq();
    return () => {
      ignore = true;
    };
  }, [debouncedQuery, showToast]);

  const stats = useMemo(() => {
    const productCount = items.filter((item) => item.faq.length > 0).length;
    const faqCount = items.reduce((sum, item) => sum + item.faq.length, 0);
    return { productCount, faqCount };
  }, [items]);

  const getDraft = (product: ProductFaqGroup) => editing[product.productId] ?? product.faq;
  const setDraft = (productId: string, nextFaq: ProductFaqItem[]) => {
    setEditing((prev) => ({ ...prev, [productId]: nextFaq }));
  };

  const handleSave = async (product: ProductFaqGroup) => {
    const nextFaq = normalizeFaq(getDraft(product));
    setSavingId(product.productId);

    try {
      const res = await fetch("/api/gallery/faq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.productId, faq: nextFaq }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存失败");
      }

      const data = await res.json();
      setItems((prev) => prev.map((item) => (
        item.productId === product.productId
          ? { ...item, faq: data.faq || nextFaq }
          : item
      )));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[product.productId];
        return next;
      });
      showToast("商品问答已保存", "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={cn("min-w-0 max-w-full space-y-5", compactHeader ? "md:space-y-5" : "md:space-y-7")}>
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          {showBackLink && (
            <Link
              href="/gallery"
              className="mb-5 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-bold text-foreground shadow-sm transition-all hover:border-primary/30 hover:bg-primary hover:text-primary-foreground active:scale-95 dark:border-white/10 dark:bg-white/5"
            >
              <ArrowLeft size={17} />
              返回相册
            </Link>
          )}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-white text-foreground shadow-sm dark:border-white/10 dark:bg-white/5 sm:h-12 sm:w-12">
              <MessageCircleQuestion size={23} />
            </div>
            <div className="min-w-0">
              <h1 className={cn("truncate font-bold tracking-tight text-foreground", compactHeader ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>商品<span className="text-primary">问答</span></h1>
              <p className={cn("mt-1 truncate text-sm text-muted-foreground", !compactHeader && "md:text-lg")}>给每个商品维护可对外查看的常见问题</p>
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 xl:w-[342px]">
          <div className="rounded-lg border border-border bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-4">
            <div className="text-2xl font-black text-foreground">{stats.productCount}</div>
            <div className="mt-1 text-xs font-bold text-muted-foreground">已维护商品</div>
          </div>
          <div className="rounded-lg border border-border bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-4">
            <div className="text-2xl font-black text-foreground">{stats.faqCount}</div>
            <div className="mt-1 text-xs font-bold text-muted-foreground">问答总数</div>
          </div>
        </div>
      </div>

      <div className="flex h-11 items-center gap-3 rounded-full border border-border bg-white px-4 shadow-sm transition-all focus-within:ring-2 focus-within:ring-primary/20 dark:border-white/10 dark:bg-white/5">
        <Search size={18} className="shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索商品名、编号或拼音..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
            title="清空搜索"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-white/50 p-8 text-center dark:border-white/10 dark:bg-white/5">
          <CircleHelp size={34} className="mb-3 text-muted-foreground" />
          <h2 className="text-lg font-black text-foreground">还没有商品问答</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {canEditAny ? "换个关键词搜索商品，然后添加问题和答案。" : "当前还没有公开的商品问答。"}
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          {items.map((product) => {
            const draft = getDraft(product);
            const isDirty = Boolean(editing[product.productId]);
            const isSaving = savingId === product.productId;
            const visibleFaq = product.canEdit ? draft : product.faq;

            if (!product.canEdit && product.faq.length === 0) return null;

            return (
              <section
                key={product.productId}
                className={cn(
                  "min-w-0 overflow-hidden rounded-lg border border-border bg-white/85 p-3 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-4",
                  isDirty && "ring-2 ring-primary/15"
                )}
              >
                <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted dark:border-white/10 sm:h-14 sm:w-14">
                      {product.image ? (
                        <Image src={product.image} alt={product.productName} fill sizes="56px" className="object-cover" />
                      ) : (
                        <Package size={22} className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-black text-foreground">{product.productName}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                        {product.sku && <span>编号：{product.sku}</span>}
                        {product.categoryName && <span>{product.categoryName}</span>}
                        <span>{visibleFaq.length} 条问答</span>
                      </div>
                    </div>
                  </div>

                  {product.canEdit && (
                    <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
                      <button
                        onClick={() => setDraft(product.productId, [...draft, createFaqItem()])}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full border border-border px-3 text-sm font-bold transition-all hover:bg-black/5 active:scale-95 dark:border-white/10 dark:hover:bg-white/10 sm:flex-none"
                      >
                        <Plus size={16} />
                        添加
                      </button>
                      <button
                        onClick={() => handleSave(product)}
                        disabled={!isDirty || isSaving}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
                      >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : isDirty ? <Save size={16} /> : <Check size={16} />}
                        保存
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {visibleFaq.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10">
                      暂未添加问答
                    </div>
                  ) : visibleFaq.map((faq, index) => (
                    <div key={faq.id} className="rounded-lg border border-border bg-background/70 p-4 dark:border-white/10 dark:bg-black/10">
                      {product.canEdit ? (
                        <div className="space-y-3">
                          <div className="flex items-start gap-2">
                            <input
                              value={faq.question}
                              onChange={(event) => {
                                const next = draft.map((item) => (
                                  item.id === faq.id ? { ...item, question: event.target.value } : item
                                ));
                                setDraft(product.productId, next);
                              }}
                              placeholder="输入客户常问的问题..."
                              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm font-bold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                            />
                            <button
                              onClick={() => setDraft(product.productId, draft.filter((item) => item.id !== faq.id))}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-red-500 transition-all hover:bg-red-500/10 active:scale-95"
                              title="删除这一条"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                          <textarea
                            value={faq.answer}
                            onChange={(event) => {
                              const next = draft.map((item) => (
                                item.id === faq.id ? { ...item, answer: event.target.value } : item
                              ));
                              setDraft(product.productId, next);
                            }}
                            placeholder="输入回答内容..."
                            rows={3}
                            className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm leading-6 text-foreground outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                          />
                        </div>
                      ) : (
                        <details className="group" open={index === 0}>
                          <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-black text-foreground">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">Q</span>
                            <span>{faq.question}</span>
                          </summary>
                          <p className="mt-3 pl-9 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
