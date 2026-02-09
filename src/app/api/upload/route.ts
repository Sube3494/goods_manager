import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 确保上传目录存在
    const uploadDir = join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch {
      // 目录可能已存在
    }

    // 生成唯一文件名以防冲突
    const ext = file.name.split(".").pop();
    const fileName = `${uuidv4()}.${ext}`;
    const path = join(uploadDir, fileName);

    await writeFile(path, buffer);
    console.log(`File uploaded to: ${path}`);

    // Determine type based on extension or MIME type (simple extension check for now)
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);
    const type = isVideo ? "video" : "image";

    // 返回相对于 public 的 URL
    return NextResponse.json({ 
      url: `/uploads/${fileName}`,
      name: file.name,
      type
    });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
