"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  CircleHelp,
  Pencil,
  Loader2,
  MessageCircleQuestion,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Product } from "@/lib/types";

interface FaqProduct {
  id: string;
  name: string;
  sku?: string | null;
  image?: string | null;
  categoryName?: string;
}

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

interface GalleryFaqItem {
  id: string;
  title: string;
  entries: FaqEntry[];
  productIds: string[];
  products: FaqProduct[];
  canEdit: boolean;
}

interface FaqDraft {
  id?: string;
  title: string;
  entries: FaqEntry[];
  productIds: string[];
  products: FaqProduct[];
}

interface ProductFaqPanelProps {
  showBackLink?: boolean;
  compactHeader?: boolean;
}

interface FlattenedFaqRow {
  rowId: string;
  parentId: string;
  entry: FaqEntry;
  productIds: string[];
  products: FaqProduct[];
  canEdit: boolean;
}

function createEntry(seed = 1): FaqEntry {
  return {
    id: `entry-${Date.now()}-${seed}`,
    question: "",
    answer: "",
  };
}

function createDraft(): FaqDraft {
  return {
    entries: [createEntry()],
    title: "",
    productIds: [],
    products: [],
  };
}

function productToFaqProduct(product: Product): FaqProduct {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    image: product.image,
    categoryName: product.category?.name,
  };
}

function toSingleEntryDraft(item: GalleryFaqItem, entryId?: string): FaqDraft {
  const targetEntry = item.entries.find((entry) => entry.id === entryId) || item.entries[0] || createEntry();
  return {
    id: item.id,
    title: "",
    entries: [targetEntry],
    productIds: item.productIds,
    products: item.products,
  };
}

function getItemTitle(item: Pick<GalleryFaqItem, "title" | "entries"> | Pick<FaqDraft, "title" | "entries">) {
  return item.entries[0]?.question || item.title.trim() || "未命名问题";
}

export function ProductFaqPanel({ showBackLink = true, compactHeader = false }: ProductFaqPanelProps) {
  const { showToast } = useToast();
  const [isMounted, setIsMounted] = useState(false);
  const [items, setItems] = useState<GalleryFaqItem[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [canEditAny, setCanEditAny] = useState(false);
  const [activeDraft, setActiveDraft] = useState<FaqDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

        const res = await fetch(`/api/gallery/faq?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load FAQ");
        const data = await res.json();

        if (!ignore) {
          setItems(data.items || []);
          setCanEditAny(Boolean(data.canEditAny));
        }
      } catch (error) {
        console.error(error);
        if (!ignore) showToast("常见问题加载失败", "error");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    loadFaq();
    return () => {
      ignore = true;
    };
  }, [debouncedQuery, showToast]);

  const selectedProductIds = activeDraft?.productIds || [];

  const updateDraft = (patch: Partial<FaqDraft>) => {
    setActiveDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  };

  const updateEntry = (entryId: string, patch: Partial<FaqEntry>) => {
    setActiveDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        entries: draft.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
      };
    });
  };

  const handleSelectProducts = (products: Product[]) => {
    if (!activeDraft) return;

    const nextProducts = [...activeDraft.products];
    const nextIds = new Set(activeDraft.productIds);

    for (const product of products) {
      const id = product.id;
      if (!id || nextIds.has(id)) continue;
      nextIds.add(id);
      nextProducts.push(productToFaqProduct(product));
    }

    updateDraft({
      productIds: Array.from(nextIds),
      products: nextProducts,
    });
  };

  const removeProduct = (productId: string) => {
    if (!activeDraft) return;
    updateDraft({
      productIds: activeDraft.productIds.filter((id) => id !== productId),
      products: activeDraft.products.filter((product) => product.id !== productId),
    });
  };

  const handleCopyAnswer = async (answer: string) => {
    const text = answer.trim();
    if (!text) {
      showToast("当前还没有可复制的答案", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast("答案已复制", "success");
    } catch (error) {
      console.error(error);
      showToast("复制失败", "error");
    }
  };

  const normalizedDraftEntries = useMemo(
    () =>
      (activeDraft?.entries || [])
        .map((entry) => ({
          ...entry,
          question: entry.question.trim(),
          answer: entry.answer.trim(),
        }))
        .filter((entry) => entry.question),
    [activeDraft]
  );

  const flattenedRows = useMemo<FlattenedFaqRow[]>(
    () =>
      items.flatMap((item) =>
        item.entries.map((entry, index) => ({
          rowId: `${item.id}-${entry.id}`,
          parentId: item.id,
          entry,
          productIds: item.productIds,
          products: item.products,
          canEdit: item.canEdit,
        }))
      ),
    [items]
  );

  const handleSave = async () => {
    if (!activeDraft) return;

    if (normalizedDraftEntries.length === 0) {
      showToast("请至少填写一个问题", "error");
      return;
    }

    setSavingId(activeDraft.id || "new");
    try {
      const res = await fetch("/api/gallery/faq", {
        method: activeDraft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeDraft.id,
          title: "",
          entries: normalizedDraftEntries,
          productIds: activeDraft.productIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存失败");
      }

      const data = await res.json();
      const saved = data.item as GalleryFaqItem;
      setItems((prev) => {
        const exists = prev.some((item) => item.id === saved.id);
        if (exists) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev];
      });
      setActiveDraft(null);
      showToast("常见问题已保存", "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (item: GalleryFaqItem) => {
    if (!window.confirm(`确定删除“${getItemTitle(item)}”吗？`)) return;

    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/gallery/faq?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "删除失败");
      }

      setItems((prev) => prev.filter((current) => current.id !== item.id));
      if (activeDraft?.id === item.id) setActiveDraft(null);
      showToast("常见问题已删除", "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={cn("min-w-0 max-w-full space-y-5", compactHeader ? "md:space-y-5" : "md:space-y-7")}>
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          {showBackLink && (
            <Link
              href="/gallery"
              className="mb-5 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-white/90 px-4 text-sm font-bold text-foreground shadow-sm transition-all hover:border-primary/30 hover:bg-primary hover:text-primary-foreground active:scale-95 dark:border-white/10 dark:bg-white/5"
            >
              <ArrowLeft size={17} />
              返回相册
            </Link>
          )}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] text-foreground shadow-[0_14px_30px_rgba(148,163,184,0.22)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] dark:shadow-[0_12px_28px_rgba(15,23,42,0.16)] sm:h-12 sm:w-12">
              <MessageCircleQuestion size={23} />
            </div>
            <div className="min-w-0">
              <h1 className={cn("truncate font-semibold tracking-tight text-foreground", compactHeader ? "text-2xl sm:text-3xl" : "text-3xl sm:text-4xl")}>常见<span className="text-primary">问题</span></h1>
              <p className={cn("mt-1 truncate text-sm text-muted-foreground", !compactHeader && "md:text-lg")}>一个问题组里可以维护多个问题，再统一关联商品</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-row items-center gap-2 transition-all">
        <div className="relative flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-white px-3 transition-all focus-within:ring-2 focus-within:ring-primary/20 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 sm:h-11 sm:gap-3 sm:px-5">
          <Search size={16} className="text-muted-foreground shrink-0 sm:w-[18px] sm:h-[18px]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、问题或答案..."
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"
              title="清空搜索"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {canEditAny && (
          <button
            onClick={() => setActiveDraft(createDraft())}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-sky-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(224,242,254,0.98))] px-4 text-sm font-medium text-slate-950 shadow-[0_10px_28px_rgba(96,165,250,0.22)] transition-all hover:brightness-105 active:scale-95 sm:h-11 sm:px-5"
          >
            <Plus size={17} />
            <span className="hidden sm:inline">新建问题</span>
          </button>
        )}
      </div>

      {activeDraft && isMounted && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="关闭编辑弹窗"
            onClick={() => setActiveDraft(null)}
            className="absolute inset-0 bg-[rgba(3,6,14,0.72)] backdrop-blur-md"
          />
          <section className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff,#f8fbff)] shadow-[0_28px_90px_rgba(148,163,184,0.28)] dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(9,14,24,0.985),rgba(11,17,28,0.975))] dark:shadow-[0_28px_90px_rgba(2,6,23,0.52)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 bg-[linear-gradient(90deg,rgba(255,255,255,0.96),rgba(59,130,246,0.06),transparent_55%)] p-4 dark:border-white/[0.06] dark:bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(59,130,246,0.04),transparent_55%)] sm:p-5">
              <div>
                <div className="text-sm font-semibold text-foreground">{activeDraft.id ? "编辑问题" : "新建问题"}</div>
                <p className="mt-1 text-xs text-muted-foreground">一条记录就是一问一答，直接关联对应商品。</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDraft(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/8"
                title="关闭"
              >
                <X size={16} />
              </button>
            </div>

            <div className="custom-scrollbar space-y-4 overflow-y-auto p-4 sm:p-5">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_24px_rgba(148,163,184,0.12)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sm font-medium text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100">问题</div>
                </div>
                <input
                  value={activeDraft.entries[0]?.question || ""}
                  onChange={(event) => activeDraft.entries[0] && updateEntry(activeDraft.entries[0].id, { question: event.target.value })}
                  placeholder="输入客户常问的问题..."
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-foreground outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                />
                <textarea
                  value={activeDraft.entries[0]?.answer || ""}
                  onChange={(event) => activeDraft.entries[0] && updateEntry(activeDraft.entries[0].id, { answer: event.target.value })}
                  placeholder="输入标准答案或处理建议..."
                  rows={5}
                  className="mt-3 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-foreground outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/5"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-[0_10px_24px_rgba(148,163,184,0.12)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">关联商品</div>
                    <div className="mt-1 text-xs text-muted-foreground">已选择 {activeDraft.productIds.length} 个商品</div>
                  </div>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-white/6 dark:text-foreground dark:hover:bg-white/10"
                  >
                    <Plus size={16} />
                    选择商品
                  </button>
                </div>

                {activeDraft.products.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/5">
                    还没有关联商品，保存后也可以再补。
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeDraft.products.map((product) => (
                      <div key={product.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_8px_20px_rgba(148,163,184,0.1)] dark:border-white/10 dark:bg-white/5 dark:shadow-none">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                          {product.image ? (
                            <Image src={product.image} alt={product.name} fill sizes="36px" className="object-cover" />
                          ) : (
                            <Package size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">{product.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{product.sku || product.categoryName || "未编号"}</div>
                        </div>
                        <button
                          onClick={() => removeProduct(product.id)}
                           className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500"
                          title="取消关联"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50/80 p-4 dark:border-white/[0.06] dark:bg-[rgba(255,255,255,0.015)] sm:flex-row sm:justify-end sm:p-5">
              <button
                onClick={() => setActiveDraft(null)}
                className="h-10 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-95 dark:border-white/10 dark:bg-white/6 dark:text-foreground dark:hover:bg-white/10 sm:w-auto"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={savingId !== null}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-sky-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,1),rgba(224,242,254,0.98))] px-5 text-sm font-medium text-slate-950 transition-all hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {savingId ? <Loader2 size={16} className="animate-spin" /> : activeDraft.id ? <Save size={16} /> : <Check size={16} />}
                保存问题
              </button>
            </div>
          </section>
        </div>
      , document.body)}

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : items.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white/80 p-8 text-center shadow-[0_16px_40px_rgba(148,163,184,0.14)] dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none">
          <CircleHelp size={34} className="mb-3 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">还没有常见问题</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {canEditAny ? "点击“新建问题”，按一问一答的方式逐条维护，再关联商品。" : "当前还没有公开的常见问题。"}
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          {flattenedRows.map((row, index) => {
            return (
              <section
                key={row.rowId}
                className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200/90 bg-white/92 shadow-[0_18px_42px_rgba(148,163,184,0.18)] transition-all duration-200 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_10px_24px_rgba(2,6,23,0.16)] dark:hover:border-white/10"
              >
                <div className="flex w-full min-w-0 flex-col gap-2.5 bg-[linear-gradient(90deg,rgba(59,130,246,0.035),transparent_55%)] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 px-1.5 text-[11px] font-semibold text-sky-700 shadow-[0_6px_16px_rgba(56,189,248,0.12)] dark:border-sky-300/20 dark:bg-sky-300/10 dark:text-sky-100 dark:shadow-[0_6px_16px_rgba(56,189,248,0.14)]">
                            {index + 1}
                          </div>
                          <h2 className="min-w-0 flex-1 break-words text-[17px] font-medium leading-6 text-foreground sm:truncate">
                            {row.entry.question || "未命名问题"}
                          </h2>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:w-auto sm:justify-end">
                        {row.products.length > 0 ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex shrink-0 -space-x-2">
                              {row.products.slice(0, 4).map((product) => (
                                <div key={product.id} className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted ring-2 ring-white dark:ring-[#182031]">
                                  {product.image ? (
                                    <Image src={product.image} alt={product.name} fill sizes="28px" className="object-cover" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <Package size={12} className="text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              ))}
                              {row.products.length > 4 && (
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-medium text-slate-600 dark:bg-transparent dark:text-slate-200">
                                  +{row.products.length - 4}
                                </div>
                              )}
                            </div>
                            <span className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:hidden">
                              已关联 {row.products.length} 个商品
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-500 sm:hidden">未关联商品</span>
                        )}
                        <div className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50/90 px-1 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => void handleCopyAnswer(row.entry.answer || "")}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-foreground active:scale-95 dark:text-slate-300/78 dark:hover:bg-white/[0.06]"
                          title="复制答案"
                        >
                          <Copy size={14} />
                        </button>
                        {row.canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveDraft(toSingleEntryDraft(items.find((item) => item.id === row.parentId)!, row.entry.id));
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-foreground active:scale-95 dark:text-slate-300/78 dark:hover:bg-white/[0.06]"
                              title="编辑"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDelete(items.find((item) => item.id === row.parentId)!);
                              }}
                              disabled={deletingId === row.parentId}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-red-400 transition-all hover:bg-red-500/10 hover:text-red-300 active:scale-95 disabled:opacity-60"
                              title="删除"
                            >
                              {deletingId === row.parentId ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </button>
                          </>
                        )}
                      </div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/5">
                      <div className="text-[11px] font-black tracking-[0.2em] text-slate-500 dark:text-slate-300/70">回答</div>
                      <div className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300/82">
                        {row.entry.answer || "暂未填写标准答案"}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ProductSelectionModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(products) => handleSelectProducts(products)}
        selectedIds={selectedProductIds}
        selectedBadgeLabel="已关联"
        unselectedOnlyLabel="只看未关联"
        unselectedOnlyTitle="切换是否只显示未关联商品"
        title="关联商品"
        showPlatformSelector={false}
        showPrice={false}
        minimalView
        showCategoryFilter
        query={{ includePublic: "true" }}
        loadAllOnOpen
      />
    </div>
  );
}
