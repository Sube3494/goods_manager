import { PrismaClient } from '../prisma/generated-client-new';
import * as xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

async function findProduct(name: string) {
  // Try partial match
  const allProducts = await prisma.product.findMany({ select: { id: true, name: true, sku: true } });
  
  // 1. 完全匹配
  for (const p of allProducts) {
    if (p.name === name || p.sku === name) {
      return p;
    }
  }

  // 2. 包含匹配
  for (const p of allProducts) {
    if (name.includes(p.name) || p.name.includes(name)) {
      return p;
    }
  }

  return null;
}

async function main() {
  const filePath = path.resolve('e:/GitHouse/goods/刷单2月.xlsx');
  const workbook = xlsx.readFile(filePath);
  
  let totalImported = 0;
  let totalErrors = 0;

  for (const sheetName of workbook.SheetNames) {
    console.log(`\nProcessing Sheet: ${sheetName}`);
    
    // Parse date from sheet name, e.g., '2.1' -> '2026-02-01'
    const parts = sheetName.split('.');
    if (parts.length !== 2) {
      console.log(`Skipping sheet ${sheetName} as it does not match 'M.D' format.`);
      continue;
    }
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const date = new Date(2026, month - 1, day, 12, 0, 0); // 默认设置中午 12 点

    const sheet = workbook.Sheets[sheetName];
    // Cast to expected shape
    const data = xlsx.utils.sheet_to_json<any>(sheet);
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row['序号'] === '合计') {
        continue;
      }
      
      const productName = row['商品名称'];
      if (!productName) continue;
      
      const paymentAmount = Number(row['顾客实际支付 (¥)'] || 0);
      const receivedAmount = Number(row['预计收入 (¥)'] || 0);
      
      // Attempt to extract string without brackets, e.g. "双鹰遥控专业JEEP越野车仿真模型 (161.10)" => "双鹰遥控专业JEEP越野车仿真模型"
      let searchName = productName;
      const match = searchName.match(/(.+?)\s*\(/);
      if (match) {
        searchName = match[1].trim();
      }

      const product = await findProduct(searchName);
      
      if (!product) {
        console.log(`[Warn] Sheet ${sheetName} Row ${i+2}: Product not found for "${productName}"`);
        totalErrors++;
        // 导入一个空订单并将名称放入备注
        await prisma.brushOrder.create({
          data: {
            date,
            type: '美团',
            status: 'Completed',
            paymentAmount,
            receivedAmount,
            note: `未匹配到商品: ${productName}`,
          }
        });
        totalImported++;
        continue;
      }
      
      await prisma.brushOrder.create({
        data: {
          date,
          type: '美团',
          status: 'Completed',
          paymentAmount,
          receivedAmount,
          items: {
            create: [
              {
                productId: product.id,
                quantity: 1,
              }
            ]
          }
        }
      });
      totalImported++;
    }
  }
  
  console.log(`\nImport Summary:`);
  console.log(`-------------`);
  console.log(`Total records imported: ${totalImported}`);
  console.log(`Total products not found: ${totalErrors}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
