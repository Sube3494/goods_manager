export interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
}

export interface Product {
  id: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image?: string;
  supplierId?: string;
}

export type PurchaseStatus = "Draft" | "Ordered" | "Received";

export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  costPrice: number;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseStatus;
  date: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
}
export interface Category {
  id: string;
  name: string;
  count: number;
  description: string;
  color: string;
}

export interface GalleryItem {
  id: string;
  url: string;
  productId: string;
  purchaseOrderId?: string;
  uploadDate: string;
  tags: string[];
}
