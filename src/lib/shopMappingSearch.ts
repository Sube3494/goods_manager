import { pinyinMatch } from "./pinyin";

type MappingSearchProduct = {
  name: string;
  sku?: string | null;
  shopProductName?: string | null;
  shopSku?: string | null;
  jdSkuId?: string | null;
  meituanSkuId?: string | null;
  taobaoSkuId?: string | null;
  doudianSkuId?: string | null;
};

// 搜索使用与配对列表相同的店铺名称、店内码回退规则。
export function matchesShopMappingSearch(product: MappingSearchProduct, search: string, platform: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const name = product.shopProductName || product.name;
  const sku = product.shopSku || product.sku || "";
  const platformId = platform === "jd" ? product.jdSkuId
    : platform === "taobao" ? product.taobaoSkuId
    : platform === "doudian" ? product.doudianSkuId : product.meituanSkuId;
  return name.toLowerCase().includes(query)
    || sku.toLowerCase().includes(query)
    || Boolean(platformId?.toLowerCase().includes(query))
    || pinyinMatch(name, query);
}
