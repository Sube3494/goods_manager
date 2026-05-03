import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "../../../../../prisma/generated-client";
import { getAuthorizedUserAny } from "@/lib/auth";

// 获取系统设置
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const session = await getAuthorizedUserAny("settings:manage", "backup:manage", "data:transfer");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 使用 upsert 确保记录存在
    const settings = await prisma.systemSetting.upsert({
      where: { id: "system" },
      update: {},
      create: {
        id: "system",
        lowStockThreshold: 10,
        allowDataImport: true,
        allowGalleryUpload: true,
        requireLoginForLightbox: false,
        gallerySortDesc: true,
        storageType: "local",
        uploadConflictStrategy: "hash",
        shareExpireDuration: 1,
        shareExpireUnit: "hours",
        backupEnabled: false,
        backupIntervalUnit: "days",
        backupIntervalValue: 1,
        backupRetention: 10,
        webdavEnabled: false,
        brushCommissionBoostEnabled: false,
        brushCommissionRateMeituan: 0.06,
        brushCommissionRateTaobao: 0.06,
        brushCommissionRateJingdong: 0.06,
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
    const session = await getAuthorizedUserAny("settings:manage", "backup:manage");
    if (!session) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { 
      lowStockThreshold, 
      allowGalleryUpload, 
      requireLoginForLightbox,
      gallerySortDesc,
      allowDataImport,
      storageType,
      minioEndpoint,
      minioPort,
      minioAccessKey,
      minioSecretKey,
      minioBucket,
      minioUseSSL,
      minioPublicUrl,
      uploadConflictStrategy,
      shareExpireDuration,
      shareExpireUnit,
      backupEnabled,
      backupIntervalUnit,
      backupIntervalValue,
      backupRetention,
      webdavEnabled,
      webdavUrl,
      webdavUser,
      webdavPassword,
      webdavPath,
      brushCommissionBoostEnabled,
      brushCommissionRateMeituan,
      brushCommissionRateTaobao,
      brushCommissionRateJingdong,
    } = body;

    const updateData: Prisma.SystemSettingUpdateInput = {};
    if (typeof lowStockThreshold === 'number') updateData.lowStockThreshold = lowStockThreshold;
    if (typeof allowGalleryUpload === 'boolean') updateData.allowGalleryUpload = allowGalleryUpload;
    if (typeof requireLoginForLightbox === 'boolean') updateData.requireLoginForLightbox = requireLoginForLightbox;
    if (typeof gallerySortDesc === 'boolean') updateData.gallerySortDesc = gallerySortDesc;
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
    if (shareExpireDuration !== undefined) updateData.shareExpireDuration = Number(shareExpireDuration);
    if (shareExpireUnit !== undefined) updateData.shareExpireUnit = shareExpireUnit;
    if (backupEnabled !== undefined) updateData.backupEnabled = Boolean(backupEnabled);
    if (backupIntervalUnit !== undefined) updateData.backupIntervalUnit = backupIntervalUnit;
    if (backupIntervalValue !== undefined) updateData.backupIntervalValue = Number(backupIntervalValue);
    if (backupRetention !== undefined) updateData.backupRetention = Number(backupRetention);
    if (webdavEnabled !== undefined) updateData.webdavEnabled = Boolean(webdavEnabled);
    if (webdavUrl !== undefined) updateData.webdavUrl = webdavUrl;
    if (webdavUser !== undefined) updateData.webdavUser = webdavUser;
    if (webdavPassword !== undefined) updateData.webdavPassword = webdavPassword;
    if (webdavPath !== undefined) updateData.webdavPath = webdavPath;
    if (brushCommissionBoostEnabled !== undefined) updateData.brushCommissionBoostEnabled = Boolean(brushCommissionBoostEnabled);
    if (brushCommissionRateMeituan !== undefined) updateData.brushCommissionRateMeituan = Number(brushCommissionRateMeituan);
    if (brushCommissionRateTaobao !== undefined) updateData.brushCommissionRateTaobao = Number(brushCommissionRateTaobao);
    if (brushCommissionRateJingdong !== undefined) updateData.brushCommissionRateJingdong = Number(brushCommissionRateJingdong);

    const settings = await prisma.systemSetting.upsert({
      where: { id: "system" },
      update: updateData,
      create: {
        id: "system",
        lowStockThreshold: (typeof lowStockThreshold === 'number') ? lowStockThreshold : 10,
        allowDataImport: (typeof allowDataImport === 'boolean') ? allowDataImport : true,
        allowGalleryUpload: (typeof allowGalleryUpload === 'boolean') ? allowGalleryUpload : true,
        requireLoginForLightbox: (typeof requireLoginForLightbox === 'boolean') ? requireLoginForLightbox : false,
        gallerySortDesc: (typeof gallerySortDesc === 'boolean') ? gallerySortDesc : true,
        storageType: storageType || "local",
        uploadConflictStrategy: "hash",
        minioEndpoint: minioEndpoint || null,
        minioPort: (minioPort === "" || Number(minioPort) === 0) ? null : Number(minioPort),
        minioAccessKey: minioAccessKey || null,
        minioSecretKey: minioSecretKey || null,
        minioBucket: minioBucket || null,
        minioUseSSL: Boolean(minioUseSSL),
        minioPublicUrl: minioPublicUrl || null,
        shareExpireDuration: (typeof shareExpireDuration === 'number') ? shareExpireDuration : 1,
        shareExpireUnit: shareExpireUnit || "hours",
        backupEnabled: (typeof backupEnabled === 'boolean') ? backupEnabled : false,
        backupIntervalUnit: backupIntervalUnit || "days",
        backupIntervalValue: (typeof backupIntervalValue === 'number') ? backupIntervalValue : 1,
        backupRetention: (typeof backupRetention === 'number') ? backupRetention : 10,
        webdavEnabled: (typeof webdavEnabled === 'boolean') ? webdavEnabled : false,
        webdavUrl: webdavUrl || null,
        webdavUser: webdavUser || null,
        webdavPassword: webdavPassword || null,
        webdavPath: webdavPath || null,
        brushCommissionBoostEnabled: (typeof brushCommissionBoostEnabled === "boolean") ? brushCommissionBoostEnabled : false,
        brushCommissionRateMeituan: brushCommissionRateMeituan !== undefined ? Number(brushCommissionRateMeituan) : 0.06,
        brushCommissionRateTaobao: brushCommissionRateTaobao !== undefined ? Number(brushCommissionRateTaobao) : 0.06,
        brushCommissionRateJingdong: brushCommissionRateJingdong !== undefined ? Number(brushCommissionRateJingdong) : 0.06,
      }
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
