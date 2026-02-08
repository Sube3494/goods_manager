/*
 * @Date: 2026-02-08 16:29:57
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-02-08 16:55:56
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { SystemSetting } from "@prisma/client";


// 获取系统设置
export async function GET() {
  try {
    // 使用 upsert 确保记录存在
    const settings = await prisma.systemSetting.upsert({
      where: { id: "system" },
      update: {},
      create: {
        id: "system",
        lowStockThreshold: 10,
        allowDataImport: true,
        allowGalleryUpload: true
      }
    });
    
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lowStockThreshold, allowGalleryUpload, allowDataImport } = body;

    const updateData: { lowStockThreshold?: number; allowGalleryUpload?: boolean; allowDataImport?: boolean } = {};
    if (typeof lowStockThreshold === 'number') updateData.lowStockThreshold = lowStockThreshold;
    if (typeof allowGalleryUpload === 'boolean') updateData.allowGalleryUpload = allowGalleryUpload;
    if (typeof allowDataImport === 'boolean') updateData.allowDataImport = allowDataImport;

    const settings = await prisma.systemSetting.upsert({
      where: { id: "system" },
      update: updateData,
      create: {
        id: "system",
        lowStockThreshold: lowStockThreshold ?? 10,
        allowDataImport: allowDataImport ?? true,
        allowGalleryUpload: allowGalleryUpload ?? true
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
