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
   * 乘法: a * b (支持用于费率等非常规精度的场景)
   * e.g. 100 * 0.06 (6% 服务费)
   */
  static multiply(amount: number, multiplier: number): number {
    // 因为 multiplier 可能是比如 0.06 (非标准两位小数)，这里采用放大后取整
    const product = this.toCents(amount) * multiplier;
    // 银行家舍入（或者简单四舍五入）后除回
    return this.toYuan(Math.round(product));
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
