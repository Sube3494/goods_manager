const { PrismaClient } = require("../prisma/generated-client");
const prisma = new PrismaClient();

async function main() {
    const legacyVouchers = await prisma.purchaseOrder.findMany({
        where: {
            paymentVoucher: { not: null }
        },
        select: {
            id: true,
            paymentVoucher: true,
            paymentVouchers: true
        }
    });

    console.log(`Found ${legacyVouchers.length} orders with legacy paymentVoucher.`);

    const needsMigration = legacyVouchers.filter(po => {
        const vouchers = Array.isArray(po.paymentVouchers) ? po.paymentVouchers : [];
        return !vouchers.includes(po.paymentVoucher);
    });

    console.log(`${needsMigration.length} orders need migration.`);
    needsMigration.forEach(po => console.log(`Order ${po.id}: ${po.paymentVoucher}`));

    const isPublicProducts = await prisma.product.count({ where: { isPublic: false } });
    console.log(`Products with isPublic=false: ${isPublicProducts}`);

    const isPublicGallery = await prisma.galleryItem.count({ where: { isPublic: false } });
    console.log(`GalleryItems with isPublic=false: ${isPublicGallery}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
