import prisma from "@/lib/prisma";
import {
  readCustomerMaskedPhoneFromRawPayload,
  readCustomerPhoneExtensionFromRawPayload,
  readCustomerPhoneFromRawPayload,
} from "@/lib/autoPickOrders";
import { isAutoPickOrderTerminalStatus } from "@/lib/autoPickOrderStatus";

function normalizeDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "").trim();
}

function readLastFourDigits(value: unknown) {
  const digits = normalizeDigits(value);
  if (digits.length < 4) {
    return null;
  }
  return digits.slice(-4);
}

export function normalizeUnlockVerificationCode(value: unknown) {
  const digits = normalizeDigits(value);
  return digits.length <= 4 ? digits : digits.slice(-4);
}

export function isValidUnlockVerificationCode(value: unknown) {
  return /^\d{4}$/.test(normalizeUnlockVerificationCode(value));
}

export async function verifyScanUnlockCodeByOrders(userId: string, code: string) {
  const normalizedCode = normalizeUnlockVerificationCode(code);
  if (!/^\d{4}$/.test(normalizedCode)) {
    return {
      ok: false,
      reason: "请输入 4 位数字进行校验",
    };
  }

  const recentOrders = await prisma.autoPickOrder.findMany({
    where: {
      userId,
      updatedAt: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
      },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      rawPayload: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 300,
  });

  const activeOrders = recentOrders.filter((order) => !isAutoPickOrderTerminalStatus(order.status));
  if (activeOrders.length === 0) {
    return {
      ok: false,
      reason: "当前没有可用于校验的未完成订单",
    };
  }

  const matchedOrder = activeOrders.find((order) => {
    const orderNoLast4 = readLastFourDigits(order.orderNo);
    if (orderNoLast4 && orderNoLast4 === normalizedCode) {
      return true;
    }

    const phoneLast4 = readLastFourDigits(readCustomerPhoneFromRawPayload(order.rawPayload));
    if (phoneLast4 && phoneLast4 === normalizedCode) {
      return true;
    }

    const maskedPhoneLast4 = readLastFourDigits(readCustomerMaskedPhoneFromRawPayload(order.rawPayload));
    if (maskedPhoneLast4 && maskedPhoneLast4 === normalizedCode) {
      return true;
    }

    const phoneExtensionLast4 = readLastFourDigits(readCustomerPhoneExtensionFromRawPayload(order.rawPayload));
    if (phoneExtensionLast4 && phoneExtensionLast4 === normalizedCode) {
      return true;
    }

    return false;
  });

  if (!matchedOrder) {
    return {
      ok: false,
      reason: "校验失败，请输入订单号后四位或顾客手机号后四位",
    };
  }

  return {
    ok: true,
    orderId: matchedOrder.id,
    orderNo: matchedOrder.orderNo,
  };
}
