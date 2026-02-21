/*
 * @Date: 2026-02-22 00:25:18
 * @Author: Sube
 * @FilePath: route.ts
 * @LastEditTime: 2026-02-22 00:31:10
 * @Description: 
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { pinyin } from "pinyin-pro";

function generatePinyinSearchText(name: string): string {
  if (!name) return "";
  const fullPinyin = pinyin(name, { toneType: 'none', type: 'string', v: true }).replace(/\s+/g, '');
  const firstLetters = pinyin(name, { pattern: 'first', toneType: 'none', type: 'string' }).replace(/\s+/g, '');
  return `${fullPinyin} ${firstLetters}`.toLowerCase();
}

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      select: { id: true, name: true }
    });

    let updatedCount = 0;
    for (const product of products) {
      if (product.name) {
        const pinyinText = generatePinyinSearchText(product.name);
        await prisma.product.update({
          where: { id: product.id },
          data: { pinyin: pinyinText }
        });
        updatedCount++;
      }
    }
    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error("Failed to update pinyin:", error);
    return NextResponse.json({ error: "Failed to update pinyin" }, { status: 500 });
  }
}
