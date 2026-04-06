import { LayoutDashboard, Package, Settings, PlusCircle, Layers, Truck, ShoppingCart, Camera, Users, CreditCard, ArrowUpRight, ShieldAlert, LucideIcon, Store, PanelsTopLeft, Navigation2 } from "lucide-react";
import { AdminCapability, Permission, hasAdminAccess } from "./permissions";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  permission?: Permission | Permission[];
  adminCapability?: AdminCapability | AdminCapability[];
  public?: boolean;
  description?: string;
  section?: "workspace" | "management";
}

export const navItems: NavItem[] = [
  { name: "概览", href: "/", icon: LayoutDashboard, adminOnly: true, permission: "product:read", description: "仓储总览与快捷入口", section: "workspace" },
  { name: "商品管理", href: "/goods", icon: Package, adminOnly: true, permission: "product:read", description: "商品档案与库存查询", section: "workspace" },
  { name: "分类管理", href: "/categories", icon: Layers, adminOnly: true, permission: "category:manage", description: "维护商品分类结构", section: "workspace" },
  { name: "供应商管理", href: "/suppliers", icon: Truck, adminOnly: true, permission: "supplier:manage", description: "供应商资料与联络信息", section: "workspace" },
  { name: "采购管理", href: "/purchases", icon: ShoppingCart, adminOnly: true, permission: "purchase:manage", description: "日常采购与到货记录", section: "workspace" },
  { name: "开店进货", href: "/setup-purchases", icon: Store, adminOnly: true, permission: "setup_purchase:manage", description: "开店批次与商品准备", section: "workspace" },
  { name: "智能调货", href: "/distance-calc", icon: Navigation2, permission: "logistics:manage", description: "地图测距与最优配送方案", section: "workspace" },
  {
    name: "刷单中心",
    href: "/brush",
    icon: PanelsTopLeft,
    adminOnly: true,
    permission: "brush:manage",
    description: "整合刷单商品库、任务与订单",
    section: "workspace",
  },
  { name: "入库管理", href: "/inbound", icon: PlusCircle, adminOnly: true, permission: "inbound:manage", description: "入库登记与批量导入", section: "workspace" },
  { name: "出库管理", href: "/outbound", icon: ArrowUpRight, adminOnly: true, permission: "outbound:manage", description: "销售、领用与损耗出库", section: "workspace" },
  { name: "结算对账", href: "/settlement", icon: CreditCard, adminOnly: true, permission: "settlement:manage", description: "对账与结算记录", section: "workspace" },
  { name: "实物相册", href: "/gallery", icon: Camera, public: true, description: "商品实拍与公共素材", section: "workspace" },
  { name: "成员管理", href: "/admin/members", icon: Users, adminCapability: ["members:manage", "members:status", "whitelist:manage"], description: "成员、白名单与邀请控制", section: "management" },
  { name: "角色管理", href: "/admin/roles", icon: ShieldAlert, permission: "system:manage", description: "角色模板与权限矩阵", section: "management" },
  { name: "系统设置", href: "/settings", icon: Settings, adminOnly: true, permission: "system:manage", description: "系统参数、存储与备份", section: "management" },
];

import { hasPermission, SessionUser } from "./permissions";

export function getVisibleNavItems(user: SessionUser | null) {
  return navItems.filter((item) => {
    if (item.superAdminOnly && user?.role !== "SUPER_ADMIN") return false;
    if (item.permission) {
      const permissions = Array.isArray(item.permission) ? item.permission : [item.permission];
      if (!permissions.some((permission) => hasPermission(user, permission))) return false;
    }
    if (item.adminCapability) {
      const capabilities = Array.isArray(item.adminCapability) ? item.adminCapability : [item.adminCapability];
      if (!capabilities.some((capability) => hasAdminAccess(user, capability))) return false;
    }
    // adminOnly items require at least 'USER' role
    if (item.adminOnly && !item.permission && !user) return false;
    return true;
  });
}

