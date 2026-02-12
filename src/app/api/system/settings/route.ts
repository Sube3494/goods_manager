import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "../../../../../prisma/generated-client";

// 获取系统设置
export const dynamic = 'force-dynamic';
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
        allowGalleryUpload: true,
        storageType: "local",
        uploadConflictStrategy: "hash"
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
    const { 
      lowStockThreshold, 
      allowGalleryUpload, 
      allowDataImport,
      storageType,
      minioEndpoint,
      minioPort,
      minioAccessKey,
      minioSecretKey,
      minioBucket,
      minioUseSSL,
      minioPublicUrl,
      uploadConflictStrategy
    } = body;

    const updateData: Prisma.SystemSettingUpdateInput = {};
    if (typeof lowStockThreshold === 'number') updateData.lowStockThreshold = lowStockThreshold;
    if (typeof allowGalleryUpload === 'boolean') updateData.allowGalleryUpload = allowGalleryUpload;
    if (typeof allowDataImport === 'boolean') updateData.allowDataImport = allowDataImport;
    
    // Storage settings
    if (storageType) updateData.storageType = storageType;
    if (minioEndpoint !== undefined) updateData.minioEndpoint = minioEndpoint; // null is valid for Prisma?
    if (minioPort !== undefined) updateData.minioPort = (minioPort === "" || Number(minioPort) === 0) ? null : Number(minioPort);
    if (minioAccessKey !== undefined) updateData.minioAccessKey = minioAccessKey;
    if (minioSecretKey !== undefined) updateData.minioSecretKey = minioSecretKey;
    if (minioBucket !== undefined) updateData.minioBucket = minioBucket;
    if (minioUseSSL !== undefined) updateData.minioUseSSL = Boolean(minioUseSSL);
    if (minioPublicUrl !== undefined) updateData.minioPublicUrl = minioPublicUrl;
    if (uploadConflictStrategy !== undefined) updateData.uploadConflictStrategy = uploadConflictStrategy;

    const settings = await prisma.systemSetting.upsert({
      where: { id: "system" },
      update: updateData,
      create: {
        id: "system",
        lowStockThreshold: (typeof lowStockThreshold === 'number') ? lowStockThreshold : 10,
        allowDataImport: (typeof allowDataImport === 'boolean') ? allowDataImport : true,
        allowGalleryUpload: (typeof allowGalleryUpload === 'boolean') ? allowGalleryUpload : true,
        storageType: storageType || "local",
        uploadConflictStrategy: "hash",
        minioEndpoint: minioEndpoint || null,
        minioPort: (minioPort === "" || Number(minioPort) === 0) ? null : Number(minioPort),
        minioAccessKey: minioAccessKey || null,
        minioSecretKey: minioSecretKey || null,
        minioBucket: minioBucket || null,
        minioUseSSL: Boolean(minioUseSSL),
        minioPublicUrl: minioPublicUrl || null,
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
