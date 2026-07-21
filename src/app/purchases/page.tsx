"use client";

import { useState, useEffect, useCallback, Suspense, useMemo, useTransition, type ReactNode } from "react";
import { Plus, ShoppingBag, Calendar, Trash2, Eye, Store, Package, Wallet, Archive, ReceiptText, Check, ArrowUp, X, FileSpreadsheet, FileText } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOverviewModal } from "@/components/Purchases/PurchaseOverviewModal";
import { PurchaseOrder, User as UserType } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Pagination } from "@/components/ui/Pagination";
import { ActionBar } from "@/components/ui/ActionBar";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PurchaseFilters } from "@/components/Purchases/PurchaseFilters";
import { PurchaseStatusBadge } from "@/components/Purchases/PurchaseStatusBadge";



import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { formatLocalDateTime, formatLocalDate } from "@/lib/dateUtils";
import { sortPurchaseItems } from "@/lib/pinyin";
import { filterPurchases, isPurchaseStatusFilter, PurchaseStatusFilter } from "@/lib/purchases";
import { isAutoInboundOrderLike, isOrderShortagePurchaseLike } from "@/lib/purchaseOrderTypes";

function sortPurchasesByRecency(items: PurchaseOrder[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.date || 0).getTime();
    const bTime = new Date(b.createdAt || b.date || 0).getTime();
    return bTime - aTime;
  });
}

function formatPurchaseItemsSummary(purchase: PurchaseOrder) {
  const visibleItems = purchase.items.slice(0, 2);
  const totalQuantity = purchase.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return {
    items: visibleItems.map((item) => ({
      key: item.id || item.shopProductId || item.productId || `${item.quantity}-${item.costPrice}`,
      name: item.shopProduct?.productName || item.shopProduct?.name || "未知商品",
      image: item.shopProduct?.image || "",
      quantity: item.quantity,
    })),
    hasMore: purchase.items.length > visibleItems.length,
    totalQuantity,
  };
}

function replaceCurrentSearch(pathname: string, params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const query = params.toString();
  const nextUrl = query ? `${pathname}?${query}` : pathname;
  window.history.replaceState(null, "", nextUrl);
}

function formatCurrency(value: number) {
  return `￥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isAutoCreatedPurchaseOrder(order: Pick<PurchaseOrder, "id">) {
  return order.id.startsWith("PO-AUTO-");
}

function shouldHideFromPurchaseManagement(order: Pick<PurchaseOrder, "id" | "type" | "note">) {
  return isAutoCreatedPurchaseOrder(order) || isAutoInboundOrderLike(order) || isOrderShortagePurchaseLike(order);
}

function PurchaseMetricCard({
  label,
  value,
  hint,
  icon,
  accentClassName,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  accentClassName: string;
}) {
  return (
    <div className="rounded-[18px] border border-black/8 bg-white/76 px-3 py-2.5 shadow-xs dark:border-white/10 dark:bg-white/5 sm:px-3.5 sm:py-3">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.14em]">{label}</div>
          <div className="mt-1 text-[18px] font-bold leading-none tracking-tight text-foreground sm:mt-1.5 sm:text-[24px]">{value}</div>
          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground sm:mt-1.5 sm:text-[11px]">{hint}</p>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border sm:h-9 sm:w-9", accentClassName)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function PurchasesContent() {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const { user } = useUser();
  const typedUser = user as unknown as UserType;
  const canCreate = hasPermission(user as SessionUser | null, "purchase:manage");
  const canEdit = canCreate; // For now assuming create permission allows editing drafts
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTargetPO, setExportTargetPO] = useState<PurchaseOrder | undefined>(undefined);
  const [exportColumns, setExportColumns] = useState<string[]>([
    "shippingAddress", "shopName", "index", "image", "name", "sku", "price", "quantity", "subtotal"
  ]);
  const [overviewPurchases, setOverviewPurchases] = useState<PurchaseOrder[]>([]);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);


  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [costBackfillItemId, setCostBackfillItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseStatusFilter>("Confirmed");
  const [shopFilter, setShopFilter] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([]);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    onConfirm: () => {},
    message: "",
  });
  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "Confirmed" || shopFilter !== "All";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("Confirmed");
    setShopFilter("All");
    setCurrentPage(1);
    
    const params = new URLSearchParams(searchParams);
    params.delete('status');
    replaceCurrentSearch(pathname, params);
  }, [searchParams, pathname]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
      setShowScrollTop(scrollTop > 240);
    };

    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const pRes = await fetch(`/api/purchases?page=1&pageSize=99999&_ts=${Date.now()}`, {
        cache: "no-store",
      });
      
      if (pRes.ok) {
        const data = await pRes.json();
        // Extract items from paginated response
        const nextItems = Array.isArray(data) ? data : (data.items || []);
        setPurchases(sortPurchasesByRecency(nextItems));
      }
    } catch (error) {
      console.error("Failed to fetch purchases data:", error);
      showToast("加载数据失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // 1. Initial Data Fetch (Run only once on mount)
  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // 2. Sync filter from URL on searchParams change
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (!statusParam) {
      setStatusFilter("Confirmed");
    } else {
      const normalizedStatus = statusParam === "Ordered" ? "Confirmed" : statusParam;
      if (isPurchaseStatusFilter(normalizedStatus)) {
        setStatusFilter(normalizedStatus);
      }
    }
  }, [searchParams]); 

  // 2. Auto-open detail if orderId in URL (Depends on purchases being loaded)
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    const costBackfillItemIdParam = String(searchParams.get('costItemId') || "").trim();
    const costBackfillMode = searchParams.get('costBackfill') === '1';
    if (!orderIdParam) {
      return;
    }
    const order = purchases.find(p => p.id === orderIdParam);
    const openTargetOrder = (target: PurchaseOrder) => {
      const handle = requestAnimationFrame(() => {
        setEditingPurchase(target);
        setDetailReadOnly(false);
        setCostBackfillItemId(costBackfillMode ? (costBackfillItemIdParam || null) : null);
        setIsModalOpen(true);
        const params = new URLSearchParams(searchParams);
        params.delete('orderId');
        params.delete('costItemId');
        params.delete('costBackfill');
        router.replace(`${pathname}?${params.toString()}`);
      });
      return () => cancelAnimationFrame(handle);
    };
    if (order) {
      return openTargetOrder(order);
    }
    let cancelled = false;
    const fetchTargetOrder = async () => {
      try {
        const res = await fetch(`/api/purchases?orderId=${encodeURIComponent(orderIdParam)}&pageSize=1`);
        const data = await res.json().catch(() => ({})) as { items?: PurchaseOrder[]; error?: string };
        if (!res.ok) {
          throw new Error(data?.error || "读取采购单失败");
        }
        const fetchedOrder = Array.isArray(data.items) ? data.items[0] : null;
        if (!fetchedOrder || cancelled) {
          return;
        }
        setPurchases((prev) => sortPurchasesByRecency([fetchedOrder, ...prev.filter((item) => item.id !== fetchedOrder.id)]));
        setEditingPurchase(fetchedOrder);
        setDetailReadOnly(false);
        setCostBackfillItemId(costBackfillMode ? (costBackfillItemIdParam || null) : null);
        setIsModalOpen(true);
        const params = new URLSearchParams(searchParams);
        params.delete('orderId');
        params.delete('costItemId');
        params.delete('costBackfill');
        router.replace(`${pathname}?${params.toString()}`);
      } catch (error) {
        console.error("Failed to fetch purchase order for auto-open:", error);
      }
    };
    void fetchTargetOrder();
    return () => {
      cancelled = true;
    };
  }, [searchParams, purchases, router, pathname]);


  const handleStatusFilterChange = (status: PurchaseStatusFilter) => {
    startTransition(() => {
      setStatusFilter(status);
    });
    
    const params = new URLSearchParams(searchParams);
    if (status === "Confirmed") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    replaceCurrentSearch(pathname, params);
  };

  const handleCreate = () => {
    setEditingPurchase(null);
    setDetailReadOnly(false);
    setCostBackfillItemId(null);
    setIsModalOpen(true);
  };



  const handleEdit = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setDetailReadOnly(false);
    setCostBackfillItemId(null);
    setIsModalOpen(true);
  };


  const handleDelete = async (id: string) => {
    const po = purchases.find(p => p.id === id);
    if (!po) return;

    const isReceived = po.status === "Received";
    
    let message = `确定要删除单号为 ${id} 的采购单吗？此操作将移除所有关联的采购项目，且不可恢复。`;
    if (isReceived) {
      message = `该采购单 [${id}] 已入库。删除时会同步回滚这张单带来的入库库存；如果这批货已经被后续出库或占用，系统会阻止删除。确定继续吗？`;
    }

    setConfirmConfig({
      isOpen: true,
      title: isReceived ? "删除已入库单据" : "删除采购单",
      message,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
          if (res.ok) {
            setPurchases(prev => prev.filter(p => p.id !== id));
            showToast("采购单已删除", "success");
            setIsModalOpen(false); // Close modal if delete was triggered from inside
          } else {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.error || "删除失败", "error");
          }
        } catch (error) {
          console.error("Delete purchase failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };

  const togglePurchaseSelection = useCallback((id: string) => {
    setSelectedPurchaseIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }, []);





  const handleSave = async (data: Partial<PurchaseOrder>) => {
    try {
      const isEdit = !!editingPurchase;
      const url = isEdit ? `/api/purchases/${editingPurchase.id}` : "/api/purchases";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          costBackfillItemId
            ? {
                ...data,
                costBackfill: true,
                costBackfillItemId,
              }
            : data
        ),
      });

      if (res.ok) {
        const savedPO = await res.json();
        
        // 由于返回的数据可能没有经过 URL resolve，我们在这里执行一次静默获取或者手动维护状态
        // 为了保险起见（图片 resolve 等），我们使用显式的刷新，但采用不带 loading 的方式
        if (isEdit) {
            setPurchases(prev => sortPurchasesByRecency(prev.map(p => p.id === savedPO.id ? { ...p, ...savedPO } : p)));
        } else {
            setPurchases(prev => sortPurchasesByRecency([savedPO, ...prev.filter(p => p.id !== savedPO.id)]));
        }

        if (!isEdit) {
          setSearchQuery("");
          setStatusFilter("Confirmed");
          setShopFilter("All");
          setCurrentPage(1);

          const params = new URLSearchParams(searchParams);
          params.delete("status");
          replaceCurrentSearch(pathname, params);
        }
        
        if (isEdit) {
          // 编辑时再静默对齐一次后端返回，避免覆盖刚创建的新单
          setTimeout(() => {
             fetchData(true);
          }, 500);
        }
        
        const msg = isEdit ? "采购单已更新" : "采购单已创建";
        showToast(msg, "success");
        setCostBackfillItemId(null);
        setIsModalOpen(false);
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData?.error || "保存失败", "error");
      }
    } catch (error) {
      console.error("Purchase save failed:", error);
      showToast("网络错误", "error");
    }
  };

  const visiblePurchases = useMemo(() => {
    return purchases.filter((purchase) => !shouldHideFromPurchaseManagement(purchase));
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    return filterPurchases(visiblePurchases, { searchQuery, statusFilter, shopFilter });
  }, [visiblePurchases, searchQuery, statusFilter, shopFilter]);

  const statsPurchases = useMemo(() => {
    return filterPurchases(visiblePurchases, {
      searchQuery,
      statusFilter: "All",
      shopFilter,
    });
  }, [visiblePurchases, searchQuery, shopFilter]);

  const purchaseStats = useMemo(() => {
    const totalAmount = statsPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const receivedPurchases = statsPurchases.filter((purchase) => purchase.status === "Received");
    const pendingPurchases = statsPurchases.filter((purchase) => purchase.status !== "Received");
    const receivedAmount = receivedPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const pendingAmount = pendingPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const shopCount = new Set(statsPurchases.map((purchase) => purchase.shopName).filter(Boolean)).size;

    return {
      totalCount: statsPurchases.length,
      totalAmount,
      receivedCount: receivedPurchases.length,
      receivedAmount,
      pendingCount: pendingPurchases.length,
      pendingAmount,
      shopCount,
    };
  }, [statsPurchases]);

  const totalItems = filteredPurchases.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedPurchases = filteredPurchases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const selectedPurchases = visiblePurchases.filter((purchase) => selectedPurchaseIds.includes(purchase.id));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, shopFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleBatchDelete = useCallback(() => {
    if (selectedPurchases.length === 0) return;

    const receivedCount = selectedPurchases.filter((purchase) => purchase.status === "Received").length;
    const message = receivedCount > 0
      ? `已选 ${selectedPurchases.length} 张采购单，其中 ${receivedCount} 张已入库。删除时会自动回滚这些单据带来的库存；若其中有商品已被后续出库或占用，对应单据会删除失败。确定继续吗？`
      : `确定删除已选中的 ${selectedPurchases.length} 张采购单吗？此操作不可恢复。`;

    setConfirmConfig({
      isOpen: true,
      title: "批量删除采购单",
      message,
      onConfirm: async () => {
        try {
          const results = await Promise.allSettled(
            selectedPurchases.map((purchase) =>
              fetch(`/api/purchases/${purchase.id}`, { method: "DELETE" }).then(async (res) => {
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(data.error || `删除失败: ${purchase.id}`);
                }
                return purchase.id;
              })
            )
          );

          const successIds = results
            .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
            .map((result) => result.value);
          const failedCount = results.length - successIds.length;

          if (successIds.length > 0) {
            setPurchases((prev) => prev.filter((purchase) => !successIds.includes(purchase.id)));
            setSelectedPurchaseIds([]);
          }

          if (failedCount > 0) {
            showToast(`已删除 ${successIds.length} 张，失败 ${failedCount} 张`, "error");
          } else {
            showToast(`已删除 ${successIds.length} 张采购单`, "success");
          }
        } catch (error) {
          console.error("Batch delete purchases failed:", error);
          showToast("批量删除失败", "error");
        }
      }
    });
  }, [selectedPurchases, showToast]);

  const handleBatchReceive = useCallback(() => {
    if (selectedPurchases.length === 0) return;

    const eligiblePurchases = selectedPurchases.filter((purchase) => purchase.status !== "Received");
    const skippedCount = selectedPurchases.length - eligiblePurchases.length;

    if (eligiblePurchases.length === 0) {
      showToast("所选采购单都已经入库，无需重复操作", "info");
      return;
    }

    const message = skippedCount > 0
      ? `将批量入库 ${eligiblePurchases.length} 张采购单，另外 ${skippedCount} 张已入库会自动跳过。确定继续吗？`
      : `确定将已选中的 ${eligiblePurchases.length} 张采购单批量入库吗？`;

    setConfirmConfig({
      isOpen: true,
      title: "批量确认入库",
      message,
      onConfirm: async () => {
        try {
          const results = await Promise.allSettled(
            eligiblePurchases.map((purchase) =>
              fetch(`/api/purchases/${purchase.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "Received" }),
              }).then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  throw new Error(data?.error || `入库失败: ${purchase.id}`);
                }
                return { id: purchase.id, data };
              })
            )
          );

          const successIds = results
            .filter((result): result is PromiseFulfilledResult<{ id: string; data: PurchaseOrder }> => result.status === "fulfilled")
            .map((result) => result.value.id);
          const failedMessages = results
            .filter((result): result is PromiseRejectedResult => result.status === "rejected")
            .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));

          if (successIds.length > 0) {
            setPurchases((prev) => sortPurchasesByRecency(
              prev.map((purchase) => (
                successIds.includes(purchase.id)
                  ? { ...purchase, status: "Received" }
                  : purchase
              ))
            ));
            setSelectedPurchaseIds([]);
            void fetchData(true);
          }

          if (failedMessages.length > 0) {
            showToast(`已入库 ${successIds.length} 张，失败 ${failedMessages.length} 张`, successIds.length > 0 ? "info" : "error");
            console.error("Batch receive purchase failures:", failedMessages);
            return;
          }

          showToast(
            skippedCount > 0
              ? `已入库 ${successIds.length} 张，跳过 ${skippedCount} 张已入库采购单`
              : `已成功入库 ${successIds.length} 张采购单`,
            "success"
          );
        } catch (error) {
          console.error("Batch receive purchases failed:", error);
          showToast("批量入库失败", "error");
        }
      }
    });
  }, [fetchData, selectedPurchases, showToast]);

async function loadAndConvertImageForExcel(imageUrl: string): Promise<{ buffer: ArrayBuffer; width: number; height: number; extension: "jpeg" | "png" } | null> {
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
          const width = img.width || 100;
          const height = img.height || 100;
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

          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
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
          resolve(rawBuffer ? { buffer: rawBuffer, width: img.width || 100, height: img.height || 100, extension: "jpeg" } : null);
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

  const handleExportPdf = useCallback(
    async (
      specificPO?: PurchaseOrder,
      targets: PurchaseOrder[] = [],
      tableColumns: { key: string; header: string; width: number; align: "center" | "left" }[] = [],
      columnsToInclude: string[] = []
    ) => {
      showToast("正在准备高保真 A4 规范 PDF 导出数据，请稍候...", "info");

      try {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const now = new Date();
        const dateStr = `${now.toLocaleDateString("zh-CN")} ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
        const title = specificPO ? `采购单明细` : `进货汇总`;

        let displayAddress = "";
        if (columnsToInclude.includes("shippingAddress")) {
          if (specificPO) {
            displayAddress = specificPO.shippingAddress || "";
          } else if (targets.length > 0) {
            const defaultAddr = (typedUser?.shippingAddresses || []).find((a) => a.isDefault)?.address;
            displayAddress = targets[0].shippingAddress || defaultAddr || "";
          }
        }

        let displayShopName = "";
        if (columnsToInclude.includes("shopName")) {
          if (specificPO) {
            displayShopName = specificPO.shopName || "";
          } else if (targets.length > 0) {
            displayShopName = targets.map((t) => t.shopName).filter(Boolean).join(", ") || "";
          }
        }

        // 1. 列宽精确百分比映射，解决“序号”霸屏与后几列被挤出页面问题
        const colWidthWeights: Record<string, number> = {
          index: 6,
          image: 16,
          name: 36,
          sku: 20,
          price: 8,
          quantity: 7,
          subtotal: 7,
        };

        const totalWeight = tableColumns.reduce((sum, col) => sum + (colWidthWeights[col.key] || 15), 0);
        const normalizedCols = tableColumns.map((col) => {
          const w = colWidthWeights[col.key] || 15;
          const pct = ((w / totalWeight) * 100).toFixed(1);
          return { ...col, widthPct: `${pct}%` };
        });

        // 2. 平铺收集所有的商品数据行
        interface FlatItem {
          globalIndex: number;
          productName: string;
          sku: string;
          imageUrl: string | null;
          price: number;
          quantity: number;
          subtotal: number;
        }

        const flatItems: FlatItem[] = [];
        let globalIndex = 1;
        let totalQty = 0;
        let totalAmount = 0;

        for (const po of targets) {
          const sortedItems = sortPurchaseItems(
            po.items,
            (item) => (item.shopProductId ? item.shopProduct?.sku || "" : item.product?.sku || ""),
            (item) => item.shopProduct?.name || item.product?.name
          );

          for (const item of sortedItems) {
            const qty = item.quantity || 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const price = (item as any).price || item.costPrice || item.shopProduct?.costPrice || item.product?.costPrice || 0;
            const subtotal = qty * price;
            totalQty += qty;
            totalAmount += subtotal;

            flatItems.push({
              globalIndex,
              productName: item.shopProduct?.name || item.product?.name || "未知商品",
              sku: item.shopProductId ? item.shopProduct?.sku || "" : item.product?.sku || "",
              imageUrl: item.shopProduct?.image || item.image || null,
              price,
              quantity: qty,
              subtotal,
            });
            globalIndex++;
          }
        }

        // 3. 计算物理分页（卡片式大图排版，首页放 4-5 个商品卡片，续页放 5 个）
        const hasHeaderBanner = Boolean(displayAddress || displayShopName);
        const FIRST_PAGE_LIMIT = hasHeaderBanner ? 4 : 5;
        const OTHER_PAGE_LIMIT = 5;

        const pagesData: FlatItem[][] = [];
        let remaining = [...flatItems];

        if (remaining.length > 0) {
          pagesData.push(remaining.splice(0, FIRST_PAGE_LIMIT));
        }
        while (remaining.length > 0) {
          pagesData.push(remaining.splice(0, OTHER_PAGE_LIMIT));
        }

        if (pagesData.length === 0) {
          pagesData.push([]);
        }

        const totalPages = pagesData.length;

        // 4. 创建离屏总容器
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "40px";
        container.style.backgroundColor = "#e5e7eb";

        const pageNodes: HTMLElement[] = [];

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
          const pageItems = pagesData[pageIdx];
          const isFirstPage = pageIdx === 0;
          const isLastPage = pageIdx === totalPages - 1;

          const pageDiv = document.createElement("div");
          pageDiv.style.width = "794px";
          pageDiv.style.minHeight = "1123px";
          pageDiv.style.height = "1123px"; // 固定精准 A4 比例
          pageDiv.style.padding = "36px 40px";
          pageDiv.style.boxSizing = "border-box";
          pageDiv.style.backgroundColor = "#ffffff";
          pageDiv.style.color = "#111827";
          pageDiv.style.position = "relative";
          pageDiv.style.display = "flex";
          pageDiv.style.flexDirection = "column";
          pageDiv.style.fontFamily = "system-ui, -apple-system, sans-serif";

          let html = ``;

          if (isFirstPage) {
            html += `
              <div style="text-align: center; margin-bottom: 16px;">
                <h1 style="font-size: 24px; font-weight: 800; margin: 0 0 4px 0; color: #111827; letter-spacing: -0.5px;">${title}</h1>
                <p style="font-size: 11px; color: #6b7280; margin: 0;">生成时间：${dateStr}</p>
              </div>
            `;

            if (displayAddress) {
              html += `
                <div style="background-color: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 12px 16px; margin-bottom: 12px;">
                  <p style="font-size: 15px; font-weight: 800; color: #dc2626; margin: 0; word-break: break-all;">收货地址：${displayAddress}</p>
                </div>
              `;
            }

            if (displayShopName) {
              html += `
                <div style="background-color: #eff6ff; border: 1.5px solid #bfdbfe; border-radius: 12px; padding: 10px 16px; margin-bottom: 16px;">
                  <p style="font-size: 13px; font-weight: 800; color: #2563eb; margin: 0;">收货店铺：${displayShopName}</p>
                </div>
              `;
            }
          } else {
            html += `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
                <h2 style="font-size: 15px; font-weight: 800; margin: 0; color: #111827;">${title} (续页)</h2>
                <span style="font-size: 11px; color: #6b7280;">${dateStr}</span>
              </div>
            `;
          }

          // 放弃死板的固定多表格，采用清晰图文采购卡片列表！
          html += `<div style="flex: 1; display: flex; flex-direction: column; gap: 14px; overflow: hidden;">`;

          for (const rowItem of pageItems) {
            html += `
              <div style="border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; background-color: #ffffff; display: flex; gap: 18px; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                <!-- 左侧：100px x 100px 超清大图 -->
                <div style="width: 100px; height: 100px; min-width: 100px; border-radius: 10px; overflow: hidden; border: 1px solid #f3f4f6; background-color: #f9fafb; display: flex; align-items: center; justify-content: center;">
                  ${
                    rowItem.imageUrl
                      ? `<img src="${rowItem.imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" />`
                      : `<span style="color: #9ca3af; font-size: 11px;">无主图</span>`
                  }
                </div>
                
                <!-- 右侧：商品详情与采购属性区 -->
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <h3 style="font-size: 15px; font-weight: 800; color: #111827; margin: 0; line-height: 1.35; word-break: break-all;">
                      <span style="display: inline-block; background-color: #f3f4f6; color: #4b5563; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 800; margin-right: 8px;"># ${rowItem.globalIndex}</span>
                      ${rowItem.productName}
                    </h3>
                  </div>

                  ${
                    rowItem.sku
                      ? `<div style="font-size: 12px; color: #4b5563; font-family: monospace;">SKU / 编码: <strong style="color: #111827; background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${rowItem.sku}</strong></div>`
                      : ""
                  }

                  <div style="display: flex; gap: 24px; align-items: center; margin-top: 2px; padding-top: 8px; border-top: 1px dashed #e5e7eb;">
                    <div style="font-size: 13px; color: #4b5563;">进货单价: <strong style="color: #111827;">¥${rowItem.price.toFixed(2)}</strong></div>
                    <div style="font-size: 13px; color: #4b5563;">采购数量: <strong style="font-size: 16px; color: #2563eb;">${rowItem.quantity}</strong></div>
                    <div style="font-size: 13px; color: #059669; margin-left: auto;">小计: <strong style="font-size: 17px; font-weight: 800;">¥${rowItem.subtotal.toFixed(2)}</strong></div>
                  </div>
                </div>
              </div>
            `;
          }

          html += `</div>`;

          // 如果是最后一页，追加底部总计卡片
          if (isLastPage) {
            html += `
              <div style="margin-top: 12px; background-color: #f9fafb; border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 14px; font-weight: 800; color: #374151;">全单采购汇总合计：</span>
                <div style="display: flex; gap: 24px; align-items: center;">
                  <span style="font-size: 13px; color: #4b5563;">总数量: <strong style="font-size: 16px; color: #111827;">${totalQty}</strong> 件</span>
                  <span style="font-size: 13px; color: #059669;">总金额: <strong style="font-size: 18px; font-weight: 800;">¥${totalAmount.toFixed(2)}</strong></span>
                </div>
              </div>
            `;
          }

          // 5. 页脚页码
          html += `
            <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #9ca3af;">
              <span>Goods Manager 采购打印单</span>
              <span>第 ${pageIdx + 1} 页 / 共 ${totalPages} 页</span>
            </div>
          `;

          pageDiv.innerHTML = html;
          container.appendChild(pageDiv);
          pageNodes.push(pageDiv);
        }

        document.body.appendChild(container);

        // 等待所有页面上的图片全部加载完成
        const images = Array.from(container.querySelectorAll("img"));
        await Promise.all(
          images.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          })
        );

        // 6. 逐页生成高清 Image 拼接导出 PDF
        const pdf = new jsPDF("p", "mm", "a4");

        for (let i = 0; i < pageNodes.length; i++) {
          const canvas = await html2canvas(pageNodes[i], {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
          });

          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          if (i > 0) {
            pdf.addPage();
          }
          pdf.addImage(imgData, "JPEG", 0, 0, 210, 297); // 完整精准铺满 A4 (210mm x 297mm)
        }

        document.body.removeChild(container);

        const filename = `${title}_${now.toISOString().slice(0, 10)}.pdf`;
        pdf.save(filename);
        showToast(specificPO ? `已导出标准 A4 PDF 单据` : `已成功导出 ${targets.length} 张 A4 PDF 采购单`, "success");
      } catch (error) {
        console.error("PDF export failed:", error);
        showToast("生成 PDF 失败，请稍后重试", "error");
      }
    },
    [typedUser?.shippingAddresses, showToast]
  );

  const handleExport = useCallback(async (specificPO?: PurchaseOrder, columnsToInclude: string[] = exportColumns, format: "excel" | "pdf" = "excel") => {
    // 过滤得到需要的表格列
    const tableColumns = [
      { key: "index", header: "序号", width: 8, align: "center" as const },
      { key: "image", header: "商品图片", width: 18, align: "center" as const },
      { key: "name", header: "商品名称", width: 35, align: "left" as const },
      { key: "sku", header: "货品编码", width: 18, align: "center" as const },
      { key: "price", header: "单价", width: 12, align: "center" as const },
      { key: "quantity", header: "数量", width: 12, align: "center" as const },
      { key: "subtotal", header: "小计", width: 15, align: "center" as const },
    ].filter(col => columnsToInclude.includes(col.key));

    const targets = specificPO ? [specificPO] : filteredPurchases;

    if (targets.length === 0) {
      showToast("没有可导出的采购记录", "error");
      return;
    }

    if (tableColumns.length === 0) {
      showToast("请至少选择一个表格列属性导出", "warning");
      return;
    }

    if (format === "pdf") {
      await handleExportPdf(specificPO, targets, tableColumns, columnsToInclude);
      return;
    }

    showToast("正在准备带有图片的导出数据，请稍候...", "info");

    try {
      const ExcelJS = (await import("exceljs")).default;
      const { saveAs } = await import("file-saver");
      
      const workbook = new ExcelJS.Workbook();
      
      // 添加工作簿元数据，提升文件受信任度，避免编辑限制
      workbook.creator = "Goods Manager";
      workbook.lastModifiedBy = "Goods Manager";
      workbook.created = new Date();
      workbook.modified = new Date();
      
      const worksheet = workbook.addWorksheet("明细");
      
      const now = new Date();
      const dateStr = `${now.toLocaleDateString("zh-CN")} ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
      const title = specificPO ? `采购单明细` : `进货汇总`;
      
      // 动态计算列总数和字母索引
      const totalCols = tableColumns.length;
      const lastColLetter = String.fromCharCode(65 + Math.max(0, totalCols - 1));

      // 添加标题行
      worksheet.addRow([`${title} — ${dateStr}`]);
      worksheet.mergeCells(`A1:${lastColLetter}1`);
      worksheet.getCell('A1').font = { size: 14, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      
      // 添加收货地址
      let displayAddress = "";
      if (columnsToInclude.includes("shippingAddress")) {
        if (specificPO) {
          displayAddress = specificPO.shippingAddress || "";
        } else if (targets.length > 0) {
          const defaultAddr = (typedUser?.shippingAddresses || []).find(a => a.isDefault)?.address;
          displayAddress = targets[0].shippingAddress || defaultAddr || "";
        }
      }

      if (displayAddress) {
        worksheet.addRow([`收货地址：${displayAddress}`]);
        const addrRowIdx = worksheet.rowCount;
        worksheet.mergeCells(`A${addrRowIdx}:${lastColLetter}${addrRowIdx}`);
        const addressCell = worksheet.getCell(`A${addrRowIdx}`);
        addressCell.font = { size: 14, bold: true, color: { argb: 'FFFF0000' } }; 
        addressCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        worksheet.getRow(addrRowIdx).height = 25;
      }
      
      // 添加店铺名称
      let displayShopName = "";
      if (columnsToInclude.includes("shopName")) {
        if (specificPO) {
          displayShopName = specificPO.shopName || "";
        } else if (targets.length > 0) {
          displayShopName = targets.map(t => t.shopName).filter(Boolean).join(", ") || "";
        }
      }

      if (displayShopName) {
        worksheet.addRow([`收货店铺：${displayShopName}`]);
        const shopRowIdx = worksheet.rowCount;
        worksheet.mergeCells(`A${shopRowIdx}:${lastColLetter}${shopRowIdx}`);
        const shopCell = worksheet.getCell(`A${shopRowIdx}`);
        shopCell.font = { size: 12, bold: true, color: { argb: 'FF0000FF' } }; 
        shopCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
        worksheet.getRow(shopRowIdx).height = 22;
      }

      // 添加空行
      worksheet.addRow([]);
      
      // 添加表头
      const headers = tableColumns.map(col => col.header);
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // 设置列宽
      tableColumns.forEach((col, idx) => {
        worksheet.getColumn(idx + 1).width = col.width;
      });
      
      let globalIndex = 1;
      let currentRowIndex = worksheet.rowCount + 1; // 动态计算下一个数据行的起始索引
      let totalQty = 0;
      let totalAmount = 0;
      
      for (const po of targets) {
        const sortedItems = sortPurchaseItems(
            po.items,
            item => item.shopProductId ? (item.shopProduct?.sku || "") : (item.product?.sku || ""),
            item => item.shopProduct?.name || item.product?.name
        );
        for (const item of sortedItems) {
          const qty = item.quantity || 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const price = (item as any).price || item.costPrice || item.shopProduct?.costPrice || item.product?.costPrice || 0;
          const subtotal = qty * price;

          totalQty += qty;
          totalAmount += subtotal;

          // ── 第一步：预取图片并转码为标准 JPEG/PNG，用于动态行高与兼容 Excel 显示 ──
          const hasImageColumn = columnsToInclude.includes("image");
          const imageUrl = item.shopProduct?.image || item.image;
          let imageBuffer: ArrayBuffer | null = null;
          let imageExtension: "jpeg" | "png" = "jpeg";
          let imgW = 0;
          let imgH = 0;

          if (hasImageColumn && imageUrl) {
            const converted = await loadAndConvertImageForExcel(imageUrl);
            if (converted) {
              imageBuffer = converted.buffer;
              imageExtension = converted.extension;
              imgW = converted.width;
              imgH = converted.height;
            }
          }

          const COL_WIDTH_PX = 135;
          const IMG_MAX_W = 125;
          const MIN_ROW_H = hasImageColumn ? 80 : 30; // 如果没有图片，行高为较扁平紧凑的 30 磅
          const MAX_ROW_H = 200;
          const PADDING_PX = 12;

          let rowHeightPts = MIN_ROW_H;
          let finalW = IMG_MAX_W;
          let finalH = IMG_MAX_W;

          if (hasImageColumn && imgW > 0 && imgH > 0) {
            const scale = IMG_MAX_W / imgW;
            finalW = imgW * scale;
            finalH = imgH * scale;
            rowHeightPts = Math.round((finalH + PADDING_PX) * 0.75);
            rowHeightPts = Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, rowHeightPts));
          }

          // ── 第二步：组装数据项 ──
          const rowData = tableColumns.map(col => {
            if (col.key === "index") return globalIndex;
            if (col.key === "image") return ""; // 占位符
            if (col.key === "name") return item.shopProduct?.name || item.product?.name || "未知商品";
            if (col.key === "sku") return item.shopProductId ? (item.shopProduct?.sku || "") : (item.product?.sku || "");
            if (col.key === "price") return price;
            if (col.key === "quantity") return qty;
            if (col.key === "subtotal") {
              const priceIdx = tableColumns.findIndex(c => c.key === "price");
              const qtyIdx = tableColumns.findIndex(c => c.key === "quantity");
              if (priceIdx !== -1 && qtyIdx !== -1) {
                const priceColLetter = String.fromCharCode(65 + priceIdx);
                const qtyColLetter = String.fromCharCode(65 + qtyIdx);
                return { formula: `${priceColLetter}${currentRowIndex}*${qtyColLetter}${currentRowIndex}`, result: subtotal };
              }
              return subtotal;
            }
            return "";
          });

          globalIndex++;

          const row = worksheet.addRow(rowData);
          row.height = rowHeightPts;
          row.alignment = { vertical: 'middle', wrapText: true };

          // 设置对齐方式与格式化
          tableColumns.forEach((col, idx) => {
            const cell = worksheet.getCell(`${String.fromCharCode(65 + idx)}${currentRowIndex}`);
            cell.alignment = { 
              horizontal: col.align, 
              vertical: 'middle',
              wrapText: col.key === "name" 
            };
            
            if (col.key === "price" || col.key === "subtotal") {
              cell.numFmt = '¥#,##0.00';
            }
          });

          // ── 第三步：将图片插入对应列 ──
          if (hasImageColumn && imageBuffer) {
            const imageIdx = tableColumns.findIndex(c => c.key === "image");
            if (imageIdx !== -1) {
              try {
                const imageId = workbook.addImage({
                  buffer: imageBuffer,
                  extension: imageExtension,
                });

                const cellHeightPx = rowHeightPts / 0.75;
                const colOffset = ((COL_WIDTH_PX - finalW) / 2) / COL_WIDTH_PX;
                const rowOffset = ((cellHeightPx - finalH) / 2) / cellHeightPx;

                worksheet.addImage(imageId, {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tl: { col: imageIdx + colOffset, row: currentRowIndex - 1 + rowOffset } as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ext: { width: finalW, height: finalH } as any,
                  editAs: 'oneCell',
                });
              } catch (imgErr) {
                console.error("Failed to insert image into worksheet", imgErr);
              }
            }
          }

          currentRowIndex++;
        }
      }
      
      const lastDataRow = currentRowIndex - 1;

      // ── 第四步：添加总计行 ──
      if (totalCols > 0) {
        const totalRowData = tableColumns.map((col, idx) => {
          if (col.key === "name") return "总计";
          if (col.key === "quantity") {
            const colLetter = String.fromCharCode(65 + idx);
            return lastDataRow >= 4 ? { formula: `SUM(${colLetter}4:${colLetter}${lastDataRow})`, result: totalQty } : totalQty;
          }
          if (col.key === "subtotal") {
            const colLetter = String.fromCharCode(65 + idx);
            return lastDataRow >= 4 ? { formula: `SUM(${colLetter}4:${colLetter}${lastDataRow})`, result: totalAmount } : totalAmount;
          }
          return "";
        });

        if (!tableColumns.some(c => c.key === "name")) {
          totalRowData[0] = "总计";
        }

        const totalRow = worksheet.addRow(totalRowData);
        totalRow.font = { bold: true };
        totalRow.height = 35;
        
        tableColumns.forEach((col, idx) => {
          const cell = worksheet.getCell(`${String.fromCharCode(65 + idx)}${currentRowIndex}`);
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (col.key === "subtotal") {
            cell.numFmt = '¥#,##0.00';
          }
        });
      }
      
      // 样式边框应用
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.font = { ...cell.font, name: '微软雅黑' };
          if (rowNumber > 2) {
            cell.border = {
              top: {style:'thin'},
              left: {style:'thin'},
              bottom: {style:'thin'},
              right: {style:'thin'}
            };
          }
        });
      });
      
      // 保存
      const buffer = await workbook.xlsx.writeBuffer();
      const filename = specificPO 
          ? `采购单_${specificPO.id}_${formatLocalDate(new Date())}.xlsx`
          : `进货汇总_${formatLocalDate(new Date())}.xlsx`;
          
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
      showToast(specificPO ? `已导出单据` : `已导出 ${targets.length} 张单据`, "success");
      
    } catch (error) {
      console.error("Export failed:", error);
      showToast("导出失败，请重试", "error");
    }
  }, [filteredPurchases, showToast, typedUser?.shippingAddresses, exportColumns]);

  const handleExportClick = useCallback((specificPO?: PurchaseOrder) => {
    setExportTargetPO(specificPO);
    setIsExportModalOpen(true);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">采购管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">先下单，等实物到货确认无误后再直接入库。</p>
        </div>
        
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={handleCreate}
              className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all active:scale-95"
            >
              <Plus size={16} className="md:w-4.5 md:h-4.5" />
              新建采购单
            </button>
          </div>
        )}




      </div>

      <section className="mb-5 md:mb-6">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <PurchaseMetricCard
            label="采购单数"
            value={`${purchaseStats.totalCount}`}
            hint={`覆盖 ${purchaseStats.shopCount} 家店`}
            icon={<ReceiptText size={18} className="text-sky-600 dark:text-sky-400" />}
            accentClassName="border-sky-500/15 bg-sky-500/10"
          />
          <PurchaseMetricCard
            label="采购总金额"
            value={formatCurrency(purchaseStats.totalAmount)}
            hint={`当前共 ${purchaseStats.totalCount} 单`}
            icon={<Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />}
            accentClassName="border-emerald-500/15 bg-emerald-500/10"
          />
          <PurchaseMetricCard
            label="待入库金额"
            value={formatCurrency(purchaseStats.pendingAmount)}
            hint={`待入库 ${purchaseStats.pendingCount} 单`}
            icon={<Package size={18} className="text-amber-600 dark:text-amber-400" />}
            accentClassName="border-amber-500/15 bg-amber-500/10"
          />
          <PurchaseMetricCard
            label="已入库金额"
            value={formatCurrency(purchaseStats.receivedAmount)}
            hint={`已完成 ${purchaseStats.receivedCount} 单`}
            icon={<Archive size={18} className="text-violet-600 dark:text-violet-400" />}
            accentClassName="border-violet-500/15 bg-violet-500/10"
          />
        </div>
      </section>

      <PurchaseFilters
        purchases={purchases}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        shopFilter={shopFilter}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearchQuery}
        onStatusChange={handleStatusFilterChange}
        onShopChange={setShopFilter}
        onReset={resetFilters}
      />

      {/* Table/List View */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100dvh-220px-env(safe-area-inset-bottom,0px))]">
          {isLoading && purchases.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">全力加载中...</p>
            </div>
          ) : paginatedPurchases.length > 0 ? (
          <table className="w-full min-w-[720px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[44px]" />
              <col className="w-[40px]" />
              <col className="w-[90px]" />
              <col className="w-[155px]" />
              <col className="w-[90px]" />
              <col className="w-[80px]" />
              <col className="w-[130px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-[44px] px-1 py-3 text-center align-middle lg:w-[52px] lg:px-0">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPurchaseIds.length === filteredPurchases.length) {
                          setSelectedPurchaseIds([]);
                        } else {
                          setSelectedPurchaseIds(filteredPurchases.map((purchase) => purchase.id));
                        }
                      }}
                      className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all duration-300 lg:h-5 lg:w-5 ${
                        selectedPurchaseIds.length === filteredPurchases.length && filteredPurchases.length > 0
                          ? "scale-110 border-foreground bg-foreground text-background shadow-lg shadow-black/10 dark:text-black"
                          : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                      }`}
                    >
                      {selectedPurchaseIds.length === filteredPurchases.length && filteredPurchases.length > 0 ? (
                        <Check size={12} strokeWidth={4} />
                      ) : null}
                    </button>
                  </div>
                </th>
                <th className="w-[52px] px-1 py-3 text-xs text-foreground text-center whitespace-nowrap align-middle lg:w-[64px] lg:px-0">
                  <div className="flex justify-center">序号</div>
                </th>
                <th className="px-4 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">归属店铺</th>
                <th className="px-5 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">商品与数量</th>
                <th className="px-4 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">交易金额</th>
                <th className="px-4 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">状态</th>
                <th className="px-4 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">下单时间</th>
                <th className="px-4 py-4 text-center text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence>
                {paginatedPurchases.map((po, index) => (
                   <motion.tr 
                    key={po.id}
                    initial={{ opacity: 0 }}
                    animate={{ 
                      opacity: (isPending || (isLoading && purchases.length > 0)) ? 0.6 : 1,
                      y: 0 
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="w-[44px] px-1 py-3 text-center align-middle lg:w-[52px] lg:px-0">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePurchaseSelection(po.id);
                          }}
                          className={`relative flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all duration-300 lg:h-5 lg:w-5 ${
                            selectedPurchaseIds.includes(po.id)
                              ? "scale-110 border-foreground bg-foreground text-background shadow-lg shadow-black/10 dark:text-black"
                              : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                          }`}
                        >
                          {selectedPurchaseIds.includes(po.id) ? <Check size={12} strokeWidth={4} /> : null}
                        </button>
                      </div>
                    </td>
                    <td className="w-[52px] px-1 py-3 whitespace-nowrap text-center align-middle lg:w-[64px] lg:px-0">
                      <div className="flex justify-center">
                        <span className="text-xs font-bold text-muted-foreground">
                          {(currentPage - 1) * pageSize + index + 1}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {po.shopName ? (
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/10 bg-primary/5 px-2.5 py-1 text-[10px] text-primary">
                              <Store size={10} />
                              <span className="truncate">{po.shopName}</span>
                          </span>
                      ) : <span className="text-[10px] text-muted-foreground/30 italic">未归属</span>}
                    </td>
                    <td className="px-3 py-4 text-center text-sm">
                      {(() => {
                        const summary = formatPurchaseItemsSummary(po);
                        return (
                          <div className="mx-auto flex max-w-[130px] flex-wrap justify-center gap-1.5">
                            {summary.items.length > 0 ? summary.items.map((item) => (
                              <div
                                key={item.key}
                                className="flex min-w-0 max-w-[105px] items-center gap-1.5 rounded-full border border-border/50 bg-secondary/30 p-0.5 pr-2 shadow-sm transition-all hover:border-primary/30 dark:bg-white/5"
                                title={item.name}
                              >
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                  {item.image ? (
                                    <img src={item.image} className="h-full w-full object-cover" alt="" loading="lazy" />
                                  ) : (
                                    <Package size={12} className="text-muted-foreground/50" />
                                  )}
                                </div>
                                <span className="truncate text-[10px] font-medium leading-none text-foreground/80">
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-[10px] font-bold leading-none text-primary">
                                  x{item.quantity}
                                </span>
                              </div>
                            )) : (
                              <span className="text-xs text-muted-foreground">暂无商品</span>
                            )}
                            {summary.hasMore && (
                              <div className="flex h-7 items-center justify-center rounded-full border border-border/50 bg-muted/50 px-3 text-[10px] font-bold text-muted-foreground">
                                +{po.items.length - summary.items.length}
                              </div>
                            )}
                            <div className="w-full text-center text-[10px] text-muted-foreground">
                              共 <span className="font-bold text-foreground">{po.items.length}</span> 项，数量 <span className="font-bold text-foreground">{summary.totalQuantity}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center font-bold text-foreground">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center whitespace-nowrap">
                      <PurchaseStatusBadge status={po.status} />
                    </td>
                    <td className="px-2 py-4 text-center text-sm text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center justify-center">
                          <span className="font-mono text-xs">
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </td>
                    <td className="px-2 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {/* Unified Detail/Manage Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(po); }}
                            className="h-8 w-8 flex items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-sm group/btn"
                            title="详细管理"
                        >
                          <Eye size={15} className="group-hover/btn:scale-110 transition-transform" />
                        </button>

                        {/* Delete Action */}
                        {canEdit && (
                           <button 
                               onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }}
                               className="h-8 w-8 flex items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm group/btn"
                               title="删除"
                           >
                             <Trash2 size={15} className="group-hover/btn:scale-110 transition-transform" />
                           </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border group-hover:scale-110 transition-transform duration-500">
                 <ShoppingBag size={40} strokeWidth={1.5} />
               </div>
               <h3 className="text-xl text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-sm mt-2 max-w-70 leading-relaxed">
                 {searchQuery || statusFilter !== 'Confirmed' || shopFilter !== 'All' ? '当前筛选条件下没有找到记录，尝试调整筛选或搜索关键词。' : '还没有采购记录，点击右上角“新建采购单”开始。'}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className={cn(
        "grid grid-cols-1 gap-3 md:hidden pb-24 transition-opacity duration-300",
        (isPending || (isLoading && purchases.length > 0)) && "opacity-50"
      )}>
        <AnimatePresence mode="popLayout">
          {isLoading && purchases.length === 0 ? (
             <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-medium">加载中...</p>
             </div>
          ) : paginatedPurchases.length > 0 ? (
            paginatedPurchases.map((po, index) => (
              <motion.div
                key={po.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-[22px] border border-border/70 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#161b2b]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePurchaseSelection(po.id);
                      }}
                      className={`relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        selectedPurchaseIds.includes(po.id)
                          ? "scale-110 border-foreground bg-foreground text-background dark:text-black"
                          : "border-gray-300 bg-white shadow-sm hover:border-gray-400 dark:border-white/20 dark:bg-white/5 dark:hover:border-foreground/50"
                      }`}
                      aria-label={selectedPurchaseIds.includes(po.id) ? "取消勾选采购单" : "勾选采购单"}
                    >
                      {selectedPurchaseIds.includes(po.id) ? <Check size={12} strokeWidth={4} /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground dark:bg-white/8 dark:text-white">
                          {(currentPage - 1) * pageSize + index + 1}
                        </span>
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] text-primary dark:bg-white/6 dark:text-white">
                          <Store size={12} />
                          <span className="max-w-[180px] truncate">{po.shopName || "未指定店铺"}</span>
                        </div>
                        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-foreground/60">
                          <Calendar size={11} className="shrink-0" />
                          <span>{formatLocalDateTime(po.date)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <PurchaseStatusBadge status={po.status} />
                </div>

                <div className="space-y-2.5">
                    <div className="rounded-[18px] border border-border/40 bg-muted/25 p-2.5 dark:border-white/6 dark:bg-white/[0.04]">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">商品与数量</div>
                      {(() => {
                        const summary = formatPurchaseItemsSummary(po);
                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1.5">
                              {summary.items.length > 0 ? summary.items.map((item) => (
                                <div
                                  key={item.key}
                                  className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/50 bg-white/70 p-0.5 pr-2 shadow-sm dark:border-white/8 dark:bg-white/[0.06]"
                                  title={item.name}
                                >
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                    {item.image ? (
                                      <img src={item.image} className="h-full w-full object-cover" alt="" loading="lazy" />
                                    ) : (
                                      <Package size={10} className="text-muted-foreground/50" />
                                    )}
                                  </div>
                                  <span className="max-w-[140px] truncate text-[10px] font-medium leading-none text-foreground/85">
                                    {item.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-bold leading-none text-primary">
                                    x{item.quantity}
                                  </span>
                                </div>
                              )) : (
                                <div className="col-span-2 text-xs text-muted-foreground">暂无商品</div>
                              )}
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-2 text-[10px] text-muted-foreground dark:bg-white/[0.06]">
                              <span>
                                共 <span className="font-bold text-foreground">{po.items.length}</span> 项
                                {summary.hasMore ? <> · 另有 <span className="font-bold text-foreground">{po.items.length - summary.items.length}</span> 项</> : ""}
                              </span>
                              <span>数量 <span className="font-bold text-foreground">{summary.totalQuantity}</span></span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 border-t border-border/30 pt-2 dark:border-white/6">
                      <div className="flex h-12 min-w-0 flex-1 flex-col justify-center rounded-2xl border border-border/40 bg-muted/25 px-3 dark:border-white/6 dark:bg-white/[0.04]">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/75">交易金额</div>
                        <div className="mt-0.5 text-[18px] font-bold leading-none tracking-tight text-foreground">
                          {formatCurrency(po.totalAmount)}
                        </div>
                      </div>
                      <button 
                          onClick={() => handleEdit(po)}
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 shadow-sm transition-all active:scale-95 hover:bg-blue-500 hover:text-white dark:bg-blue-500/12 dark:text-blue-300"
                          title="详细管理"
                      >
                          <Eye size={18} />
                      </button>

                      {canEdit && (
                          <button 
                              onClick={() => handleDelete(po.id)}
                              className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 shadow-sm transition-all active:scale-95 hover:bg-red-500 hover:text-white dark:bg-red-500/12 dark:text-red-300"
                              title="删除"
                          >
                              <Trash2 size={18} />
                          </button>
                      )}
                    </div>
                </div>
              </motion.div>
            ))
          ) : (
             <div className="py-12 flex flex-col items-center justify-center text-center">
               <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
                 <ShoppingBag size={32} />
               </div>
               <h3 className="text-lg text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-xs mt-1 max-w-60">
                 {searchQuery || statusFilter !== 'Confirmed' || shopFilter !== 'All' ? '未找到匹配结果，尝试更改筛选条件或搜索关键词。' : '您目前还没有任何采购订单，立即创建一个吧。'}
               </p>
              </div>
           )}
        </AnimatePresence>
      </div>

      {!isLoading && totalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}



       <PurchaseOrderModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setCostBackfillItemId(null);
        }}
        onSubmit={handleSave}
        onExport={handleExportClick}
        onOverview={(po) => setOverviewPurchases([po])}
        initialData={editingPurchase || undefined}
        readOnly={detailReadOnly}
        costBackfillItemId={costBackfillItemId}
        defaultType="Purchase"
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel="确认删除"
        variant="danger"
      />
      {/* Purchase Overview Modal */}
      <PurchaseOverviewModal
        isOpen={overviewPurchases.length > 0}
        onClose={() => setOverviewPurchases([])}
        purchases={overviewPurchases}
      />

      {/* Export Settings Modal */}
      <ExportSettingsModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportTargetPO(undefined);
        }}
        selectedColumns={exportColumns}
        onChange={setExportColumns}
        onConfirm={(cols, format) => {
          setIsExportModalOpen(false);
          void handleExport(exportTargetPO, cols, format);
          setExportTargetPO(undefined);
        }}
      />

      <ActionBar
        selectedCount={selectedPurchaseIds.length}
        totalCount={filteredPurchases.length}
        onToggleSelectAll={() => {
          if (selectedPurchaseIds.length === filteredPurchases.length) {
            setSelectedPurchaseIds([]);
          } else {
            setSelectedPurchaseIds(filteredPurchases.map((purchase) => purchase.id));
          }
        }}
        onClear={() => setSelectedPurchaseIds([])}
        label="张采购单"
        onDelete={canEdit ? handleBatchDelete : undefined}
        extraActions={canEdit ? [{
          label: "批量入库",
          icon: <Archive size={16} />,
          onClick: handleBatchReceive,
        }] : []}
      />

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              onClick={scrollToTop}
              className="fixed bottom-24 right-4 z-9999 flex h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl text-foreground transition-all active:scale-95 sm:bottom-12 sm:right-12 sm:h-12 sm:w-12 hover:scale-110 group"
              aria-label="返回顶部"
            >
              <ArrowUp size={20} className="group-hover:-translate-y-1 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>

  );
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={
        <div className="flex h-[50dvh] items-center justify-center text-muted-foreground">
            正在加载采购数据...
        </div>
    }>
      <PurchasesContent />
    </Suspense>
  );
}

interface ExportSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedColumns: string[], format: "excel" | "pdf") => void;
  selectedColumns: string[];
  onChange: (columns: string[]) => void;
}

function ExportSettingsModal({ isOpen, onClose, onConfirm, selectedColumns, onChange }: ExportSettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const allColumns = [
    { key: "shippingAddress", label: "收货地址 (外部信息)", desc: "在表格/文档上方以红色特大字体展示采购收货详细地址" },
    { key: "shopName", label: "店铺名称 (外部信息)", desc: "在表格/文档上方以蓝色字体展示收货的店铺名称" },
    { key: "index", label: "序号", desc: "明细列：显示商品排列序号 (1, 2, 3...)" },
    { key: "image", label: "商品图片", desc: "明细列：在导出中嵌入商品实物缩略图" },
    { key: "name", label: "商品名称", desc: "明细列：商品详细标题" },
    { key: "sku", label: "货品编码", desc: "明细列：店内识别码/SKU，可为空" },
    { key: "price", label: "单价", desc: "明细列：商品进货单价，自动保留两位小数" },
    { key: "quantity", label: "数量", desc: "明细列：本单采购数量" },
    { key: "subtotal", label: "小计", desc: "明细列：单价*数量的计算，若单价和数量都勾选，会自动计算小计" },
  ];

  const handleToggle = (key: string) => {
    if (selectedColumns.includes(key)) {
      onChange(selectedColumns.filter(c => c !== key));
    } else {
      onChange([...selectedColumns, key]);
    }
  };

  const handleSelectAll = () => {
    onChange(allColumns.map(c => c.key));
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-60000 flex items-center sm:items-center justify-center p-3 sm:p-4">
      {/* Background overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white dark:bg-gray-900 shadow-2xl border border-border/50 flex flex-col max-h-[90vh] sm:max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="border-b border-border p-4 sm:p-6 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-foreground">自定义导出设置</h3>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">请选择导出格式以及采购文档中包含的信息</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-muted active:scale-90 transition-all touch-manipulation">
            <X size={18} />
          </button>
        </div>

        {/* Format Selector */}
        <div className="px-4 sm:px-6 pt-3.5 pb-3 border-b border-border/50 bg-muted/20 shrink-0">
          <p className="text-[11px] sm:text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">选择导出文件格式</p>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => setExportFormat("excel")}
              className={`flex items-center justify-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-2xl border font-bold text-xs sm:text-sm active:scale-[0.98] transition-all touch-manipulation ${
                exportFormat === "excel"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm ring-1 ring-emerald-500/30"
                  : "border-border hover:bg-muted text-muted-foreground"
              }`}
            >
              <FileSpreadsheet size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>Excel 表格 (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => setExportFormat("pdf")}
              className={`flex items-center justify-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 rounded-2xl border font-bold text-xs sm:text-sm active:scale-[0.98] transition-all touch-manipulation ${
                exportFormat === "pdf"
                  ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400 shadow-sm ring-1 ring-red-500/30"
                  : "border-border hover:bg-muted text-muted-foreground"
              }`}
            >
              <FileText size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>PDF 文档 (.pdf)</span>
            </button>
          </div>
        </div>

        {/* List of attributes */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
          <div className="flex gap-2 justify-end mb-1">
            <button type="button" onClick={handleSelectAll} className="text-xs font-medium text-primary hover:underline p-1 touch-manipulation">全选</button>
            <span className="text-muted-foreground/30 text-xs self-center">|</span>
            <button type="button" onClick={handleSelectNone} className="text-xs font-medium text-muted-foreground hover:underline p-1 touch-manipulation">清空</button>
          </div>
          <div className="space-y-2">
            {allColumns.map(col => {
              const isChecked = selectedColumns.includes(col.key);
              return (
                <div 
                  key={col.key}
                  onClick={() => handleToggle(col.key)}
                  className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-2xl border cursor-pointer active:scale-[0.99] transition-all touch-manipulation ${
                    isChecked 
                      ? "border-primary bg-primary/5 dark:bg-primary/10" 
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className={`mt-0.5 relative flex h-4 w-4 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                    isChecked 
                      ? "border-primary bg-primary text-primary-foreground" 
                      : "border-gray-300 dark:border-white/20"
                  }`}>
                    {isChecked && <Check size={10} strokeWidth={4} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs sm:text-sm font-bold leading-tight ${isChecked ? "text-primary" : "text-foreground/90"}`}>{col.label}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground/80 mt-1 leading-normal">{col.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 sm:p-6 flex items-center justify-end gap-2.5 sm:gap-3 shrink-0 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="h-11 sm:h-10 px-4 sm:px-5 rounded-full text-xs sm:text-sm font-medium text-muted-foreground hover:bg-muted active:scale-95 transition-all touch-manipulation"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedColumns, exportFormat)}
            className="h-11 sm:h-10 px-5 sm:px-6 rounded-full text-xs sm:text-sm font-medium bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all touch-manipulation"
          >
            确认导出 ({exportFormat === "excel" ? "Excel" : "PDF"})
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
