"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { Package, Clock, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { RecentInboundItem } from "@/lib/types";

interface Props {
  items: RecentInboundItem[];
  isLoading?: boolean;
}

export function RecentInbound({ items, isLoading }: Props) {
  const router = useRouter();

  const containerAnim = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemAnim = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
  };

  const handleViewAll = () => {
    router.push("/inbound");
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">近期入库</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">NEW</span>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/30" />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-foreground">近期入库</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">NEW</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Package size={32} className="mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">暂无入库记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-foreground">近期入库</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">NEW</span>
        </div>
        <button
          onClick={handleViewAll}
          className="flex items-center gap-1 text-sm font-medium text-primary hover:gap-2 transition-all"
        >
          查看全部
          <ArrowRight size={14} />
        </button>
      </div>

      <motion.div
        variants={containerAnim}
        initial="hidden"
        animate="show"
        className="flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {items.map((item, index) => {
          const productName = item.product?.name || "未知商品";
          const productSku = item.product?.sku;
          const productImage = item.product?.image;

          return (
            <motion.div
              key={item.id}
              variants={itemAnim}
              className="group flex items-center justify-between rounded-xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {productImage ? (
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted transition-transform group-hover:scale-105">
                    <Image 
                      src={productImage} 
                      alt={productName}
                      fill
                      className="object-cover"
                      sizes="48px"
                      priority={index < 3}
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/5 text-muted-foreground/50 transition-transform group-hover:scale-105 shrink-0">
                    <Package size={20} className="text-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-sm truncate">{productName}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {productSku && (
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
                        {productSku}
                      </span>
                    )}
                    <span className="text-[10px] text-primary font-mono">
                      ×{item.quantity}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0 ml-2">
                <div className="font-mono text-sm font-bold text-emerald-500">￥{item.subtotal.toLocaleString()}</div>
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                  <Clock size={10} />
                  {item.purchaseOrder.date ? formatDistanceToNow(new Date(item.purchaseOrder.date), { addSuffix: true, locale: zhCN }) : '未知时间'}
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
