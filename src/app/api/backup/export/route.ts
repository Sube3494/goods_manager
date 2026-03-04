/*
 * @Date: 2026-02-15 09:50:56
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-03-02 18:47:00
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { BackupCrypto } from "@/lib/crypto";
import { SessionUser } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getSession() as SessionUser | null;
    const userId = session?.id;
    if (!session || !userId) {
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
      userId,
      categories: await prisma.category.findMany({ where: { userId } }),
      products: await prisma.product.findMany({ where: { userId } }),
      suppliers: await prisma.supplier.findMany({ where: { userId } }),
      purchaseOrders: await prisma.purchaseOrder.findMany({ 
          where: { userId },
          include: { items: true } 
      }),
      outboundOrders: await prisma.outboundOrder.findMany({ 
          where: { userId },
          include: { items: true } 
      }),
      brushOrders: await prisma.brushOrder.findMany({ 
          where: { userId },
          include: { items: true } 
      }),
      galleryItems: await prisma.galleryItem.findMany({ where: { userId } }),
      gallerySubmissions: await prisma.gallerySubmission.findMany({ where: { userId } }),
      systemSettings: await prisma.systemSetting.findMany({ where: { userId } }),
      users: await prisma.user.findMany({ where: { id: userId } }),
      roleProfiles: await prisma.roleProfile.findMany(),
      whitelists: await prisma.emailWhitelist.findMany(),
      invitations: await prisma.invitation.findMany(),
      registrationRequests: await prisma.registrationRequest.findMany(),
      pageViews: await prisma.pageView.findMany(),
      verificationCodes: await prisma.verificationCode.findMany(),
    };

    // 2. 加密序列化后的 JSON
    const jsonString = JSON.stringify(database);
    const encryptedBuffer = BackupCrypto.encrypt(jsonString, password);

    // 3. 先返回备份文件，异步更新最后备份时间（不阻塞响应）
    const response = new Response(Buffer.from(encryptedBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="PickNote_Backup_${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/[-: ]/g, '')}.pnk"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

    // 异步更新备份时间，失败不影响备份文件下载
    prisma.systemSetting.updateMany({
      where: { userId },
      data: { lastBackup: new Date() }
    }).catch(() => {});

    return response;

  } catch (error) {
    console.error("Encryption backup export failed:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
