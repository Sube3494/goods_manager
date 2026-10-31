import { StoreLocationMap } from "@/components/SetupPurchases/StoreLocationMap";
import { getAuthorizedUser } from "@/lib/auth";

export default async function StoreLocationPage() {
  const user = await getAuthorizedUser("setup_purchase:location");
  if (!user) return <p className="p-8 text-muted-foreground">暂无选址权限。</p>;
  return (
    <div className="flex h-[calc(100dvh-5rem)] w-full flex-col overflow-hidden rounded-3xl border border-black/8 dark:border-white/10 shadow-xs bg-card">
      <StoreLocationMap key={user.id} userId={user.id} />
    </div>
  );
}
