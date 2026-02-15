"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ToastProvider } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useUser } from "@/hooks/useUser";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { MobileHeader } from "./MobileHeader";
import { PageGuard } from "./PageGuard";

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

  const toggleCollapse = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem("sidebar-collapsed", String(newValue));
  };
  
  const isLoginPage = pathname === "/login";
  // Sidebar is functional for guests too (login link, gallery), so we reserve space for it on desktop
  const showSidebar = !isLoginPage && !!user;

    return (
    <ToastProvider>
        <div className="w-full min-h-screen bg-transparent text-foreground relative flex font-sans overflow-hidden">
        {/* Ambient Background Mesh - Animated Blobs */}
        <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
            {/* Subtle Ambient Light - Clean & Professional */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-400/5 dark:bg-blue-600/5 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-400/5 dark:bg-purple-600/5 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
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
            "flex-1 flex flex-col min-h-screen transition-all duration-500 ease-in-out relative z-10 w-full",
            showSidebar ? (isCollapsed ? "lg:pl-28" : "lg:pl-72") : "pl-0"
        )}>
            {!isLoginPage && (
              <MobileHeader 
                isOpen={isSidebarOpen} 
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} 
                showMenu={!!user}
              />
            )}
            {!isLoginPage && (
                <header className="hidden lg:flex sticky top-0 z-50 h-20 px-10 items-center justify-end gap-4">
                    {!user && !isLoading && (
                        <Link 
                            href="/login"
                            className="flex items-center gap-2 px-5 h-10 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 text-sm font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-sm active:scale-95"
                        >
                            <LogIn size={18} />
                            管理员登录
                        </Link>
                    )}
                    <ThemeToggle />
                </header>
            )}            
            <main className={cn(
                "flex-1 w-full",
                !isLoginPage && (pathname.includes("/gallery") ? "pb-10 pt-16 lg:pt-0" : "px-4 sm:px-6 lg:px-10 pb-10 pt-16 lg:pt-0")
            )}>
                <div className={cn(
                    "h-full animate-fade-in",
                    !isLoginPage && (pathname.includes("/gallery") ? "w-full max-w-none px-4 sm:px-6 lg:px-10" : "mx-auto max-w-7xl")
                )}>
                    <PageGuard>
                        {children}
                    </PageGuard>
                </div>
            </main>
        </div>
        </div>
    </ToastProvider>
  );
}
