import type { BrushOrderPlanItem } from "./types";

export type PlanSortTarget = { kind: "order" | "item"; platform: string; id: number };

// Keep groups fixed before changing array positions, including older plans without group IDs.
export function reorderBrushPlanItems(
    items: BrushOrderPlanItem[], source: PlanSortTarget, target: PlanSortTarget, after: boolean,
): BrushOrderPlanItem[] {
    if (source.kind !== target.kind || source.platform !== target.platform || source.id === target.id) return items;
    const normalized = items.map((item, index) => ({ ...item, orderGroup: item.orderGroup || index + 1 }));
    const matchesPlatform = (item: BrushOrderPlanItem) => {
        const platform = item.platform || "美团";
        return source.platform === "其他" ? !["美团", "淘宝", "京东"].includes(platform) : platform === source.platform;
    };
    const indexes = normalized.flatMap((item, index) => matchesPlatform(item) ? [index] : []);
    if (source.kind === "item") {
        if (!indexes.includes(source.id) || !indexes.includes(target.id)) return items;
        // Across orders, move the existing combination together rather than regrouping products.
        if (normalized[source.id].orderGroup !== normalized[target.id].orderGroup) {
            return reorderBrushPlanItems(normalized,
                { ...source, kind: "order", id: normalized[source.id].orderGroup },
                { ...target, kind: "order", id: normalized[target.id].orderGroup }, after);
        }
        const groupIndexes = indexes.filter(index => normalized[index].orderGroup === normalized[source.id].orderGroup);
        const reordered = groupIndexes.filter(index => index !== source.id);
        reordered.splice(reordered.indexOf(target.id) + Number(after), 0, source.id);
        const result = [...normalized];
        groupIndexes.forEach((index, position) => { result[index] = normalized[reordered[position]]; });
        return result;
    }
    const groups = [...new Set(indexes.map(index => normalized[index].orderGroup))];
    if (!groups.includes(source.id) || !groups.includes(target.id)) return items;
    const reorderedGroups = groups.filter(group => group !== source.id);
    reorderedGroups.splice(reorderedGroups.indexOf(target.id) + Number(after), 0, source.id);
    const reordered = reorderedGroups.flatMap(group => indexes.filter(index => normalized[index].orderGroup === group).map(index => normalized[index]));
    const result = [...normalized];
    indexes.forEach((index, position) => { result[index] = reordered[position]; });
    return result;
}
