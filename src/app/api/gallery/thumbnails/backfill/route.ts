import { NextResponse } from "next/server";
import { getAuthorizedUserAny } from "@/lib/auth";
import { backfillGalleryThumbnails, countGalleryItemsMissingThumbnails } from "@/lib/gallery-thumbnails.server";

export async function GET() {
  const session = await getAuthorizedUserAny("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const remaining = await countGalleryItemsMissingThumbnails();
    return NextResponse.json({ remaining });
  } catch (error) {
    console.error("Failed to count gallery thumbnails:", error);
    return NextResponse.json({ error: "Failed to count gallery thumbnails" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthorizedUserAny("settings:manage");
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawLimit = Number(body?.limit ?? 60);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(120, rawLimit)) : 60;

    const result = await backfillGalleryThumbnails(limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to backfill gallery thumbnails:", error);
    return NextResponse.json({ error: "Failed to backfill gallery thumbnails" }, { status: 500 });
  }
}
