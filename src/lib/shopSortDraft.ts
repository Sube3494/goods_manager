export type ShopSortDraft = {
  startNumber: string;
  categories: Array<{ id: string; name: string; rangeSize: string }>;
  rows: Array<{
    id: string;
    sortExcluded?: boolean;
    skuInput: string;
    sortGroupNameInput: string;
    sortCategoryNameInput: string;
  }>;
  updatedAt: number;
};

export function parseShopSortDraft(value: unknown): ShopSortDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as ShopSortDraft;
  const text = (value: unknown, limit = 500) => typeof value === "string" && value.length <= limit;
  if (!text(draft.startNumber) || !Array.isArray(draft.categories) || !Array.isArray(draft.rows)
    || draft.categories.length > 2000 || draft.rows.length > 50000) return null;
  if (!draft.categories.every(category => category && text(category.id) && text(category.name) && text(category.rangeSize))) return null;
  if (!draft.rows.every(row => row && text(row.id) && text(row.skuInput) && text(row.sortGroupNameInput)
    && text(row.sortCategoryNameInput) && (row.sortExcluded === undefined || typeof row.sortExcluded === "boolean"))) return null;
  if (new Set(draft.rows.map(row => row.id)).size !== draft.rows.length
    || new Set(draft.categories.map(category => category.id)).size !== draft.categories.length) return null;
  return {
    startNumber: draft.startNumber,
    categories: draft.categories.map(({ id, name, rangeSize }) => ({ id, name, rangeSize })),
    rows: draft.rows.map(row => ({
      id: row.id, skuInput: row.skuInput, sortGroupNameInput: row.sortGroupNameInput,
      sortCategoryNameInput: row.sortCategoryNameInput,
      ...(row.sortExcluded === undefined ? {} : { sortExcluded: row.sortExcluded }),
    })),
    updatedAt: Number.isFinite(draft.updatedAt) ? draft.updatedAt : Date.now(),
  };
}
