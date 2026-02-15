import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Read version from package.json
    const packagePath = path.join(process.cwd(), "package.json");
    const packageData = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
    const version = packageData.version || "0.0.0";

    // 2. Identify database type from DATABASE_URL
    const dbUrl = process.env.DATABASE_URL || "";
    let dbType = "Unknown";
    if (dbUrl.includes("postgresql")) dbType = "PostgreSQL";
    else if (dbUrl.includes("sqlite")) dbType = "SQLite";
    else if (dbUrl.includes("mysql")) dbType = "MySQL";
    else if (dbUrl.includes("mongodb")) dbType = "MongoDB";

    // 3. System info
    const nodeVersion = process.version;
    const platform = process.platform;

    // 4. Public Settings (Safe to expose)
    const settings = await prisma.systemSetting.findUnique({
        where: { id: "system" },
        select: {
            allowGalleryUpload: true,
            allowDataImport: true,
            lastBackup: true
        }
    });

    return NextResponse.json({
      version,
      dbType,
      nodeVersion,
      platform,
      lastBackup: settings?.lastBackup ? new Date(settings.lastBackup).toLocaleString('zh-CN') : "尚未进行过物理备份",
      // Public flags
      allowGalleryUpload: settings?.allowGalleryUpload ?? true,
      allowDataImport: settings?.allowDataImport ?? true
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch system info" }, { status: 500 });
  }
}
