type ShopSortRow = {
  id: string;
  sku?: string | null;
  skuInput: string;
  sortGroupNameInput: string;
};

type ShopSortCategory = { name: string; rangeSize: string };

export function getShopSortGroupName(row: Pick<ShopSortRow, "sortGroupNameInput">) {
  return row.sortGroupNameInput.trim();
}

function parseIncrementingCode(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) {
    return {
      prefix: "",
      number: Number(trimmed) || 1,
      suffix: "",
      width: 0,
    };
  }
  return {
    prefix: match[1] || "",
    number: Number(match[2]) || 1,
    suffix: match[3] || "",
    width: match[2].length,
  };
}

function formatIncrementingCode(template: ReturnType<typeof parseIncrementingCode>, number: number) {
  const numericPart = template.width > 0 ? String(number).padStart(template.width, "0") : String(number);
  return `${template.prefix}${numericPart}${template.suffix}`;
}

// 编号操作保留临时分类，只有显式分配或初始化才改变分类。
export function renumberShopSortRows<T extends ShopSortRow>(
  sourceRows: T[], orderedCategories: ShopSortCategory[], startNumber: string
): T[] {
  const template = parseIncrementingCode(startNumber);
  const safeBase = template.number;
  const rowCountByName = new Map<string, number>();
  sourceRows.forEach((row) => {
    const groupName = getShopSortGroupName(row);
    rowCountByName.set(groupName, (rowCountByName.get(groupName) || 0) + 1);
  });
  const sourceOrderById = new Map(sourceRows.map((row, index) => [row.id, index]));
  const categoryStartByName = new Map<string, number>();
  let cursor = safeBase;
  orderedCategories.forEach((category) => {
    const name = category.name.trim();
    categoryStartByName.set(name, cursor);
    const numericRange = Number(category.rangeSize);
    const actualCount = rowCountByName.get(name) || 0;
    const safeCategoryRange = Number.isFinite(numericRange) && numericRange > 0 ? Math.trunc(numericRange) : actualCount;
    cursor += safeCategoryRange;
  });
  const orderByName = new Map(orderedCategories.map((category, index) => [category.name.trim(), index]));
  const sorted = [...sourceRows].sort((a, b) => {
    const groupA = getShopSortGroupName(a);
    const groupB = getShopSortGroupName(b);
    const orderA = orderByName.has(groupA) ? orderByName.get(groupA)! : Number.MAX_SAFE_INTEGER;
    const orderB = orderByName.has(groupB) ? orderByName.get(groupB)! : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    if (groupA !== groupB) return groupA.localeCompare(groupB, "zh-CN");
    const sourceOrderA = sourceOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const sourceOrderB = sourceOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (sourceOrderA !== sourceOrderB) return sourceOrderA - sourceOrderB;
    return (a.sku || "").localeCompare(b.sku || "", "zh-CN", { numeric: true, sensitivity: "base" });
  });

  const offsetByName = new Map<string, number>();
  const numbered = new Map<string, string>();

  for (const row of sorted) {
    const groupName = getShopSortGroupName(row);
    if (!categoryStartByName.has(groupName)) {
      categoryStartByName.set(groupName, cursor);
      cursor += rowCountByName.get(groupName) || 0;
    }
    const offset = offsetByName.get(groupName) || 0;
    const categoryStart = categoryStartByName.get(groupName)!;
    numbered.set(row.id, formatIncrementingCode(template, categoryStart + offset));
    offsetByName.set(groupName, offset + 1);
  }

  return sourceRows.map((row) => {
    return {
      ...row,
      skuInput: numbered.get(row.id) || "",
    };
  });
}
