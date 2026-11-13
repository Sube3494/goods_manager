import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ProductService } from "@/services/productService";
import { Prisma } from "../../../../../../../prisma/generated-client";

// Keep imports of products without a shop SKU idempotent as well.
function importedProductId(shopId: string, sourceId: string) {
  const hash = createHash("sha256").update(JSON.stringify([shopId, sourceId])).digest("hex");
  return `c${hash.slice(0, 24)}`;
}

function remapBundleItems(
  items: Prisma.JsonValue,
  references: Map<string, string>,
  referencesBySku: Map<string, string>,
) {
  if (!Array.isArray(items)) return items ?? Prisma.JsonNull;

  return items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const ids = [item.shopProductId, item.id, item.productId].filter((id): id is string => typeof id === "string" && Boolean(id));
    const componentId = ids.length ? ids.map((id) => references.get(id)).find(Boolean)
      : typeof item.sku === "string" ? referencesBySku.get(item.sku) : undefined;
    if (!componentId) throw new MissingBundleComponentError(String(item.name || item.sku || "未命名配件"));
    return { ...item, id: componentId, shopProductId: componentId, productId: null };
  });
}

class MissingBundleComponentError extends Error {}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthorizedUser("product:import");
    if (!user) return NextResponse.json({ error: "没有导入权限" }, { status: 401 });

    const { id: shopId } = await params;
    const body = await request.json().catch(() => null);
    const sourceShopId = typeof body?.sourceShopId === "string" ? body.sourceShopId.trim() : "";
    if (!sourceShopId || sourceShopId === shopId) {
      return NextResponse.json({ error: "请选择其他店铺作为来源" }, { status: 400 });
    }

    const ids: unknown[] = Array.isArray(body?.productIds) ? body.productIds : [];
    const productIds = new Set(ids.filter((id): id is string => typeof id === "string" && Boolean(id)));
    const importAll = body?.all === true;
    if (!importAll && productIds.size === 0) {
      return NextResponse.json({ error: "请选择要导入的商品" }, { status: 400 });
    }

    const shops = await prisma.shop.count({ where: { id: { in: [shopId, sourceShopId] }, userId: user.id } });
    if (shops !== 2) return NextResponse.json({ error: "店铺不存在或无权访问" }, { status: 404 });

    return await prisma.$transaction(async (tx) => {
      // Serialize imports into the same shop, including the lookup of bundle components.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${shopId}))`;
      const [source, target] = await Promise.all([
        tx.shopProduct.findMany({
          where: {
            shopId: sourceShopId,
            deletedAt: null,
            ...(user.role === "SUPER_ADMIN" ? {} : {
              OR: [
                { productId: null },
                { product: { library: { authorizedUsers: { some: { id: user.id } } } } },
              ],
            }),
          },
          select: {
            id: true,
            sku: true,
            productId: true,
            sourceProductId: true,
            productName: true,
            pinyin: true,
            productImage: true,
            categoryId: true,
            categoryName: true,
            supplierId: true,
            costPrice: true,
            isPublic: true,
            isDiscontinued: true,
            remark: true,
            specs: true,
            isShelfLife: true,
            shelfLifeDays: true,
            sortNumber: true,
            sortGroupName: true,
            sortCategoryName: true,
            isBundle: true,
            bundleItems: true,
            product: {
              select: {
                name: true, image: true, categoryId: true, supplierId: true,
                specs: true, bundleItems: true, category: { select: { name: true } },
              },
            },
          },
        }),
        tx.shopProduct.findMany({
          where: { shopId },
          select: { id: true, sku: true, productId: true, sourceProductId: true, deletedAt: true },
        }),
      ]);
      const selected = source.filter((item) => importAll || productIds.has(item.id));
      if (!importAll && selected.length !== productIds.size) {
        return NextResponse.json({ error: "部分商品已不存在，请重新选择" }, { status: 409 });
      }

      const targetById = new Map(target.map((item) => [item.id, item]));
      const targetBySku = new Map(target.map((item) => [item.sku, item]));
      const targetByProductId = new Map(target.filter((item) => item.productId).map((item) => [item.productId, item]));
      const references = new Map<string, string>();
      const referencesBySku = new Map<string, string>();
      for (const item of target) {
        if (item.deletedAt) continue;
        references.set(item.id, item.id);
        if (item.productId) references.set(item.productId, item.id);
        if (item.sku) referencesBySku.set(item.sku, item.id);
      }
      const existing = new Set<string>();
      for (const item of source) {
        const id = importedProductId(shopId, item.id);
        const productId = item.sourceProductId || item.productId;
        const match = targetById.get(id)
          ?? (productId ? targetByProductId.get(productId) : undefined)
          ?? (item.sku ? targetBySku.get(item.sku) : undefined);
        if (match) existing.add(item.id);
        if (match?.deletedAt || (!match && !importAll && !productIds.has(item.id))) continue;

        const reference = match?.id || id;
        references.set(item.id, reference);
        if (productId && !references.has(productId)) references.set(productId, reference);
        if (item.sku && !referencesBySku.has(item.sku)) referencesBySku.set(item.sku, reference);
      }

      const data: Prisma.ShopProductCreateManyInput[] = [];
      for (const item of selected) {
        if (existing.has(item.id)) continue;
        const name = item.productName || item.product?.name || "未命名商品";
        data.push({
          id: importedProductId(shopId, item.id),
          shopId,
          sku: item.sku,
          productName: name,
          pinyin: item.pinyin || ProductService.generatePinyinSearchText(name),
          productImage: item.productImage || item.product?.image,
          categoryId: item.categoryId || item.product?.categoryId,
          categoryName: item.categoryName || item.product?.category.name,
          supplierId: item.supplierId || item.product?.supplierId,
          costPrice: item.costPrice,
          isPublic: item.isPublic,
          isDiscontinued: item.isDiscontinued,
          remark: item.remark,
          specs: item.specs ?? item.product?.specs ?? Prisma.JsonNull,
          isShelfLife: item.isShelfLife,
          shelfLifeDays: item.shelfLifeDays,
          sortNumber: item.sortNumber,
          sortGroupName: item.sortGroupName,
          sortCategoryName: item.sortCategoryName,
          isBundle: item.isBundle,
          bundleItems: remapBundleItems(item.bundleItems ?? item.product?.bundleItems ?? null, references, referencesBySku),
        });
      }

      const { count } = data.length ? await tx.shopProduct.createMany({ data }) : { count: 0 };
      return NextResponse.json({ imported: count, skipped: selected.length - count });
    }, { timeout: 30_000 });
  } catch (error) {
    if (error instanceof MissingBundleComponentError) {
      return NextResponse.json({ error: `配件「${error.message}」在目标店铺不存在，请一并勾选导入。` }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "目标店铺商品刚刚发生变化，请重试导入" }, { status: 409 });
    }
    console.error("Failed to import products from another shop:", error);
    return NextResponse.json({ error: "从其他店铺导入商品失败" }, { status: 500 });
  }
}
