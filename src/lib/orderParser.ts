import { Product } from "../../prisma/generated-client";

export interface ParsedOrderItem {
  rawName: string;
  quantity: number;
}

/**
 * 订单解析器核心逻辑
 */
export class OrderParser {
  /**
   * 解析复合订单商品名
   * 处理例如: "保温杯礼盒装x1+【精美礼盒礼袋】香薰花束x2"
   * 将其拆分为 [{rawName: "保温杯礼盒装", quantity: 1}, {rawName: "【精美礼盒礼袋】香薰花束", quantity: 2}]
   */
  static parseProductString(rawString: string): ParsedOrderItem[] {
    if (!rawString) return [];

    // 1. 拆分 "+" 组合的多个商品
    const parts = rawString.split('+');
    const items: ParsedOrderItem[] = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // 2. 正则提取末尾的数量，例如 "xxxx x 1", "xxxx*2", "xxxx X10"
      // 匹配以 x, X, 或 * 开头，跟着可选空格，再跟着数字，并且是在字符串末尾
      const match = trimmed.match(/(.*?)(?:[xX*])\s*(\d+)$/);
      
      if (match) {
        items.push({
          rawName: match[1].trim(),
          quantity: parseInt(match[2], 10)
        });
      } else {
        // 如果没有数量标识，默认数量为 1
        items.push({
          rawName: trimmed,
          quantity: 1
        });
      }
    }

    return items;
  }

  /**
   * 智能模糊匹配商品名称
   * @param rawName 提取出的原生商品名
   * @param allProducts 系统中该用户的所有商品列表
   */
  static findBestMatchProduct(rawName: string, allProducts: Pick<Product, 'id' | 'name'>[]): Pick<Product, 'id' | 'name'> | null {
    if (!rawName || allProducts.length === 0) return null;

    // 1. 精确匹配 (如果名称完全一致)
    const exactMatch = allProducts.find(p => p.name === rawName);
    if (exactMatch) return exactMatch;

    // 2. 清理无关字符用于智能匹配
    // 去除常见的营销括号、规格标识、以及首尾空格
    const cleanRawName = rawName.replace(/[【】\[\]()（）]/g, ' ').replace(/\s+/g, ' ').trim();

    // 3. 提取英文字母或数字组合（例如型号 B12, Zippo）
    const keywords = cleanRawName.split(/([a-zA-Z0-9.\-_]{2,})/).filter(k => k && k.trim().length >= 2);
    
    // 4. 提取中文双字特征 (Bi-grams)
    const biGrams: string[] = [];
    const chineseOnly = cleanRawName.replace(/[^\u4e00-\u9fa5]/g, '');
    for (let i = 0; i < chineseOnly.length - 1; i++) {
      biGrams.push(chineseOnly.substring(i, i + 2));
    }

    let bestScore = 0;
    let bestMatch: Pick<Product, 'id' | 'name'> | null = null;

    for (const p of allProducts) {
      let score = 0;
      const pName = p.name;
      const cleanPName = pName.replace(/[【】\[\]()（）]/g, ' ');

      // A. 完全包含加分最高 (如果系统商品名包含在了订单商品名里，或者反之)
      if (cleanRawName.includes(cleanPName) || cleanPName.includes(cleanRawName)) {
        score += 30;
      }

      // B. 英文/型号关键字匹配
      keywords.forEach(kw => {
        if (cleanPName.toLowerCase().includes(kw.toLowerCase())) {
          score += kw.length * 3; // 型号匹配权重较高
        }
      });

      // C. 中文双字词特征命中
      biGrams.forEach(bg => {
        if (cleanPName.includes(bg)) {
          score += 1;
        }
      });

      if (score > bestScore) {
        bestScore = score;
        bestMatch = p;
      }
    }

    // 只要有合理的分数 (阈值 >= 5) 即可认为匹配成功
    if (bestScore >= 5) {
      return bestMatch;
    }

    return null;
  }
}