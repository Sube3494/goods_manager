import { JWTPayload } from "jose";

export type Permission = 
  | "product:read" | "product:create" | "product:update" | "product:delete"
  | "category:read" | "category:manage"
  | "supplier:read" | "supplier:manage"
  | "purchase:read" | "purchase:create"
  | "inbound:read" | "inbound:create"
  | "outbound:read" | "outbound:create"
  | "brush:read" | "brush:create"
  | "gallery:upload" | "gallery:delete" | "gallery:audit"
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
      { key: "category:read", label: "查看分类" },
      { key: "category:manage", label: "管理分类" },
    ]
  },
  {
    key: "suppliers",
    label: "供应商管理",
    children: [
      { key: "supplier:read", label: "查看供应商" },
      { key: "supplier:manage", label: "管理供应商" },
    ]
  },
  {
    key: "purchases",
    label: "采购管理",
    children: [
      { key: "purchase:read", label: "查看采购单" },
      { key: "purchase:create", label: "创建采购单" },
    ]
  },
  {
    key: "store_management",
    label: "库房管理",
    children: [
      { key: "inbound:read", label: "查看入库记录" },
      { key: "inbound:create", label: "创建入库单" },
      { key: "outbound:read", label: "查看出库记录" },
      { key: "outbound:create", label: "创建出库单" },
    ]
  },
  {
    key: "brush_orders",
    label: "刷单管理",
    children: [
      { key: "brush:read", label: "查看刷单" },
      { key: "brush:create", label: "创建刷单" },
    ]
  },
  {
    key: "gallery",
    label: "实物相册",
    children: [
      { key: "gallery:upload", label: "上传图片" },
      { key: "gallery:delete", label: "删除图片" },
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
  WAREHOUSE_ADMIN: {
    "product:read": true,
    "product:update": true,
    "inbound:read": true,
    "inbound:create": true,
    "outbound:read": true,
    "outbound:create": true,
    "gallery:upload": true,
  },
  PURCHASER: {
    "product:read": true,
    "purchase:read": true,
    "purchase:create": true,
    "supplier:read": true,
  },
  OPERATOR: {
    "product:read": true,
    "product:create": true,
    "product:update": true,
    "category:read": true,
    "category:manage": true,
    "gallery:upload": true,
    "gallery:delete": true,
  },
  ALBUM_VISITOR: {
    "product:read": true,
    "purchase:read": true,
    "purchase:create": true,
    "inbound:read": true,
    "inbound:create": true,
    "outbound:read": true,
    "outbound:create": true,
    "brush:read": true,
    "brush:create": true,
  },
  FULL_ACCESS: {
    "all": true
  }
};

export const TEMPLATE_LABELS: Record<string, string> = {
  WAREHOUSE_ADMIN: "仓库管理员",
  PURCHASER: "采购员",
  OPERATOR: "运营人员",
  ALBUM_VISITOR: "相册访客",
  FULL_ACCESS: "全功能访问"
};
