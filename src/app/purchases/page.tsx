"use client";

import { useState, useEffect, useCallback, Suspense, useMemo, useTransition } from "react";
import { Plus, Search, ShoppingBag, Calendar, Edit2, Trash2, CheckCircle2, Truck, Eye, Copy, ExternalLink, Hash, Camera, FileText, RotateCcw, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOverviewModal } from "@/components/Purchases/PurchaseOverviewModal";
import { PurchaseOrder, PurchaseStatus, TrackingInfo, User as UserType } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ImageGallery } from "@/components/ui/ImageGallery";
import TrackingNumberModal, { TrackingNumberModalProps } from "@/components/Purchases/TrackingNumberModal";
import { useUser } from "@/hooks/useUser";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";



import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { formatLocalDateTime, formatLocalDate } from "@/lib/dateUtils";
import { pinyinMatch, sortPurchaseItems } from "@/lib/pinyin";

const COURIER_CODES: Record<string, string> = {
  "顺丰速运": "shunfeng",
  "圆通速递": "yuantong",
  "中通快递": "zhongtong",
  "申通快递": "shentong",
  "韵达快递": "yunda",
  "极兔速递": "jtexpress",
  "EMS": "ems",
  "邮政快递": "youzhengguonei",
  "京东快递": "jd",
  "德邦快递": "debangwuliu",
  "安能物流": "annengwuliu",
  "跨越速运": "kuayue"
};

const getTrackingUrl = (num: string, courierName?: string) => {
  const code = courierName ? COURIER_CODES[courierName] : "";
  if (!num || !code) return null;
  return `https://www.kuaidi100.com/chaxun?com=${code}&nu=${num.trim()}`;
};

function PurchasesContent() {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const { user } = useUser();
  const typedUser = user as unknown as UserType;
  const canCreate = hasPermission(user as SessionUser | null, "purchase:create");
  const canInbound = hasPermission(user as SessionUser | null, "inbound:create");
  const canEdit = canCreate; // For now assuming create permission allows editing drafts
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [overviewPurchase, setOverviewPurchase] = useState<PurchaseOrder | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);


  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
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
  const [trackingModal, setTrackingModal] = useState<{
    isOpen: boolean;
    purchaseId: string | null;
    initialValue: TrackingInfo[];
    paymentVouchers?: string[];
    paymentVoucher?: string;
    lockPackages: boolean;
    mode: NonNullable<TrackingNumberModalProps['mode']>;
  }>({
    isOpen: false,
    purchaseId: null,
    initialValue: [],
    paymentVouchers: [],
    lockPackages: false,
    mode: "all",
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

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const pRes = await fetch("/api/purchases");
      
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
        fetchData();
        
        // Sync filter from URL on mount
        const statusParam = searchParams.get('status');
        if (statusParam) {
            setStatusFilter(statusParam === 'Ordered' ? 'Confirmed' : statusParam);
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


  const handleStatusFilterChange = (status: string) => {
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

  const getStatusColor = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Shipped": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "Confirmed":
      case "Ordered": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  const getStatusLabel = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "已入库";
      case "Shipped": return "运输中";
      case "Confirmed":
      case "Ordered": return "已下单";
      default: return "草稿";
    }
  };
  
  const getTypeLabel = (type?: string) => {
    switch (type) {
      case "Return": return "销售退回";
      case "InternalReturn": return "领用退回";
      case "Inbound": return "补拨入库";
      default: return "采购入库";
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type) {
      case "Return": return "text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-500/10 dark:border-orange-500/20";
      case "InternalReturn": return "text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20";
      case "Inbound": return "text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-500/10 dark:border-indigo-500/20";
      default: return "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20";
    }
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

  const handleView = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setDetailReadOnly(true);
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

  const handleConfirmReceipt = async (id: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Received" }),
      });
      if (res.ok) {
        fetchData();
        showToast("采购入库成功", "success");
      } else {
        showToast("入库失败", "error");
      }
    } catch (error) {
      console.error("Confirm receipt failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleUpdateTracking = async (id: string, trackingData: TrackingInfo[], paymentVouchers?: string[], shouldTransition: boolean = true) => {
    try {
      // 记录当前状态，如果是 Confirmed/Ordered，则流转到 Shipped (仅当有物流信息时，且用户明确要求流转)
      const currentOrder = purchases.find(p => p.id === id);
      const hasTracking = trackingData && trackingData.length > 0 && trackingData.some(td => td.number.trim());
      
      const newStatus = (shouldTransition && (currentOrder?.status === "Confirmed" || (currentOrder?.status as string) === "Ordered") && hasTracking)
        ? "Shipped" 
        : currentOrder?.status;

      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            trackingData, 
            paymentVouchers,
            status: newStatus 
        }),
      });
      if (res.ok) {
        const updatedOrder = await res.json();
        // fetchData(); // 移除全量刷新，改为局部更新
        setPurchases(prev => prev.map(p => p.id === id ? { ...p, ...updatedOrder } : p));
        
        const isNowShipped = newStatus === "Shipped" && currentOrder?.status !== "Shipped";
        showToast(shouldTransition && isNowShipped ? "进货资料已更新，订单已发货" : "进货资料已暂存", "success");
      } else {
        showToast("更新失败", "error");
      }
    } catch (error) {
      console.error("Update fulfillment info failed:", error);
      showToast("网络错误", "error");
    }
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
        fetchData();
        const isDraft = data.status === "Draft" || data.status === "Confirmed" || data.status === "Shipped"; // If status didn't change, it's a save
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
    return purchases.filter(p => {
      const query = searchQuery.trim();
      if (!query) {
        let matchesStatus = statusFilter === 'All';
        if (!matchesStatus) {
          if (statusFilter === 'Confirmed') {
            matchesStatus = p.status === 'Confirmed' || (p.status as string) === 'Ordered';
          } else {
            matchesStatus = p.status === statusFilter;
          }
        }
        return matchesStatus;
      }

      const matchesId = pinyinMatch(p.id, query);
      const matchesSupplier = p.items.some(item => 
        item.supplier?.name && pinyinMatch(item.supplier.name, query)
      );
      const matchesProduct = p.items.some(item =>
        item.product?.name && pinyinMatch(item.product.name, query)
      );
      
      let matchesStatus = statusFilter === 'All';
      if (!matchesStatus) {
        if (statusFilter === 'Confirmed') {
          matchesStatus = p.status === 'Confirmed' || (p.status as string) === 'Ordered';
        } else {
          matchesStatus = p.status === statusFilter;
        }
      }
      
      return (matchesId || matchesSupplier || matchesProduct) && matchesStatus;
    });
  }, [purchases, searchQuery, statusFilter]);

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
      
      const dateStr = new Date().toLocaleDateString("zh-CN");
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
            item => item.product?.sku,
            item => item.product?.name
        );
        for (const item of sortedItems) {
          const qty = item.quantity || 0;
          // 兼容性读取单价：尝试多个可能的属性名
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const price = (item as any).price || item.costPrice || item.product?.costPrice || 0;
          const subtotal = qty * price;
          const subtotalFormula = { formula: `E${currentRowIndex}*F${currentRowIndex}`, result: subtotal };
          
          totalQty += qty;
          totalAmount += subtotal;
          
          const row = worksheet.addRow([
            globalIndex++,
            "", // Placeholder for image
            item.product?.name || "未知商品",
            item.product?.sku || "",
            price,
            qty,
            subtotalFormula,
          ]);
          
          row.height = 80;
          row.alignment = { vertical: 'middle', wrapText: true };
          
          // 对齐设置 (A-G)
          worksheet.getCell(`A${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 序号
          worksheet.getCell(`B${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 图片
          worksheet.getCell(`C${currentRowIndex}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };   // 名称 (确保换行)
          worksheet.getCell(`D${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 编码
          worksheet.getCell(`E${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 单价
          // 让数量和金额都是数值型（确保公式可计算），数量可编辑
          worksheet.getCell(`F${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 数量
          worksheet.getCell(`G${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' }; // 小计
          
          // 格式化金额
          worksheet.getCell(`E${currentRowIndex}`).numFmt = '¥#,##0.00';
          worksheet.getCell(`G${currentRowIndex}`).numFmt = '¥#,##0.00';
          
          // Image handling
          const imageUrl = item.image || item.product?.image;
          if (imageUrl) {
            try {
              // Fetch image as array buffer
              const response = await fetch(imageUrl);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                const ext = imageUrl.split('.').pop()?.toLowerCase();
                const extType = ext === 'png' ? 'png' : 'jpeg';
                
                const imageId = workbook.addImage({
                  buffer: buffer,
                  extension: extType as 'png' | 'jpeg',
                });
                
                // Get image dimensions to preserve aspect ratio
                const blob = new Blob([buffer]);
                const blobUrl = URL.createObjectURL(blob);
                const dims = await new Promise<{width: number, height: number}>((resolve) => {
                  const img = new Image();
                  img.onload = () => {
                    URL.revokeObjectURL(blobUrl);
                    resolve({ width: img.width, height: img.height });
                  };
                  img.onerror = () => {
                    URL.revokeObjectURL(blobUrl);
                    resolve({ width: 100, height: 100 });
                  };
                  img.src = blobUrl;
                });

                // Excel width 18 (getColumn.width) is approx 135px in many viewers
                // Row height 80 (row.height) is approx 106px (80 * 1.33)
                const cellWidthPx = 135;
                const cellHeightPx = 106;
                
                const maxW = 125;
                const maxH = 95;
                const scale = Math.min(maxW / dims.width, maxH / dims.height);
                
                const finalW = dims.width * scale;
                const finalH = dims.height * scale;

                // Calculate center offset in pixels, then convert to proportional offset for ExcelJS
                // colOffset and rowOffset are fractions of the cell's dimension
                const colOffsetPx = (cellWidthPx - finalW) / 2;
                const rowOffsetPx = (cellHeightPx - finalH) / 2;
                
                const colOffset = colOffsetPx / cellWidthPx;
                const rowOffset = rowOffsetPx / cellHeightPx;

                // Add image to cell with preserved aspect ratio and centering
                worksheet.addImage(imageId, {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  tl: { col: 1 + colOffset, row: currentRowIndex - 1 + rowOffset } as any,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ext: { width: finalW, height: finalH } as any,
                  editAs: 'oneCell'
                });
              }
            } catch (err) {
              console.error("Failed to load image for export", err);
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
              className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
            >
              <Plus size={16} className="md:w-[18px] md:h-[18px]" />
              新建采购单
            </button>
          </div>
        )}




      </div>

      {/* Search Box & Reset */}
      <div className="flex flex-row items-center gap-3 mb-6 md:mb-8">
        <div className="h-11 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 flex-1 relative">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
            type="text"
            placeholder="搜索采购记录..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full pr-8"
            />
            {searchQuery && (
                <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 p-1 rounded-full transition-colors"
                >
                    <X size={14} />
                </button>
            )}
        </div>

        {hasActiveFilters && (
            <button
                onClick={resetFilters}
                className="h-11 px-4 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
            >
                <RotateCcw size={14} />
                <span>重置</span>
            </button>
        )}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar mb-6 md:mb-8">
          {['All', 'Confirmed', 'Shipped', 'Received', 'Draft'].map(status => (
              <button
                key={status}
                onClick={() => handleStatusFilterChange(status)}
                className={cn(
                    "px-4 h-9 rounded-full text-sm font-bold transition-all whitespace-nowrap border",
                    statusFilter === status 
                        ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                        : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80",
                    statusFilter !== "All" && status === statusFilter && status !== "All" && "ring-2 ring-primary/20"
                )}
              >
                {status === 'All' ? '全部' : 
                 status === 'Confirmed' ? '已下单' :
                 status === 'Shipped' ? '运输中' :
                 status === 'Received' ? '已入库' : '草稿'}
              </button>
          ))}
      </div>

      {/* Table/List View */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-white/5 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">全力加载中...</p>
            </div>
          ) : filteredPurchases.length > 0 ? (
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">单据编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">业务类型</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">交易金额</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">下单/入库时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">物流信息</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredPurchases.map((po) => (
                   <motion.tr 
                    key={po.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isPending ? 0.6 : 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-foreground font-mono text-xs">{po.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${getTypeColor(po.type)}`}>
                        {getTypeLabel(po.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                        {getStatusLabel(po.status)}
                      </span>
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
                        <div className="flex flex-col gap-1.5 min-w-[140px] max-w-[200px] mx-auto">
                          {(po.trackingData && po.trackingData.length > 0) ? (
                            po.trackingData.map((td, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center gap-2 text-[10px] text-orange-500 font-mono bg-orange-500/5 px-2 py-0.5 rounded-md border border-orange-500/10 group/item relative overflow-hidden"
                              >
                                <Truck size={10} className="shrink-0" />
                                <span className="opacity-70 shrink-0 whitespace-nowrap">{td.courier}:</span>
                                <span className="font-bold truncate min-w-0">{td.number}</span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(td.number);
                                    showToast("单号已复制到剪贴板", "success");
                                  }}
                                  className="p-0.5 hover:bg-orange-500/20 rounded"
                                  title="复制单号"
                                >
                                  <Copy size={10} />
                                </button>
                                {(() => {
                                  const url = getTrackingUrl(td.number, td.courier);
                                  if (!url) return null;
                                  return (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(url, '_blank');
                                      }}
                                      className="p-0.5 hover:bg-orange-500/20 rounded"
                                      title="追踪查询"
                                    >
                                      <ExternalLink size={10} />
                                    </button>
                                  );
                                })()}
                              </div>
                            ))
                          ) : (
                            po.status !== "Draft" && <span className="text-[10px] text-muted-foreground opacity-30 italic">暂由仓库处理中</span>
                          )}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-1 transition-opacity">
                        {po.status !== "Draft" && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleView(po); }}
                              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                              title="查看详情"
                          >
                            <Eye size={16} />
                          </button>
                        )}


                        {/* Management Actions: Show Truck for Confirmed, Ordered, or Shipped */}
                        {(po.status === "Confirmed" || (po.status as string) === "Ordered" || po.status === "Shipped") && (
                            <div className="flex items-center gap-1">
                                {(() => {
                                    const tracking = po.trackingData || [];
                                    const hasTracking = tracking.length > 0;
                                    const hasAllWaybills = hasTracking && tracking.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0));
                                    const hasPayment = po.paymentVouchers && po.paymentVouchers.length > 0;
                                    
                                    if (!(hasTracking && hasAllWaybills && hasPayment)) {
                                        let label = "补全资料";
                                        let colorClass = "text-orange-500 bg-orange-500/10";
                                        let Icon = Truck;
                                        let animate = "";
                                        
                                        if (!hasPayment) {
                                            label = "上传凭证";
                                            colorClass = "text-amber-500 bg-amber-500/10";
                                            Icon = FileText;
                                        } else if (!hasTracking) {
                                            label = "录入单号";
                                            colorClass = "text-blue-500 bg-blue-500/10";
                                            Icon = Hash;
                                        } else if (!hasAllWaybills) {
                                            label = "上传面单";
                                            colorClass = "text-orange-500 bg-orange-500/10";
                                            Icon = Camera;
                                            animate = "animate-pulse";
                                        }

                                        return (
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    setTrackingModal({
                                                        isOpen: true,
                                                        purchaseId: po.id,
                                                        initialValue: po.trackingData || [],
                                                        paymentVouchers: po.paymentVouchers || [],
                                                        lockPackages: false,
                                                        mode: (!hasPayment ? "payment" : !hasTracking ? "tracking" : !hasAllWaybills ? "waybill" : "all") as NonNullable<TrackingNumberModalProps['mode']>
                                                    }); 
                                                }}
                                                className={`p-2 rounded-lg ${colorClass} ${animate} flex items-center gap-2 transition-all hover:scale-105`}
                                                title={`点击以${label}`}
                                            >
                                                <Icon size={16} />
                                                <span className="text-[10px] font-bold">{label}</span>
                                            </button>
                                        );
                                    }
                                    return null;
                                })()}
                                
                                {/* Show Confirm button if it's Shipped (or legacy Ordered) AND all waybills are present */}
                                {(po.status === "Shipped" || (po.status as string) === "Ordered") && 
                                    (po.trackingData || []).length > 0 && 
                                    (po.trackingData || []).every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && 
                                    canInbound && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleConfirmReceipt(po.id); }}
                                            className="p-2 rounded-lg text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all flex items-center gap-2 animate-in zoom-in-95 duration-300"
                                            title="确认入库"
                                        >
                                            <CheckCircle2 size={16} />
                                            <span className="text-[10px] font-bold ml-1">确认入库</span>
                                        </button>
                                    )
                                }
                            </div>
                        )}

                        {/* Actions: Allow delete for all if has permission, edit only for Drafts */}
                        <div className="flex gap-1">
                          {po.status === "Draft" && canEdit && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(po); }}
                                className="p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                title="编辑"
                            >
                               <Edit2 size={16} />
                            </button>
                          )}
                          {canEdit && (
                             <button 
                                 onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }}
                                 className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                                 title="删除"
                             >
                               <Trash2 size={16} />
                             </button>
                          )}
                        </div>
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
               <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                 {searchQuery || statusFilter !== 'All' ? '当前筛选条件下没有找到记录，尝试调整筛选或搜索关键词。' : '还没有采购记录，点击右上角“新建采购单”开始。'}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-20">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
             <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-medium">加载中...</p>
             </div>
          ) : filteredPurchases.length > 0 ? (
            filteredPurchases.map((po) => (
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
                          <span className={`px-1.5 py-0 rounded text-[9px] font-bold border ${getTypeColor(po.type)}`}>
                            {getTypeLabel(po.type)}
                          </span>
                       </div>
                   <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                      {getStatusLabel(po.status)}
                   </span>
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
                          <div className="grid grid-cols-1 gap-1.5">
                            {po.trackingData.map((td, idx) => (
                              <div 
                                  key={idx} 
                                  className="flex justify-between items-center bg-orange-500/5 px-3 py-2 rounded-lg border border-orange-500/10 group/mob-item"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(td.number);
                                      showToast("单号已复制", "success");
                                  }}
                              >
                                  <div className="flex items-center gap-2 text-orange-500 font-mono text-[10px] min-w-0 flex-1">
                                      <Truck size={12} className="shrink-0" />
                                      <span className="shrink-0 whitespace-nowrap">{td.courier}:</span>
                                      <span className="truncate font-bold">{td.number}</span>
                                  </div>
                                      <div className="flex items-center gap-2 opacity-40 group-hover/mob-item:opacity-100 transition-opacity">
                                          {(() => {
                                              const url = getTrackingUrl(td.number, td.courier);
                                              if (!url) return null;
                                              return (
                                                  <button
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          window.open(url, '_blank');
                                                      }}
                                                      className="p-1"
                                                  >
                                                      <ExternalLink size={12} className="text-orange-500" />
                                                  </button>
                                              );
                                          })()}
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigator.clipboard.writeText(td.number);
                                                  showToast("单号已复制到剪贴板", "success");
                                              }}
                                              className="p-1"
                                          >
                                              <Copy size={12} className="text-orange-500" />
                                          </button>
                                      </div>
                              </div>
                            ))}
                          </div>
                      </div>
                    )}
                </div>
  
                 {/* Actions - icon only to prevent crowding on mobile */}
                <div className="flex items-center gap-2 justify-end">
                   {po.status !== "Draft" && (
                     <button 
                        onClick={() => handleView(po)}
                        className="flex-none flex items-center justify-center h-9 w-9 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 active:scale-95 transition-all"
                        title="查看详情"
                    >
                        <Eye size={16} />
                    </button>
                   )}


  
                    {/* Management Actions: Show Truck for Confirmed/Shipped/Ordered */}
                    {(po.status === "Confirmed" || po.status === "Shipped" || (po.status as string) === "Ordered") && (
                        <div className="flex gap-2">
                            {(() => {
                                const tracking = po.trackingData || [];
                                const hasTracking = tracking.length > 0;
                                const hasAllWaybills = hasTracking && tracking.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0));
                                const hasPayment = po.paymentVouchers && po.paymentVouchers.length > 0;
                                
                                if (!(hasTracking && hasAllWaybills && hasPayment)) {
                                    let label = "补全资料";
                                    let colorClass = "bg-orange-500";
                                    let Icon = Truck;
                                    let animate = "";
                                    
                                    if (!hasPayment) {
                                        label = "上传凭证";
                                        colorClass = "bg-amber-500";
                                        Icon = FileText;
                                    } else if (!hasTracking) {
                                        label = "录入单号";
                                        colorClass = "bg-blue-500";
                                        Icon = Hash;
                                    } else if (!hasAllWaybills) {
                                        label = "上传面单";
                                        colorClass = "bg-orange-500";
                                        Icon = Camera;
                                        animate = "animate-pulse";
                                    }


                                    const mode = !hasPayment ? "payment" : !hasTracking ? "tracking" : !hasAllWaybills ? "waybill" : "all";
                                    
                                    return (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setTrackingModal({
                                                isOpen: true,
                                                purchaseId: po.id,
                                                initialValue: po.trackingData || [],
                                                paymentVouchers: po.paymentVouchers || [],
                                                lockPackages: false,
                                                mode: mode as NonNullable<TrackingNumberModalProps['mode']>
                                            }); }}
                                            className={`h-9 w-9 flex items-center justify-center rounded-lg ${colorClass} text-white shadow-lg ${colorClass}/20 ${animate} active:scale-95 transition-all`}
                                            title={label}
                                        >
                                            <Icon size={16} />
                                        </button>
                                    );
                                }
                                return null;
                            })()}

                            {(po.status === "Shipped" || (po.status as string) === "Ordered") && 
                             (po.trackingData || []).length > 0 && 
                             (po.trackingData || []).every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && 
                             canInbound && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleConfirmReceipt(po.id); }}
                                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                                    title="确认入库"
                                >
                                    <CheckCircle2 size={16} />
                                </button>
                            )}
                        </div>
                    )}
  
                    
                    {/* Actions: Allow delete for all if has permission, edit only for Drafts */}
                    <div className="flex gap-2">
                       {po.status === "Draft" && (
                         <button 
                          onClick={() => handleEdit(po)}
                          className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 active:scale-95 transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                       )}
                       {canEdit && (
                        <button 
                          onClick={() => handleDelete(po.id)}
                          className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-500/10 text-destructive hover:bg-red-500/20 active:scale-95 transition-all"
                        >
                          <Trash2 size={16} />
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
               <p className="text-muted-foreground text-xs mt-1 max-w-[240px]">
                 {searchQuery || statusFilter !== 'All' ? '未找到匹配结果，尝试更改筛选条件或搜索关键词。' : '您目前还没有任何采购订单，立即创建一个吧。'}
               </p>
              </div>
           )}
        </AnimatePresence>
      </div>



       <PurchaseOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        onExport={handleExport}
        onOverview={setOverviewPurchase}
        initialData={editingPurchase || undefined}
        readOnly={detailReadOnly || (editingPurchase ? editingPurchase.status !== "Draft" : false)}
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

      <TrackingNumberModal 
        isOpen={trackingModal.isOpen}
        onClose={() => setTrackingModal(prev => ({ ...prev, isOpen: false }))}
        initialValue={trackingModal.initialValue}
        paymentVouchers={trackingModal.paymentVouchers}
        paymentVoucher={trackingModal.paymentVoucher}
        readOnly={purchases.find(p => p.id === trackingModal.purchaseId)?.status === "Received"}
        lockPackages={trackingModal.lockPackages}
        mode={trackingModal.mode}
        onConfirm={(trackingData: TrackingInfo[], paymentVouchers?: string[]) => {
            if (trackingModal.purchaseId) {
                handleUpdateTracking(trackingModal.purchaseId, trackingData, paymentVouchers);
            }
        }}
        onViewImages={(images: string[], index?: number) => {
          setGalleryState({ isOpen: true, images, currentIndex: index || 0, scale: 1, direction: 0 });
        }}
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
        isOpen={!!overviewPurchase}
        onClose={() => setOverviewPurchase(null)}
        purchases={overviewPurchase ? [overviewPurchase] : []}
      />

    </div>

  );
}

export default function PurchasesPage() {
  return (
    <Suspense fallback={
        <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
            正在加载采购数据...
        </div>
    }>
      <PurchasesContent />
    </Suspense>
  );
}
