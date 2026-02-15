import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { BackupCrypto } from "@/lib/crypto";
import { SessionUser } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession() as SessionUser | null;
    const workspaceId = session?.workspaceId;
    if (!session || !workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { password } = await request.json();
    if (!password || password.length < 6) {
      return NextResponse.json({ error: "密码长度至少为 6 位" }, { status: 400 });
    }

    // 1. 聚合当前工作区数据库表数据
    const database = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      workspaceId,
      categories: await prisma.category.findMany({ where: { workspaceId } }),
      products: await prisma.product.findMany({ where: { workspaceId } }),
      suppliers: await prisma.supplier.findMany({ where: { workspaceId } }),
      purchaseOrders: await prisma.purchaseOrder.findMany({ 
          where: { workspaceId },
          include: { items: true } 
      }),
      outboundOrders: await prisma.outboundOrder.findMany({ 
          where: { workspaceId },
          include: { items: true } 
      }),
      brushOrders: await prisma.brushOrder.findMany({ 
          where: { workspaceId },
          include: { items: true } 
      }),
      galleryItems: await prisma.galleryItem.findMany({ where: { workspaceId } }),
      systemSettings: await prisma.systemSetting.findMany({ where: { workspaceId } }),
      users: await prisma.user.findMany({ where: { workspaceId } }),
      whitelists: await prisma.emailWhitelist.findMany(),
    };

    // 2. 加密序列化后的 JSON
    const jsonString = JSON.stringify(database);
    const encryptedBuffer = BackupCrypto.encrypt(jsonString, password);

    // 3. 更新最后备份时间并返回加密后的 PNK 备份包
    await prisma.systemSetting.update({
      where: { id: "system" },
      data: { lastBackup: new Date() }
    });

    return new Response(encryptedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="PickNote_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.pnk"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    console.error("Encryption backup export failed:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
