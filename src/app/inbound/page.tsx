"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, Package, Calendar, Eye, FileSpreadsheet, AlertCircle, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { PurchaseOrder, Product } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { formatLocalDateTime } from "@/lib/dateUtils";

export default function InboundPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Data States
  const [inbounds, setInbounds] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Registration States
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [importErrors, setImportErrors] = useState<{ sku: string; reason: string }[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/purchases?type=Inbound");
      if (res.ok) {
        setInbounds(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch inbound records:", error);
      showToast("加载数据失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
    // Auto-open import if action is set in URL
    if (searchParams.get("action") === "import") {
      setShowImportModal(true);
      // Clear the param after opening
      const params = new URLSearchParams(searchParams);
      params.delete("action");
      router.replace(`/inbound?${params.toString()}`);
    }
  }, [fetchData, searchParams, router]);

  const handleManualAdd = async (data: Omit<Product, "id">) => {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        showToast(`"${data.name}" 已创建并自动入库记录`, "success");
        fetchData();
        setShowManualModal(false);
      } else {
        const err = await res.json();
        showToast(err.error || "创建失败", "error");
      }
    } catch (error) {
      console.error("Manual add failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleImport = async (data: Record<string, unknown>[]) => {
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: data }),
      });

      if (res.ok) {
        const result = await res.json();
        setImportErrors(result.errors || []);
        
        if (result.failCount > 0) {
          showToast(`导入完成：成功 ${result.successCount} 件，失败 ${result.failCount} 件。请查看详情。`, "warning");
        } else {
          showToast(`成功导入 ${result.successCount} 件商品`, "success");
          setShowImportModal(false);
        }
        
        fetchData();
      } else {
        showToast("导入失败", "error");
      }
    } catch (error) {
      console.error("Import failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleView = (po: PurchaseOrder) => {
    setSelectedOrder(po);
    setIsModalOpen(true);
  };

  const filteredInbounds = inbounds.filter(p => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return p.id.toLowerCase().includes(query) || 
           p.items.some(item => item.product?.name?.toLowerCase().includes(query));
  });

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">入库管理</h1>
          <p className="text-muted-foreground mt-2">查看入库历史、凭证明细，并进行批量或手动入库登记。</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
            <button 
                onClick={() => setShowImportModal(true)}
                className="h-10 flex items-center gap-2 rounded-full bg-emerald-500/10 px-6 text-sm font-bold text-emerald-600 hover:bg-emerald-500/20 transition-all border border-emerald-500/10 shadow-lg shadow-emerald-500/5 hover:-translate-y-0.5"
            >
                <FileSpreadsheet size={18} />
                Excel 批量导入
            </button>
            <button 
                onClick={() => setShowManualModal(true)}
                className="h-10 flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
            >
                <Plus size={18} />
                手动录入
            </button>
        </div>
      </div>

      {/* Import Error Report */}
      {importErrors.length > 0 && (
        <div className="animate-in slide-in-from-top-4 duration-500 overflow-hidden rounded-3xl border border-destructive/20 bg-destructive/5 glass-panel">
          <div className="flex items-center justify-between border-b border-destructive/10 p-4 px-6 bg-destructive/5">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={18} />
              <h3 className="font-bold">导入异常报告 ({importErrors.length})</h3>
            </div>
            <button 
              onClick={() => setImportErrors([])}
              className="p-1 hover:bg-destructive/10 rounded-full text-destructive/60 hover:text-destructive transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {importErrors.map((err, idx) => (
                <div key={idx} className="flex flex-col gap-1 p-3 rounded-xl bg-white/50 dark:bg-gray-900/50 border border-destructive/10 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">SKU</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">失败</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-foreground truncate">{err.sku}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <div className="size-1 rounded-full bg-destructive/40" />
                    {err.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search Box */}
      <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索入库单号或商品名称..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-gray-900/70 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">加载中...</p>
            </div>
          ) : filteredInbounds.length > 0 ? (
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库单编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">金额总计</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">入库时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredInbounds.map((po) => (
                   <motion.tr 
                    key={po.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-foreground font-mono text-xs">{po.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        已入库
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
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                        <button 
                            onClick={() => handleView(po)}
                            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                            title="查看详情"
                        >
                            <Eye size={16} />
                        </button>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
                 <Package size={40} strokeWidth={1.5} />
               </div>
               <h3 className="text-xl font-bold text-foreground">暂无入库记录</h3>
               <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                 {searchQuery ? '没有找到匹配的记录。' : '还没有入库记录，点击上方按钮开始登记。'}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-20">
        <AnimatePresence mode="popLayout">
          {filteredInbounds.map((po) => (
            <motion.div
              key={po.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={() => handleView(po)}
              className="rounded-2xl border border-border bg-white dark:bg-white/5 p-4 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                 <span className="font-bold text-sm font-mono">{po.id}</span>
                 <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
                    已入库
                 </span>
              </div>
              <div className="flex items-center justify-between mt-4 border-t border-border/10 pt-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar size={12} />
                    <span className="text-[10px] font-mono">{formatLocalDateTime(po.date)}</span>
                </div>
                <div className="font-bold text-foreground text-sm">
                    ￥{po.totalAmount.toLocaleString()}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Registration Modals */}
      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        onImport={handleImport} 
        templateData={[
          {
            "*SKU": "SKU001",
            "*入库数量": 50,
            "*进货单价": 15.5
          },
          {
            "*SKU": "SKU002",
            "*入库数量": 100,
            "*进货单价": 22.0
          }
        ]}
        templateFileName="入库导入模板.xlsx"
      />

      <ProductFormModal 
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onSubmit={handleManualAdd}
      />

      <PurchaseOrderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={selectedOrder}
        onSubmit={() => {}}
        readOnly={true}
      />
    </div>
  );
}
