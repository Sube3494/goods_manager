import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import prisma from "@/lib/prisma";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id || !hasPermission(session, "gallery:copy")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing media id" }, { status: 400 });
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { id: "system" },
    });

    const duration = setting?.shareExpireDuration || 1;
    const unit = setting?.shareExpireUnit || "hours";

    let ms = 60 * 60 * 1000;
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
    const signature = createHmac("sha256", secret)
      .update(`${id}:${expires}`)
      .digest("hex")
      .slice(0, 16);

    return NextResponse.json({
      expires,
      signature,
      expireText: `${duration}${displayUnit}`,
    });
  } catch (error) {
    console.error("Failed to sign media link:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
