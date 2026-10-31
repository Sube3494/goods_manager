import { getAuthorizedUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function PreparationLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthorizedUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "setup_purchase:manage")) {
    return <p className="p-8 text-muted-foreground">暂无开店筹备权限，请联系管理员。</p>;
  }
  return <>{children}</>;
}
