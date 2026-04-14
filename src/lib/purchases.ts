import { pinyinMatch } from "./pinyin";
import { PurchaseOrder, PurchaseStatus } from "./types";

export const PURCHASE_STATUS_OPTIONS = [
  { value: "All", label: "全部" },
  { value: "Confirmed", label: "已下单" },
  { value: "Shipped", label: "运输中" },
  { value: "Received", label: "已入库" },
  { value: "Draft", label: "草稿" },
] as const;

export type PurchaseStatusFilter = (typeof PURCHASE_STATUS_OPTIONS)[number]["value"];

export function isPurchaseStatusFilter(value: string): value is PurchaseStatusFilter {
  return PURCHASE_STATUS_OPTIONS.some((option) => option.value === value);
}

const COURIER_CODES: Record<string, string> = {
  "顺丰速运": "shunfeng",
  "圆通速递": "yuantong",
  "中通快递": "zhongtong",
  "中通快运": "zhongtongkuaiyun",
  "申通快递": "shentong",
  "韵达快递": "yunda",
  "极兔速递": "jtexpress",
  EMS: "ems",
  "邮政快递": "youzhengguonei",
  "京东快递": "jd",
  "德邦快递": "debangwuliu",
  "安能物流": "annengwuliu",
  "跨越速运": "kuayue",
  "优速快递": "yousu",
};

export function getTrackingUrl(num: string, courierName?: string) {
  const code = courierName ? COURIER_CODES[courierName] : "";
  if (!num || !code) return null;
  return `https://www.kuaidi100.com/chaxun?com=${code}&nu=${num.trim()}`;
}

export function getPurchaseStatusColor(status: PurchaseStatus) {
  switch (status) {
    case "Received":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "Shipped":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "Confirmed":
    case "Ordered":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
  }
}

export function getPurchaseStatusLabel(status: PurchaseStatus) {
  switch (status) {
    case "Received":
      return "已入库";
    case "Shipped":
      return "运输中";
    case "Confirmed":
    case "Ordered":
      return "已下单";
    default:
      return "草稿";
  }
}

export function matchesPurchaseStatus(
  purchase: PurchaseOrder,
  statusFilter: PurchaseStatusFilter
) {
  if (statusFilter === "All") return true;
  if (statusFilter === "Confirmed") {
    return purchase.status === "Confirmed" || purchase.status === "Ordered";
  }
  return purchase.status === statusFilter;
}

export function getUniquePurchaseShops(purchases: PurchaseOrder[]) {
  return Array.from(new Set(purchases.map((purchase) => purchase.shopName).filter(Boolean))) as string[];
}

export function filterPurchases(
  purchases: PurchaseOrder[],
  filters: {
    searchQuery: string;
    statusFilter: PurchaseStatusFilter;
    shopFilter: string;
  }
) {
  const query = filters.searchQuery.trim();

  return purchases.filter((purchase) => {
    const matchesStatus = matchesPurchaseStatus(purchase, filters.statusFilter);
    const matchesShop = filters.shopFilter === "All" || purchase.shopName === filters.shopFilter;

    if (!matchesStatus || !matchesShop) {
      return false;
    }

    if (!query) {
      return true;
    }

    const matchesId = pinyinMatch(purchase.id, query);
    const matchesSupplier = purchase.items.some(
      (item) => item.supplier?.name && pinyinMatch(item.supplier.name, query)
    );
    const matchesProduct = purchase.items.some(
      (item) => {
        const productName = item.shopProduct?.name || item.product?.name;
        return !!productName && pinyinMatch(productName, query);
      }
    );
    const matchesShopName = !!purchase.shopName && pinyinMatch(purchase.shopName, query);

    return matchesId || matchesSupplier || matchesProduct || matchesShopName;
  });
}
