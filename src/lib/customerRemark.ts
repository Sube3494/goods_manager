const EMPTY_CARD_CONTENT = /^(?:不需要|无需|不要|无)(?:贺卡|卡片)$/i;
const DEFAULT_SHORTAGE_INSTRUCTION = /^(?:如遇)?缺货时?(?:请)?(?:及时)?(?:电话|致电)(?:与我|和我)?沟通(?:联系)?[。.!！]?$/i;
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
      if (label === "如遇缺货" && DEFAULT_SHORTAGE_INSTRUCTION.test(content)) return " ";
      return `${content} `;
    },
  );

  remark = remark
    .replace(/^[\s,，;；:：|｜。.!！、_-]+|[\s,，;；:：|｜。.!！、_-]+$/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  if (DEFAULT_SHORTAGE_INSTRUCTION.test(remark)) {
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
