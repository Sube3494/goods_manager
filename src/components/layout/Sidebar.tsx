"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Settings, PlusCircle, Layers, Truck, ShoppingCart, Camera } from "lucide-react";

// ... (lines 6-30 remain the same, simplified for brevity in replacement context if needed, but I'll likely target blocks)

// Actually, let's target the exact lines or blocks.
// Start with import

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: "概览", href: "/", icon: LayoutDashboard },
  { name: "库存管理", href: "/goods", icon: Package },
  { name: "分类管理", href: "/categories", icon: Layers },
  { name: "供应商管理", href: "/suppliers", icon: Truck },
  { name: "采购管理", href: "/purchases", icon: ShoppingCart },
  { name: "入库登记", href: "/import", icon: PlusCircle },
  { name: "实物相册", href: "/gallery", icon: Camera },
  { name: "系统设置", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-4 top-4 z-40 h-[calc(100vh-2rem)] w-64 rounded-2xl glass border-border transition-transform">
      <div className="flex h-full flex-col px-4 py-8">
        <div className="mb-10 px-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-linear-to-br from-primary to-blue-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-primary-foreground font-bold text-sm">
              L
            </div>
            <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-foreground bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70">
                Luxe库存
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest scale-90 origin-left">
                    PROFESSIONAL
                </span>
            </div>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "relative group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "text-primary-foreground shadow-md shadow-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-primary z-[-1] rounded-xl"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <item.icon
                  className={cn(
                    "h-5 w-5 mr-3 transition-colors",
                    isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span className="relative z-10">{item.name}</span>
              </Link>
            );
          })}
        </div>
        
        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
             <div className="h-9 w-9 rounded-full bg-linear-to-tr from-purple-500 to-pink-500 border-2 border-white/20 shadow-sm"></div>
             <div>
                <p className="text-sm font-bold text-foreground">管理员</p>
                <p className="text-xs text-muted-foreground">超级权限</p>
             </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
