import { NextResponse } from "next/server";
import { isIP } from "node:net";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/uploadValidation";

const IMAGE_FIELDS = [
  "thumb",
  "image",
  "picture",
  "pic_url",
  "app_picture_url",
  "goods_image",
  "product_image",
  "productImage",
  "cover_image",
] as const;

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readMeituanImage(item: { thumb: string | null; rawPayload: unknown }) {
  if (String(item.thumb || "").trim()) return String(item.thumb).trim();
  const raw = readRecord(item.rawPayload);
  for (const field of IMAGE_FIELDS) {
    const value = String(raw[field] || "").trim();
    if (value) return value;
  }
  return "";
}

function isMeituanPlatform(platform: string) {
  const normalized = platform.trim().toLowerCase();
  return normalized.includes("meituan")
    || normalized.includes("美团")
    || normalized.includes("闪购")
    || normalized.includes("shangou");
}

function isPrivateImageHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized === "::1" || normalized === "0.0.0.0") return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return normalized.startsWith("10.")
      || normalized.startsWith("127.")
      || normalized.startsWith("169.254.")
      || normalized.startsWith("192.168.")
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
      || normalized === "255.255.255.255";
  }
  if (ipVersion === 6) {
    return normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
      || normalized === "::";
  }
  return false;
}

function parsePublicImageUrl(value: string) {
  const url = new URL(value);
  if ((url.protocol !== "https:" && url.protocol !== "http:") || isPrivateImageHost(url.hostname)) {
    throw new Error("美团商品图地址不安全");
  }
  return url;
}

async function fetchPublicImage(initialUrl: URL, signal: AbortSignal) {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8",
        "User-Agent": "goods-manager/1.0",
      },
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("美团商品图重定向地址缺失");
    currentUrl = parsePublicImageUrl(new URL(location, currentUrl).toString());
  }
  throw new Error("美团商品图重定向次数过多");
}

async function readImageBuffer(response: Response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > MAX_UPLOAD_SIZE_BYTES) {
      await reader.cancel();
      throw new Error("美团商品图超过 50MB 限制");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, totalSize);
}

function extensionForImageType(contentType: string) {
  const normalized = contentType.split(";")[0].trim().toLowerCase();
  switch (normalized) {
    case "image/jpeg": return "jpg";
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/bmp": return "bmp";
    case "image/avif": return "avif";
    default: return null;
  }
}

function extractManualShopProductIds(rawPayload: unknown) {
  const raw = readRecord(rawPayload);
  const manual = readRecord(raw.manualMatchedProduct);
  return String(manual.shopProductId || manual.id || "")
    .split(/[+＋]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function splitSku(value: string | null) {
  return String(value || "")
    .split(/[+＋]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id, itemId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const shopProductId = String(body?.shopProductId || "").trim();
    if (!shopProductId || shopProductId.includes("+") || shopProductId.includes("＋")) {
      return NextResponse.json({ error: "请选择单个店铺商品" }, { status: 400 });
    }

    const item = await prisma.autoPickOrderItem.findFirst({
      where: {
        id: itemId,
        orderId: id,
        order: user.role === "SUPER_ADMIN" ? undefined : { userId: user.id },
      },
      select: {
        id: true,
        thumb: true,
        rawPayload: true,
        productNo: true,
        platformSkuId: true,
        order: { select: { platform: true } },
      },
    });
    if (!item) {
      return NextResponse.json({ error: "订单商品不存在" }, { status: 404 });
    }
    if (!isMeituanPlatform(item.order.platform)) {
      return NextResponse.json({ error: "仅支持使用美团订单图更新主图" }, { status: 400 });
    }

    const shopProduct = await prisma.shopProduct.findFirst({
      where: {
        id: shopProductId,
        shop: user.role === "SUPER_ADMIN" ? undefined : { userId: user.id },
      },
      select: {
        id: true,
        sku: true,
        meituanSkuId: true,
        productName: true,
      },
    });
    if (!shopProduct) {
      return NextResponse.json({ error: "店铺商品不存在或无权修改" }, { status: 404 });
    }

    const manualIds = extractManualShopProductIds(item.rawPayload);
    const orderSkus = splitSku(item.productNo);
    const platformSkuId = String(item.platformSkuId || "").trim().toLowerCase();
    const meituanIds = String(shopProduct.meituanSkuId || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const targetSku = String(shopProduct.sku || "").trim().toLowerCase();
    const matchesOrderItem = manualIds.includes(shopProduct.id)
      || Boolean(platformSkuId && meituanIds.includes(platformSkuId))
      || Boolean(targetSku && orderSkus.includes(targetSku));
    if (!matchesOrderItem) {
      return NextResponse.json({ error: "该店铺商品与当前订单项不匹配" }, { status: 409 });
    }

    const sourceImage = readMeituanImage(item);
    if (!sourceImage) {
      return NextResponse.json({ error: "当前美团订单没有商品图" }, { status: 400 });
    }
    const imageUrl = parsePublicImageUrl(sourceImage);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    let contentType = "";
    let extension: string | null = null;
    let buffer = Buffer.alloc(0);
    try {
      response = await fetchPublicImage(imageUrl, controller.signal);
      if (!response.ok) {
        return NextResponse.json({ error: `下载美团商品图失败（${response.status}）` }, { status: 502 });
      }
      contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      extension = extensionForImageType(contentType);
      if (!extension) {
        return NextResponse.json({ error: "美团返回的文件不是可支持的图片格式" }, { status: 415 });
      }
      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > MAX_UPLOAD_SIZE_BYTES) {
        return NextResponse.json({ error: "美团商品图超过 50MB 限制" }, { status: 413 });
      }

      buffer = await readImageBuffer(response);
      if (buffer.length === 0) {
        return NextResponse.json({ error: "美团商品图内容为空" }, { status: 422 });
      }
    } finally {
      clearTimeout(timeout);
    }

    const storage = await getStorageStrategy();
    const upload = await storage.upload(buffer, {
      name: `meituan-${shopProduct.sku || shopProduct.id}.${extension}`,
      type: contentType,
      folder: "gallery",
      useTimestamp: true,
    });
    const storedPath = storage.stripUrl(upload.url) || upload.url;
    await prisma.shopProduct.update({
      where: { id: shopProduct.id },
      data: { productImage: storedPath },
    });

    return NextResponse.json({
      ok: true,
      shopProductId: shopProduct.id,
      productName: shopProduct.productName,
      image: storage.resolveUrl(storedPath),
    });
  } catch (error) {
    console.error("Failed to adopt Meituan order image:", error);
    const message = error instanceof Error && error.name === "AbortError"
      ? "下载美团商品图超时"
      : error instanceof Error ? error.message : "更新店铺商品主图失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
