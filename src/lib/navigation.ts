import { Camera, Layers, Package, Settings, Users, LucideIcon } from "lucide-react";
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
  { name: "商品管理", href: "/goods", icon: Package, adminOnly: true, superAdminOnly: true, permission: "product:read", description: "新增商品并维护相册关联档案", section: "workspace" },
  { name: "分类管理", href: "/categories", icon: Layers, adminOnly: true, permission: "category:manage", description: "维护相册商品分类", section: "workspace" },
  { name: "实物相册", href: "/gallery", icon: Camera, permission: ["gallery:upload", "gallery:download", "gallery:share", "gallery:copy"], description: "商品实拍与公共素材", section: "workspace" },
  { name: "成员管理", href: "/admin/members", icon: Users, adminCapability: ["members:manage", "members:status", "whitelist:manage"], description: "管理成员账号与访问范围", section: "management" },
  { name: "系统设置", href: "/settings", icon: Settings, adminOnly: true, permission: ["settings:manage", "backup:manage", "data:transfer", "system:manage"], description: "配置上传、存储与相册系统参数", section: "management" },
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

