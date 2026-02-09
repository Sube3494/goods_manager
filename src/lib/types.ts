export interface Supplier {
  id: string;
  code?: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  _count?: {
    products: number;
  };
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  categoryId: string;
  category?: Category;
  price: number;
  stock: number;
  image?: string;
  supplierId?: string;
  supplier?: Supplier;
  isPublic?: boolean;
}

export type PurchaseStatus = "Draft" | "Confirmed" | "Shipped" | "Received" | "Ordered"; // 暂时保留 Ordered 以防万一，但主推前四个

export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  costPrice: number;
}

export interface TrackingInfo {
  courier: string;
  number: string;
  waybillImage?: string;
  waybillImages?: string[];
}

export interface PurchaseOrder {
  id: string;
  status: PurchaseStatus;
  totalAmount: number;
  date: string;
  items: PurchaseOrderItem[];
  shippingFees: number;
  extraFees: number;
  paymentVoucher?: string;
  paymentVouchers?: string[];
  trackingData?: TrackingInfo[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderItem {
  id?: string;
  purchaseOrderId?: string;
  productId: string;
  product?: Product;
  supplierId?: string;
  supplier?: Supplier;
  quantity: number;
  costPrice: number;
}
export interface Category {
  id: string;
  name: string;
  count: number;
  description?: string;

  products?: Product[];
  items?: Product[]; // For compatibility if used elsewhere
}

export interface GalleryItem {
  id: string;
  url: string;
  productId: string;
  product?: Product;
  purchaseOrderId?: string;
  uploadDate: string;
  tags: string[];
  isPublic?: boolean;
  type?: "image" | "video";
  createdAt?: string;
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
  productCount: number;
  totalStock: number;
  lowStockCount: number;
  totalValue: number;
  recentInboundItems: RecentInboundItem[];
  pendingInboundCount: number;
  recentPurchases?: PurchaseOrder[];
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
  principalAmount: number; // 本金
  paymentAmount: number;   // 实付
  receivedAmount: number;  // 到手金额
  commission: number;      // 佣金
  note?: string;           // 备注
  items: BrushOrderItem[];
  createdAt?: string;
  updatedAt?: string;
}
