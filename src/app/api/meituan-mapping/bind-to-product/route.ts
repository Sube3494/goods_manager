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
    const { productId, meituanSkuId, meituanSpuId, meituanName, meituanSpec } = body;

    if (!productId || !meituanSkuId) {
      return NextResponse.json(
        { error: "缺少必要参数 productId 或 meituanSkuId" },
        { status: 400 }
      );
    }

    const mapping = await MeituanMappingService.bindMeituanToProduct({
      userId: user.id,
      productId,
      meituanSkuId,
      meituanSpuId,
      meituanName,
      meituanSpec,
    });

    return NextResponse.json({ success: true, mapping });
  } catch (error: any) {
    console.error("POST /api/meituan-mapping/bind-to-product 失败:", error);
    return NextResponse.json(
      { error: error.message || "关联美团商品失败" },
      { status: 500 }
    );
  }
}
