"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { Plus, Upload, AlertCircle, ArrowLeft, RefreshCcw, Trash2, Search, Package, Check, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { Product } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ItemModal } from "./ItemModal";

interface StoreOpeningItem {
  id: string;
  productCode: string | null;
  productName: string | null;
  productId: string | null;
  product?: (Product & { supplier?: { name: string } | null }) | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  remark: string | null;
  checked: boolean;
}

function SetupPurchaseDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { showToast } = useToast();
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
  const [editingCell, setEditingCell] = useState<{ id: string, field: "quantity" | "unitPrice" } | null>(null);

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
      if (selectedProducts.length === 0) return;
      
      setIsUploading(true);
      try {
          const itemsData = selectedProducts.map(p => ({
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
              showToast(`成功添加 ${selectedProducts.length} 件商品`, "success");
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

  const handleInlineUpdate = async (itemId: string, field: "quantity" | "unitPrice", value: number) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    if (field === "quantity" && isNaN(value)) value = 0;
    if (field === "unitPrice" && isNaN(value)) value = 0;

    const updatedData = {
      ...item,
      [field]: value,
      totalAmount: field === "quantity" ? value * item.unitPrice : item.quantity * value
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
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between mb-4 border-b border-border/50 pb-4">
        <div className="flex items-center gap-3">
           <Link href="/setup-purchases" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
              <ArrowLeft size={18} className="text-muted-foreground" />
           </Link>
           <div>
             <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                 {batchName || "账单明细"}
             </h1>
           </div>
        </div>

        {canManage && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsProductSelectOpen(true)}
                disabled={isUploading}
                className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-black text-primary-foreground shadow-md shadow-black/10 dark:shadow-none hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50"
              >
                <Plus size={16} strokeWidth={3} />
                添加库商品
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
                className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-muted/60 border border-border px-3 md:px-4 text-xs md:text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95 disabled:opacity-50"
              >
                {isUploading ? <RefreshCcw size={14} className="animate-spin" /> : <Upload size={14} />}
                {isUploading ? "解析中..." : "导入Excel"}
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

          <div className={cn("flex items-center gap-2 overflow-x-auto no-scrollbar pt-3 pb-1", suppliers.length > 0 && "border-t border-border/30")}>
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

              <div className="ml-auto flex items-center gap-2 mt-2 sm:mt-0 pr-1 shrink-0">
                   <div className="h-8 w-48 px-3 rounded-full bg-white dark:bg-white/5 border border-border/50 flex items-center gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
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
                     <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap w-12 text-center">核对</th>
                     <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap">识别编号/名称</th>
                     <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">供应商</th>
                     <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">数量</th>
                     <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center">单价</th>
                     <th className="px-6 py-4 text-xs font-bold text-foreground whitespace-nowrap text-right bg-primary/5">小计金额</th>
                     {canManage && <th className="px-6 py-4 text-xs font-semibold text-muted-foreground whitespace-nowrap text-center w-24">操作</th>}
                 </tr>
                 </thead>
                 <tbody className="divide-y divide-border">
                     <AnimatePresence>
                        {filteredItems.map(item => (
                            <motion.tr key={item.id} className={cn("hover:bg-muted/30 group transition-all", item.checked && "opacity-60 bg-emerald-500/5")}>
                                 <td className="px-6 py-3 whitespace-nowrap text-center">
                                      <button onClick={() => handleToggleCheck(item.id, item.checked)} className={cn("relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center m-auto", item.checked ? "bg-foreground border-foreground text-background scale-110 shadow-lg shadow-black/10" : "bg-white dark:bg-white/5 border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-foreground/50 shadow-sm")}>
                                         {item.checked && <Check size={14} strokeWidth={4} />}
                                      </button>
                                 </td>
                                 <td className="px-6 py-3 whitespace-nowrap">
                                     <div className="flex items-center gap-3">
                                         <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted border border-border/50 flex items-center justify-center shrink-0">
                                             {item.product?.image ? (
                                                 <Image src={item.product.image} alt={item.productName || ""} width={40} height={40} className="w-full h-full object-cover" unoptimized />
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
                                 <td className="px-6 py-3 whitespace-nowrap text-center">
                                     <div className="flex items-center justify-center gap-1.5">
                                         {item.product?.supplier ? (
                                             <span className="text-[10px] font-bold bg-zinc-500/5 border border-zinc-500/10 px-2 py-0.5 rounded-full text-muted-foreground/80">{item.product.supplier.name}</span>
                                         ) : (
                                             <span className="text-[10px] text-muted-foreground/30 italic">未知</span>
                                         )}
                                     </div>
                                 </td>
                                 
                                 <td className="px-6 py-3 whitespace-nowrap text-center" onClick={() => canManage && setEditingCell({ id: item.id, field: "quantity" })}>
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

                                 <td className="px-6 py-3 whitespace-nowrap text-center" onClick={() => canManage && setEditingCell({ id: item.id, field: "unitPrice" })}>
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

                                 <td className="px-6 py-3 whitespace-nowrap text-right font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">￥{(item.totalAmount || 0).toLocaleString()}</td>
                                 
                                 {canManage && (
                                     <td className="px-6 py-3 text-center opacity-0 group-hover:opacity-100 transition-opacity">
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
             <div className="flex items-center gap-4">
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
        selectedIds={[]}
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
