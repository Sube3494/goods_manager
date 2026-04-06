"use client";

import { BareAmapTest } from "@/components/DistanceCalc/BareAmapTest";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";

export default function DistanceCalcDebugPage() {
  const { user, isLoading } = useUser();
  const canManageLogistics = hasPermission(
    user as SessionUser | null,
    "logistics:manage"
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="text-sm font-medium text-muted-foreground">
          核验访问权限中...
        </p>
      </div>
    );
  }

  if (!canManageLogistics) {
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10 text-red-500">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-2xl font-black text-foreground">访问权限受限</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          调货调试页也需要
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            logistics:manage
          </code>
          权限。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-6 font-bold text-primary-foreground"
        >
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-foreground">高德地图最小实验页</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          这里只保留地图容器和一个固定 marker，用来确认问题是在高德接入本身，还是在智能调货页的复杂布局里。
        </p>
      </div>
      <BareAmapTest />
    </div>
  );
}
