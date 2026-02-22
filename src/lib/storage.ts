import * as Minio from "minio";
import { writeFile, mkdir, access, unlink, copyFile } from "fs/promises";
import { createWriteStream, existsSync } from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import prisma from "./prisma";

export interface UploadResult {
  url: string;
  name: string;
  type: "image" | "video";
  skipped?: boolean;
}

export interface UploadOptions {
  name: string;
  type: string;
  folder?: string;      // Optional sub-folder/prefix
  useTimestamp?: boolean; // If true, rename file using timestamp
}

export interface StorageStrategy {
  upload(file: File | Buffer | ReadableStream | Readable, options?: UploadOptions): Promise<UploadResult>;
  delete(url: string): Promise<void>;
  resolveUrl(path: string): string; // Add resolveUrl to strategy
}

export interface MinioConfig {
  minioEndpoint: string;
  minioPort?: number | string | null;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket?: string | null;
  minioUseSSL: boolean;
  minioPublicUrl?: string | null;
  uploadConflictStrategy?: string | null;
}

import { createHash } from "crypto";
import { tmpdir } from "os";
import { createReadStream } from "fs";

// 帮助函数：处理文件并计算哈希
// 如果是流，会写入临时文件以便后续上传
// 返回：hash, extension, cleanup回调, 以及用于上传的 source (Buffer 或 path)
async function processFileForUpload(
  file: File | Buffer | ReadableStream | Readable,
  originalName: string
): Promise<{ 
  hash: string; 
  ext: string; 
  source: Buffer | string; 
  cleanup?: () => Promise<void>;
  isTempFile?: boolean;
}> {
  const ext = originalName.split(".").pop() || "";
  const hash = createHash("md5");

  if (Buffer.isBuffer(file)) {
    hash.update(file);
    return { 
      hash: hash.digest("hex"), 
      ext, 
      source: file 
    };
  } 
  
  if (file instanceof Blob) { // File is a Blob
    const buffer = Buffer.from(await file.arrayBuffer());
    hash.update(buffer);
    return { 
      hash: hash.digest("hex"), 
      ext, 
      source: buffer 
    };
  }

  // Handle Streams by writing to temp file
  const tempPath = join(tmpdir(), `upload-${uuidv4()}.tmp`);
  const writeStream = createWriteStream(tempPath);
  
  const stream = file instanceof ReadableStream 
    ? Readable.fromWeb(file as import("stream/web").ReadableStream) 
    : (file as Readable);

  await new Promise<void>((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.pipe(writeStream)
      .on('finish', () => resolve())
      .on('error', reject);
  });

  return {
    hash: hash.digest("hex"),
    ext,
    source: tempPath,
    isTempFile: true,
    cleanup: async () => {
        try {
            await unlink(tempPath);
        } catch (e) {
            console.warn("Failed to cleanup temp file:", tempPath, e);
        }
    }
  };
}

// 帮助函数：处理文件名冲突
async function resolveFileName(
  originalName: string, 
  strategy: string, 
  checkExists: (name: string) => Promise<boolean>
): Promise<{ fileName: string; skip: boolean }> {
  // 如果是强制唯一方案，直接生成 UUID，不检查是否存在
  if (strategy === "uuid") {
    const ext = originalName.split(".").pop();
    return { fileName: `${uuidv4()}.${ext}`, skip: false };
  }

  // 基础情况：文件不存在，直接使用原名
  const exists = await checkExists(originalName);
  if (!exists) {
    return { fileName: originalName, skip: false };
  }

  // 以下处理重名冲突的情况
  if (strategy === "skip") {
    return { fileName: originalName, skip: true };
  }

  if (strategy === "overwrite") {
    return { fileName: originalName, skip: false };
  }

  if (strategy === "rename") {
    const dotIndex = originalName.lastIndexOf(".");
    const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
    const ext = dotIndex !== -1 ? originalName.substring(dotIndex) : "";
    
    let counter = 1;
    let newName = `${baseName}(${counter})${ext}`;
    while (await checkExists(newName)) {
      counter++;
      newName = `${baseName}(${counter})${ext}`;
    }
    return { fileName: newName, skip: false };
  }

  // 默认模式回退
  const ext = originalName.split(".").pop();
  return { fileName: `${uuidv4()}.${ext}`, skip: false };
}

// 本地存储策略
export class LocalStorageStrategy implements StorageStrategy {
  private strategy: string;
  constructor(strategy: string = "uuid") {
    this.strategy = strategy;
  }

  resolveUrl(path: string): string {
    return path; // Local already returns /uploads/... which is relative to root
  }


  async upload(file: File | Buffer | ReadableStream | Readable, options?: UploadOptions): Promise<UploadResult> {
    // 确保在 Docker standalone 环境下也能准备找到上传目录
    // standalone 模式下 process.cwd() 可能在 .next/standalone，需要向上回退
    let baseDir = join(process.cwd(), "public", "uploads");
    
    // 如果在 standalone 目录下运行，尝试定位正确的 public 目录
    if (process.env.NEXT_RUNTIME === 'nodejs' && !existsSync(baseDir)) {
        const altDir = join(process.cwd(), ".next", "standalone", "public", "uploads");
        if (existsSync(altDir)) {
            baseDir = altDir;
        }
    }

    const subFolder = options?.folder || "";
    const uploadDir = join(baseDir, subFolder);
    
    await mkdir(uploadDir, { recursive: true });

    let fileNameInput = options?.name || (file as File).name || `upload-${Date.now()}`;
    
    // Naming logic
    if (options?.useTimestamp) {
        const ext = fileNameInput.split(".").pop() || "";
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const prefix = options.folder ? `${options.folder}_` : "file_";
        fileNameInput = `${prefix}${timestamp}_${random}.${ext}`;
    }
    // Remove unused fileType variable or use it if needed
    // const fileType = options?.type || (file as File).type || "application/octet-stream";

    let usedStrategy = this.strategy;
    let uploadSource: File | Buffer | ReadableStream | Readable | string = file;
    let cleanup: (() => Promise<void>) | undefined;

    if (this.strategy === "hash") {
      const processed = await processFileForUpload(file, fileNameInput);
      fileNameInput = `${processed.hash}.${processed.ext}`;
      usedStrategy = "skip"; // Hash strategy implies skipping duplicates
      uploadSource = processed.source;
      cleanup = processed.cleanup;
    }

    const { fileName, skip } = await resolveFileName(
      fileNameInput,
      usedStrategy,
      async (name) => {
        try {
          await access(join(uploadDir, name));
          return true;
        } catch {
          return false;
        }
      }
    );

    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);
    const result: UploadResult = {
      url: `/uploads/${subFolder ? subFolder + "/" : ""}${fileName}`,
      name: fileName, // Use the resolved file name
      type: isVideo ? "video" : "image",
      skipped: skip
    };

    if (skip) {
      if (cleanup) await cleanup();
      return result;
    }

    const fullPath = join(uploadDir, fileName);

    if (this.strategy === "hash") {
        if (typeof uploadSource === "string") {
            // Source is temp file path
            await copyFile(uploadSource, fullPath);
        } else if (Buffer.isBuffer(uploadSource)) {
            await writeFile(fullPath, uploadSource);
        }
    } else {
        if (file instanceof ReadableStream || (file && 'pipe' in file && typeof (file as Readable).pipe === "function")) {
        // Handle Web ReadableStream or Node Readable
        const writeStream = createWriteStream(fullPath);
        if (file instanceof ReadableStream) {
            await finished(Readable.fromWeb(file as import("stream/web").ReadableStream).pipe(writeStream));
        } else {
            await finished((file as Readable).pipe(writeStream));
        }
        } else if (Buffer.isBuffer(file)) {
        await writeFile(fullPath, file);
        } else {
        const bytes = await (file as File).arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(fullPath, buffer);
        }
    }

    if (cleanup) await cleanup();

    return result;
  }

  async delete(url: string): Promise<void> {
    try {
      // 提取文件名，假设格式为 /uploads/filename.ext
      const fileName = url.split("/").pop();
      if (!fileName) return;

      const uploadDir = join(process.cwd(), "public");
      
      let relativePath = url;
      // 处理全路径情况
      if (relativePath.startsWith('http')) {
        try {
          const urlObj = new URL(relativePath);
          relativePath = urlObj.pathname;
        } catch {
          // invalid url
        }
      }

      // 如果旧数据遗留的是 'gallery/xxx.jpg' 而非 '/uploads/...'，则补齐 uploads 前缀以便寻找真实物理路径
      if (!relativePath.startsWith('/uploads/') && !relativePath.startsWith('uploads/')) {
        // 先去掉可能存在的前导斜杠
        relativePath = '/uploads/' + relativePath.replace(/^\//, '');
      }

      // url is like /uploads/vouchers/filename.ext
      // We need to join with public to get absolute path
      const filePath = join(uploadDir, relativePath);
      
      await unlink(filePath);
    } catch (error) {
      // Ignore ENOENT (file already deleted)
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        console.error("Local delete failed:", error);
      }
    }
  }
}

// MinIO 存储策略
export class MinioStorageStrategy implements StorageStrategy {
  private config: MinioConfig;

  constructor(config: MinioConfig) {
    this.config = config;
  }

  async upload(file: File | Buffer | ReadableStream | Readable, options?: UploadOptions): Promise<UploadResult> {
    const minioClient = new Minio.Client({
      endPoint: this.config.minioEndpoint,
      port: this.config.minioPort ? Number(this.config.minioPort) : undefined,
      useSSL: this.config.minioUseSSL,
      accessKey: this.config.minioAccessKey,
      secretKey: this.config.minioSecretKey,
    });

    const bucketName = this.config.minioBucket || "goods-manager";
    
    // 检查并创建存储桶
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName);
      const policy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetBucketLocation", "s3:ListBucket"],
            Resource: [`arn:aws:s3:::${bucketName}`],
          },
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      };
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    }

    let fileNameInput = options?.name || (file as File).name || `upload-${Date.now()}`;
    
    if (options?.useTimestamp) {
        const ext = fileNameInput.split(".").pop() || "";
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const prefix = options.folder ? `${options.folder}_` : "file_";
        fileNameInput = `${prefix}${timestamp}_${random}.${ext}`;
    }

    const subFolder = options?.folder || "";
    const objectName = subFolder ? `${subFolder}/${fileNameInput}` : fileNameInput;

    const fileType = options?.type || (file as File).type || "application/octet-stream";

    let usedStrategy = this.config.uploadConflictStrategy || "uuid";
    let uploadSource: File | Buffer | ReadableStream | Readable | string = file;
    let cleanup: (() => Promise<void>) | undefined;

    if (usedStrategy === "hash") {
      const processed = await processFileForUpload(file, fileNameInput);
      fileNameInput = `${processed.hash}.${processed.ext}`;
      usedStrategy = "skip"; 
      uploadSource = processed.source;
      cleanup = processed.cleanup;
    }

    const { fileName: resolvedFileName, skip } = await resolveFileName(
      objectName,
      usedStrategy,
      async (name) => {
        try {
          await minioClient.statObject(bucketName, name);
          return true;
        } catch {
          return false;
        }
      }
    );

    const fileName = resolvedFileName; // Full path in bucket

    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);
    
    const result: UploadResult = {
      url: fileName, // Store relative object name in DB
      name: fileName.split('/').pop() || fileName,
      type: isVideo ? "video" : "image",
      skipped: skip
    };

    if (skip) {
      if (cleanup) await cleanup();
      return result;
    }

    if (this.config.uploadConflictStrategy === "hash") {
        // Hash strategy: source is Buffer or Temp File Path
        if (typeof uploadSource === "string") {
            const stream = createReadStream(uploadSource);
            await minioClient.putObject(bucketName, fileName, stream, undefined, {
                'Content-Type': fileType,
            });
        } else if (Buffer.isBuffer(uploadSource)) {
            await minioClient.putObject(bucketName, fileName, uploadSource, uploadSource.length, {
                'Content-Type': fileType,
            });
        }
    } else {
        // Original strategy
        if (file instanceof ReadableStream || (file && 'pipe' in file && typeof (file as Readable).pipe === "function")) {
            const stream = file instanceof ReadableStream ? Readable.fromWeb(file as import("stream/web").ReadableStream) : (file as Readable);
            await minioClient.putObject(bucketName, fileName, stream, undefined, {
                'Content-Type': fileType,
            });
        } else if (Buffer.isBuffer(file)) {
            await minioClient.putObject(bucketName, fileName, file, file.length, {
                'Content-Type': fileType,
            });
        } else {
            const bytes = await (file as File).arrayBuffer();
            const buffer = Buffer.from(bytes);
            await minioClient.putObject(bucketName, fileName, buffer, buffer.length, {
                'Content-Type': fileType,
            });
        }
    }

    if (cleanup) await cleanup();

    return result;
  }

  resolveUrl(path: string): string {
    if (!path || path.startsWith('http')) return path;
    const bucketName = this.config.minioBucket || "goods-manager";
    const publicUrl = this.config.minioPublicUrl ? this.config.minioPublicUrl.replace(/\/$/, "") : null;
    const protocol = this.config.minioUseSSL ? "https" : "http";
    const portPart = this.config.minioPort ? `:${this.config.minioPort}` : "";
    const baseUrl = publicUrl ? `${publicUrl}/${bucketName}` : `${protocol}://${this.config.minioEndpoint}${portPart}/${bucketName}`;
    return `${baseUrl}/${path.replace(/^\//, '')}`;
  }

  async delete(url: string): Promise<void> {
    try {
      const minioClient = new Minio.Client({
        endPoint: this.config.minioEndpoint,
        port: this.config.minioPort ? Number(this.config.minioPort) : undefined,
        useSSL: this.config.minioUseSSL,
        accessKey: this.config.minioAccessKey,
        secretKey: this.config.minioSecretKey,
      });

      const bucketName = this.config.minioBucket || "goods-manager";
      let objectName = "";

      if (url.startsWith('http')) {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        if (pathParts[0] === bucketName) {
            pathParts.shift();
        }
        objectName = pathParts.join("/");
      } else {
        // Assume it is already a relative path/object name
        objectName = url;
      }

      if (!objectName) return;

      await minioClient.removeObject(bucketName, objectName);
    } catch (error) {
      console.error("Minio delete failed:", error);
    }
  }
}

export async function getStorageStrategy(): Promise<StorageStrategy> {
  const settings = await prisma.systemSetting.findUnique({
    where: { id: "system" }
  });

  // 只有当存储类型为 minio 且核心配置完整时才启用 MinIO
  if (
    settings?.storageType === "minio" && 
    settings.minioEndpoint && 
    settings.minioAccessKey && 
    settings.minioSecretKey
  ) {
    return new MinioStorageStrategy(settings as unknown as MinioConfig);
  }

  // 否则一律回退到本地存储，并确保使用正确的冲突策略
  return new LocalStorageStrategy(settings?.uploadConflictStrategy || "rename");
}
