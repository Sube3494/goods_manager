import { FinanceMath } from "@/lib/math";

export interface OutboundReturnMetaItem {
  outboundOrderItemId: string;
  productId?: string | null;
  shopProductId?: string | null;
  quantity: number;
  name?: string | null;
  batches?: Array<{
    purchaseOrderItemId: string;
    quantity: number;
    unitCost: number;
  }>;
}

export interface OutboundReturnMetaEntry {
  id: string;
  createdAt: string;
  reason: string;
  refundAmount: number;
  extraExpense: number;
  returnedCost: number;
  inboundOrderId?: string | null;
  items: OutboundReturnMetaItem[];
}

export interface ParsedOutboundReturnMeta {
  visibleNote: string;
  returns: OutboundReturnMetaEntry[];
}

const RETURN_META_START = "\n[RETURN_META]";
const RETURN_META_END = "[/RETURN_META]";

function safeParseReturnMeta(jsonText: string): OutboundReturnMetaEntry[] {
  try {
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const items = Array.isArray(record.items) ? record.items : [];
        return [{
          id: String(record.id || "").trim(),
          createdAt: String(record.createdAt || "").trim(),
          reason: String(record.reason || "").trim() || "退货入库",
          refundAmount: Number(record.refundAmount || 0) || 0,
          extraExpense: Number(record.extraExpense || 0) || 0,
          returnedCost: Number(record.returnedCost || 0) || 0,
          inboundOrderId: String(record.inboundOrderId || "").trim() || null,
          items: items.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return [];
          }
          const raw = item as Record<string, unknown>;
          const outboundOrderItemId = String(raw.outboundOrderItemId || "").trim();
          const quantity = Math.max(0, Number(raw.quantity || 0));
          if (!outboundOrderItemId || quantity <= 0) {
            return [];
          }
          return [{
            outboundOrderItemId,
            productId: String(raw.productId || "").trim() || null,
            shopProductId: String(raw.shopProductId || "").trim() || null,
            quantity,
            name: String(raw.name || "").trim() || null,
            batches: Array.isArray(raw.batches)
              ? raw.batches.flatMap((batch) => {
                  if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
                    return [];
                  }
                  const batchRecord = batch as Record<string, unknown>;
                  const purchaseOrderItemId = String(batchRecord.purchaseOrderItemId || "").trim();
                  const batchQuantity = Math.max(0, Number(batchRecord.quantity || 0));
                  if (!purchaseOrderItemId || batchQuantity <= 0) {
                    return [];
                  }
                  return [{
                    purchaseOrderItemId,
                    quantity: batchQuantity,
                    unitCost: Number(batchRecord.unitCost || 0) || 0,
                  }];
                })
              : [],
          }];
        }),
      } satisfies OutboundReturnMetaEntry].filter((meta) => meta.id && meta.createdAt);
    });
  } catch {
    return [];
  }
}

function stripLegacyReturnSuffix(note: string) {
  return note
    .replace(/\s*\(已退回:\s*.*?\)\s*$/u, "")
    .replace(/\s*\(部分退回(?:\s*[:：].*?)?\)\s*$/u, "")
    .trim();
}

export function parseOutboundReturnMeta(note: string | null | undefined): ParsedOutboundReturnMeta {
  const rawNote = String(note || "");
  const startIndex = rawNote.indexOf(RETURN_META_START);
  const endIndex = rawNote.indexOf(RETURN_META_END);

  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    return {
      visibleNote: stripLegacyReturnSuffix(rawNote),
      returns: [],
    };
  }

  const visiblePart = rawNote.slice(0, startIndex);
  const metaText = rawNote.slice(startIndex + RETURN_META_START.length, endIndex).trim();

  return {
    visibleNote: stripLegacyReturnSuffix(visiblePart.trim()),
    returns: safeParseReturnMeta(metaText),
  };
}

export function stripOutboundReturnMeta(note: string | null | undefined) {
  return parseOutboundReturnMeta(note).visibleNote;
}

export function buildOutboundReturnMetaNote(
  note: string | null | undefined,
  entries: OutboundReturnMetaEntry[],
  status?: string | null
) {
  const visibleNote = stripOutboundReturnMeta(note);
  const metaBlock = `${RETURN_META_START}${JSON.stringify(entries)}${RETURN_META_END}`;
  const summarySuffix = status === "Returned" && entries.length > 0
    ? ` (已退回: ${entries[entries.length - 1]?.reason || "退货入库"})`
    : "";

  return `${visibleNote}${summarySuffix}${metaBlock}`.trim();
}

export function getOutboundReturnedQuantityMap(entries: OutboundReturnMetaEntry[]) {
  const map = new Map<string, number>();
  entries.forEach((entry) => {
    entry.items.forEach((item) => {
      map.set(
        item.outboundOrderItemId,
        (map.get(item.outboundOrderItemId) || 0) + Math.max(0, Number(item.quantity || 0))
      );
    });
  });
  return map;
}

export function getOutboundReturnedBatchQuantityMap(entries: OutboundReturnMetaEntry[]) {
  const map = new Map<string, number>();
  entries.forEach((entry) => {
    entry.items.forEach((item) => {
      (item.batches || []).forEach((batch) => {
        map.set(
          batch.purchaseOrderItemId,
          (map.get(batch.purchaseOrderItemId) || 0) + Math.max(0, Number(batch.quantity || 0))
        );
      });
    });
  });
  return map;
}

export function getOutboundReturnTotals(entries: OutboundReturnMetaEntry[]) {
  return entries.reduce((acc, entry) => ({
    refundAmount: FinanceMath.add(acc.refundAmount, Number(entry.refundAmount || 0)),
    extraExpense: FinanceMath.add(acc.extraExpense, Number(entry.extraExpense || 0)),
    returnedCost: FinanceMath.add(acc.returnedCost, Number(entry.returnedCost || 0)),
  }), {
    refundAmount: 0,
    extraExpense: 0,
    returnedCost: 0,
  });
}

export function getOutboundLatestReturnReason(entries: OutboundReturnMetaEntry[]) {
  if (entries.length === 0) {
    return null;
  }
  return entries[entries.length - 1]?.reason || null;
}
