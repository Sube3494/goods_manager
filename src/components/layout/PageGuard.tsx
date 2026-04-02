"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { navItems } from "@/lib/navigation";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { useMemo, useState } from "react";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const isAuthorized = useMemo(() => {
    // 1. Instant allow for public entry points to prevent flickering while loading user session
    const publicPaths = ["/login", "/gallery", "/share", "/brush-plans/share"];
    const isPublicPath = publicPaths.some(p => pathname === p || pathname.startsWith(p + "/"));
    const isStaticFile = pathname.endsWith('.txt');

    if (isPublicPath || isStaticFile) {
        return true;
    }

    if (isLoading) return null;

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

  const currentNavItem = useMemo(() => {
    const sortedNavItems = [...navItems].sort((a, b) => b.href.length - a.href.length);
    return sortedNavItems.find(item => {
      if (item.href === "/") return pathname === "/";
      return pathname === item.href || pathname.startsWith(item.href + "/");
    });
  }, [pathname]);

  if (isLoading || isAuthorized === null) {
    return null; // Let the parent layout (MainLayout) handle the global loader for better UX
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="h-20 w-20 rounded-3xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
          <ShieldAlert size={40} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">访问受限</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          {currentNavItem
            ? `当前账号尚未获得“${currentNavItem.name}”的访问许可。${currentNavItem.description || "如果您认为这是一个错误，请联系管理员进行配置。"}`
            : "抱歉，您的账号尚未获得进入该区域的许可。如果您认为这是一个错误，请联系管理员进行配置。"}
        </p>
        {user && (
          <p className="mb-6 rounded-full border border-border/70 bg-background/60 px-4 py-2 text-sm text-muted-foreground">
            当前账号：{user.email}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-4">
            {user && (
              <button
                onClick={() => setIsLogoutModalOpen(true)}
                disabled={isLoggingOut}
                className="px-6 h-11 rounded-full border border-border bg-background/70 hover:bg-white/5 transition-all active:scale-95 inline-flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                切换账号
              </button>
            )}
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
        <ConfirmModal
          isOpen={isLogoutModalOpen}
          onClose={() => {
            if (!isLoggingOut) {
              setIsLogoutModalOpen(false);
            }
          }}
          onConfirm={async () => {
            setIsLoggingOut(true);
            try {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            } finally {
              setIsLoggingOut(false);
            }
          }}
          title="切换账号"
          message="当前账号没有访问权限，是否先退出后重新登录其他账号？"
          confirmLabel={isLoggingOut ? "退出中..." : "退出并登录"}
          cancelLabel="取消"
        />
      </div>
    );
  }

  return <>{children}</>;
}
