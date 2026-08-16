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
    const { items } = body as {
      items: Array<{
        itemId?: string;
        meituanSkuId: string;
      }>;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "缺少待解绑数据" }, { status: 400 });
    }

    const result = await MeituanMappingService.unbindItems(user.id, items);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("解绑美团商品失败:", error);
    return NextResponse.json(
      { error: error?.message || "解绑失败" },
      { status: 500 }
    );
  }
}
