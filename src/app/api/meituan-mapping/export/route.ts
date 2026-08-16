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
    const batchId = searchParams.get("batchId");

    if (!batchId) {
      return NextResponse.json({ error: "缺少 batchId 参数" }, { status: 400 });
    }

    const { buffer, fileName } = await MeituanMappingService.exportBatchExcel(user.id, batchId);

    const headers = new Headers();
    headers.set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("导出回写Excel失败:", error);
    return NextResponse.json(
      { error: error?.message || "导出失败" },
      { status: 500 }
    );
  }
}
