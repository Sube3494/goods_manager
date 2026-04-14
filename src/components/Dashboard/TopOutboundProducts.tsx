import { useEffect, useState } from "react";
import { Trophy, TrendingUp, PackageOpen } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TopOutboundProduct {
  productId: string;
  totalQuantity: number;
  product: {
    id: string;
    name: string;
    sku: string;
    image: string | null;
  };
}

export function TopOutboundProducts() {
  const [items, setItems] = useState<TopOutboundProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTop() {
      try {
        const res = await fetch("/api/stats/top-outbound");
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch (error) {
        console.error("Failed to fetch top outbound:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchTop();
  }, []);

  const cardClass = "h-full w-full overflow-hidden rounded-[22px] border border-black/8 dark:border-white/10 bg-zinc-50/55 dark:bg-white/[0.04] shadow-xs dark:shadow-none backdrop-blur-xl";

  const TitleSection = () => (
    <div className="flex items-center justify-between gap-3 border-b border-black/6 dark:border-white/8 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-black/8 bg-black/[0.03] text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            <TrendingUp size={14} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black tracking-tight text-foreground">出库热销榜</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">最近热销商品</p>
          </div>
        </div>
      </div>
      {items.length > 0 && (
        <div className="inline-flex items-center gap-1 rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[10px] font-bold text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
          <Trophy size={11} />
          前 {items.length} 名
        </div>
      )}
    </div>
  );

  return (
    <div className={cardClass}>
      <TitleSection />
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col gap-2.5 p-3.5 sm:p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse rounded-[16px] border border-black/6 dark:border-white/8 bg-white/75 px-3 py-2.5 dark:bg-white/[0.04]">
                <div className="w-12 h-12 rounded-xl bg-black/3 dark:bg-white/5 border border-black/3 dark:border-white/5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-black/3 dark:bg-white/5 rounded-full w-2/3" />
                  <div className="h-3 bg-black/3 dark:bg-white/5 rounded-full w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground/30 py-12 gap-4">
            <div className="relative">
               <PackageOpen size={48} className="opacity-20" />
               <div className="absolute -inset-4 bg-blue-500/10 blur-3xl rounded-full" />
            </div>
            <p className="text-xs font-black tracking-[0.3em]">暂无数据</p>
          </div>
        ) : (
          <div className="space-y-2 p-3.5 sm:p-4">
            <AnimatePresence>
              {items.map((item, index) => (
                <motion.div 
                  key={item.productId} 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group flex items-center gap-3 rounded-[16px] border border-black/6 dark:border-white/8 bg-white/78 dark:bg-white/[0.03] px-3 py-2.5 transition-colors hover:border-black/10 dark:hover:border-white/12 hover:bg-white dark:hover:bg-white/[0.05]"
                >
                  <div className="relative shrink-0">
                    <div className={cn(
                      "absolute -top-2 -right-2 z-20 flex h-5.5 w-5.5 items-center justify-center rounded-full border border-black/8 bg-black/[0.65] text-[9px] font-bold text-white dark:border-white/10 dark:bg-white/[0.14]",
                      index < 3 && "bg-black/[0.75] dark:bg-white/[0.18]"
                    )}>
                      {index + 1}
                    </div>

                    <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-black/5 bg-black/5 dark:border-white/10 dark:bg-muted/20">
                      {item.product.image ? (
                        <Image
                          src={item.product.image}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                          <PackageOpen size={20} />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                        {item.product.name}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-[10px] font-mono text-muted-foreground">
                      编码: {item.product.sku || "未填写"}
                    </p>
                  </div>

                  <div className="shrink-0 border-l border-black/6 pl-3 text-right dark:border-white/8">
                    <div className="text-[24px] leading-none font-black tabular-nums tracking-tight text-foreground">
                      {item.totalQuantity}
                    </div>
                    <span className="mt-1 block text-[9px] font-bold text-muted-foreground">出库量</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
