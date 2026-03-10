import { LayoutDashboard, Package, Settings, PlusCircle, Layers, Truck, ShoppingCart, Camera, CheckCircle, Users, CreditCard, ArrowUpRight, ShieldAlert, LucideIcon, Store } from "lucide-react";
import { Permission } from "./permissions";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  permission?: Permission;
  public?: boolean;
}

export const navItems: NavItem[] = [
  { name: "概览", href: "/", icon: LayoutDashboard, adminOnly: true, permission: "product:read" },
  { name: "商品管理", href: "/goods", icon: Package, adminOnly: true, permission: "product:read" },
  { name: "分类管理", href: "/categories", icon: Layers, adminOnly: true, permission: "category:manage" },
  { name: "供应商管理", href: "/suppliers", icon: Truck, adminOnly: true, permission: "supplier:manage" },
  { name: "采购管理", href: "/purchases", icon: ShoppingCart, adminOnly: true, permission: "purchase:manage" },
  { name: "开店进货", href: "/setup-purchases", icon: Store, adminOnly: true, permission: "purchase:manage" },
  { name: "刷单管理", href: "/brush-orders", icon: CreditCard, adminOnly: true, permission: "brush:manage" },
  { name: "入库管理", href: "/inbound", icon: PlusCircle, adminOnly: true, permission: "inbound:manage" },
  { name: "出库管理", href: "/outbound", icon: ArrowUpRight, adminOnly: true, permission: "outbound:manage" },
  { name: "结算对账", href: "/settlement", icon: CreditCard, adminOnly: true, permission: "settlement:manage" },
  { name: "实物相册", href: "/gallery", icon: Camera, public: true },
  { name: "实拍审核", href: "/gallery/submissions", icon: CheckCircle, adminOnly: true, permission: "gallery:audit" },
  { name: "成员管理", href: "/admin/members", icon: Users, superAdminOnly: true },
  { name: "角色管理", href: "/admin/roles", icon: ShieldAlert, superAdminOnly: true },
  { name: "系统设置", href: "/settings", icon: Settings, adminOnly: true, permission: "system:manage" },
];

import { hasPermission, SessionUser } from "./permissions";

export function getVisibleNavItems(user: SessionUser | null) {
  return navItems.filter((item) => {
    if (item.superAdminOnly && user?.role !== "SUPER_ADMIN") return false;
    if (item.permission && !hasPermission(user, item.permission)) return false;
    // adminOnly items require at least 'USER' role
    if (item.adminOnly && !item.permission && !user) return false;
    return true;
  });
}

