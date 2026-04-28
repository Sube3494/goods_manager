export const AUTO_INBOUND_TYPE = "AutoInbound";
export const AUTO_INBOUND_NOTE_KEYWORD = "库存不足，系统自动补齐";

export function isAutoInboundOrderLike(input: { type?: string | null; note?: string | null }) {
  const type = String(input.type || "").trim();
  const note = String(input.note || "").trim();

  return type === AUTO_INBOUND_TYPE || note.includes(AUTO_INBOUND_NOTE_KEYWORD);
}
