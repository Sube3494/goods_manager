import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

    return NextResponse.json({
      version,
      dbType,
      nodeVersion,
      platform,
      // Backup logic can be expanded here later
      lastBackup: "尚未建立自动备份任务" 
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch system info" }, { status: 500 });
  }
}
