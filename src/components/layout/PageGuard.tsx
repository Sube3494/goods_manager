"use client";

import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/hooks/useUser";
import { navItems } from "@/lib/navigation";
import { canAccessPath, getDefaultAuthorizedPath, hasPermission, SessionUser } from "@/lib/permissions";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Home, Loader2, LogIn, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

export function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useUser();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const sessionUser = (user as unknown as SessionUser | null) ?? null;

  const isAuthorized = useMemo(() => {
    // 1. Instant allow for public entry points to prevent flickering while loading user session
    const isPublicPath =
      pathname === "/login" ||
      pathname === "/gallery" ||
      pathname === "/media" ||
      pathname.startsWith("/media/") ||
      pathname === "/brush-plans/share" ||
      pathname.startsWith("/brush-plans/share/");
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
    // Role Check
    if (currentNavItem.superAdminOnly && sessionUser?.role !== "SUPER_ADMIN") {
        return false;
    }

    // Permission Check
    if (currentNavItem.permission) {
        const permissions = Array.isArray(currentNavItem.permission)
          ? currentNavItem.permission
          : [currentNavItem.permission];
        if (!permissions.some((permission) => hasPermission(sessionUser, permission))) {
          return false;
        }
    }

    return true;
  }, [pathname, sessionUser, user, isLoading]);

  const currentNavItem = useMemo(() => {
    const sortedNavItems = [...navItems].sort((a, b) => b.href.length - a.href.length);
    return sortedNavItems.find(item => {
      if (item.href === "/") return pathname === "/";
      return pathname === item.href || pathname.startsWith(item.href + "/");
    });
  }, [pathname]);

  const isLoginRequired = !isLoading && !user && currentNavItem && !currentNavItem.public;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(pathname)}`;
  const fallbackHref = useMemo(
    () => getDefaultAuthorizedPath(sessionUser),
    [sessionUser]
  );

  useEffect(() => {
    if (isLoading || !sessionUser || isAuthorized !== false) return;

    if (pathname === "/" || !canAccessPath(sessionUser, pathname)) {
      const target = getDefaultAuthorizedPath(sessionUser);
      if (target !== pathname) {
        router.replace(target);
      }
    }
  }, [isAuthorized, isLoading, pathname, router, sessionUser]);

  if (isLoading || isAuthorized === null) {
    return null; // Let the parent layout (MainLayout) handle the global loader for better UX
  }

  if (!isLoginRequired && sessionUser && isAuthorized === false && pathname === "/") {
    return null;
  }

  if (!isAuthorized) {
    const pageName = currentNavItem?.name || "当前页面";

    return (
      <div className="flex min-h-[68dvh] items-center justify-center p-4 text-center animate-in fade-in zoom-in duration-500 sm:p-8">
        <div className="w-full max-w-xl rounded-[28px] border border-border/80 bg-white/75 p-6 shadow-2xl shadow-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 sm:p-8">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-background text-foreground shadow-sm dark:border-white/10">
            {isLoginRequired ? <LogIn size={30} /> : <ShieldAlert size={30} className="text-red-500" />}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {isLoginRequired ? "登录后继续" : "当前账号暂无权限"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
            {isLoginRequired
              ? `“${pageName}”需要登录后访问。登录成功后会自动回到这里。`
              : currentNavItem
              ? `当前账号尚未开通“${currentNavItem.name}”。${currentNavItem.description || "如需开通，请联系管理员。"}`
              : "当前账号尚未获得进入该区域的许可。"}
          </p>
          <p className="mx-auto mt-3 max-w-md rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-xs font-bold text-muted-foreground dark:border-white/10 dark:bg-black/10">
            需要开通账号或权限，请添加管理员微信 Sube3494 审核。
          </p>
        {user && (
          <p className="mx-auto mt-4 w-fit rounded-full border border-border/70 bg-background/60 px-4 py-2 text-sm text-muted-foreground">
            当前账号：{user.email}
          </p>
        )}
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            {isLoginRequired && (
              <Link
                href={loginHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-95"
              >
                <LogIn size={17} />
                去登录
              </Link>
            )}
            {user && (
              <button
                onClick={() => setIsLogoutModalOpen(true)}
                disabled={isLoggingOut}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background/70 px-6 font-bold transition-all hover:bg-black/5 active:scale-95 disabled:opacity-70 dark:hover:bg-white/5"
              >
                {isLoggingOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                切换账号
              </button>
            )}
            <button 
                onClick={() => router.back()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border px-6 font-bold transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5"
            >
                <ArrowLeft size={17} />
                返回上页
            </button>
            <Link 
                href={fallbackHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background/70 px-6 font-bold transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5"
            >
                <Home size={17} />
                回到可访问页面
            </Link>
        </div>
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
