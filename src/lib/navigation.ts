import { LayoutDashboard, Package, Settings, PlusCircle, Layers, Truck, ShoppingCart, Camera, CheckCircle, Users, CreditCard, ArrowUpRight, LucideIcon } from "lucide-react";
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
  { name: "概览", href: "/", icon: LayoutDashboard, adminOnly: true },
  { name: "商品管理", href: "/goods", icon: Package, adminOnly: true, permission: "product:read" },
  { name: "分类管理", href: "/categories", icon: Layers, adminOnly: true, permission: "category:read" },
  { name: "供应商管理", href: "/suppliers", icon: Truck, adminOnly: true, permission: "supplier:read" },
  { name: "采购管理", href: "/purchases", icon: ShoppingCart, adminOnly: true, permission: "purchase:read" },
  { name: "刷单管理", href: "/brush-orders", icon: CreditCard, adminOnly: true, permission: "brush:read" },
  { name: "入库管理", href: "/inbound", icon: PlusCircle, adminOnly: true, permission: "inbound:read" },
  { name: "出库管理", href: "/outbound", icon: ArrowUpRight, adminOnly: true, permission: "outbound:read" },
  { name: "实物相册", href: "/gallery", icon: Camera, public: true },
  { name: "实拍审核", href: "/gallery/submissions", icon: CheckCircle, adminOnly: true, permission: "gallery:audit" },
  { name: "成员管理", href: "/admin/members", icon: Users, superAdminOnly: true },
  { name: "系统设置", href: "/settings", icon: Settings, adminOnly: true, permission: "system:manage" },
];
