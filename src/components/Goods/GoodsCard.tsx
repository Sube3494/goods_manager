import { memo, useState } from "react";
import { Edit, Package, Truck, Trash2, Check } from "lucide-react";
import Image from "next/image";
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
  priority,
  hideDiscontinuedState = false,
  stockTitle = "库存",
  stockUnit = "件",
  disableLowStockTone = false,
  shopLabel,
}: { 
  product: Product; 
  onEdit?: (product: Product) => void;
  onDelete?: (id: string, name: string) => void;
  lowStockThreshold?: number;
  isSelected?: boolean;
  anySelected?: boolean;
  onToggleSelect?: (id: string) => void;
  priority?: boolean;
  hideDiscontinuedState?: boolean;
  stockTitle?: string;
  stockUnit?: string;
  disableLowStockTone?: boolean;
  shopLabel?: string;
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
    <div
      onClick={handleCardClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl glass-panel transition-all duration-200 hover:-translate-y-1.5 cursor-pointer",
        isSelected ? "ring-2 ring-primary shadow-lg shadow-primary/20 bg-primary/5" : "hover:shadow-2xl hover:shadow-primary/10",
        product.isDiscontinued && !hideDiscontinuedState ? "bg-muted/30 border-muted-foreground/20" : ""
      )}
    >
      {/* Full Card Discontinued Overlay */}
      {product.isDiscontinued && !hideDiscontinuedState && (
        <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center overflow-hidden">
          {/* 使用普通的半透明遮罩代替昂贵的 backdrop-grayscale 滤镜 */}
          <div className="absolute inset-0 bg-white/60 dark:bg-black/80"></div>
          
          <div 
             className="relative z-10 transform -rotate-45 font-black text-red-600/40 dark:text-red-500/30 text-5xl sm:text-7xl lg:text-6xl xl:text-5xl tracking-widest whitespace-nowrap select-none"
          >
            已停产
          </div>
        </div>
      )}

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
        <div>
          <h3 className="font-bold text-[13px] sm:text-[15px] leading-tight text-foreground mb-2 sm:mb-2.5 group-hover:text-primary transition-colors">
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
              {isCopied ? <Check size={14} strokeWidth={3} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
            </button>
          </h3>
          
          <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
            {product.sku && (
              <span className="text-[10px] bg-secondary/80 border border-border/40 px-2 py-0.5 rounded-full text-muted-foreground font-number shrink-0 leading-none flex items-center h-5" style={{ fontFamily: 'var(--font-mono)' }}>
                {product.sku}
              </span>
            )}
            <span className="text-[10px] bg-primary/5 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 h-5 leading-none">
              <Package size={10} strokeWidth={2.5} className="shrink-0" />
              {getCategoryName(product.category)}
            </span>
            {product.supplierId && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-zinc-500/5 border border-zinc-500/10 px-2 py-0.5 rounded-full h-5 leading-none">
                <Truck size={10} className="shrink-0" />
                <span className="truncate max-w-[100px]">
                    {product.supplier?.name || "未知供应商"}
                </span>
              </div>
            )}
            {shopLabel && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-2 py-0.5 rounded-full h-5 leading-none">
                <span className="truncate max-w-[100px]">{shopLabel}</span>
              </div>
            )}
          </div>

        </div>

        {/* 弹性空隙，将底部栏推到卡片底部 */}
        <div className="flex-1" />
        
        <div className="mt-2 flex items-center justify-between pt-4 border-t border-white/10">
          <div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold">{stockTitle}</p>
            <p className={`text-sm font-bold mt-0.5 font-number ${!disableLowStockTone && product.stock < lowStockThreshold ? 'text-destructive' : 'text-foreground'}`}>
               {product.stock} <span className="text-[10px] font-bold inline-block ml-1">{stockUnit}</span>
            </p>
          </div>
          <div className="text-right">
             <p className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-bold">进货单价</p>
             <p className="font-bold text-foreground">
                {Number(product.costPrice || 0) > 0 ? (
                  <span className="text-base sm:text-lg font-number">¥{Number(product.costPrice).toLocaleString()}</span>
                ) : (
                  <span className="text-xs sm:text-sm text-foreground font-bold font-number">以实际为准</span>
                )}
             </p>
          </div>
        </div>

        {/* Mobile Actions Bar */}
        <div className="mt-4 flex sm:hidden items-center justify-end pt-3 border-t border-border/50">
            <div className="flex gap-4">
              {onEdit && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.(product);
                  }}
                  className="p-1 text-muted-foreground hover:text-primary transition-colors active:scale-95"
                  title="编辑"
                >
                  <Edit size={20} />
                </button>
              )}
              {onDelete && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(product.id, product.name);
                  }}
                  className="p-1 text-destructive hover:opacity-80 transition-opacity active:scale-95"
                  title="删除"
                >
                  <Trash2 size={20} />
                </button>
              )}
            </div>
        </div>
      </div>
      
      {/* Quick Actions Overlay (PC only) */}
      <div className="hidden sm:flex absolute top-3 right-3 flex-col gap-2 translate-x-0 opacity-100 lg:translate-x-10 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 transition-all duration-300">
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

    </div>
  );
}, (prev, next) => {
  // Precision check to minimize re-renders in huge lists
  return (
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.isSelected === next.isSelected &&
    prev.anySelected === next.anySelected &&
    prev.lowStockThreshold === next.lowStockThreshold &&
    prev.priority === next.priority &&
    prev.stockTitle === next.stockTitle &&
    prev.stockUnit === next.stockUnit &&
    prev.disableLowStockTone === next.disableLowStockTone &&
    prev.shopLabel === next.shopLabel &&
    prev.product.id === next.product.id &&
    prev.product.name === next.product.name &&
    prev.product.stock === next.product.stock &&
    prev.product.costPrice === next.product.costPrice &&
    prev.product.image === next.product.image &&
    prev.product.sku === next.product.sku &&
    prev.product.supplierId === next.product.supplierId &&
    prev.product.supplier?.name === next.product.supplier?.name &&
    prev.product.categoryId === next.product.categoryId &&
    prev.product.isDiscontinued === next.product.isDiscontinued &&
    prev.hideDiscontinuedState === next.hideDiscontinuedState
  );
});
