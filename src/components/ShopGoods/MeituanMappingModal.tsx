"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Trash2,
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Package,
  Plus,
  X,
  Store,
  RefreshCw,
  Loader2,
  Layers,
  HelpCircle,
  Tag,
  ArrowRight,
  ChevronDown,
  Check,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { UploadMeituanModal } from "@/components/MeituanMapping/UploadMeituanModal";
import { MeituanProductSelectionModal } from "@/components/MeituanMapping/MeituanProductSelectionModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Shop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { pinyinMatch } from "@/lib/pinyin";

interface ImportBatch {
  id: string;
  fileName: string;
  totalCount: number;
  matchedCount: number;
  status: "PENDING" | "PARTIAL" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
}

interface MeituanMappingRecord {
  id: string;
  meituanSkuId: string;
  meituanSpuId: string | null;
  meituanName: string | null;
  meituanSpec: string | null;
  createdAt: string;
}

interface SuggestedMeituanItem {
  id: string;
  meituanSkuId: string;
  name: string;
  spec: string | null;
  barcode: string | null;
  price: number | null;
  imageUrl: string | null;
  reason: string;
}

interface ShopProductWithMapping {
  id: string;
  shopProductId?: string | null;
  name: string;
  shopProductName?: string | null;
  sku: string | null;
  shopSku?: string | null;
  image: string | null;
  costPrice: number;
  stock: number;
  jdSkuId?: string | null;
  meituanSkuId?: string | null;
  taobaoSkuId?: string | null;
  doudianSkuId?: string | null;
  barcode?: string | null;
  category: { id: string; name: string } | null;
  meituanSkuMappings: MeituanMappingRecord[];
  boundCount: number;
  isBound: boolean;
  suggestedMeituanItem?: SuggestedMeituanItem | null;
}

interface MeituanMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentShop?: Shop | null;
  shops?: Shop[];
  onShopChange?: (shop: Shop) => void;
}

type ProductMappingPlatform = "meituan" | "jd" | "taobao" | "doudian";

const PRODUCT_MAPPING_PLATFORMS: Array<{
  key: ProductMappingPlatform;
  label: string;
  idLabel: string;
  field: "meituanSkuId" | "jdSkuId" | "taobaoSkuId" | "doudianSkuId";
  placeholder: string;
}> = [
  {
    key: "meituan",
    label: "美团",
    idLabel: "美团 SKU ID",
    field: "meituanSkuId",
    placeholder: "输入美团 SKU ID",
  },
  {
    key: "jd",
    label: "京东",
    idLabel: "JD SKU ID",
    field: "jdSkuId",
    placeholder: "输入 JD SKU ID",
  },
  {
    key: "taobao",
    label: "淘宝",
    idLabel: "淘宝 SKU ID",
    field: "taobaoSkuId",
    placeholder: "输入淘宝 SKU ID",
  },
  {
    key: "doudian",
    label: "抖店",
    idLabel: "抖店 SKU ID",
    field: "doudianSkuId",
    placeholder: "输入抖店 SKU ID",
  },
];

export function MeituanMappingModal({
  isOpen,
  onClose,
  currentShop,
  shops,
  onShopChange,
}: MeituanMappingModalProps) {
  const { showToast } = useToast();
  const [selectedShop, setSelectedShop] = useState<Shop | null>(currentShop || null);
  const [shopList, setShopList] = useState<Shop[]>(shops || []);
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
  const [shopSearchQuery, setShopSearchQuery] = useState("");
  const shopDropdownRef = useRef<HTMLDivElement>(null);

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [currentBatchId, setCurrentBatchId] = useState<string>("ALL");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activePlatform, setActivePlatform] = useState<ProductMappingPlatform>("meituan");
  const [platformIdDrafts, setPlatformIdDrafts] = useState<Record<string, string>>({});
  const [savingPlatformIds, setSavingPlatformIds] = useState<Record<string, boolean>>({});

  // 同步外部 currentShop
  useEffect(() => {
    if (currentShop) {
      setSelectedShop(currentShop);
    }
  }, [currentShop]);

  // 门店列表更新或拉取
  useEffect(() => {
    if (shops && shops.length > 0) {
      setShopList(shops);
    } else if (isOpen) {
      const fetchShops = async () => {
        try {
          const res = await fetch("/api/shops?source=shipping-addresses");
          const data = await res.json().catch(() => ({ shops: [] }));
          const list: Shop[] = Array.isArray(data?.shops) ? data.shops : [];
          setShopList(list);
          if (!selectedShop && list.length > 0) {
            setSelectedShop(list[0]);
          }
        } catch (e) {
          console.error("加载店铺列表失败", e);
        }
      };
      fetchShops();
    }
  }, [isOpen, shops, selectedShop]);

  // 点击外部关闭门店下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (shopDropdownRef.current && !shopDropdownRef.current.contains(e.target as Node)) {
        setIsShopDropdownOpen(false);
      }
    };
    if (isShopDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isShopDropdownOpen]);

  const filteredShopList = useMemo(() => {
    if (!shopSearchQuery.trim()) return shopList;
    return shopList.filter((s) => pinyinMatch(s.name, shopSearchQuery));
  }, [shopList, shopSearchQuery]);

  const handleSelectShop = (shop: Shop) => {
    setSelectedShop(shop);
    setPage(1);
    setIsShopDropdownOpen(false);
    onShopChange?.(shop);
  };

  // 系统商品列表与分页
  const [products, setProducts] = useState<ShopProductWithMapping[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "UNBOUND" | "HAS_SUGGESTION" | "BOUND"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({
    TOTAL: 0,
    UNBOUND: 0,
    HAS_SUGGESTION: 0,
    BOUND: 0,
  });

  // 挑选美团商品弹窗激活的目标商品
  const [targetProductForPicker, setTargetProductForPicker] = useState<ShopProductWithMapping | null>(null);

  // 确认弹窗
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // 获取导入批次列表
  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch(`/api/meituan-mapping/batches?platform=${activePlatform}`);
      if (res.ok) {
        const data = await res.json();
        setBatches(data.batches || []);
      }
    } catch (err) {
      console.error("加载美团批次列表失败", err);
    }
  }, [activePlatform]);

  // 获取系统店铺商品正向配对列表
  const fetchShopProducts = useCallback(async () => {
    if (!isOpen) return;
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        status: activePlatform === "meituan" ? statusFilter : "ALL",
        search: searchQuery,
        page: page.toString(),
        pageSize: pageSize.toString(),
        platform: activePlatform,
      });
      if (selectedShop?.id) {
        params.append("shopId", selectedShop.id);
      }
      if (activePlatform === "meituan" && currentBatchId && currentBatchId !== "ALL") {
        params.append("batchId", currentBatchId);
      }

      const res = await fetch(
        `/api/meituan-mapping/shop-products?${params.toString()}`
      );
      if (res.ok) {
        const data = await res.json();
        setProducts(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStatusCounts(data.statusCounts || {});
      }
    } catch (err) {
      console.error("加载店铺商品配对列表失败", err);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, selectedShop?.id, currentBatchId, activePlatform, statusFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    if (isOpen) {
      fetchBatches();
    }
  }, [isOpen, fetchBatches]);

  useEffect(() => {
    setCurrentBatchId("ALL");
    setPage(1);
  }, [activePlatform]);

  useEffect(() => {
    if (isOpen) {
      fetchShopProducts();
    }
  }, [isOpen, fetchShopProducts]);

  useEffect(() => {
    setPlatformIdDrafts((prev) => {
      const next = { ...prev };
      for (const product of products) {
        if (!product.shopProductId) continue;
        for (const option of PRODUCT_MAPPING_PLATFORMS) {
          const key = `${product.shopProductId}:${option.key}`;
          if (next[key] === undefined) {
            next[key] = String(product[option.field] || "");
          }
        }
      }
      return next;
    });
  }, [products]);

  const activePlatformConfig = useMemo(
    () => PRODUCT_MAPPING_PLATFORMS.find((item) => item.key === activePlatform) || PRODUCT_MAPPING_PLATFORMS[0],
    [activePlatform]
  );

  const platformProducts = useMemo(() => {
    if (activePlatform === "meituan") {
      return products;
    }

    const field = activePlatformConfig.field;
    if (statusFilter === "BOUND") {
      return products.filter((product) => Boolean(String(product[field] || "").trim()));
    }
    if (statusFilter === "UNBOUND") {
      return products.filter((product) => !String(product[field] || "").trim());
    }
    return products;
  }, [activePlatform, activePlatformConfig.field, products, statusFilter]);

  const platformStatusCounts = useMemo(() => {
    if (activePlatform === "meituan") {
      return statusCounts;
    }

    const field = activePlatformConfig.field;
    const bound = products.filter((product) => Boolean(String(product[field] || "").trim())).length;
    return {
      TOTAL: products.length,
      BOUND: bound,
      UNBOUND: products.length - bound,
      HAS_SUGGESTION: 0,
    };
  }, [activePlatform, activePlatformConfig.field, products, statusCounts]);

  const handleSavePlatformId = async (product: ShopProductWithMapping, nextValue?: string) => {
    if (!product.shopProductId) {
      showToast("当前商品没有对应的店铺商品记录，无法保存平台 ID", "error");
      return;
    }

    const draftKey = `${product.shopProductId}:${activePlatform}`;
    const value = (nextValue ?? platformIdDrafts[draftKey] ?? String(product[activePlatformConfig.field] || "")).trim();

    try {
      setSavingPlatformIds((prev) => ({ ...prev, [draftKey]: true }));
      const res = await fetch(`/api/shop-products/${product.shopProductId}/platform-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: activePlatform,
          value,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "保存平台商品 ID 失败");
      }

      showToast(`已保存${activePlatformConfig.idLabel}`, "success");
      await fetchShopProducts();
    } catch (err: any) {
      showToast(err?.message || "保存平台商品 ID 失败", "error");
    } finally {
      setSavingPlatformIds((prev) => ({ ...prev, [draftKey]: false }));
    }
  };

  // 给系统商品绑定选中的美团商品
  const handleBindMeituan = async (
    product: ShopProductWithMapping,
    meituanItem: {
      meituanSkuId: string;
      meituanSpuId?: string | null;
      name: string;
      spec?: string | null;
    }
  ) => {
    try {
      const res = await fetch("/api/meituan-mapping/bind-to-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          meituanSkuId: meituanItem.meituanSkuId,
          meituanSpuId: meituanItem.meituanSpuId || undefined,
          meituanName: meituanItem.name,
          meituanSpec: meituanItem.spec || undefined,
        }),
      });

      if (res.ok) {
        showToast(
          `已成功为【${product.name}】配对美团 ID: ${meituanItem.meituanSkuId}`,
          "success"
        );
        setTargetProductForPicker(null);
        fetchShopProducts();
        fetchBatches();
      } else {
        const errData = await res.json();
        showToast(errData.error || "配对美团ID失败", "error");
      }
    } catch (err) {
      console.error("绑定美团ID失败", err);
      showToast("配对操作异常", "error");
    }
  };

  // 解绑指定的美团 ID
  const handleUnbindMeituan = async (
    productId: string,
    meituanSkuId: string,
    productName: string
  ) => {
    try {
      const res = await fetch("/api/meituan-mapping/unbind-from-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          meituanSkuId,
        }),
      });

      if (res.ok) {
        showToast(`已解除【${productName}】的美团 ID 关联`, "success");
        fetchShopProducts();
        fetchBatches();
      } else {
        showToast("解绑失败", "error");
      }
    } catch (err) {
      console.error("解绑异常", err);
      showToast("解绑操作异常", "error");
    }
  };

  // 一键采纳本页所有智能推荐美团商品
  const handleAcceptAllPageSuggestions = async () => {
    const productsWithSuggestion = products.filter(
      (p) => !p.isBound && p.suggestedMeituanItem
    );

    if (productsWithSuggestion.length === 0) {
      showToast("当前页没有可采纳的美团智能推荐", "info");
      return;
    }

    try {
      let successCount = 0;
      for (const prod of productsWithSuggestion) {
        const sugg = prod.suggestedMeituanItem!;
        const res = await fetch("/api/meituan-mapping/bind-to-product", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: prod.id,
            meituanSkuId: sugg.meituanSkuId,
            meituanName: sugg.name,
            meituanSpec: sugg.spec || undefined,
          }),
        });
        if (res.ok) successCount++;
      }

      showToast(`成功批量为 ${successCount} 个商品采纳美团 ID`, "success");
      fetchShopProducts();
      fetchBatches();
    } catch (err) {
      console.error("批量采纳异常", err);
      showToast("批量采纳失败", "error");
    }
  };

  // 导出回写 Excel
  const handleExportExcel = async () => {
    if (batches.length === 0) {
      showToast("尚未导入任何美团数据表，无法导出回写表格", "error");
      return;
    }

    const batchIdToExport =
      currentBatchId !== "ALL" ? currentBatchId : batches[0].id;

    try {
      setIsExporting(true);
      const res = await fetch(
        `/api/meituan-mapping/export?batchId=${batchIdToExport}`
      );
      if (!res.ok) {
        throw new Error("导出失败");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let fileName = "美团商品_已配对店内码SKU回写.xlsx";
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          fileName = decodeURIComponent(match[1]);
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      showToast("已成功导出回写表格！可使用油猴助手在美团后台批量回填店内码", "success");
    } catch (err: any) {
      console.error("导出异常", err);
      showToast("导出表格失败", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPlatformList = () => {
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["商品名称", "店内码/SKU", activePlatformConfig.idLabel, "分类"],
      ...platformProducts.map((item) => [
        item.shopProductName || item.name,
        item.shopSku || item.sku || "",
        item[activePlatformConfig.field] || "",
        item.category?.name || "",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedShop?.name || "店铺"}_${activePlatformConfig.label}_商品配对表.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showToast(`已导出${activePlatformConfig.label}商品配对表`, "success");
  };

  // 删除批次
  const handleDeleteBatch = () => {
    if (currentBatchId === "ALL") return;
    const currentBatch = batches.find((b) => b.id === currentBatchId);
    setConfirmConfig({
      isOpen: true,
      title: "删除美团数据批次",
      message: `确定要删除美团数据批次 "${currentBatch?.fileName || "当前批次"}" 吗？该批次的候选数据将被清空（系统商品的已有绑定映射不会丢失）。`,
      onConfirm: async () => {
        try {
          const res = await fetch(
            `/api/meituan-mapping/batches?batchId=${currentBatchId}&platform=${activePlatform}`,
            { method: "DELETE" }
          );
          if (res.ok) {
            showToast("批次已删除", "success");
            setCurrentBatchId("ALL");
            fetchBatches();
            fetchShopProducts();
          }
        } catch (err) {
          console.error("删除批次异常", err);
        }
      },
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 dark:bg-[#080c16]/75 backdrop-blur-md p-2 sm:p-6 md:p-8 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-7xl h-[96dvh] max-h-[96dvh] rounded-[24px] sm:h-[92vh] sm:max-h-[92vh] sm:rounded-[36px] border border-border/80 dark:border-white/10 bg-card/98 dark:bg-[#0b111e]/98 backdrop-blur-2xl shadow-2xl overflow-hidden"
        >
          {/* 装饰光晕背景 */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 dark:bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/5 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* 1. 顶部 Header */}
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-8 py-4 sm:py-5 border-b border-border/60 dark:border-white/10 bg-muted/20 dark:bg-white/[0.02] shrink-0">
            <div className="flex items-start gap-3.5">
              <div className="hidden h-11 sm:flex sm:h-12 w-11 sm:w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-inner">
                <Link2 className="h-5 sm:h-6 w-5 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3 sm:hidden">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black leading-tight tracking-tight text-foreground">
                      店铺商品 · 商品配对工作台
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      统一维护三平台商品 ID
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="hidden sm:flex sm:items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-black tracking-tight text-foreground">
                    店铺商品 · 商品配对工作台
                  </h2>
                  <div className="relative inline-block" ref={shopDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsShopDropdownOpen((prev) => !prev)}
                      className={cn(
                        "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black transition-all shadow-xs group cursor-pointer border select-none",
                        isShopDropdownOpen
                          ? "bg-primary/20 text-primary border-primary/40 ring-2 ring-primary/20 shadow-sm"
                          : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 hover:border-primary/35 active:scale-95"
                      )}
                      title="点击切换当前门店"
                    >
                      <Store className="h-3.5 w-3.5 text-primary/80 group-hover:text-primary transition-colors shrink-0" />
                      <span className="max-w-[160px] truncate">{selectedShop?.name || "选择门店"}</span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-primary/60 group-hover:text-primary transition-transform duration-200 shrink-0",
                          isShopDropdownOpen && "rotate-180 text-primary"
                        )}
                      />
                    </button>

                    <AnimatePresence>
                      {isShopDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute left-0 top-full mt-2 w-72 max-h-80 flex flex-col rounded-2xl bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl z-50 p-2 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
                        >
                          {/* 标题提示 */}
                          <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2 text-[11px] font-bold text-muted-foreground/80 select-none">
                            <span className="flex items-center gap-1.5">
                              <Store className="h-3.5 w-3.5 text-primary" />
                              切换工作台门店
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted dark:bg-white/5 font-medium text-muted-foreground">
                              共 {shopList.length} 家
                            </span>
                          </div>

                          {/* 搜索框 */}
                          {shopList.length >= 4 && (
                            <div className="relative flex items-center mb-1.5 px-0.5">
                              <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <input
                                type="text"
                                value={shopSearchQuery}
                                onChange={(e) => setShopSearchQuery(e.target.value)}
                                placeholder="搜索门店名称 / 拼音..."
                                className="w-full h-8 pl-8 pr-7 text-xs bg-muted/60 dark:bg-white/5 rounded-xl outline-none border border-border/50 dark:border-white/10 focus:border-primary/40 text-foreground placeholder:text-muted-foreground transition-colors"
                                autoFocus
                              />
                              {shopSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setShopSearchQuery("")}
                                  className="absolute right-2.5 h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground text-[10px] flex items-center justify-center transition-colors"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          )}

                          {/* 门店列表 */}
                          <div className="overflow-y-auto space-y-1 max-h-56 pr-0.5 scrollbar-thin">
                            {filteredShopList.length === 0 ? (
                              <div className="py-6 text-center text-xs text-muted-foreground">
                                未找到匹配门店
                              </div>
                            ) : (
                              filteredShopList.map((shop) => {
                                const isSelected = selectedShop?.id === shop.id;
                                return (
                                  <button
                                    key={shop.id}
                                    type="button"
                                    onClick={() => handleSelectShop(shop)}
                                    className={cn(
                                      "group w-full flex items-center justify-between p-2 rounded-xl text-xs text-left transition-all cursor-pointer select-none",
                                      isSelected
                                        ? "bg-primary/10 dark:bg-primary/20 text-primary font-bold border border-primary/25 shadow-xs"
                                        : "text-foreground hover:bg-muted/70 dark:hover:bg-white/8 active:scale-[0.98] border border-transparent"
                                    )}
                                  >
                                    <div className="flex items-center gap-2.5 truncate min-w-0">
                                      <div
                                        className={cn(
                                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                                          isSelected
                                            ? "bg-primary text-primary-foreground shadow-xs"
                                            : "bg-muted/80 dark:bg-white/5 text-muted-foreground group-hover:text-foreground"
                                        )}
                                      >
                                        <Store className="h-3.5 w-3.5" />
                                      </div>
                                      <span className="truncate text-xs">{shop.name}</span>
                                    </div>

                                    {isSelected && (
                                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 dark:bg-primary/30 text-primary">
                                        <Check className="h-3 w-3 stroke-[3]" />
                                      </div>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="mt-3 sm:hidden">
                  <div className="relative inline-block w-full" ref={shopDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsShopDropdownOpen((prev) => !prev)}
                      className={cn(
                        "inline-flex h-10 w-full items-center justify-center gap-2 px-3.5 rounded-full text-xs font-black transition-all shadow-xs group cursor-pointer border select-none",
                        isShopDropdownOpen
                          ? "bg-primary/20 text-primary border-primary/40 ring-2 ring-primary/20 shadow-sm"
                          : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15 hover:border-primary/35 active:scale-95"
                      )}
                      title="点击切换当前门店"
                    >
                      <Store className="h-3.5 w-3.5 text-primary/80 group-hover:text-primary transition-colors shrink-0" />
                      <span className="min-w-0 truncate">{selectedShop?.name || "选择门店"}</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 text-primary/60 group-hover:text-primary transition-transform duration-200 shrink-0", isShopDropdownOpen && "rotate-180 text-primary")} />
                    </button>

                    <AnimatePresence>
                      {isShopDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute left-0 top-full mt-2 w-full max-h-72 flex flex-col rounded-2xl bg-white/95 dark:bg-[#0c1222]/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 shadow-2xl z-50 p-2 overflow-hidden ring-1 ring-black/5 dark:ring-white/5"
                        >
                          {shopList.length >= 4 && (
                            <div className="relative flex items-center mb-1.5 px-0.5">
                              <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <input
                                type="text"
                                value={shopSearchQuery}
                                onChange={(e) => setShopSearchQuery(e.target.value)}
                                placeholder="搜索门店名称 / 拼音..."
                                className="w-full h-8 pl-8 pr-7 text-xs bg-muted/60 dark:bg-white/5 rounded-xl outline-none border border-border/50 dark:border-white/10 focus:border-primary/40 text-foreground placeholder:text-muted-foreground transition-colors"
                                autoFocus
                              />
                            </div>
                          )}
                          <div className="overflow-y-auto space-y-1 max-h-56 pr-0.5 scrollbar-thin">
                            {filteredShopList.length === 0 ? (
                              <div className="py-6 text-center text-xs text-muted-foreground">未找到匹配门店</div>
                            ) : (
                              filteredShopList.map((shop) => {
                                const isSelected = selectedShop?.id === shop.id;
                                return (
                                  <button
                                    key={shop.id}
                                    type="button"
                                    onClick={() => handleSelectShop(shop)}
                                    className={cn(
                                      "group w-full flex items-center justify-between p-2 rounded-xl text-xs text-left transition-all cursor-pointer select-none",
                                      isSelected
                                        ? "bg-primary/10 dark:bg-primary/20 text-primary font-bold border border-primary/25 shadow-xs"
                                        : "text-foreground hover:bg-muted/70 dark:hover:bg-white/8 active:scale-[0.98] border border-transparent"
                                    )}
                                  >
                                    <span className="truncate">{shop.name}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground mt-1">
                  以店铺商品为主体，统一维护美团、京东、淘宝的平台商品 ID
                </p>
              </div>
            </div>

            {/* 顶栏操作按钮 */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2.5 sm:flex sm:self-auto">
              <button
                onClick={activePlatform === "meituan" ? handleExportExcel : handleExportPlatformList}
                disabled={activePlatform === "meituan" ? isExporting || batches.length === 0 : platformProducts.length === 0}
                title={
                  activePlatform === "meituan"
                    ? batches.length === 0 ? "请先导入美团表格" : "导出填好自编SKU的美团Excel"
                    : `导出${activePlatformConfig.label}商品配对表`
                }
                className={cn(
                  "flex items-center justify-center gap-2 px-4 sm:px-5 h-10 sm:h-11 rounded-full text-xs sm:text-sm font-black transition-all shadow-md active:scale-95",
                  activePlatform === "meituan"
                    ? batches.length > 0
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-50 shadow-none"
                    : platformProducts.length > 0
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50 shadow-none"
                )}
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="leading-tight">
                  {activePlatform === "meituan" ? "导出回写美团表格" : `导出${activePlatformConfig.label}配对表`}
                </span>
              </button>

              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center justify-center gap-2 px-4 sm:px-5 h-10 sm:h-11 rounded-full text-xs sm:text-sm font-black bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                <UploadCloud className="h-4 w-4" />
                <span className="leading-tight">导入{activePlatformConfig.label}数据池</span>
              </button>

              <button
                onClick={onClose}
                className="hidden sm:flex h-10 sm:h-11 w-10 sm:w-11 items-center justify-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 2. 现代 SaaS 紧凑胶囊控制栏（完美双端适配） */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2 sm:gap-2.5 px-4 sm:px-8 py-2.5 sm:py-3 border-b border-border/60 bg-zinc-50/40 dark:bg-white/[0.015] shrink-0">
            {/* 区域 A：平台胶囊 + 状态统计胶囊 */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 shrink-0">
              {/* 平台选择胶囊外壳 */}
              <div className="h-9 w-full sm:w-auto grid grid-cols-3 sm:inline-flex items-center gap-1 p-0.5 bg-muted/60 dark:bg-white/10 rounded-full border border-border/50 dark:border-white/10 shadow-inner box-border">
                {PRODUCT_MAPPING_PLATFORMS.map((platform) => {
                  const isActive = activePlatform === platform.key;
                  return (
                    <button
                      key={platform.key}
                      type="button"
                      onClick={() => {
                        setActivePlatform(platform.key);
                        setStatusFilter("ALL");
                        setPage(1);
                      }}
                      className={cn(
                        "inline-flex shrink-0 items-center justify-center gap-1.5 px-3 h-7.5 rounded-full text-xs font-black transition-all cursor-pointer select-none",
                        isActive
                          ? "bg-white dark:bg-white/20 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Tag className="h-3 w-3" />
                      <span>{platform.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* 状态统计筛选胶囊外壳 */}
              <div className={cn(
                "h-9 w-full sm:w-auto grid p-0.5 bg-muted/60 dark:bg-white/10 rounded-full border border-border/50 dark:border-white/10 sm:inline-flex sm:items-center sm:gap-0.5 shadow-inner box-border scrollbar-none",
                activePlatform === "meituan" ? "grid-cols-4" : "grid-cols-3"
              )}>
                {[
                  { key: "ALL", label: "全部商品", mobileLabel: "全部", count: platformStatusCounts.TOTAL || total },
                  { key: "UNBOUND", label: activePlatform === "meituan" ? "未配对美团ID" : `未填${activePlatformConfig.idLabel}`, mobileLabel: "未配对", count: platformStatusCounts.UNBOUND || 0, color: "text-amber-500" },
                  ...(activePlatform === "meituan"
                    ? [{ key: "HAS_SUGGESTION", label: "有智能推荐", mobileLabel: "推荐", count: platformStatusCounts.HAS_SUGGESTION || 0, color: "text-sky-500" }]
                    : []),
                  { key: "BOUND", label: activePlatform === "meituan" ? "已配对" : "已填写", mobileLabel: activePlatform === "meituan" ? "已配对" : "已填", count: platformStatusCounts.BOUND || 0, color: "text-emerald-500" },
                ].map((tab) => {
                  const isActive = statusFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(tab.key as any);
                        setPage(1);
                      }}
                      className={cn(
                        "inline-flex min-w-0 items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 h-7.5 rounded-full text-xs font-black transition-all cursor-pointer select-none",
                        isActive
                          ? "bg-white dark:bg-white/20 text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="min-w-0 truncate sm:hidden">{tab.mobileLabel}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span
                        className={cn(
                          "font-number text-xs font-black",
                          isActive
                            ? "text-foreground"
                            : tab.color || "text-foreground"
                        )}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 区域 B：搜索框 + 批次数据池 + 快捷操作 */}
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-between xl:justify-end shrink-0 flex-wrap sm:flex-nowrap">
              {/* 搜索框 */}
              <div className="relative w-full sm:w-56 md:w-64 lg:w-72 shrink-0 group order-2 sm:order-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索商品名 / SKU / 拼音..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-8 h-9 text-xs rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-muted-foreground transition-all shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30 text-muted-foreground text-[10px] flex items-center justify-center transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* 数据池批次选择 + 操作按钮组 */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-start order-1 sm:order-2 shrink-0">
                <div className="flex-1 sm:w-48 md:w-56 min-w-0">
                  <CustomSelect
                    value={currentBatchId}
                    onChange={(val) => {
                      setCurrentBatchId(val);
                      setPage(1);
                    }}
                    options={[
                      {
                        value: "ALL",
                        label: `全部${activePlatformConfig.label}数据 (${batches.reduce((acc, b) => acc + b.totalCount, 0)})`,
                      },
                      ...batches.map((b) => ({
                        value: b.id,
                        label: `${b.fileName} (${b.matchedCount}/${b.totalCount})`,
                      })),
                    ]}
                    placeholder={`选择${activePlatformConfig.label}数据池`}
                    triggerClassName="h-9 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-3.5 text-xs font-bold text-foreground hover:border-primary/40 focus:ring-2 focus:ring-primary/20 transition-all shadow-xs truncate"
                  />
                </div>

                {currentBatchId !== "ALL" && (
                  <button
                    onClick={handleDeleteBatch}
                    title={`删除当前${activePlatformConfig.label}数据池`}
                    className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-rose-500 rounded-full hover:bg-rose-500/10 border border-border dark:border-white/10 bg-white dark:bg-white/5 shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {activePlatform === "meituan" && statusCounts.HAS_SUGGESTION > 0 && (
                  <button
                    onClick={handleAcceptAllPageSuggestions}
                    title="采纳本页推荐美团ID"
                    className="flex items-center gap-1.5 px-3.5 h-9 text-xs font-black rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">采纳推荐</span>
                  </button>
                )}

                <button
                  onClick={() => fetchShopProducts()}
                  title="刷新商品列表"
                  className="h-9 w-9 flex shrink-0 items-center justify-center rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                </button>
              </div>
            </div>
          </div>

          {/* 3. 系统商品主列表与配对操作 */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 custom-scrollbar">
            {isLoading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-xs font-bold">正在加载店铺商品与配对数据...</p>
              </div>
            ) : platformProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-muted/60 dark:bg-[#111827] text-muted-foreground">
                  <Package className="h-8 w-8 opacity-40" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-foreground">没有找到符合条件的系统商品</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    可以尝试清除搜索词或切换状态筛选
                  </p>
                </div>
              </div>
            ) : (
              platformProducts.map((prod) => {
                const isBound = prod.isBound;
                const hasSuggestion = !isBound && prod.suggestedMeituanItem;
                const platformDraftKey = prod.shopProductId ? `${prod.shopProductId}:${activePlatform}` : "";
                const currentPlatformValue = String(prod[activePlatformConfig.field] || "");
                const draftPlatformValue = platformIdDrafts[platformDraftKey] ?? currentPlatformValue;
                const isSavingPlatformId = Boolean(savingPlatformIds[platformDraftKey]);
                const isPlatformValueChanged = draftPlatformValue.trim() !== currentPlatformValue.trim();

                return (
                  <div
                    key={prod.id}
                    className={cn(
                      "group relative flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all duration-150 shadow-xs hover:shadow-md",
                      activePlatform === "meituan" && isBound
                        ? "border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-emerald-950/[0.04]"
                        : activePlatform === "meituan" && hasSuggestion
                        ? "border-sky-500/30 bg-sky-500/[0.02] dark:bg-sky-950/[0.04]"
                        : "border-border/70 dark:border-white/8 bg-white dark:bg-white/[0.03] hover:border-primary/40"
                    )}
                  >
                    {/* 左侧：系统商品缩略图与主体信息 */}
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <div className="relative h-11 w-11 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-xl bg-muted border border-border/60 shadow-inner flex items-center justify-center">
                        {prod.image ? (
                          <img
                            src={prod.image}
                            alt={prod.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : null}
                        <Package className="h-5 w-5 opacity-40 text-muted-foreground absolute pointer-events-none" />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors truncate max-w-xs sm:max-w-md">
                            {prod.name}
                          </span>
                          {prod.category && (
                            <span className="text-[10px] font-bold bg-muted dark:bg-white/10 px-2 py-0.5 rounded-md text-muted-foreground shrink-0">
                              {prod.category.name}
                            </span>
                          )}
                        </div>

                        {/* 自编店内码/SKU 胶囊 */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold bg-primary/10 text-primary border border-primary/15 px-2 py-0.5 rounded-md">
                            <span className="text-[10px] opacity-70">店内码/SKU:</span>
                            <span>{prod.shopSku || prod.sku || "未设置"}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 右侧：美团配对状态与操作区域 */}
                    <div className="flex flex-wrap items-center gap-2.5 self-end md:self-auto shrink-0">
                      {/* 1. 已关联美团 ID 徽章展示（允许多对一） */}
                      {activePlatform === "meituan" && isBound && (
                        <div className="flex flex-wrap items-center gap-2">
                          {prod.meituanSkuMappings.map((mapping) => (
                            <div
                              key={mapping.id}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs shadow-xs"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              <div className="min-w-0 max-w-[180px]">
                                <span className="font-black font-mono text-emerald-700 dark:text-emerald-300 text-xs">
                                  ID: {mapping.meituanSkuId}
                                </span>
                                {mapping.meituanName && (
                                  <span className="text-[10px] text-muted-foreground block truncate">
                                    {mapping.meituanName}
                                  </span>
                                )}
                              </div>

                              {/* 解除绑定 */}
                              <button
                                onClick={() =>
                                  handleUnbindMeituan(
                                    prod.id,
                                    mapping.meituanSkuId,
                                    prod.name
                                  )
                                }
                                title="解除该美团ID关联"
                                className="p-0.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 2. 智能推荐美团商品展示 */}
                      {activePlatform === "meituan" && hasSuggestion && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs shadow-xs">
                          <Sparkles className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                          <div className="min-w-0 max-w-[160px]">
                            <span className="font-bold text-foreground block truncate text-xs">
                              {prod.suggestedMeituanItem?.name}
                            </span>
                            <span className="text-[10px] text-sky-600 dark:text-sky-400 font-mono font-bold block">
                              ID: {prod.suggestedMeituanItem?.meituanSkuId}
                            </span>
                          </div>

                          <button
                            onClick={() =>
                              handleBindMeituan(
                                prod,
                                prod.suggestedMeituanItem!
                              )
                            }
                            className="px-2.5 py-1 text-xs font-black rounded-lg bg-sky-600 hover:bg-sky-500 text-white active:scale-95 transition-all shadow-xs shrink-0"
                          >
                            采纳
                          </button>
                        </div>
                      )}

                      {/* 3. 手动选择美团商品配对按钮 */}
                      {activePlatform === "meituan" ? (
                        <button
                          onClick={() => setTargetProductForPicker(prod)}
                          className={cn(
                            "flex items-center gap-1.5 px-3.5 h-8 sm:h-8.5 text-xs font-black rounded-full transition-all shadow-xs active:scale-95 cursor-pointer",
                            isBound
                              ? "border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted text-foreground"
                              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                          )}
                        >
                          {isBound ? <Plus className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                          <span>{isBound ? "追加美团ID" : "配对美团ID"}</span>
                        </button>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full md:w-auto">
                          <div className="flex items-center gap-2 px-3 h-9 rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 min-w-0 sm:w-72">
                            <Tag className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            <input
                              value={draftPlatformValue}
                              onChange={(event) =>
                                setPlatformIdDrafts((prev) => ({
                                  ...prev,
                                  [platformDraftKey]: event.target.value,
                                }))
                              }
                              placeholder={activePlatformConfig.placeholder}
                              className="w-full min-w-0 bg-transparent outline-none text-xs font-mono font-bold text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setTargetProductForPicker(prod)}
                            disabled={!prod.shopProductId}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-xs font-black border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted text-foreground transition-all active:scale-95 disabled:opacity-40"
                          >
                            <Search className="h-3.5 w-3.5" />
                            <span>挑选</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePlatformId(prod)}
                            disabled={!prod.shopProductId || isSavingPlatformId || !isPlatformValueChanged}
                            className={cn(
                              "inline-flex items-center justify-center gap-1.5 px-3.5 h-9 rounded-full text-xs font-black transition-all active:scale-95",
                              isPlatformValueChanged
                                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                                : "border border-border dark:border-white/10 bg-white dark:bg-white/5 text-muted-foreground"
                            )}
                          >
                            {isSavingPlatformId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            <span>保存</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 4. 底部分页栏 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-t border-border/60 bg-muted/20 dark:bg-white/[0.02] text-xs text-muted-foreground shrink-0">
              <div>
                第 <span className="font-black text-foreground font-number">{page}</span> /{" "}
                <span className="font-number font-bold">{totalPages}</span> 页 (共{" "}
                <span className="font-number font-bold">{total}</span> 个商品)
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1.5 px-4 h-10 rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted disabled:opacity-40 transition-all font-black shadow-xs active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>上一页</span>
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1.5 px-4 h-10 rounded-full border border-border dark:border-white/10 bg-white dark:bg-white/5 hover:bg-muted disabled:opacity-40 transition-all font-black shadow-xs active:scale-95"
                >
                  <span>下一页</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* 全功能大图美团商品挑选弹窗 */}
        <MeituanProductSelectionModal
          isOpen={Boolean(targetProductForPicker)}
          onClose={() => setTargetProductForPicker(null)}
          targetProduct={targetProductForPicker}
          batches={batches}
          currentBatchId={currentBatchId}
          platform={activePlatform}
          platformLabel={activePlatformConfig.label}
          onSelect={(mItem) => {
            if (targetProductForPicker) {
              if (activePlatform === "meituan") {
                handleBindMeituan(targetProductForPicker, mItem);
              } else {
                handleSavePlatformId(targetProductForPicker, mItem.meituanSkuId);
              }
              setTargetProductForPicker(null);
            }
          }}
        />

        {/* 上传模态框 */}
        <UploadMeituanModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          platform={activePlatform}
          platformLabel={activePlatformConfig.label}
          onSuccess={(newBatchId) => {
            fetchBatches();
            setCurrentBatchId(newBatchId);
            fetchShopProducts();
          }}
        />

        {/* 确认删除等弹窗 */}
        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() =>
            setConfirmConfig((prev) => ({ ...prev, isOpen: false }))
          }
        />
      </div>
    </AnimatePresence>,
    document.body
  );
}
