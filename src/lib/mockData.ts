import { Product, Supplier, GalleryItem } from "./types";

export const INITIAL_SUPPLIERS: Supplier[] = [
  { id: "1", name: "Global Tech Supplies", contact: "John Doe", phone: "+1 234 567 890", email: "contact@globaltech.com", address: "123 Tech Way, Silicon Valley, CA" },
  { id: "2", name: "Premium Leather Co.", contact: "Jane Smith", phone: "+1 987 654 321", email: "sales@leatherco.com", address: "45 Craftsman Rd, Texas, USA" },
  { id: "3", name: "Oriental Fabrics Ltd.", contact: "Li Wei", phone: "+86 138 0000 0000", email: "info@orientalfabrics.cn", address: "88 Silk Road, Hangzhou, China" },
];

export const INITIAL_GOODS: Product[] = [
  { id: "1", sku: "ACC-001", name: "Premium Leather Bag", category: "Accessories", price: 1299.00, stock: 45, image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=2938&auto=format&fit=crop", supplierId: "2" },
  { id: "2", sku: "ELE-002", name: "Wireless Noise Cancelling Headphones", category: "Electronics", price: 2499.00, stock: 12, image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=2940&auto=format&fit=crop", supplierId: "1" },
  { id: "3", sku: "ACC-003", name: "Minimalist Watch", category: "Accessories", price: 899.00, stock: 8, image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=2898&auto=format&fit=crop", supplierId: "1" },
  { id: "4", sku: "ELE-004", name: "Smart Home Speaker", category: "Electronics", price: 699.00, stock: 156, supplierId: "1" },
  { id: "5", sku: "HOM-005", name: "Ceramic Vase Set", category: "Home Decor", price: 350.00, stock: 24, image: "https://images.unsplash.com/photo-1581783342308-f792ca11df53?q=80&w=2835&auto=format&fit=crop", supplierId: "3" },
];

import { PurchaseOrder } from "./types";

export const INITIAL_PURCHASES: PurchaseOrder[] = [
  {
    id: "PO-20240201-001",
    supplierId: "1",
    status: "Received",
    date: "2024-02-01",
    totalAmount: 56000,
    items: [
      { productId: "2", quantity: 20, costPrice: 2000 },
      { productId: "4", quantity: 50, costPrice: 320 }
    ]
  },
  {
    id: "PO-20240205-002",
    supplierId: "2",
    status: "Ordered",
    date: "2024-02-05",
    totalAmount: 12000,
    items: [
      { productId: "1", quantity: 15, costPrice: 800 }
    ]
  },
  {
    id: "PO-20240210-003",
    supplierId: "3",
    status: "Draft",
    date: "2024-02-10",
    totalAmount: 3500,
    items: [
      { productId: "5", quantity: 10, costPrice: 350 }
    ]
  }
];

export const INITIAL_GALLERY: GalleryItem[] = [
  { id: "g1", url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=2938&auto=format&fit=crop", productId: "1", uploadDate: "2024-02-01", tags: ["Premium", "Leather"] },
  { id: "g2", url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=2940&auto=format&fit=crop", productId: "2", uploadDate: "2024-02-02", tags: ["Audio", "Black"] },
  { id: "g3", url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=2898&auto=format&fit=crop", productId: "3", uploadDate: "2024-02-03", tags: ["Minimalist", "Watch"] },
  { id: "g4", url: "https://images.unsplash.com/photo-1581783342308-f792ca11df53?q=80&w=2835&auto=format&fit=crop", productId: "5", uploadDate: "2024-02-04", tags: ["Home", "Ceramic"] },
  { id: "g5", url: "https://images.unsplash.com/photo-1491633582648-27942441c97d?q=80&w=2940&auto=format&fit=crop", productId: "1", uploadDate: "2024-02-05", tags: ["Detail", "Texture"] },
  { id: "g6", url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=2940&auto=format&fit=crop", productId: "2", uploadDate: "2024-02-06", tags: ["Product", "Vibrant"] },
  { id: "g7", url: "https://images.unsplash.com/photo-1491633582648-27942441c97d?q=80&w=2940&auto=format&fit=crop", productId: "1", uploadDate: "2024-02-07", tags: ["Side View"] },
  { id: "g8", url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=2940&auto=format&fit=crop", productId: "3", uploadDate: "2024-02-08", tags: ["Detail"] },
];
