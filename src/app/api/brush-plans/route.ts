import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from '@/lib/storage';

interface BrushPlanItemInput {
  productId?: string | null;
  productName?: string | null;
  quantity?: number | string;
  searchKeyword?: string | null;
  platform?: string | null;
  note?: string | null;
  done?: boolean;
  sortOrder?: number;
}

type PlanWithItems = {
  userId?: string | null;
  shopName?: string | null;
  items: Array<{
    productId?: string | null;
    product?: {
      image?: string | null;
    } | null;
  }>;
};

async function buildPlanShopProductImageMap(plans: PlanWithItems[]) {
  const shopKeys = Array.from(new Set(
    plans
      .map((plan) => {
        const userId = String(plan.userId || "").trim();
        const shopName = String(plan.shopName || "").trim();
        return userId && shopName ? `${userId}::${shopName}` : "";
      })
      .filter(Boolean)
  ));

  const productIds = Array.from(new Set(
    plans.flatMap((plan) => plan.items.map((item) => String(item.productId || "").trim()).filter(Boolean))
  ));

  if (shopKeys.length === 0 || productIds.length === 0) {
    return new Map<string, string | null>();
  }

  const shops = await prisma.shop.findMany({
    where: {
      OR: shopKeys.map((key) => {
        const [userId, shopName] = key.split("::");
        return {
          userId,
          name: shopName,
        };
      }),
    },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });

  if (shops.length === 0) {
    return new Map<string, string | null>();
  }

  const shopProducts = await prisma.shopProduct.findMany({
    where: {
      shopId: { in: shops.map((shop) => shop.id) },
      OR: [
        { productId: { in: productIds } },
        { sourceProductId: { in: productIds } },
      ],
    },
    select: {
      shopId: true,
      productId: true,
      sourceProductId: true,
      productImage: true,
    },
  });

  const imageMap = new Map<string, string | null>();
  for (const item of shopProducts) {
    const productKeys = [item.productId, item.sourceProductId].filter(Boolean);
    for (const productId of productKeys) {
      const key = `${item.shopId}::${productId}`;
      if (!imageMap.has(key)) {
        imageMap.set(key, item.productImage || null);
      }
    }
  }

  return new Map(
    Array.from(imageMap.entries()).map(([key, image]) => [key, image])
  );
}

async function resolvePlanProductImages<T extends {
  userId?: string | null;
  shopName?: string | null;
  items: Array<{
    productId?: string | null;
    product?: Record<string, unknown> | null;
  }>;
}>(plans: T[]) {
  const storage = await getStorageStrategy();
  const imageMap = await buildPlanShopProductImageMap(plans);

  const shops = await prisma.shop.findMany({
    where: {
      OR: Array.from(new Set(
        plans
          .map((plan) => {
            const userId = String(plan.userId || "").trim();
            const shopName = String(plan.shopName || "").trim();
            return userId && shopName ? `${userId}::${shopName}` : "";
          })
          .filter(Boolean)
      )).map((key) => {
        const [userId, shopName] = key.split("::");
        return { userId, name: shopName };
      }),
    },
    select: {
      id: true,
      userId: true,
      name: true,
    },
  });
  const shopIdByKey = new Map(
    shops.map((shop) => [`${shop.userId}::${shop.name}`, shop.id])
  );

  return plans.map((plan) => {
    const shopKey = `${String(plan.userId || "").trim()}::${String(plan.shopName || "").trim()}`;
    const shopId = shopIdByKey.get(shopKey) || "";
    return {
      ...plan,
      items: plan.items.map((item) => {
        const productId = String(item.productId || "").trim();
        const image = shopId && productId ? imageMap.get(`${shopId}::${productId}`) || null : null;
        return {
          ...item,
          product: item.product ? {
            ...item.product,
            image: image ? storage.resolveUrl(image) : null,
          } : null,
        };
      }),
    };
  });
}

export async function GET(req: NextRequest) {
  const session = await getAuthorizedUser("brush:manage");
  if (!session) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
  const shopName = searchParams.get('shopName');
  const platform = searchParams.get('platform');
  const skip = (page - 1) * limit;

  try {
    const where: Prisma.BrushOrderPlanWhereInput = { userId: session.id };
    if (shopName) {
      where.shopName = shopName;
    }
    if (platform) {
      where.items = {
        some: {
          platform: platform
        }
      };
    }

    const [total, items] = await Promise.all([
      prisma.brushOrderPlan.count({ where }),
      prisma.brushOrderPlan.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      })
    ]);

    const resolvedItems = await resolvePlanProductImages(items);
    const totalPages = Math.ceil(total / limit);
    return NextResponse.json({
      items: resolvedItems,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching brush plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch brush plans' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthorizedUser("brush:manage");
    if (!session) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await req.json();
    const {
      date,
      title,
      shopName,
      items,
      note,
      status,
    } = body;
    
    const plan = await prisma.brushOrderPlan.create({
      data: {
        date: new Date(date),
        title: title || null,
        shopName: shopName || null,
        note: note || null,
        status: status || 'Draft',
        userId: session.id,
        items: {
          create: (items as BrushPlanItemInput[]).map((item, index) => ({
            productId: item.productId || null,
            productName: item.productName || null,
            quantity: parseInt(String(item.quantity || 1)),
            searchKeyword: item.searchKeyword || null,
            platform: item.platform || null,
            note: item.note || null,
            done: item.done || false,
            sortOrder: item.sortOrder || index,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: true
          }
        },
      },
    });

    const [resolvedPlan] = await resolvePlanProductImages([plan]);

    return NextResponse.json(resolvedPlan, { status: 201 });
  } catch (error) {
    console.error('Error creating brush plan:', error);
    return NextResponse.json(
      { error: `Failed to create brush plan: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
