"use client";

import { useState, useEffect, useCallback, Suspense, useMemo, useTransition, type ReactNode } from "react";
import { Plus, ShoppingBag, Calendar, Trash2, Eye, Store, Package, Wallet, Archive, ReceiptText, Check, ArrowUp } from "lucide-react";
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
import NextImage from "next/image";

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
      name: item.shopProduct?.name || item.product?.name || "未知商品",
      image: item.shopProduct?.image || item.product?.image || "",
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
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px] sm:tracking-[0.14em]">{label}</div>
          <div className="mt-1 text-[18px] font-black leading-none tracking-tight text-foreground sm:mt-1.5 sm:text-[24px]">{value}</div>
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
  const [overviewPurchases, setOverviewPurchases] = useState<PurchaseOrder[]>([]);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);


  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseStatusFilter>("All");
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
  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "All";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("All");
    setShopFilter("All");
    setCurrentPage(1);
    
    const params = new URLSearchParams(searchParams);
    params.delete('status');
    replaceCurrentSearch(pathname, params);
  }, [searchParams, pathname]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

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

  // 1. Initial Data Fetch & Mounted Status
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
        fetchData(true);
        
        // Sync filter from URL on mount
        const statusParam = searchParams.get('status');
        if (statusParam) {
            const normalizedStatus = statusParam === "Ordered" ? "Confirmed" : statusParam;
            if (isPurchaseStatusFilter(normalizedStatus)) {
              setStatusFilter(normalizedStatus);
            }
        }
    });
    return () => cancelAnimationFrame(handle);
  }, [searchParams, fetchData]); 

  // 2. Auto-open detail if orderId in URL (Depends on purchases being loaded)
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    if (orderIdParam && purchases.length > 0) {
      const order = purchases.find(p => p.id === orderIdParam);
      if (order) {
        const handle = requestAnimationFrame(() => {
            setEditingPurchase(order);
            setIsModalOpen(true);
            // Clean up URL parameter
            const params = new URLSearchParams(searchParams);
            params.delete('orderId');
            router.replace(`${pathname}?${params.toString()}`);
        });
        return () => cancelAnimationFrame(handle);
      }
    }
  }, [searchParams, purchases, router, pathname]);


  const handleStatusFilterChange = (status: PurchaseStatusFilter) => {
    startTransition(() => {
      setStatusFilter(status);
    });
    
    const params = new URLSearchParams(searchParams);
    if (status === 'All') {
        params.delete('status');
    } else {
        params.set('status', status);
    }
    replaceCurrentSearch(pathname, params);
  };

  const handleCreate = () => {
    setEditingPurchase(null);
    setDetailReadOnly(false);
    setIsModalOpen(true);
  };



  const handleEdit = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setDetailReadOnly(false);
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
        body: JSON.stringify(data),
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
          setStatusFilter("All");
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
        
        const msg = data.status === "Draft" ? "草稿已暂存" : (isEdit ? "采购单已更新" : "采购单已创建");
        showToast(msg, "success");
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

  const filteredPurchases = useMemo(() => {
    return filterPurchases(purchases, { searchQuery, statusFilter, shopFilter });
  }, [purchases, searchQuery, statusFilter, shopFilter]);

  const purchaseStats = useMemo(() => {
    const totalAmount = filteredPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const receivedPurchases = filteredPurchases.filter((purchase) => purchase.status === "Received");
    const pendingPurchases = filteredPurchases.filter((purchase) => purchase.status !== "Received");
    const receivedAmount = receivedPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const pendingAmount = pendingPurchases.reduce((sum, purchase) => sum + (Number(purchase.totalAmount) || 0), 0);
    const shopCount = new Set(filteredPurchases.map((purchase) => purchase.shopName).filter(Boolean)).size;

    return {
      totalCount: filteredPurchases.length,
      totalAmount,
      receivedCount: receivedPurchases.length,
      receivedAmount,
      pendingCount: pendingPurchases.length,
      pendingAmount,
      shopCount,
    };
  }, [filteredPurchases]);

  const totalItems = filteredPurchases.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedPurchases = filteredPurchases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const selectedPurchases = purchases.filter((purchase) => selectedPurchaseIds.includes(purchase.id));

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

  const handleExport = useCallback(async (specificPO?: PurchaseOrder) => {
    const targets = specificPO ? [specificPO] : filteredPurchases;

    if (targets.length === 0) {
      showToast("没有可导出的采购记录", "error");
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
      
      // 添加标题行
      worksheet.addRow([`${title} — ${dateStr}`]);
      worksheet.mergeCells('A1:G1'); // 扩展到 G 列 (小计)
      worksheet.getCell('A1').font = { size: 14, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' }; // 居中及垂直居中
      
      // 添加收货地址
      let displayAddress = "";
      if (specificPO) {
        displayAddress = specificPO.shippingAddress || "";
      } else if (targets.length > 0) {
        const defaultAddr = (typedUser?.shippingAddresses || []).find(a => a.isDefault)?.address;
        displayAddress = targets[0].shippingAddress || defaultAddr || "";
      }

      if (displayAddress) {
        worksheet.addRow([`收货地址：${displayAddress}`]);
        const addrRowIdx = worksheet.rowCount;
        worksheet.mergeCells(`A${addrRowIdx}:M${addrRowIdx}`); // 扩展到 M 列，确保一行能放下
        const addressCell = worksheet.getCell(`A${addrRowIdx}`);
        addressCell.font = { size: 14, bold: true, color: { argb: 'FFFF0000' } }; 
        addressCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false }; // 关闭换行
        worksheet.getRow(addrRowIdx).height = 25; // 稍微调小行高，让间距更自然
      }
      
      // 添加空行
      worksheet.addRow([]);
      
      // 添加表头
      const headerRow = worksheet.addRow(["序号", "商品图片", "商品名称", "货品编码", "单价", "数量", "小计"]);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // 设置列宽
      worksheet.getColumn(1).width = 8;
      worksheet.getColumn(2).width = 18;
      worksheet.getColumn(3).width = 35;
      worksheet.getColumn(4).width = 18;
      worksheet.getColumn(5).width = 12;
      worksheet.getColumn(6).width = 12;
      worksheet.getColumn(7).width = 15;
      
      let globalIndex = 1;
      let currentRowIndex = worksheet.rowCount + 1; // 动态计算下一个数据行的起始索引
      let totalQty = 0;
      let totalAmount = 0;
      
      for (const po of targets) {
        const sortedItems = sortPurchaseItems(
            po.items,
            item => item.shopProduct?.sku || item.product?.sku,
            item => item.shopProduct?.name || item.product?.name
        );
        for (const item of sortedItems) {
          const qty = item.quantity || 0;
          // 兼容性读取单价：尝试多个可能的属性名
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const price = (item as any).price || item.costPrice || item.shopProduct?.costPrice || item.product?.costPrice || 0;
          const subtotal = qty * price;
          const subtotalFormula = { formula: `E${currentRowIndex}*F${currentRowIndex}`, result: subtotal };

          totalQty += qty;
          totalAmount += subtotal;

          // ── 第一步：预取图片并计算尺寸，用于动态行高 ──
          const imageUrl = item.image || item.shopProduct?.image || item.product?.image;
          let imageBuffer: ArrayBuffer | null = null;
          let imgW = 0;
          let imgH = 0;

          if (imageUrl) {
            try {
              const response = await fetch(imageUrl);
              if (response.ok) {
                imageBuffer = await response.arrayBuffer();
                const blob = new Blob([imageBuffer]);
                const blobUrl = URL.createObjectURL(blob);
                const dims = await new Promise<{ width: number; height: number }>((resolve) => {
                  const img = new Image();
                  img.onload = () => { URL.revokeObjectURL(blobUrl); resolve({ width: img.width, height: img.height }); };
                  img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve({ width: 100, height: 100 }); };
                  img.src = blobUrl;
                });
                imgW = dims.width || 100;
                imgH = dims.height || 100;
              }
            } catch (err) {
              console.error("Failed to pre-fetch image for export", err);
            }
          }

          // ── 第二步：根据图片宽高比计算行高 ──
          // 图片列宽 18 ≈ 135px；图片宽度上限留 10px 边距 = 125px
          const COL_WIDTH_PX = 135;
          const IMG_MAX_W = 125;
          const MIN_ROW_H = 80;   // 最小行高（Excel points）
          const MAX_ROW_H = 200;  // 最大行高，防止过高
          const PADDING_PX = 12;  // 上下各留 6px

          let rowHeightPts = MIN_ROW_H;
          let finalW = IMG_MAX_W;
          let finalH = IMG_MAX_W;

          if (imgW > 0 && imgH > 0) {
            // 按宽度缩放，算出对应的图片高度（px）
            const scale = IMG_MAX_W / imgW;
            finalW = imgW * scale;         // ≈ IMG_MAX_W
            finalH = imgH * scale;
            // Excel row height (pts) ≈ px * 0.75；加上上下边距后换算
            rowHeightPts = Math.round((finalH + PADDING_PX) * 0.75);
            rowHeightPts = Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, rowHeightPts));
          }

          // ── 第三步：用正确行高创建行 ──
          const row = worksheet.addRow([
            globalIndex++,
            "", // Placeholder for image
            item.shopProduct?.name || item.product?.name || "未知商品",
            item.shopProduct?.sku || item.product?.sku || "",
            price,
            qty,
            subtotalFormula,
          ]);

          row.height = rowHeightPts;
          row.alignment = { vertical: 'middle', wrapText: true };

          // 对齐设置 (A-G)
          worksheet.getCell(`A${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getCell(`B${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getCell(`C${currentRowIndex}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          worksheet.getCell(`D${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getCell(`E${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getCell(`F${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
          worksheet.getCell(`G${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };

          // 格式化金额
          worksheet.getCell(`E${currentRowIndex}`).numFmt = '¥#,##0.00';
          worksheet.getCell(`G${currentRowIndex}`).numFmt = '¥#,##0.00';

          // ── 第四步：将图片插入对应行，居中对齐 ──
          if (imageBuffer) {
            try {
              const ext = imageUrl!.split('.').pop()?.toLowerCase();
              const extType = ext === 'png' ? 'png' : 'jpeg';

              const imageId = workbook.addImage({
                buffer: imageBuffer,
                extension: extType as 'png' | 'jpeg',
              });

              // 单元格实际像素高度 = rowHeightPts / 0.75
              const cellHeightPx = rowHeightPts / 0.75;

              // 图片居中偏移（比例值）
              const colOffset = ((COL_WIDTH_PX - finalW) / 2) / COL_WIDTH_PX;
              const rowOffset = ((cellHeightPx - finalH) / 2) / cellHeightPx;

              worksheet.addImage(imageId, {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tl: { col: 1 + colOffset, row: currentRowIndex - 1 + rowOffset } as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ext: { width: finalW, height: finalH } as any,
                editAs: 'oneCell',
              });
            } catch (err) {
              console.error("Failed to insert image into worksheet", err);
            }
          }

          currentRowIndex++;
        }
      }
      
      const lastDataRow = currentRowIndex - 1;
      const totalQtyFormula = lastDataRow >= 4 ? { formula: `SUM(F4:F${lastDataRow})`, result: totalQty } : totalQty;
      const totalAmountFormula = lastDataRow >= 4 ? { formula: `SUM(G4:G${lastDataRow})`, result: totalAmount } : totalAmount;

      // Add total row
      const totalRow = worksheet.addRow(["", "", "总计", "", "", totalQtyFormula, totalAmountFormula]);
      totalRow.font = { bold: true };
      totalRow.height = 35; // 稍微增加总计行高度
      
      // 合并总计标签对应的单元格 A-E 没必要全部居中，让"总计"在C列
      worksheet.getCell(`C${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell(`F${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 总数量居中
      worksheet.getCell(`G${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 总金额居中
      worksheet.getCell(`G${currentRowIndex}`).numFmt = '¥#,##0.00';
      
      // Add borders everywhere
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
      
      // Generate and save file
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
  }, [filteredPurchases, showToast, typedUser?.shippingAddresses]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    document.body.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!mounted) return null;

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
              className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all active:scale-95"
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
          <table className="w-full text-left border-collapse min-w-200 table-auto">
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
                <th className="w-[52px] px-1 py-3 text-xs font-bold text-foreground text-center whitespace-nowrap align-middle lg:w-[64px] lg:px-0">
                  <div className="flex justify-center">序号</div>
                </th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">归属店铺</th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">商品与数量</th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">交易金额</th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">状态</th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">下单时间</th>
                <th className="px-3 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap lg:px-6">操作</th>
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
                    <td className="px-3 py-4 whitespace-nowrap text-center lg:px-6">
                      {po.shopName ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/5 text-primary text-[10px] font-bold border border-primary/10">
                              <Store size={10} />
                              {po.shopName}
                          </span>
                      ) : <span className="text-[10px] text-muted-foreground/30 italic">未归属</span>}
                    </td>
                    <td className="px-3 py-4 text-sm text-center lg:px-6">
                      {(() => {
                        const summary = formatPurchaseItemsSummary(po);
                        return (
                          <div className="mx-auto flex max-w-[320px] flex-wrap justify-center gap-2">
                            {summary.items.length > 0 ? summary.items.map((item) => (
                              <div
                                key={item.key}
                                className="flex items-center gap-2 rounded-full border border-border/50 bg-secondary/30 p-0.5 pr-2.5 shadow-sm transition-all hover:border-primary/30 dark:bg-white/5 max-w-[200px]"
                                title={item.name}
                              >
                                <div className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                  {item.image ? (
                                    <NextImage src={item.image} className="object-cover" alt="" fill sizes="24px" />
                                  ) : (
                                    <Package size={12} className="text-muted-foreground/50" />
                                  )}
                                </div>
                                <span className="truncate text-[10px] font-medium leading-none text-foreground/80">
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-[10px] font-black leading-none text-primary">
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
                            <div className="w-full text-center text-[10px] font-bold text-muted-foreground">
                              共 {po.items.length} 项，数量 {summary.totalQuantity}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-center lg:px-6">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-center lg:px-6">
                      <PurchaseStatusBadge status={po.status} />
                    </td>
                    <td className="px-3 py-4 text-sm text-muted-foreground whitespace-nowrap text-center lg:px-6">
                      <div className="flex items-center justify-center gap-1.5 lg:gap-2">
                          <Calendar size={14} />
                          <span className="font-mono">
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center whitespace-nowrap lg:px-6">
                      <div className="flex justify-center items-center gap-2 lg:gap-3">
                        {/* Unified Detail/Manage Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleEdit(po); }}
                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white transition-all shadow-sm group/btn"
                            title="详细管理"
                        >
                          <Eye size={18} className="group-hover/btn:scale-110 transition-transform" />
                        </button>

                        {/* Delete Action */}
                        {canEdit && (
                           <button 
                               onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }}
                               className="h-9 w-9 flex items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-all shadow-sm group/btn"
                               title="删除"
                           >
                             <Trash2 size={18} className="group-hover/btn:scale-110 transition-transform" />
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
               <h3 className="text-xl font-bold text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-sm mt-2 max-w-70 leading-relaxed">
                 {searchQuery || statusFilter !== 'All' ? '当前筛选条件下没有找到记录，尝试调整筛选或搜索关键词。' : '还没有采购记录，点击右上角“新建采购单”开始。'}
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
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-black text-foreground dark:bg-white/8 dark:text-white">
                          {(currentPage - 1) * pageSize + index + 1}
                        </span>
                        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-[11px] font-bold text-primary dark:bg-white/6 dark:text-white">
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
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">商品与数量</div>
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
                                  <div className="relative flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white dark:bg-black">
                                    {item.image ? (
                                      <NextImage src={item.image} className="object-cover" alt="" fill sizes="20px" />
                                    ) : (
                                      <Package size={10} className="text-muted-foreground/50" />
                                    )}
                                  </div>
                                  <span className="max-w-[140px] truncate text-[10px] font-medium leading-none text-foreground/85">
                                    {item.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] font-black leading-none text-primary">
                                    x{item.quantity}
                                  </span>
                                </div>
                              )) : (
                                <div className="col-span-2 text-xs text-muted-foreground">暂无商品</div>
                              )}
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-white/70 px-2.5 py-2 text-[10px] font-bold text-muted-foreground dark:bg-white/[0.06]">
                              <span>
                                共 {po.items.length} 项
                                {summary.hasMore ? ` · 另有 ${po.items.length - summary.items.length} 项` : ""}
                              </span>
                              <span>数量 {summary.totalQuantity}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 border-t border-border/30 pt-2 dark:border-white/6">
                      <div className="flex h-12 min-w-0 flex-1 flex-col justify-center rounded-2xl border border-border/40 bg-muted/25 px-3 dark:border-white/6 dark:bg-white/[0.04]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/75">交易金额</div>
                        <div className="mt-0.5 text-[18px] font-black leading-none tracking-tight text-foreground">
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
               <h3 className="text-lg font-bold text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-xs mt-1 max-w-60">
                 {searchQuery || statusFilter !== 'All' ? '未找到匹配结果，尝试更改筛选条件或搜索关键词。' : '您目前还没有任何采购订单，立即创建一个吧。'}
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
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        onExport={handleExport}
        onOverview={(po) => setOverviewPurchases([po])}
        initialData={editingPurchase || undefined}
        readOnly={detailReadOnly}
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
