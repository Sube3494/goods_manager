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
    const { bindings } = body as {
      bindings: Array<{
        itemId?: string;
        meituanSkuId: string;
        productId: string;
        meituanName?: string;
        meituanSpec?: string;
      }>;
    };

    if (!bindings || !Array.isArray(bindings) || bindings.length === 0) {
      return NextResponse.json({ error: "缺少待绑定数据" }, { status: 400 });
    }

    const result = await MeituanMappingService.bindItems(user.id, bindings);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("绑定美团商品失败:", error);
    return NextResponse.json(
      { error: error?.message || "绑定失败" },
      { status: 500 }
    );
  }
}
