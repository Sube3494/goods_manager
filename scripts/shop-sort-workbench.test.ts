import assert from "node:assert/strict";
import { test } from "node:test";
import { getShopSortGroupName, renumberShopSortRows } from "../src/lib/shopSortWorkbench";

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
