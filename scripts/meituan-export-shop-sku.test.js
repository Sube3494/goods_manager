import { beforeEach, expect, mock, test } from "bun:test";
import ExcelJS from "exceljs";

let rows;
let queriedWhere;
const batch = {
  id: "batch-a", userId: "user-a", platform: "meituan", fileName: "美团商品.xlsx",
  items: ["100", "200", "300", "400", "999"].map(id => ({
    meituanSkuId: id, name: `平台商品${id}`, price: 10, imageUrl: null,
    bindProduct: { sku: "主库编码B531", name: "主库商品" },
  })),
};
mock.module("../src/lib/auth", () => ({ getAuthorizedUser: async () => ({ id: "user-a" }) }));
mock.module("../src/lib/prisma", () => ({ default: {
  shop: { findFirst: async ({ where }) => where.id === "shop-a" && where.userId === "user-a"
    ? { id: "shop-a", name: "南山店" } : null },
  meituanImportBatch: { findFirst: async ({ where }) => where.id === batch.id && where.userId === batch.userId && where.platform === batch.platform ? batch : null },
  shopProduct: { findMany: async ({ where }) => {
    queriedWhere = where;
    return rows.filter(row => row.shopId === where.shopId && row.userId === where.shop.userId && row.deletedAt === null);
  } },
} }));
const { MeituanMappingService } = await import("../src/services/meituanMappingService");
const { GET } = await import("../src/app/api/meituan-mapping/export/route");

beforeEach(() => {
  rows = [
    { id: "a", userId: "user-a", shopId: "shop-a", deletedAt: null, sku: "N564", meituanSkuId: "100,200", productName: "南山商品" },
    { id: "empty", userId: "user-a", shopId: "shop-a", deletedAt: null, sku: null, meituanSkuId: "300", productName: "无店内码商品" },
    { id: "zero", userId: "user-a", shopId: "shop-a", deletedAt: null, sku: "00123", meituanSkuId: "400", productName: "前导零商品" },
    { id: "other-shop", userId: "user-a", shopId: "shop-b", deletedAt: null, sku: "别店编码", meituanSkuId: "100" },
    { id: "other-user", userId: "user-b", shopId: "shop-a", deletedAt: null, sku: "别人编码", meituanSkuId: "100" },
    { id: "deleted", userId: "user-a", shopId: "shop-a", deletedAt: new Date(), sku: "已删除编码", meituanSkuId: "999" },
  ];
});

async function workbookFrom(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets[0];
}

test("实际导出的 Excel 使用当前店铺编码，一商品多个美团 ID 分别回写", async () => {
  const { buffer, fileName } = await MeituanMappingService.exportBatchExcel("user-a", "batch-a", "shop-a");
  const sheet = await workbookFrom(buffer);
  expect(sheet.getRow(1).getCell(3).value).toBe("SKU/店内码");
  expect(sheet.getRow(2).getCell(3).value).toBe("N564");
  expect(sheet.getRow(3).getCell(3).value).toBe("N564");
  expect(sheet.getRow(2).getCell(11).value).toBe("店铺品名: 南山商品");
  expect(fileName).toContain("南山店");
  expect(queriedWhere).toEqual({ shopId: "shop-a", shop: { userId: "user-a" }, deletedAt: null });
});

test("未设置店内码、未配对及已删除的商品不回退到主库，前导零保持文本", async () => {
  const { buffer } = await MeituanMappingService.exportBatchExcel("user-a", "batch-a", "shop-a");
  const sheet = await workbookFrom(buffer);
  expect(sheet.getRow(4).getCell(3).value || "").toBe("");
  expect(sheet.getRow(5).getCell(3).value).toBe("00123");
  expect(sheet.getRow(6).getCell(3).value || "").toBe("");
  expect(sheet.rowCount).toBe(6);
});

test("未选择店铺和无权访问店铺时不能导出主库编码", async () => {
  await expect(MeituanMappingService.exportBatchExcel("user-a", "batch-a", "")).rejects.toThrow("选择");
  await expect(MeituanMappingService.exportBatchExcel("user-b", "batch-a", "shop-a")).rejects.toThrow("无权");
  const response = await GET(new Request("http://localhost/api/meituan-mapping/export?batchId=batch-a"));
  expect(response.status).toBe(400);
});

test("当前店铺同一美团 ID 配对多个商品时拒绝任意选择编码", async () => {
  rows.push({ ...rows[0], id: "duplicate", sku: "N999" });
  await expect(MeituanMappingService.exportBatchExcel("user-a", "batch-a", "shop-a")).rejects.toThrow("多个商品");
});

test("导出接口传递当前店铺并返回正确的 Excel 文件", async () => {
  const response = await GET(new Request("http://localhost/api/meituan-mapping/export?batchId=batch-a&shopId=shop-a"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const sheet = await workbookFrom(Buffer.from(await response.arrayBuffer()));
  expect(sheet.getRow(2).getCell(3).value).toBe("N564");
});
