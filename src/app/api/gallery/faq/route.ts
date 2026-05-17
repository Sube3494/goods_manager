import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getStorageStrategy } from "@/lib/storage";
import { Prisma } from "../../../../../prisma/generated-client";

type FaqEntry = {
  id: string;
  question: string;
  answer: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of value) {
    const id = normalizeText(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeEntries(value: unknown): FaqEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const raw = item as Record<string, unknown>;
      const question = normalizeText(raw?.question);
      const answer = normalizeText(raw?.answer);
      if (!question) return null;

      return {
        id: normalizeText(raw?.id) || `entry-${index + 1}`,
        question,
        answer,
      };
    })
    .filter((item): item is FaqEntry => Boolean(item));
}

function getFaqEntries(faq: { id: string; question: string; answer: string; entries: Prisma.JsonValue | null }) {
  const normalized = normalizeEntries(faq.entries);
  if (normalized.length > 0) return normalized;

  const legacyQuestion = normalizeText(faq.question);
  if (!legacyQuestion) return [];

  return [
    {
      id: `legacy-${faq.id}`,
      question: legacyQuestion,
      answer: normalizeText(faq.answer),
    },
  ];
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

function canManageGalleryFaq(session: SessionUser | null) {
  if (!session?.id) return false;
  return session.role === "SUPER_ADMIN";
}

function productVisibilityWhere(session: SessionUser | null): Prisma.ProductWhereInput {
  if (!session?.id) return { isPublic: true };
  if (session.role === "SUPER_ADMIN") return {};
  return {
    OR: [
      { userId: session.id },
      { isPublic: true },
    ],
  };
}

async function getVisibleProducts(productIds: string[], session: SessionUser | null) {
  if (productIds.length === 0) return [];

  const storage = await getStorageStrategy();
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      ...productVisibilityWhere(session),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      image: true,
      category: { select: { name: true } },
    },
  });
  const rank = new Map(productIds.map((id, index) => [id, index]));

  return products
    .sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0))
    .map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      image: product.image ? storage.resolveUrl(product.image) : null,
      categoryName: product.category?.name || "",
    }));
}

export async function GET(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!canReadGalleryFaq(session)) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: session?.id ? 403 : 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = normalizeText(searchParams.get("search")).toLowerCase();
    const canEditAny = canManageGalleryFaq(session);

    const faqItems = await prisma.galleryFaq.findMany({
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    const visibleItems = faqItems.filter((faq) => {
      if (!search) return true;
      const entries = getFaqEntries(faq);
      const haystack = [
        faq.title,
        faq.question,
        faq.answer,
        ...entries.flatMap((entry) => [entry.question, entry.answer]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    const items = await Promise.all(
      visibleItems.map(async (faq) => {
        const entries = getFaqEntries(faq);
        return {
          id: faq.id,
          title: normalizeText(faq.title),
          entries,
          productIds: faq.productIds,
          products: await getVisibleProducts(faq.productIds, session),
          canEdit: canEditAny,
          createdAt: faq.createdAt,
          updatedAt: faq.updatedAt,
        };
      })
    );

    return NextResponse.json({ items, canEditAny });
  } catch (error) {
    console.error("Failed to fetch gallery FAQ:", error);
    return NextResponse.json({ error: "Failed to fetch gallery FAQ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!canManageGalleryFaq(session)) {
      return NextResponse.json({ error: "Permission denied" }, { status: session?.id ? 403 : 401 });
    }

    const body = await request.json();
    const title = normalizeText(body.title);
    const entries = normalizeEntries(body.entries);
    const productIds = normalizeProductIds(body.productIds);

    if (entries.length === 0) {
      return NextResponse.json({ error: "至少需要一个问题" }, { status: 400 });
    }

    const created = await prisma.galleryFaq.create({
      data: {
        title,
        question: entries[0].question,
        answer: entries[0].answer,
        entries,
        productIds,
        userId: null,
      },
    });

    return NextResponse.json({
      item: {
        id: created.id,
        title: created.title,
        entries,
        productIds: created.productIds,
        products: await getVisibleProducts(created.productIds, session),
        canEdit: true,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to create gallery FAQ:", error);
    return NextResponse.json({ error: "Failed to create gallery FAQ" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!canManageGalleryFaq(session)) {
      return NextResponse.json({ error: "Permission denied" }, { status: session?.id ? 403 : 401 });
    }

    const body = await request.json();
    const id = normalizeText(body.id);
    const title = normalizeText(body.title);
    const entries = normalizeEntries(body.entries);
    const productIds = normalizeProductIds(body.productIds);

    if (!id || entries.length === 0) {
      return NextResponse.json({ error: "Missing id or entries" }, { status: 400 });
    }

    const existing = await prisma.galleryFaq.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
    }

    const updated = await prisma.galleryFaq.update({
      where: { id },
      data: {
        title,
        question: entries[0].question,
        answer: entries[0].answer,
        entries,
        productIds,
      },
    });

    return NextResponse.json({
      item: {
        id: updated.id,
        title: updated.title,
        entries,
        productIds: updated.productIds,
        products: await getVisibleProducts(updated.productIds, session),
        canEdit: true,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to update gallery FAQ:", error);
    return NextResponse.json({ error: "Failed to update gallery FAQ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!canManageGalleryFaq(session)) {
      return NextResponse.json({ error: "Permission denied" }, { status: session?.id ? 403 : 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = normalizeText(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const existing = await prisma.galleryFaq.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
    }

    await prisma.galleryFaq.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete gallery FAQ:", error);
    return NextResponse.json({ error: "Failed to delete gallery FAQ" }, { status: 500 });
  }
}
