import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { BackupCrypto } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const password = formData.get("password") as string;

    if (!file || !password) {
      return NextResponse.json({ error: "文件和密码必填" }, { status: 400 });
    }

    // 1. 解密数据
    const arrayBuffer = await file.arrayBuffer();
    const encryptedBuffer = Buffer.from(arrayBuffer);
    
    let decryptedData: string;
    try {
      decryptedData = BackupCrypto.decrypt(encryptedBuffer, password);
    } catch {
      return NextResponse.json({ error: "解密失败，密码错误或文件损坏" }, { status: 400 });
    }

    const data = JSON.parse(decryptedData);

    // 2. 执行数据库事务：全量恢复
    await prisma.$transaction(async (tx) => {
      // 清空现有数据 (按外键依赖顺序逆序删除)
      await tx.brushOrderItem.deleteMany();
      await tx.brushOrder.deleteMany();
      await tx.galleryItem.deleteMany();
      await tx.outboundOrderItem.deleteMany();
      await tx.outboundOrder.deleteMany();
      await tx.purchaseOrderItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.product.deleteMany();
      await tx.supplier.deleteMany();
      await tx.category.deleteMany();
      await tx.emailWhitelist.deleteMany();
      await tx.user.deleteMany();
      await tx.systemSetting.deleteMany(); 

      // 导入数据 (按依赖顺序顺序插入)
      if (data.systemSettings) await tx.systemSetting.createMany({ data: data.systemSettings });
      if (data.whitelists) await tx.emailWhitelist.createMany({ data: data.whitelists });
      if (data.users) await tx.user.createMany({ data: data.users });
      if (data.categories) await tx.category.createMany({ data: data.categories });
      if (data.suppliers) await tx.supplier.createMany({ data: data.suppliers });
      if (data.products) await tx.product.createMany({ data: data.products });
      
      // 级联订单处理
      if (data.purchaseOrders) {
        for (const order of data.purchaseOrders) {
            const { items, ...orderData } = order;
            await tx.purchaseOrder.create({ data: orderData });
            if (items?.length) await tx.purchaseOrderItem.createMany({ data: items });
        }
      }
      if (data.outboundOrders) {
        for (const order of data.outboundOrders) {
            const { items, ...orderData } = order;
            await tx.outboundOrder.create({ data: orderData });
            if (items?.length) await tx.outboundOrderItem.createMany({ data: items });
        }
      }
      if (data.brushOrders) {
        for (const order of data.brushOrders) {
            const { items, ...orderData } = order;
            await tx.brushOrder.create({ data: orderData });
            if (items?.length) await tx.brushOrderItem.createMany({ data: items });
        }
      }
      if (data.galleryItems) await tx.galleryItem.createMany({ data: data.galleryItems });
    });

    return NextResponse.json({ success: true, message: "系统数据已全量恢复" });

  } catch (error) {
    console.error("Restore from encrypted backup failed:", error);
    return NextResponse.json({ error: "导入恢复失败" }, { status: 500 });
  }
}
