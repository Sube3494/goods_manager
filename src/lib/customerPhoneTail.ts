import { readCustomerMaskedPhoneFromRawPayload } from "@/lib/autoPickOrders";

/**
 * 从订单及其原始报文中提取顾客脱敏真实手机号中的 4 位真实尾号
 * 例如从 "182****1789" 中提取 "1789"
 * 
 * 严格规则：
 * 1. 虚拟隐私号（例如 "15534074635_3686"）带有下划线分机号，3686 为临时分机号，绝非真实尾号，必须排除。
 * 2. 真实尾号只从脱敏手机号（如 182****1789、手机尾号1789）中提取末尾 4 位数字。
 */

export function extractCustomerPhoneTail(source: unknown): string | null {
  if (!source) return null;

  let directMaskedPhone: string | null = null;
  let rawPayload: unknown = source;

  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>;
    if (typeof obj.customerMaskedPhone === "string" && obj.customerMaskedPhone.trim() && obj.customerMaskedPhone !== "-") {
      directMaskedPhone = obj.customerMaskedPhone.trim();
    }
    if (obj.rawPayload) {
      rawPayload = obj.rawPayload;
    }
  }

  // 1. 优先使用传入的已解析 directMaskedPhone
  if (directMaskedPhone && !directMaskedPhone.includes("_") && !directMaskedPhone.includes("#")) {
    const match = directMaskedPhone.match(/(\d{4})$/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // 2. 深度利用系统全面的 readCustomerMaskedPhoneFromRawPayload（穿透 root / data / extend / order / orderInfo 等）
  const systemMaskedPhone = readCustomerMaskedPhoneFromRawPayload(rawPayload);
  if (systemMaskedPhone) {
    const trimmed = systemMaskedPhone.trim();
    if (!trimmed.includes("_") && !trimmed.includes("#")) {
      const match = trimmed.match(/(\d{4})$/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  // 3. 兜底扫描 rawPayload 内部对象
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const root = rawPayload as Record<string, unknown>;
    const userInfo = (root.userInfo && typeof root.userInfo === "object") ? root.userInfo as Record<string, unknown> : null;
    const candidates = [
      root.secret_phone,
      root.secretPhone,
      root.customerMaskedPhone,
      userInfo?.secret_phone,
      userInfo?.secretPhone,
    ];

    for (const c of candidates) {
      if (typeof c !== "string") continue;
      const trimmed = c.trim();
      if (!trimmed || trimmed.includes("_") || trimmed.includes("#")) continue;
      const match = trimmed.match(/(\d{4})$/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  return null;
}

/**
 * 获取用于展示的脱敏真实手机号（例如 182****1789）
 */
export function getCustomerMaskedPhoneDisplay(source: unknown): string | null {
  if (!source) return null;

  let directMaskedPhone: string | null = null;
  let rawPayload: unknown = source;

  if (typeof source === "object" && source !== null) {
    const obj = source as Record<string, unknown>;
    if (typeof obj.customerMaskedPhone === "string" && obj.customerMaskedPhone.trim() && obj.customerMaskedPhone !== "-") {
      directMaskedPhone = obj.customerMaskedPhone.trim();
    }
    if (obj.rawPayload) {
      rawPayload = obj.rawPayload;
    }
  }

  if (directMaskedPhone && !directMaskedPhone.includes("_") && !directMaskedPhone.includes("#") && /\d{4}$/.test(directMaskedPhone)) {
    return directMaskedPhone;
  }

  const systemMasked = readCustomerMaskedPhoneFromRawPayload(rawPayload);
  if (systemMasked && !systemMasked.includes("_") && !systemMasked.includes("#") && /\d{4}$/.test(systemMasked)) {
    return systemMasked;
  }

  return null;
}
