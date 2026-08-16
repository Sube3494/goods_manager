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
    const { itemId, ignored } = body as { itemId: string; ignored: boolean };

    if (!itemId) {
      return NextResponse.json({ error: "缺少 itemId" }, { status: 400 });
    }

    const result = await MeituanMappingService.setItemIgnored(user.id, itemId, Boolean(ignored));

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("修改忽略状态失败:", error);
    return NextResponse.json(
      { error: error?.message || "操作失败" },
      { status: 500 }
    );
  }
}
