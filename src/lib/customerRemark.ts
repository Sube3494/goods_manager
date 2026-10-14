const EMPTY_CARD_CONTENT = /^(?:不需要|无需|不要|无)(?:贺卡|賀卡|卡片)?$/i;
const DEFAULT_SHORTAGE_INSTRUCTION = /^(?:如遇)?缺货时?(?:请)?(?:及时)?(?:电话|致电)(?:与我|和我)?(?:沟通|联系)[。.!！]?$/i;
const JD_ORDER_MARKER = /【\s*JD\d{10,}\s*】/gi;

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;?/gi, "&")
    .replace(/&lt;?/gi, "<")
    .replace(/&gt;?/gi, ">");
}

function isDefaultShortageInstruction(value: string) {
  const unwrapped = value
    .trim()
    .replace(/^[\s(（[【]+|[\s)）\]】]+$/g, "")
    .trim();
  return DEFAULT_SHORTAGE_INSTRUCTION.test(unwrapped);
}

/** Removes marketplace wrappers/default choices, retaining actionable text. */
export function cleanCustomerRemark(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  let remark = decodeHtmlEntities(String(value))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\*\*/g, "")
    .replace(JD_ORDER_MARKER, " ")
    .trim();

  if (!remark) {
    return null;
  }

  // Sections are often concatenated without spaces, so stop at the next label.
  remark = remark.replace(
    /【\s*(卡片内容|如遇缺货|备注)\s*】\s*[:：]?\s*([\s\S]*?)(?=【\s*(?:卡片内容|如遇缺货|备注)\s*】|$)/gi,
    (_match, rawLabel: string, rawContent: string) => {
      const label = rawLabel.trim();
      const content = rawContent.trim();

      if (!content) return " ";
      if (label === "卡片内容" && EMPTY_CARD_CONTENT.test(content)) return " ";
      if (label === "如遇缺货" && isDefaultShortageInstruction(content)) return " ";
      return `${content} `;
    },
  );

  remark = remark
    .replace(/^[\s,，;；:：|｜。.!！、_-]+|[\s,，;；:：|｜。.!！、_-]+$/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  if (isDefaultShortageInstruction(remark)) {
    return null;
  }

  return remark || null;
}

export function firstMeaningfulCustomerRemark(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = cleanCustomerRemark(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function readCardFromRecord(record: Record<string, unknown>): string | null {
  const copy = record.order_copy ?? record.orderCopy;
  const copyCard = typeof copy === "string"
    ? copy.match(/^[ \t]*(?:贺卡|賀卡|卡片内容|卡片內容)[ \t]*[:：][ \t]*([^\r\n]*)/m)?.[1]
    : undefined;
  const explicit = firstMeaningfulCustomerRemark(record.card_content, record.cardContent, record.greeting_card_content, record.greetingCardContent, copyCard);
  // Maiyatian's four-slot extras put the greeting card in slot 1. Other arrays are not remarks.
  const extraCard = Array.isArray(record.extra) && record.extra.length === 4
    && record.extra.every(value => typeof value === "string")
    && (record.source_id || record.sourceId) && typeof record.user_remark === "string"
    ? record.extra[1] : undefined;
  const content = explicit || cleanCustomerRemark(extraCard);
  return content && !EMPTY_CARD_CONTENT.test(content) ? content : null;
}

/** Read normal instructions and separately supplied cards without copying the whole order receipt. */
export function readOrderCustomerRemark(rawPayload: unknown, existingRemark?: unknown): string | null {
  const records: Record<string, unknown>[] = [];
  const visited = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || visited.has(value) || depth > 3) return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    records.push(record);
    for (const key of ["data", "extend", "order", "orderInfo", "order_info", "extra", "payload", "detail", "detailData"]) visit(record[key], depth + 1);
  };
  visit(rawPayload, 0);
  const remark = firstMeaningfulCustomerRemark(existingRemark, ...records.flatMap(record => [
    record.customerRemark, record.user_remark, record.userRemark, record.buyer_remark, record.buyerRemark,
    record.remark, record.memo, record.note,
  ]));
  const card = records.map(readCardFromRecord).find(Boolean);
  if (!card || remark?.includes(card)) return remark;
  return [remark, `贺卡：${card}`].filter(Boolean).join("\n");
}
