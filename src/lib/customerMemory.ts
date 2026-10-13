import { readRetainedCustomerAddress } from "./orderCustomerData";

export type CustomerMemoryPlatform = "京东" | "淘宝" | "抖店";
export type CustomerMemoryOrder = {
  id?: string;
  platform?: string | null;
  shopId?: string | null;
  userAddress?: string | null;
  customerMaskedPhone?: string | null;
  customerPhone?: string | null;
  rawPayload?: unknown;
  customerPhoneTail?: string | null;
  customerAddressKey?: string | null;
  customerShopKey?: string | null;
};

export const CUSTOMER_MEMORY_PLATFORMS = ["京东", "京东到家", "京东秒送", "jd", "jingdong", "daojia", "淘宝", "淘宝闪购", "taobao", "ebai", "抖店", "抖音", "doudian", "douyin"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function getCustomerMemoryPlatform(platform?: string | null): CustomerMemoryPlatform | null {
  const value = String(platform || "").trim().toLowerCase();
  if (["京东", "京东到家", "京东秒送", "jd", "jingdong", "daojia"].includes(value)) return "京东";
  if (["淘宝", "淘宝闪购", "taobao", "ebai"].includes(value)) return "淘宝";
  if (["抖店", "抖音", "doudian", "douyin"].includes(value)) return "抖店";
  return null;
}

// 只接受真实脱敏号或明确的真实号码字段，不能把虚拟号、分机号当作顾客尾号。
export function readCustomerMemoryPhoneTail(order: CustomerMemoryOrder): string | null {
  const root = record(order.rawPayload);
  const records = [root, ...["data", "extend", "order", "orderInfo", "order_info", "payload", "userInfo", "user_info"].map((key) => record(root[key]))];
  const candidates: unknown[] = [order.customerMaskedPhone];
  const displayCandidates: unknown[] = [order.customerPhone];
  for (const item of records) {
    candidates.push(item.customerMaskedPhone, item.secret_phone, item.secretPhone, item.unencryptedPhone, item.unencrypted_phone);
    const user = record(item.userInfo || item.user_info);
    candidates.push(user.secret_phone, user.secretPhone, user.unencryptedPhone, user.unencrypted_phone);
    displayCandidates.push(item.customerPhone, item.phone, item.mobile, user.customerPhone, user.phone, user.mobile);
  }
  for (const candidate of candidates) {
    const phone = String(candidate || "").trim();
    if (/^1\d{2}(?:\d{4}|[*＊xX•]{3,8})\d{4}$/.test(phone)) return phone.slice(-4);
    if (/^\d{4}$/.test(phone)) return phone;
  }
  // 京东会直接返回“手机尾号9897”，并不一定提供完整的脱敏号。
  for (const candidate of [...candidates, ...displayCandidates]) {
    const phone = String(candidate || "").normalize("NFKC").trim();
    const tail = phone.match(/^(?:真实)?(?:手机|手机号|电话)?(?:尾号|后四位)\s*:?\s*(\d{4})$/);
    if (tail) return tail[1];
    // 普通 phone 字段只允许脱敏号；完整虚拟拨号号码仍不作为真实顾客身份。
    if (/^1\d{2}[*＊xX•]{3,8}\d{4}$/.test(phone)) return phone.slice(-4);
  }
  return /^\d{4}$/.test(order.customerPhoneTail || "") ? order.customerPhoneTail! : null;
}

export function normalizeCustomerMemoryAddress(value: unknown): string | null {
  const address = String(value || "").normalize("NFKC").trim();
  if (!address || /[*＊]|待补充|地址不详|地址未知|自提|自取|保护.*隐私|不支持.*地址.*查看|地址.*(?:隐藏|不可见|无法查看)/.test(address)) return null;
  // 不删除数字间的连字符及楼栋、房号，不用小区/公司地址的模糊相似度合并顾客。
  const normalized = address.replace(/[\s,，。;；、]/g, "").toLowerCase();
  if (normalized.length < 8 || !/号|栋|幢|单元|室|层|楼|办公室|公司|营业部|商铺/.test(normalized)) return null;
  return normalized;
}

export function getCustomerMemoryParts(order: CustomerMemoryOrder) {
  const platform = getCustomerMemoryPlatform(order.platform);
  if (!platform) return null;
  const raw = record(order.rawPayload);
  const meta = record(raw.systemMeta);
  const manualShop = record(meta.manualShopOverride);
  const resolvedShop = record(meta.resolvedShop);
  const shopId = String(manualShop.shopId || resolvedShop.id || order.shopId || raw.shopId || raw.shop_id || "").trim();
  const shopKey = shopId ? `id:${shopId}` : order.customerShopKey || null;
  const phoneTail = readCustomerMemoryPhoneTail(order);
  const visibleAddress = readRetainedCustomerAddress({ userAddress: order.userAddress });
  const addressKey = normalizeCustomerMemoryAddress(order.userAddress)
    || normalizeCustomerMemoryAddress(readRetainedCustomerAddress(raw))
    || (!visibleAddress || /[*＊]/.test(visibleAddress) ? order.customerAddressKey || null : null);
  return { platform, shopKey, phoneTail, addressKey };
}

export function getCustomerMemoryIdentity(order: CustomerMemoryOrder) {
  const parts = getCustomerMemoryParts(order);
  if (!parts?.shopKey || !parts.phoneTail || !parts.addressKey) return null;
  return { platform: parts.platform, shopKey: parts.shopKey, phoneTail: parts.phoneTail, addressKey: parts.addressKey };
}
