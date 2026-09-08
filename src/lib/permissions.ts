import { JWTPayload } from "jose";

export type Permission = 
  | "dashboard:read"
  | "product:read" | "product:create" | "product:update" | "product:delete"
  | "category:manage"
  | "supplier:manage"
  | "order:manage"
  | "purchase:manage"
  | "setup_purchase:manage"
  | "inbound:manage"
  | "outbound:manage"
  | "brush:manage"
  | "brush:simulate"
  | "gallery:upload" | "gallery:download" | "gallery:share" | "gallery:copy"
  | "settlement:manage"
  | "operating-costs:manage"
  | "logistics:manage"
  | "shelf_life:read" | "shelf_life:manage"
  | "members:read" | "members:manage" | "members:status" | "whitelist:manage"
  | "roles:manage"
  | "settings:manage"
  | "backup:manage"
  | "data:transfer"
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
  | "members:read"
  | "roles:manage"
  | "members:manage"
  | "members:status"
  | "whitelist:manage";

export const PERMISSION_TREE = [
  {
    key: "dashboard",
    label: "概述看板",
    children: [
      { key: "dashboard:read", label: "查看概述" },
    ]
  },
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
    key: "orders",
    label: "订单管理",
    children: [
      { key: "order:manage", label: "订单管理" },
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
      { key: "brush:manage", label: "刷单中心管理" },
      { key: "brush:simulate", label: "刷单模拟显示" },
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
    key: "settlement",
    label: "财务结算",
    children: [
      { key: "settlement:manage", label: "结算管理" },
      { key: "operating-costs:manage", label: "经营成本管理" },
    ]
  },
  {
    key: "logistics",
    label: "智能调货",
    children: [
      { key: "logistics:manage", label: "调货与网点管理" },
    ]
  },
  {
    key: "shelf_life",
    label: "保质期管理",
    children: [
      { key: "shelf_life:read", label: "查看保质期台账" },
      { key: "shelf_life:manage", label: "调整/核销库存" },
    ]
  },
  {
    key: "admin_system",
    label: "后台管理",
    children: [
      { key: "members:read", label: "查看成员管理页" },
      { key: "members:manage", label: "编辑成员资料/角色" },
      { key: "members:status", label: "启用/禁用成员" },
      { key: "whitelist:manage", label: "白名单与邀请管理" },
      { key: "roles:manage", label: "角色模板管理" },
      { key: "settings:manage", label: "系统设置" },
      { key: "backup:manage", label: "备份与恢复" },
      { key: "data:transfer", label: "数据导入导出" },
    ]
  }
];

export type PagePermissionItem = {
  key: Permission;
  label: string;
  description?: string;
};

export type PagePermissionNode = {
  key: string;
  label: string;
  description: string;
  accessKey: Permission;
  actions: PagePermissionItem[];
};

export type PagePermissionGroup = {
  key: string;
  label: string;
  description: string;
  pages: PagePermissionNode[];
};

export const PAGE_PERMISSION_TREE: PagePermissionGroup[] = [
  {
    key: "workspace",
    label: "业务工作台",
    description: "日常库存、订单、采购与业务处理页面",
    pages: [
      {
        key: "dashboard",
        label: "概览",
        description: "仓储总览与快捷入口",
        accessKey: "dashboard:read",
        actions: [],
      },
      {
        key: "products",
        label: "商品管理",
        description: "商品档案、库存查询和商品维护",
        accessKey: "product:read",
        actions: [
          { key: "product:create", label: "创建商品" },
          { key: "product:update", label: "更新商品" },
          { key: "product:delete", label: "删除商品" },
        ],
      },
      {
        key: "shop_goods",
        label: "店铺商品",
        description: "按店铺管理经营商品清单",
        accessKey: "product:read",
        actions: [],
      },
      {
        key: "categories",
        label: "分类管理",
        description: "维护商品分类结构",
        accessKey: "category:manage",
        actions: [],
      },
      {
        key: "suppliers",
        label: "供应商管理",
        description: "维护供应商资料与联络信息",
        accessKey: "supplier:manage",
        actions: [],
      },
      {
        key: "orders",
        label: "订单管理",
        description: "查看订单并处理配送动作",
        accessKey: "order:manage",
        actions: [],
      },
      {
        key: "brush_center",
        label: "刷单中心",
        description: "刷单商品库、任务与订单",
        accessKey: "brush:manage",
        actions: [
          { key: "brush:simulate", label: "刷单模拟显示" },
        ],
      },
      {
        key: "purchases",
        label: "采购管理",
        description: "日常采购与到货记录",
        accessKey: "purchase:manage",
        actions: [],
      },
      {
        key: "setup_purchases",
        label: "开店进货",
        description: "开店批次与商品准备",
        accessKey: "setup_purchase:manage",
        actions: [],
      },
      {
        key: "inbound",
        label: "入库管理",
        description: "入库登记与批量导入",
        accessKey: "inbound:manage",
        actions: [],
      },
      {
        key: "outbound",
        label: "出库管理",
        description: "销售、领用与损耗出库",
        accessKey: "outbound:manage",
        actions: [],
      },
      {
        key: "shelf_life",
        label: "保质期管理",
        description: "批次台账与临期预警",
        accessKey: "shelf_life:read",
        actions: [
          { key: "shelf_life:manage", label: "调整/核销库存" },
        ],
      },
      {
        key: "gallery",
        label: "实物相册",
        description: "商品实拍与公共素材",
        accessKey: "gallery:share",
        actions: [
          { key: "gallery:upload", label: "上传媒体" },
          { key: "gallery:download", label: "下载媒体" },
          { key: "gallery:copy", label: "复制链接" },
        ],
      },
      {
        key: "door_locks",
        label: "门锁管理",
        description: "配置 TTLock 并管理门锁远程控制",
        accessKey: "settings:manage",
        actions: [],
      },
    ],
  },
  {
    key: "finance_delivery",
    label: "财务与配送",
    description: "结算、成本和配送相关页面",
    pages: [
      {
        key: "settlement",
        label: "结算对账",
        description: "对账与结算记录",
        accessKey: "settlement:manage",
        actions: [],
      },
      {
        key: "operating_costs",
        label: "经营成本",
        description: "房租、人工、水电物业等经营成本",
        accessKey: "operating-costs:manage",
        actions: [],
      },
      {
        key: "logistics",
        label: "智能调货",
        description: "智能调货、地图测距和网点管理",
        accessKey: "logistics:manage",
        actions: [],
      },
    ],
  },
  {
    key: "admin_system",
    label: "后台管理",
    description: "成员、角色、系统设置和数据维护",
    pages: [
      {
        key: "members",
        label: "成员管理",
        description: "成员、白名单与邀请控制",
        accessKey: "members:read",
        actions: [
          { key: "members:manage", label: "编辑成员资料/角色" },
          { key: "members:status", label: "启用/禁用成员" },
          { key: "whitelist:manage", label: "白名单与邀请管理" },
        ],
      },
      {
        key: "roles",
        label: "角色管理",
        description: "角色模板与权限矩阵",
        accessKey: "roles:manage",
        actions: [],
      },
      {
        key: "settings",
        label: "系统设置",
        description: "系统参数与存储配置",
        accessKey: "settings:manage",
        actions: [],
      },
      {
        key: "backup",
        label: "备份与恢复",
        description: "系统备份、恢复和备份测试",
        accessKey: "backup:manage",
        actions: [],
      },
      {
        key: "data_transfer",
        label: "数据导入导出",
        description: "系统级数据迁移和导出",
        accessKey: "data:transfer",
        actions: [],
      },
    ],
  },
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
  "members:read": {
    label: "查看成员管理页",
    description: "查看成员、白名单与邀请信息",
    permission: "members:read",
  },
  "roles:manage": {
    label: "角色模板管理",
    description: "管理角色模板与权限矩阵",
    permission: "roles:manage",
  },
  "members:manage": {
    label: "成员管理",
    description: "编辑成员角色、账号和邀请关系",
    permission: "members:manage",
  },
  "members:status": {
    label: "成员状态管理",
    description: "启用或禁用成员账号",
    permission: "members:status",
  },
  "whitelist:manage": {
    label: "白名单与邀请管理",
    description: "维护白名单、邀请链接和准入控制",
    permission: "whitelist:manage",
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

const PERMISSION_FALLBACKS: Partial<Record<Permission, Permission[]>> = {
  "dashboard:read": ["product:read", "logistics:manage", "purchase:manage", "brush:manage", "inbound:manage", "outbound:manage", "settlement:manage"],
  "order:manage": ["purchase:manage", "outbound:manage", "brush:manage"],
  "roles:manage": ["system:manage"],
  "settings:manage": ["system:manage"],
  "backup:manage": ["system:manage"],
  "data:transfer": ["system:manage"],
  "members:read": ["members:manage", "members:status", "whitelist:manage", "system:manage"],
  "members:manage": ["system:manage"],
  "members:status": ["system:manage"],
  "whitelist:manage": ["system:manage"],
};

/**
 * Check if a user has a specific permission
 */
export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  
  // SUPER_ADMIN has all permissions
  if (user.role === "SUPER_ADMIN") return true;

  const effectivePermissions = getEffectivePermissions(user);
  if (effectivePermissions[permission] || effectivePermissions["all"]) {
    return true;
  }

  const fallbacks = PERMISSION_FALLBACKS[permission];
  if (!fallbacks || fallbacks.length === 0) {
    return false;
  }

  return fallbacks.some((fallbackPermission) => !!effectivePermissions[fallbackPermission]);
}

export function hasDirectPermission(user: SessionUser | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "SUPER_ADMIN") return true;

  const effectivePermissions = getEffectivePermissions(user);
  return !!(effectivePermissions[permission] || effectivePermissions["all"]);
}

export function canAccessDashboardPage(user: SessionUser | null): boolean {
  return hasDirectPermission(user, "dashboard:read");
}

type RouteAccessRule = {
  href: string;
  superAdminOnly?: boolean;
  permission?: Permission | Permission[];
  adminCapability?: AdminCapability | AdminCapability[];
};

const DEFAULT_ROUTE_RULES: RouteAccessRule[] = [
  { href: "/", permission: "dashboard:read" },
  { href: "/goods", superAdminOnly: true, permission: "product:read" },
  { href: "/shop-goods", permission: "product:read" },
  { href: "/categories", permission: "category:manage" },
  { href: "/suppliers", permission: "supplier:manage" },
  { href: "/orders", permission: "order:manage" },
  { href: "/purchases", permission: "purchase:manage" },
  { href: "/setup-purchases", permission: "setup_purchase:manage" },
  { href: "/distance-calc", permission: "logistics:manage" },
  { href: "/brush", permission: "brush:manage" },
  { href: "/inbound", permission: "inbound:manage" },
  { href: "/outbound", permission: "outbound:manage" },
  { href: "/settlement", permission: "settlement:manage" },
  { href: "/operating-costs", permission: "operating-costs:manage" },
  { href: "/door-locks", permission: "settings:manage" },
  { href: "/shelf-life", permission: "shelf_life:read" },
  { href: "/gallery", permission: ["gallery:upload", "gallery:download", "gallery:share", "gallery:copy"] },
  { href: "/admin/members", permission: "members:read" },
  { href: "/admin/roles", adminCapability: "roles:manage" },
  { href: "/settings", permission: ["settings:manage", "backup:manage", "data:transfer", "system:manage"] },
];

function matchesPath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function canAccessRoute(user: SessionUser | null, rule: RouteAccessRule): boolean {
  if (!user) return false;
  if (rule.href === "/") return canAccessDashboardPage(user);

  if (rule.superAdminOnly && user.role !== "SUPER_ADMIN") {
    return false;
  }

  if (rule.permission) {
    const permissions = Array.isArray(rule.permission) ? rule.permission : [rule.permission];
    if (!permissions.some((permission) => hasPermission(user, permission))) {
      return false;
    }
  }

  if (rule.adminCapability) {
    const capabilities = Array.isArray(rule.adminCapability) ? rule.adminCapability : [rule.adminCapability];
    if (!capabilities.some((capability) => hasAdminAccess(user, capability))) {
      return false;
    }
  }

  return true;
}

export function canAccessPath(user: SessionUser | null, pathname: string): boolean {
  const normalizedPath = pathname.trim();
  if (!normalizedPath.startsWith("/")) return false;

  const publicPaths = ["/gallery", "/media", "/brush-plans/share"];
  if (publicPaths.some((path) => matchesPath(normalizedPath, path))) {
    return true;
  }

  const matchedRule = DEFAULT_ROUTE_RULES.find((rule) => matchesPath(normalizedPath, rule.href));
  if (!matchedRule) {
    return !!user;
  }

  return canAccessRoute(user, matchedRule);
}

export function getDefaultAuthorizedPath(user: SessionUser | null): string {
  if (!user) return "/gallery";

  const firstAccessibleRoute = DEFAULT_ROUTE_RULES.find((rule) => canAccessRoute(user, rule));
  return firstAccessibleRoute?.href ?? "/gallery";
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
  BASIC_VISITOR: BASIC_VISITOR_DEFAULTS,
};

export const TEMPLATE_LABELS: Record<string, string> = {
  BASIC_VISITOR: "基础访客",
};
