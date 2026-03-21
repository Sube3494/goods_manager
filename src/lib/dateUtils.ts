/**
 * 格式化日期时间为本地时间和时区兼容 (Asia/Shanghai)
 * @param date - 日期对象或 ISO 字符串
 * @returns 格式化后的日期时间字符串 (YYYY-MM-DD HH:mm)
 */
export function formatLocalDateTime(date: Date | string): string {
  let d: Date;
  
  if (typeof date === 'string') {
    if (date.includes('T')) {
      // 这里的逻辑需要小心：如果带了时区（Z 或 +08:00），直接 new Date
      // 如果没带时区，且包含 T，之前代码强制加 Z 是错误的，这会把本地时间当成 UTC
      d = new Date(date);
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
 * 将输入日期（字符串或对象）解析为上海时区的 Date 对象
 * 解决 Excel 导入或前端传回的“本地时间字符串”在 UTC 服务器上被误判为 UTC 的问题
 * @param input - 日期字符串 (如 "2026-03-21 21:00") 或 Date 对象
 */
export function parseAsShanghaiTime(input: string | Date | null | undefined): Date {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  
  const str = input.trim();
  
  // 1. 如果字符串包含时区信息 (Z, +, -[offset])，直接解析即可
  if (str.includes('Z') || str.includes('+') || /-\d{2}:\d{2}$/.test(str)) {
    return new Date(str);
  }
  
  // 2. 对于不带时区的本地时间字符串（如 "2026-03-21 21:00:00" 或 "2026-03-21"）
  // 强制追加上海时区后缀 (+08:00)
  try {
    let normalized = str.replace(/\//g, '-');
    
    // 如果只有日期没有时间，补充时间
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      normalized += 'T00:00:00';
    } else if (normalized.includes(' ')) {
      normalized = normalized.replace(' ', 'T');
    }
    
    // 追加时区
    const shanghaiStr = normalized + '+08:00';
    const d = new Date(shanghaiStr);
    
    if (!isNaN(d.getTime())) return d;
  } catch (e) {
    console.error("Failed to parse as Shanghai time:", str, e);
  }
  
  // 兜底：使用默认解析
  return new Date(str);
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
