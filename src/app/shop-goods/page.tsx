"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, Store, X, ArrowUp, Trash2, AlertCircle, Zap, ListOrdered, Save, Check, Link2 } from "lucide-react";
import Link from "next/link";
import { ImportModal } from "@/components/Goods/ImportModal";
import { GoodsCard } from "@/components/Goods/GoodsCard";
import { QuickEditTable } from "@/components/Goods/QuickEditTable";
import { BatchEditModal } from "@/components/Goods/BatchEditModal";
import { GoodsCardSkeleton } from "@/components/Goods/GoodsCardSkeleton";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { MeituanMappingModal } from "@/components/ShopGoods/MeituanMappingModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { ActionBar } from "@/components/ui/ActionBar";
import { useToast } from "@/components/ui/Toast";
import { useDebounce } from "@/hooks/useDebounce";
import { ExportProgressModal } from "@/components/ui/ExportProgressModal";
import { Category, Product, Shop, ShopCatalogItem, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ShopProductsResponse {
  items?: ShopCatalogItem[];
  total?: number;
  hasMore?: boolean;
}

type SortWorkbenchRow = ShopCatalogItem & {
  skuInput: string;
  sortGroupNameInput: string;
  sortCategoryNameInput: string;
};

type SortWorkbenchCategory = {
  id: string;
  name: string;
  rangeSize: string;
};

type ShopSortDraft = {
  startNumber: string;
  categories: SortWorkbenchCategory[];
  rows: Array<{
    id: string;
    skuInput: string;
    sortGroupNameInput: string;
    sortCategoryNameInput: string;
  }>;
  updatedAt: number;
};

function getShopSortDraftKey(shopId: string) {
  return `shop-sort-draft:${shopId}`;
}

function parseIncrementingCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) {
    return {
      prefix: "",
      number: Number(trimmed) || 1,
      suffix: "",
      width: 0,
    };
  }
  return {
    prefix: match[1] || "",
    number: Number(match[2]) || 1,
    suffix: match[3] || "",
    width: match[2].length,
  };
}

function formatIncrementingCode(template: ReturnType<typeof parseIncrementingCode>, number: number) {
  const numericPart = template.width > 0 ? String(number).padStart(template.width, "0") : String(number);
  return `${template.prefix}${numericPart}${template.suffix}`;
}

function getIncrementingCodeNumber(value: string | null | undefined) {
  const match = String(value || "").trim().match(/(\d+)(\D*)$/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

async function loadAndConvertImageForExcel(imageUrl: string): Promise<{ buffer: ArrayBuffer; width?: number; height?: number; extension: "jpeg" | "png" } | null> {
  if (!imageUrl) return null;
  try {
    let rawBuffer: ArrayBuffer | null = null;
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        rawBuffer = await response.arrayBuffer();
      }
    } catch {
      rawBuffer = null;
    }

    let blobUrl = "";
    if (rawBuffer) {
      const blob = new Blob([rawBuffer]);
      blobUrl = URL.createObjectURL(blob);
    } else {
      blobUrl = imageUrl;
    }

    return await new Promise((resolve) => {
      const img = typeof window !== "undefined" ? new window.Image() : ({} as HTMLImageElement);
      if (!rawBuffer) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const width = img.width || 120;
          const height = img.height || 120;
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            if (blobUrl && rawBuffer) URL.revokeObjectURL(blobUrl);
            resolve(rawBuffer ? { buffer: rawBuffer, width, height, extension: "jpeg" } : null);
            return;
          }

          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          if (blobUrl && rawBuffer) URL.revokeObjectURL(blobUrl);

          const base64Data = dataUrl.split(",")[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          resolve({
            buffer: bytes.buffer,
            width,
            height,
            extension: "jpeg",
          });
        } catch {
          if (blobUrl && rawBuffer) URL.revokeObjectURL(blobUrl);
          resolve(rawBuffer ? { buffer: rawBuffer, width: img.width || 120, height: img.height || 120, extension: "jpeg" } : null);
        }
      };

      img.onerror = () => {
        if (blobUrl && rawBuffer) URL.revokeObjectURL(blobUrl);
        resolve(rawBuffer ? { buffer: rawBuffer, width: 100, height: 100, extension: "jpeg" } : null);
      };

      img.src = blobUrl;
    });
  } catch {
    return null;
  }
}

function ShopSortWorkbench({
  isOpen,
  shop,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  shop: Shop | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<SortWorkbenchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startNumber, setStartNumber] = useState("1001");
  const [categories, setCategories] = useState<SortWorkbenchCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategoryName, setSelectedCategoryName] = useState("all");
  const [batchTargetCategoryName, setBatchTargetCategoryName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [draftShopId, setDraftShopId] = useState("");
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<SortWorkbenchCategory | null>(null);
  const activeShopIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [isOpen]);

  const loadRows = useCallback(async () => {
    if (!shop?.id) return;
    const currentShopId = shop.id;
    activeShopIdRef.current = currentShopId;
    setIsDraftReady(false);
    setDraftShopId("");
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        shopId: currentShopId,
        all: "true",
        sortBy: "sortNumber-asc",
      });
      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`/api/shop-products?${query.toString()}`, { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
      ]);
      const data: ShopProductsResponse = await productsRes.json().catch(() => ({}));
      const categoryData: Category[] = await categoriesRes.json().catch(() => []);
      if (!productsRes.ok) {
        throw new Error("加载排序商品失败");
      }
      const fetchedOriginalNames = Array.isArray(categoryData)
        ? categoryData.map((category) => String(category.name || "").trim()).filter(Boolean)
        : [];
      const loadedRows = (Array.isArray(data.items) ? data.items : []).map((item) => ({
        ...item,
        skuInput: item.sku || "",
        sortGroupNameInput: item.sortGroupName || "",
        sortCategoryNameInput: item.sortCategoryName || item.categoryName || "",
      }));
      let nextRows = loadedRows;
      let nextStartNumber = "1001";
      let nextCategories = Array.from(
        new Set(
          [
            ...loadedRows
              .map((row) => (row.sortGroupNameInput || row.categoryName || "未分组").trim())
              .filter(Boolean),
            ...fetchedOriginalNames,
          ]
        )
      ).map((name) => ({ id: `${name}-${crypto.randomUUID()}`, name, rangeSize: "" }));
      let restoredDraft = false;

      try {
        const draftRaw = localStorage.getItem(getShopSortDraftKey(currentShopId));
        const draft = draftRaw ? JSON.parse(draftRaw) as ShopSortDraft : null;
        if (draft && Array.isArray(draft.rows) && Array.isArray(draft.categories)) {
          const draftRowsById = new Map(draft.rows.map((row) => [row.id, row]));
          nextRows = loadedRows.map((row) => {
            const draftRow = draftRowsById.get(row.id);
            return draftRow
              ? {
                  ...row,
                  skuInput: draftRow.skuInput,
                  sortGroupNameInput: draftRow.sortGroupNameInput,
                  sortCategoryNameInput: draftRow.sortCategoryNameInput,
                }
              : row;
          });
          nextStartNumber = draft.startNumber || nextStartNumber;
          nextCategories = draft.categories.length > 0 ? draft.categories : nextCategories;
          restoredDraft = true;
        }
      } catch (error) {
        console.warn("Failed to restore shop sort draft:", error);
      }

      if (activeShopIdRef.current !== currentShopId) return;
      setStartNumber(nextStartNumber);
      setRows(nextRows);
      setSelectedRowIds([]);
      setSelectedCategoryName("all");
      setBatchTargetCategoryName("");
      setSearchQuery("");
      setCategories(nextCategories);
      setHasRestoredDraft(restoredDraft);
      setDraftShopId(currentShopId);
      setIsDraftReady(true);
      if (restoredDraft) {
        showToast("已恢复上次未保存的排序草稿", "info");
      }
    } catch (error) {
      console.error("Failed to load shop sort rows:", error);
      showToast("加载排序商品失败", "error");
    } finally {
      if (activeShopIdRef.current === currentShopId) {
        setIsLoading(false);
      }
    }
  }, [shop?.id, showToast]);

  useEffect(() => {
    if (isOpen) void loadRows();
  }, [isOpen, loadRows]);

  useEffect(() => {
    if (!isOpen || !isDraftReady || !shop?.id || draftShopId !== shop.id) return;
    const draft: ShopSortDraft = {
      startNumber,
      categories,
      rows: rows.map((row) => ({
        id: row.id,
        skuInput: row.skuInput,
        sortGroupNameInput: row.sortGroupNameInput,
        sortCategoryNameInput: row.sortCategoryNameInput,
      })),
      updatedAt: Date.now(),
    };
    localStorage.setItem(getShopSortDraftKey(shop.id), JSON.stringify(draft));
  }, [categories, draftShopId, isDraftReady, isOpen, rows, shop?.id, startNumber]);

  const updateRow = useCallback((id: string, field: "skuInput" | "sortGroupNameInput", value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
              ...(field === "sortGroupNameInput" ? { sortCategoryNameInput: value } : {}),
            }
          : row
      )
    );
  }, []);

  const renumberRowsByCategoryOrder = useCallback((sourceRows: SortWorkbenchRow[], orderedCategories: SortWorkbenchCategory[]) => {
    const template = parseIncrementingCode(startNumber);
    const safeBase = template.number;
    const rowCountByName = new Map<string, number>();
    sourceRows.forEach((row) => {
      const groupName = (row.sortGroupNameInput || row.categoryName || "未分组").trim();
      rowCountByName.set(groupName, (rowCountByName.get(groupName) || 0) + 1);
    });
    const sourceOrderById = new Map(sourceRows.map((row, index) => [row.id, index]));
    const categoryMetaByName = new Map(orderedCategories.map((category) => [category.name.trim(), category]));
    const categoryStartByName = new Map<string, number>();
    let cursor = safeBase;
    orderedCategories.forEach((category) => {
      const name = category.name.trim();
      categoryStartByName.set(name, cursor);
      const numericRange = Number(category.rangeSize);
      const actualCount = rowCountByName.get(name) || 0;
      const safeCategoryRange = Number.isFinite(numericRange) && numericRange > 0 ? Math.trunc(numericRange) : actualCount;
      cursor += safeCategoryRange;
    });
    const orderByName = new Map(orderedCategories.map((category, index) => [category.name.trim(), index]));
    const sorted = [...sourceRows].sort((a, b) => {
      const groupA = (a.sortGroupNameInput || a.categoryName || "未分组").trim();
      const groupB = (b.sortGroupNameInput || b.categoryName || "未分组").trim();
      const orderA = orderByName.has(groupA) ? orderByName.get(groupA)! : Number.MAX_SAFE_INTEGER;
      const orderB = orderByName.has(groupB) ? orderByName.get(groupB)! : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      if (groupA !== groupB) return groupA.localeCompare(groupB, "zh-CN");
      const sourceOrderA = sourceOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const sourceOrderB = sourceOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (sourceOrderA !== sourceOrderB) return sourceOrderA - sourceOrderB;
      return (a.sku || "").localeCompare(b.sku || "", "zh-CN", { numeric: true, sensitivity: "base" });
    });

    const groupIndexByName = new Map<string, number>();
    const offsetByName = new Map<string, number>();
    const numbered = new Map<string, string>();

    for (const row of sorted) {
      const groupName = (row.sortGroupNameInput || row.categoryName || "未分组").trim();
      const groupIndex = orderByName.has(groupName)
        ? orderByName.get(groupName)!
        : groupIndexByName.has(groupName)
        ? groupIndexByName.get(groupName)!
        : orderedCategories.length + groupIndexByName.size;
      if (!groupIndexByName.has(groupName)) groupIndexByName.set(groupName, groupIndex);
      const offset = offsetByName.get(groupName) || 0;
      const fallbackStart = cursor + groupIndex;
      const categoryStart = categoryMetaByName.has(groupName) ? categoryStartByName.get(groupName) ?? fallbackStart : fallbackStart;
      numbered.set(row.id, formatIncrementingCode(template, categoryStart + offset));
      offsetByName.set(groupName, offset + 1);
    }

    return sourceRows.map((row) => {
      const groupName = (row.sortGroupNameInput || row.categoryName || "未分组").trim();
      return {
        ...row,
        skuInput: numbered.get(row.id) || "",
        sortGroupNameInput: groupName,
        sortCategoryNameInput: groupName,
      };
    });
  }, [startNumber]);

  const syncCategoriesFromRows = useCallback((nextRows: SortWorkbenchRow[], preferredOrder = categories) => {
    const names = Array.from(
      new Set(nextRows.map((row) => (row.sortGroupNameInput || row.categoryName || "未分组").trim()).filter(Boolean))
    );
    const existingByName = new Map(preferredOrder.map((category) => [category.name, category]));
    return [
      ...preferredOrder.filter((category) => names.includes(category.name)),
      ...names
        .filter((name) => !existingByName.has(name))
        .map((name) => ({ id: `${name}-${crypto.randomUUID()}`, name, rangeSize: "" })),
    ];
  }, [categories]);

  const addCategory = useCallback(() => {
    const name = newCategoryName.trim();
    if (!name) {
      showToast("请输入临时分类名称", "error");
      return;
    }
    if (categories.some((category) => category.name === name)) {
      showToast("这个临时分类已存在", "error");
      return;
    }
    setCategories((prev) => [...prev, { id: `${name}-${crypto.randomUUID()}`, name, rangeSize: "" }]);
    setSelectedCategoryName(name);
    setNewCategoryName("");
  }, [categories, newCategoryName, showToast]);

  const pinCategoryToTop = useCallback((id: string) => {
    setCategories((prev) => {
      const index = prev.findIndex((category) => category.id === id);
      if (index <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.unshift(item);
      setRows((prevRows) => renumberRowsByCategoryOrder(prevRows, next));
      return next;
    });
  }, [renumberRowsByCategoryOrder]);

  const deleteCategory = useCallback((category: SortWorkbenchCategory) => {
    if (!category) return;
    const productCount = rows.filter((row) => row.sortGroupNameInput === category.name).length;

    setCategories((prev) => {
      const nextBase = prev.filter((item) => item.id !== category.id);
      const needsUngrouped = productCount > 0 && !nextBase.some((item) => item.name === "未分组");
      const next = needsUngrouped
        ? [...nextBase, { id: `未分组-${crypto.randomUUID()}`, name: "未分组", rangeSize: category.rangeSize || "" }]
        : nextBase;
      setRows((prevRows) => {
        const movedRows = prevRows.map((row) =>
          row.sortGroupNameInput === category.name
            ? { ...row, sortGroupNameInput: "未分组", sortCategoryNameInput: "未分组" }
            : row
        );
        return renumberRowsByCategoryOrder(movedRows, next);
      });
      return next;
    });
    setSelectedCategoryName((current) => (current === category.name ? "all" : current));
    setBatchTargetCategoryName((current) => (current === category.name ? "" : current));
    setDeleteCategoryTarget(null);
  }, [categories, renumberRowsByCategoryOrder, rows]);

  const renameCategory = useCallback((id: string, value: string) => {
    const nextName = value.trim();
    setCategories((prev) => prev.map((category) => (category.id === id ? { ...category, name: value } : category)));
    if (!nextName) return;
    const oldName = categories.find((category) => category.id === id)?.name;
    if (!oldName || oldName === nextName) return;
    setRows((prev) =>
      prev.map((row) =>
        row.sortGroupNameInput === oldName
          ? { ...row, sortGroupNameInput: nextName, sortCategoryNameInput: row.sortCategoryNameInput === oldName ? nextName : row.sortCategoryNameInput }
          : row
      )
    );
    setSelectedCategoryName((current) => (current === oldName ? nextName : current));
  }, [categories]);

  const updateCategoryRange = useCallback((id: string, value: string) => {
    setCategories((prev) => {
      const next = prev.map((category) => (category.id === id ? { ...category, rangeSize: value } : category));
      setRows((prevRows) => renumberRowsByCategoryOrder(prevRows, next));
      return next;
    });
  }, [renumberRowsByCategoryOrder]);

  const handleCategoryDrop = useCallback((targetId: string) => {
    if (!draggingCategoryId || draggingCategoryId === targetId) return;
    setCategories((prev) => {
      const fromIndex = prev.findIndex((category) => category.id === draggingCategoryId);
      const toIndex = prev.findIndex((category) => category.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      setRows((prevRows) => renumberRowsByCategoryOrder(prevRows, next));
      return next;
    });
    setDraggingCategoryId(null);
  }, [draggingCategoryId, renumberRowsByCategoryOrder]);

  const applyCategoryToSelected = useCallback((categoryName: string) => {
    if (selectedRowIds.length === 0) {
      showToast("请先勾选商品", "error");
      return;
    }
    setRows((prev) => {
      const nextRows = prev.map((row) =>
        selectedRowIds.includes(row.id)
          ? { ...row, sortGroupNameInput: categoryName, sortCategoryNameInput: categoryName }
          : row
      );
      return renumberRowsByCategoryOrder(nextRows, categories);
    });
    showToast(`已把 ${selectedRowIds.length} 件商品改到「${categoryName}」`, "success");
  }, [categories, renumberRowsByCategoryOrder, selectedRowIds, showToast]);

  const applyBatchTargetCategory = useCallback(() => {
    if (!batchTargetCategoryName) {
      showToast("请选择要转移到的临时分类", "error");
      return;
    }
    applyCategoryToSelected(batchTargetCategoryName);
  }, [applyCategoryToSelected, batchTargetCategoryName, showToast]);

  const fillGroupsFromOriginalCategory = useCallback(() => {
    setRows((prev) => {
      const nextRows = prev.map((row) => {
        const groupName = row.categoryName || "未分类";
        return {
          ...row,
          sortGroupNameInput: groupName,
          sortCategoryNameInput: groupName,
        };
      });
      setCategories(syncCategoriesFromRows(nextRows, []));
      return nextRows;
    });
    showToast("已用原分类初始化临时分类", "success");
  }, [showToast, syncCategoriesFromRows]);

  const autoNumberByGroup = useCallback(() => {
    setRows((prev) => renumberRowsByCategoryOrder(prev, categories));
    showToast("已按临时分类生成店内码", "success");
  }, [categories, renumberRowsByCategoryOrder, showToast]);

  const sortedPreview = useMemo(
    () => {
      const orderByName = new Map(categories.map((category, index) => [category.name.trim(), index]));
      const normalizedQuery = searchQuery.trim().toLowerCase();

      return [...rows]
        .filter((row) => {
          const matchesCategory = selectedCategoryName === "all" || row.sortGroupNameInput === selectedCategoryName;
          if (!matchesCategory) return false;

          if (!normalizedQuery) return true;
          const name = String(row.name || row.productName || "").toLowerCase();
          const skuInput = String(row.skuInput || "").toLowerCase();
          const sku = String(row.sku || "").toLowerCase();
          const jdSku = String(row.jdSkuId || "").toLowerCase();
          const mtSku = String(row.meituanSkuId || "").toLowerCase();
          const group = String(row.sortGroupNameInput || row.categoryName || "").toLowerCase();
          return name.includes(normalizedQuery) || skuInput.includes(normalizedQuery) || sku.includes(normalizedQuery) || jdSku.includes(normalizedQuery) || mtSku.includes(normalizedQuery) || group.includes(normalizedQuery);
        })
        .sort((a, b) => {
          const groupA = (a.sortGroupNameInput || a.categoryName || "未分组").trim();
          const groupB = (b.sortGroupNameInput || b.categoryName || "未分组").trim();
          const orderA = orderByName.has(groupA) ? orderByName.get(groupA)! : Number.MAX_SAFE_INTEGER;
          const orderB = orderByName.has(groupB) ? orderByName.get(groupB)! : Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          const numberA = getIncrementingCodeNumber(a.skuInput);
          const numberB = getIncrementingCodeNumber(b.skuInput);
          if (numberA !== numberB) return numberA - numberB;
          return (a.name || "").localeCompare(b.name || "", "zh-CN");
        });
    },
    [categories, rows, searchQuery, selectedCategoryName]
  );

  const handleRowDrop = useCallback((targetId: string) => {
    if (!draggingRowId || draggingRowId === targetId) return;
    let blockedByCategory = false;
    setRows((prev) => {
      const fromRow = prev.find((row) => row.id === draggingRowId);
      const targetRow = prev.find((row) => row.id === targetId);
      if (!fromRow || !targetRow) return prev;
      const fromGroup = (fromRow.sortGroupNameInput || fromRow.categoryName || "未分组").trim();
      const targetGroup = (targetRow.sortGroupNameInput || targetRow.categoryName || "未分组").trim();
      if (fromGroup !== targetGroup) {
        blockedByCategory = true;
        return prev;
      }
      const orderedIds = sortedPreview.map((row) => row.id);
      const fromIndex = orderedIds.indexOf(draggingRowId);
      const toIndex = orderedIds.indexOf(targetId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const nextIds = [...orderedIds];
      const [movedId] = nextIds.splice(fromIndex, 1);
      nextIds.splice(toIndex, 0, movedId);
      const visibleOrderById = new Map(nextIds.map((id, index) => [id, index]));
      const nextRows = [...prev].sort((a, b) => {
        const orderA = visibleOrderById.has(a.id) ? visibleOrderById.get(a.id)! : Number.MAX_SAFE_INTEGER;
        const orderB = visibleOrderById.has(b.id) ? visibleOrderById.get(b.id)! : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return 0;
      });
      return renumberRowsByCategoryOrder(nextRows, categories);
    });
    if (blockedByCategory) {
      showToast("只能在同一个临时分类内调整商品顺序", "error");
    }
    setDraggingRowId(null);
  }, [categories, draggingRowId, renumberRowsByCategoryOrder, showToast, sortedPreview]);

  const pinRowToCategoryTop = useCallback((rowId: string) => {
    const targetRow = rows.find((row) => row.id === rowId);
    if (!targetRow) return;
    const targetGroup = (targetRow.sortGroupNameInput || targetRow.categoryName || "未分组").trim();
    const groupRows = sortedPreview.filter((row) => (row.sortGroupNameInput || row.categoryName || "未分组").trim() === targetGroup);
    if (groupRows[0]?.id === rowId) return;

    const nextGroupIds = [rowId, ...groupRows.map((row) => row.id).filter((id) => id !== rowId)];
    const groupOrderById = new Map(nextGroupIds.map((id, index) => [id, index]));

    setRows((prev) => {
      const sourceOrderById = new Map(prev.map((row, index) => [row.id, index]));
      const nextRows = [...prev].sort((a, b) => {
        const groupA = (a.sortGroupNameInput || a.categoryName || "未分组").trim();
        const groupB = (b.sortGroupNameInput || b.categoryName || "未分组").trim();
        if (groupA === targetGroup && groupB === targetGroup) {
          return (groupOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (groupOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER);
        }
        return (sourceOrderById.get(a.id) ?? 0) - (sourceOrderById.get(b.id) ?? 0);
      });
      return renumberRowsByCategoryOrder(nextRows, categories);
    });
  }, [categories, renumberRowsByCategoryOrder, rows, sortedPreview]);

  const changedCount = useMemo(
    () =>
      rows.filter((row) =>
        (row.skuInput || "") !== (row.sku || "") ||
        (row.sortGroupNameInput || "") !== (row.sortGroupName || "") ||
        (row.sortCategoryNameInput || "") !== (row.sortCategoryName || row.categoryName || "")
      ).length,
    [rows]
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const name = (row.sortGroupNameInput || row.categoryName || "未分组").trim();
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [rows]);

  const visibleRowIds = useMemo(() => sortedPreview.map((row) => row.id), [sortedPreview]);
  const firstRowIdByGroup = useMemo(() => {
    const next = new Map<string, string>();
    sortedPreview.forEach((row) => {
      const groupName = (row.sortGroupNameInput || row.categoryName || "未分组").trim();
      if (!next.has(groupName)) next.set(groupName, row.id);
    });
    return next;
  }, [sortedPreview]);
  const allVisibleSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRowIds.includes(id));

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRowIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);

  const toggleVisibleSelection = useCallback(() => {
    setSelectedRowIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleRowIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleRowIds]));
    });
  }, [allVisibleSelected, visibleRowIds]);

  const saveRows = useCallback(async () => {
    if (!shop?.id) return;
    setIsSaving(true);
    try {
      const updates = rows.map((row) => ({
        id: row.id,
        sku: row.skuInput.trim(),
        costPrice: Number(row.costPrice || 0),
        sortGroupName: row.sortGroupNameInput.trim(),
        sortCategoryName: row.sortGroupNameInput.trim(),
      }));
      const res = await fetch(`/api/shops/${shop.id}/products/batch`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "应用排序失败", "error");
        return;
      }
      localStorage.removeItem(getShopSortDraftKey(shop.id));
      setHasRestoredDraft(false);
      showToast(`已应用 ${updates.length} 件店铺商品排序`, "success");
      await onSaved();
      onClose();
    } catch (error) {
      console.error("Failed to save shop sort rows:", error);
      showToast("应用排序失败", "error");
    } finally {
      setIsSaving(false);
    }
  }, [onClose, onSaved, rows, shop?.id, showToast]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="shop-sort-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-9998 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        key="shop-sort-panel"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        className="fixed inset-0 z-9999 mx-auto flex max-w-7xl flex-col overflow-hidden border border-border bg-background shadow-2xl sm:inset-x-6 sm:top-4 sm:bottom-4 sm:rounded-2xl"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">店铺商品排序</h2>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                草稿自动保存
              </span>
              {hasRestoredDraft && (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  已恢复草稿
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{shop?.name || "当前店铺"} · 只有点击“应用到店铺”才会改正式店内码</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={fillGroupsFromOriginalCategory} className="h-9 rounded-xl border border-border px-3 text-xs font-bold text-foreground hover:bg-muted/60">用原分类初始化</button>
            <button type="button" onClick={autoNumberByGroup} className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90"><ListOrdered size={15} />生成店内码</button>
            <button type="button" onClick={() => { void saveRows(); }} disabled={isSaving || rows.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save size={15} />{isSaving ? "应用中" : `应用到店铺${changedCount ? ` ${changedCount}` : ""}`}</button>
            <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted/60" title="关闭"><X size={16} /></button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-border p-3 sm:p-4 md:grid-cols-[160px_minmax(0,1fr)_260px] lg:grid-cols-[160px_minmax(0,1fr)_260px]">
          <label className="text-xs font-medium text-muted-foreground">
            起始店内码
            <input value={startNumber} onChange={(e) => setStartNumber(e.target.value)} placeholder="如 1001 / N1 / A001" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
          </label>
          
          <div className="flex flex-col justify-end">
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center justify-between">
              <span>搜索商品</span>
              <span className="hidden sm:inline text-[11px] text-muted-foreground/60">支持 N1、A001；每个分类单独占位</span>
            </label>
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索商品名称、店内码、分类..."
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="清空搜索"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-end">
            <span className="text-xs font-medium text-muted-foreground mb-1">新建临时分类</span>
            <div className="flex items-center gap-2">
              <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} placeholder="新建临时分类" className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
              <button type="button" onClick={addCategory} className="h-10 shrink-0 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">新建</button>
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <aside className="custom-scrollbar shop-sort-scrollbar max-h-[42vh] min-h-0 overflow-y-auto border-b border-border bg-muted/20 p-3 lg:max-h-none lg:border-b-0 lg:border-r">
            <button
              type="button"
              onClick={() => setSelectedCategoryName("all")}
              className={cn(
                "mb-2 flex h-10 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold transition-colors",
                selectedCategoryName === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              <span>全部临时分类</span>
              <span>{rows.length}</span>
            </button>
            <div className="space-y-2">
              {categories.map((category, index) => (
                <div
                  key={category.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleCategoryDrop(category.id)}
                  className={cn(
                    "rounded-xl border border-border bg-background p-2 transition-colors",
                    selectedCategoryName === category.name && "border-primary bg-primary/5",
                    draggingCategoryId === category.id && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", category.id);
                        setDraggingCategoryId(category.id);
                      }}
                      onDragEnd={() => setDraggingCategoryId(null)}
                      onClick={() => setSelectedCategoryName(category.name)}
                      className="h-8 w-7 cursor-grab rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
                      title="拖动分类排序"
                    >
                      ::
                    </button>
                    <div className="flex min-w-0 flex-1 items-center">
                      <div className="relative h-8 max-w-[120px] shrink-0">
                        <span aria-hidden className="invisible block whitespace-pre pr-1 text-sm font-semibold">
                          {category.name || " "}
                        </span>
                        <input
                          value={category.name}
                          onChange={(e) => renameCategory(category.id, e.target.value)}
                          className="absolute inset-0 h-8 w-full bg-transparent text-sm font-semibold text-foreground outline-none"
                        />
                      </div>
                      <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">{categoryCounts.get(category.name) || 0}</span>
                    </div>
                    <label className="flex h-8 w-24 shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2 text-[10px] font-bold text-muted-foreground">
                      <span>占</span>
                      <input
                        value={category.rangeSize}
                        onChange={(e) => updateCategoryRange(category.id, e.target.value)}
                        type="number"
                        step="1"
                        min="1"
                        placeholder="自动"
                        className="min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <button type="button" onClick={() => pinCategoryToTop(category.id)} disabled={index === 0} className="h-8 rounded-lg border border-border text-xs font-bold text-muted-foreground disabled:opacity-40">置顶</button>
                    <button type="button" onClick={() => setDeleteCategoryTarget(category)} className="h-8 rounded-lg border border-rose-500/20 text-xs font-bold text-rose-500 hover:bg-rose-500/10">删除</button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">还没有可用分类</div>
              )}
            </div>
          </aside>

          <div className="custom-scrollbar shop-sort-scrollbar min-h-0 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">正在加载排序商品...</div>
          ) : (
            <>
            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
              <div className="text-xs font-medium text-muted-foreground">
                已选 <strong className="text-foreground">{selectedRowIds.length}</strong> 件，当前显示 <strong className="text-foreground">{sortedPreview.length}</strong> 件
                {rows.length !== sortedPreview.length && (
                  <span className="ml-1 text-muted-foreground/60">(共 {rows.length} 件)</span>
                )}
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  清除搜索「{searchQuery}」
                </button>
              )}
            </div>
            <div className="space-y-2 p-3 md:hidden">
              {sortedPreview.map((row, index) => (
                <div
                  key={row.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleRowDrop(row.id)}
                  className={cn(
                    "rounded-xl border border-border bg-background p-3 transition-colors",
                    draggingRowId === row.id && "opacity-60"
                  )}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", row.id);
                        setDraggingRowId(row.id);
                      }}
                      onDragEnd={() => setDraggingRowId(null)}
                      className="h-8 w-6 shrink-0 cursor-grab rounded-lg text-muted-foreground active:cursor-grabbing"
                      title="拖动调整商品顺序"
                    >
                      ::
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRowSelection(row.id)}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        selectedRowIds.includes(row.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/20"
                      )}
                      title="选择商品"
                    >
                      {selectedRowIds.includes(row.id) && <Check size={12} strokeWidth={4} />}
                    </button>
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50">
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Store size={16} className="text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-bold text-foreground">{row.name}</div>
                      <div className="mt-1 text-xs font-bold text-muted-foreground">顺序 {index + 1}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pinRowToCategoryTop(row.id)}
                      disabled={firstRowIdByGroup.get((row.sortGroupNameInput || row.categoryName || "未分组").trim()) === row.id}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
                      title="置顶到当前分类"
                    >
                      <ArrowUp size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-bold text-muted-foreground">
                      店内码
                      <input value={row.skuInput} onChange={(e) => updateRow(row.id, "skuInput", e.target.value)} placeholder="店内码" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                    <label className="text-[11px] font-bold text-muted-foreground">
                      临时分类
                      <input value={row.sortGroupNameInput} onChange={(e) => updateRow(row.id, "sortGroupNameInput", e.target.value)} placeholder="临时分类" className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
                    </label>
                  </div>
                </div>
              ))}
              {rows.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">当前店铺还没有商品可排序</div>
              ) : sortedPreview.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  未找到与「{searchQuery}」相关的商品
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="ml-2 text-xs font-bold text-primary hover:underline"
                    >
                      清空搜索
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <table className="hidden w-full min-w-[760px] text-left text-sm md:table">
              <thead className="sticky top-0 z-10 bg-muted/80 text-center text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-24 px-3 py-3"></th>
                  <th className="w-20 px-3 py-3 text-center">顺序</th>
                  <th className="w-32 px-3 py-3 text-center">店内码</th>
                  <th className="w-44 px-3 py-3 text-center">临时分类</th>
                  <th className="px-3 py-3 text-center">商品</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedPreview.map((row, index) => (
                  <tr
                    key={row.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleRowDrop(row.id)}
                    className={cn("hover:bg-muted/30", draggingRowId === row.id && "opacity-60")}
                  >
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => pinRowToCategoryTop(row.id)}
                        disabled={firstRowIdByGroup.get((row.sortGroupNameInput || row.categoryName || "未分组").trim()) === row.id}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35"
                        title="置顶到当前分类"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", row.id);
                          setDraggingRowId(row.id);
                        }}
                        onDragEnd={() => setDraggingRowId(null)}
                        className="h-7 w-5 cursor-grab rounded text-muted-foreground active:cursor-grabbing"
                        title="拖动调整商品顺序"
                      >
                        ::
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRowSelection(row.id)}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all",
                          selectedRowIds.includes(row.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-muted/20 hover:border-primary/60"
                        )}
                        title="选择商品"
                      >
                        {selectedRowIds.includes(row.id) && <Check size={12} strokeWidth={4} />}
                      </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-bold text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2">
                      <input value={row.skuInput} onChange={(e) => updateRow(row.id, "skuInput", e.target.value)} placeholder="店内码" className="h-9 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm outline-none focus:border-primary" />
                    </td>
                    <td className="px-3 py-2">
                      <input value={row.sortGroupNameInput} onChange={(e) => updateRow(row.id, "sortGroupNameInput", e.target.value)} placeholder="临时分类" className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50">
                          {row.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Store size={16} className="text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="min-w-0 font-medium text-foreground line-clamp-1">{row.name}</div>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">当前店铺还没有商品可排序</td>
                  </tr>
                ) : sortedPreview.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                      未找到与「{searchQuery}」相关的商品
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="ml-2 text-xs font-bold text-primary hover:underline"
                        >
                          清空搜索
                        </button>
                      )}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </>
          )}
          </div>
        </div>
        <AnimatePresence>
          {selectedRowIds.length > 0 && (
            <motion.div
              key="shop-sort-batch-bar"
              initial={{ y: 80, x: "-50%", opacity: 0 }}
              animate={{ y: 0, x: "-50%", opacity: 1 }}
              exit={{ y: 80, x: "-50%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="absolute bottom-4 left-1/2 z-30 w-[calc(100%-1rem)] pointer-events-none sm:w-fit sm:max-w-[calc(100%-2rem)]"
            >
              <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[24px] glass-panel px-3 py-2 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] sm:h-12 sm:flex-nowrap sm:gap-5 sm:rounded-full sm:px-6 sm:py-0">
                <button
                  type="button"
                  onClick={toggleVisibleSelection}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    allVisibleSelected
                      ? "border-foreground bg-foreground text-background dark:text-black"
                      : "border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20"
                  )}
                  title={allVisibleSelected ? "取消当前显示" : "全选当前显示"}
                >
                  {allVisibleSelected && <Check size={12} strokeWidth={4} />}
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-3">
                  <span className="truncate whitespace-nowrap text-[13px] font-black text-black dark:text-white sm:text-sm">
                    已选 <span className="font-number">{selectedRowIds.length}</span> 件商品
                  </span>
                  <span className="hidden text-[10px] font-bold uppercase tracking-widest text-black/40 dark:text-white/40 md:inline">批量转移</span>
                </div>
                <div className="h-9 w-44 sm:h-8 sm:w-52">
                  <CustomSelect
                    value={batchTargetCategoryName}
                    onChange={setBatchTargetCategoryName}
                    options={[
                      { value: "", label: "选择临时分类" },
                      ...categories.map((category) => ({ value: category.name, label: category.name })),
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full border border-border bg-background/90 px-3 text-xs font-bold text-foreground hover:bg-muted/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyBatchTargetCategory}
                  className="h-9 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-xs font-black text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] sm:h-8 sm:px-5"
                >
                  转移
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRowIds([])}
                  className="h-9 w-9 shrink-0 rounded-full text-black/40 transition-all hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white sm:h-auto sm:w-auto sm:p-2"
                  title="清空选择"
                >
                  <X size={20} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {deleteCategoryTarget && (
            <motion.div
              key="delete-category-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
              onClick={() => setDeleteCategoryTarget(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 18, scale: 0.96 }}
                className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-base font-bold text-foreground">删除临时分类</div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  确定删除「{deleteCategoryTarget.name}」吗？
                  {(categoryCounts.get(deleteCategoryTarget.name) || 0) > 0
                    ? ` 该分类下 ${categoryCounts.get(deleteCategoryTarget.name) || 0} 件商品会移到「未分组」。`
                    : ""}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteCategoryTarget(null)}
                    className="h-10 rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted/60"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCategory(deleteCategoryTarget)}
                    className="h-10 rounded-xl bg-rose-500 px-4 text-sm font-bold text-white hover:bg-rose-600"
                  >
                    删除
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default function ShopGoodsPage() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [shops, setShops] = useState<Shop[]>([]);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [selectedShopId, setSelectedShopId] = useState("");
  
  const [libraries, setLibraries] = useState<any[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<string>("all");
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const filteredShops = useMemo(() => {
    return shops.filter(
      (shop) => !activeLibraryId || activeLibraryId === "all" || shop.libraryId === activeLibraryId
    );
  }, [shops, activeLibraryId]);

  // 当切换商品库导致店铺列表发生变化时，自动联动更新选中的店铺，防止出现跨库店铺被保留选中的情况
  useEffect(() => {
    if (filteredShops.length > 0) {
      const isCurrentShopValid = filteredShops.some((shop) => shop.id === selectedShopId);
      if (!isCurrentShopValid) {
        setSelectedShopId(filteredShops[0].id);
      }
    } else {
      setSelectedShopId("");
    }
  }, [filteredShops, selectedShopId]);

  useEffect(() => {
    fetch("/api/product-libraries")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setLibraries(data);
          if (data.length > 0) {
            setActiveLibraryId(data[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);
  const [items, setItems] = useState<ShopCatalogItem[]>([]);
  const itemsRef = useRef<ShopCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNextPageLoading, setIsNextPageLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalResults, setTotalResults] = useState(0);
  const currentPageRef = useRef(1);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 400);
  const [viewMode, setViewMode] = useState<"card" | "quickEdit">("card");

  const handleQuickSaveItem = useCallback(
    async (id: string, updates: { sku: string; costPrice: number }) => {
      if (!selectedShopId) return false;
      try {
        const item = items.find((i) => i.id === id);
        if (!item) return false;

        const res = await fetch(`/api/shops/${selectedShopId}/products`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            sku: updates.sku,
            name: item.name,
            costPrice: updates.costPrice,
            image: item.image || "",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          showToast(data?.error || "保存失败", "error");
          return false;
        }
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, sku: updates.sku, costPrice: updates.costPrice } : i))
        );
        return true;
      } catch {
        showToast("保存异常", "error");
        return false;
      }
    },
    [selectedShopId, items, showToast]
  );

  const handleQuickBatchSave = useCallback(
    async (updates: Array<{ id: string; sku: string; costPrice: number }>) => {
      if (!selectedShopId) return false;
      try {
        const res = await fetch(`/api/shops/${selectedShopId}/products/batch`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          showToast(data?.error || "批量保存失败", "error");
          return false;
        }
        const updateMap = new Map(updates.map((u) => [u.id, u]));
        setItems((prev) =>
          prev.map((item) => {
            const u = updateMap.get(item.id);
            return u ? { ...item, sku: u.sku, costPrice: u.costPrice } : item;
          })
        );
        return true;
      } catch {
        showToast("批量保存异常", "error");
        return false;
      }
    },
    [selectedShopId, showToast]
  );
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSupplier, setSelectedSupplier] = useState("all");
  const [sortBy, setSortBy] = useState("sku-desc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [assignedTemplateIds, setAssignedTemplateIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isMeituanMappingOpen, setIsMeituanMappingOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [editingShopId, setEditingShopId] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const editScrollTopRef = useRef<number | null>(null);
  const autoOpenedEditKeyRef = useRef("");
  const autoLookupEditKeyRef = useRef("");
  const isFetchingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const hasMoreRef = useRef(true);
  const requestedShopId = String(searchParams.get("shopId") || "").trim();
  const requestedEditItemId = String(searchParams.get("editItemId") || "").trim();

  const selectedShop = useMemo(
    () => shops.find((shop) => shop.id === selectedShopId) || null,
    [selectedShopId, shops]
  );
  const hasMultipleShops = filteredShops.length > 1;

  const templateCatalogQuery = useMemo(
    () => {
      const nextQuery: Record<string, string> = { includePublic: "true" };
      if (selectedShopId) {
        nextQuery.shopId = selectedShopId;
        nextQuery.shopFilterMode = "unassigned";
      }
      return nextQuery;
    },
    [selectedShopId]
  );

  const categoryOptions = useMemo(() => {
    const names = Array.from(new Set([
      ...categories.map((category) => String(category.name || "").trim()),
      ...items.map((item) => String(item.categoryName || "").trim() || "未分类"),
    ].filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "zh-CN"));

    return [{ value: "all", label: "全部分类" }, ...names.map((name) => ({ value: name, label: name }))];
  }, [categories, items]);

  const displayedItems = useMemo(
    () =>
      items.map((item) => {
        const matchedSupplier = suppliers.find((s) => s.id === item.supplierId);
        return {
          ...item,
          displayId: item.id,
          linkedIds: [item.id],
          shopNames: item.shopName ? [item.shopName] : [],
          supplier: matchedSupplier ? { id: matchedSupplier.id, name: matchedSupplier.name } : undefined,
        };
      }),
    [items, suppliers]
  );

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch("/api/shops?source=shipping-addresses");
        const data = await res.json().catch(() => ({ shops: [] }));
        if (!res.ok) {
          showToast(data?.error || "店铺加载失败", "error");
          setShops([]);
          setNeedsAddress(false);
          return;
        }
        setNeedsAddress(Boolean(data?.needsAddress));
        const nextShops: Shop[] = Array.isArray(data?.shops) ? data.shops : [];
        setShops(nextShops);
        setSelectedShopId((current) => {
          if (requestedShopId && nextShops.some((shop) => shop.id === requestedShopId)) {
            return requestedShopId;
          }
          if (current && nextShops.some((shop) => shop.id === current)) return current;
          return nextShops[0]?.id || "";
        });
      } catch (error) {
        console.error("Failed to fetch shops:", error);
        showToast("店铺加载失败", "error");
        setNeedsAddress(false);
        setSelectedShopId("");
      }
    };
    void fetchShops();
  }, [showToast]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) setCategories(data);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    const fetchSuppliers = async () => {
      try {
        const res = await fetch("/api/suppliers");
        const data = await res.json().catch(() => []);
        if (res.ok && Array.isArray(data)) setSuppliers(data);
      } catch (error) {
        console.error("Failed to fetch suppliers:", error);
      }
    };
    void fetchCategories();
    void fetchSuppliers();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      setShowScrollTop(scrollTop > 10);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const buildAggregateQuery = useCallback((page: number, extra?: Record<string, string>) => {
    const queryParams = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      search: debouncedSearch,
      categoryName: selectedCategory,
      supplierId: selectedSupplier,
      sortBy,
      ...(selectedShopId ? { shopId: selectedShopId } : {}),
      ...(activeLibraryId && activeLibraryId !== "all" ? { libraryId: activeLibraryId } : {}),
      ...extra,
    });
    return queryParams;
  }, [debouncedSearch, selectedCategory, selectedShopId, selectedSupplier, sortBy, activeLibraryId]);

  const fetchShopProducts = useCallback(async (isFirstPage = true) => {
    if (!selectedShopId) {
      requestVersionRef.current += 1;
      isFetchingRef.current = false;
      setItems([]);
      setHasMore(false);
      setTotalResults(0);
      setIsLoading(false);
      setIsNextPageLoading(false);
      return;
    }

    // 防抢跑卫语句：如果当前选中的店铺已不属于当前选中的库，暂不发送请求，等联动重置完成后再发送
    const isCurrentShopValid = filteredShops.some((shop) => shop.id === selectedShopId);
    if (!isCurrentShopValid) {
      return;
    }

    // 只有在加载下一页时才拦截重复请求
    // 重新加载第一页数据（如切换筛选条件、切换店铺或初始化）时，应该允许发起请求，并通过版本号（requestVersion）机制处理并发
    if (isFetchingRef.current && !isFirstPage) {
      return;
    }

    const requestVersion = isFirstPage ? requestVersionRef.current + 1 : requestVersionRef.current;
    if (isFirstPage) {
      requestVersionRef.current = requestVersion;
      currentPageRef.current = 1;
      setHasMore(true);
      hasMoreRef.current = true;
      setIsLoading(true);
      setIsNextPageLoading(false);
    } else {
      if (!hasMoreRef.current) return;
      setIsNextPageLoading(true);
    }

    isFetchingRef.current = true;

    try {
      const targetPage = isFirstPage ? 1 : currentPageRef.current + 1;

      const res = await fetch(`/api/shop-products?${buildAggregateQuery(targetPage).toString()}`);
      const data: ShopProductsResponse = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Failed to fetch shop products");

      if (requestVersion !== requestVersionRef.current) {
        return;
      }

      if (isFirstPage) {
        setItems(data.items || []);
      } else {
        setItems((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          return [...prev, ...((data.items || []).filter((item) => !existingIds.has(item.id)))];
        });
      }

      currentPageRef.current = targetPage;
      setHasMore(Boolean(data.hasMore));
      setTotalResults(data.total || 0);
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) {
        return;
      }
      console.error("Failed to fetch shop products:", error);
      showToast("加载店铺商品失败", "error");
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsLoading(false);
        setIsNextPageLoading(false);
        isFetchingRef.current = false;
      }
    }
  }, [buildAggregateQuery, selectedShopId, showToast, filteredShops]);

  useEffect(() => {
    setItems([]);
    setSelectedIds([]);
    void fetchShopProducts(true);
  }, [fetchShopProducts, activeLibraryId]);

  useEffect(() => {
    const fetchAssignedTemplateIds = async () => {
      if (!isPickerOpen || !selectedShopId) {
        setAssignedTemplateIds([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          all: "true",
          pageSize: "2000",
        });
        const res = await fetch(`/api/shops/${selectedShopId}/products?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to fetch assigned template ids");
        }

        const nextIds = Array.isArray(data?.items)
          ? data.items
              .map((item: ShopCatalogItem) => String(item.productId || item.sourceProductId || "").trim())
              .filter(Boolean)
          : [];

        setAssignedTemplateIds(Array.from(new Set(nextIds)));
      } catch (error) {
        console.error("Failed to fetch assigned template ids:", error);
        setAssignedTemplateIds([]);
      }
    };

    void fetchAssignedTemplateIds();
  }, [isPickerOpen, selectedShopId]);

  useEffect(() => {
    if (!hasMore || isLoading || isNextPageLoading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void fetchShopProducts(false);
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [fetchShopProducts, hasMore, isLoading, isNextPageLoading]);

  const lastSelectedIdRef = useRef<string | null>(null);

  const handleToggleSelect = useCallback((id: string, e?: React.MouseEvent) => {
    if (e?.shiftKey && lastSelectedIdRef.current) {
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
      const allIds = displayedItems.map((p) => p.displayId);
      const lastIndex = allIds.indexOf(lastSelectedIdRef.current);
      const currentIndex = allIds.indexOf(id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = allIds.slice(start, end + 1);

        setSelectedIds((prev) => {
          const nextSet = new Set(prev);
          rangeIds.forEach((rangeId) => nextSet.add(rangeId));
          return Array.from(nextSet);
        });
        lastSelectedIdRef.current = id;
        return;
      }
    }

    setSelectedIds((prev) => {
      const isSelecting = !prev.includes(id);
      if (isSelecting) {
        lastSelectedIdRef.current = id;
        return [...prev, id];
      } else {
        lastSelectedIdRef.current = null;
        return prev.filter((item) => item !== id);
      }
    });
  }, [displayedItems]);

  const handleToggleSelectAll = useCallback(async () => {
    if (selectedIds.length === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds([]);
      return;
    }
    try {
      const queryParams = buildAggregateQuery(1, { idsOnly: "true" });
      const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "获取商品失败", "error");
        return;
      }
      setSelectedIds(Array.isArray(data?.ids) ? data.ids : []);
    } catch (error) {
      console.error("Failed to fetch shop product ids:", error);
      showToast("获取商品失败", "error");
    }
  }, [buildAggregateQuery, displayedItems, selectedIds.length, showToast]);

  const handleAssignProducts = useCallback(async (products: Product[]) => {
    if (!selectedShop || products.length === 0) return;
    try {
      const res = await fetch(`/api/shops/${selectedShop.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: products.map((product) => product.id) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(data?.error || "复制商品失败", "error");
        return;
      }
      showToast(data?.message || `已复制到 ${selectedShop.name}`, "success");
      setIsPickerOpen(false);
      void fetchShopProducts(true);
    } catch (error) {
      console.error("Failed to assign products:", error);
      showToast("复制商品失败", "error");
    }
  }, [fetchShopProducts, selectedShop, showToast]);

  const handleCreateStandaloneProduct = useCallback(async (formData: Omit<Product, "id"> & { id?: string }) => {
    if (!selectedShop) {
      showToast("请先选择店铺", "error");
      return;
    }

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: formData.sku?.trim() || "",
          jdSkuId: formData.jdSkuId?.trim() || "",
          name: formData.name.trim(),
          categoryId: formData.categoryId || "",
          supplierId: formData.supplierId || "",
          image: formData.image?.trim() || "",
          costPrice: formData.costPrice ?? 0,
          stock: formData.stock ?? 0,
          isPublic: formData.isPublic ?? true,
          isDiscontinued: formData.isDiscontinued ?? false,
          remark: formData.remark?.trim() || "",
          specs: {},
          shopId: selectedShop.id,
          isShopOnly: true,
        }),
      });

      const result = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(result?.error || "创建店铺商品失败");
      }

      setIsCreateOpen(false);
      showToast(`已在 ${selectedShop.name} 新建商品`, "success");
      await fetchShopProducts(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建店铺商品失败";
      showToast(message, "error");
      throw error;
    }
  }, [fetchShopProducts, selectedShop, showToast]);

  const fetchSelectedItems = useCallback(async () => {
    if (selectedIds.length === 0) return [] as ShopCatalogItem[];
    try {
      const queryParams = buildAggregateQuery(1, {
        ids: selectedIds.join(","),
        pageSize: String(selectedIds.length),
      });
      const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
      const data: ShopProductsResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error("Failed to fetch selected shop products");
      }
      return Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      console.error("Failed to fetch selected shop products:", error);
      throw error;
    }
  }, [buildAggregateQuery, selectedIds]);

  const handleRemoveSelected = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const selectedItems = (await fetchSelectedItems()).filter((item) => item.shopId);
    const grouped = selectedItems.reduce<Record<string, string[]>>((acc, item) => {
      const shopId = item.shopId!;
      if (!acc[shopId]) acc[shopId] = [];
      acc[shopId].push(item.id);
      return acc;
    }, {});
    const shopIds = Object.keys(grouped);
    if (shopIds.length === 0) {
      showToast("未找到可删除的店铺商品", "error");
      return;
    }
    try {
      const results = await Promise.all(shopIds.map(async (shopId) => {
        const res = await fetch(`/api/shops/${shopId}/products`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: grouped[shopId] }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "删除商品失败");
        return data;
      }));
      const removedCount = results.reduce((sum, result) => sum + Number(result?.count || 0), 0);
      showToast(`已删除 ${removedCount} 个店铺商品`, "success");
      setSelectedIds([]);
      void fetchShopProducts(true);
    } catch (error) {
      console.error("Failed to remove products from shops:", error);
      showToast(error instanceof Error ? error.message : "删除商品失败", "error");
    }
  }, [fetchSelectedItems, fetchShopProducts, selectedIds, showToast]);

  const openEditModal = useCallback(async (item: ShopCatalogItem) => {
    editScrollTopRef.current = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const targetShopId = item.shopId || selectedShopId || "";
    let latestItem = item;
    if (targetShopId) {
      try {
        const queryParams = buildAggregateQuery(1, {
          ids: item.id,
          pageSize: "1",
          shopId: targetShopId,
        });
        const res = await fetch(`/api/shop-products?${queryParams.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({})) as ShopProductsResponse & { error?: string };
        if (res.ok && Array.isArray(data.items) && data.items[0]) {
          latestItem = data.items[0];
          setItems((prev) => prev.map((current) => current.id === latestItem.id ? latestItem : current));
        }
      } catch (error) {
        console.error("Failed to refresh shop product before edit:", error);
      }
    }

    setEditingItemId(latestItem.id);
    setEditingShopId(latestItem.shopId || targetShopId);
    setEditingProduct({
      id: latestItem.id,
      sku: latestItem.sku || "",
      jdSkuId: latestItem.jdSkuId || "",
      meituanSkuId: latestItem.meituanSkuId || "",
      meituanSkuIds: latestItem.meituanSkuIds || [],
      taobaoSkuId: latestItem.taobaoSkuId || "",
      name: latestItem.name,
      categoryId: latestItem.categoryId || "",
      costPrice: latestItem.costPrice || 0,
      stock: latestItem.stock || 0,
      image: latestItem.image || "",
      supplierId: latestItem.supplierId || "",
      isPublic: latestItem.isPublic ?? true,
      isDiscontinued: latestItem.isDiscontinued ?? false,
      specs: latestItem.specs || {},
      remark: latestItem.remark || "",
      isShelfLife: latestItem.isShelfLife ?? false,
      shelfLifeDays: latestItem.shelfLifeDays ?? null,
    });
    setIsEditOpen(true);
  }, [buildAggregateQuery, selectedShopId]);

  useEffect(() => {
    if (!requestedShopId || !requestedEditItemId) {
      return;
    }
    if (selectedShopId !== requestedShopId || isEditOpen || items.length === 0) {
      return;
    }

    const target = items.find((item) => item.id === requestedEditItemId);
    const currentKey = `${requestedShopId}:${requestedEditItemId}`;
    if (autoOpenedEditKeyRef.current === currentKey) {
      return;
    }

    if (target) {
      autoOpenedEditKeyRef.current = currentKey;
      void openEditModal(target);
      return;
    }

    if (autoLookupEditKeyRef.current === currentKey) {
      return;
    }
    autoLookupEditKeyRef.current = currentKey;

    let cancelled = false;
    const fetchTargetItem = async () => {
      try {
        const queryParams = buildAggregateQuery(1, {
          ids: requestedEditItemId,
          pageSize: "1",
          shopId: requestedShopId,
        });
        const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
        const data = await res.json().catch(() => ({})) as ShopProductsResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data?.error || "读取待回填商品失败");
        }
        const fetchedItem = Array.isArray(data.items) ? data.items[0] : null;
        if (!fetchedItem || cancelled) {
          return;
        }
        setItems((prev) => (
          prev.some((item) => item.id === fetchedItem.id) ? prev : [fetchedItem, ...prev]
        ));
        autoOpenedEditKeyRef.current = currentKey;
        void openEditModal(fetchedItem);
      } catch (error) {
        console.error("Failed to fetch requested edit item:", error);
      }
    };

    void fetchTargetItem();
    return () => {
      cancelled = true;
    };
  }, [buildAggregateQuery, isEditOpen, items, openEditModal, requestedEditItemId, requestedShopId, selectedShopId]);

  const restoreEditScrollPosition = useCallback(() => {
    const scrollTop = editScrollTopRef.current;
    if (scrollTop === null) return;

    const restore = () => {
      window.scrollTo({ top: scrollTop, behavior: "auto" });
      document.documentElement.scrollTo({ top: scrollTop, behavior: "auto" });
      document.body.scrollTo({ top: scrollTop, behavior: "auto" });
    };

    restore();
    requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 0);
    });
    editScrollTopRef.current = null;
  }, []);

  const closeEditModal = useCallback(() => {
    setIsEditOpen(false);
    setEditingProduct(null);
    setEditingItemId("");
    setEditingShopId("");
    restoreEditScrollPosition();
  }, [restoreEditScrollPosition]);

  const handleEditSelected = useCallback(() => {
    if (selectedIds.length !== 1) {
      showToast("请选择 1 个商品进行编辑", "error");
      return;
    }
    const target = displayedItems.find((item) => item.displayId === selectedIds[0]);
    if (!target) {
      showToast("未找到要编辑的店铺商品", "error");
      return;
    }
    const rawTarget = items.find((item) => item.id === target.linkedIds[0]);
    if (!rawTarget) {
      showToast("未找到要编辑的店铺商品", "error");
      return;
    }
    void openEditModal(rawTarget);
  }, [displayedItems, items, openEditModal, selectedIds, showToast]);

  const handleSaveEdit = useCallback(async (formData: Omit<Product, "id"> & { id?: string }) => {
    if (!editingShopId || !editingItemId) return;
    let nextCategories = categories;
    if (!nextCategories.some((category) => category.id === formData.categoryId)) {
      try {
        const res = await fetch("/api/categories");
        const refreshed = await res.json().catch(() => []);
        if (res.ok && Array.isArray(refreshed)) {
          nextCategories = refreshed;
          setCategories(refreshed);
        }
      } catch (error) {
        console.error("Failed to refresh categories:", error);
      }
    }
    const categoryName = nextCategories.find((category) => category.id === formData.categoryId)?.name || "未分类";
    try {
      const res = await fetch(`/api/shops/${editingShopId}/products`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingItemId,
          sku: formData.sku?.trim() || "",
          jdSkuId: formData.jdSkuId?.trim() || "",
          taobaoSkuId: formData.taobaoSkuId?.trim() || "",
          name: formData.name.trim(),
          categoryId: formData.categoryId,
          categoryName,
          image: formData.image?.trim() || "",
          supplierId: formData.supplierId || "",
          costPrice: formData.costPrice ?? 0,
          stock: formData.stock ?? 0,
          isPublic: formData.isPublic ?? true,
          isDiscontinued: formData.isDiscontinued ?? false,
          remark: formData.remark?.trim() || "",
          specs: formData.specs || {},
          isShelfLife: formData.isShelfLife,
          shelfLifeDays: formData.isShelfLife ? (Number(formData.shelfLifeDays) || null) : null,
        }),
      });
      const responseData = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(responseData?.error || "保存失败", "error");
        return;
      }
      setItems((prev) => prev.map((item) => (item.id === responseData.id ? { ...item, ...responseData, shopId: item.shopId, shopName: item.shopName } : item)));
      closeEditModal();
      showToast("店铺商品已更新", "success");
    } catch (error) {
      console.error("Failed to update shop product:", error);
      showToast("保存失败", "error");
    }
  }, [categories, closeEditModal, editingItemId, editingShopId, showToast]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleBatchUpdate = useCallback(async (updateData: {
    categoryId?: string;
    supplierId?: string;
    isPublic?: boolean;
    isDiscontinued?: boolean;
    costPrice?: number;
    stock?: number;
    isShelfLife?: boolean;
    shelfLifeDays?: number;
  }) => {
    if (selectedIds.length === 0) return;
    const categoryName = updateData.categoryId
      ? categories.find((category) => category.id === updateData.categoryId)?.name || "未分类"
      : undefined;
    const selectedItems = (await fetchSelectedItems()).filter((item) => item.shopId);
    const grouped = selectedItems.reduce<Record<string, string[]>>((acc, item) => {
      const shopId = item.shopId!;
      if (!acc[shopId]) acc[shopId] = [];
      acc[shopId].push(item.id);
      return acc;
    }, {});
    try {
      await Promise.all(Object.entries(grouped).map(async ([shopId, ids]) => {
        const res = await fetch(`/api/shops/${shopId}/products`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, ...updateData, categoryName }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "批量更新失败");
      }));
      setItems((prev) => prev.map((item) => {
        if (!selectedIds.includes(item.id)) return item;
        return {
          ...item,
          ...(updateData.categoryId ? { categoryId: updateData.categoryId, categoryName } : {}),
          ...(updateData.supplierId !== undefined ? { supplierId: updateData.supplierId || null } : {}),
          ...(updateData.costPrice !== undefined ? { costPrice: updateData.costPrice } : {}),
          ...(updateData.stock !== undefined ? { stock: updateData.stock } : {}),
          ...(updateData.isPublic !== undefined ? { isPublic: updateData.isPublic } : {}),
          ...(updateData.isShelfLife !== undefined ? { isShelfLife: updateData.isShelfLife } : {}),
          ...(updateData.shelfLifeDays !== undefined ? { shelfLifeDays: updateData.shelfLifeDays } : {}),
        };
      }));
      setSelectedIds([]);
      setIsBatchEditOpen(false);
      showToast(`成功更新 ${selectedItems.length} 个商品`, "success");
    } catch (error) {
      console.error("Failed to batch update shop products:", error);
      showToast(error instanceof Error ? error.message : "批量更新请求失败", "error");
    }
  }, [categories, fetchSelectedItems, selectedIds, showToast]);

  const [exportProgress, setExportProgress] = useState<{ isOpen: boolean; current: number; total: number } | null>(null);
  const exportCancelledRef = useRef(false);

  const handleCancelExport = useCallback(() => {
    exportCancelledRef.current = true;
  }, []);

  const handleExport = useCallback(async () => {
    exportCancelledRef.current = false;
    try {
      let exportItems: ShopCatalogItem[];

      if (selectedIds.length > 0) {
        showToast(`正在导出 ${selectedIds.length} 件选中店铺商品...`, "info");
        exportItems = await fetchSelectedItems();
      } else {
        showToast("正在获取店铺商品数据...", "info");
        const queryParams = buildAggregateQuery(1, { pageSize: "2000" });
        const res = await fetch(`/api/shop-products?${queryParams.toString()}`);
        const data: ShopProductsResponse = await res.json().catch(() => ({}));
        exportItems = Array.isArray(data.items) ? data.items : [];
      }

      if (exportItems.length === 0) {
        showToast("没有可导出的店铺商品", "error");
        return;
      }

      // 按店铺和商品分类（种类）归类排序，未分类放在最后，同一分类内按商品名称排序
      exportItems.sort((a, b) => {
        const shopA = a.shopName || "";
        const shopB = b.shopName || "";
        if (shopA !== shopB) {
          return shopA.localeCompare(shopB, "zh-CN");
        }
        const catA = a.categoryName || "未分类";
        const catB = b.categoryName || "未分类";
        if (catA !== catB) {
          if (catA === "未分类") return 1;
          if (catB === "未分类") return -1;
          return catA.localeCompare(catB, "zh-CN");
        }
        return (a.name || "").localeCompare(b.name || "", "zh-CN");
      });

      setExportProgress({ isOpen: true, current: 0, total: exportItems.length });

      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Goods Manager";
      workbook.lastModifiedBy = "Goods Manager";
      workbook.created = new Date();
      workbook.modified = new Date();

      const sheetName = selectedShop?.name || "店铺商品";
      const worksheet = workbook.addWorksheet(sheetName);

      const columnsConfig = [
        { header: "店铺", key: "shopName", width: 20, align: "center" as const },
        { header: "主图", key: "image", width: 22, align: "center" as const },
        { header: "商品名称", key: "name", width: 36, align: "left" as const },
        { header: "SKU/店内码", key: "sku", width: 22, align: "center" as const },
        { header: "JD SKU ID", key: "jdSkuId", width: 22, align: "center" as const },
        { header: "美团商品 ID", key: "meituanSkuId", width: 24, align: "center" as const },
        { header: "分类", key: "categoryName", width: 18, align: "center" as const },
        { header: "供应商", key: "supplierName", width: 20, align: "center" as const },
        { header: "进货单价", key: "costPrice", width: 16, align: "center" as const, numFmt: "￥#,##0.00" },
        { header: "库存", key: "stock", width: 14, align: "center" as const, numFmt: "#,##0" },
        { header: "备注", key: "remark", width: 28, align: "left" as const },
      ];

      // 设置列宽
      worksheet.columns = columnsConfig.map(col => ({
        key: col.key,
        width: col.width,
      }));

      // 表头行设置
      const headerRow = worksheet.addRow(columnsConfig.map(c => c.header));
      headerRow.height = 30;
      headerRow.eachCell((cell) => {
        cell.font = { name: "微软雅黑", size: 11, bold: true, color: { argb: "FF1F2937" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F4F6" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "medium", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      });

      // 预先初始化表格数据行
      const rowElements: { item: ShopCatalogItem; rowIndex: number }[] = [];
      let rowIndex = 2;
      for (const item of exportItems) {
        const supplierName = suppliers.find((supplier) => supplier.id === item.supplierId)?.name || "";
        const costPrice = typeof item.costPrice === "number" ? item.costPrice : 0;
        const stock = typeof item.stock === "number" ? item.stock : 0;
        const jdSkuText = (Array.isArray(item.jdSkuIds) && item.jdSkuIds.length > 0 ? item.jdSkuIds.join(",") : item.jdSkuId) || "";
        const meituanSkuText = (Array.isArray(item.meituanSkuIds) && item.meituanSkuIds.length > 0 ? item.meituanSkuIds.join(",") : item.meituanSkuId) || "";

        const row = worksheet.addRow({
          shopName: item.shopName || "",
          image: "", // 图片列稍后嵌入
          name: item.name || "",
          sku: item.sku || "",
          jdSkuId: jdSkuText,
          meituanSkuId: meituanSkuText,
          categoryName: item.categoryName || "未分类",
          supplierName,
          costPrice,
          stock,
          remark: item.remark || "",
        });

        row.height = 108; // 为嵌入主图保留充裕行高

        // 设置每个单元格样式
        columnsConfig.forEach((col, colIdx) => {
          const cell = row.getCell(colIdx + 1);
          cell.font = { name: "微软雅黑", size: 10 };
          cell.alignment = {
            horizontal: col.align,
            vertical: "middle",
            wrapText: col.key === "name" || col.key === "remark",
          };
          if (col.numFmt) {
            cell.numFmt = col.numFmt;
          }
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } },
          };
        });

        rowElements.push({ item, rowIndex });
        rowIndex++;
      }

      // 分批并发下载抓取转码主图，并实时推进进度条
      let processedCount = 0;
      const concurrency = 6;
      for (let i = 0; i < rowElements.length; i += concurrency) {
        if (exportCancelledRef.current) {
          showToast("导出已取消", "info");
          return;
        }
        const chunk = rowElements.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async ({ item, rowIndex: rIdx }) => {
            if (item.image && !exportCancelledRef.current) {
              const imgResult = await loadAndConvertImageForExcel(item.image);
              if (imgResult && !exportCancelledRef.current) {
                const imageId = workbook.addImage({
                  buffer: imgResult.buffer,
                  extension: imgResult.extension,
                });

                const imgW = imgResult.width || 100;
                const imgH = imgResult.height || 100;
                const scale = Math.min(125 / imgW, 125 / imgH);
                const finalW = Math.round(imgW * scale);
                const finalH = Math.round(imgH * scale);

                const COL_WIDTH_PX = 176;
                const ROW_HEIGHT_PX = 144; // 108pt / 0.75
                const colOffset = Math.max(0, ((COL_WIDTH_PX - finalW) / 2) / COL_WIDTH_PX);
                const rowOffset = Math.max(0, ((ROW_HEIGHT_PX - finalH) / 2) / ROW_HEIGHT_PX);

                worksheet.addImage(imageId, {
                  tl: { col: 1 + colOffset, row: rIdx - 1 + rowOffset } as any,
                  ext: { width: finalW, height: finalH } as any,
                  editAs: "oneCell",
                });
              }
            }
            processedCount++;
            setExportProgress({ isOpen: true, current: processedCount, total: exportItems.length });
          })
        );
      }

      if (exportCancelledRef.current) {
        showToast("导出已取消", "info");
        return;
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `${selectedShop?.name || "全部店铺"}商品_${new Date().toLocaleString("sv-SE", { hour12: false }).replace(" ", "_").replace(/:/g, "-")}.xlsx`;
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
      showToast(`已成功导出 ${exportItems.length} 条商品数据 (含主图)`, "success");
    } catch (error) {
      console.error("Failed to export shop products:", error);
      showToast("导出店铺商品失败", "error");
    } finally {
      setExportProgress(null);
    }
  }, [buildAggregateQuery, fetchSelectedItems, selectedIds.length, selectedShop, showToast, suppliers]);

  const handleImport = useCallback(async (rows: Record<string, unknown>[] | Record<string, unknown[]>) => {
    if (!selectedShop) {
      showToast("请先选择要导入到哪个店铺", "error");
      return;
    }
    try {
      const payload = Array.isArray(rows) ? rows : [];
      const res = await fetch(`/api/shops/${selectedShop.id}/products/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error || "导入失败", "error");
        return;
      }
      await fetchShopProducts(true);

      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        setImportErrors(data.errors);
      }

      const summary = [data?.success ? `新增 ${data.success} 条` : "", data?.updated ? `更新 ${data.updated} 条` : "", data?.failed ? `失败 ${data.failed} 条` : ""].filter(Boolean).join("，");
      showToast(summary || "导入完成", data?.failed ? "info" : "success");
    } catch (error) {
      console.error("Failed to import shop products:", error);
      showToast("导入失败", "error");
    }
  }, [fetchShopProducts, selectedShop, showToast]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">店铺商品</h1>
            <span className="shrink-0 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 sm:px-4 h-8 sm:h-10 text-sm sm:text-lg font-bold text-primary font-number shadow-sm">{totalResults}</span>
          </div>
          <p className="hidden md:block text-muted-foreground mt-1 sm:mt-2 text-xs sm:text-lg truncate">
            {hasMultipleShops ? "当前页面固定按单店铺查看，切换店铺只更新筛选结果。" : "当前仅有 1 家店铺，页面已自动按该店铺展示。"}
          </p>
        </div>
        {filteredShops.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button onClick={() => setIsMeituanMappingOpen(true)} className="flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 bg-white dark:bg-white/5 px-3 sm:px-5 h-10 sm:h-11 text-sm font-bold text-foreground hover:bg-white/80 dark:hover:bg-white/10 transition-all"><Link2 size={18} className="shrink-0 text-amber-500" /><span className="truncate">商品配对</span></button>
            <button onClick={() => selectedShop ? setIsImportOpen(true) : showToast("先选择一个目标店铺再导入", "error")} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 px-3 h-10 sm:h-11 text-sm font-bold transition-all", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><span className="truncate">导入</span></button>
            <button onClick={handleExport} className="flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 bg-white dark:bg-white/5 px-3 h-10 sm:h-11 text-sm font-bold text-foreground hover:bg-white/80 dark:hover:bg-white/10 transition-all"><span className="truncate">导出</span></button>
            <button onClick={() => selectedShop ? setIsSortOpen(true) : showToast("先选择一个目标店铺再排序", "error")} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 px-3 sm:px-5 h-10 sm:h-11 text-sm font-bold transition-all", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><ListOrdered size={18} className="shrink-0" /><span className="truncate">排序</span></button>
            <button onClick={() => selectedShop ? setIsCreateOpen(true) : showToast("先选择一个目标店铺再新建商品", "error")} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 px-3 sm:px-6 h-10 sm:h-11 text-sm font-bold transition-all", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><Plus size={18} className="shrink-0" /><span className="truncate">新建店铺商品</span></button>
            <button onClick={() => selectedShop ? setIsPickerOpen(true) : showToast("先选择一个目标店铺再从主库复制", "error")} className={cn("flex min-w-0 items-center justify-center gap-2 rounded-full border border-border/60 px-3 sm:px-6 h-10 sm:h-11 text-sm font-bold transition-all", selectedShop ? "bg-white dark:bg-white/5 text-foreground hover:bg-white/80 dark:hover:bg-white/10" : "bg-muted/60 text-muted-foreground cursor-not-allowed")}><Plus size={18} className="shrink-0" /><span className="truncate">从主库复制</span></button>
          </div>
        )}
      </div>

      {libraries.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-border/50 pb-3">
          {libraries.map((lib) => (
            <button
              key={lib.id}
              onClick={() => setActiveLibraryId(lib.id)}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-xl transition-all duration-200",
                activeLibraryId === lib.id
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                  : "text-muted-foreground hover:bg-muted/10 hover:text-foreground"
              )}
            >
              {lib.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="h-10 sm:h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input type="text" placeholder="搜索商品、编号或店铺..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8" />
            {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"><X size={14} /></button>}
          </div>
        </div>

        <div className="grid grid-cols-2 xl:flex gap-2 sm:gap-3 w-full xl:w-auto shrink-0">
          {filteredShops.length > 0 && (
            <div className="xl:w-52 h-10 sm:h-11">
              <CustomSelect value={selectedShopId} onChange={setSelectedShopId} options={filteredShops.map((shop) => ({ value: shop.id, label: shop.name }))} placeholder="选择店铺" className="h-full" triggerClassName={cn("h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate", selectedShop ? "bg-primary/10 border-primary/20 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary font-medium" : "bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5")} />
            </div>
          )}
          <div className="xl:w-44 h-10 sm:h-11">
            <CustomSelect value={selectedCategory} onChange={setSelectedCategory} options={categoryOptions} placeholder="全部分类" className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
          <div className="xl:w-44 h-10 sm:h-11">
            <CustomSelect value={selectedSupplier} onChange={setSelectedSupplier} options={[{ value: "all", label: "所有供应商" }, { value: "unknown", label: "未知供应商" }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]} placeholder="所有供应商" className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
          <div className="xl:w-48 h-10 sm:h-11">
            <CustomSelect value={sortBy} onChange={setSortBy} options={[{ value: "sku-asc", label: "店内码从小到大" }, { value: "sku-desc", label: "店内码从大到小" }, { value: "createdAt-desc", label: "最新创建" }, { value: "createdAt-asc", label: "最早创建" }, { value: "stock-desc", label: "库存从高到低" }, { value: "stock-asc", label: "库存从低到高" }, { value: "shop-asc", label: "店铺 A-Z" }, { value: "shop-desc", label: "店铺 Z-A" }, { value: "name-asc", label: "名称 A-Z" }]} className="h-full" triggerClassName="h-full rounded-full border text-xs sm:text-sm py-0 px-2 sm:px-5 transition-all truncate bg-white dark:bg-white/5 border-border dark:border-white/10 hover:bg-white/5" />
          </div>
        </div>
      </div>

      {needsAddress && !isLoading && (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center px-6">
          <div className="rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 p-4 mb-4"><Store size={32} className="text-indigo-500 dark:text-indigo-400" /></div>
          <h3 className="text-lg font-semibold">还没有店铺地址信息</h3>
          <p className="text-sm text-muted-foreground mb-5">请先到个人信息里添加店铺地址，系统会自动把地址同步成可选店铺。</p>
          <Link href="/profile#address-library" className="inline-flex items-center justify-center rounded-full bg-primary px-5 h-10 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">去添加店铺地址</Link>
        </div>
      )}

      {/* 视图切换按钮与总计 */}
      <div className="flex items-center justify-between gap-3 my-4">
        <p className="text-xs sm:text-sm font-medium text-muted-foreground">
          共 <strong className="text-foreground font-bold">{totalResults || displayedItems.length}</strong> 件店铺商品
        </p>
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-white/5 rounded-2xl border border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("card")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
              viewMode === "card"
                ? "bg-white dark:bg-gray-800 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            卡片视图
          </button>
          <button
            type="button"
            onClick={() => setViewMode("quickEdit")}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center touch-manipulation",
              viewMode === "quickEdit"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="hidden sm:inline">快速编辑模式</span>
            <span className="sm:hidden">快速编辑</span>
          </button>
        </div>
      </div>

      {viewMode === "quickEdit" ? (
        <QuickEditTable
          items={displayedItems.map((item) => ({
            id: item.displayId,
            name: item.name,
            sku: item.sku,
            costPrice: item.costPrice,
            image: item.image,
            categoryName: item.categoryName,
          }))}
          onSaveItem={handleQuickSaveItem}
          onBatchSave={handleQuickBatchSave}
          isLoading={isLoading}
        />
      ) : !needsAddress && isLoading && items.length === 0 ? (
        <div className="grid gap-3 sm:gap-6 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, index) => <GoodsCardSkeleton key={index} />)}</div>
      ) : !needsAddress ? (
        <>
          <div className="grid gap-3 sm:gap-6 grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 transition-opacity duration-300">
            {displayedItems.map((product, index) => (
              <GoodsCard key={product.displayId} product={{ id: product.displayId, sku: product.sku || undefined, name: product.name, categoryId: product.categoryId || "", category: product.categoryName ? { id: product.categoryId || "", name: product.categoryName, count: 0 } : undefined, costPrice: product.costPrice || 0, stock: product.stock || 0, image: product.image || undefined, isPublic: product.isPublic ?? true, isDiscontinued: product.isDiscontinued ?? false, remark: product.remark || undefined, specs: product.specs || undefined, supplierId: product.supplierId || undefined, supplier: product.supplier || undefined }} onEdit={() => {
                const rawTarget = items.find((item) => item.id === product.linkedIds[0]);
                if (rawTarget) openEditModal(rawTarget);
              }} isSelected={selectedIds.includes(product.displayId)} anySelected={selectedIds.length > 0} onToggleSelect={handleToggleSelect} priority={index < 4} hideDiscontinuedState={true} />
            ))}
          </div>
          {displayedItems.length > 0 && <div ref={observerTarget} className="flex justify-center mt-8 mb-12 py-4">{isNextPageLoading ? <div className="flex items-center gap-3 text-muted-foreground bg-white/5 px-6 py-2 rounded-full border border-white/10 animate-pulse"><div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /><span className="text-sm font-medium">正在拉取更多记录...</span></div> : hasMore ? <div className="h-10 invisible" /> : <div className="text-muted-foreground text-sm font-medium flex items-center gap-2 opacity-50"><div className="w-1.5 h-1.5 rounded-full bg-current" />当前店铺商品已全部展示<div className="w-1.5 h-1.5 rounded-full bg-current" /></div>}</div>}
          {!isLoading && displayedItems.length === 0 && <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white dark:bg-white/5 text-center"><div className="rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 p-4 mb-4"><Store size={32} className="text-indigo-500 dark:text-indigo-400" /></div><h3 className="text-lg font-semibold">还没有店铺商品</h3><p className="text-sm text-muted-foreground">{selectedShop ? `当前店铺是 ${selectedShop.name}，可以从右上角主库复制。` : "请先选择一个店铺。"}</p></div>}
        </>
      ) : null}

      <ActionBar selectedCount={selectedIds.length} totalCount={totalResults} onToggleSelectAll={handleToggleSelectAll} onClear={() => setSelectedIds([])} onEdit={() => { if (selectedIds.length === 1) { handleEditSelected(); return; } setIsBatchEditOpen(true); }} label="个商品" extraActions={[{ label: "删除商品", icon: <Trash2 size={16} />, onClick: handleRemoveSelected, variant: "danger" }]} />
      <ShopSortWorkbench isOpen={isSortOpen} shop={selectedShop} onClose={() => setIsSortOpen(false)} onSaved={async () => { await fetchShopProducts(true); }} />
      <ProductSelectionModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={(products) => { void handleAssignProducts(products); }} selectedIds={assignedTemplateIds} selectedBadgeLabel="当前店铺已复制" title={selectedShop ? `复制到 ${selectedShop.name}` : "复制商品"} showPlatformSelector={false} minimalView={true} query={templateCatalogQuery} emptyStateText="主库里还没有商品" loadAllOnOpen={true} respectPublicVisibility={false} defaultViewMode="list" />
      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImport={handleImport} title={selectedShop ? `导入到 ${selectedShop.name}` : "导入店铺商品"} description="导入结果只会落到当前选中的目标店铺。已存在的店铺商品会更新，未存在的会按公开商品匹配后加入该店铺。" templateFileName="店铺商品导入模板.xlsx" templateData={[{ "*商品名称": "示例商品", "SKU/店内码": "SHOP-001", "JD SKU ID": "100234,100235 (选填)", "美团商品 ID": "MT-001,MT-002 (选填)", "*分类": "默认分类", 供应商: "默认供应商", 进货单价: 19.9, 主图: "https://example.com/cover.jpg", 备注: "店铺自定义备注" }]} />
      <ProductFormModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} onSubmit={async (data) => { await handleCreateStandaloneProduct(data); }} title={selectedShop ? `新建 ${selectedShop.name} 商品` : "新建店铺商品"} hideVisibilityControl={true} hideProductionControl={true} hideGallerySection={true} hideSpecsSection={true} disableHistorySection={true} showCoverSection={true} showJdSkuField={true} showMeituanSkuField={true} mainImageUploadEndpoint={selectedShopId ? `/api/shops/${selectedShopId}/products/cover-upload` : undefined} />
      <ProductFormModal isOpen={isEditOpen} onClose={closeEditModal} onSubmit={async (data) => { await handleSaveEdit(data); }} initialData={editingProduct} title="编辑店铺商品" hideVisibilityControl={true} hideProductionControl={true} hideGallerySection={true} hideSpecsSection={true} showCoverSection={true} showJdSkuField={true} showMeituanSkuField={true} mainImageUploadEndpoint={editingShopId ? `/api/shops/${editingShopId}/products/cover-upload` : undefined} />
      <BatchEditModal isOpen={isBatchEditOpen} onClose={() => setIsBatchEditOpen(false)} onConfirm={handleBatchUpdate} categories={categories} suppliers={suppliers} selectedCount={selectedIds.length} hideProductionStatus={true} />
      <MeituanMappingModal
        isOpen={isMeituanMappingOpen}
        onClose={() => setIsMeituanMappingOpen(false)}
        currentShop={selectedShop}
        shops={filteredShops.length > 0 ? filteredShops : shops}
        onShopChange={(shop) => setSelectedShopId(shop.id)}
      />

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showScrollTop && (
            <motion.button initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5, y: 20 }} onClick={scrollToTop} className="fixed bottom-24 sm:bottom-12 right-6 sm:right-12 z-9999 p-3 sm:p-4 rounded-full bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground hover:scale-110 active:scale-95 transition-all group">
              <ArrowUp size={24} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
          {importErrors.length > 0 && (
            <div className="fixed inset-0 z-60000 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setImportErrors([])}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-xl max-h-[80vh] overflow-hidden rounded-3xl bg-white dark:bg-gray-900/90 backdrop-blur-xl border border-border/50 shadow-2xl p-6 md:p-8 flex flex-col z-60000 animate-in fade-in-50 duration-200"
              >
                <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                  <div className="flex items-center gap-2.5 text-destructive">
                    <AlertCircle size={24} />
                    <h3 className="text-lg md:text-xl font-bold">导入失败日志明细</h3>
                  </div>
                  <button
                    onClick={() => setImportErrors([])}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-2 scrollbar-none">
                  {importErrors.map((err, idx) => (
                    <div key={idx} className="flex gap-2.5 items-start p-3.5 rounded-2xl bg-destructive/5 border border-destructive/10 text-destructive text-sm font-medium">
                      <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-destructive/15 text-[11px] font-black">{idx + 1}</span>
                      <span className="leading-relaxed">{err}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 border-t border-border pt-4 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(importErrors.join('\n'));
                      showToast("日志复制成功", "success");
                    }}
                    className="h-11 px-5 rounded-full text-sm font-medium border border-border text-foreground hover:bg-secondary transition-all active:scale-95"
                  >
                    复制全部日志
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportErrors([])}
                    className="h-11 px-6 rounded-full text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-all active:scale-95"
                  >
                    关闭
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
      {exportProgress && (
        <ExportProgressModal
          isOpen={exportProgress.isOpen}
          current={exportProgress.current}
          total={exportProgress.total}
          title="正在生成店铺商品 Excel 数据包"
          subtitle="正在抓取转码商品主图并排版单元格，请稍候..."
          onCancel={handleCancelExport}
        />
      )}
    </div>
  );
}
