import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all relevant data
    const [products, categories, suppliers, purchaseOrders, outboundOrders] = await Promise.all([
      prisma.product.findMany({
        include: {
          category: true,
          supplier: true
        }
      }),
      prisma.category.findMany(),
      prisma.supplier.findMany(),
      prisma.purchaseOrder.findMany({
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      }),
      prisma.outboundOrder.findMany({
        include: {
          items: {
            include: {
              product: true
            }
          }
        }
      })
    ]);

    const formatDate = (date: Date | string | null) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // 1. Products Sheet
    const productData = products.map(p => ({
      'SKU': p.sku || '',
      '商品名称': p.name,
      '分类': p.category?.name || '未分类',
      '供应商': p.supplier?.name || '无',
      '库存数量': p.stock,
      '成本价': p.costPrice,
      '是否公开': p.isPublic ? '是' : '否',
      '创建时间': formatDate(p.createdAt)
    }));
    const productSheet = XLSX.utils.json_to_sheet(productData);
    XLSX.utils.book_append_sheet(wb, productSheet, "商品列表");

    // 2. Categories Sheet
    const categoryData = categories.map(c => ({
      '分类名称': c.name,
      '创建时间': formatDate(c.createdAt)
    }));
    const categorySheet = XLSX.utils.json_to_sheet(categoryData);
    XLSX.utils.book_append_sheet(wb, categorySheet, "分类列表");

    // 3. Suppliers Sheet
    const supplierData = suppliers.map(s => ({
      '编号': s.code || '',
      '供应商名称': s.name,
      '联系人': s.contact || '',
      '电话': s.phone || '',
      '地址': s.address || ''
    }));
    const supplierSheet = XLSX.utils.json_to_sheet(supplierData);
    XLSX.utils.book_append_sheet(wb, supplierSheet, "供应商列表");

    // 4. Inbound (Purchase) Orders
    const inboundData: Record<string, string | number>[] = [];
    purchaseOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.product) return;
        inboundData.push({
          '单号': order.id,
          '日期': formatDate(order.date),
          '类型': order.type,
          '状态': order.status,
          '商品名称': item.product.name,
          'SKU': item.product.sku || '',
          '数量': item.quantity,
          '单价': item.costPrice,
          '总计': item.quantity * item.costPrice
        });
      });
    });
    const inboundSheet = XLSX.utils.json_to_sheet(inboundData);
    XLSX.utils.book_append_sheet(wb, inboundSheet, "入库记录");

    // 5. Outbound Orders
    const outboundData: Record<string, string | number>[] = [];
    outboundOrders.forEach(order => {
      order.items.forEach(item => {
        if (!item.product) return;
        outboundData.push({
          '单号': order.id,
          '日期': formatDate(order.date),
          '类型': order.type,
          '备注': order.note || '',
          '商品名称': item.product.name,
          'SKU': item.product.sku || '',
          '数量': item.quantity,
          '单价': item.price || 0,
          '总计': item.quantity * (item.price || 0)
        });
      });
    });
    const outboundSheet = XLSX.utils.json_to_sheet(outboundData);
    XLSX.utils.book_append_sheet(wb, outboundSheet, "出库记录");

    // Generate workbook as Uint8Array (Safest for Next.js binary delivery)
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    // Return standard Response with Uint8Array body
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Full_Data_Backup_${new Date().toISOString().split('T')[0]}.xlsx"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });

  } catch (error) {
    console.error("Export failed:", error);
    return new Response(JSON.stringify({ error: "Export failed" }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
}
