import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthorizedUser } from "@/lib/auth";
import { Prisma } from "../../../../prisma/generated-client";
import crypto from "node:crypto";

const KEY_NAME = "deepseekApiKey";
const MODEL_NAME = "deepseekModel";
const CIPHER_PREFIX = "enc:v1:";

function isBrushOrder(rawPayload: unknown) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return false;
  const systemMeta = (rawPayload as Record<string, unknown>).systemMeta;
  if (!systemMeta || typeof systemMeta !== "object" || Array.isArray(systemMeta)) return false;
  const marker = (systemMeta as Record<string, unknown>).mainSystemSelfDelivery;
  return Boolean(marker && typeof marker === "object" && !Array.isArray(marker) && (marker as Record<string, unknown>).triggered);
}

function cipherKey() {
  return crypto.createHash("sha256").update(process.env.AI_KEY_ENCRYPTION_SECRET || process.env.AUTH_SECRET || "change-this-secret").digest();
}
function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${CIPHER_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decrypt(value: string) {
  if (!value.startsWith(CIPHER_PREFIX)) return value;
  const [ivText, tagText, dataText] = value.slice(CIPHER_PREFIX.length).split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
}

function getKey(user: { permissions?: unknown }) {
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? user.permissions as Record<string, unknown>
    : {};
  return typeof permissions[KEY_NAME] === "string" ? decrypt(permissions[KEY_NAME].trim()) : "";
}

export async function GET() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions) ? user.permissions as Record<string, unknown> : {};
  return NextResponse.json({ configured: Boolean(getKey(user)), model: typeof permissions[MODEL_NAME] === "string" ? permissions[MODEL_NAME] : "deepseek-v4-flash" });
}

export async function POST(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const submittedKey = String(body.apiKey || "").trim();
  const apiKey = submittedKey === "keep-current-key" ? getKey(user) : submittedKey;
  const model = body.model === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  if (!apiKey) return NextResponse.json({ error: "请输入 DeepSeek API Key" }, { status: 400 });
  const current = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? user.permissions as Record<string, unknown>
    : {};
  await prisma.user.update({ where: { id: user.id }, data: { permissions: { ...current, [KEY_NAME]: encrypt(apiKey), [MODEL_NAME]: model } } });
  return NextResponse.json({ configured: true, model });
}

export async function DELETE() {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const current = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
    ? { ...(user.permissions as Record<string, unknown>) }
    : {};
  delete current[KEY_NAME];
  await prisma.user.update({ where: { id: user.id }, data: { permissions: current as Prisma.InputJsonValue } });
  return NextResponse.json({ configured: false });
}

export async function PUT(request: Request) {
  const user = await getAuthorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const apiKey = getKey(user);
  if (!apiKey) return NextResponse.json({ error: "请先配置 DeepSeek API Key" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "请输入问题" }, { status: 400 });

  const [orders, promotions, shops, products] = await Promise.all([
    prisma.autoPickOrder.findMany({ where: { userId: user.id }, select: { platform: true, orderNo: true, orderTime: true, actualPaid: true, expectedIncome: true, platformCommission: true, status: true, shopId: true, shopAddress: true, rawPayload: true } }),
    prisma.dailyPromotionExpense.findMany({ where: { userId: user.id }, select: { date: true, amount: true, amountMeituan: true, amountJingdong: true, amountTaobao: true } }),
    prisma.shop.findMany({ where: { userId: user.id }, select: { name: true, address: true } }),
    prisma.shopProduct.findMany({ where: { shop: { userId: user.id } }, select: { productName: true, sku: true, stock: true, costPrice: true, shop: { select: { name: true } } } }),
  ]);
  const context = {
    orders: orders.map((order) => ({
      ...order,
      isBrushOrder: isBrushOrder(order.rawPayload),
      rawPayload: undefined,
    })),
    promotions,
    shops,
    products,
    note: "订单为账号下全量数据；isBrushOrder=true 表示刷单/手动标记刷单。订单时间按 orderTime 归属；金额字段按系统原始单位提供，请结合字段名理解。",
  };
  const permissions = user.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions) ? user.permissions as Record<string, unknown> : {};
  const model = permissions[MODEL_NAME] === "deepseek-v4-pro" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({ model, stream: true, temperature: 0.2, thinking: { type: "enabled" }, messages: [
      { role: "system", content: "你是经营数据分析助手。只能根据提供的用户经营数据回答；数字不确定时明确说明，不要编造。使用简洁中文，给出结论和关键依据。" },
      { role: "user", content: `用户问题：${question}\n\n全量经营数据：${JSON.stringify(context)}` },
    ] }),
  });
  if (!response.ok || !response.body) return NextResponse.json({ error: "DeepSeek 调用失败，请检查 API Key" }, { status: 502 });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const stream = new ReadableStream({ async start(controller) {
    let buffer = "";
    try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data:")) continue; const raw = line.slice(5).trim(); if (!raw || raw === "[DONE]") continue; const delta = JSON.parse(raw).choices?.[0]?.delta || {}; if (delta.reasoning_content) controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "reasoning", delta: delta.reasoning_content }) + "\n")); if (delta.content) controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: "answer", delta: delta.content }) + "\n")); } } controller.close(); } catch (error) { controller.error(error); } finally { reader.releaseLock(); } }
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
