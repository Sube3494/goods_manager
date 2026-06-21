import { NextResponse } from "next/server";
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { returnOutboundOrderById } from "@/lib/outboundReturns";

/**
 * 实现“退货入库”逻辑 (对冲出库)
 * 不再物理删除，而是标记状态并恢复库存
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "outbound:manage")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({ reason: "退货入库" }));

    const result = await returnOutboundOrderById(session.id, id, body);

    return NextResponse.json({ success: true, order: result });
  } catch (error) {
    console.error("Failed to return outbound order:", error);
    const message = error instanceof Error ? error.message : "Failed to process return";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE remains but only for very specific cleaning (optional, maybe disable)
export async function DELETE() {
  // 业务上不再推荐直接删除，返回一个提醒或者依然执行删除
  return NextResponse.json({ error: "Please use POST /api/outbound/[id]/return instead of DELETE for audit trace." }, { status: 405 });
}
