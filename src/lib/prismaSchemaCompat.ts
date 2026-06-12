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
