import { Archive, Package, AlertTriangle, ArrowDownRight, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { StatsData } from "@/lib/types";

interface StatItem {
  title: string;
  value: string;
  icon: React.ElementType;
  sub: string;
  trend: string;
  trendUp: boolean;
  warning: boolean;
  color: string;
  glowColor: string;
  iconColor: string;
  href?: string;
}

export function StatsGrid({ data }: { data: StatsData | null }) {
  const router = useRouter();
  
  const stats = [
    { 
      title: "库存总货值", 
      value: data ? `¥${data.totalValue.toLocaleString()}` : "¥0", 
      icon: Archive, 
      sub: data ? `合计 ${data.productCount} SKU` : "计算中...", 
      trend: "资产总计", 
      trendUp: true,
      warning: false,
      color: "from-blue-500/10 to-cyan-500/10",
      glowColor: "group-hover:shadow-blue-500/20",
      iconColor: "text-blue-500"
    },
    { 
      title: "商品总量", 
      value: data ? data.totalStock.toLocaleString() : "0", 
      icon: Package, 
      sub: "动态实时更新", 
      trend: "库存水位", 
      trendUp: true,
      warning: false,
      color: "from-purple-500/10 to-pink-500/10",
      glowColor: "group-hover:shadow-purple-500/20",
      iconColor: "text-purple-500",
      href: "/goods"
    },
    { 
      title: "库存预警", 
      value: data ? data.lowStockCount.toString() : "0", 
      icon: AlertTriangle, 
      sub: "当前急需补货", 
      trend: (data?.lowStockCount ?? 0) > 0 ? "异常" : "安全", 
      trendUp: false,
      warning: (data?.lowStockCount ?? 0) > 0,
      color: "from-orange-500/10 to-red-500/10",
      glowColor: "group-hover:shadow-orange-500/20",
      iconColor: "text-orange-500",
      href: "/goods?filter=low_stock"
    },
    { 
      title: "待入库订单", 
      value: data ? `${data.pendingInboundCount.toLocaleString()}` : "0", 
      icon: ArrowDownRight, 
      sub: "等待验收清点", 
      trend: "供应链", 
      trendUp: true,
      warning: false,
      color: "from-emerald-500/10 to-teal-500/10",
      glowColor: "group-hover:shadow-emerald-500/20",
      iconColor: "text-emerald-500",
      href: "/purchases?status=Ordered"
    },
  ] as StatItem[];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          layout
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: i * 0.1, ease: [0.23, 1, 0.32, 1] }}
          onClick={() => stat.href && router.push(stat.href)}
          className={cn(
            "group relative overflow-hidden rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 p-4 sm:p-6 backdrop-blur-xl transition-all duration-500",
            "hover:-translate-y-2 hover:bg-white/80 dark:hover:bg-white/10 hover:border-black/12 dark:hover:border-white/20 hover:shadow-2xl hover:shadow-black/5 dark:glowColor",
            stat.glowColor,
            stat.href ? 'cursor-pointer active:scale-[0.98]' : ''
          )}
        >
          {/* Internal Glow Effect */}
          <div className={cn(
            "absolute -right-10 -top-10 h-32 w-32 rounded-full blur-[60px] opacity-0 transition-opacity duration-700 group-hover:opacity-40 dark:group-hover:opacity-40",
            stat.iconColor.replace('text-', 'bg-')
          )} />
          
          {/* Border Glow Animation (Bottom Shine) */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-black/10 dark:via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
 
          <div className="relative z-10 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between mb-8">
               <div className="flex flex-col gap-1">
                 <span className="text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/50">{stat.trend}</span>
                 <span className="text-sm font-bold text-foreground/80">{stat.title}</span>
               </div>
               <div className={cn(
                 "flex h-10 w-10 items-center justify-center rounded-2xl bg-black/3 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/10 shadow-inner",
                 stat.iconColor
               )}>
                 <stat.icon size={20} strokeWidth={2.5} />
               </div>
            </div>
 
            <div className="space-y-3">
               <div className="flex items-baseline gap-2">
                 <span className="text-2xl sm:text-4xl font-black tracking-tighter text-foreground font-mono">
                   {stat.value}
                 </span>
                 {stat.title.includes("货值") && <span className="text-xs font-bold text-muted-foreground">CNY</span>}
               </div>
               
               <div className="flex items-center gap-3">
                 <div className={cn(
                    "flex items-center justify-center h-4 w-4 rounded-full",
                    stat.warning ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                 )}>
                    {stat.warning ? <AlertTriangle size={10} /> : <TrendingUp size={10} />}
                 </div>
                 <span className="text-[11px] font-medium text-muted-foreground tracking-wide">
                    {stat.sub}
                 </span>
               </div>
            </div>
          </div>

          {/* Background decorative Icon */}
          <div className="absolute -right-2 -bottom-2 opacity-[0.02] transition-transform duration-700 group-hover:scale-110 group-hover:opacity-[0.05]">
            <stat.icon size={80} strokeWidth={1} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
