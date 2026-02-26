import { ArrowDownRight, ShoppingBag, PackagePlus, PackageMinus, Image as ImageIcon, Settings, Database, ChevronRight } from "lucide-react";
import { motion, Variants } from "framer-motion";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1
    }
  }
};

const itemAnim: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15
    }
  }
};

export function QuickActions() {
  const router = useRouter();

  const otherActions = [
    { label: "采购单管理", icon: ShoppingBag, path: "/purchases", color: "text-blue-500", bg: "bg-blue-500/10 dark:bg-blue-500/5" },
    { label: "供应商名录", icon: ArrowDownRight, path: "/suppliers", color: "text-purple-500", bg: "bg-purple-500/10 dark:bg-purple-500/5" },
    { label: "商品实物图库", icon: ImageIcon, path: "/gallery", color: "text-orange-500", bg: "bg-orange-500/10 dark:bg-orange-500/5" },
    { label: "系统数据备份", icon: Database, path: "/settings?tab=data", color: "text-indigo-500", bg: "bg-indigo-500/10 dark:bg-indigo-500/5" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 p-4 sm:p-6 backdrop-blur-xl shadow-xs dark:shadow-none">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground/60">快速指挥中心</h3>
            <span className="h-px flex-1 mx-4 bg-linear-to-r from-black/5 dark:from-white/10 to-transparent" />
        </div>
        
        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Main Action: Inbound */}
          <motion.button 
             onClick={() => router.push("/inbound?action=import")}
             variants={itemAnim} 
             className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-primary p-4 text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:-translate-y-1 hover:shadow-primary/40 active:scale-95"
          >
            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md shadow-inner">
              <PackagePlus size={24} strokeWidth={2.5} />
            </div>
            <div className="relative z-10 flex flex-col items-start translate-x-1">
              <span className="text-base font-black tracking-tight leading-tight">登记新入库</span>
              <span className="text-[10px] opacity-70 font-medium font-mono uppercase">Batch Inbound</span>
            </div>
            {/* Glossy Overlay */}
            <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-full" />
          </motion.button>

          {/* Main Action: Outbound */}
          <motion.button 
             onClick={() => router.push("/outbound")}
             variants={itemAnim} 
             className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-black/3 dark:bg-white/5 border border-black/5 dark:border-white/10 p-4 text-foreground transition-all hover:-translate-y-1 hover:bg-black/5 dark:hover:bg-white/10 hover:border-black/10 dark:hover:border-white/20 active:scale-95 shadow-sm dark:shadow-none"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 transition-transform group-hover:scale-110">
              <PackageMinus size={24} className="text-primary" />
            </div>
            <div className="flex flex-col items-start translate-x-1">
              <span className="text-base font-black tracking-tight leading-tight">登记新出库</span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase font-mono">Outbound</span>
            </div>
          </motion.button>

          {/* Secondary Actions Grid */}
          <div className="sm:col-span-2 grid grid-cols-2 gap-3">
            {otherActions.map((action, i) => (
              <motion.button 
                key={action.path + i}
                onClick={() => router.push(action.path)}
                variants={itemAnim} 
                className="group flex items-center justify-between rounded-xl border border-black/3 dark:border-white/5 bg-black/2 dark:bg-white/5 p-3 text-left transition-all hover:bg-black/5 dark:hover:bg-white/10 hover:border-black/8 dark:hover:border-white/20 shadow-xs dark:shadow-none"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", action.bg, action.color)}>
                    <action.icon size={16} />
                  </div>
                  <span className="text-xs font-bold text-foreground/80 group-hover:text-foreground">{action.label}</span>
                </div>
                <ChevronRight size={12} className="text-muted-foreground/30 group-hover:text-primary transition-all group-hover:translate-x-0.5" />
              </motion.button>
            ))}
          </div>
        </motion.div>
        
        <div className="flex justify-center border-t border-black/5 dark:border-white/5 pt-4">
          <motion.button 
            onClick={() => router.push("/settings")}
            variants={itemAnim} 
            className="flex items-center gap-2 text-[10px] font-black text-muted-foreground/30 hover:text-primary transition-colors uppercase tracking-[0.3em]"
          >
            <Settings size={12} />
            Advanced System Configuration
          </motion.button>
        </div>
      </div>
    </div>
  );
}
