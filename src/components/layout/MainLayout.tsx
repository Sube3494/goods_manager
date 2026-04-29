"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { LogIn, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { MobileHeader } from "./MobileHeader";
import { PageGuard } from "./PageGuard";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { getVisibleNavItems } from "@/lib/navigation";
import { SessionUser } from "@/lib/permissions";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [canAnimate, setCanAnimate] = useState(false);

  const isLoginPage = pathname === "/login";
  const isSharePage = pathname?.startsWith("/media") || pathname?.startsWith("/brush-plans/share");
  const isWideCanvasPage = pathname?.startsWith("/distance-calc");
  const isFullScreenPage = isLoginPage || isSharePage;
  
  // Sidebar is functional for guests too (login link, gallery), so we reserve space for it on desktop
  const visibleItems = getVisibleNavItems(user as SessionUser | null);
  const showSidebar = !isFullScreenPage && !!user && visibleItems.length > 1;

  // Track initialization to prevent initial mount transition
  useEffect(() => {
    if (!isLoading) {
      // Small timeout to ensure the DOM has settled with initial padding before enabling transitions
      const timer = setTimeout(() => setCanAnimate(true), 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const width = showSidebar ? (isCollapsed ? "112px" : "288px") : "0px";
      document.documentElement.style.setProperty("--sidebar-width", width);
    }
  }, [isCollapsed, showSidebar]);

  // Disable number input scrolling globally, and block global right-click
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
        if (document.activeElement === target) {
          e.preventDefault();
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Allow right-click on specific elements if needed later, but globally prevent by default
      if (process.env.NODE_ENV !== 'development') {
        e.preventDefault();
      } else {
        // In development, still block it to test, unless holding Shift 
        if (!e.shiftKey) e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    document.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      window.removeEventListener('wheel', handleWheel);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const toggleCollapse = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem("sidebar-collapsed", String(newValue));
  };

    return (
    <ToastProvider>
        <div className="w-full min-h-dynamic-screen bg-transparent text-foreground relative flex font-sans overflow-x-hidden safe-x">
        {/* Ambient Background - Static blobs, no GPU hint needed */}
        <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/3 dark:bg-blue-600/2 rounded-full blur-2xl" />
            <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-500/3 dark:bg-purple-600/2 rounded-full blur-2xl" />
        </div>

        {showSidebar && (
          <Sidebar 
            isOpen={isSidebarOpen} 
            onClose={() => setIsSidebarOpen(false)} 
            isCollapsed={isCollapsed}
            onToggleCollapse={toggleCollapse}
          />
        )}
        
        <div className={cn(
            "flex-1 flex flex-col min-h-dynamic-screen relative z-10 w-full",
            canAnimate && "lg:transition-[padding] lg:duration-200 lg:ease-in-out",
            showSidebar ? (isCollapsed ? "lg:pl-28" : "lg:pl-72") : "pl-0"
        )}>
            {!isFullScreenPage && (
              <MobileHeader 
                isOpen={isSidebarOpen} 
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
                showMenu={showSidebar}
              />
            )}
            {!isFullScreenPage && (
                <header className="hidden lg:flex h-14 px-6 items-center justify-end gap-3">
                    <div className="flex items-center gap-3">
                        {!user && !isLoading && (
                            <Link 
                                href="/login"
                                className="flex items-center gap-2 px-4 h-9 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-sm font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm active:scale-95"
                            >
                                <LogIn size={16} />
                                登录
                            </Link>
                        )}
                        {user && !isLoading && !showSidebar && (
                            <button
                                onClick={() => setIsLogoutModalOpen(true)}
                                className="h-9 w-9 rounded-full text-red-500 hover:text-red-600 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-all bg-white dark:bg-white/5 border border-border dark:border-white/10"
                                title="退出登录"
                            >
                                <LogOut size={16} />
                            </button>
                        )}
                        <ThemeToggle className="h-9 w-9" />
                    </div>
                </header>
            )}
            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/login";
                }}
                title="退出登录"
                message="确定要退出当前账号吗？"
                confirmLabel="退出"
                cancelLabel="取消"
            />
            <main className={cn(
                "flex-1 w-full",
                !isFullScreenPage && (
                  isWideCanvasPage
                    ? "flex min-h-0 flex-col pt-2 px-0 pb-0 safe-bottom"
                    : "pt-4 px-4 sm:px-6 lg:px-10 pb-10 safe-bottom"
                ),
            )}>
                <div className={cn(
                    "animate-fade-in",
                    isWideCanvasPage ? "flex min-h-0 flex-1 flex-col" : "h-full",
                    !isFullScreenPage && !isWideCanvasPage && "mx-auto max-w-7xl"
                )}>
                    {isLoading && !isFullScreenPage ? (
                        <div className="fixed inset-0 z-100 flex flex-col items-center justify-center gap-4 bg-background">
                            <div className="relative">
                                <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-2 animate-pulse" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground font-medium animate-pulse tracking-wide">
                                正在准备 PickNote 空间...
                            </p>
                        </div>
                    ) : (
                        <PageGuard>
                            {children}
                        </PageGuard>
                    )}
                </div>
            </main>
        </div>
        </div>
    </ToastProvider>
  );
}
