import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../prisma/generated-client";

interface ProductFaqItem {
  id: string;
  question: string;
  answer: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFaq(value: unknown): ProductFaqItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const question = typeof item.question === "string" ? item.question.trim() : "";
      const answer = typeof item.answer === "string" ? item.answer.trim() : "";
      if (!question && !answer) return null;

      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : `faq-${index + 1}`,
        question,
        answer,
      };
    })
    .filter((item): item is ProductFaqItem => Boolean(item));
}

function readProductFaq(specs: unknown): ProductFaqItem[] {
  if (!isRecord(specs)) return [];
  return normalizeFaq(specs.galleryFaq);
}

function canEditProductFaq(session: SessionUser | null, productUserId?: string | null) {
  if (!session?.id) return false;
  if (session.role === "SUPER_ADMIN") return true;
  if (!hasPermission(session, "product:update") && !hasPermission(session, "gallery:upload")) return false;
  return productUserId === session.id;
}

function canReadGalleryFaq(session: SessionUser | null) {
  if (!session?.id) return false;
  return (
    session.role === "SUPER_ADMIN" ||
    hasPermission(session, "gallery:upload") ||
    hasPermission(session, "gallery:download") ||
    hasPermission(session, "gallery:share") ||
    hasPermission(session, "gallery:copy")
  );
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const includeEmpty = searchParams.get("includeEmpty") === "true";
    const pageSize = Math.min(Number(searchParams.get("pageSize") || "300") || 300, 1000);
    const session = await getFreshSession() as SessionUser | null;
    if (!canReadGalleryFaq(session)) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: session?.id ? 403 : 401 });
    }

    const canEditAny = !!session?.id && (
      session.role === "SUPER_ADMIN" ||
      hasPermission(session, "product:update") ||
      hasPermission(session, "gallery:upload")
    );

    const andConditions: Prisma.ProductWhereInput[] = [];

    if (!session?.id) {
      andConditions.push({ isPublic: true });
    } else if (session.role !== "SUPER_ADMIN") {
      andConditions.push({
        OR: [
          { userId: session.id },
          { isPublic: true },
        ],
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search } },
          { sku: { contains: search } },
          { pinyin: { contains: search } },
        ],
      });
    }

    const storage = await getStorageStrategy();
    const products = await prisma.product.findMany({
      where: andConditions.length > 0 ? { AND: andConditions } : undefined,
      take: pageSize,
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        category: { select: { name: true } },
      },
    });

    const items = products
      .map((product) => {
        const faq = readProductFaq(product.specs);
        return {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          image: product.image ? storage.resolveUrl(product.image) : null,
          categoryName: product.category?.name || "",
          faq,
          canEdit: canEditProductFaq(session, product.userId),
          updatedAt: product.updatedAt,
        };
      })
      .filter((item) => includeEmpty && canEditAny ? true : item.faq.length > 0);

    return NextResponse.json({ items, canEditAny });
  } catch (error) {
    console.error("Failed to fetch product FAQ:", error);
    return NextResponse.json({ error: "Failed to fetch product FAQ" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const productId = typeof body.productId === "string" ? body.productId : "";
    const faq = normalizeFaq(body.faq);

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, userId: true, specs: true },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (!canEditProductFaq(session, product.userId)) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const specs: Record<string, Prisma.JsonValue> = isRecord(product.specs)
      ? { ...(product.specs as Record<string, Prisma.JsonValue>) }
      : {};
    if (faq.length > 0) {
      specs.galleryFaq = faq.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      }));
    } else {
      delete specs.galleryFaq;
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        specs: Object.keys(specs).length > 0 ? specs : Prisma.JsonNull,
      },
      select: { id: true, specs: true, updatedAt: true },
    });

    return NextResponse.json({
      productId: updated.id,
      faq: readProductFaq(updated.specs),
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Failed to update product FAQ:", error);
    return NextResponse.json({ error: "Failed to update product FAQ" }, { status: 500 });
  }
}
