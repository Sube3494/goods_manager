"use client";

import { Package, Archive, ArrowDownRight, MoreHorizontal, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2 // Delay slightly to play after StatsGrid
    }
  }
};

const itemAnim = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0 }
};

export function QuickActions() {
  const router = useRouter();
  const { showToast } = useToast();

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
          className="space-y-3"
        >
          <motion.button 
             onClick={() => router.push("/inbound?action=import")}
             variants={itemAnim} 
             className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl bg-primary px-4 py-4 text-left text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/40"
          >
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
              <Package size={18} />
            </div>
            <span className="relative z-10">登记新入库</span>
            {/* Hover shine effect */}
            <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-in-out group-hover:translate-x-full" />
          </motion.button>

          <motion.button 
            onClick={() => router.push("/purchases")}
            variants={itemAnim} 
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-4 text-left text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-card hover:border-primary/20"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary transition-colors">
              <ShoppingBag size={18} />
            </div>
            <span>采购管理</span>
          </motion.button>

          <motion.button 
            onClick={() => router.push("/suppliers")}
            variants={itemAnim} 
            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-4 text-left text-sm font-semibold text-foreground backdrop-blur-md transition-all hover:bg-card hover:border-primary/20"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary transition-colors">
              <ArrowDownRight size={18} />
            </div>
            <span>供应商管理</span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
