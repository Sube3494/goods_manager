import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, Variants } from "framer-motion";
import { Package, Clock, ArrowRight, BadgePlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { RecentInboundItem } from "@/lib/types";
import { cn } from "@/lib/utils";

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

const headerCardClass = "rounded-[22px] border border-black/8 dark:border-white/10 bg-zinc-50/55 dark:bg-white/[0.04] shadow-xs dark:shadow-none backdrop-blur-xl";

const TitleSection = ({ onViewAll }: { onViewAll: () => void }) => (
  <div className="flex items-center justify-between gap-3 border-b border-black/6 dark:border-white/8 px-4 py-3 sm:px-5">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/8 bg-black/[0.03] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          <BadgePlus size={14} />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black tracking-tight text-foreground">最近指挥入库</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">最近入库商品</p>
        </div>
      </div>
    </div>
    <button
      onClick={onViewAll}
      className="group inline-flex items-center gap-1 rounded-full border border-black/8 dark:border-white/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:text-foreground"
    >
      历史记录
      <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
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
      <div className={cn("h-full w-full overflow-hidden", headerCardClass)}>
        <TitleSection onViewAll={handleViewAll} />
        <div className="space-y-3 p-4 sm:p-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-[16px] bg-black/3 dark:bg-white/5 border border-black/3 dark:border-white/5" />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className={cn("h-full w-full overflow-hidden", headerCardClass)}>
        <TitleSection onViewAll={handleViewAll} />
        <div className="flex flex-col items-center justify-center py-10 text-center opacity-30">
          <div className="relative mb-4">
            <Package size={34} className="text-muted-foreground" />
            <div className="absolute -inset-2 bg-primary/20 blur-2xl rounded-full" />
          </div>
          <p className="text-[11px] font-bold tracking-widest text-muted-foreground">暂无入库记录</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full w-full max-w-full min-w-0 overflow-hidden flex flex-col", headerCardClass)}>
      <TitleSection onViewAll={handleViewAll} />

      <motion.div
        variants={containerAnim}
        initial="hidden"
        animate="show"
        className="flex-1 space-y-2 overflow-y-auto p-3.5 sm:p-4 custom-scrollbar"
      >
        {items.map((item, index) => {
          const productName = item.product?.name || "未知商品";
          const productSku = item.product?.sku;
          const productImage = item.product?.image;

          return (
            <motion.div
              key={item.id}
              variants={itemAnim}
              className="group flex items-center justify-between gap-3 rounded-[16px] border border-black/6 dark:border-white/8 bg-white/78 dark:bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-black/10 dark:hover:border-white/12 hover:bg-white dark:hover:bg-white/[0.05] w-full min-w-0"
            >
              <div className="flex items-center gap-3 w-full flex-1 min-w-0">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-black/5 dark:bg-muted/20 border border-black/5 dark:border-white/10">
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
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold tracking-tight text-foreground">{productName}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {productSku ? (
                          <span className="truncate font-mono">{productSku}</span>
                        ) : null}
                        <span className="h-1 w-1 rounded-full bg-black/10 dark:bg-white/12" />
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-bold text-primary">数量 {item.quantity}</span>
                      </div>
                    </div>
                    <span className="hidden shrink-0 rounded-full border border-black/8 bg-black/[0.03] px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] sm:inline-flex">
                      入库
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
                    <span className="inline-flex shrink-0 rounded-full border border-black/8 bg-black/[0.03] px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                      入库
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-l border-black/6 pl-3 text-right dark:border-white/8">
                <div className="text-base font-black tabular-nums tracking-tight text-foreground">￥{item.subtotal.toLocaleString()}</div>
                <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-medium text-muted-foreground">
                  <Clock size={10} strokeWidth={3} className="shrink-0" />
                  <span className="truncate">{item.purchaseOrder.date ? formatDistanceToNow(new Date(item.purchaseOrder.date), { addSuffix: true, locale: zhCN }) : "未知"}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
