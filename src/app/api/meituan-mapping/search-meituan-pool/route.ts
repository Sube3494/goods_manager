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
    const query = searchParams.get("query") || "";
    const batchId = searchParams.get("batchId") || undefined;
    const filterStatus = (searchParams.get("filterStatus") as any) || "ALL";

    const items = await MeituanMappingService.searchMeituanCandidates({
      userId: user.id,
      query,
      batchId,
      filterStatus,
    });

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("GET /api/meituan-mapping/search-meituan-pool 失败:", error);
    return NextResponse.json(
      { error: error.message || "搜索美团候选商品失败" },
      { status: 500 }
    );
  }
}
