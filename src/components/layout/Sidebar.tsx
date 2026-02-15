"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, LogIn, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { useUser } from "@/hooks/useUser";
import md5 from "blueimp-md5";

import { navItems, NavItem } from "@/lib/navigation";
import { hasPermission, SessionUser } from "@/lib/permissions";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  onClose?: () => void;
  isOpen?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ onClose, isOpen, isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { showToast } = useToast();
  const { user, isLoading } = useUser();

  const handleLogout = async () => {
    try {
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
        "fixed left-4 top-4 z-50 h-[calc(100vh-2rem)] rounded-2xl glass border-border transition-all duration-300 lg:translate-x-0 outline-none group/sidebar",
        isCollapsed ? "w-20" : "w-64",
        isOpen ? "translate-x-0" : "-translate-x-[120%]"
      )}>
        {/* Edge Trigger - Stealthy interaction */}
        <button
          onClick={(e) => { e.preventDefault(); onToggleCollapse?.(); }}
          className="hidden lg:block absolute -right-1 top-0 bottom-0 w-3 cursor-pointer z-60 group/edge opacity-0 hover:opacity-100 transition-opacity"
          title={isCollapsed ? "展开" : "收起"}
        >
          <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-primary/40 group-hover/edge:bg-primary transition-all group-hover/edge:h-20" />
        </button>

        <div className="flex h-full flex-col p-4 relative">
          {/* Mobile Close Button */}
          <button 
            onClick={onClose}
            className="lg:hidden absolute right-4 top-4 p-2 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <X size={18} />
          </button>

          {/* Logo Area - Also acts as a toggle */}
          <div 
            onClick={onToggleCollapse}
            className={cn(
                "mb-8 px-2 flex items-center shrink-0 cursor-pointer transition-all duration-300 hover:opacity-80 active:scale-95", 
                isCollapsed ? "justify-center" : "justify-between"
            )}
            title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-linear-to-br from-primary to-blue-600 shadow-lg shadow-blue-500/30 flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
                P
              </div>
              {!isCollapsed && (
                <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col whitespace-nowrap"
                >
                    <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70">
                    PickNote
                    </span>
                </motion.div>
              )}
            </div>
          </div>
          

          <div className="flex-1 space-y-1.5 overflow-y-auto no-scrollbar scroll-smooth">
            {navItems.map((item: NavItem) => {
              // 1. Super Admin Only Check
              if (item.superAdminOnly && user?.role !== "SUPER_ADMIN") return null;
              
              // 2. Permission Check
              if (item.permission && !hasPermission(user as SessionUser | null, item.permission)) return null;

              // 3. Admin Only Check (fallback)
              if (item.adminOnly && !item.permission && user?.role !== "SUPER_ADMIN" && user?.role !== "USER") return null;

              
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onClose}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "relative group flex items-center rounded-xl transition-all duration-300 outline-none focus:outline-none",
                    isCollapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2.5 mx-1 text-sm font-medium",
                    isActive
                      ? "text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-primary z-[-1] rounded-xl"
                      transition={{ type: "spring", stiffness: 350, damping: 35 }}
                    />
                  )}
                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-colors shrink-0",
                      !isCollapsed && "mr-3",
                      isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {!isCollapsed && (
                    <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="relative z-10 whitespace-nowrap"
                    >
                        {item.name}
                    </motion.span>
                  )}
                </Link>
              );
            })}
          </div>
          
          <div className={cn("mt-auto pt-4 shrink-0")}>
            <div className={cn("pt-4 border-t border-white/10 flex items-center", isCollapsed ? "flex-col gap-4" : "gap-1")}>
                {user ? (
                <>
                    <Link 
                        href="/profile"
                        onClick={onClose}
                        title={isCollapsed ? "个人中心" : undefined}
                        className={cn(
                            "flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-all group relative min-w-0 flex-1",
                            isCollapsed ? "justify-center h-10 w-10" : "ml-1"
                        )}
                    >
                        <div className="relative h-8 w-8 rounded-full overflow-hidden border-2 border-white/20 shadow-sm shrink-0 group-hover:border-primary/50 transition-colors">
                            <Image 
                                src={`https://cravatar.cn/avatar/${md5(user.email || "")}?d=mp`} 
                                alt="Current user"
                                fill
                                sizes="32px"
                                className="object-cover"
                            />
                        </div>
                        {!isCollapsed && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex-1 flex flex-col overflow-hidden"
                        >
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                {user.name || user.email}
                            </p>
                            <p className="text-[10px] text-muted-foreground/60 truncate">{user.role === 'SUPER_ADMIN' ? '超级管理员' : (user.role === 'ADMIN' ? '工作区管理员' : '普通成员')}</p>
                        </motion.div>
                        )}
                    </Link>

                    <button 
                        onClick={(e) => { e.preventDefault(); handleLogout(); }}
                        title="退出登录"
                        className={cn(
                            "flex items-center justify-center transition-all duration-300 rounded-xl shrink-0 group/logout",
                            isCollapsed 
                                ? "h-10 w-10 text-red-400 hover:bg-red-500/10 hover:text-red-500" 
                                : "h-9 w-9 mr-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                        )}
                    >
                        <LogOut size={16} className="transition-transform group-hover/logout:scale-110" />
                    </button>
                </>
                ) : (
                <Link href="/login" onClick={onClose} title={isCollapsed ? "登录" : undefined} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group",
                    isCollapsed ? "justify-center p-0 h-10 w-10" : "mx-1"
                )}>
                    <div className={cn(
                    "h-8 w-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0",
                    isCollapsed ? "h-9 w-9" : ""
                    )}>
                    <LogIn size={!isCollapsed ? 18 : 20} />
                    </div>
                    {!isCollapsed && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex-1 overflow-hidden"
                    >
                        <p className="text-sm font-bold text-foreground">未登录</p>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">点击登录管理员</p>
                    </motion.div>
                    )}
                </Link>
                )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
