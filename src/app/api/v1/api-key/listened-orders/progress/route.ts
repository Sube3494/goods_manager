import { NextRequest, NextResponse } from "next/server";
import {
  applyAutoPickProgress,
  getRequestApiKey,
  isAutoPickWebhookApiKeyAuthorized,
  markAutoPickApiKeyUsed,
  parseAutoPickProgressPayload,
  resolveAutoPickTargetUserId,
} from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const requestApiKey = getRequestApiKey(request.headers, request.nextUrl.searchParams);
    if (!requestApiKey) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!await isAutoPickWebhookApiKeyAuthorized(requestApiKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const progress = parseAutoPickProgressPayload(payload);
    if (!progress) {
      return NextResponse.json({ error: "Invalid progress payload" }, { status: 400 });
    }

    const targetUserId = await resolveAutoPickTargetUserId(requestApiKey);
    if (!targetUserId) {
      return NextResponse.json({
        error: "无法根据当前对接密钥识别归属账号，请先在订单页面保存自动推单对接配置。",
      }, { status: 500 });
    }

    const order = await applyAutoPickProgress(targetUserId, progress);
    await markAutoPickApiKeyUsed(requestApiKey);

    return NextResponse.json({
      ok: true,
      id: order.id,
      orderNo: order.orderNo,
      platform: order.platform,
      status: order.status,
    });
  } catch (error) {
    console.error("Failed to receive auto-pick progress:", {
      error: error instanceof Error ? error.stack || error.message : error,
      path: request.nextUrl.pathname,
    });

    const message = error instanceof Error ? error.message : "Failed to receive progress";
    const status = message === "Order not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
