import { JWTPayload } from "jose";

export type Permission = 
  | "product:read" | "product:create" | "product:update" | "product:delete"
  | "category:manage"
  | "supplier:manage"
  | "purchase:manage"
  | "inbound:manage"
  | "outbound:manage"
  | "brush:manage"
  | "gallery:upload" | "gallery:download" | "gallery:share" | "gallery:copy" | "gallery:audit"
  | "settlement:manage"
  | "system:manage"
  | "all";

export interface SessionUser extends JWTPayload {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "USER";
  permissions?: Record<string, boolean> | unknown;
  roleProfile?: { permissions?: Record<string, boolean> | unknown } | null;
}

export const PERMISSION_TREE = [
  {
    key: "products",
    label: "商品管理",
    children: [
      { key: "product:read", label: "查看商品" },
      { key: "product:create", label: "创建商品" },
      { key: "product:update", label: "更新商品" },
      { key: "product:delete", label: "删除商品" },
    ]
  },
  {
    key: "categories",
    label: "分类管理",
    children: [
      { key: "category:manage", label: "分类管理" },
    ]
  },
  {
    key: "suppliers",
    label: "供应商管理",
    children: [
      { key: "supplier:manage", label: "供应商管理" },
    ]
  },
  {
    key: "purchases",
    label: "采购管理",
    children: [
      { key: "purchase:manage", label: "采购管理" },
    ]
  },
  {
    key: "inbound",
    label: "入库管理",
    children: [
      { key: "inbound:manage", label: "入库管理" },
    ]
  },
  {
    key: "outbound",
    label: "出库管理",
    children: [
      { key: "outbound:manage", label: "出库管理" },
    ]
  },
  {
    key: "brush_orders",
    label: "刷单管理",
    children: [
      { key: "brush:manage", label: "刷单管理" },
    ]
  },
  {
    key: "gallery",
    label: "实物相册",
    children: [
      { key: "gallery:upload", label: "上传媒体" },
      { key: "gallery:download", label: "下载媒体" },
      { key: "gallery:share", label: "分享相册" },
      { key: "gallery:copy", label: "复制链接" },
    ]
  },
  {
    key: "gallery_audit",
    label: "实拍审核",
    children: [
      { key: "gallery:audit", label: "审核权限" },
    ]
  },
  {
    key: "system",
    label: "系统设置",
    children: [
      { key: "system:manage", label: "系统管理" },
    ]
  },
  {
    key: "settlement",
    label: "财务结算",
    children: [
      { key: "settlement:manage", label: "结算管理" },
    ]
  }
];

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  
  // SUPER_ADMIN has all permissions
  if (user.role === "SUPER_ADMIN") return true;
  
  // 1. Check from dynamic RoleProfile (New System)
  const profilePerms = (user.roleProfile?.permissions as Record<string, boolean>) || {};
  if (profilePerms[permission] || profilePerms["all"]) return true;

  // 2. Check from explicit user permissions (Legacy/Override)
  const perms = (user.permissions as Record<string, boolean>) || {};
  return !!(perms[permission] || perms["all"]);
}
/**
 * Predefined permission templates for common roles
 */
export const ROLE_TEMPLATES: Record<string, Record<string, boolean>> = {
  BASIC_VISITOR: {
    "gallery:download": true,
    "gallery:share": true,
    "gallery:copy": true,
  }
};

export const TEMPLATE_LABELS: Record<string, string> = {
  BASIC_VISITOR: "基础访客",
};
