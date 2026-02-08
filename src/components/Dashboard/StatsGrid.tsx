"use client";

import { Archive, Package, AlertTriangle, ArrowDownRight, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";




import { PurchaseOrder, StatsData } from "@/lib/types";




export function StatsGrid({ data }: { data: StatsData | null }) {
  const router = useRouter();
  
  const stats = [
    { 
      title: "库存总货值", 
      value: data ? `¥${data.totalValue.toLocaleString()}` : "¥0", 
      icon: Archive, 
      sub: data ? `共计 ${data.productCount} 个SKU` : "加载中...", 
      trend: "+0%", 
      trendUp: true,
      warning: false,
      color: "from-blue-500/20 to-cyan-500/20",
      iconColor: "text-blue-500"
    },
    { 
      title: "商品总量", 
      value: data ? data.totalStock.toLocaleString() : "0", 
      icon: Package, 
      sub: "动态更新", 
      trend: "+0%", 
      trendUp: true,
      warning: false,
      color: "from-purple-500/20 to-pink-500/20",
      iconColor: "text-purple-500"
    },
    { 
      title: "库存预警", 
      value: data ? data.lowStockCount.toString() : "0", 
      icon: AlertTriangle, 
      sub: "需要补货", 
      trend: (data?.lowStockCount ?? 0) > 0 ? "急需" : "正常", 
      trendUp: false,
      warning: (data?.lowStockCount ?? 0) > 0,
      color: "from-orange-500/20 to-red-500/20",
      iconColor: "text-orange-500",
      href: "/goods?filter=low_stock"
    },
    { 
      title: "待入库订单", 
      value: data ? `${data.pendingInboundCount.toLocaleString()}` : "0", 
      icon: ArrowDownRight, 
      sub: "等待验收订单", 
      trend: "需处理", 
      trendUp: true,
      warning: false,
      color: "from-emerald-500/20 to-teal-500/20",
      iconColor: "text-emerald-500",
      href: "/purchases?status=Ordered"
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          onClick={() => (stat as any).href && router.push((stat as any).href)}
          className={`group relative overflow-hidden rounded-2xl glass border border-border p-6 transition-all hover:-translate-y-1 hover:shadow-xl ${(stat as any).href ? 'cursor-pointer active:scale-[0.98]' : ''}`}
        >
          {/* Ambient Background Gradient */}
          <div className={`absolute inset-0 bg-linear-to-br ${stat.color} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />
          
          <div className="absolute -right-4 -top-4 opacity-5 transition-transform duration-500 group-hover:scale-110 group-hover:opacity-10">
            <stat.icon size={100} />
          </div>

          <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
            <div className="flex items-center justify-between">
               <span className="text-sm font-medium text-muted-foreground">{stat.title}</span>
               <div className={`p-2 rounded-lg bg-white/5 ${stat.iconColor} backdrop-blur-sm`}>
                 <stat.icon size={18} />
               </div>
            </div>

            <div>
               <div className="text-3xl font-bold tracking-tight text-foreground font-mono">
                 {stat.value}
               </div>
               
               <div className="mt-2 flex items-center gap-2">
                 <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                    stat.warning 
                        ? "bg-red-500/10 text-red-500" 
                        : "bg-green-500/10 text-green-500"
                 }`}>
                    {stat.trendUp && <TrendingUp size={12} />}
                    {stat.trend}
                 </span>
                 <span className="text-xs text-muted-foreground">{stat.sub}</span>
               </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
