"use client";

import { ImportModal } from "@/components/Goods/ImportModal";
import { ProductFormModal } from "@/components/Goods/ProductFormModal";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { useToast } from "@/components/ui/Toast";
import { ArrowDown, FileSpreadsheet, Keyboard, Package, Clock, ExternalLink, ReceiptText } from "lucide-react";
import { PurchaseOrder } from "@/lib/types";
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import Link from "next/link";

export default function ImportPage() {
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  const fetchRecentRecords = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/purchases");
      if (res.ok) {
        const data = await res.json();
        const receivedOnly = data.filter((p: PurchaseOrder) => p.status === "Received");
        setRecentPurchases(receivedOnly.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to fetch recent purchases:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentRecords();
  }, []);

  const handleManualAdd = async (data: any) => {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        showToast(`"${data.name}" 已创建并自动入库记录`, "success");
        fetchRecentRecords();
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
        showToast(`成功导入 ${result.successCount} 件商品${result.failCount > 0 ? `，失败 ${result.failCount} 件` : ""}`, "success");
        fetchRecentRecords();
      } else {
        showToast("导入失败", "error");
      }
    } catch (error) {
      console.error("Import failed:", error);
      showToast("网络错误", "error");
    }
  };



  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">入库登记</h1>
          <p className="text-muted-foreground mt-2">选择一种方式将商品录入系统。</p>
        </div>
        <div className="p-3 rounded-xl bg-primary/5 text-primary">
           <ArrowDown size={24} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Excel Import Card */}
        <button 
          onClick={() => setShowImportModal(true)}
          className="group relative flex flex-col items-center justify-center p-8 rounded-2xl glass-panel border-2 border-transparent hover:border-primary/20 hover:bg-card/80 transition-all duration-300 text-center space-y-4"
        >
           <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-500">
              <FileSpreadsheet size={32} />
           </div>
           <div>
              <h3 className="text-lg font-bold text-foreground">Excel 批量导入</h3>
              <p className="text-sm text-muted-foreground mt-1">支持拖拽上传 .xlsx 文件</p>
           </div>
        </button>

        {/* Manual Entry Card */}
        <button 
           onClick={() => setShowManualModal(true)}
           className="group relative flex flex-col items-center justify-center p-8 rounded-2xl glass-panel border-2 border-transparent hover:border-primary/20 hover:bg-card/80 transition-all duration-300 text-center space-y-4"
        >
           <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform duration-500">
              <Keyboard size={32} />
           </div>
           <div>
              <h3 className="text-lg font-bold text-foreground">手动录入</h3>
              <p className="text-sm text-muted-foreground mt-1">单件商品详细登记</p>
           </div>
        </button>


      </div>

      {/* Recent Activity */}
      <div className="glass-panel rounded-3xl border border-border overflow-hidden">
        <div className="bg-muted/30 px-8 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">最近入库记录 (入库单)</h3>
          <Link href="/purchases" className="text-xs font-bold text-primary flex items-center gap-1 hover:underline uppercase tracking-tighter">
            查看全部入库单 <ExternalLink size={12} />
          </Link>
        </div>
        
        <div className="p-2">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm">正在加载记录...</p>
            </div>
          ) : recentPurchases.length > 0 ? (
            <div className="divide-y divide-border/50">
              {recentPurchases.map((order) => (
                <div 
                  key={order.id} 
                  onClick={() => setSelectedOrder(order)}
                  className="group flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-all rounded-2xl cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-primary/5 flex items-center justify-center text-primary/40 group-hover:scale-105 transition-transform">
                      <ReceiptText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-sm font-mono">{order.id}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          已入库
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          包含 {order.items?.length || 0} 项商品
                        </span>
                        <span className="text-[10px] text-muted-foreground opacity-60">·</span>
                        <span className="text-[10px] font-bold text-primary">￥{order.totalAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium leading-none">
                    <Clock size={12} />
                    {formatDistanceToNow(new Date(order.date || new Date()), { addSuffix: true, locale: zhCN })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 opacity-50">
                <Package size={24} />
              </div>
              <p className="text-sm">最近没有入库记录</p>
              <p className="text-xs opacity-60">完成入库登记后，入库凭证将显示在此处</p>
            </div>
          )}
        </div>
      </div>

      <ImportModal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)} 
        onImport={handleImport} 
      />

      <ProductFormModal 
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onSubmit={handleManualAdd}
      />

      <PurchaseOrderModal
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        initialData={selectedOrder}
        onSubmit={() => {}} // Read-only, no submit needed
        readOnly={true}
      />
    </div>
  );
}

