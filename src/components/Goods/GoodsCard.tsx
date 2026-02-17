import { memo, useState } from "react";
import { motion } from "framer-motion";
import { Edit, Package, Truck, Trash2, Camera, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Product } from "@/lib/types";
import { getCategoryName, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

export const GoodsCard = memo(function GoodsCard({ 
  product, 
  onEdit,
  onDelete,
  lowStockThreshold = 10,
  isSelected = false,
  anySelected = false,
  onToggleSelect,
  priority
}: { 
  product: Product; 
  onEdit?: (product: Product) => void;
  onDelete?: (id: string, name: string) => void;
  lowStockThreshold?: number;
  isSelected?: boolean;
  anySelected?: boolean;
  onToggleSelect?: (id: string) => void;
  priority?: boolean;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const { showToast } = useToast();

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(product.name).then(() => {
      setIsCopied(true);
      showToast("商品名称已复制", "success");
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const handleCardClick = () => {
    if (onToggleSelect) {
      onToggleSelect(product.id);
    }
  };

  return (
    <motion.div
      onClick={handleCardClick}
      layout="position"
      className={`group relative flex flex-col overflow-hidden rounded-2xl glass-panel transition-all hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer transform-gpu will-change-transform translate-z-0 ${
        isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20 bg-primary/5' : ''
      }`}
    >
      {/* Image Container - with subtle loading optimization */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-secondary/30">
        {/* Selection Checkbox (Hover or Selected) */}
        <div className={`absolute top-3 left-3 z-10 transition-all duration-300 ${
          isSelected || anySelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              onToggleSelect?.(product.id); 
            }}
            className={`relative h-6 w-6 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                isSelected 
                ? "bg-foreground border-foreground text-background scale-110" 
                : "bg-white/50 dark:bg-zinc-800/50 border-white/50 dark:border-white/20 backdrop-blur hover:border-foreground/50"
            }`}
          >
            {isSelected && (
                <Check size={14} strokeWidth={4} />
            )}
          </button>
        </div>
        
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30 group-hover:text-primary/50 transition-colors">
            <Package size={32} strokeWidth={1.5} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-3 sm:p-5">
        <div className="flex-1">
          <h3 className="font-bold text-sm sm:text-lg leading-tight text-foreground mb-2 sm:mb-4 group-hover:text-primary transition-colors">
            {product.name}
            <button
               onClick={handleCopyName}
               className={cn(
                 "ml-1.5 inline-flex items-center justify-center p-1 rounded-md transition-all active:scale-90 align-middle",
                 isCopied 
                  ? "bg-green-500/10 text-green-500" 
                  : "bg-secondary/50 text-muted-foreground hover:bg-primary/10 hover:text-primary opacity-0 group-hover:opacity-100"
               )}
               title="复制名称"
            >
              {isCopied ? <Check size={12} strokeWidth={3} /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
            </button>
          </h3>
          
          <div className="flex flex-wrap items-center gap-2 mb-2 sm:mb-4">
              <span className="text-[10px] bg-secondary border border-border/50 px-2 py-0.5 rounded text-muted-foreground font-mono shrink-0">
                {product.sku ? product.sku : `REF__${product.id.slice(0, 6)}`}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1">
                <Package size={12} strokeWidth={2.5} />
                {getCategoryName(product.category)}
              </span>
          </div>
          
          {product.supplierId && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 w-fit px-2 py-1 rounded-md">
                <Truck size={12} />
                <span className="truncate max-w-[150px]">
                    {product.supplier?.name || "未知供应商"}
                </span>
              </div>
          )}
        </div>
        
        <div className="mt-2 flex items-center justify-between pt-4 border-t border-white/10">
          <div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold">库存</p>
            <p className={`text-sm font-bold mt-0.5 ${product.stock < lowStockThreshold ? 'text-destructive' : 'text-foreground'}`}>
               {product.stock} <span className="text-[10px] font-bold inline-block ml-1">件</span>
            </p>
          </div>
          <div className="text-right">
             <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold">进货单价</p>
             <p className="font-bold text-foreground">
                {Number(product.costPrice || 0) > 0 ? (
                  <span className="text-base sm:text-lg">¥{Number(product.costPrice).toLocaleString()}</span>
                ) : (
                  <span className="text-xs sm:text-sm text-foreground font-bold">以实际为准</span>
                )}
             </p>
          </div>
        </div>

        {/* Mobile Actions Bar */}
        <div className="mt-4 flex sm:hidden items-center justify-between pt-3 border-t border-border/50">
            <Link
              href={`/gallery?productId=${product.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-80 transition-opacity"
            >
              <Camera size={14} />
              <span>实拍图库</span>
            </Link>
            <div className="flex gap-3">
              {onEdit && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(product);
                  }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="编辑"
                >
                  <Edit size={16} />
                </button>
              )}
              {onDelete && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(product.id, product.name);
                  }}
                  className="text-destructive hover:opacity-80 transition-opacity"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
        </div>
      </div>
      
      {/* Quick Actions Overlay (PC only) */}
      <div className="hidden sm:flex absolute top-3 right-3 flex-col gap-2 translate-x-0 opacity-100 lg:translate-x-10 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 transition-all duration-300">
           <Link
              href={`/gallery?productId=${product.id}`}
              onClick={(e) => e.stopPropagation()}
              className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn flex items-center justify-center"
              title="查看实拍图库"
           >
             <Camera size={16} className="group-hover/btn:scale-110 transition-transform" />
           </Link>
           {onEdit && (
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(product);
                }}
                className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
             >
               <Edit size={16} className="group-hover/btn:scale-110 transition-transform" />
             </button>
           )}
           {onDelete && (
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(product.id, product.name);
                }}
                className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-destructive hover:bg-destructive hover:text-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
             >
               <Trash2 size={16} className="group-hover/btn:scale-110 transition-transform" />
             </button>
           )}
        </div>

    </motion.div>
  );
}, (prev, next) => {
  // Precision check to minimize re-renders in huge lists
  return (
    prev.isSelected === next.isSelected &&
    prev.anySelected === next.anySelected &&
    prev.lowStockThreshold === next.lowStockThreshold &&
    prev.priority === next.priority &&
    prev.product.id === next.product.id &&
    prev.product.name === next.product.name &&
    prev.product.stock === next.product.stock &&
    prev.product.costPrice === next.product.costPrice &&
    prev.product.image === next.product.image &&
    prev.product.sku === next.product.sku &&
    prev.product.supplierId === next.product.supplierId &&
    prev.product.categoryId === next.product.categoryId
  );
});
