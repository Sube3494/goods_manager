import { Prisma } from "../../prisma/generated-client";
import { AddressItem } from "@/lib/types";

type CustomerAddressInput = {
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientAddress?: string | null;
};

type CustomerAddressItem = AddressItem & {
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  usageCount?: number;
};

function normalizeText(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getCustomerKey(item: Pick<CustomerAddressItem, "contactName" | "contactPhone" | "address">) {
  return [
    normalizeText(item.contactName),
    normalizeText(item.contactPhone),
    normalizeText(item.address),
  ].join("|");
}

function buildCustomerLabel(name: string, phone: string, address: string) {
  const suffix = phone ? phone.slice(-4) : address.slice(0, 6);
  return [name, suffix].filter(Boolean).join(" ");
}

export function normalizeCustomerAddresses(addresses: unknown): CustomerAddressItem[] {
  return Array.isArray(addresses)
    ? addresses
        .map((item) => item as Partial<CustomerAddressItem>)
        .filter((item) => normalizeText(item.address))
        .map((item, index) => {
          const address = normalizeText(item.address || item.detailAddress);
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
        })
    : [];
}

export async function collectFactoryShipmentCustomer(
  tx: Prisma.TransactionClient,
  userId: string,
  input: CustomerAddressInput,
  isShipped: boolean = false
) {
  const recipientName = normalizeText(input.recipientName);
  const recipientPhone = normalizeText(input.recipientPhone);
  const recipientAddress = normalizeText(input.recipientAddress);

  if (!recipientName || !recipientAddress) {
    return;
  }

  const dbUser = await tx.user.findUnique({
    where: { id: userId },
    select: { shippingAddresses: true },
  });
  const addresses = normalizeCustomerAddresses(dbUser?.shippingAddresses);
  const now = new Date().toISOString();
  const incomingKey = getCustomerKey({
    contactName: recipientName,
    contactPhone: recipientPhone,
    address: recipientAddress,
  });

  const existingIndex = addresses.findIndex((item) => {
    if (getCustomerKey(item) === incomingKey) return true;
    return Boolean(recipientPhone) && item.contactPhone === recipientPhone && item.contactName === recipientName;
  });

  const nextAddresses = [...addresses];
  if (existingIndex >= 0) {
    const existing = nextAddresses[existingIndex];
    nextAddresses[existingIndex] = {
      ...existing,
      label: existing.label || buildCustomerLabel(recipientName, recipientPhone, recipientAddress),
      address: recipientAddress,
      detailAddress: recipientAddress,
      contactName: recipientName,
      contactPhone: recipientPhone,
      source: existing.source || "factory-shipment",
      updatedAt: now,
      lastUsedAt: now,
      usageCount: (existing.usageCount || 0) + (isShipped ? 1 : 0),
    };
  } else {
    nextAddresses.push({
      id: `customer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      label: buildCustomerLabel(recipientName, recipientPhone, recipientAddress),
      address: recipientAddress,
      detailAddress: recipientAddress,
      contactName: recipientName,
      contactPhone: recipientPhone,
      isDefault: addresses.length === 0,
      source: "factory-shipment",
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
      usageCount: isShipped ? 1 : 0,
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      shippingAddresses: nextAddresses as unknown as Prisma.InputJsonValue,
    },
  });
}

export type { CustomerAddressItem };
