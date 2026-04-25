import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { SessionUser } from "@/lib/permissions";

export async function PATCH(req: Request) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, shippingAddresses, brushShops } = body;

    if (Array.isArray(shippingAddresses)) {
      const missingLabel = shippingAddresses.find((item) => !String(item?.label || "").trim());
      if (missingLabel) {
        return NextResponse.json({ error: "门店简称为必填项" }, { status: 400 });
      }

      const missingExternalId = shippingAddresses.find((item) => !String(item?.externalId || "").trim());
      if (missingExternalId) {
        return NextResponse.json({ error: "门店ID为必填项" }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: { 
        name: name || undefined,
        shippingAddresses: shippingAddresses !== undefined ? shippingAddresses : undefined,
        brushShops: brushShops !== undefined ? brushShops : undefined
      }
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
