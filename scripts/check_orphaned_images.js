const { PrismaClient } = require("../prisma/generated-client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function main() {
    console.log("Collecting database references...");

    const products = await prisma.product.findMany({ select: { image: true } });
    const galleryItems = await prisma.galleryItem.findMany({ select: { url: true } });
    const purchaseOrders = await prisma.purchaseOrder.findMany({
        select: { paymentVoucher: true, paymentVouchers: true }
    });
    const submissions = await prisma.gallerySubmission.findMany({ select: { urls: true } });

    const usedPaths = new Set();

    products.forEach(p => { if (p.image) usedPaths.add(p.image); });
    galleryItems.forEach(gi => { if (gi.url) usedPaths.add(gi.url); });
    purchaseOrders.forEach(po => {
        if (po.paymentVoucher) usedPaths.add(po.paymentVoucher);
        if (po.paymentVouchers) {
            try {
                const vouchers = Array.isArray(po.paymentVouchers) ? po.paymentVouchers : JSON.parse(po.paymentVouchers);
                vouchers.forEach(v => {
                    if (typeof v === 'string') usedPaths.add(v);
                    else if (v && v.url) usedPaths.add(v.url);
                });
            } catch (e) { }
        }
    });
    submissions.forEach(s => {
        if (s.urls) {
            try {
                const urls = Array.isArray(s.urls) ? s.urls : JSON.parse(s.urls);
                urls.forEach(u => {
                    if (typeof u === 'string') usedPaths.add(u);
                    else if (u && u.url) usedPaths.add(u.url);
                });
            } catch (e) { }
        }
    });

    console.log(`Total database references found: ${usedPaths.size}`);

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const allFiles = [];

    function walk(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else {
                // Convert to web path format: /uploads/...
                const relativePath = path.relative(path.join(process.cwd(), "public"), fullPath).replace(/\\/g, "/");
                allFiles.push("/" + relativePath);
            }
        }
    }

    if (fs.existsSync(uploadDir)) {
        walk(uploadDir);
    }

    console.log(`Total files found in public/uploads: ${allFiles.length}`);

    const orphanedFiles = allFiles.filter(f => !usedPaths.has(f));

    console.log(`\nOrphaned files (${orphanedFiles.length}):`);
    orphanedFiles.forEach(f => console.log(f));

    // Also check if any referenced files are missing
    const missingFiles = Array.from(usedPaths).filter(p => p.startsWith("/uploads/") && !allFiles.includes(p));
    if (missingFiles.length > 0) {
        console.log(`\nMissing files referenced in DB (${missingFiles.length}):`);
        missingFiles.forEach(f => console.log(f));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
