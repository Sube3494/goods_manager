import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { Package, Clock, ArrowRight, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { RecentInboundItem } from "@/lib/types";

interface Props {
  items: RecentInboundItem[];
  isLoading?: boolean;
}

const containerAnim: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemAnim: Variants = {
  hidden: { opacity: 0, x: -20, filter: "blur(10px)" },
  show: { 
    opacity: 1, 
    x: 0, 
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15
    }
  },
};

const TitleSection = ({ onViewAll }: { onViewAll: () => void }) => (
  <div className="p-4 sm:p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground/60">最近指挥入库</h2>
      <div className="relative flex">
        <span className="rounded-full bg-primary px-2.5 py-0.5 text-[9px] font-black text-primary-foreground shadow-lg shadow-primary/20">最新</span>
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
      </div>
    </div>
    <button
      onClick={onViewAll}
      className="group flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-all"
    >
      历史记录
      <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
    </button>
  </div>
);

export function RecentInbound({ items, isLoading }: Props) {
  const router = useRouter();

  const handleViewAll = () => {
    router.push("/inbound");
  };

  if (isLoading) {
    return (
      <div className="h-full w-full rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
        <TitleSection onViewAll={handleViewAll} />
        <div className="space-y-4 p-4 sm:p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-black/3 dark:bg-white/5 border border-black/3 dark:border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="h-full w-full rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 backdrop-blur-xl overflow-hidden">
        <TitleSection onViewAll={handleViewAll} />
        <div className="flex flex-col items-center justify-center py-12 text-center opacity-30">
          <div className="relative mb-4">
            <Package size={40} className="text-muted-foreground" />
            <div className="absolute -inset-2 bg-primary/20 blur-2xl rounded-full" />
          </div>
          <p className="text-xs font-bold tracking-widest text-muted-foreground">暂无入库记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full max-w-full min-w-0 overflow-hidden rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 backdrop-blur-xl flex flex-col shadow-xs dark:shadow-none">
      <TitleSection onViewAll={handleViewAll} />

      <motion.div
        variants={containerAnim}
        initial="hidden"
        animate="show"
        className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6 custom-scrollbar"
      >
        {items.map((item, index) => {
          const productName = item.product?.name || "未知商品";
          const productSku = item.product?.sku;
          const productImage = item.product?.image;

          return (
            <motion.div
              key={item.id}
              variants={itemAnim}
              className="group flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-border/40 bg-white/60 dark:bg-white/5 p-4 sm:p-3.5 transition-all hover:bg-white hover:dark:bg-white/10 hover:border-border/80 dark:hover:border-white/20 hover:shadow-lg hover:shadow-black/5 gap-3 sm:gap-0 w-full min-w-0"
            >
              <div className="flex items-center gap-3 sm:gap-4 w-full sm:flex-1 min-w-0">
                <div className="relative h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded-xl bg-black/5 dark:bg-muted/20 border border-black/5 dark:border-white/10 shadow-inner group-hover:scale-105 transition-transform">
                  {productImage ? (
                    <Image 
                      src={productImage} 
                      alt={productName}
                      fill
                      className="object-cover"
                      sizes="48px"
                      priority={index < 3}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
                      <Package size={18} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-bold text-foreground text-[13px] sm:text-sm truncate uppercase tracking-tight flex-1">{productName}</p>
                    <div className="hidden sm:flex items-center shrink-0 whitespace-nowrap text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 rounded-full">
                       <TrendingUp size={8} className="mr-0.5" />
                       入库
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {productSku && (
                      <span className="text-[9px] sm:text-[10px] text-muted-foreground/50 font-mono tracking-tighter truncate max-w-[80px] sm:max-w-none">
                        {productSku}
                      </span>
                    )}
                    <span className="h-0.5 w-0.5 sm:h-1 sm:w-1 rounded-full bg-black/5 dark:bg-white/10 shrink-0" />
                    <span className="text-[9px] sm:text-[10px] font-black text-primary font-mono bg-primary/10 px-1.5 sm:px-2 rounded-md shrink-0 whitespace-nowrap">
                      数量 {item.quantity}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 sm:ml-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 w-full sm:w-auto min-w-0">
                <div className="font-mono text-[13px] sm:text-sm font-black text-foreground tabular-nums tracking-tighter self-end sm:self-auto shrink-0">￥{item.subtotal.toLocaleString()}</div>
                <div className="flex items-center justify-end gap-1 mt-0.5 sm:mt-1 text-[8px] sm:text-[9px] font-bold text-muted-foreground/40 uppercase tracking-wider min-w-0">
                  <Clock size={10} strokeWidth={3} className="shrink-0" />
                  <span className="truncate">{item.purchaseOrder.date ? formatDistanceToNow(new Date(item.purchaseOrder.date), { addSuffix: true, locale: zhCN }) : '未知'}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
