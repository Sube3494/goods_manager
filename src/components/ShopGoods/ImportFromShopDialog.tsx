"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Search } from "lucide-react";
import { ImportModalLayout, importCancelClassName, importConfirmClassName } from "@/components/Goods/ImportModalLayout";
import { ProductSelectionIndicator, ProductSelectionThumbnail } from "@/components/Goods/ProductSelectionVisuals";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import type { Shop, ShopCatalogItem } from "@/lib/types";

interface ImportResult {
  imported: number;
  skipped: number;
}

interface Props {
  targetShop: Shop;
  shops: Shop[];
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

export function ImportFromShopDialog({ targetShop, shops, onClose, onImported }: Props) {
  const [sourceShopId, setSourceShopId] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const sourceShops = shops.filter((shop) => shop.id !== targetShop.id);

  async function submit(all: boolean) {
    if (!sourceShopId || (!all && selection.size === 0) || isImporting) return;
    setIsImporting(true);
    setError("");
    try {
      const response = await fetch(`/api/shops/${targetShop.id}/products/import-from-shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceShopId, all, productIds: all ? [] : [...selection] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "导入失败");
      onImported(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "导入失败，请重试");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <ImportModalLayout
      isOpen
      isImporting={isImporting}
      title="从其他店铺导入"
      description={`导入到「${targetShop.name}」。平台 ID 留空，采购和库存从该店铺独立记账，已有商品会跳过。`}
      onClose={onClose}
      className="max-w-2xl"
      footer={(
        <>
          <button type="button" className={cn(importCancelClassName, "px-4 sm:px-6")} disabled={isImporting} onClick={onClose}>取消</button>
          <Button type="button" variant="outline" className="h-11 rounded-full px-4" disabled={!sourceShopId || isImporting} onClick={() => void submit(true)}>
            导入整店商品
          </Button>
          <button type="button" className={cn(importConfirmClassName, "px-4 sm:px-8")} disabled={!selection.size || isImporting} onClick={() => void submit(false)}>
            {isImporting ? <Spinner aria-label="正在导入" /> : <CheckCircle size={18} className="hidden sm:block" />}
            {isImporting ? "正在导入…" : `导入所选（${selection.size}）`}
          </button>
        </>
      )}
    >
      <fieldset disabled={isImporting} className="space-y-4 disabled:opacity-70">
        <fieldset className="space-y-2" disabled={sourceShops.length === 0}>
          <legend className="text-sm font-medium text-foreground">来源店铺</legend>
          <CustomSelect
            value={sourceShopId}
            options={sourceShops.map((shop) => ({ value: shop.id, label: shop.name }))}
            onChange={(id) => {
              if (isImporting) return;
              setSourceShopId(id);
              setSelection(new Set());
              setError("");
            }}
            placeholder={sourceShops.length ? "选择来源店铺" : "没有其他可用店铺"}
            triggerClassName="h-11 w-full rounded-full border border-border bg-white px-4 dark:border-white/10 dark:bg-white/5"
          />
        </fieldset>
        {sourceShopId && (
          <SourceProducts
            key={sourceShopId}
            shopId={sourceShopId}
            selection={selection}
            disabled={isImporting}
            onToggle={(id) => setSelection((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
          />
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </fieldset>
    </ImportModalLayout>
  );
}

function SourceProducts({ shopId, selection, disabled, onToggle }: {
  shopId: string;
  selection: Set<string>;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [retry, setRetry] = useState(0);
  const query = useDebounce(search.trim(), 250);
  const [result, setResult] = useState<{
    query: string;
    page: number;
    pageSize: number;
    retry: number;
    items: ShopCatalogItem[];
    total: number;
    error: string;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ shopId, search: query, page: String(page), pageSize: String(pageSize), sortBy: "name-asc" });
    async function load() {
      try {
        const response = await fetch(`/api/shop-products?${params}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) {
          setResult({ query, page, pageSize, retry, items: data.items, total: data.total, error: "" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResult({ query, page, pageSize, retry, items: [], total: 0, error: "加载来源商品失败" });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [shopId, query, page, pageSize, retry]);

  const current = result?.query === query && result.page === page && result.pageSize === pageSize && result.retry === retry && query === search.trim() ? result : null;
  const total = result?.query === query ? result.total : 0;

  return (
    <div className="grid gap-3 text-sm">
      <InputGroup className="h-11 rounded-full border-border bg-white dark:bg-white/5">
        <InputGroupAddon className="pl-3"><Search /></InputGroupAddon>
        <InputGroupInput
          aria-label="搜索来源商品"
          placeholder="搜索商品名称或店内码"
          value={search}
          disabled={disabled}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </InputGroup>
      <div className="max-h-[min(30dvh,20rem)] min-h-20 overflow-y-auto rounded-2xl border border-border/60" aria-busy={!current}>
        {!current ? <div role="status" className="flex items-center gap-2 p-3 text-muted-foreground"><Spinner aria-hidden="true" />正在加载商品…</div>
          : current.error ? (
            <div className="flex items-center gap-2 p-3">
              <p role="alert" className="text-destructive">{current.error}</p>
              <Button variant="outline" size="sm" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>重试</Button>
            </div>
          ) : current.items.length ? (
            <ul className="divide-y divide-border">
              {current.items.map((item) => {
                const selected = selection.has(item.id);
                return (
                  <li key={item.id}>
                    <label className={cn("group relative flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50", selected && "bg-muted/50")}>
                      <input type="checkbox" aria-label={item.name} checked={selected} disabled={disabled} onChange={() => onToggle(item.id)} className="peer sr-only" />
                      <ProductSelectionThumbnail image={item.image} name={item.name} />
                      <span className="min-w-0 flex-1 break-words">{item.name}</span>
                      {item.sku && <span className="max-w-[25%] break-words text-xs text-muted-foreground">{item.sku}</span>}
                      <ProductSelectionIndicator selected={selected} className="peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : <p className="p-3 text-muted-foreground">没有找到商品</p>}
      </div>
      {total > 20 && (
        <Pagination
          className="mt-0"
          currentPage={page}
          totalPages={Math.ceil(total / pageSize)}
          totalItems={total}
          pageSize={pageSize}
          pageSizeOptions={[20, 50]}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}
    </div>
  );
}
