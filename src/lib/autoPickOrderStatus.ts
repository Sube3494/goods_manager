export function getBaseAutoPickStatusDisplay(status?: string | null) {
  const text = String(status || "").trim();
  const normalized = text.toLowerCase();

  if (!text) return "同步中";

  if (
    text.includes("取消")
    || text.includes("退款")
    || text.includes("关闭")
    || normalized === "cancel"
    || normalized === "cancelled"
    || normalized === "canceled"
    || normalized === "closed"
    || normalized === "refund"
  ) {
    return "已取消";
  }

  if (
    text.includes("已完成")
    || normalized === "done"
    || normalized === "completed"
    || normalized === "complete"
    || normalized === "finished"
    || normalized === "finish"
  ) {
    return "已完成";
  }

  if (text.includes("配送中") || normalized === "delivering") {
    return "配送中";
  }

  if (text.includes("已拣货") || text.includes("拣货中")) {
    return "已拣货";
  }

  return text.split(/[,，]/)[0].trim() || "同步中";
}

export function isAutoPickOrderCompletedStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已完成";
}

export function isAutoPickOrderCancelledStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "已取消";
}

export function isAutoPickOrderTerminalStatus(status?: string | null) {
  const display = getBaseAutoPickStatusDisplay(status);
  return display === "已完成" || display === "已取消";
}

export function isAutoPickOrderDeliveringStatus(status?: string | null) {
  return getBaseAutoPickStatusDisplay(status) === "配送中";
}

export function isAutoPickPickupOrder(rawPayload: unknown, userAddress?: string | null) {
  const candidates = [userAddress];

  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const record = rawPayload as Record<string, unknown>;
    candidates.push(
      String(record.unencrypted_map_address || ""),
      String(record.unencrypted_address || ""),
      String(record.user_remark || ""),
      String(record.address || ""),
      String(record.map_address || ""),
      String(record.deliveryType || ""),
      String(record.delivery_type || ""),
      String(record.fulfilmentType || ""),
      String(record.fulfilment_type || "")
    );
  }

  return candidates.some((item) => /到店自取|门店自取|上门自取|自提/.test(String(item || "").trim()));
}
