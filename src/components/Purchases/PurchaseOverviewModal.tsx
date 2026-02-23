"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, ShoppingBag, Layers } from "lucide-react";
import { PurchaseOrder } from "@/lib/types";

interface PurchaseOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchases: PurchaseOrder[];
}

export function PurchaseOverviewModal({ isOpen, onClose, purchases }: PurchaseOverviewModalProps) {
  const stats = useMemo(() => {
    const orderCount = purchases.length;

    // Aggregate items by productId
    const productMap = new Map<string, { name: string; sku: string; totalQty: number; supplierId?: string; supplierName?: string }>();
    const supplierMap = new Map<string, { name: string; totalQty: number }>();

    for (const po of purchases) {
      for (const item of po.items) {
        const pid = item.productId;
        const name = item.product?.name || "未知商品";
        const sku = item.product?.sku || "";
        const qty = item.quantity || 0;
        const sid = item.supplierId || item.product?.supplierId || "";
        const sname = item.supplier?.name || (item.product as { supplier?: { name: string } })?.supplier?.name || "";

        // Product aggregation
        if (productMap.has(pid)) {
          productMap.get(pid)!.totalQty += qty;
        } else {
          productMap.set(pid, { name, sku, totalQty: qty, supplierId: sid, supplierName: sname });
        }

        // Supplier aggregation
        if (sid) {
          if (supplierMap.has(sid)) {
            supplierMap.get(sid)!.totalQty += qty;
          } else {
            supplierMap.set(sid, { name: sname || "未知供应商", totalQty: qty });
          }
        }
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) => b.totalQty - a.totalQty);
    const suppliers = Array.from(supplierMap.values()).sort((a, b) => b.totalQty - a.totalQty);
    const totalQty = products.reduce((s, p) => s + p.totalQty, 0);
    const maxSupplierQty = suppliers[0]?.totalQty || 1;

    return { orderCount, products, suppliers, totalQty, maxSupplierQty };
  }, [purchases]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-60000 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-60001 w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900 border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 shrink-0">
              <div>
                <h2 className="text-lg font-black text-foreground">进货总览</h2>
                <p className="text-xs text-muted-foreground mt-0.5">基于当前筛选的 {stats.orderCount} 张采购单</p>
              </div>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: ShoppingBag, label: "采购单数", value: stats.orderCount, color: "text-blue-500", bg: "bg-blue-500/10" },
                  { icon: Layers, label: "商品种类", value: stats.products.length, color: "text-violet-500", bg: "bg-violet-500/10" },
                  { icon: Package, label: "合计件数", value: stats.totalQty, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className="rounded-2xl border border-border/50 bg-muted/20 p-4 flex flex-col items-center gap-2 text-center">
                    <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                      <Icon size={18} className={color} />
                    </div>
                    <span className="text-2xl font-black text-foreground font-mono">{value}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                  </div>
                ))}
              </div>

              {/* Product list */}
              <div>
                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">商品汇总</h3>
                <div className="rounded-2xl border border-border/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/50">
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">#</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">商品名称</th>
                        <th className="text-left px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">编码</th>
                        <th className="text-right px-4 py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.products.map((p, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{i + 1}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-sm font-medium text-foreground">{p.name}</span>
                          </td>
                          <td className="px-4 py-2.5 hidden sm:table-cell">
                            {p.sku && <span className="text-xs text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded">{p.sku}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-black text-foreground font-mono">{p.totalQty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Supplier bar chart */}
              {stats.suppliers.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">供应商分布</h3>
                  <div className="space-y-2.5">
                    {stats.suppliers.map((s, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground shrink-0 w-24 truncate text-right">{s.name}</span>
                        <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(s.totalQty / stats.maxSupplierQty) * 100}%` }}
                            transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
                            className="h-full bg-primary/80 rounded-full"
                          />
                        </div>
                        <span className="text-xs font-bold font-mono text-foreground shrink-0 w-8 text-right">{s.totalQty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
