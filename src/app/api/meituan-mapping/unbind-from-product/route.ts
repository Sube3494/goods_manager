import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { MeituanMappingService } from "@/services/meituanMappingService";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, meituanSkuId } = body;

    if (!productId || !meituanSkuId) {
      return NextResponse.json(
        { error: "缺少必要参数 productId 或 meituanSkuId" },
        { status: 400 }
      );
    }

    const result = await MeituanMappingService.unbindMeituanFromProduct({
      userId: user.id,
      productId,
      meituanSkuId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("POST /api/meituan-mapping/unbind-from-product 失败:", error);
    return NextResponse.json(
      { error: error.message || "解除美团关联失败" },
      { status: 500 }
    );
  }
}
