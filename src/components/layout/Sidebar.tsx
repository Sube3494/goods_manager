"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, LogIn } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/hooks/useUser";
import md5 from "blueimp-md5";

import { getVisibleNavItems, NavItem } from "@/lib/navigation";
import { hasPermission, SessionUser } from "@/lib/permissions";

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
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [activeIndicator, setActiveIndicator] = useState<{ top: number; left: number; width: number; height: number; opacity: number }>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const visibleNavItems = useMemo(
    () => getVisibleNavItems(user as SessionUser | null),
    [user]
  );
  const canManageSystem = hasPermission(user as SessionUser | null, "system:manage");
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const navSections = [
    { key: "workspace", label: "业务工作台" },
    { key: "management", label: "管理中心" },
  ] as const;
  const activeNavItem = useMemo(() => {
    return visibleNavItems
      .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;
  }, [pathname, visibleNavItems]);

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

  useEffect(() => {
    const updateIndicator = () => {
      const container = navContainerRef.current;
      if (!container) return;

      const activeItem = activeNavItem;
      if (!activeItem) {
        setActiveIndicator((prev) => ({ ...prev, opacity: 0 }));
        return;
      }

      const target = itemRefs.current[activeItem.href];
      if (!target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const nextIndicator = {
        top: targetRect.top - containerRect.top + container.scrollTop,
        left: targetRect.left - containerRect.left + container.scrollLeft,
        width: targetRect.width,
        height: targetRect.height,
        opacity: 1,
      };

      setActiveIndicator((prev) => {
        if (
          prev.top === nextIndicator.top &&
          prev.left === nextIndicator.left &&
          prev.width === nextIndicator.width &&
          prev.height === nextIndicator.height &&
          prev.opacity === nextIndicator.opacity
        ) {
          return prev;
        }
        return nextIndicator;
      });
    };

    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [activeNavItem, isCollapsed, visibleNavItems]);

  if (isLoading) return null; // Or a skeleton
  if (pathname === "/login") return null;

  return (
    <>
      {/* Mobile Backdrop - pure color, no blur for mobile perf */}
      <div 
        className={cn(
          "fixed inset-0 z-40 bg-background/70 lg:hidden transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <aside className={cn(
        "fixed left-4 top-4 z-50 h-[calc(100vh-2rem)] rounded-2xl glass border-border transition-[width,transform] duration-200 ease-in-out lg:translate-x-0 outline-none group/sidebar",
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
          {/* Logo Area - Also acts as a toggle (desktop). Contains mobile close button. */}
          <div 
            className={cn(
                "mb-8 px-2 flex items-center shrink-0 transition-all duration-300", 
                isCollapsed ? "justify-center" : "justify-between"
            )}
          >
            <div
              onClick={onToggleCollapse}
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 active:scale-95 transition-all duration-300"
              title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
            >
              <div className="h-9 w-9 shrink-0">
                <Image src="/picknote.png" alt="PickNote 图标" width={36} height={36} className="rounded-xl" />
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
          

          <div ref={navContainerRef} className="flex-1 space-y-3 overflow-y-auto no-scrollbar scroll-smooth relative">
            <motion.div
              className="pointer-events-none absolute rounded-xl bg-primary shadow-lg shadow-primary/20"
              animate={activeIndicator}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
              {navSections.map((section) => {
                const sectionItems = visibleNavItems.filter((item) => (item.section || "workspace") === section.key);
                if (sectionItems.length === 0) return null;

                return (
                  <div key={section.key} className="space-y-1.5">
                    {!isCollapsed && (
                      <div className="px-3 pt-2 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground/45">
                            {section.label}
                          </span>
                          <span className="h-px flex-1 bg-linear-to-r from-black/8 dark:from-white/10 to-transparent" />
                        </div>
                      </div>
                    )}

                    {sectionItems.map((item: NavItem) => {
                    const isActive = activeNavItem?.href === item.href;
                    return (
                      <Link
                        key={item.name}
                        ref={(node) => {
                          itemRefs.current[item.href] = node;
                        }}
                        href={item.href}
                        onClick={onClose}
                        title={isCollapsed ? item.name : undefined}
                        className={cn(
                          "relative z-10 group flex items-center rounded-xl transition-all duration-300 outline-none focus:outline-none",
                          isCollapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 h-10 mx-1 text-sm font-medium",
                          isActive
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "relative z-10 h-5 w-5 transition-colors shrink-0",
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
                                alt="当前用户头像"
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
                            <p className="text-[10px] text-muted-foreground/60 truncate">
                                {user.role === 'SUPER_ADMIN' ? '超级管理员' : (user.roleProfile?.name || '普通成员')}
                            </p>
                            {(canManageSystem || isSuperAdmin) && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className={cn(
                                  "inline-flex h-5 items-center rounded-full px-2 text-[9px] font-black tracking-[0.14em] uppercase",
                                  isSuperAdmin
                                    ? "bg-red-500/10 text-red-500"
                                    : "bg-primary/10 text-primary"
                                )}>
                                  {isSuperAdmin ? "Root" : "System"}
                                </span>
                              </div>
                            )}
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
