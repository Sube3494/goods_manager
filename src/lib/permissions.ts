import { JWTPayload } from "jose";

export type Permission = 
  | "product:read" | "product:create" | "product:update" | "product:delete"
  | "category:manage"
  | "supplier:manage"
  | "purchase:manage"
  | "setup_purchase:manage"
  | "inbound:manage"
  | "outbound:manage"
  | "brush:manage"
  | "gallery:upload" | "gallery:download" | "gallery:share" | "gallery:copy"
  | "settlement:manage"
  | "system:manage"
  | "all";

export interface SessionUser extends JWTPayload {
  id: string;
  email: string;
  role: "SUPER_ADMIN" | "USER";
  permissions?: Record<string, boolean> | unknown;
  roleProfile?: { 
    id?: string;
    name?: string;
    permissions?: Record<string, boolean> | unknown 
  } | null;
}

export type PermissionMap = Record<string, boolean>;
export type AdminCapability =
  | "roles:manage"
  | "members:manage"
  | "members:status"
  | "whitelist:manage";

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
    label: "日常采购",
    children: [
      { key: "purchase:manage", label: "日常采购管理" },
    ]
  },
  {
    key: "setup_purchases",
    label: "开店进货",
    children: [
      { key: "setup_purchase:manage", label: "开店进货管理" },
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
    key: "brush_center",
    label: "刷单中心",
    children: [
      { key: "brush:manage", label: "刷单中心" },
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

const BASIC_VISITOR_DEFAULTS: PermissionMap = {
  "gallery:download": true,
  "gallery:share": true,
  "gallery:copy": true,
};

export const ADMIN_ACCESS_MATRIX: Record<AdminCapability, {
  label: string;
  description: string;
  permission?: Permission;
  superAdminOnly?: boolean;
}> = {
  "roles:manage": {
    label: "角色模板管理",
    description: "管理角色模板与权限矩阵",
    permission: "system:manage",
  },
  "members:manage": {
    label: "成员管理",
    description: "编辑成员角色、账号和邀请关系",
    superAdminOnly: true,
  },
  "members:status": {
    label: "成员状态管理",
    description: "启用或禁用成员账号",
    superAdminOnly: true,
  },
  "whitelist:manage": {
    label: "白名单与邀请管理",
    description: "维护白名单、邀请链接和准入控制",
    superAdminOnly: true,
  },
};

export function normalizePermissionMap(source: unknown): PermissionMap {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.entries(source as Record<string, unknown>).reduce<PermissionMap>((acc, [key, value]) => {
    if (typeof value === "boolean") {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function getRoleProfilePermissions(user: SessionUser | null): PermissionMap {
  return normalizePermissionMap(user?.roleProfile?.permissions);
}

export function getUserPermissionOverrides(user: SessionUser | null): PermissionMap {
  return normalizePermissionMap(user?.permissions);
}

export function getEffectivePermissions(user: SessionUser | null): PermissionMap {
  if (!user) return {};
  if (user.role === "SUPER_ADMIN") return { all: true };

  const basePermissions = user.roleProfile?.name === "基础访客" ? BASIC_VISITOR_DEFAULTS : {};
  const profilePermissions = getRoleProfilePermissions(user);
  const userOverrides = getUserPermissionOverrides(user);

  // Merge order:
  // 1. Role defaults
  // 2. RoleProfile grants
  // 3. User-level overrides (true grants, false revokes)
  return {
    ...basePermissions,
    ...profilePermissions,
    ...userOverrides,
  };
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  
  // SUPER_ADMIN has all permissions
  if (user.role === "SUPER_ADMIN") return true;

  const effectivePermissions = getEffectivePermissions(user);
  return !!(effectivePermissions[permission] || effectivePermissions["all"]);
}

export function hasAdminAccess(user: SessionUser | null, capability: AdminCapability): boolean {
  if (!user) return false;

  const rule = ADMIN_ACCESS_MATRIX[capability];
  if (rule.superAdminOnly) {
    return user.role === "SUPER_ADMIN";
  }

  if (rule.permission) {
    return hasPermission(user, rule.permission);
  }

  return false;
}
/**
 * Predefined permission templates for common roles
 */
export const ROLE_TEMPLATES: Record<string, Record<string, boolean>> = {
  BASIC_VISITOR: BASIC_VISITOR_DEFAULTS
};

export const TEMPLATE_LABELS: Record<string, string> = {
  BASIC_VISITOR: "基础访客",
};
