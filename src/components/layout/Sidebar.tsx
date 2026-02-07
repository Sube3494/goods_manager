"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Settings, PlusCircle, Layers, Truck, ShoppingCart, Camera, LogOut, LogIn, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import md5 from "blueimp-md5";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: "概览", href: "/", icon: LayoutDashboard, adminOnly: true },
  { name: "库存管理", href: "/goods", icon: Package, adminOnly: true },
  { name: "分类管理", href: "/categories", icon: Layers, adminOnly: true },
  { name: "供应商管理", href: "/suppliers", icon: Truck, adminOnly: true },
  { name: "采购管理", href: "/purchases", icon: ShoppingCart, adminOnly: true },
  { name: "入库登记", href: "/import", icon: PlusCircle, adminOnly: true },
  { name: "实物相册", href: "/gallery", icon: Camera },
  { name: "系统设置", href: "/settings", icon: Settings, adminOnly: true },
];

interface SidebarProps {
  onClose?: () => void;
  isOpen?: boolean;
}

export function Sidebar({ onClose, isOpen }: SidebarProps) {
  const pathname = usePathname();
  const { showToast } = useToast();
  const { user, isLoading } = useUser();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      await fetch("/api/auth/logout", { method: "POST" });
      showToast("已退出登录", "success");
      // Force hard refresh to clear state and re-run middleware/hooks
      window.location.href = "/gallery";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  if (isLoading) return null; // Or a skeleton
  if (pathname === "/login") return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <aside className={cn(
        "fixed left-4 top-4 z-50 h-[calc(100vh-2rem)] w-64 rounded-2xl glass border-border transition-all duration-300 lg:translate-x-0 outline-none",
        isOpen ? "translate-x-0" : "-translate-x-[120%]"
      )}>
        <div className="flex h-full flex-col px-4 py-8 relative">
          {/* Mobile Close Button */}
          <button 
            onClick={onClose}
            className="lg:hidden absolute right-4 top-4 p-2 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>

          <div className="mb-10 px-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-linear-to-br from-primary to-blue-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-primary-foreground font-bold text-sm">
                L
              </div>
              <div className="flex flex-col">
                  <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70">
                  PickNote
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest scale-90 origin-left">
                      PROFESSIONAL
                  </span>
              </div>
            </div>
          </div>
          
          <div className="flex-1 space-y-2 overflow-y-auto custom-scrollbar pr-1">
            {navItems.map((item) => {
              if (item.adminOnly && !user) return null;
              
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "relative group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-300 outline-none focus:outline-none focus:ring-0 focus-visible:ring-0",
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
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
            {user ? (
              <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer">
                <div className="relative h-9 w-9 rounded-full overflow-hidden border-2 border-white/20 shadow-sm">
                  <Image 
                      src={`https://cravatar.cn/avatar/${md5(user.email || "")}?d=mp`} 
                      alt="Current user"
                      fill
                      className="object-cover"
                  />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-bold text-foreground truncate max-w-[100px]">{user.name || "管理员"}</p>
                    <p className="text-xs text-muted-foreground">超级权限</p>
                </div>
                <button 
                    onClick={handleLogout}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-all"
                    title="退出登录"
                >
                    <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link href="/login" onClick={onClose} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="h-9 w-9 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <LogIn size={18} />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-bold text-foreground">未登录</p>
                    <p className="text-xs text-muted-foreground">点击登录管理员</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
