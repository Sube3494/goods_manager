"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { Plus, Upload, AlertCircle, ArrowLeft, RefreshCcw, Trash2, Search, Package, Check, Filter, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import NextImage from "next/image";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { Product } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ItemModal } from "./ItemModal";
import type { Row, Cell } from "exceljs";

interface StoreOpeningItem {
  id: string;
  productCode: string | null;
  productName: string | null;
  productId: string | null;
  product?: (Product & { supplier?: { name: string } | null }) | null;
  quantity: number;
  unitPrice: number;
  shippingFee: number;
  totalAmount: number;
  remark: string | null;
  checked: boolean;
}

function SetupPurchaseDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { showToast, updateToast, removeToast } = useToast();
  const { user } = useUser();
  const canManage = hasPermission(user as SessionUser | null, "setup_purchase:manage");
  
  const [items, setItems] = useState<StoreOpeningItem[]>([]);
  const [batchName, setBatchName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isProductSelectOpen, setIsProductSelectOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<StoreOpeningItem>>({});
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: string, field: "quantity" | "unitPrice" | "shippingFee" | "totalAmount" } | null>(null);

  const [supplierFilter, setSupplierFilter] = useState("All");
  const [checkStatusFilter, setCheckStatusFilter] = useState("All");
  const [query, setQuery] = useState("");
  
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/setup-purchases/${id}`);
      if (res.ok) {
        const data = await res.json();
        setBatchName(data.name);
        
        // Natural sort by productCode (e.g., B26, B27 before B302)
        const sortedItems = data.items.sort((a: StoreOpeningItem, b: StoreOpeningItem) => {
          const codeA = a.productCode || "";
          const codeB = b.productCode || "";
          return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        });
        
        setItems(sortedItems);
      } else {
        showToast("无法加载明细", "error");
        router.push("/setup-purchases");
      }
    } catch {
      showToast("网络错误", "error");
    } finally {
      setIsLoading(false);
    }
  }, [id, router, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch(`/api/setup-purchases/${id}/import`, {
        method: "POST",
        body: formData
      });
      
      const data = await res.json();
      if (res.ok) {
        showToast(`成功导入 ${data.count} 条记录`, "success");
        fetchData();
      } else {
        showToast(data.error || "导入失败", "error");
      }
    } catch {
        showToast("网络错误，文件上传失败", "error");
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/setup-purchases/${id}/items/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("记录已移除", "success");
        fetchData();
      } else {
        showToast("移除失败", "error");
      }
    } catch {
        showToast("网络错误", "error");
    }
  };

  const handleBatchProductSelect = async (selectedProducts: Product[]) => {
      // Filter out products that are already in the items list to prevent duplicates
      const existingProductIds = new Set(items.map(it => it.productId).filter(Boolean));
      const newProducts = selectedProducts.filter(p => !existingProductIds.has(p.id));

      if (newProducts.length === 0) {
          setIsProductSelectOpen(false);
          if (selectedProducts.length > 0) {
              showToast("所选商品已在列表中", "info");
          }
          return;
      }
      
      setIsUploading(true);
      try {
          const itemsData = newProducts.map(p => ({
              productId: p.id,
              productCode: p.sku || "",
              productName: p.name,
              unitPrice: p.costPrice || 0,
              quantity: 1,
              remark: "批量添加"
          }));

          const res = await fetch(`/api/setup-purchases/${id}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(itemsData)
          });

          if (res.ok) {
              showToast(`成功添加 ${newProducts.length} 件商品`, "success");
              fetchData();
          } else {
              showToast("批量添加失败", "error");
          }
      } catch {
          showToast("网络错误", "error");
      } finally {
          setIsUploading(false);
          setIsProductSelectOpen(false);
      }
  };

  const handleManualSaveItem = async () => {
    try {
      if (!editingItem.productName) return showToast("请输入商品名称", "error");

      const isEdit = !!editingItem.id;
      const url = isEdit ? `/api/setup-purchases/${id}/items/${editingItem.id}` : `/api/setup-purchases/${id}/items`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ...editingItem,
            totalAmount: editingItem.totalAmount !== undefined ? editingItem.totalAmount : ((editingItem.quantity || 1) * (editingItem.unitPrice || 0))
        })
      });
      
      if (res.ok) {
        showToast(isEdit ? "更新成功" : "录单成功", "success");
        setIsItemModalOpen(false);
        fetchData();
      } else {
        const errorData = await res.json();
        showToast(errorData.details || "操作失败", "error");
      }
    } catch {
       showToast("网络错误", "error");
    }
  };

  const handleInlineUpdate = async (itemId: string, field: "quantity" | "unitPrice" | "shippingFee" | "totalAmount", value: number) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    if (isNaN(value)) value = 0;

    const newQty = field === "quantity" ? value : item.quantity;
    const newPrice = field === "unitPrice" ? value : item.unitPrice;
    const newFee = field === "shippingFee" ? value : (item.shippingFee || 0);
    const newTotal = field === "totalAmount" ? value : (newQty * newPrice + newFee);

    const updatedData = {
      ...item,
      [field]: value,
      totalAmount: newTotal
    };

    // Optimistically update UI
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...updatedData } : it));
    setEditingCell(null);

    try {
      const res = await fetch(`/api/setup-purchases/${id}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedData)
      });
      if (!res.ok) {
        const errorData = await res.json();
        showToast(errorData.details || "更新失败", "error");
        fetchData(); // Rollback on error
      }
    } catch {
      showToast("网络错误", "error");
      fetchData();
    }
  };

  const handleToggleCheck = async (itemId: string, currentChecked: boolean) => {
      try {
          const res = await fetch(`/api/setup-purchases/${id}/items/${itemId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ checked: !currentChecked })
          });
          if (res.ok) {
              setItems(prev => prev.map(item => item.id === itemId ? { ...item, checked: !currentChecked } : item));
          } else {
              const errorData = await res.json();
              showToast(errorData.details || "更新状态失败", "error");
          }
      } catch {
          showToast("网络错误", "error");
      }
  };

  const suppliers = useMemo(() => {
    const list = Array.from(new Set(items.map(it => it.product?.supplier?.name).filter(Boolean))) as string[];
    return list.sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSupplier = supplierFilter === "All" || item.product?.supplier?.name === supplierFilter;
      const matchesCheck = checkStatusFilter === "All" || (checkStatusFilter === "Checked" ? item.checked : !item.checked);
      const matchesQuery = !query || 
                           item.productName?.toLowerCase().includes(query.toLowerCase()) || 
                           item.productCode?.toLowerCase().includes(query.toLowerCase()) ||
                           item.product?.name.toLowerCase().includes(query.toLowerCase());
      
      return matchesSupplier && matchesCheck && matchesQuery;
    });
  }, [items, supplierFilter, checkStatusFilter, query]);

  const selectedProductIds = useMemo(() => {
    return items.map(item => item.productId).filter((id): id is string => id !== null);
  }, [items]);

  const handleExport = useCallback(async () => {
    if (filteredItems.length === 0) {
      showToast("没有可导出的记录", "error");
      return;
    }

    console.log("Starting export for", batchName, "items count:", filteredItems.length);
    const toastId = showToast(`正在准备表格 (0 / ${filteredItems.length})...`, "info", 0); // 0 表示不自动关闭

    try {
      // 简化导入，参考 purchases 页面
      const ExcelJS = (await import("exceljs")).default;
      const fileSaver = await import("file-saver") as unknown as { saveAs?: (data: Blob | string, filename?: string) => void, default?: { saveAs?: (data: Blob | string, filename?: string) => void } };
      const saveAs = fileSaver.saveAs || fileSaver.default?.saveAs;
      
      if (!saveAs) {
        throw new Error("保存函数(saveAs)加载失败");
      }

      console.log("Libraries loaded, creating workbook...");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Goods Manager";
      workbook.lastModifiedBy = "Goods Manager";
      workbook.created = new Date();
      workbook.modified = new Date();
      
      const worksheet = workbook.addWorksheet("明细");
      
      const now = new Date();
      const dateStr = `${now.toLocaleDateString("zh-CN")} ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
      
      // 添加标题行
      worksheet.addRow([`${batchName || "账单明细"} — ${dateStr}`]);
      worksheet.mergeCells('A1:H1'); 
      worksheet.getCell('A1').font = { size: 14, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      
      worksheet.addRow([]); // 空行
      
      // 增加运费列，总计放在最后
      const headerRow = worksheet.addRow(["序号", "商品图片", "识别编号/名称", "商品全称", "供应商", "单价", "数量", "运费", "小计"]);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // 设置列宽
      worksheet.getColumn(1).width = 8;   // 序号
      worksheet.getColumn(2).width = 18;  // 图片
      worksheet.getColumn(3).width = 20;  // 识别编号/名称
      worksheet.getColumn(4).width = 35;  // 商品全称
      worksheet.getColumn(5).width = 20;  // 供应商
      worksheet.getColumn(6).width = 12;  // 单价
      worksheet.getColumn(7).width = 12;  // 数量
      worksheet.getColumn(8).width = 12;  // 运费
      worksheet.getColumn(9).width = 15;  // 小计
      
      let globalIndex = 1;
      let currentRowIndex = worksheet.rowCount + 1; // 动态索引
      let totalQty = 0;
      let totalAmount = 0;
      
      for (const item of filteredItems) {
        const qty = item.quantity || 0;
        const price = item.unitPrice || 0;
        const subtotal = item.totalAmount || (qty * price);
        
        totalQty += qty;
        totalAmount += subtotal;
        
        const row = worksheet.addRow([
          globalIndex++,
          "", // 图片占位
          item.productCode || item.productName || "",
          item.product?.name || item.productName || "",
          item.product?.supplier?.name || "未知",
          price,
          qty,
          item.shippingFee || 0,
          subtotal,
        ]);
        
        row.height = 80;
        row.alignment = { vertical: 'middle', wrapText: true };
        
        // 居中设置 (A:序号, B:图片, C:识别编号, D:商品名称, E:供应商, F:单价, G:数量, H:运费, I:小计)
        ['A', 'B', 'C', 'E', 'F', 'G', 'H', 'I'].forEach(col => {
            worksheet.getCell(`${col}${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
        });
        worksheet.getCell(`D${currentRowIndex}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        
        // 格式化金额
        worksheet.getCell(`F${currentRowIndex}`).numFmt = '¥#,##0.00';
        worksheet.getCell(`H${currentRowIndex}`).numFmt = '¥#,##0.00';
        worksheet.getCell(`I${currentRowIndex}`).numFmt = '¥#,##0.00';
        
        // 图片处理
        const imageUrl = item.product?.image;
        if (imageUrl) {
          try {
            console.log(`Fetching image ${globalIndex-1}/${filteredItems.length}: ${imageUrl}`);
            
            // 添加超时处理
            const fetchPromise = fetch(imageUrl);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));
            
            const response = (await Promise.race([fetchPromise, timeoutPromise])) as Response;
            
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              const ext = imageUrl.split('.').pop()?.split('?')[0].toLowerCase();
              const extType = (ext === 'png' || ext === 'gif') ? ext : 'jpeg';
              
              const imageId = workbook.addImage({
                buffer: buffer,
                extension: extType as 'png' | 'jpeg' | 'gif',
              });
              
              // 获取尺寸以居中
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
              
              // 兜底尺寸，防止加载异常导致 Infinity/NaN
              const imgW = dims.width || 100;
              const imgH = dims.height || 100;

              // Excel width 18 (getColumn.width) is approx 135px in many viewers
              // Row height 80 (row.height) is approx 106px (80 * 1.33)
              const cellWidthPx = 135;
              const cellHeightPx = 106;
              const maxW = 120; // 稍微收紧宽度
              const maxH = 90;  // 稍微收紧高度防止溢出
              const scale = Math.min(maxW / imgW, maxH / imgH);
              
              const finalW = imgW * scale;
              const finalH = imgH * scale;

              // 计算中心偏移量（相对单元格比例）
              const colOffset = ((cellWidthPx - finalW) / 2) / cellWidthPx;
              const rowOffset = ((cellHeightPx - finalH) / 2) / cellHeightPx;

              // 使用 tl + ext 来保持图片的原始宽高比例，br 会导致单元格被拉伸变形
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
        updateToast(toastId, `正在下载商品图片 (${globalIndex - 1} / ${filteredItems.length})...`);
      }
      
      // 总计行 - 改为静态数值
      const totalRow = worksheet.addRow(["", "", "总计", "", "", "", totalQty, filteredItems.reduce((acc, cur) => acc + (cur.shippingFee || 0), 0), totalAmount]);
      totalRow.font = { bold: true };
      totalRow.height = 35;
      worksheet.getCell(`C${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell(`G${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell(`H${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell(`I${currentRowIndex}`).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getCell(`H${currentRowIndex}`).numFmt = '¥#,##0.00';
      worksheet.getCell(`I${currentRowIndex}`).numFmt = '¥#,##0.00';
      
      // 样式
      worksheet.eachRow((row: Row, rowNumber: number) => {
        row.eachCell((cell: Cell) => {
          cell.font = { ...cell.font, name: '微软雅黑' };
          if (rowNumber >= 3) {
            cell.border = {
              top: {style:'thin'},
              left: {style:'thin'},
              bottom: {style:'thin'},
              right: {style:'thin'}
            };
          }
        });
      });
      
      console.log("Workbook built, generating buffer...");
      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = Date.now();
      const rawFilename = `${batchName || "账单明细"}_${timestamp}.xlsx`;
      const filename = rawFilename.replace(/[\\/:\*\?"<>\|]/g, '_');
      
      console.log("Buffer generated, triggering download:", filename);
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
      
      removeToast(toastId);
      showToast("导出成功", "success");
      console.log("Export completed successfully");
    } catch (error) {
      console.error("Export failed:", error);
      removeToast(toastId);
      showToast("导出失败", "error");
    }
  }, [filteredItems, batchName, showToast, updateToast, removeToast]);

  if (isLoading && items.length === 0) {
      return (
         <div className="py-20 flex flex-col items-center justify-center text-center">
             <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
             <p className="text-muted-foreground text-sm font-medium">数据读取中...</p>
         </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-4 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3 shrink-0">
           <Link href="/setup-purchases" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ArrowLeft size={18} className="text-muted-foreground" />
           </Link>
           <div>
             <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2 line-clamp-1">
                 {batchName || "账单明细"}
             </h1>
           </div>
        </div>

        {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={handleExport}
                className="h-9 w-9 sm:w-auto md:h-10 flex items-center justify-center sm:gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 p-0 sm:px-3 md:px-4 text-xs md:text-sm font-bold text-emerald-600 hover:bg-emerald-500/20 transition-all active:scale-95"
                title="导出Excel"
              >
                <Download size={14} className="shrink-0" />
                <span className="hidden sm:inline">导出Excel</span>
              </button>
              <button 
                onClick={() => setIsProductSelectOpen(true)}
                disabled={isUploading}
                className="h-9 w-9 sm:w-auto md:h-10 flex items-center justify-center sm:gap-2 rounded-full bg-primary p-0 sm:px-4 md:px-6 text-xs md:text-sm font-black text-primary-foreground shadow-md shadow-black/10 dark:shadow-none hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50"
                title="添加库商品"
              >
                <Plus size={16} strokeWidth={3} className="shrink-0" />
                <span className="hidden sm:inline">添加库商品</span>
              </button>
              <button 
                onClick={() => {
                   const input = document.createElement('input');
                   input.type = 'file';
                   input.accept = '.xlsx,.xls';
                   input.onchange = (e) => handleFileUpload(e as unknown as React.ChangeEvent<HTMLInputElement>);
                   input.click();
                }}
                disabled={isUploading}
                className="h-9 w-9 sm:w-auto md:h-10 flex items-center justify-center sm:gap-2 rounded-full bg-muted/60 border border-border p-0 sm:px-3 md:px-4 text-xs md:text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95 disabled:opacity-50"
                title={isUploading ? "解析中..." : "导入Excel"}
              >
                {isUploading ? <RefreshCcw size={14} className="animate-spin shrink-0" /> : <Upload size={14} className="shrink-0" />}
                <span className="hidden sm:inline">{isUploading ? "解析中..." : "导入Excel"}</span>
              </button>
            </div>
        )}
      </div>

      <div className="flex flex-col gap-4 mb-6 bg-white/40 dark:bg-white/5 p-4 rounded-2xl border border-border/50 shadow-sm backdrop-blur-sm">
          {suppliers.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  <div className="flex items-center gap-1.5 mr-2 shrink-0">
                      <Filter size={10} className="text-muted-foreground opacity-50" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">供应商</span>
                  </div>
                  <button
                    onClick={() => setSupplierFilter("All")}
                    className={cn("px-3 h-7 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border", supplierFilter === "All" ? "bg-secondary text-secondary-foreground border-secondary shadow-sm" : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80")}
                  >
                    全部
                  </button>
                  {suppliers.map(s => (
                      <button
                        key={s}
                        onClick={() => setSupplierFilter(s)}
                        className={cn("px-3 h-7 rounded-full text-[11px] font-bold transition-all whitespace-nowrap border", supplierFilter === s ? "bg-secondary text-secondary-foreground border-secondary shadow-sm" : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80")}
                      >
                        {s}
                      </button>
                  ))}
              </div>
          )}

          <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 pb-1", suppliers.length > 0 && "border-t border-border/30")}>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0 pr-2">
                  <div className="flex items-center gap-1.5 mr-2 shrink-0">
                      <Check size={11} className="text-muted-foreground opacity-50" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-50">核对状态</span>
                  </div>
                  {[
                    { label: "全部", val: "All" },
                    { label: "已核对", val: "Checked" },
                    { label: "未核对", val: "Unchecked" }
                  ].map(opt => (
                      <button
                        key={opt.val}
                        onClick={() => setCheckStatusFilter(opt.val)}
                        className={cn("px-3.5 h-8 rounded-full text-xs font-bold transition-all whitespace-nowrap border shrink-0", checkStatusFilter === opt.val ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-white dark:bg-white/10 border-border dark:border-white/10 text-muted-foreground hover:bg-muted/80")}
                      >
                        {opt.label}
                      </button>
                  ))}
              </div>

              <div className="flex items-center w-full sm:w-auto shrink-0">
                   <div className="h-8 w-full sm:w-48 px-3 rounded-full bg-white dark:bg-white/5 border border-border/50 flex items-center gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                        <Search size={12} className="text-muted-foreground shrink-0" />
                        <input type="text" placeholder="搜索条目..." value={query} onChange={e => setQuery(e.target.value)} className="bg-transparent border-none outline-none w-full text-[11px] text-foreground placeholder:text-muted-foreground h-full" />
                   </div>
              </div>
          </div>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-250px)]">
          {filteredItems.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                 <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                 没有找到匹配的记录
              </div>
          ) : (
             <table className="w-full text-left border-collapse min-w-[600px] table-auto">
                 <thead>
                 <tr className="border-b border-border bg-muted/30">
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap w-12 text-center">核对</th>
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap">识别编号/名称</th>
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">供应商</th>
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">数量</th>
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">单价</th>
                     <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">运费</th>
                     <th className="px-3 py-4 text-xs font-bold text-foreground whitespace-nowrap text-right bg-primary/5">小计金额</th>
                     {canManage && <th className="px-3 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center w-20">操作</th>}
                 </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                     <AnimatePresence>
                        {filteredItems.map(item => (
                            <motion.tr key={item.id} className={cn("hover:bg-muted/30 group transition-all", item.checked && "opacity-60 bg-emerald-500/5")}>
                                 <td className="px-3 py-3 whitespace-nowrap text-center">
                                      <button onClick={() => handleToggleCheck(item.id, item.checked)} className={cn("relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center m-auto", item.checked ? "bg-foreground border-foreground text-background scale-110 shadow-lg shadow-black/10" : "bg-white dark:bg-white/5 border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-foreground/50 shadow-sm")}>
                                         {item.checked && <Check size={14} strokeWidth={4} />}
                                      </button>
                                 </td>
                                 <td className="px-3 py-3 whitespace-nowrap">
                                     <div className="flex items-center gap-3">
                                         <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border/50 flex items-center justify-center shrink-0">
                                             {item.product?.image ? (
                                                 <NextImage src={item.product.image} alt={item.productName || ""} width={40} height={40} className="w-full h-full object-cover" unoptimized />
                                             ) : (
                                                 <Package size={18} className="text-muted-foreground/40" />
                                             )}
                                         </div>
                                         <div className="min-w-0">
                                             {item.productCode ? (
                                                 <span className="font-mono font-bold text-xs bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">{item.productCode}</span>
                                             ) : (
                                                 <span className="text-sm text-muted-foreground">{item.productName || "未知"}</span>
                                             )}
                                             <div className="text-[11px] font-medium text-foreground truncate max-w-[200px] mt-0.5">{item.product?.name || item.productName}</div>
                                         </div>
                                     </div>
                                 </td>
                                 <td className="px-3 py-3 whitespace-nowrap text-center">
                                     <div className="flex items-center justify-center gap-1.5">
                                         {item.product?.supplier ? (
                                             <span className="text-[10px] font-bold bg-zinc-500/5 border border-zinc-500/10 px-2 py-0.5 rounded-full text-muted-foreground/80">{item.product.supplier.name}</span>
                                         ) : (
                                             <span className="text-[10px] text-muted-foreground/30 italic">未知</span>
                                         )}
                                     </div>
                                 </td>
                                 
                                 <td className="px-3 py-3 whitespace-nowrap text-center" onClick={() => canManage && setEditingCell({ id: item.id, field: "quantity" })}>
                                     {editingCell?.id === item.id && editingCell.field === "quantity" ? (
                                         <input 
                                           autoFocus
                                           type="number"
                                           className="w-16 h-8 text-center px-2 rounded-md border-2 border-primary/30 dark:border-primary/50 ring-2 ring-primary/10 focus:ring-primary/30 outline-none text-sm font-bold bg-white dark:bg-background shadow-[0_0_0_1px_rgba(var(--primary),0.2)] dark:shadow-none transition-all"
                                           defaultValue={item.quantity}
                                           onBlur={(e) => handleInlineUpdate(item.id, "quantity", parseInt(e.target.value) || 0)}
                                           onKeyDown={(e) => e.key === 'Enter' && handleInlineUpdate(item.id, "quantity", parseInt(e.currentTarget.value) || 0)}
                                           onClick={(e) => e.stopPropagation()}
                                         />
                                     ) : (
                                         <span className="text-sm font-bold cursor-text inline-block min-w-[30px] px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-all border border-transparent border-dashed hover:border-primary/30">x{item.quantity}</span>
                                     )}
                                 </td>

                                 <td className="px-3 py-3 whitespace-nowrap text-center" onClick={() => canManage && setEditingCell({ id: item.id, field: "unitPrice" })}>
                                     {editingCell?.id === item.id && editingCell.field === "unitPrice" ? (
                                         <input 
                                           autoFocus
                                           type="number"
                                           step="0.01"
                                           className="w-24 h-8 text-center px-2 rounded-md border-2 border-primary/30 dark:border-primary/50 ring-2 ring-primary/10 focus:ring-primary/30 outline-none text-sm font-bold bg-white dark:bg-background shadow-[0_0_0_1px_rgba(var(--primary),0.2)] dark:shadow-none transition-all"
                                           defaultValue={item.unitPrice}
                                           onBlur={(e) => handleInlineUpdate(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                           onKeyDown={(e) => e.key === 'Enter' && handleInlineUpdate(item.id, "unitPrice", parseFloat(e.currentTarget.value) || 0)}
                                           onClick={(e) => e.stopPropagation()}
                                         />
                                     ) : (
                                         <span className="text-sm text-muted-foreground cursor-text inline-block min-w-[60px] px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-all border border-transparent border-dashed hover:border-primary/30">￥{item.unitPrice}</span>
                                     )}
                                 </td>

                                 <td className="px-3 py-3 whitespace-nowrap text-center" onClick={() => canManage && setEditingCell({ id: item.id, field: "shippingFee" })}>
                                     {editingCell?.id === item.id && editingCell.field === "shippingFee" ? (
                                         <input
                                           autoFocus
                                           type="number"
                                           step="0.01"
                                           className="w-24 h-8 text-center px-2 rounded-md border-2 border-primary/30 dark:border-primary/50 ring-2 ring-primary/10 focus:ring-primary/30 outline-none text-sm font-bold bg-white dark:bg-background shadow-[0_0_0_1px_rgba(var(--primary),0.2)] dark:shadow-none transition-all"
                                           defaultValue={item.shippingFee || 0}
                                           onBlur={(e) => handleInlineUpdate(item.id, "shippingFee", parseFloat(e.target.value) || 0)}
                                           onKeyDown={(e) => e.key === 'Enter' && handleInlineUpdate(item.id, "shippingFee", parseFloat(e.currentTarget.value) || 0)}
                                           onClick={(e) => e.stopPropagation()}
                                         />
                                     ) : (
                                         <span className={cn("text-sm cursor-text inline-block min-w-[50px] px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-all border border-transparent border-dashed hover:border-primary/30", (item.shippingFee || 0) > 0 ? "font-bold text-orange-500 dark:text-orange-400" : "text-muted-foreground/40")}>
                                             {(item.shippingFee || 0) > 0 ? `￥${item.shippingFee}` : "—"}
                                         </span>
                                     )}
                                 </td>

                                 <td className="px-3 py-3 whitespace-nowrap text-right font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5" onClick={() => canManage && setEditingCell({ id: item.id, field: "totalAmount" })}>
                                     {editingCell?.id === item.id && editingCell.field === "totalAmount" ? (
                                         <input 
                                           autoFocus
                                           type="number"
                                           step="0.01"
                                           className="w-24 h-8 text-right px-2 rounded-md border-2 border-emerald-500/30 dark:border-emerald-500/50 ring-2 ring-emerald-500/10 focus:ring-emerald-500/30 outline-none text-sm font-bold bg-white dark:bg-background shadow-[0_0_0_1px_rgba(var(--primary),0.2)] dark:shadow-none transition-all ml-auto"
                                           defaultValue={item.totalAmount}
                                           onBlur={(e) => handleInlineUpdate(item.id, "totalAmount", parseFloat(e.target.value) || 0)}
                                           onKeyDown={(e) => e.key === 'Enter' && handleInlineUpdate(item.id, "totalAmount", parseFloat(e.currentTarget.value) || 0)}
                                           onClick={(e) => e.stopPropagation()}
                                         />
                                     ) : (
                                         <span className="cursor-text inline-block min-w-[60px] px-2 py-1 rounded hover:bg-emerald-500/10 transition-all border border-transparent border-dashed hover:border-emerald-500/30">
                                             ￥{(item.totalAmount || 0).toLocaleString()}
                                         </span>
                                     )}
                                 </td>
                                 
                                 {canManage && (
                                     <td className="px-3 py-3 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                             <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }} className="p-1.5 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                          </div>
                                     </td>
                                 )}
                            </motion.tr>
                        ))}
                     </AnimatePresence>
                 </tbody>
             </table>
          )}
      </div>

      {filteredItems.length > 0 && (
         <div className="bg-muted/30 p-4 border-t border-border flex items-center justify-between">
             <div className="text-xs text-muted-foreground">列出 <span className="font-bold text-foreground">{filteredItems.length}</span> 项</div>
             <div className="flex items-center gap-4 flex-wrap justify-end">
                 {filteredItems.some(i => (i.shippingFee || 0) > 0) && (
                   <span className="text-xs text-muted-foreground">
                     含运费 <span className="font-bold text-orange-500">￥{filteredItems.reduce((acc, cur) => acc + (cur.shippingFee || 0), 0).toLocaleString()}</span>
                   </span>
                 )}
                 <span className="text-sm font-bold">当前列表总计核对:</span>
                 <span className="text-2xl font-black text-primary tracking-tight">￥{filteredItems.reduce((acc, cur) => acc + (cur.totalAmount || 0), 0).toLocaleString()}</span>
             </div>
         </div>
       )}

      <ItemModal 
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleManualSaveItem}
        editingItem={editingItem}
        setEditingItem={setEditingItem}
      />
      <ProductSelectionModal 
        isOpen={isProductSelectOpen}
        onClose={() => setIsProductSelectOpen(false)}
        onSelect={handleBatchProductSelect}
        selectedIds={selectedProductIds}
      />
    </div>
  );
}

export default function SetupPurchaseDetailPage() {
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">加载中...</div>}>
         <SetupPurchaseDetailContent />
      </Suspense>
    );
}
