import { NextResponse } from "next/server";
import * as Minio from "minio";

export async function POST(request: Request) {
  try {
    const config = await request.json();
    
    if (config.storageType === "local") {
      return NextResponse.json({ success: true, message: "本地存储配置有效 (仅检查类型)" });
    }

    if (!config.minioEndpoint || !config.minioAccessKey || !config.minioSecretKey) {
      return NextResponse.json({ error: "配置信息不完整" }, { status: 400 });
    }

    const minioClient = new Minio.Client({
      endPoint: config.minioEndpoint,
      port: config.minioPort ? Number(config.minioPort) : undefined,
      useSSL: config.minioUseSSL ?? true,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
    });

    // 尝试列出存储桶或检查特定桶以测试连接
    // 如果没有配置桶名，则尝试列出所有桶作为连通性测试
    try {
      if (config.minioBucket) {
        await minioClient.bucketExists(config.minioBucket);
      } else {
        await minioClient.listBuckets();
      }
      return NextResponse.json({ success: true, message: "存储服务连接成功" });
    } catch (err: unknown) {
      console.error("Storage test connection failed:", err);
      const errorMessage = err instanceof Error ? err.message : "无法访问 MinIO 服务，请检查地址、端口和密钥";
      // Safe cast to access code if it exists on custom error types, otherwise undefined
      const errorCode = (err as { code?: string })?.code;
      
      return NextResponse.json({ 
        error: `连接失败: ${errorMessage}`,
        details: errorCode
      }, { status: 500 });
    }
  } catch (error) {
    console.error("Test Storage Error:", error);
    return NextResponse.json({ error: "测试请求处理失败" }, { status: 500 });
  }
}
