import { strict as assert } from "node:assert";
import { reorderBrushPlanItems, type PlanSortTarget } from "../src/lib/brushPlanSort";
import type { BrushOrderPlanItem } from "../src/lib/types";

const item = (productId: string, orderGroup?: number, platform = "美团"): BrushOrderPlanItem => ({ productId, orderGroup, platform, quantity: 1, searchKeyword: productId, done: false });
const target = (kind: PlanSortTarget["kind"], id: number, platform = "美团"): PlanSortTarget => ({ kind, id, platform });
const names = (items: BrushOrderPlanItem[]) => items.map(item => item.productId);

const items = [item("A", 1), item("淘宝商品", 1, "淘宝"), item("B", 2), item("A2", 1), item("C", 3)];
const moved = reorderBrushPlanItems(items, target("order", 1), target("order", 3), true);
assert.deepEqual(names(moved), ["B", "淘宝商品", "C", "A", "A2"]);
assert.deepEqual(moved.map(item => item.orderGroup), [2, 1, 3, 1, 1]);
assert.deepEqual(names(items), ["A", "淘宝商品", "B", "A2", "C"], "source is immutable");
assert.deepEqual(names(reorderBrushPlanItems(items, target("order", 3), target("order", 1), false)), ["C", "淘宝商品", "A", "A2", "B"]);
assert.deepEqual(names(reorderBrushPlanItems(items, target("item", 3), target("item", 0), false)), ["A2", "淘宝商品", "B", "A", "C"]);
assert.deepEqual(names(reorderBrushPlanItems(items, target("item", 0), target("item", 2), true)), ["B", "淘宝商品", "A", "A2", "C"], "dragging across orders keeps combinations together");
assert.equal(reorderBrushPlanItems(items, target("order", 1), target("order", 1, "淘宝"), true), items, "cannot cross platforms");
assert.equal(reorderBrushPlanItems(items, target("order", 1), target("order", 99), true), items);

const legacy = [item("旧A"), item("旧B"), item("旧C")];
const legacyMoved = reorderBrushPlanItems(legacy, target("order", 3), target("order", 1), false);
assert.deepEqual(names(legacyMoved), ["旧C", "旧A", "旧B"]);
assert.deepEqual(legacyMoved.map(item => item.orderGroup), [3, 1, 2], "fallback groups survive reordering and saving");
assert.deepEqual(names(reorderBrushPlanItems(legacyMoved, target("order", 3), target("order", 2), true)), ["旧A", "旧B", "旧C"]);

const other = [item("其他A", 1, "平台A"), item("美团商品", 2), item("其他B", 3, "平台B")];
assert.deepEqual(names(reorderBrushPlanItems(other, target("order", 3, "其他"), target("order", 1, "其他"), false)), ["其他B", "美团商品", "其他A"]);
console.log("brush plan sorting tests passed");
