import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { Prisma } from "../../../../prisma/generated-client";
import crypto from "node:crypto";

const KEY_NAME = "deepseekApiKey";
const MODEL_NAME = "deepseekModel";
const CIPHER_PREFIX = "enc:v1:";

function isBrushOrder(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return false;
  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) return false;
  const marker = (systemMeta as Record<string, unknown>).mainSystemSelfDelivery;
  return Boolean(marker && typeof marker === "object" && !Array.isArray(marker) && (marker as Record<string, unknown>).triggered);
}

function readMatchedProduct(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const matched = (rawPayload as Record<string, unknown>).matchedProduct;
  if (!matched || typeof matched !== "object" || Array.isArray(matched)) return null;
  const record = matched as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const productId = typeof record.productId === "string" ? record.productId : "";
  const shopProductId = typeof record.shopProductId === "string" ? record.shopProductId : "";
  const sourceProductId = typeof record.sourceProductId === "string" ? record.sourceProductId : "";
  const name = typeof record.name === "string" ? record.name : typeof record.productName === "string" ? record.productName : "";
  const sku = typeof record.sku === "string" ? record.sku : "";
  return { id, productId, shopProductId, sourceProductId, name, sku };
}

function cipherKey() {
  return crypto.createHash("sha256").update(process.env.AI_KEY_ENCRYPTION_SECRET || process.env.AUTH_SECRET || "change-this-secret").digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${CIPHER_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decrypt(value: string) {
  if (!value.startsWith(CIPHER_PREFIX)) return value;
  const [ivText, tagText, dataText] = value.slice(CIPHER_PREFIX.length).split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

function getKey(user: { permissions?: unknown }) {
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? user.permissions as Record<string, unknown>
    : {};
  return typeof permissions[KEY_NAME] === "string" ? decrypt(permissions[KEY_NAME].trim()) : "";
}

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions) ? user.permissions as Record<string, unknown> : {};
  return NextResponse.json({ configured: Boolean(getKey(user)), model: typeof permissions[MODEL_NAME] === "string" ? permissions[MODEL_NAME] : "deepseek-v4-flash" });
}

export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const submittedKey = String(body.apiKey || "").trim();
  const apiKey = submittedKey === "keep-current-key" ? getKey(user) : submittedKey;
  const model = body.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  if (!apiKey) return NextResponse.json({ error: "请输入 DeepSeek API Key" }, { status: 400 });
  const current = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? user.permissions as Record<string, unknown>
    : {};
  await prisma.user.update({ where: { id: user.id }, data: { permissions: { ...current, [KEY_NAME]: encrypt(apiKey), [MODEL_NAME]: model } } });
  return NextResponse.json({ configured: true, model });
}

export async function DELETE() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};
  delete current[KEY_NAME];
  await prisma.user.update({ where: { id: user.id }, data: { permissions: current as Prisma.InputJsonValue } });
  return NextResponse.json({ configured: false });
}

export async function PUT(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const apiKey = getKey(user);
  if (!apiKey) return NextResponse.json({ error: "请先配置 DeepSeek API Key" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "请输入问题" }, { status: 400 });

  const [
    orders,
    promotions,
    shops,
    shopProducts,
    catalogProducts,
    categories,
    suppliers,
    productJdSkus,
    purchases,
    outbounds,
    brushOrders,
    brushPlans,
    brushProducts,
    settlements,
    operatingProfiles,
    operatingBills,
    batches,
    galleryItems,
    galleryFaqs,
    storeOpeningBatches,
    systemSettings,
    autoCompleteJobs,
    userBusinessProfile,
  ] = await Promise.all([
    prisma.autoPickOrder.findMany({ where: { userId: user.id }, include: { items: { orderBy: { createdAt: "asc" } }, autoCompleteJob: true }, orderBy: { orderTime: "desc" } }),
    prisma.dailyPromotionExpense.findMany({ where: { userId: user.id }, orderBy: { date: "desc" } }),
    prisma.shop.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.shopProduct.findMany({ where: { shop: { userId: user.id } }, include: { shop: true, product: true }, orderBy: { createdAt: "desc" } }),
    prisma.product.findMany({ where: { userId: user.id }, include: { category: true, supplier: true, jdSkuMappings: true }, orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.productJdSku.findMany({ where: { userId: user.id }, include: { product: true }, orderBy: { createdAt: "desc" } }),
    prisma.purchaseOrder.findMany({ where: { userId: user.id }, include: { items: { include: { product: true, shopProduct: true, supplier: true } } }, orderBy: { date: "desc" } }),
    prisma.outboundOrder.findMany({ where: { userId: user.id }, include: { items: { include: { product: true, shopProduct: true } } }, orderBy: { date: "desc" } }),
    prisma.brushOrder.findMany({ where: { userId: user.id }, include: { items: { include: { product: true } } }, orderBy: { date: "desc" } }),
    prisma.brushOrderPlan.findMany({ where: { userId: user.id }, include: { items: { include: { product: true } } }, orderBy: { date: "desc" } }),
    prisma.brushProduct.findMany({ where: { userId: user.id }, include: { product: true, shop: true, shopProduct: true }, orderBy: { createdAt: "desc" } }),
    prisma.settlement.findMany({ where: { userId: user.id }, include: { items: true }, orderBy: { date: "desc" } }),
    prisma.operatingCostProfile.findMany({ where: { userId: user.id }, orderBy: { shopName: "asc" } }),
    prisma.operatingCostMonthlyBill.findMany({ where: { userId: user.id }, orderBy: { monthKey: "desc" } }),
    prisma.productBatch.findMany({ where: { userId: user.id }, include: { product: true, shopProduct: true, purchaseOrderItem: true }, orderBy: { createdAt: "desc" } }),
    prisma.galleryItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    prisma.galleryFaq.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" } }),
    prisma.storeOpeningBatch.findMany({ where: { userId: user.id }, include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.systemSetting.findMany({ where: { userId: user.id }, select: { lowStockThreshold: true, allowDataImport: true, allowGalleryUpload: true, requireLoginForLightbox: true, gallerySortDesc: true, uploadConflictStrategy: true, shareExpireDuration: true, shareExpireUnit: true, backupEnabled: true, backupIntervalUnit: true, backupIntervalValue: true, backupRetention: true, lastBackup: true, updatedAt: true } }),
    prisma.autoPickAutoCompleteJob.findMany({ where: { userId: user.id }, orderBy: { dueAt: "desc" } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true, shippingAddresses: true, brushShops: true, brushCommissionBoostEnabled: true, createdAt: true, updatedAt: true } }),
  ]);
  type ShopProductContext = (typeof shopProducts)[number];
  type SalesProductSummary = {
    productKey: string;
    productName: string;
    sku: string | null;
    platformCounts: Record<string, number>;
    totalQuantity: number;
    orderCount: number;
    brushQuantity: number;
  };
  const shopProductMap = new Map<string, ShopProductContext>(shopProducts.map((item) => [item.id, item]));
  const productIdEntries: Array<[string, ShopProductContext]> = [];
  for (const item of shopProducts) {
    const productId = item.productId || item.sourceProductId || "";
    if (productId) productIdEntries.push([productId, item]);
  }
  const productIdToShopProduct = new Map<string, ShopProductContext>(productIdEntries);
  const salesMap = new Map<string, SalesProductSummary>();
  for (const order of orders) {
    const brush = isBrushOrder(order.rawPayload);
    const valid = !brush && !["cancel", "cancelled", "canceled", "deleted"].includes(String(order.status || "").toLowerCase());
    for (const item of order.items) {
      const matched = readMatchedProduct(item.rawPayload);
      const matchedShopProduct = matched?.shopProductId
        ? shopProductMap.get(matched.shopProductId)
        : matched?.id
          ? shopProductMap.get(matched.id)
          : matched?.productId || matched?.sourceProductId
            ? productIdToShopProduct.get(matched.productId || matched.sourceProductId)
            : null;
      const productKey = matchedShopProduct?.id || matched?.shopProductId || matched?.productId || matched?.id || item.productNo || item.productName;
      const current: SalesProductSummary = salesMap.get(productKey) || {
        productKey,
        productName: matchedShopProduct?.productName || matchedShopProduct?.product?.name || matched?.name || item.productName,
        sku: matchedShopProduct?.sku || matched?.sku || item.productNo || null,
        platformCounts: {},
        totalQuantity: 0,
        orderCount: 0,
        brushQuantity: 0,
      };
      const quantity = Math.max(1, Number(item.quantity || 1) || 1);
      if (valid) {
        current.totalQuantity += quantity;
        current.orderCount += 1;
        const platform = order.platform || "未知平台";
        current.platformCounts[platform] = (current.platformCounts[platform] || 0) + quantity;
      } else if (brush) {
        current.brushQuantity += quantity;
      }
      salesMap.set(productKey, current);
    }
  }
  const context = {
    userBusinessProfile,
    orders: orders.map((order) => ({
      ...order,
      isBrushOrder: isBrushOrder(order.rawPayload),
      items: order.items.map((item) => ({
        ...item,
        productName: item.productName,
        productNo: item.productNo,
        quantity: item.quantity,
        matchedProduct: readMatchedProduct(item.rawPayload),
      })),
    })),
    promotions,
    shops,
    products: catalogProducts,
    shopProducts,
    categories,
    suppliers,
    productJdSkus,
    purchases,
    outbounds,
    brushOrders,
    brushPlans,
    brushProducts,
    settlements,
    operatingProfiles,
    operatingBills,
    batches,
    galleryItems,
    galleryFaqs,
    storeOpeningBatches,
    systemSettings,
    autoCompleteJobs,
    salesByProduct: Array.from(salesMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity),
    note: "这里尽量提供账号下可用于经营分析的全部业务数据：用户经营资料、收货/店铺映射配置、订单、订单商品明细、订单原始业务 payload、商品主库、店铺商品、分类、供应商、采购、出库、刷单、结算、推广、经营成本、库存批次、图库、开店进货、系统设置、自动补全任务等。未提供登录会话、API Key、用户权限、第三方密钥等账号安全数据。orders.items 是订单商品明细；orders.items.rawPayload 保留平台/系统原始业务信息；orders.items.matchedProduct 来自人工/自动匹配的商品关系。salesByProduct 已按非刷单、非取消订单汇总商品销量；totalQuantity 越大表示真实销量越高，brushQuantity 表示刷单数量不计入真实销量。isBrushOrder=true 表示刷单/手动标记刷单。订单时间按 orderTime 归属；金额字段按系统原始单位提供，请结合字段名理解。",
  };
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions) ? user.permissions as Record<string, unknown> : {};
  const model = permissions[MODEL_NAME] === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model, stream: true, temperature: 0.2, thinking: { type: "enabled" }, messages: [
      { role: "system", content: "你是经营数据分析助手。只能根据提供的用户经营数据回答；数字不确定时明确说明，不要编造。你拿到的是账号下尽量完整的业务数据，包括部分原始业务 payload，不要轻易说缺少数据；先检查对应数据表、rawPayload 和汇总字段。回答销量、商品排行时优先使用 salesByProduct，再核对 orders.items、shopProducts、products；回答利润时优先使用订单利润/结算/出库成本/推广/经营成本等字段。使用简洁中文，给出结论和关键依据。" },
      { role: "user", content: `用户问题：${question}\n\n全量经营数据：${JSON.stringify(context)}` },
    ] }),
  });
  if (!response.ok || !response.body) return NextResponse.json({ error: "DeepSeek 调用失败，请检查 API Key" }, { status: 502 });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({ async start(controller) {
    let buffer = "";
    try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data:")) continue; const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue; const delta = JSON.parse(raw).choices?.[0]?.delta || {}; if (delta.reasoning_content) controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "reasoning", delta: delta.reasoning_content }) + "\n")); if (delta.content) controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "answer", delta: delta.content }) + "\n")); } } controller.close(); } catch (error) { controller.error(error); } finally { reader.releaseLock(); } }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
