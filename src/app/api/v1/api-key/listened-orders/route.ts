import { NextRequest, NextResponse } from "next/server";
import {
  getRequestApiKey,
  isAutoPickWebhookApiKeyAuthorized,
  markAutoPickApiKeyUsed,
  normalizeAutoPickOrderPayload,
  resolveAutoPickTargetUserId,
  upsertAutoPickOrder,
} from "@/lib/autoPickOrders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const requestApiKey = getRequestApiKey(request.headers, request.nextUrl.searchParams);
    if (!requestApiKey) {
      console.warn("Auto-pick webhook rejected: missing api key", {
        path: request.nextUrl.pathname,
        hasAuthorization: Boolean(request.headers.get("authorization")),
        hasXApiKey: Boolean(request.headers.get("x-api-key") || request.headers.get("x-auto-pick-key")),
      });
      return NextResponse.json({
        error: "Unauthorized",
      }, { status: 401 });
    }

    if (!await isAutoPickWebhookApiKeyAuthorized(requestApiKey)) {
      console.warn("Auto-pick webhook rejected: unauthorized api key", {
        path: request.nextUrl.pathname,
        keyPrefix: requestApiKey.slice(0, 8),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => null);
    const normalized = normalizeAutoPickOrderPayload(payload);
    if (!normalized) {
      console.warn("Auto-pick webhook rejected: invalid payload", {
        keyPrefix: requestApiKey.slice(0, 8),
        payloadPreview: payload && typeof payload === "object"
          ? JSON.stringify(payload).slice(0, 500)
          : String(payload),
      });
      return NextResponse.json({ error: "Invalid order payload" }, { status: 400 });
    }

    const targetUserId = await resolveAutoPickTargetUserId(requestApiKey);
    if (!targetUserId) {
      console.error("Auto-pick webhook failed: unable to resolve target user", {
        keyPrefix: requestApiKey.slice(0, 8),
        orderNo: normalized.orderNo,
        platform: normalized.platform,
      });
      return NextResponse.json({
        error: "无法根据当前对接密钥识别归属账号，请先在订单页面保存自动推单对接配置。",
      }, { status: 500 });
    }

    const order = await upsertAutoPickOrder(targetUserId, normalized);
    await markAutoPickApiKeyUsed(requestApiKey);
    return NextResponse.json({
      ok: true,
      id: order.id,
      orderNo: order.orderNo,
      platform: order.platform,
    });
  } catch (error) {
    console.error("Failed to receive auto-pick order:", {
      error: error instanceof Error ? error.stack || error.message : error,
      path: request.nextUrl.pathname,
    });
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to receive order",
    }, { status: 500 });
  }
}
