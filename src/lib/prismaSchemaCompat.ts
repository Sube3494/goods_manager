export function isPrismaMissingColumnError(
  error: unknown,
  columnName: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: unknown;
  };

  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const meta = candidate.meta && typeof candidate.meta === "object"
    ? candidate.meta as Record<string, unknown>
    : null;
  const metaColumn = typeof meta?.column === "string" ? meta.column : "";

  return code === "P2022" && (
    metaColumn.includes(columnName) ||
    message.includes(columnName)
  );
}

export function isPrismaMissingTableError(
  error: unknown,
  tableName: string,
) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: unknown;
  };

  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const meta = candidate.meta && typeof candidate.meta === "object"
    ? candidate.meta as Record<string, unknown>
    : null;
  const metaTable = typeof meta?.table === "string" ? meta.table : "";

  return code === "P2021" && (
    metaTable.includes(tableName) ||
    message.includes(tableName)
  );
}

export function getOutboundOrderItemSchemaErrorMessage(error: unknown) {
  if (
    isPrismaMissingTableError(error, "OutboundOrderItem") ||
    isPrismaMissingColumnError(error, "OutboundOrderItem") ||
    isPrismaMissingColumnError(error, "OutboundOrderItem.costSnapshot")
  ) {
    return "数据库缺少出库明细表 OutboundOrderItem，请先执行 prisma/manual-migrations/20260618_add_outbound_order_items.sql";
  }

  return null;
}
