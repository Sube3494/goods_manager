import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { startOfDay } from "date-fns";

export async function GET() {
  try {
    const user = await getAuthorizedUser("shelf_life:read");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const now = new Date();
    const today = startOfDay(now);

    // 获取该用户所有开启了保质期的批次，且仅限制在个人中心地址库店铺
    const allBatches = await prisma.productBatch.findMany({
      where: {
        remainingStock: { gt: 0 },
        product: {
          userId: user.id
        },
        shopProduct: {
          shop: {
            addressBookId: { not: null }
          }
        }
      },
      include: {
        product: {
          select: {
            name: true,
            image: true
          }
        },
        shopProduct: {
          select: {
            productName: true,
            costPrice: true,
            shop: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    let expiredCount = 0;
    let expiredValue = 0;

    let criticalCount = 0;
    let criticalValue = 0;

    let warningCount = 0;
    let warningValue = 0;

    let safeCount = 0;
    let safeValue = 0;

    allBatches.forEach(batch => {
      const expDate = startOfDay(new Date(batch.expirationDate));
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const costPrice = batch.shopProduct?.costPrice || 0;
      const batchValue = batch.remainingStock * costPrice;

      if (diffDays < 0) {
        expiredCount += 1;
        expiredValue += batchValue;
      } else if (diffDays <= 15) {
        criticalCount += 1;
        criticalValue += batchValue;
      } else if (diffDays <= 45) {
        warningCount += 1;
        warningValue += batchValue;
      } else {
        safeCount += 1;
        safeValue += batchValue;
      }
    });

    return NextResponse.json({
      summary: {
        expired: { count: expiredCount, value: Math.round(expiredValue * 100) / 100 },
        critical: { count: criticalCount, value: Math.round(criticalValue * 100) / 100 },
        warning: { count: warningCount, value: Math.round(warningValue * 100) / 100 },
        safe: { count: safeCount, value: Math.round(safeValue * 100) / 100 }
      }
    });

  } catch (error) {
    console.error("Failed to fetch shelf-life statistics:", error);
    return NextResponse.json({ error: "Failed to fetch shelf-life statistics" }, { status: 500 });
  }
}
