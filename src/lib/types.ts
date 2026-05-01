export interface Supplier {
  id: string;
  code?: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  workspaceId?: string;
  _count?: {
    products: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierSummary {
  id: string;
  name: string;
}

export interface AddressItem {
  id: string;
  label: string;
  address: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault: boolean;
  serviceFeeRate?: number;
  longitude?: number;
  latitude?: number;
}

export interface BrushShopItem {
  id: string;
  name: string;
  platform?: string;
  isDefault?: boolean;
  serviceFeeRate?: number;
}

export interface User {
  id: string;
  name?: string | null;
  email: string;
  shippingAddresses?: AddressItem[];
  shippingAddress?: string | null;
  brushShops?: BrushShopItem[];
  role: string;
  status: string;
}

export interface Product {
  id: string;
  sku?: string;
  jdSkuId?: string;
  jdSkuIds?: string[];
  name: string;
  productId?: string | null;
  sourceProductId?: string | null;
  categoryId: string;
  category?: Category;
  costPrice: number;
  stock: number;
  image?: string;
  isPublic?: boolean;
  isDiscontinued?: boolean;
  isShopOnly?: boolean;
  specs?: Record<string, string>;
  remark?: string;
  supplierId?: string;
  supplier?: SupplierSummary;
  workspaceId?: string;
  gallery?: GalleryItem[];
  assignedShopIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  sourceType?: "product" | "shopProduct";
  shopProductId?: string;
  shopId?: string;
  shopName?: string;
  isStandaloneShopProduct?: boolean;
}

export interface Shop {
  id: string;
  name: string;
  address?: string | null;
  dedupeKey?: string | null;
  province?: string | null;
  city?: string | null;
  externalId?: string | null;
  isSource?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShopCatalogItem {
  id: string;
  sourceProductId?: string | null;
  productId?: string | null;
  sku?: string | null;
  jdSkuId?: string | null;
  name: string;
  image?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  supplierId?: string | null;
  supplier?: SupplierSummary | null;
  costPrice?: number | null;
  stock?: number | null;
  shopId?: string | null;
  shopName?: string | null;
  isPublic?: boolean;
  isDiscontinued?: boolean;
  remark?: string | null;
  specs?: Record<string, string> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoPickDelivery {
  logisticName?: string;
  sendFee?: number;
  pickupTime?: string;
  track?: string;
  riderName?: string;
}

export interface AutoPickOrderItem {
  id?: string;
  orderId?: string;
  productName: string;
  productNo?: string | null;
  quantity: number;
  thumb?: string | null;
  matchedProduct?: {
    id: string;
    name: string;
    sku?: string | null;
    image?: string | null;
    sourceType: "product" | "shopProduct";
    shopName?: string | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoPickMatchedProductRef {
  id: string;
  name: string;
  sku?: string | null;
  image?: string | null;
  sourceType: "product" | "shopProduct";
  shopName?: string | null;
}

export interface AutoPickOrder {
  id: string;
  userId: string;
  sourceId: string;
  shopId?: string | null;
  logisticId?: string | null;
  city?: number | null;
  platform: string;
  dailyPlatformSequence: number;
  orderNo: string;
  orderTime: string;
  userAddress: string;
  shopAddress?: string | null;
  rawShopName?: string | null;
  rawShopAddress?: string | null;
  matchedShopName?: string | null;
  isMainSystemSelfDelivery?: boolean;
  isPickup?: boolean;
  isOtherPickup?: boolean;
  isDeleted?: boolean;
  isSubscribe?: boolean;
  longitude?: number | null;
  latitude?: number | null;
  status?: string | null;
  deliveryDeadline?: string | null;
  deliveryTimeRange?: string | null;
  distanceKm?: number | null;
  distanceIsLinear: boolean;
  actualPaid: number;
  expectedIncome?: number | null;
  platformCommission: number;
  delivery?: AutoPickDelivery | null;
  items: AutoPickOrderItem[];
  autoCompleteAt?: string | null;
  completedAt?: string | null;
  autoCompleteJobStatus?: string | null;
  autoCompleteJobError?: string | null;
  autoCompleteJobAttempts?: number | null;
  autoOutboundStatus?: string | null;
  autoOutboundError?: string | null;
  autoOutboundAttemptedAt?: string | null;
  autoOutboundResolvedAt?: string | null;
  hasOutbound?: boolean;
  outboundOrderId?: string | null;
  lastSyncedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoPickApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutoPickIntegrationConfig {
  pluginBaseUrl: string;
  inboundApiKey: string;
  maiyatianCookie: string;
  maiyatianShopMappings: AutoPickMaiyatianShopMapping[];
  selfDeliveryTiming: AutoPickSelfDeliveryTimingConfig;
}

export interface AutoPickSelfDeliveryTimingConfig {
  pickupMinutes: number;
  minutesPerKm: number;
  riderUpstairsMinutes: number;
  deadlineLeadMinutes: number;
}

export interface AutoPickMaiyatianShop {
  id: string;
  name: string;
  address: string;
  phone?: string | null;
  cityCode?: string | null;
  cityName?: string | null;
}

export interface AutoPickMaiyatianShopMapping {
  maiyatianShopId: string;
  maiyatianShopName: string;
  maiyatianShopAddress: string;
  localShopName: string;
  cityCode?: string | null;
  cityName?: string | null;
}

export interface BrushProduct {
  id: string;
  userId?: string;
  productId: string;
  shopId?: string | null;
  shopName?: string | null;
  isActive?: boolean;
  brushKeyword?: string;
  product: Product;
  createdAt?: string;
  updatedAt?: string;
}

export type PurchaseStatus = "Draft" | "Confirmed" | "Shipped" | "Received" | "Ordered";

export interface TrackingInfo {
  courier: string;
  number: string;
  waybillImage?: string;
  waybillImages?: string[];
}

export interface PurchaseOrder {
  id: string;
  type?: string;
  status: PurchaseStatus;
  totalAmount: number;
  date: string;
  supplierId?: string;
  items: PurchaseOrderItem[];
  shippingFees: number;
  extraFees: number;
  discountAmount?: number;
  workspaceId?: string;
  paymentVouchers?: string[];
  trackingData?: TrackingInfo[];
  shippingAddress?: string;
  shopName?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderItem {
  id?: string;
  purchaseOrderId?: string;
  productId?: string | null;
  shopProductId?: string;
  product?: Product;
  shopProduct?: ShopCatalogItem;
  image?: string;
  supplierId?: string;
  supplier?: Supplier;
  quantity: number;
  remainingQuantity?: number;
  costPrice: number;
}

export interface PurchaseOrderItemWithOrder extends PurchaseOrderItem {
  purchaseOrder: PurchaseOrder;
}

export interface Category {
  id: string;
  name: string;
  count: number;
  description?: string;
  workspaceId?: string;
  products?: Product[];
}

export interface GalleryItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  productId: string;
  product?: Product;
  purchaseOrderId?: string;
  uploadDate: string;
  tags: string[];
  isPublic?: boolean;
  type?: "image" | "video";
  workspaceId?: string;
  sortOrder?: number;
  createdAt?: string;
}

export interface GalleryGroupSummary {
  productId: string;
  product: Product;
  coverItem: GalleryItem | null;
  totalCount: number;
  imageCount: number;
  videoCount: number;
}

export interface RecentInboundItem {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    sku?: string;
    image?: string;
  };
  supplier?: {
    id: string;
    name: string;
  };
  quantity: number;
  costPrice: number;
  purchaseOrder: {
    id: string;
    date: string;
    status: string;
  };
  subtotal: number;
}

export interface StatsData {
  shopCount?: number;
  productCount: number;
  totalStock: number;
  lowStockCount: number;
  totalValue: number;
  recentInboundItems: RecentInboundItem[];
  pendingInboundCount: number;
  pendingInboundAmount?: number;
  recentPurchases?: PurchaseOrder[];
  rangeStart?: string;
  rangeEnd?: string;
  rangeDays?: number;
  purchaseAmount?: number;
  outboundAmount?: number;
  purchaseOrderCount?: number;
  outboundOrderCount?: number;
  activeShopCount?: number;
  zeroCostProductCount?: number;
  zeroStockProductCount?: number;
  duplicateSourceProductCount?: number;
  trend?: DashboardTrendPoint[];
  shopBreakdown?: DashboardShopBreakdown[];
  alerts?: DashboardAlertItem[];
  userPaid?: number;
  platformCommission?: number;
  deliveryExpense?: number;
  productCost?: number;
  promotionExpense?: number;
  brushExpense?: number;
  otherExpense?: number;
  netProfit?: number;
  platformMatrix?: DashboardPlatformMatrix;
  businessTrend?: DashboardBusinessTrendPoint[];
  platformBusinessTrend?: Record<string, DashboardBusinessTrendPoint[]>;
}

export interface DashboardTrendPoint {
  date: string;
  label: string;
  purchaseAmount: number;
  outboundAmount: number;
  purchaseCount: number;
  outboundCount: number;
}

export interface DashboardShopBreakdown {
  shopId: string;
  shopName: string;
  skuCount: number;
  stock: number;
  lowStockCount: number;
  value: number;
}

export interface DashboardAlertItem {
  key: string;
  label: string;
  value: number;
  tone: "danger" | "warning" | "info";
  hint: string;
  href?: string;
}

export interface DashboardPlatformMatrixCell {
  platform: string;
  trueOrderCount: number;
  brushOrderCount: number;
  totalCount: number;
}

export interface DashboardPlatformMatrix {
  columns: DashboardPlatformMatrixCell[];
  trueOrderTotal: number;
  brushOrderTotal: number;
  grandTotal: number;
}

export interface DashboardBusinessTrendPoint {
  date: string;
  label: string;
  netProfit: number;
  orderCount: number;
  cumulativeOrderCount: number;
  trueOrderCount: number;
  brushOrderCount: number;
  productCost: number;
  brushExpense: number;
}

export type BrushStatus = "Draft" | "Completed";

export interface BrushOrderItem {
  id?: string;
  brushOrderId?: string;
  productId: string;
  product?: Product;
  quantity: number;
}

export interface BrushOrder {
  id: string;
  date: Date | string;
  type: string;
  status: BrushStatus | string;
  shopName?: string;
  paymentAmount: number;
  receivedAmount: number;
  commission: number;
  note?: string;
  platformOrderId?: string;
  items: BrushOrderItem[];
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OutboundOrderItem {
  id?: string;
  outboundOrderId?: string;
  productId?: string | null;
  shopProductId?: string;
  product?: Product;
  shopProduct?: ShopCatalogItem;
  quantity: number;
  price: number;
}

export interface OutboundOrder {
  id: string;
  type: string;
  shopName?: string | null;
  status?: string;
  date: string | Date;
  note?: string;
  totalAmount?: number;
  items: OutboundOrderItem[];
  workspaceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrushOrderPlan {
  id: string;
  userId: string;
  title: string;
  shopName?: string;
  date: string;
  status: string;
  note?: string;
  items: BrushOrderPlanItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BrushOrderPlanItem {
  id?: string;
  planId?: string;
  productId?: string;
  productName?: string;
  product?: Product;
  quantity: number;
  searchKeyword: string;
  platform?: string;
  note?: string;
  principal?: number;
  done: boolean;
  sortOrder?: number;
}
