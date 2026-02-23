import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { id: "system" }
    });
    
    const duration = setting?.shareExpireDuration || 1;
    const unit = setting?.shareExpireUnit || "hours";
    
    let ms = 60 * 60 * 1000; // 默认 1小时
    let displayUnit = "小时";
    if (unit === "minutes") {
        ms = duration * 60 * 1000;
        displayUnit = "分钟";
    } else if (unit === "hours") {
        ms = duration * 60 * 60 * 1000;
        displayUnit = "小时";
    } else if (unit === "days") {
        ms = duration * 24 * 60 * 60 * 1000;
        displayUnit = "天";
    }

    const expires = Date.now() + ms;
    const secret = process.env.NEXTAUTH_SECRET || "picknote_share_secret_fallback";
    
    // 生成简单的带盐签名，防止篡改过期时间
    const signature = createHmac("sha256", secret)
      .update(`${id}:${expires}`)
      .digest("hex")
      .slice(0, 16);

    return NextResponse.json({ 
        expires, 
        signature,
        expireText: `${duration}${displayUnit}`
    });
  } catch (error) {
    console.error("Failed to sign share link:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
