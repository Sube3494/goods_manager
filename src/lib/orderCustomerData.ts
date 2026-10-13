const ADDRESS_FIELDS = [
  "userAddress", "user_address", "map_address", "mapAddress", "address",
  "unencrypted_map_address", "unencryptedMapAddress", "unencrypted_address", "unencryptedAddress",
];
const CONTACT_FIELDS = [
  "customerPhone", "customerMaskedPhone", "secret_phone", "secretPhone",
  "unencrypted_phone", "unencryptedPhone", "phone", "mobile",
  "customerName", "real_name", "realName", "nick_name", "nickName",
];
const CONTACT_CONTAINERS = ["data", "extend", "order", "orderInfo", "order_info", "payload", "userInfo", "user_info"];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function usableContact(value: unknown): string {
  const text = String(value || "").trim();
  return /^(?:null|undefined|-|暂无|未知)$/i.test(text)
    || /保护.*隐私|隐私保护|不支持.*(?:地址|收货|信息).*查看|(?:地址|收货信息).*(?:隐藏|不可见|无法查看)|地址不详|地址未知|待补充/.test(text)
    ? "" : text;
}

function addressQuality(value: unknown): number {
  const text = usableContact(value);
  if (!text) return 0;
  return /[*＊•]|[xX]{3,}/.test(text) ? 1 : 2;
}

export function retainCustomerAddress(incoming: unknown, previous: unknown): string {
  return addressQuality(previous) > addressQuality(incoming)
    ? String(previous || "").trim()
    : usableContact(incoming) || usableContact(previous);
}

// 只合并收货资料，不回填旧状态、金额、商品或退款信息。
export function mergeOrderCustomerPayload(incoming: unknown, previous: unknown, depth = 0): Record<string, unknown> {
  const next = { ...record(incoming) };
  const old = record(previous);
  for (const key of ADDRESS_FIELDS) {
    const address = retainCustomerAddress(next[key], old[key]);
    if (address) next[key] = address;
  }
  for (const key of CONTACT_FIELDS) {
    if (!usableContact(next[key]) && usableContact(old[key])) next[key] = old[key];
  }
  if (depth < 3) {
    for (const key of CONTACT_CONTAINERS) {
      if (!next[key] && !old[key]) continue;
      const merged = mergeOrderCustomerPayload(next[key], old[key], depth + 1);
      if (Object.keys(merged).length) next[key] = merged;
    }
  }
  return next;
}

export function readRetainedCustomerAddress(rawPayload: unknown, depth = 0): string {
  const raw = record(rawPayload);
  let address = "";
  for (const key of ADDRESS_FIELDS) address = retainCustomerAddress(address, raw[key]);
  if (depth < 3) {
    for (const key of CONTACT_CONTAINERS) {
      if (!raw[key]) continue;
      address = retainCustomerAddress(address, readRetainedCustomerAddress(raw[key], depth + 1));
    }
  }
  return address;
}
