import { Prisma, PrismaClient } from "../prisma/generated-client";

const prisma = new PrismaClient();

type CustomerAddressItem = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  serviceFeeRate?: number;
  longitude?: number;
  latitude?: number;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  usageCount?: number;
};

type Options = {
  run: boolean;
  userId?: string;
  email?: string;
  json: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const getValue = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    run: args.includes("--run"),
    userId: getValue("--userId"),
    email: getValue("--email"),
    json: args.includes("--json"),
  };
}

function normalizeText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIdentityText(value?: string | null) {
  return normalizeText(value).toLowerCase();
}

function getCustomerKey(item: Pick<CustomerAddressItem, "contactName" | "contactPhone" | "address">) {
  return [
    normalizeIdentityText(item.contactName),
    normalizeIdentityText(item.contactPhone),
    normalizeIdentityText(item.address),
  ].join("|");
}

function buildCustomerLabel(name: string, phone: string, address: string) {
  const suffix = phone ? phone.slice(-4) : address.slice(0, 6);
  return [name, suffix].filter(Boolean).join(" ");
}

function normalizeCustomer(item: Partial<CustomerAddressItem>, index: number): CustomerAddressItem | null {
  const address = normalizeText(item.address || item.detailAddress);
  if (!address) return null;

  const contactName = normalizeText(item.contactName);
  const contactPhone = normalizeText(item.contactPhone);
  return {
    id: normalizeText(item.id) || `customer_${Date.now()}_${index}`,
    label: normalizeText(item.label) || buildCustomerLabel(contactName, contactPhone, address),
    address,
    detailAddress: address,
    contactName,
    contactPhone,
    isDefault: Boolean(item.isDefault),
    serviceFeeRate: typeof item.serviceFeeRate === "number" ? item.serviceFeeRate : undefined,
    longitude: typeof item.longitude === "number" ? item.longitude : undefined,
    latitude: typeof item.latitude === "number" ? item.latitude : undefined,
    source: normalizeText(item.source),
    createdAt: normalizeText(item.createdAt),
    updatedAt: normalizeText(item.updatedAt),
    lastUsedAt: normalizeText(item.lastUsedAt),
    usageCount: typeof item.usageCount === "number" ? item.usageCount : undefined,
  };
}

function mergeCustomer(existing: CustomerAddressItem, incoming: CustomerAddressItem): CustomerAddressItem {
  const createdAtValues = [existing.createdAt, incoming.createdAt].filter(Boolean).sort();
  const updatedAtValues = [existing.updatedAt, incoming.updatedAt].filter(Boolean).sort();
  const lastUsedAtValues = [existing.lastUsedAt, incoming.lastUsedAt].filter(Boolean).sort();

  return {
    ...existing,
    label: existing.label || incoming.label,
    isDefault: Boolean(existing.isDefault || incoming.isDefault),
    source: existing.source || incoming.source,
    createdAt: createdAtValues[0] || "",
    updatedAt: updatedAtValues[updatedAtValues.length - 1] || "",
    lastUsedAt: lastUsedAtValues[lastUsedAtValues.length - 1] || "",
    usageCount: (existing.usageCount || 0) + (incoming.usageCount || 0),
  };
}

function dedupeCustomerAddresses(addresses: unknown) {
  const source = Array.isArray(addresses) ? addresses : [];
  const normalized = source
    .map((item, index) => normalizeCustomer(item as Partial<CustomerAddressItem>, index))
    .filter((item): item is CustomerAddressItem => Boolean(item));

  const groups = new Map<string, CustomerAddressItem[]>();
  const deduped = new Map<string, CustomerAddressItem>();

  for (const customer of normalized) {
    const key = getCustomerKey(customer);
    groups.set(key, [...(groups.get(key) || []), customer]);

    const existing = deduped.get(key);
    deduped.set(key, existing ? mergeCustomer(existing, customer) : customer);
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({
      key,
      count: items.length,
      keptId: deduped.get(key)?.id || "",
      removedIds: items.slice(1).map((item) => item.id || ""),
      name: items[0]?.contactName || "",
      phone: items[0]?.contactPhone || "",
      address: items[0]?.address || "",
      usageCountBefore: items.reduce((sum, item) => sum + (item.usageCount || 0), 0),
    }));

  return {
    before: source.length,
    normalized: normalized.length,
    after: deduped.size,
    removed: normalized.length - deduped.size + (source.length - normalized.length),
    duplicateGroups,
    addresses: Array.from(deduped.values()),
  };
}

async function main() {
  const options = parseArgs();
  const where: Prisma.UserWhereInput = {};
  if (options.userId) where.id = options.userId;
  if (options.email) where.email = options.email;

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      shippingAddresses: true,
    },
    orderBy: { email: "asc" },
  });

  const results = [];
  let changedUsers = 0;
  let totalRemoved = 0;

  for (const user of users) {
    const result = dedupeCustomerAddresses(user.shippingAddresses);
    if (result.removed <= 0) continue;

    changedUsers += 1;
    totalRemoved += result.removed;
    results.push({
      userId: user.id,
      email: user.email,
      before: result.before,
      after: result.after,
      removed: result.removed,
      duplicateGroups: result.duplicateGroups,
    });

    if (options.run) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          shippingAddresses: result.addresses as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  const summary = {
    mode: options.run ? "run" : "dry-run",
    scannedUsers: users.length,
    changedUsers,
    totalRemoved,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`mode: ${summary.mode}`);
  console.log(`scanned users: ${summary.scannedUsers}`);
  console.log(`users with duplicates: ${summary.changedUsers}`);
  console.log(`customer records removed: ${summary.totalRemoved}`);

  for (const item of results) {
    console.log(`\n${item.email} (${item.userId}): ${item.before} -> ${item.after}, removed ${item.removed}`);
    for (const group of item.duplicateGroups) {
      console.log(`  - ${group.name || "未命名客户"} / ${group.phone || "未填写电话"} / ${group.address}`);
      console.log(`    count ${group.count}, kept ${group.keptId}, removed ${group.removedIds.join(", ")}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("dedupe customer addresses failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
