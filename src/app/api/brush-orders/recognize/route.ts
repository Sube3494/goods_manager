import { NextRequest, NextResponse } from 'next/server';
import { getFreshSession } from "@/lib/auth";
import { hasPermission, SessionUser } from "@/lib/permissions";

// 识别结果结构定义
interface RecognitionResult {
  platformOrderId?: string;
  platform?: string;
  date?: string;
  paymentAmount?: number;
  receivedAmount?: number;
  items?: Array<{ name: string; quantity: number }>;
  note?: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getFreshSession() as SessionUser | null;
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasPermission(session, "brush:create")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const apiKey = process.env.AI_RECOGNITION_API_KEY || process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI_RECOGNITION_API_KEY is not configured" }, { status: 500 });
    }

    const model = process.env.AI_RECOGNITION_MODEL || process.env.SILICONFLOW_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";
    const baseUrl = process.env.AI_RECOGNITION_BASE_URL || process.env.SILICONFLOW_API_BASE || "https://api.siliconflow.cn/v1";

    // 将文件转换为 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');
    const imageDataUrl = `data:${file.type};base64,${base64Image}`;

    // 获取中国标准时间的时间和年份
    const now = new Date();
    const chinaTime = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
    const todayYear = chinaTime.getFullYear();
    const todayStr = chinaTime.toISOString().split('T')[0]; // e: 2024-03-21

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content: `你是一个专业的电商订单识别专家。请从用户上传的订单截图中准确提取信息。你必须且只能返回合法的 JSON 格式数据，绝对不要包含任何 Markdown 标记或多余的解释。JSON 结构必须严格如下：\n{\n  "orderId": "",\n  "platform": "",\n  "date": "YYYY-MM-DD HH:mm:ss",\n  "paymentAmount": 0,\n  "receivedAmount": 0,\n  "items": [{ "name": "", "quantity": 1 }],\n  "note": ""\n}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请分析这张截图，严格按照前面定义的 JSON 结构返回数据。要求：\n- date 必须是截图中显示的真实交易时间。如果截图中的时间缺少跨度（例如只有 "02-24 18:24"），请默认使用当前年份 "${todayYear}" 补充为完整的 "YYYY-MM-DD HH:mm:ss"。如果截图只有日期没有时间，请返回 "YYYY-MM-DD 00:00:00"。如果截图中**没有明确指出任何交易日期或时间**，请发挥你的推断返回 "${todayStr} 00:00:00" 而不是随便编造日期。\n- 金额字段（paymentAmount, receivedAmount）必须是数字，不要带货币符号。注意定义：\n    - \`paymentAmount\`（实付）：指买家/顾客端实际支付的金额。\n    - \`receivedAmount\`（到手/本金）：指商家端实际或预计能收到的结算金额（例如图中的“预计收入”）。\n- 返回的字符串必须是纯粹的 JSON 文本，严禁使用 \`\`\`json 等代码块包裹。`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content received from AI model");
    }

    let result: RecognitionResult;
    try {
      // 深度清理 Markdown 标记（处理可能出现的 ```json 或 ```）
      const jsonStr = content.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      // 检查日期是否是占位日期（00:00:00）或回退日期
      const rawDateStr = String(parsed.date || "");
      const isPlaceholderTime = rawDateStr.includes("00:00:00") || !rawDateStr.includes(" ");
      const isValidDate = parsed.date && !isNaN(new Date(parsed.date).getTime());

      // 安全的回退机制，防止 AI 返回错误类型导致 Prisma 500
      result = {
        platformOrderId: String(parsed.orderId || ""),
        platform: String(parsed.platform || "淘宝"),
        date: (() => {
          if (!isValidDate) return new Date().toISOString();
          const rawDate = String(parsed.date);
          // 如果没有设定时区，补全为中国标准时间 (+08:00)
          const dateStr = (rawDate.includes('+') || rawDate.includes('Z')) 
            ? rawDate 
            : `${rawDate.replace(' ', 'T')}+08:00`;
          return new Date(dateStr).toISOString();
        })(),
        paymentAmount: Number(parsed.paymentAmount) || 0,
        receivedAmount: Number(parsed.receivedAmount) || 0,
        items: Array.isArray(parsed.items) 
          ? parsed.items.map((i: { name?: string; quantity?: number | string }) => ({ 
              name: String(i.name || "未知商品"), 
              quantity: Number(i.quantity) || 1 
            })) 
          : [],
        note: parsed.note ? String(parsed.note) : undefined,
        // @ts-expect-error - 动态添加标记，前端处理
        timeMissing: isPlaceholderTime || !isValidDate
      };
    } catch (parseError: unknown) {
      console.error("Failed to parse JSON from AI response:", content, parseError);
      return NextResponse.json({ error: "Failed to parse recognition result", raw: content }, { status: 500 });
    }

    return NextResponse.json(result);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in order recognition:', error);
    return NextResponse.json(
      { error: `Recognition failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
