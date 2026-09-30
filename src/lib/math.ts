/**
 * 财务级高精度计算工具 (基于“化零为整”的整数运算)
 * 解决 JavaScript 原生浮点数精度丢失问题 (如 0.1 + 0.2 !== 0.3)
 * ERP 和财务模块的所有金额必须走此工具
 */

export class FinanceMath {
  /**
   * 将浮点数“元”安全转换为整数“分” (处理两位小数)
   */
  private static toCents(amount: number): number {
    // Math.round 避免 1.005 * 100 变成 100.49999...9 导致精度截断
    return Math.round(Number(amount) * 100);
  }

  /**
   * 将整数“分”转换回浮点数“元”
   */
  private static toYuan(cents: number): number {
    return Number((cents / 100).toFixed(2));
  }

  /**
   * 加法: a + b
   */
  static add(a: number, b: number): number {
    const sumCents = this.toCents(a) + this.toCents(b);
    return this.toYuan(sumCents);
  }

  /**
   * 连续累加多项: a + b + c + ...
   */
  static sum(...numbers: number[]): number {
    const totalCents = numbers.reduce((acc, curr) => acc + this.toCents(curr), 0);
    return this.toYuan(totalCents);
  }

  /**
   * 减法: a - b
   */
  static subtract(a: number, b: number): number {
    const diffCents = this.toCents(a) - this.toCents(b);
    return this.toYuan(diffCents);
  }

  /**
   * 乘法: a * b (保持最终金额精确到分/两位小数，同时支持乘数或被乘数具备高精度单价，避免提前截断导致小计误差)
   * e.g. 44.1567 * 3 = 132.47
   */
  static multiply(amount: number, multiplier: number): number {
    const product = Number(amount) * Number(multiplier);
    return this.toYuan(Math.round(product * 100));
  }

  /**
   * 单价高精度保留（最多保留 decimals 位小数，默认 4 位）
   */
  static roundPrice(price: number, decimals: number = 4): number {
    const factor = Math.pow(10, decimals);
    return Math.round((Number(price) || 0) * factor) / factor;
  }

  /**
   * 除法: a / b
   */
  static divide(amount: number, divisor: number): number {
    if (divisor === 0) throw new Error("除数不能为0");
    const quotient = this.toCents(amount) / divisor;
    return this.toYuan(Math.round(quotient));
  }
}
