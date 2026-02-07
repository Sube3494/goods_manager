"use client";

import { motion } from "framer-motion";
import { Edit, Package, Truck, Trash2, Camera } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Product } from "@/lib/types";
import { INITIAL_SUPPLIERS } from "@/lib/mockData";
import { getCategoryName } from "@/lib/utils";

export function GoodsCard({ 
  product, 
  onEdit,
  onDelete
}: { 
  product: Product; 
  onEdit?: (product: Product) => void;
  onDelete?: (id: string, name: string) => void;
}) {
  return (
    <motion.div
      className="group relative flex flex-col overflow-hidden rounded-2xl glass-panel transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10"
    >
      {/* Image Container */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-secondary/30">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30 group-hover:text-primary/50 transition-colors">
            <Package size={32} strokeWidth={1.5} />
          </div>
        )}
        
        <div className="absolute top-3 left-3 bg-secondary/80 backdrop-blur-md border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground rounded-full shadow-sm">
          {getCategoryName(product.category)}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex-1">
          <h3 className="font-bold text-lg leading-tight text-foreground mb-1 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 mb-2 font-mono opacity-70">
             {product.sku ? product.sku : `REF__${product.id.slice(0, 6)}`}
          </p>
          
          {product.supplierId && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 w-fit px-2 py-1 rounded-md">
                <Truck size={12} />
                <span className="truncate max-w-[150px]">
                    {INITIAL_SUPPLIERS.find(s => s.id === product.supplierId)?.name || "Unknown Supplier"}
                </span>
              </div>
          )}
        </div>
        
        <div className="mt-2 flex items-center justify-between pt-4 border-t border-white/10">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">库存</p>
            <p className={`text-sm font-bold mt-0.5 ${product.stock < 10 ? 'text-destructive' : 'text-foreground'}`}>
               {product.stock} <span className="text-[10px] font-normal opacity-60">件</span>
            </p>
          </div>
          <div className="text-right">
             <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">单价 (CNY)</p>
             <p className="text-lg font-bold text-foreground">¥{product.price.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      {/* Quick Actions Overlay */}
      <div className="absolute top-3 right-3 flex flex-col gap-2 translate-x-10 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
         <Link
            href={`/gallery?productId=${product.id}`}
            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn flex items-center justify-center"
            title="查看实拍图库"
         >
           <Camera size={16} className="group-hover/btn:scale-110 transition-transform" />
         </Link>
         <button 
            onClick={() => onEdit?.(product)}
            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-zinc-800 dark:text-zinc-100 hover:text-primary p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
         >
           <Edit size={16} className="group-hover/btn:scale-110 transition-transform" />
         </button>
         <button 
            onClick={() => onDelete?.(product.id, product.name)}
            className="bg-white/90 dark:bg-zinc-800/90 backdrop-blur text-destructive hover:bg-destructive hover:text-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all border border-white/50 dark:border-white/10 group/btn"
         >
           <Trash2 size={16} className="group-hover/btn:scale-110 transition-transform" />
         </button>
      </div>

    </motion.div>
  );
}
