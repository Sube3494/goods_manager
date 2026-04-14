"use client";

import { useState, useEffect, useCallback, Suspense, useMemo, useTransition } from "react";
import { Plus, ShoppingBag, Calendar, Trash2, Eye, Store } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOverviewModal } from "@/components/Purchases/PurchaseOverviewModal";
import { PurchaseOrder, User as UserType } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ImageGallery } from "@/components/ui/ImageGallery";
import { Pagination } from "@/components/ui/Pagination";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PurchaseFilters } from "@/components/Purchases/PurchaseFilters";
import { PurchaseStatusBadge } from "@/components/Purchases/PurchaseStatusBadge";
import { PurchaseTrackingList } from "@/components/Purchases/PurchaseTrackingList";



import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { formatLocalDateTime, formatLocalDate } from "@/lib/dateUtils";
import { sortPurchaseItems } from "@/lib/pinyin";
import { filterPurchases, isPurchaseStatusFilter, PurchaseStatusFilter } from "@/lib/purchases";

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
  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
    scale: number;
    direction: number;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0,
    scale: 1,
    direction: 0
  });

  const hasActiveFilters = searchQuery.trim() !== "" || statusFilter !== "All";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("All");
    setShopFilter("All");
    setCurrentPage(1);
    
    // Also clean URL params if necessary
    const params = new URLSearchParams(searchParams);
    params.delete('status');
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, router, pathname]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const pRes = await fetch("/api/purchases?page=1&pageSize=99999");
      
      if (pRes.ok) {
        const data = await pRes.json();
        // Extract items from paginated response
        setPurchases(Array.isArray(data) ? data : (data.items || []));
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
    router.replace(`${pathname}?${params.toString()}`);
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
      message = `警告：该采购单 [${id}] 已入库。删除此单据不会自动回滚已增加的商品库存。您确定要强制删除吗？此操作不可逆。`;
    }

    setConfirmConfig({
      isOpen: true,
      title: isReceived ? "强制删除已入库单据" : "删除采购单",
      message,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
          if (res.ok) {
            setPurchases(prev => prev.filter(p => p.id !== id));
            showToast("采购单已删除", "success");
            setIsModalOpen(false); // Close modal if delete was triggered from inside
          } else {
            const errData = await res.json();
            showToast(errData.error || "删除失败", "error");
          }
        } catch (error) {
          console.error("Delete purchase failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };





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
            setPurchases(prev => prev.map(p => p.id === savedPO.id ? { ...p, ...savedPO } : p));
        } else {
            setPurchases(prev => [savedPO, ...prev]);
        }
        
        // 延迟后台同步，确保本地插入/更新动画流程不被刷新数据打断
        setTimeout(() => {
           fetchData(true);
        }, 500);
        
        const msg = data.status === "Draft" ? "草稿已暂存" : (isEdit ? "采购单已更新" : "采购单已创建");
        showToast(msg, "success");
        setIsModalOpen(false);
      } else {
        showToast("保存失败", "error");
      }
    } catch (error) {
      console.error("Purchase save failed:", error);
      showToast("网络错误", "error");
    }
  };

  const filteredPurchases = useMemo(() => {
    return filterPurchases(purchases, { searchQuery, statusFilter, shopFilter });
  }, [purchases, searchQuery, statusFilter, shopFilter]);

  const totalItems = filteredPurchases.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedPurchases = filteredPurchases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, shopFilter, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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

  const handleCopyTrackingNumber = useCallback((trackingNumber: string, compact = false) => {
    navigator.clipboard.writeText(trackingNumber);
    showToast(compact ? "单号已复制" : "单号已复制到剪贴板", "success");
  }, [showToast]);











  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">采购管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">管理与供应商的采购订单，跟踪入库进度。</p>
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
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">单据编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">归属店铺</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">交易金额</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">下单/入库时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">物流信息</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence>
                {paginatedPurchases.map((po) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-foreground font-mono text-xs">{po.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {po.shopName ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/5 text-primary text-[10px] font-bold border border-primary/10">
                              <Store size={10} />
                              {po.shopName}
                          </span>
                      ) : <span className="text-[10px] text-muted-foreground/30 italic">未归属</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <PurchaseStatusBadge status={po.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                          <Calendar size={14} />
                          <span className="font-mono">
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <PurchaseTrackingList
                          trackingData={po.trackingData}
                          status={po.status}
                          onCopy={handleCopyTrackingNumber}
                        />
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-3">
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
        "grid grid-cols-1 gap-4 md:hidden pb-20 transition-opacity duration-300",
        (isPending || (isLoading && purchases.length > 0)) && "opacity-50"
      )}>
        <AnimatePresence mode="popLayout">
          {isLoading && purchases.length === 0 ? (
             <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-medium">加载中...</p>
             </div>
          ) : paginatedPurchases.length > 0 ? (
            paginatedPurchases.map((po) => (
              <motion.div
                key={po.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-2xl border border-border bg-white dark:bg-white/5 p-4 shadow-sm"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-4">
                       <div className="flex items-center gap-2">
                          <span className="font-bold text-base leading-tight font-mono">
                            {po.id}
                          </span>
                       </div>
                   <PurchaseStatusBadge status={po.status} />
                </div>
                
                {/* Card Body */}
                <div className="space-y-3 text-sm mb-4 bg-muted/30 p-3 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">交易金额</span>
                      <span className="font-bold flex items-center text-foreground">
                          <span className="mr-0.5 opacity-70">￥</span>
                          {po.totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">下单时间</span>
                      <div className="flex items-center gap-1.5 text-foreground/80 text-xs text-right font-mono">
                          <Calendar size={13} />
                          <span>
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </div>
                    {po.trackingData && po.trackingData.length > 0 && (
                      <div className="pt-2 border-t border-border/10 space-y-1.5">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">物流包裹 ({po.trackingData.length})</span>
                          <PurchaseTrackingList
                            trackingData={po.trackingData}
                            status={po.status}
                            compact
                            onCopy={handleCopyTrackingNumber}
                          />
                      </div>
                    )}
                </div>
  
                 <div className="flex items-center gap-3 justify-end mt-4 pt-4 border-t border-border/10">
                    {/* Unified Mobile Action */}
                    <button 
                        onClick={() => handleEdit(po)}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500 hover:text-white active:scale-95 transition-all shadow-sm"
                        title="详细管理"
                    >
                        <Eye size={20} />
                    </button>

                    {canEdit && (
                        <button 
                            onClick={() => handleDelete(po.id)}
                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white active:scale-95 transition-all shadow-sm"
                            title="删除"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
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


      {/* Waybill Gallery Preview */}
      <ImageGallery 
        isOpen={galleryState.isOpen}
        images={galleryState.images}
        initialIndex={galleryState.currentIndex}
        onClose={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Purchase Overview Modal */}
      <PurchaseOverviewModal
        isOpen={overviewPurchases.length > 0}
        onClose={() => setOverviewPurchases([])}
        purchases={overviewPurchases}
      />

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
