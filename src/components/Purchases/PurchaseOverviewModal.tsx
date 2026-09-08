"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Eye, EyeOff, Hash, Maximize, Minimize } from "lucide-react";

import { PurchaseOrder } from "@/lib/types";
import { sortPurchaseItems } from "@/lib/pinyin";

interface PurchaseOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchases: PurchaseOrder[];
}

export function PurchaseOverviewModal({ isOpen, onClose, purchases }: PurchaseOverviewModalProps) {
  const [showSku, setShowSku] = useState(true);
  const [showIndex, setShowIndex] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);

  // 只有在弹窗关闭时才重置渲染状态
  // 遵循 React 官方建议：根据 props 重置 state 最好在渲染阶段进行，避免 useEffect 导致的级联渲染
  if (!isOpen && isRendered) {
    setIsRendered(false);
  }

  // 延迟渲染重负载列表，确保弹窗框架先出现
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => setIsRendered(true), 150);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const stats = useMemo(() => {
    const orderCount = purchases.length;

    // Aggregate items by productId
    const productMap = new Map<string, { 
      name: string; 
      sku: string; 
      totalQty: number; 
      image?: string;
      supplierId?: string; 
      supplierName?: string 
    }>();

    for (const po of purchases) {
      for (const item of po.items) {
        const pid = item.shopProductId || item.productId || "";
        if (!pid) {
          continue;
        }
        const name = item.shopProduct?.productName || item.shopProduct?.name || "未知商品";
        const sku = item.shopProduct?.sku || "";
        const qty = item.quantity || 0;
        const sid = item.supplierId || item.shopProduct?.supplierId || item.product?.supplierId || "";
        const sname = item.supplier?.name || (item.product as { supplier?: { name: string } })?.supplier?.name || "";
        
        // Pick image: PurchaseOrderItem.image or ShopProduct.image
        const image = item.shopProduct?.image || item.image;


        // Product aggregation
        if (productMap.has(pid)) {
          productMap.get(pid)!.totalQty += qty;
        } else {
          productMap.set(pid, { name, sku, totalQty: qty, image, supplierId: sid, supplierName: sname });
        }
      }
    }

    let products = Array.from(productMap.values());
    products = sortPurchaseItems(products, p => p.sku, p => p.name);
    
    const totalQty = products.reduce((s, p) => s + p.totalQty, 0);

    return { orderCount, products, totalQty };
  }, [purchases]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-85000 flex items-center justify-center p-3 sm:p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 450, damping: 35 }}
            className={`relative z-10 bg-white dark:bg-gray-900/75 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col ${
              isFullscreen 
                ? "w-screen h-dynamic-screen max-w-none max-h-none rounded-none border-none" 
                : "w-full max-w-6xl max-h-[min(92vh,900px)] rounded-[28px] sm:rounded-[32px] border border-border/60 dark:border-white/10"
            }`}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
            {/* Header */}
            <div className="relative z-10 flex items-center justify-between px-6 py-5 border-b border-border/50 dark:border-white/10 shrink-0">
              <div>
                <h2 className="text-xl font-black text-foreground">
                    {stats.orderCount === 1 ? "采购单汇总" : "进货明细汇总"}
                </h2>
                {stats.orderCount === 1 && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono tracking-wider opacity-60">
                        {purchases[0]?.id}
                    </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Index Toggle Button */}
                <button 
                  onClick={() => setShowIndex(!showIndex)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground transition-all flex items-center gap-1.5 border border-black/8 dark:border-white/10 shadow-xs"
                  title={showIndex ? "隐藏序号" : "显示序号"}
                >
                  <Hash size={13} className={showIndex ? "" : "opacity-40"} />
                  <span className="hidden sm:inline">{showIndex ? "隐藏序号" : "显示序号"}</span>
                </button>

                {/* SKU Toggle Button */}
                <button 
                  onClick={() => setShowSku(!showSku)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground transition-all flex items-center gap-1.5 border border-black/8 dark:border-white/10 shadow-xs"
                  title={showSku ? "隐藏商品编码" : "显示商品编码"}
                >
                  {showSku ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span className="hidden sm:inline">{showSku ? "隐藏编码" : "显示编码"}</span>
                </button>
                
                {/* Fullscreen Toggle Button */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-black/5 dark:hover:bg-white/8 hover:text-foreground transition-all flex items-center gap-1.5 border border-black/8 dark:border-white/10 shadow-xs ml-1"
                  title={isFullscreen ? "退出全屏" : "全屏模式"}
                >
                  {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                  <span className="hidden sm:inline">{isFullscreen ? "退出全屏" : "全屏模式"}</span>
                </button>
                
                {/* Close Button */}
                <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center justify-center ml-1">
                  <X size={19} />
                </button>
              </div>
            </div>

            {/* Scrollable content */}
            <div 
              className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6"
              style={{ 
                willChange: 'transform', 
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
              }}
            >
              {!isRendered ? (
                <div className="flex-1 flex items-center justify-center py-20 text-muted-foreground/30">
                  <Package size={48} className="animate-pulse" />
                </div>
              ) : (
                <div 
                  className={`grid gap-3 sm:gap-4 ${
                    isFullscreen 
                      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8" 
                      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                  }`}
                  style={{ contain: 'paint' }}
                >
                {/* 仅渲染前 200 个商品，绝大多数采购单不会超过这个数 */}
                {stats.products.slice(0, 200).map((p, i) => (
                  <div 
                    key={i} 
                    className="group relative bg-muted/30 rounded-2xl border border-border/50 overflow-hidden shrink-0 aspect-square"
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    style={{ contentVisibility: 'auto', containIntrinsicSize: '200px' } as any}
                  >
                    
                    {/* Image Area */}
                    {p.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img 
                        src={p.image} 
                        alt={p.sku || "商品图"} 
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        className="w-full h-full object-cover pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package size={36} className="text-muted-foreground opacity-20" />
                      </div>
                    )}
                    
                    {/* Quantity Badge */}
                    <div className="absolute top-2 right-2 bg-black/80 text-white text-sm sm:text-base font-black px-2.5 py-1 rounded-full shadow-lg border border-white/10 z-10 flex items-center gap-1">
                      <span className="text-[10px] opacity-70 font-normal leading-none mt-px">x</span>
                      <span className="leading-none tracking-tight">{p.totalQty}</span>
                    </div>

                    {/* Index Badge */}
                    {showIndex && (
                      <div className="absolute top-2 left-2 bg-black/75 text-white text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full shadow-sm z-10 opacity-90 border border-white/10 backdrop-blur-xs">
                        #{i + 1}
                      </div>
                    )}

                    {/* Subtle Bottom Gradient */}
                    <div className="absolute bottom-0 inset-x-0 h-14 bg-linear-to-t from-black/60 to-transparent pointer-events-none z-0"></div>

                    {/* SKU Overlay */}
                    {showSku && (
                      <div className="absolute bottom-2 left-2 right-2 z-10 flex">
                        <div className="px-2.5 py-1 bg-black/75 text-white/95 rounded-full flex items-center border border-white/10 overflow-hidden shadow-sm max-w-full backdrop-blur-xs">
                          {p.sku ? (
                            <span className="text-[10px] sm:text-[11px] font-mono font-bold tracking-tight truncate min-w-0" title={p.sku}>
                              {p.sku}
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30">-</span>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,

    document.body
  );
}

