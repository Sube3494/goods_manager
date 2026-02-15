import prisma from "@/lib/prisma";

export async function initFIFOData() {
  console.log("Starting FIFO data initialization...");

  // 1. Get all Received purchase order items
  const orderItems = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: {
        status: "Received"
      }
    }
  });

  console.log(`Found ${orderItems.length} received items to sync.`);

  for (const item of orderItems) {
    if (item.remainingQuantity === null) {
      await prisma.purchaseOrderItem.update({
        where: { id: item.id },
        data: { remainingQuantity: item.quantity }
      });
    }
  }

  // 2. Handle products where current stock > tracked remainingQuantity
  // This covers manual stock adjustments or imports that didn't create PO items correctly (though our recent import does create PO items)
  const products = await prisma.product.findMany();
  
  for (const product of products) {
    const trackedStock = await prisma.purchaseOrderItem.aggregate({
      where: { 
        productId: product.id,
        purchaseOrder: { status: "Received" }
      },
      _sum: { remainingQuantity: true }
    });

    const totalTracked = trackedStock._sum.remainingQuantity || 0;
    const diff = product.stock - totalTracked;

    if (diff > 0) {
      console.log(`Product ${product.sku || product.name}: current stock ${product.stock}, tracked ${totalTracked}. Creating adjustment batch for ${diff} units.`);
      
      // Create a dummy "Initial Stock" batch
      const orderId = `PO-INIT-${Date.now().toString().slice(-6)}`;
      await prisma.purchaseOrder.create({
        data: {
          id: orderId,
          type: "Adjustment",
          status: "Received",
          date: new Date(2000, 0, 1), // Old date for FIFO priority
          totalAmount: diff * (product.costPrice || 0),
          items: {
            create: [{
              productId: product.id,
              quantity: diff,
              remainingQuantity: diff,
              costPrice: product.costPrice || 0
            }]
          }
        }
      });
    }
  }

  console.log("FIFO data initialization completed.");
  return { success: true };
}
