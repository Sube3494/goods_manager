/**
 * 顾客真实脱敏手机号与 4 位尾号纯工具库
 * 必须保持 100% 零服务端/零 Node.js 依赖，确保在 Next.js Client Component 中安全打包
 */

function readTrimmedCandidateValue(candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value && value !== "-" && value !== "undefined" && value !== "null") {
      return value;
    }
  }
  return null;
}

/**
 * 深度解析 rawPayload 获取顾客脱敏手机号（如 182****1789）
 * 穿透 root / userInfo / extend / order / data 等各层级
 */
function readDeepCustomerMaskedPhone(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const root = rawPayload as Record<string, unknown>;
  const userInfo = root.userInfo && typeof root.userInfo === "object" && !Array.isArray(root.userInfo)
    ? root.userInfo as Record<string, unknown>
    : null;

  const directValue = readTrimmedCandidateValue([
    root.customerMaskedPhone,
    root.secret_phone,
    root.secretPhone,
    userInfo?.secret_phone,
    userInfo?.secretPhone,
    userInfo?.customerMaskedPhone,
  ]);
  if (directValue) {
    return directValue;
  }

  const nestedCandidates = [
    root.data,
    root.extend,
    root.order,
    root.orderInfo,
    root.order_info,
    root.extra,
    root.payload,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const nested = candidate as Record<string, unknown>;
    const nestedValue = readTrimmedCandidateValue([
      nested.customerMaskedPhone,
      nested.secret_phone,
      nested.secretPhone,
    ]);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

/**
 * 从订单或其原始报文中提取脱敏真实手机号末尾的 4 位纯数字尾号
 * 例如从 "182****1789" 中提取 "1789"
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

  // 1. 优先使用已存在的直接脱敏号码
  if (directMaskedPhone && !directMaskedPhone.includes("_") && !directMaskedPhone.includes("#")) {
    const match = directMaskedPhone.match(/(\d{4})$/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // 2. 深度穿透解析 rawPayload
  const deepMasked = readDeepCustomerMaskedPhone(rawPayload);
  if (deepMasked && !deepMasked.includes("_") && !deepMasked.includes("#")) {
    const match = deepMasked.match(/(\d{4})$/);
    if (match && match[1]) {
      return match[1];
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

  const deepMasked = readDeepCustomerMaskedPhone(rawPayload);
  if (deepMasked && !deepMasked.includes("_") && !deepMasked.includes("#") && /\d{4}$/.test(deepMasked)) {
    return deepMasked;
  }

  return null;
}
