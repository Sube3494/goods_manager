import assert from "node:assert/strict";
import { deleteCatalogProducts, CatalogDeletionScopeError } from "../src/lib/deleteCatalogProducts";
import type { Prisma } from "../prisma/generated-client";
import basePrisma from "../src/lib/prisma";
import catalogPrisma from "../src/lib/catalogPrisma";

type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return (value as Row[]).every((condition) => matches(row, condition));
    if (key === "OR") return (value as Row[]).some((condition) => matches(row, condition));
    if (value && typeof value === "object") {
      if ("in" in value) return (value.in as unknown[]).includes(row[key]);
      return matches(row[key] as Row, value as Row);
    }
    return row[key] === value;
  });
}
function fixture() {
  const product = (id: string, sourceProductId: string | null, userId: string): Row => ({
    id, sourceProductId, userId, deletedAt: null, libraryId: "templates",
    name: id, sku: `SKU-${id}`, image: `${id}.jpg`, costPrice: 10, isDiscontinued: false,
  });
  const products = [product("template", null, "admin"), product("copy", "template", "alice"),
    product("grandchild", "copy", "bob"), product("unrelated", null, "alice")];
  const shops: Row[] = [
    { id: "shop-template", productId: "template", sourceProductId: "template", deletedAt: null, shop: { userId: "alice" }, stock: 5 },
    { id: "shop-copy", productId: "copy", sourceProductId: "template", deletedAt: null, shop: { userId: "alice" }, stock: 8 },
    { id: "standalone-copy", productId: null, sourceProductId: "grandchild", deletedAt: null, shop: { userId: "bob" }, stock: 2 },
    { id: "shop-other", productId: "unrelated", sourceProductId: "unrelated", deletedAt: null, shop: { userId: "alice" }, stock: 4 },
  ];
  const brush: Row[] = [{ productId: "copy", shopProductId: "shop-copy", userId: "alice", isActive: true }];
  const history = [{ productId: "copy", shopProductId: "shop-copy", quantity: 7, amount: 70 }];
  function model(rows: Row[]) {
    return {
      async findMany({ where }: { where: Row }) { return rows.filter((row) => matches(row, where)); },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const affected = rows.filter((row) => matches(row, where));
        affected.forEach((row) => Object.assign(row, data));
        return { count: affected.length };
      },
    };
  }
  const tx = { product: model(products), shopProduct: model(shops), brushProduct: model(brush) } as unknown as
    Pick<Prisma.TransactionClient, "product" | "shopProduct" | "brushProduct">;
  return { tx, products, shops, brush, history };
}

const all = fixture();
const historyBefore = JSON.stringify(all.history);
const result = await deleteCatalogProducts(all.tx, ["template", "template"], { id: "admin", role: "SUPER_ADMIN" }, "templates");
assert.deepEqual(result, { count: 1, copiedCount: 2, shopProductCount: 3, deletedIds: ["template"] });
for (const item of all.products.slice(0, 3)) {
  assert(item.deletedAt instanceof Date);
  assert.equal(item.isDiscontinued, false);
  assert.equal(item.sku, `SKU-${item.id}`);
  assert.equal(item.image, `${item.id}.jpg`);
  assert.equal(item.costPrice, 10);
}
assert.equal(all.products[0].libraryId, "templates", "deletion must preserve the original library for auditing and recovery");
assert.equal(all.products[3].deletedAt, null);
assert.equal(all.shops[3].deletedAt, null);
assert.equal(all.shops[1].stock, 8);
assert.equal(all.brush[0].isActive, false);
assert.equal(JSON.stringify(all.history), historyBefore);
assert(all.products.some((p) => p.id === all.history[0].productId));
assert(all.shops.some((p) => p.id === all.history[0].shopProductId));
assert.equal((await deleteCatalogProducts(all.tx, ["template"], { id: "admin", role: "SUPER_ADMIN" }, "templates")).count, 0);

const own = fixture();
assert.equal((await deleteCatalogProducts(own.tx, ["template"], { id: "alice", role: "USER" }, "templates")).count, 0);
const ownResult = await deleteCatalogProducts(own.tx, ["copy"], { id: "alice", role: "USER" }, "templates");
assert.equal(ownResult.count, 1);
assert.equal(ownResult.copiedCount, 0);
assert.equal(own.products[0].deletedAt, null);
assert.equal(own.products[2].deletedAt, null);

const mismatch = fixture();
const beforeMismatch = JSON.stringify(mismatch);
await assert.rejects(
  deleteCatalogProducts(mismatch.tx, ["template"], { id: "admin", role: "SUPER_ADMIN" }, "other-library"),
  CatalogDeletionScopeError,
);
assert.equal(JSON.stringify(mismatch), beforeMismatch, "wrong-library deletion must not mutate anything");
mismatch.products[3].libraryId = "other-library";
const beforeMixed = JSON.stringify(mismatch);
await assert.rejects(
  deleteCatalogProducts(mismatch.tx, ["template", "unrelated"], { id: "admin", role: "SUPER_ADMIN" }, "templates"),
  CatalogDeletionScopeError,
);
assert.equal(JSON.stringify(mismatch), beforeMixed, "a mixed-library batch must be rejected entirely");

const protectedLibrary = fixture();
protectedLibrary.products[1].libraryId = null;
protectedLibrary.products[2].libraryId = "other-library";
protectedLibrary.shops.push({ id: "other-template-shop", productId: "grandchild", sourceProductId: "template", deletedAt: null });
await deleteCatalogProducts(protectedLibrary.tx, ["template"], { id: "admin", role: "SUPER_ADMIN" }, "templates");
assert(protectedLibrary.products[1].deletedAt instanceof Date, "member copies can still be removed");
assert.equal(protectedLibrary.products[2].deletedAt, null, "another template library cannot be cascaded away");
assert.equal(protectedLibrary.shops[2].deletedAt, null);
assert.equal(protectedLibrary.shops[4].deletedAt, null, "a source reference cannot override another template product");

// Query extensions execute after middleware. Intercept with a final query
// extension to inspect the real predicates without connecting to a database.
const calls: Array<{ args: { where?: unknown } }> = [];
const intercept = {
  query: { $allModels: {
    async $allOperations({ operation, args }: { operation: string; args: object }) {
      calls.push({ args: args as { where?: unknown } });
      return operation === "count" ? 0 : operation === "findUnique" ? null : [];
    },
  } },
};
const active = catalogPrisma.$extends(intercept);
const historical = basePrisma.$extends(intercept);
await active.product.findMany({ where: { libraryId: "templates" } });
await active.shopProduct.count({ where: { shopId: "shop" } });
await active.product.findUnique({ where: { id: "template" } });
await historical.product.findMany({ where: { id: "copy" } });
assert.deepEqual(calls[0].args.where, { libraryId: "templates", deletedAt: null });
assert.deepEqual(calls[1].args.where, { shopId: "shop", deletedAt: null });
assert.deepEqual(calls[2].args.where, { id: "template", deletedAt: null });
assert.deepEqual(calls[3].args.where, { id: "copy" });
await basePrisma.$disconnect();
console.log("PASS: recursive deletion, ownership isolation, preserved historical relations and active catalog filtering");
