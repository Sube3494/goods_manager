import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { MeituanMappingService } from "@/services/meituanMappingService";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId") || undefined;
    const batchId = searchParams.get("batchId") || undefined;
    const platform = searchParams.get("platform") || "meituan";
    const status = (searchParams.get("status") as any) || "ALL";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "25", 10);

    const result = await MeituanMappingService.getShopProductsWithMeituanMapping({
      userId: user.id,
      shopId,
      batchId,
      platform,
      status,
      search,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("GET /api/meituan-mapping/shop-products 失败:", error);
    return NextResponse.json(
      { error: error.message || "获取店铺商品与美团配对列表失败" },
      { status: 500 }
    );
  }
}
