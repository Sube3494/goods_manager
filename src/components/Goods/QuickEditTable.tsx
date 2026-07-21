"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { Check, Save, RotateCcw, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

export interface QuickEditItem {
  id: string;
  name: string;
  sku?: string | null;
  costPrice?: number | null;
  image?: string | null;
  categoryName?: string | null;
  shopName?: string | null;
}

interface QuickEditTableProps {
  items: QuickEditItem[];
  onSaveItem?: (id: string, updates: { sku: string; costPrice: number }) => Promise<boolean>;
  onBatchSave?: (updates: Array<{ id: string; sku: string; costPrice: number }>) => Promise<boolean>;
  isLoading?: boolean;
}

export function QuickEditTable({
  items,
  onSaveItem,
  onBatchSave,
  isLoading = false,
}: QuickEditTableProps) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();

  // 存储临时未保存的草稿，Key 为商品 ID，Value 为更改的值
  const [drafts, setDrafts] = useState<Record<string, { sku: string; costPrice: string }>>({});
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});

  // 每一条记录初始的基准值
  const getInitialValues = useCallback((item: QuickEditItem) => {
    return {
      sku: item.sku || "",
      costPrice: item.costPrice !== undefined && item.costPrice !== null ? String(item.costPrice) : "0",
    };
  }, []);

  const handleFieldChange = (id: string, field: "sku" | "costPrice", value: string, originalItem: QuickEditItem) => {
    setDrafts((prev) => {
      const currentDraft = prev[id] || getInitialValues(originalItem);
      const updatedDraft = { ...currentDraft, [field]: value };
      
      const orig = getInitialValues(originalItem);
      // 如果改回原值，则清理草稿
      if (updatedDraft.sku === orig.sku && updatedDraft.costPrice === orig.costPrice) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      
      return {
        ...prev,
        [id]: updatedDraft,
      };
    });
  };

  const isChanged = (item: QuickEditItem) => {
    return Boolean(drafts[item.id]);
  };

  const handleResetRow = (item: QuickEditItem) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  const handleSaveRow = async (item: QuickEditItem) => {
    const draft = drafts[item.id];
    if (!draft || !onSaveItem) return;

    setSavingIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const numPrice = parseFloat(draft.costPrice) || 0;
      const success = await onSaveItem(item.id, {
        sku: draft.sku.trim(),
        costPrice: numPrice,
      });

      if (success) {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        showToast("已保存修改", "success");
      }
    } catch {
      showToast("保存失败，请重试", "error");
    } finally {
      setSavingIds((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleSaveAll = async () => {
    const changedIds = Object.keys(drafts);
    if (changedIds.length === 0 || !onBatchSave) return;

    const updatesPayload = changedIds.map((id) => {
      const draft = drafts[id];
      return {
        id,
        sku: draft.sku.trim(),
        costPrice: parseFloat(draft.costPrice) || 0,
      };
    });

    startTransition(async () => {
      try {
        const success = await onBatchSave(updatesPayload);
        if (success) {
          setDrafts({});
          showToast(`成功批量保存 ${updatesPayload.length} 项修改`, "success");
        }
      } catch {
        showToast("批量保存失败", "error");
      }
    });
  };

  const changedCount = Object.keys(drafts).length;

  return (
    <div className="space-y-4">
      {/* 顶部批量保存浮条 */}
      {changedCount > 0 && (
        <div className="sticky top-16 z-30 flex items-center justify-between rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 sm:p-4 backdrop-blur-xl dark:bg-amber-500/15 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300">
              有 <strong className="text-base text-amber-600 dark:text-amber-400">{changedCount}</strong> 项未保存的修改
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrafts({})}
              disabled={isPending}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted/60 transition-colors"
            >
              放弃全改
            </button>
            <button
              type="button"
              onClick={() => { void handleSaveAll(); }}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
            >
              <Save size={15} />
              <span>{isPending ? "保存中..." : "保存所有修改"}</span>
            </button>
          </div>
        </div>
      )}

      {/* 移动端专属自适应卡片编辑列表 (md:hidden) */}
      <div className="md:hidden space-y-3">
        {items.map((item, idx) => {
          const orig = getInitialValues(item);
          const currentDraft = drafts[item.id] || orig;
          const rowChanged = isChanged(item);
          const isRowSaving = savingIds[item.id];

          return (
            <div
              key={item.id}
              className={cn(
                "p-3.5 rounded-2xl border transition-all space-y-3 bg-card shadow-sm",
                rowChanged ? "border-amber-500/50 bg-amber-500/5 dark:bg-amber-500/10" : "border-border"
              )}
            >
              {/* 卡片头部：序号 + 封面 + 名称 + 单条保存按钮 */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-muted-foreground w-5 text-center shrink-0">
                  {idx + 1}
                </span>
                <div className="h-11 w-11 rounded-xl overflow-hidden border border-border bg-muted/50 shrink-0 flex items-center justify-center">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon size={16} className="text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {item.categoryName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                        {item.categoryName}
                      </span>
                    )}
                    {item.shopName && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                        {item.shopName}
                      </span>
                    )}
                  </div>
                </div>
                {rowChanged ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResetRow(item)}
                      disabled={isRowSaving}
                      className="p-2 rounded-xl text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                      title="撤销"
                    >
                      <RotateCcw size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleSaveRow(item); }}
                      disabled={isRowSaving}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-500 text-white font-medium text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                    >
                      <Check size={15} strokeWidth={2.5} />
                      <span>保存</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40 shrink-0">未变动</span>
                )}
              </div>

              {/* 卡片下部：全宽并排 SKU 与 进货单价 输入框 */}
              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/50">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                    货品编码 (SKU)
                  </label>
                  <input
                    type="text"
                    value={currentDraft.sku}
                    onChange={(e) => handleFieldChange(item.id, "sku", e.target.value, item)}
                    placeholder="暂无编号"
                    className={cn(
                      "w-full h-9 px-2.5 rounded-xl border text-xs font-mono font-normal transition-all outline-none bg-background/80 dark:bg-white/5 placeholder:text-muted-foreground/40",
                      currentDraft.sku !== orig.sku
                        ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 font-medium text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
                        : "border-border/80 text-foreground"
                    )}
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                    进货单价 (元)
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-xs text-muted-foreground font-medium">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={currentDraft.costPrice}
                      onChange={(e) => handleFieldChange(item.id, "costPrice", e.target.value, item)}
                      className={cn(
                        "w-full h-9 pl-6 pr-2 rounded-xl border text-xs font-normal transition-all outline-none bg-background/80 dark:bg-white/5",
                        currentDraft.costPrice !== orig.costPrice
                          ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 font-medium text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20"
                          : "border-border/80 text-foreground"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && !isLoading && (
          <div className="py-12 text-center text-muted-foreground text-xs bg-card rounded-2xl border border-border">
            暂无相关商品数据
          </div>
        )}
      </div>

      {/* 桌面端多列连续编辑表格 (hidden md:block) */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium text-[11px] sm:text-xs">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3 w-14 text-center">封面</th>
                <th className="py-3 px-3 min-w-[140px]">商品名称 / 分类</th>
                <th className="py-3 px-3 w-44 sm:w-56">货品编码 (SKU)</th>
                <th className="py-3 px-3 w-32 sm:w-40">进货单价 (元)</th>
                <th className="py-3 px-3 w-24 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, idx) => {
                const orig = getInitialValues(item);
                const currentDraft = drafts[item.id] || orig;
                const rowChanged = isChanged(item);
                const isRowSaving = savingIds[item.id];

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      rowChanged && "bg-amber-500/5 dark:bg-amber-500/10"
                    )}
                  >
                    <td className="py-2.5 px-3 text-center text-muted-foreground font-medium text-xs">
                      {idx + 1}
                    </td>

                    {/* 封面缩略图 */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="relative mx-auto h-10 w-10 overflow-hidden rounded-lg border border-border bg-muted/50 flex items-center justify-center shrink-0">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon size={16} className="text-muted-foreground/40" />
                        )}
                      </div>
                    </td>

                    {/* 商品名称 */}
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-foreground line-clamp-1 leading-snug">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.categoryName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                            {item.categoryName}
                          </span>
                        )}
                        {item.shopName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                            {item.shopName}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SKU 输入框 */}
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        value={currentDraft.sku}
                        onChange={(e) => handleFieldChange(item.id, "sku", e.target.value, item)}
                        placeholder="暂无编号"
                        className={cn(
                          "w-full h-9 px-3 rounded-xl border text-xs sm:text-sm font-mono font-normal transition-all outline-none bg-background/80 dark:bg-white/5 placeholder:text-muted-foreground/40",
                          currentDraft.sku !== orig.sku
                            ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 font-medium text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20"
                            : "border-border/80 hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
                        )}
                      />
                    </td>

                    {/* 进货单价 输入框 */}
                    <td className="py-2.5 px-3">
                      <div className="relative flex items-center">
                        <span className="absolute left-2.5 text-xs text-muted-foreground font-medium">¥</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={currentDraft.costPrice}
                          onChange={(e) => handleFieldChange(item.id, "costPrice", e.target.value, item)}
                          className={cn(
                            "w-full h-9 pl-6 pr-2.5 rounded-xl border text-xs sm:text-sm font-normal transition-all outline-none bg-background/80 dark:bg-white/5",
                            currentDraft.costPrice !== orig.costPrice
                              ? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 font-medium text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20"
                              : "border-border/80 hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground"
                          )}
                        />
                      </div>
                    </td>

                    {/* 行保存/重置控制 */}
                    <td className="py-2.5 px-3 text-center">
                      {rowChanged ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => { void handleSaveRow(item); }}
                            disabled={isRowSaving}
                            className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
                            title="保存本行修改"
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResetRow(item)}
                            disabled={isRowSaving}
                            className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 active:scale-95 transition-all"
                            title="撤销修改"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/50">未变动</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {items.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground text-xs">
                    暂无相关商品数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
