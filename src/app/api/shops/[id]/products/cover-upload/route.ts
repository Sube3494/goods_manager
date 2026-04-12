import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { getStorageStrategy } from "@/lib/storage";
import { validateUploadFile } from "@/lib/uploadValidation";
import prisma from "@/lib/prisma";

async function getOwnedShop(shopId: string, userId: string, isAdmin: boolean) {
  return prisma.shop.findFirst({
    where: isAdmin ? { id: shopId } : { id: shopId, userId },
    select: { id: true },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthorizedUser("product:update");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized or insufficient permissions" }, { status: 401 });
    }

    const { id: shopId } = await params;
    const shop = await getOwnedShop(shopId, user.id, user.role === "SUPER_ADMIN");
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validation = validateUploadFile(file.name, file.type);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const storage = await getStorageStrategy();
    const result = await storage.upload(file, {
      name: file.name,
      type: file.type,
      folder: "gallery",
      useTimestamp: true,
    });

    return NextResponse.json({
      url: storage.resolveUrl(result.url),
      path: result.url,
      type: file.type.startsWith("video/") ? "video" : "image",
    });
  } catch (error) {
    console.error("Failed to upload shop cover:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
