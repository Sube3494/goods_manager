"use client";

import { Archive, Package, AlertTriangle, ArrowDownRight, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { 
    title: "库存总货值", 
    value: "¥452,310", 
    icon: Archive, 
    sub: "共计 450 个SKU", 
    trend: "+12%", 
    trendUp: true,
    color: "from-blue-500/20 to-cyan-500/20",
    iconColor: "text-blue-500"
  },
  { 
    title: "商品总数", 
    value: "3,450", 
    icon: Package, 
    sub: "分布于 12 个分类", 
    trend: "+5%", 
    trendUp: true,
    color: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-500"
  },
  { 
    title: "库存预警", 
    value: "8", 
    icon: AlertTriangle, 
    sub: "需要立即补货", 
    trend: "急需", 
    trendUp: false,
    warning: true,
    color: "from-orange-500/20 to-red-500/20",
    iconColor: "text-orange-500"
  },
  { 
    title: "本周入库", 
    value: "+120", 
    icon: ArrowDownRight, 
    sub: "过去7天新增", 
    trend: "+20%", 
    trendUp: true,
    color: "from-emerald-500/20 to-teal-500/20",
    iconColor: "text-emerald-500"
  },
];

export function StatsGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="group relative overflow-hidden rounded-2xl glass border border-border p-6 transition-all hover:-translate-y-1 hover:shadow-xl"
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
