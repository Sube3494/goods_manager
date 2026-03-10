/**
 * 格式化日期时间为本地时间和时区兼容 (Asia/Shanghai)
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的日期时间字符串 (YYYY-MM-DD HH:mm)
 */
export function formatLocalDateTime(date: Date | string): string {
  let d: Date;
  
  if (typeof date === 'string') {
    if (date.includes('T')) {
      if (!date.includes('Z') && !date.includes('+') && !date.includes('-', 10)) {
        d = new Date(date + 'Z');
      } else {
        d = new Date(date);
      }
    } else {
      d = new Date(date.replace(/-/g, '/'));
    }
  } else {
    d = date;
  }
  
  if (isNaN(d.getTime())) return "无效日期";

  // 使用 Intl.DateTimeFormat 确保东八区显示
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    return formatter.format(d).replace(/\//g, '-');
  } catch {
    // 降级回退
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}

/**
 * 格式化日期为本地日期 (Asia/Shanghai)
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的日期字符串 (YYYY-MM-DD)
 */
export function formatLocalDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return "无效日期";
  
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d).replace(/\//g, '-');
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * 格式化日期为本地月份 (Asia/Shanghai)
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的月份字符串 (YYYY年MM月)
 */
export function formatLocalMonth(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return "无效日期";
  
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit'
    });
    const parts = formatter.format(d).split('/');
    if (parts.length >= 2) {
      return `${parts[0]}年${parts[1]}月`;
    }
  } catch {}

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  
  return `${year}年${month}月`;
}
