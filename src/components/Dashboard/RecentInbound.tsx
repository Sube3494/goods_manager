"use client";

import { Package, ChevronRight, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemAnim = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0 }
};

interface InboundItem {
  id: string;
  totalAmount: number;
  status: string;
  date: string;
  supplier?: {
    name: string;
  };
}

export function RecentInbound({ data }: { data: InboundItem[] }) {
  const items = data || [];

  return (
    <div className="glass-panel flex flex-col rounded-2xl border border-border p-6 h-full">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-foreground">近期入库</h3>
          <span className="flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-bold text-primary">
            NEW
          </span>
        </div>
        <button className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary">
          查看全部
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 space-y-3 overflow-y-auto pr-1"
      >
        {items.map((item) => (
          <motion.div
            key={item.id}
            variants={itemAnim}
            className="group flex items-center justify-between rounded-xl border border-transparent p-3 transition-all hover:border-border hover:bg-muted/50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/5 text-muted-foreground/50 transition-transform group-hover:scale-105">
                <Package size={20} className="text-foreground/40" />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm truncate max-w-[120px]">{item.supplier?.name || "未知供应商"}</p>
                <div className="mt-1 flex items-center gap-2">
                   <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                     {item.status}
                   </span>
                   <span className="text-[10px] font-mono text-muted-foreground/70">{item.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div className="font-mono text-sm font-bold text-emerald-500">￥{item.totalAmount.toLocaleString()}</div>
              <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
                <Clock size={10} />
                {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: zhCN })}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
