import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import * as xlsx from "xlsx";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthorizedUser();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (!hasPermission(session as SessionUser, "setup_purchase:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    
    const batch = await prisma.storeOpeningBatch.findUnique({
      where: { id, userId: session.id }
    });
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // 读取行为数组
    const rawData = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    
    const itemsToCreate = [];
    
    // 预查询商品以便匹配 SKU
    const skus = Array.from(new Set(rawData.slice(1).map(row => String(row[1] || "").trim()).filter(Boolean)));
    const matchingProducts = await prisma.product.findMany({
        where: { sku: { in: skus }, userId: session.id },
        select: { id: true, sku: true }
    });
    const skuToProductId = Object.fromEntries(matchingProducts.map(p => [p.sku, p.id]));

    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;
        
        const productCode = String(row[1] || "").trim();
        if (!productCode) continue;
        
        const quantity = parseInt(row[2]) || 1;
        const unitPrice = parseFloat(row[3]) || 0;
        const totalAmount = parseFloat(row[4]) || 0;
        
        // 移除渠道解析逻辑，统一设为 null 或默认项
        const channel = null;
        
        itemsToCreate.push({
            batchId: id,
            productCode,
            productId: skuToProductId[productCode] || null,
            quantity,
            unitPrice,
            totalAmount,
            channel,
            remark: "Excel导入"
        });
    }

    if (itemsToCreate.length === 0) {
        return NextResponse.json({ error: "未能解析到有效数据，请检查Excel格式" }, { status: 400 });
    }

    const created = await prisma.storeOpeningItem.createMany({
        data: itemsToCreate
    });

    return NextResponse.json({ success: true, count: created.count });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Import error", error);
    return NextResponse.json({ error: "导入失败：" + error.message }, { status: 500 });
  }
}
