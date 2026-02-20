"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { navItems } from "@/lib/navigation";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { useMemo } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import Link from "next/link";

export function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useUser();

  const isAuthorized = useMemo(() => {
    if (isLoading) return null;
    
    // Auto-allow static verification files at root
    if (pathname.endsWith('.txt')) {
        return true;
    }

    // Check if the current path is in navItems and requires permission
    // Sort by path length descending to ensure the most specific match is found first
    const sortedNavItems = [...navItems].sort((a, b) => b.href.length - a.href.length);
    
    const currentNavItem = sortedNavItems.find(item => {
        if (item.href === "/") return pathname === "/";
        return pathname === item.href || pathname.startsWith(item.href + "/");
    });

    if (!currentNavItem) {
        // Specifically check if it's a dynamic submission detail page or sub-page of a protected route
        return true;
    }

    // Auth Check: Always allow if marked as public, otherwise requires valid user
    if (!user && !currentNavItem.public) {
        return false;
    }

    // Since our useUser hook now matches SessionUser or is compatible enough for hasPermission check
    const sessionUser = user as unknown as SessionUser;

    // Role Check
    if (currentNavItem.superAdminOnly && sessionUser.role !== "SUPER_ADMIN") {
        return false;
    }

    // Permission Check
    if (currentNavItem.permission && !hasPermission(sessionUser, currentNavItem.permission)) {
        return false;
    }

    return true;
  }, [pathname, user, isLoading]);

  if (isLoading || isAuthorized === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground italic">正在验证访问权限...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 rounded-3xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <ShieldAlert size={40} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">访问受限</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          抱歉，您的账号没有权限访问该页面。如果您认为这是一个错误，请联系系统管理员。
        </p>
        <div className="flex gap-4">
            <button 
                onClick={() => router.back()}
                className="px-6 h-11 rounded-full border border-border hover:bg-white/5 transition-all active:scale-95"
            >
                返回上页
            </button>
            <Link 
                href="/gallery"
                className="px-6 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-95"
            >
                回到首页
            </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
