/**
 * 配件/耗材/物料判定工具库
 * 用于在统计销量排行榜、热销榜等业务场景中，自动排除非主营商品的随单赠品、包装盒、礼袋、辅料等配件
 */

export const ACCESSORY_CATEGORY_REGEX = /(配件|礼袋|礼盒|包装|辅料|耗材|赠品|贺卡|物料)/i;

export const ACCESSORY_NAME_REGEX = /(礼袋|手提袋|手提纸袋|包装袋|礼品袋|包装盒|伴手礼袋|拉菲草|信封|贺卡|空白卡|火石|棉芯|煤油|配件包|配件|辅料|耗材|赠品|物料)/i;

/**
 * 判断指定商品是否为配件/包装/辅料
 * @param productName 商品名称
 * @param categoryName 分类名称（可选）
 */
export function isAccessoryProduct(
  productName?: string | null,
  categoryName?: string | null
): boolean {
  const normCategory = String(categoryName || "").trim();
  if (normCategory && ACCESSORY_CATEGORY_REGEX.test(normCategory)) {
    return true;
  }

  const normName = String(productName || "").trim();
  if (normName && ACCESSORY_NAME_REGEX.test(normName)) {
    return true;
  }

  return false;
}
