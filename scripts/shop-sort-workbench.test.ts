import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShopSortUpdate, setShopSortExcluded, getShopSortGroupName, reconcileShopSortCategories, renumberShopSortRows } from "../src/lib/shopSortWorkbench";

test("排除商品清空编码，不占用编号和临时分类；恢复后可以重新编号", () => {
  const rows = makeRows();
  const excluded = setShopSortExcluded({ ...rows[0], skuInput: "1001", sortGroupNameInput: "专用分类" }, true);
  assert.equal(excluded.skuInput, "");
  assert.equal(excluded.sortGroupNameInput, "");
  const numbered = renumberShopSortRows([excluded, rows[1], rows[2]], [], "1001");
  assert.deepEqual(numbered.map(row => row.skuInput), ["", "1001", "1002"]);
  assert.deepEqual(buildShopSortUpdate(numbered[0], 1), {
    id: "1", sku: "", sortNumber: 0, sortGroupName: "", sortCategoryName: "",
  });
  const restored = setShopSortExcluded(numbered[0], false);
  assert.equal(restored.sortExcluded, false);
  assert.equal(renumberShopSortRows([restored], [], "1001")[0].skuInput, "1001");
});

test("已排除商品残留编码和分类也不会保存或进入分类列表", () => {
  const row = { ...makeRows()[0], sortExcluded: true, skuInput: "9999", sortGroupNameInput: "排除分类" };
  assert.deepEqual(reconcileShopSortCategories([row], [], createCategory), []);
  assert.equal(buildShopSortUpdate(row, null).sku, "");
  assert.equal(buildShopSortUpdate(row, null).sortNumber, 0);
});

const createCategory = (name: string) => ({ name, rangeSize: "" });

test("分类列表仅取临时分类，原分类不影响归属和未分配数量", () => {
  const rows = makeRows();
  const result = reconcileShopSortCategories(rows, [], createCategory);
  assert.deepEqual(result.map(category => category.name), ["玩具"]);
  assert.equal(rows.filter(row => !getShopSortGroupName(row)).length, 3);
});

test("草稿缺失的临时分类会补齐，保留已有分类顺序、空分类和编号区间", () => {
  const draft = [{ name: "空分类", rangeSize: "100" }, { name: "食品", rangeSize: "50" }];
  const rows = [...makeRows(), { id: "5", skuInput: "", sortGroupNameInput: "新分类" }];
  const result = reconcileShopSortCategories(rows, draft, createCategory);
  assert.deepEqual(result, [...draft, createCategory("玩具"), createCategory("新分类")]);
  assert.deepEqual(reconcileShopSortCategories(rows, result, createCategory), result);
});

const categories = [{ name: "玩具", rangeSize: "" }, { name: "食品", rangeSize: "" }];
const makeRows = () => [
  { id: "1", skuInput: "", sortGroupNameInput: "", sortCategoryNameInput: "旧分类", categoryName: "玩具" },
  { id: "2", skuInput: "", sortGroupNameInput: "", sortCategoryNameInput: "旧分类", categoryName: "食品" },
  { id: "3", skuInput: "", sortGroupNameInput: "", sortCategoryNameInput: "", categoryName: "" },
  { id: "4", skuInput: "", sortGroupNameInput: " 玩具 ", sortCategoryNameInput: "玩具", categoryName: "食品" },
];

test("转移一个未分类商品后，其余商品继续保持未分类，分类数量之和等于总数", () => {
  let rows = makeRows();
  for (const id of ["1", "2", "3"]) {
    rows = renumberShopSortRows(rows.map(row => row.id === id
      ? { ...row, sortGroupNameInput: "食品", sortCategoryNameInput: "食品" } : row), categories, "1001");
    const unassigned = rows.filter(row => !getShopSortGroupName(row));
    assert.equal(unassigned.length, 3 - Number(id));
    const counts = categories.map(category => rows.filter(row => getShopSortGroupName(row) === category.name).length);
    assert.equal(counts.reduce((sum, count) => sum + count, unassigned.length), rows.length);
    assert.equal(new Set(rows.map(row => row.skuInput)).size, rows.length);
  }
});

test("重新编号、调整分类顺序和区间均不改变分类字段", () => {
  const original = makeRows();
  for (const order of [categories, [...categories].reverse(), [{ name: "食品", rangeSize: "100" }]]) {
    const numbered = renumberShopSortRows(original, order, "A001");
    assert.deepEqual(numbered.map(({ skuInput, ...row }) => row), original.map(({ skuInput, ...row }) => row));
    assert.equal(new Set(numbered.map(row => row.skuInput)).size, original.length);
  }
});
