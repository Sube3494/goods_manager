/**
 * 格式化日期时间为本地时间
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的日期时间字符串 (YYYY-MM-DD HH:mm)
 */
export function formatLocalDateTime(date: Date | string): string {
  let d: Date;
  
  if (typeof date === 'string') {
    // 检查是否包含 T (ISO 格式)
    if (date.includes('T')) {
      // 如果包含 T 但不带时区，假定为 UTC
      if (!date.includes('Z') && !date.includes('+') && !date.includes('-', 10)) {
        d = new Date(date + 'Z');
      } else {
        d = new Date(date);
      }
    } else {
      // 如果是 YYYY-MM-DD HH:mm 格式或 YYYY-MM-DD，直接解析为本地时间
      // 使用正则替换 - 为 / 可以增加某些旧版浏览器的兼容性，但在现代 Next.js 中通常直接 new Date 就行
      d = new Date(date.replace(/-/g, '/'));
    }
  } else {
    d = date;
  }
  
  if (isNaN(d.getTime())) return "无效日期";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 格式化日期为本地日期
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的日期字符串 (YYYY-MM-DD)
 */
export function formatLocalDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}
