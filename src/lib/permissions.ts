import { JWTPayload } from "jose";

export type Permission = 
  | "dashboard:read"
  | "product:read" | "product:create" | "product:update" | "product:delete" | "product:import" | "product:export" | "shop_product:manage"
  | "category:manage" | "category:create" | "category:update" | "category:delete"
  | "supplier:manage" | "supplier:create" | "supplier:update" | "supplier:delete"
  | "order:manage" | "order:sync" | "order:delivery" | "order:match" | "order:cost" | "order:promotion"
  | "purchase:manage" | "purchase:create" | "purchase:update" | "purchase:delete" | "purchase:inbound" | "purchase:export"
  | "setup_purchase:manage" | "setup_purchase:create" | "setup_purchase:update" | "setup_purchase:delete" | "setup_purchase:inbound"
  | "inbound:manage" | "inbound:create" | "inbound:delete" | "inbound:export"
  | "outbound:manage" | "outbound:create" | "outbound:delete" | "outbound:analytics"
  | "brush:manage" | "brush:products" | "brush:plans" | "brush:orders"
  | "brush:simulate"
  | "gallery:upload" | "gallery:download" | "gallery:share" | "gallery:copy"
  | "settlement:manage" | "settlement:confirm" | "settlement:export"
  | "operating-costs:manage" | "operating-costs:update"
  | "logistics:manage" | "logistics:route" | "logistics:stores"
  | "shelf_life:read" | "shelf_life:manage"
  | "door-locks:manage" | "door-locks:unlock" | "door-locks:password" | "door-locks:sync"
  | "members:read" | "members:manage" | "members:status" | "members:orders" | "members:libraries" | "whitelist:manage"
  | "roles:manage" | "roles:create" | "roles:update" | "roles:delete"
  | "settings:manage" | "settings:general" | "settings:storage"
  | "backup:manage" | "backup:create" | "backup:restore" | "backup:delete"
  | "data:transfer" | "data:import" | "data:export"
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
  | "members:orders"
  | "members:libraries"
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
      { key: "product:import", label: "导入商品" },
      { key: "product:export", label: "导出商品" },
      { key: "shop_product:manage", label: "店铺商品管理" },
    ]
  },
  {
    key: "categories",
    label: "分类管理",
    children: [
      { key: "category:manage", label: "分类管理" },
      { key: "category:create", label: "创建分类" },
      { key: "category:update", label: "编辑分类" },
      { key: "category:delete", label: "删除分类" },
    ]
  },
  {
    key: "suppliers",
    label: "供应商管理",
    children: [
      { key: "supplier:manage", label: "供应商管理" },
      { key: "supplier:create", label: "创建供应商" },
      { key: "supplier:update", label: "编辑供应商" },
      { key: "supplier:delete", label: "删除供应商" },
    ]
  },
  {
    key: "orders",
    label: "订单管理",
    children: [
      { key: "order:manage", label: "订单管理" },
      { key: "order:sync", label: "同步订单" },
      { key: "order:delivery", label: "配送操作" },
      { key: "order:match", label: "商品匹配" },
      { key: "order:cost", label: "成本补录" },
      { key: "order:promotion", label: "推广费维护" },
    ]
  },
  {
    key: "purchases",
    label: "日常采购",
    children: [
      { key: "purchase:manage", label: "日常采购管理" },
      { key: "purchase:create", label: "创建采购单" },
      { key: "purchase:update", label: "编辑采购单" },
      { key: "purchase:delete", label: "删除采购单" },
      { key: "purchase:inbound", label: "采购入库" },
      { key: "purchase:export", label: "导出采购单" },
    ]
  },
  {
    key: "setup_purchases",
    label: "开店进货",
    children: [
      { key: "setup_purchase:manage", label: "开店进货管理" },
      { key: "setup_purchase:create", label: "创建开店批次" },
      { key: "setup_purchase:update", label: "编辑开店批次" },
      { key: "setup_purchase:delete", label: "删除开店批次" },
      { key: "setup_purchase:inbound", label: "开店批次入库" },
    ]
  },
  {
    key: "inbound",
    label: "入库管理",
    children: [
      { key: "inbound:manage", label: "入库管理" },
      { key: "inbound:create", label: "新建入库" },
      { key: "inbound:delete", label: "删除入库记录" },
      { key: "inbound:export", label: "导出入库记录" },
    ]
  },
  {
    key: "outbound",
    label: "出库管理",
    children: [
      { key: "outbound:manage", label: "出库管理" },
      { key: "outbound:create", label: "新建出库" },
      { key: "outbound:delete", label: "删除出库记录" },
      { key: "outbound:analytics", label: "查看出库分析" },
    ]
  },
  {
    key: "brush_center",
    label: "刷单中心",
    children: [
      { key: "brush:manage", label: "刷单中心管理" },
      { key: "brush:products", label: "刷单商品管理" },
      { key: "brush:plans", label: "刷单计划管理" },
      { key: "brush:orders", label: "刷单订单管理" },
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
      { key: "settlement:confirm", label: "确认结算" },
      { key: "settlement:export", label: "导出对账" },
      { key: "operating-costs:manage", label: "经营成本管理" },
      { key: "operating-costs:update", label: "编辑成本参数" },
    ]
  },
  {
    key: "logistics",
    label: "智能调货",
    children: [
      { key: "logistics:manage", label: "调货与网点管理" },
      { key: "logistics:route", label: "计算配送路线" },
      { key: "logistics:stores", label: "维护配送网点" },
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
      { key: "members:orders", label: "查看成员麦芽田数据" },
      { key: "members:libraries", label: "商品库授权" },
      { key: "whitelist:manage", label: "白名单与邀请管理" },
      { key: "roles:manage", label: "角色模板管理" },
      { key: "roles:create", label: "创建角色" },
      { key: "roles:update", label: "编辑角色权限" },
      { key: "roles:delete", label: "删除角色" },
      { key: "settings:manage", label: "系统设置" },
      { key: "settings:general", label: "常规设置" },
      { key: "settings:storage", label: "存储设置" },
      { key: "door-locks:manage", label: "门锁管理" },
      { key: "door-locks:unlock", label: "远程开锁" },
      { key: "door-locks:password", label: "离线密码下发" },
      { key: "door-locks:sync", label: "同步门锁状态" },
      { key: "backup:manage", label: "备份与恢复" },
      { key: "backup:create", label: "创建备份" },
      { key: "backup:restore", label: "恢复备份" },
      { key: "backup:delete", label: "删除备份" },
      { key: "data:transfer", label: "数据导入导出" },
      { key: "data:import", label: "导入数据" },
      { key: "data:export", label: "导出数据" },
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
        actions: [
          { key: "shop_product:manage", label: "维护店铺商品" },
          { key: "product:import", label: "导入店铺商品" },
          { key: "product:export", label: "导出店铺商品" },
        ],
      },
      {
        key: "categories",
        label: "分类管理",
        description: "维护商品分类结构",
        accessKey: "category:manage",
        actions: [
          { key: "category:create", label: "创建分类" },
          { key: "category:update", label: "编辑分类" },
          { key: "category:delete", label: "删除分类" },
        ],
      },
      {
        key: "suppliers",
        label: "供应商管理",
        description: "维护供应商资料与联络信息",
        accessKey: "supplier:manage",
        actions: [
          { key: "supplier:create", label: "创建供应商" },
          { key: "supplier:update", label: "编辑供应商" },
          { key: "supplier:delete", label: "删除供应商" },
        ],
      },
      {
        key: "orders",
        label: "订单管理",
        description: "查看订单并处理配送动作",
        accessKey: "order:manage",
        actions: [
          { key: "order:sync", label: "同步订单" },
          { key: "order:delivery", label: "配送与履约操作" },
          { key: "order:match", label: "订单商品匹配" },
          { key: "order:cost", label: "订单成本补录" },
          { key: "order:promotion", label: "推广费维护" },
        ],
      },
      {
        key: "brush_center",
        label: "刷单中心",
        description: "刷单商品库、任务与订单",
        accessKey: "brush:manage",
        actions: [
          { key: "brush:products", label: "刷单商品管理" },
          { key: "brush:plans", label: "刷单计划管理" },
          { key: "brush:orders", label: "刷单订单管理" },
          { key: "brush:simulate", label: "刷单模拟显示" },
        ],
      },
      {
        key: "purchases",
        label: "采购管理",
        description: "日常采购与到货记录",
        accessKey: "purchase:manage",
        actions: [
          { key: "purchase:create", label: "创建采购单" },
          { key: "purchase:update", label: "编辑采购单" },
          { key: "purchase:delete", label: "删除采购单" },
          { key: "purchase:inbound", label: "采购入库" },
          { key: "purchase:export", label: "导出采购单" },
        ],
      },
      {
        key: "setup_purchases",
        label: "开店进货",
        description: "开店批次与商品准备",
        accessKey: "setup_purchase:manage",
        actions: [
          { key: "setup_purchase:create", label: "创建开店批次" },
          { key: "setup_purchase:update", label: "编辑开店批次" },
          { key: "setup_purchase:delete", label: "删除开店批次" },
          { key: "setup_purchase:inbound", label: "开店批次入库" },
        ],
      },
      {
        key: "inbound",
        label: "入库管理",
        description: "入库登记与批量导入",
        accessKey: "inbound:manage",
        actions: [
          { key: "inbound:create", label: "新建入库" },
          { key: "inbound:delete", label: "删除入库记录" },
          { key: "inbound:export", label: "导出入库记录" },
        ],
      },
      {
        key: "outbound",
        label: "出库管理",
        description: "销售、领用与损耗出库",
        accessKey: "outbound:manage",
        actions: [
          { key: "outbound:create", label: "新建出库" },
          { key: "outbound:delete", label: "删除出库记录" },
          { key: "outbound:analytics", label: "查看出库分析" },
        ],
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
        accessKey: "door-locks:manage",
        actions: [
          { key: "door-locks:unlock", label: "远程开锁" },
          { key: "door-locks:password", label: "离线密码下发" },
          { key: "door-locks:sync", label: "同步门锁状态" },
        ],
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
        actions: [
          { key: "settlement:confirm", label: "确认结算" },
          { key: "settlement:export", label: "导出对账" },
        ],
      },
      {
        key: "operating_costs",
        label: "经营成本",
        description: "房租、人工、水电物业等经营成本",
        accessKey: "operating-costs:manage",
        actions: [
          { key: "operating-costs:update", label: "编辑成本参数" },
        ],
      },
      {
        key: "logistics",
        label: "智能调货",
        description: "智能调货、地图测距和网点管理",
        accessKey: "logistics:manage",
        actions: [
          { key: "logistics:route", label: "计算配送路线" },
          { key: "logistics:stores", label: "维护配送网点" },
        ],
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
          { key: "members:orders", label: "查看成员麦芽田数据" },
          { key: "members:libraries", label: "商品库授权" },
          { key: "whitelist:manage", label: "白名单与邀请管理" },
        ],
      },
      {
        key: "roles",
        label: "角色管理",
        description: "角色模板与权限矩阵",
        accessKey: "roles:manage",
        actions: [
          { key: "roles:create", label: "创建角色" },
          { key: "roles:update", label: "编辑角色权限" },
          { key: "roles:delete", label: "删除角色" },
        ],
      },
      {
        key: "settings",
        label: "系统设置",
        description: "系统参数与存储配置",
        accessKey: "settings:manage",
        actions: [
          { key: "settings:general", label: "常规设置" },
          { key: "settings:storage", label: "存储设置" },
        ],
      },
      {
        key: "backup",
        label: "备份与恢复",
        description: "系统备份、恢复和备份测试",
        accessKey: "backup:manage",
        actions: [
          { key: "backup:create", label: "创建备份" },
          { key: "backup:restore", label: "恢复备份" },
          { key: "backup:delete", label: "删除备份" },
        ],
      },
      {
        key: "data_transfer",
        label: "数据导入导出",
        description: "系统级数据迁移和导出",
        accessKey: "data:transfer",
        actions: [
          { key: "data:import", label: "导入数据" },
          { key: "data:export", label: "导出数据" },
        ],
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
  "members:orders": {
    label: "成员麦芽田数据",
    description: "查看成员的麦芽田订单和利润数据",
    permission: "members:orders",
  },
  "members:libraries": {
    label: "成员商品库授权",
    description: "调整成员可访问的商品模板库",
    permission: "members:libraries",
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
  "product:import": ["product:update"],
  "product:export": ["product:read"],
  "shop_product:manage": ["product:update"],
  "category:create": ["category:manage"],
  "category:update": ["category:manage"],
  "category:delete": ["category:manage"],
  "supplier:create": ["supplier:manage"],
  "supplier:update": ["supplier:manage"],
  "supplier:delete": ["supplier:manage"],
  "order:manage": ["purchase:manage", "outbound:manage", "brush:manage"],
  "order:sync": ["order:manage"],
  "order:delivery": ["order:manage"],
  "order:match": ["order:manage"],
  "order:cost": ["order:manage"],
  "order:promotion": ["order:manage"],
  "purchase:create": ["purchase:manage"],
  "purchase:update": ["purchase:manage"],
  "purchase:delete": ["purchase:manage"],
  "purchase:inbound": ["purchase:manage"],
  "purchase:export": ["purchase:manage"],
  "setup_purchase:create": ["setup_purchase:manage"],
  "setup_purchase:update": ["setup_purchase:manage"],
  "setup_purchase:delete": ["setup_purchase:manage"],
  "setup_purchase:inbound": ["setup_purchase:manage"],
  "inbound:create": ["inbound:manage"],
  "inbound:delete": ["inbound:manage"],
  "inbound:export": ["inbound:manage"],
  "outbound:create": ["outbound:manage"],
  "outbound:delete": ["outbound:manage"],
  "outbound:analytics": ["outbound:manage"],
  "brush:products": ["brush:manage"],
  "brush:plans": ["brush:manage"],
  "brush:orders": ["brush:manage"],
  "settlement:confirm": ["settlement:manage"],
  "settlement:export": ["settlement:manage"],
  "operating-costs:update": ["operating-costs:manage"],
  "logistics:route": ["logistics:manage"],
  "logistics:stores": ["logistics:manage"],
  "door-locks:manage": ["settings:manage", "system:manage"],
  "door-locks:unlock": ["door-locks:manage", "settings:manage"],
  "door-locks:password": ["door-locks:manage", "settings:manage"],
  "door-locks:sync": ["door-locks:manage", "settings:manage"],
  "roles:manage": ["system:manage"],
  "roles:create": ["roles:manage", "system:manage"],
  "roles:update": ["roles:manage", "system:manage"],
  "roles:delete": ["roles:manage", "system:manage"],
  "settings:manage": ["system:manage"],
  "settings:general": ["settings:manage", "system:manage"],
  "settings:storage": ["settings:manage", "system:manage"],
  "backup:manage": ["system:manage"],
  "backup:create": ["backup:manage", "system:manage"],
  "backup:restore": ["backup:manage", "system:manage"],
  "backup:delete": ["backup:manage", "system:manage"],
  "data:transfer": ["system:manage"],
  "data:import": ["data:transfer", "system:manage"],
  "data:export": ["data:transfer", "system:manage"],
  "members:read": ["members:manage", "members:status", "members:orders", "members:libraries", "whitelist:manage", "system:manage"],
  "members:manage": ["system:manage"],
  "members:status": ["system:manage"],
  "members:orders": ["members:manage", "system:manage"],
  "members:libraries": ["members:manage", "system:manage"],
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
  return hasPermission(user, "dashboard:read");
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
  { href: "/door-locks", permission: "door-locks:manage" },
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
