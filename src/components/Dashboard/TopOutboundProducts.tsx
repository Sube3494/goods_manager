import { useEffect, useState } from "react";
import { Trophy, TrendingUp, PackageOpen, ChevronRight, Crown } from "lucide-react";
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

  const TitleSection = () => (
    <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground/60 flex items-center gap-2">
          <TrendingUp className="text-orange-500" size={16} />
          出库热销榜
        </h3>
        <p className="text-[10px] text-muted-foreground/30 font-medium uppercase tracking-tighter">Velocity Ranking</p>
      </div>
      {items.length > 0 && (
        <div className="flex items-center gap-1 bg-orange-500/10 px-2 py-1 rounded-lg border border-orange-500/20 shadow-lg shadow-orange-500/5">
           <Trophy size={10} className="text-orange-500" />
           <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">TOP {items.length}</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full w-full rounded-3xl border border-black/8 dark:border-white/10 bg-zinc-50/50 dark:bg-white/5 flex flex-col backdrop-blur-xl overflow-hidden shadow-xs dark:shadow-none">
      <TitleSection />
      
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col gap-4 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-14 h-14 rounded-2xl bg-black/3 dark:bg-white/5 border border-black/3 dark:border-white/5 shrink-0" />
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
            <p className="text-xs font-black uppercase tracking-[0.3em] font-mono">Data Not Found</p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            <AnimatePresence>
              {items.map((item, index) => (
                <motion.div 
                  key={item.productId} 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group flex items-center gap-4 p-3 rounded-2xl bg-white/60 dark:bg-white/5 border border-black/3 dark:border-transparent transition-all hover:bg-white hover:dark:bg-white/10 hover:border-black/10 dark:hover:border-white/10 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5"
                >
                  <div className="relative shrink-0">
                    {/* Rank System with Metallic texture */}
                    <div className={cn(
                      "absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white z-20 shadow-2xl border-2 border-white/20 dark:border-white/20",
                      index === 0 ? 'bg-linear-to-br from-amber-300 via-amber-500 to-amber-600 scale-110' :
                      index === 1 ? 'bg-linear-to-br from-slate-200 via-slate-400 to-slate-500' :
                      index === 2 ? 'bg-linear-to-br from-amber-600 via-amber-800 to-amber-900' :
                      'bg-black/30 text-white dark:bg-white/10 dark:text-muted-foreground/60 border-black/10 dark:border-white/5'
                    )}>
                      {index === 0 ? <Crown size={12} strokeWidth={3} /> : index + 1}
                    </div>

                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 bg-black/5 dark:bg-muted/20 shadow-inner group-hover:scale-105 transition-transform">
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
                      <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-foreground truncate uppercase group-hover:text-primary transition-colors">
                        {item.product.name}
                      </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/40 font-mono truncate mt-0.5 tracking-tighter">
                      SKU ID: {item.product.sku}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end right-align gap-0.5">
                    <div className="text-xl font-black text-foreground tabular-nums tracking-tighter shadow-primary/20">
                      {item.totalQuantity}
                    </div>
                    <span className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] leading-none">Sold Unit</span>
                  </div>

                  <div className="ml-1 opacity-10 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={14} className="text-primary" />
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
