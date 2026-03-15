import { PrismaClient } from '../prisma/generated-client';
import prismaInstance from '../src/lib/prisma'; // Try to reuse

const prisma = new PrismaClient();

/**
 * 核心修复逻辑：从 URL 或路径中提取相对路径，支持剥离固化 bucket 名
 */
function stripFullUrl(url: any, bucketName: string = 'picknote'): string | null {
  if (!url || typeof url !== 'string') return url || null;
  
  let objectName = url;
  if (url.startsWith('http')) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      // 如果第一段是 bucket 名，去掉它
      if (pathParts[0] === bucketName) pathParts.shift();
      objectName = pathParts.join("/");
    } catch {
      return url;
    }
  }

  // 即使已经是相对路径，也检查是否带有重复的 bucket 前缀
  if (objectName.startsWith(bucketName + '/')) {
      objectName = objectName.substring(bucketName.length + 1);
  }
  
  // 剥离上传目录前缀
  if (objectName.startsWith('/uploads/')) objectName = objectName.substring(9);
  if (objectName.startsWith('uploads/')) objectName = objectName.substring(8);
  
  return objectName.replace(/^\//, '');
}

async function runProductionMigration() {
  console.log('🚀 开始生产环境数据转换 (修复重复 Bucket 名)...');

  // 获取配置中的 bucket 名 (可选)
  const settings = await prisma.systemSetting.findUnique({ where: { id: 'system' } });
  const bucket = settings?.minioBucket || 'picknote';

  try {
    // 1. 转换 Product 表
    const products = await prisma.product.findMany({
      select: { id: true, image: true }
    });
    console.log(`📦 检查 ${products.length} 个商品图片...`);
    for (const p of products) {
      const rel = stripFullUrl(p.image, bucket);
      if (rel !== p.image) {
        await prisma.product.update({ where: { id: p.id }, data: { image: rel } });
        console.log(`   [Product] ${p.id}: ${p.image} -> ${rel}`);
      }
    }

    // 2. 转换 GalleryItem 表
    const galleryItems = await prisma.galleryItem.findMany({
      select: { id: true, url: true }
    });
    console.log(`🖼️ 检查 ${galleryItems.length} 个画廊条目...`);
    for (const item of galleryItems) {
      const rel = stripFullUrl(item.url, bucket);
      if (rel && rel !== item.url) {
        await prisma.galleryItem.update({ where: { id: item.id }, data: { url: rel } });
        console.log(`   [Gallery] ${item.id}: ${item.url} -> ${rel}`);
      }
    }

    // 3. 转换 PurchaseOrder JSON
    const pos = await prisma.purchaseOrder.findMany({
      select: { id: true, paymentVouchers: true, trackingData: true }
    });
    console.log(`🧾 正在扫描 ${pos.length} 个采购单 JSON 字段...`);
    for (const po of pos) {
      let updated = false;
      let vouchers = po.paymentVouchers as string[] || [];
      if (Array.isArray(vouchers)) {
        const newV = vouchers.map(v => stripFullUrl(v, bucket)).filter(Boolean) as string[];
        if (JSON.stringify(vouchers) !== JSON.stringify(newV)) { vouchers = newV; updated = true; }
      }
      let tracking = po.trackingData as any[] || [];
      if (Array.isArray(tracking)) {
        const newT = tracking.map(t => ({
          ...t,
          waybillImage: stripFullUrl(t.waybillImage, bucket),
          waybillImages: Array.isArray(t.waybillImages) ? t.waybillImages.map((img: any) => stripFullUrl(img, bucket)) : t.waybillImages
        }));
        if (JSON.stringify(tracking) !== JSON.stringify(newT)) { tracking = newT; updated = true; }
      }
      if (updated) {
        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { paymentVouchers: vouchers, trackingData: tracking }
        });
        console.log(`   [PO] ${po.id} 更新`);
      }
    }

    console.log('✅ 迁移成功！重复的前缀已清除。');
  } catch (err) {
    console.error('❌ 迁移失败:', err);
  }
}

runProductionMigration()
  .finally(() => prisma.$disconnect());
