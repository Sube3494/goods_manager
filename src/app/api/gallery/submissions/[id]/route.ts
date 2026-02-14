import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// 审核提交 (仅管理员)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session?.user as { role?: string } | undefined;

    if (!session || user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, notes, productId, selectedIndices } = body;

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (status === "approved" && !productId) {
      return NextResponse.json({ error: "Product ID is required for approval" }, { status: 400 });
    }

    // Use transaction to ensure both submission update and gallery items creation succeed
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.gallerySubmission.update({
        where: { id },
        data: {
          status,
          notes,
          productId: status === "approved" ? productId : null,
          selectedIndices: status === "approved" ? selectedIndices : null,
        }
      });

      if (status === "approved" && submission.urls) {
        const fullUrls = submission.urls as { url: string; type?: string }[];
        
        // If selectedIndices is provided, filter the URLs
        const approvedUrls = (selectedIndices && Array.isArray(selectedIndices))
          ? fullUrls.filter((_, index) => selectedIndices.includes(index))
          : fullUrls;

        if (approvedUrls.length > 0) {
          // Create gallery items for the approved submission
          await tx.galleryItem.createMany({
            data: approvedUrls.map(u => ({
              url: u.url,
              type: u.type || "image",
              productId: productId,
              isPublic: true,
              tags: []
            }))
          });
        }
      }

      return submission;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to process gallery submission:", error);
    return NextResponse.json({ error: "Failed to process gallery submission" }, { status: 500 });
  }
}
