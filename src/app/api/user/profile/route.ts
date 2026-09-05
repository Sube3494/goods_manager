import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getAddressDetail, isAddressDisabled } from "@/lib/addressBook";

type ShippingAddressInput = {
  id?: string;
  label?: string;
  address?: string;
  detailAddress?: string;
  contactName?: string;
  contactPhone?: string;
  isDefault?: boolean;
  disabled?: boolean;
  isDisabled?: boolean;
  serviceFeeRate?: number;
  libraryId?: string;
};

function normalizeDefaultShippingAddresses(items: ShippingAddressInput[]) {
  let defaultAssigned = false;
  const normalized = items.map((item) => {
    const disabled = isAddressDisabled(item);
    const isDefault = !disabled && Boolean(item.isDefault) && !defaultAssigned;
    if (isDefault) {
      defaultAssigned = true;
    }
    return { ...item, disabled, isDisabled: undefined, isDefault };
  });
  if (!defaultAssigned) {
    const firstEnabledIndex = normalized.findIndex((item) => !item.disabled);
    if (firstEnabledIndex >= 0) {
      normalized[firstEnabledIndex] = { ...normalized[firstEnabledIndex], isDefault: true };
    }
  }
  return normalized;
}

export async function PATCH(req: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, shippingAddresses, brushShops, brushCommissionBoostEnabled } = body;
    let normalizedShippingAddresses = shippingAddresses;

    if (Array.isArray(shippingAddresses)) {
      const missingLabel = shippingAddresses.find((item) => !String(item?.label || "").trim());
      if (missingLabel) {
        return NextResponse.json({ error: "门店简称为必填项" }, { status: 400 });
      }

      const missingAddress = shippingAddresses.find((item) => !getAddressDetail(item));
      if (missingAddress) {
        return NextResponse.json({ error: "门店详细地址为必填项" }, { status: 400 });
      }

      normalizedShippingAddresses = normalizeDefaultShippingAddresses((shippingAddresses as ShippingAddressInput[]).map((item) => {
        const label = String(item.label || "").trim();
        const detailAddress = getAddressDetail(item);
        const normalizedItem = {
          ...item,
          label,
          detailAddress,
          contactName: String(item.contactName || "").trim(),
          contactPhone: String(item.contactPhone || "").trim(),
          disabled: isAddressDisabled(item),
        };
        return {
          ...normalizedItem,
          address: detailAddress,
          longitude: undefined,
          latitude: undefined,
        };
      }));
    }

    const canUseBrushSimulation = hasPermission(session, "brush:simulate");

    // ── 级联同步：检测 label（门店简称）变更 ──────────────────────────
    if (Array.isArray(normalizedShippingAddresses)) {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.id },
        select: { shippingAddresses: true, permissions: true },
      });
      const oldAddresses = (currentUser?.shippingAddresses as ShippingAddressInput[] | null) ?? [];

      const oldLabelMap = new Map<string, string>();
      for (const addr of oldAddresses) {
        if (addr.id && addr.label) {
          oldLabelMap.set(addr.id, String(addr.label).trim());
        }
      }

      const renamedAddresses: Array<{ id: string; oldLabel: string; newLabel: string }> = [];
      for (const addr of normalizedShippingAddresses as ShippingAddressInput[]) {
        if (!addr.id) continue;
        const oldLabel = oldLabelMap.get(addr.id);
        const newLabel = String(addr.label || "").trim();
        if (oldLabel && oldLabel !== newLabel) {
          renamedAddresses.push({ id: addr.id, oldLabel, newLabel });
        }
      }

      if (renamedAddresses.length > 0) {
        for (const { id: addressId, oldLabel, newLabel } of renamedAddresses) {
          const shop = await prisma.shop.findFirst({
            where: { userId: session.id, addressBookId: addressId },
            select: { id: true },
          });

          if (shop) {
            await prisma.shop.update({ where: { id: shop.id }, data: { name: newLabel } });

            await prisma.$executeRawUnsafe(
              `UPDATE "AutoPickOrder"
               SET "rawPayload" = jsonb_set("rawPayload", '{systemMeta,resolvedShop,name}', $1::jsonb)
               WHERE "shopId" = $2
                 AND "rawPayload"->'systemMeta'->'resolvedShop'->>'name' = $3`,
              JSON.stringify(newLabel),
              shop.id,
              oldLabel
            );
          }

          await prisma.brushOrder.updateMany({
            where: { userId: session.id, shopName: oldLabel },
            data: { shopName: newLabel },
          });

          await prisma.brushOrderPlan.updateMany({
            where: { userId: session.id, shopName: oldLabel },
            data: { shopName: newLabel },
          });
        }

        const perms = (currentUser?.permissions as Record<string, unknown> | null) ?? {};
        const autoPickIntegration = (perms?.autoPickIntegration as Record<string, unknown>) ?? {};
        const maiyatianMappings = autoPickIntegration?.maiyatianShopMappings;
        if (Array.isArray(maiyatianMappings)) {
          let mappingsChanged = false;
          const updatedMappings = maiyatianMappings.map((m: Record<string, unknown>) => {
            const renamed = renamedAddresses.find((r) => r.oldLabel === m.localShopName);
            if (renamed) {
              mappingsChanged = true;
              return { ...m, localShopName: renamed.newLabel };
            }
            return m;
          });
          if (mappingsChanged) {
            const updatedPerms = {
              ...perms,
              autoPickIntegration: { ...autoPickIntegration, maiyatianShopMappings: updatedMappings },
            };
            await prisma.user.update({
              where: { id: session.id },
              data: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                permissions: updatedPerms as any,
              },
            });
          }
        }
      }
    }
    // ── 级联同步结束 ──────────────────────────────────────────────────

    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: {
        name: name || undefined,
        shippingAddresses: normalizedShippingAddresses !== undefined ? normalizedShippingAddresses : undefined,
        brushShops: brushShops !== undefined ? brushShops : undefined,
        brushCommissionBoostEnabled: canUseBrushSimulation && typeof brushCommissionBoostEnabled === "boolean" ? brushCommissionBoostEnabled : undefined,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
