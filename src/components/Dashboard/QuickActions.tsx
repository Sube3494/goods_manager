"use client";

import { ArrowDownRight, ShoppingBag, PackagePlus, PackageMinus, Image as ImageIcon, Settings, Database } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

const itemAnim = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};

export function QuickActions() {
  const router = useRouter();

  return (
    <div className="glass relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border p-6 h-full">
      {/* Decorative Gradient Blob */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/5 blur-3xl transition-opacity group-hover:opacity-100" />

      <div>
        <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">快捷操作</h3>
        </div>
        
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          {/* Primary Row: Inbound & Outbound */}
          <div className="grid grid-cols-2 gap-3">
              <motion.button 
                 onClick={() => router.push("/inbound?action=import")}
                 variants={itemAnim} 
                 className="group relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary px-4 py-6 text-center text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/40"
              >
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <PackagePlus size={24} />
                </div>
                <span className="relative z-10">登记新入库</span>
                <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
              </motion.button>

              <motion.button 
                 onClick={() => router.push("/outbound")}
                 variants={itemAnim} 
                 className="group relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-secondary px-4 py-6 text-center text-sm font-bold text-secondary-foreground border border-border/50 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-secondary/80"
              >
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-gray-800 shadow-sm transition-transform group-hover:scale-110">
                  <PackageMinus size={24} className="text-primary" />
                </div>
                <span className="relative z-10">登记新出库</span>
              </motion.button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {[
              { label: "采购订单管理", icon: ShoppingBag, path: "/purchases", color: "text-blue-500" },
              { label: "供应商名录", icon: ArrowDownRight, path: "/suppliers", color: "text-purple-500" },
              { label: "商品实物图库", icon: ImageIcon, path: "/gallery", color: "text-orange-500" },
              { label: "系统数据备份", icon: Database, path: "/settings", color: "text-indigo-500" },
            ].map((action, i) => (
              <motion.button 
                key={action.path + i}
                onClick={() => router.push(action.path)}
                variants={itemAnim} 
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-left text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-card hover:border-primary/20"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:${action.color} transition-colors`}>
                  <action.icon size={18} />
                </div>
                <span>{action.label}</span>
              </motion.button>
            ))}
          </div>
          
          <motion.button 
            onClick={() => router.push("/settings")}
            variants={itemAnim} 
            className="flex w-full items-center justify-center gap-2 py-2 text-[10px] font-bold text-muted-foreground/30 hover:text-primary transition-colors uppercase tracking-widest pt-2"
          >
            <Settings size={12} />
            高级系统设置
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
