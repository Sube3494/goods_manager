"use client";

import { motion } from "framer-motion";
import { Edit, Package, Truck, Trash2, Camera, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Product } from "@/lib/types";
import { getCategoryName } from "@/lib/utils";

export function GoodsCard({ 
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
  const handleCardClick = () => {
    if (onToggleSelect) {
      onToggleSelect(product.id);
    }
  };
  return (
    <motion.div
      onClick={handleCardClick}
      className={`group relative flex flex-col overflow-hidden rounded-2xl glass-panel transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10 cursor-pointer ${
        isSelected ? 'ring-2 ring-primary shadow-lg shadow-primary/20 bg-primary/5' : ''
      }`}
    >
      {/* Image Container */}
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
      <div className="flex flex-1 flex-col p-5">
        <div className="flex-1">
          <h3 className="font-bold text-lg leading-tight text-foreground mb-4 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          
          <div className="flex flex-wrap items-center gap-2 mb-4">
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
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">库存</p>
            <p className={`text-sm font-bold mt-0.5 ${product.stock < lowStockThreshold ? 'text-destructive' : 'text-foreground'}`}>
               {product.stock} <span className="text-[10px] font-normal opacity-60">件</span>
            </p>
          </div>
          <div className="text-right">
             <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">单价 (CNY)</p>
             <p className="text-lg font-bold text-foreground">¥{product.price.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      {/* Quick Actions Overlay (Always hoverable, not hidden by mode) */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 translate-x-0 opacity-100 lg:translate-x-10 lg:opacity-0 lg:group-hover:translate-x-0 lg:group-hover:opacity-100 transition-all duration-300">
           <Link
              href={`/gallery?productId=${product.id}`}
              onClick={(e) => e.stopPropagation()}
              className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn flex items-center justify-center"
              title="查看实拍图库"
           >
             <Camera size={16} className="group-hover/btn:scale-110 transition-transform" />
           </Link>
           <button 
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(product);
              }}
              className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
           >
             <Edit size={16} className="group-hover/btn:scale-110 transition-transform" />
           </button>
           <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(product.id, product.name);
              }}
              className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-destructive hover:bg-destructive hover:text-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
           >
             <Trash2 size={16} className="group-hover/btn:scale-110 transition-transform" />
           </button>
        </div>

    </motion.div>
  );
}
