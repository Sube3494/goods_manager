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
  categoryId: string;
  category?: Category;
  price: number;
  stock: number;
  image?: string;
  supplierId?: string;
  supplier?: Supplier;
  isPublic?: boolean;
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
  description?: string;
  color?: string;
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
}
