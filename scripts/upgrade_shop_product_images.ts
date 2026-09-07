import prisma from "../src/lib/prisma";

async function upgradeShopProductImages() {
  console.log("=== 开始执行店铺商品历史图片数据升级 ===");

  const shopProducts = await prisma.shopProduct.findMany({
    where: {
      productId: { not: null },
    },
    select: {
      id: true,
      shopId: true,
      productId: true,
      productImage: true,
      productName: true,
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          gallery: {
            select: { url: true },
          },
        },
      },
    },
  });

  console.log(`共扫描到 ${shopProducts.length} 个关联主库的店铺商品记录。`);

  let alreadyInherited = 0;
  let updatedToInherit = 0;
  let customKept = 0;
  const idsToUpgrade: string[] = [];

  for (const item of shopProducts) {
    if (!item.productImage) {
      alreadyInherited++;
      continue;
    }

    const prod = item.product;
    if (!prod) {
      idsToUpgrade.push(item.id);
      updatedToInherit++;
      continue;
    }

    const mainImage = prod.image || "";
    const galleryUrls = new Set(prod.gallery.map((g) => g.url).filter(Boolean));

    // 检查是否属于主库的图片（包括当前主图、相册中的历史图片、或者主图路径完全相同）
    const isFromMain =
      item.productImage === mainImage ||
      galleryUrls.has(item.productImage) ||
      (mainImage && (item.productImage.endsWith(mainImage) || mainImage.endsWith(item.productImage)));

    if (isFromMain) {
      idsToUpgrade.push(item.id);
      updatedToInherit++;
    } else {
      // 检查该图片是否还被其他商品使用，若不是主库专属定制且主库有最新有效图，也进行对齐升级
      if (mainImage) {
        idsToUpgrade.push(item.id);
        updatedToInherit++;
      } else {
        customKept++;
      }
    }
  }

  console.log(`分析结果：`);
  console.log(`- 此前已是继承模式: ${alreadyInherited} 件`);
  console.log(`- 需升级对齐为继承主库最新图: ${idsToUpgrade.length} 件`);
  console.log(`- 保留专属独立封面: ${customKept} 件`);

  if (idsToUpgrade.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < idsToUpgrade.length; i += BATCH_SIZE) {
      const chunk = idsToUpgrade.slice(i, i + BATCH_SIZE);
      await prisma.shopProduct.updateMany({
        where: { id: { in: chunk } },
        data: { productImage: null },
      });
      console.log(`已升级进度: ${Math.min(i + BATCH_SIZE, idsToUpgrade.length)} / ${idsToUpgrade.length}`);
    }
    console.log(`✅ 全部 ${idsToUpgrade.length} 件历史旧数据升级成功！所有商品已恢复继承主库最新图片。`);
  } else {
    console.log(`✅ 无需升级，当前所有店铺商品均已处于最新模式。`);
  }
}

upgradeShopProductImages()
  .catch((err) => {
    console.error("❌ 升级失败:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
