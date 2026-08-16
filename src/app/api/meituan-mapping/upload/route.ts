import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { MeituanMappingService } from "@/services/meituanMappingService";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthorizedUser("product:read");
    if (!user) {
      return NextResponse.json({ error: "未授权或权限不足" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 Excel 文件" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const { items } = await MeituanMappingService.parseMeituanExcel(buffer);

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "未能从文件中解析出商品数据，请检查表格格式" }, { status: 400 });
    }

    const batch = await MeituanMappingService.createImportBatch(
      user.id,
      file.name || "未命名美团商品表格.xlsx",
      items
    );

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      totalCount: batch.totalCount,
      matchedCount: batch.matchedCount,
      message: `成功解析 ${batch.totalCount} 条商品，已匹配 ${batch.matchedCount} 条`,
    });
  } catch (error: any) {
    console.error("美团商品表格导入失败:", error);
    return NextResponse.json(
      { error: error?.message || "导入解析失败，请检查文件格式" },
      { status: 500 }
    );
  }
}
