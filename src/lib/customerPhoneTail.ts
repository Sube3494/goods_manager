/**
 * 从订单及其原始报文中提取顾客脱敏真实手机号中的 4 位真实尾号
 * 例如从 "155****1737" 中提取 "1737"
 * 
 * 严格说明：
 * 1. 虚拟隐私号（例如 "15534074635_3686"）带有下划线分机号，3686 为临时分机号，绝非真实尾号，必须排除。
 * 2. 真实尾号只从脱敏真实手机号（secret_phone / customerMaskedPhone 等格式如 155****1737 或 手机尾号1737）中提取。
 */

export function extractCustomerPhoneTail(source: unknown): string | null {
  if (!source) return null;

  let rawPayload: Record<string, unknown> | null = null;
  let directMaskedPhone: string | null = null;

  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>;
    if (obj.rawPayload && typeof obj.rawPayload === "object") {
      rawPayload = obj.rawPayload as Record<string, unknown>;
    } else {
      rawPayload = obj;
    }
    if (typeof obj.customerMaskedPhone === "string") {
      directMaskedPhone = obj.customerMaskedPhone;
    }
  }

  const userInfo = (rawPayload?.userInfo && typeof rawPayload.userInfo === "object")
    ? rawPayload.userInfo as Record<string, unknown>
    : null;

  // 优先级：只查找脱敏真实手机号相关的候选字段
  const candidates = [
    directMaskedPhone,
    rawPayload?.secret_phone,
    rawPayload?.customerMaskedPhone,
    rawPayload?.secretPhone,
    userInfo?.secret_phone,
    userInfo?.secretPhone,
    userInfo?.customerMaskedPhone,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;

    // 如果带有下划线或短横线分机号（如 15534074635_3686），属于虚拟隐私号，跳过
    if (trimmed.includes("_") || trimmed.includes("#")) {
      continue;
    }

    // 匹配类似 "155****1737" 或 "手机尾号1737" 或末尾连续 4 位数字
    const match = trimmed.match(/(\d{4})$/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * 获取用于展示的脱敏真实手机号（例如 155****1737）
 */
export function getCustomerMaskedPhoneDisplay(source: unknown): string | null {
  if (!source) return null;

  let rawPayload: Record<string, unknown> | null = null;
  let directMaskedPhone: string | null = null;

  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>;
    if (obj.rawPayload && typeof obj.rawPayload === "object") {
      rawPayload = obj.rawPayload as Record<string, unknown>;
    } else {
      rawPayload = obj;
    }
    if (typeof obj.customerMaskedPhone === "string") {
      directMaskedPhone = obj.customerMaskedPhone;
    }
  }

  const userInfo = (rawPayload?.userInfo && typeof rawPayload.userInfo === "object")
    ? rawPayload.userInfo as Record<string, unknown>
    : null;

  const candidates = [
    directMaskedPhone,
    rawPayload?.secret_phone,
    rawPayload?.customerMaskedPhone,
    rawPayload?.secretPhone,
    userInfo?.secret_phone,
    userInfo?.secretPhone,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.includes("_") || trimmed.includes("#")) continue;
    if (/\d{4}$/.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}
