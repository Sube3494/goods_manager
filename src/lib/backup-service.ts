
import { writeFile, mkdir, readdir, unlink, stat, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import prisma from "./prisma";
import { BackupCrypto } from "./crypto";
import { createClient } from "webdav";
import { Prisma } from "../../prisma/generated-client";

export interface BackupFile {
  name: string;
  size: number;
  createdAt: Date;
  source: "local" | "webdav";
  fullPath?: string;
}

interface BackupOrderWithItems {
  items?: Record<string, unknown>[];
  [key: string]: unknown;
}

interface BackupPayload {
  version?: string;
  timestamp?: string;
  userId?: string;
  roleProfiles?: Record<string, unknown>[];
  systemSettings?: Record<string, unknown>[];
  whitelists?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
  invitations?: Record<string, unknown>[];
  registrationRequests?: Record<string, unknown>[];
  pageViews?: Record<string, unknown>[];
  verificationCodes?: Record<string, unknown>[];
  categories?: Record<string, unknown>[];
  suppliers?: Record<string, unknown>[];
  products?: Record<string, unknown>[];
  shops?: Record<string, unknown>[];
  brushProducts?: Record<string, unknown>[];
  brushOrderPlans?: BackupOrderWithItems[];
  settlements?: BackupOrderWithItems[];
  storeOpeningBatches?: BackupOrderWithItems[];
  purchaseOrders?: BackupOrderWithItems[];
  outboundOrders?: BackupOrderWithItems[];
  brushOrders?: BackupOrderWithItems[];
  galleryItems?: Record<string, unknown>[];
}

function castMany<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export class BackupService {
  private static readonly BACKUP_DIR = join(process.cwd(), "public", "backups");
  private static readonly BACKUP_PASSWORD = process.env.BACKUP_PASSWORD || "PickNote_Auto_Backup_Safe_Key"; // 建议从环境变量获取

  static resolveBackupPassword(password?: string | null) {
    const trimmedPassword = typeof password === "string" ? password.trim() : "";
    if (!trimmedPassword) return this.BACKUP_PASSWORD;
    if (trimmedPassword.length < 6) {
      throw new Error("自定义密码长度至少为 6 位");
    }
    return trimmedPassword;
  }

  static decryptBackupBuffer(encryptedBuffer: Buffer, password?: string) {
    const candidates = [password, this.BACKUP_PASSWORD].filter((value, index, arr): value is string => {
      if (!value) return false;
      return arr.indexOf(value) === index;
    });

    for (const candidate of candidates) {
      try {
        return BackupCrypto.decrypt(encryptedBuffer, candidate);
      } catch {
        continue;
      }
    }

    throw new Error("解密失败，密码错误或文件损坏");
  }

  static async collectBackupData(userId?: string): Promise<BackupPayload> {
    return {
      version: "2.0",
      timestamp: new Date().toISOString(),
      userId,
      categories: await prisma.category.findMany(),
      products: await prisma.product.findMany(),
      suppliers: await prisma.supplier.findMany(),
      purchaseOrders: await prisma.purchaseOrder.findMany({ include: { items: true } }),
      outboundOrders: await prisma.outboundOrder.findMany({ include: { items: true } }),
      brushOrders: await prisma.brushOrder.findMany({ include: { items: true } }),
      brushProducts: await prisma.brushProduct.findMany(),
      brushOrderPlans: await prisma.brushOrderPlan.findMany({ include: { items: true } }),
      settlements: await prisma.settlement.findMany({ include: { items: true } }),
      storeOpeningBatches: await prisma.storeOpeningBatch.findMany({ include: { items: true } }),
      shops: await prisma.shop.findMany(),
      galleryItems: await prisma.galleryItem.findMany(),
      systemSettings: await prisma.systemSetting.findMany(),
      users: await prisma.user.findMany(),
      roleProfiles: await prisma.roleProfile.findMany(),
      whitelists: await prisma.emailWhitelist.findMany(),
      invitations: await prisma.invitation.findMany(),
      registrationRequests: await prisma.registrationRequest.findMany(),
      pageViews: await prisma.pageView.findMany(),
      verificationCodes: await prisma.verificationCode.findMany(),
    };
  }

  /**
   * 执行一次完整备份
   */
  static async createBackup() {
    try {
      if (!existsSync(this.BACKUP_DIR)) {
        await mkdir(this.BACKUP_DIR, { recursive: true });
      }

      // 1. 获取所有数据（逻辑参考 export route）
      // 这里不区分用户，进行全局全量备份
      const database = await this.collectBackupData();

      // 2. 加密
      const jsonString = JSON.stringify(database);
      const encryptedBuffer = BackupCrypto.encrypt(jsonString, this.BACKUP_PASSWORD);

      // 3. 保存文件
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
      const fileName = `Auto_Backup_${timestamp}.pnk`;
      const filePath = join(this.BACKUP_DIR, fileName);
      
      await writeFile(filePath, encryptedBuffer);

      // 4. 更新数据库中的最后备份时间
      await prisma.systemSetting.updateMany({
        data: { lastBackup: new Date() }
      });

      // 5. 如果开启 WebDAV，同步上传
      const webdavResult = await this.syncToWebDAV(fileName, encryptedBuffer);

      // 6. 执行自动清理
      await this.cleanOldBackups();

      return { success: true, fileName, webdav: webdavResult };
    } catch (error) {
      console.error("Backup creation failed:", error);
      throw error;
    }
  }

  /**
   * 获取备份列表
   */
  private static async listLocalBackups(): Promise<BackupFile[]> {
    if (!existsSync(this.BACKUP_DIR)) return [];

    const files = await readdir(this.BACKUP_DIR);
    const backupFiles = await Promise.all(
      files
        .filter(f => f.endsWith(".pnk"))
        .map(async f => {
          const s = await stat(join(this.BACKUP_DIR, f));
          return {
            name: f,
            size: s.size,
            createdAt: s.birthtime,
            source: "local" as const,
          };
        })
    );

    return backupFiles;
  }

  static async createExportBuffer(userId?: string, password?: string | null) {
    const database = await this.collectBackupData(userId);
    const jsonString = JSON.stringify(database);
    const exportPassword = this.resolveBackupPassword(password);
    return BackupCrypto.encrypt(jsonString, exportPassword);
  }

  private static async listWebDAVBackups(): Promise<BackupFile[]> {
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    if (!settings?.webdavEnabled || !settings.webdavUrl) return [];

    try {
      const client = createClient(settings.webdavUrl, {
        username: settings.webdavUser || "",
        password: settings.webdavPassword || ""
      });

      let targetPath = settings.webdavPath || "/";
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
      if (!(await client.exists(targetPath))) return [];

      const items = await client.getDirectoryContents(targetPath) as { type: string; basename: string; lastmod: string; size?: number | string; filename?: string }[];
      return items
        .filter((item) => item.type === "file" && item.basename.endsWith(".pnk"))
        .map((item) => ({
          name: item.basename,
          size: Number(item.size || 0),
          createdAt: new Date(item.lastmod),
          source: "webdav" as const,
          fullPath: item.filename || `${targetPath}/${item.basename}`.replace(/\/+/g, "/"),
        }));
    } catch (error) {
      console.error("Failed to list WebDAV backups:", error);
      return [];
    }
  }

  static async listBackups(): Promise<BackupFile[]> {
    const [localBackups, remoteBackups] = await Promise.all([
      this.listLocalBackups(),
      this.listWebDAVBackups(),
    ]);

    const merged = new Map<string, BackupFile>();

    for (const backup of [...remoteBackups, ...localBackups]) {
      const existing = merged.get(backup.name);
      if (!existing || backup.source === "local") {
        merged.set(backup.name, existing ? { ...backup, fullPath: existing.fullPath || backup.fullPath } : backup);
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 删除备份
   */
  static async deleteBackup(fileName: string) {
    const filePath = join(this.BACKUP_DIR, fileName);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    if (!settings?.webdavEnabled || !settings.webdavUrl) return;

    try {
      const client = createClient(settings.webdavUrl, {
        username: settings.webdavUser || "",
        password: settings.webdavPassword || ""
      });

      let targetPath = settings.webdavPath || "/";
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
      const fullFilePath = `${targetPath}/${fileName}`.replace(/\/+/g, "/");
      if (await client.exists(fullFilePath)) {
        await client.deleteFile(fullFilePath);
      }
    } catch (error) {
      console.error("Failed to delete WebDAV backup:", error);
    }
  }

  private static async getWebDAVBackupBuffer(fileName: string): Promise<Buffer | null> {
    const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
    if (!settings?.webdavEnabled || !settings.webdavUrl) return null;

    try {
      const client = createClient(settings.webdavUrl, {
        username: settings.webdavUser || "",
        password: settings.webdavPassword || ""
      });

      let targetPath = settings.webdavPath || "/";
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
      const fullFilePath = `${targetPath}/${fileName}`.replace(/\/+/g, "/");
      if (!(await client.exists(fullFilePath))) return null;

      const content = await client.getFileContents(fullFilePath, { format: "binary" });
      return Buffer.isBuffer(content) ? content : Buffer.from(content as ArrayBuffer);
    } catch (error) {
      console.error("Failed to fetch WebDAV backup:", error);
      return null;
    }
  }

  static async getBackupBuffer(fileName: string): Promise<Buffer> {
    const filePath = join(this.BACKUP_DIR, fileName);
    if (existsSync(filePath)) {
      return readFile(filePath);
    }

    const remoteBuffer = await this.getWebDAVBackupBuffer(fileName);
    if (remoteBuffer) {
      return remoteBuffer;
    }

    throw new Error("备份文件不存在");
  }

  /**
   * 从服务器备份文件恢复
   */
  static async restoreFromFile(fileName: string, password?: string) {
      const encryptedBuffer = await this.getBackupBuffer(fileName);
      const decryptedData = this.decryptBackupBuffer(encryptedBuffer, password);

    const data = JSON.parse(decryptedData);
    await this.restoreFromData(data);
    return { success: true };
  }

  /**
   * 通用恢复逻辑：清空并重新填充数据库
   */
  static async restoreFromData(data: BackupPayload) {
    await prisma.$transaction(async (tx) => {
      // 1. 清空现有数据 (按外键依赖顺序逆序删除)
      await tx.settlementItem.deleteMany();
      await tx.settlement.deleteMany();
      await tx.storeOpeningItem.deleteMany();
      await tx.storeOpeningBatch.deleteMany();
      await tx.brushOrderPlanItem.deleteMany();
      await tx.brushOrderPlan.deleteMany();
      await tx.brushProduct.deleteMany();
      await tx.brushOrderItem.deleteMany();
      await tx.brushOrder.deleteMany();
      await tx.shop.deleteMany();
      await tx.galleryItem.deleteMany();
      await tx.outboundOrderItem.deleteMany();
      await tx.outboundOrder.deleteMany();
      await tx.purchaseOrderItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.product.deleteMany();
      await tx.supplier.deleteMany();
      await tx.category.deleteMany();
      await tx.invitation.deleteMany();
      await tx.emailWhitelist.deleteMany();
      await tx.registrationRequest.deleteMany();
      await tx.pageView.deleteMany();
      await tx.verificationCode.deleteMany();
      await tx.systemSetting.deleteMany(); 
      await tx.user.deleteMany();
      // 在一些 Prisma 配置中，roleProfile 可能被 user 依赖，所以级联删除通常足够，但显式清理更稳
      await tx.roleProfile.deleteMany();

      // 2. 导入数据 (按依赖顺序顺序插入)
      if (data.roleProfiles) await tx.roleProfile.createMany({ data: castMany<Prisma.RoleProfileCreateManyInput>(data.roleProfiles) });
      if (data.systemSettings) await tx.systemSetting.createMany({ data: castMany<Prisma.SystemSettingCreateManyInput>(data.systemSettings) });
      if (data.whitelists) await tx.emailWhitelist.createMany({ data: castMany<Prisma.EmailWhitelistCreateManyInput>(data.whitelists) });
      if (data.users) await tx.user.createMany({ data: castMany<Prisma.UserCreateManyInput>(data.users) });
      if (data.invitations) await tx.invitation.createMany({ data: castMany<Prisma.InvitationCreateManyInput>(data.invitations) });
      if (data.registrationRequests) await tx.registrationRequest.createMany({ data: castMany<Prisma.RegistrationRequestCreateManyInput>(data.registrationRequests) });
      if (data.pageViews) await tx.pageView.createMany({ data: castMany<Prisma.PageViewCreateManyInput>(data.pageViews) });
      if (data.verificationCodes) await tx.verificationCode.createMany({ data: castMany<Prisma.VerificationCodeCreateManyInput>(data.verificationCodes) });
      if (data.categories) await tx.category.createMany({ data: castMany<Prisma.CategoryCreateManyInput>(data.categories) });
      if (data.suppliers) await tx.supplier.createMany({ data: castMany<Prisma.SupplierCreateManyInput>(data.suppliers) });
      if (data.products) await tx.product.createMany({ data: castMany<Prisma.ProductCreateManyInput>(data.products) });
      if (data.shops) await tx.shop.createMany({ data: castMany<Prisma.ShopCreateManyInput>(data.shops) });
      if (data.brushProducts) await tx.brushProduct.createMany({ data: castMany<Prisma.BrushProductCreateManyInput>(data.brushProducts) });
      
      // 3. 级联订单处理
      if (data.purchaseOrders) {
        for (const order of data.purchaseOrders) {
            const { items, ...orderData } = order;
            await tx.purchaseOrder.create({ data: orderData as Prisma.PurchaseOrderCreateInput });
            if (items?.length) await tx.purchaseOrderItem.createMany({ data: castMany<Prisma.PurchaseOrderItemCreateManyInput>(items) });
        }
      }
      if (data.outboundOrders) {
        for (const order of data.outboundOrders) {
            const { items, ...orderData } = order;
            await tx.outboundOrder.create({ data: orderData as Prisma.OutboundOrderCreateInput });
            if (items?.length) await tx.outboundOrderItem.createMany({ data: castMany<Prisma.OutboundOrderItemCreateManyInput>(items) });
        }
      }
      if (data.brushOrders) {
        for (const order of data.brushOrders) {
            const { items, ...orderData } = order;
            await tx.brushOrder.create({ data: orderData as Prisma.BrushOrderCreateInput });
            if (items?.length) await tx.brushOrderItem.createMany({ data: castMany<Prisma.BrushOrderItemCreateManyInput>(items) });
        }
      }
      if (data.brushOrderPlans) {
        for (const plan of data.brushOrderPlans) {
            const { items, ...planData } = plan;
            await tx.brushOrderPlan.create({ data: planData as Prisma.BrushOrderPlanCreateInput });
            if (items?.length) await tx.brushOrderPlanItem.createMany({ data: castMany<Prisma.BrushOrderPlanItemCreateManyInput>(items) });
        }
      }
      if (data.settlements) {
        for (const settlement of data.settlements) {
            const { items, ...settlementData } = settlement;
            await tx.settlement.create({ data: settlementData as Prisma.SettlementCreateInput });
            if (items?.length) await tx.settlementItem.createMany({ data: castMany<Prisma.SettlementItemCreateManyInput>(items) });
        }
      }
      if (data.storeOpeningBatches) {
        for (const batch of data.storeOpeningBatches) {
            const { items, ...batchData } = batch;
            await tx.storeOpeningBatch.create({ data: batchData as Prisma.StoreOpeningBatchCreateInput });
            if (items?.length) await tx.storeOpeningItem.createMany({ data: castMany<Prisma.StoreOpeningItemCreateManyInput>(items) });
        }
      }
      if (data.galleryItems) await tx.galleryItem.createMany({ data: castMany<Prisma.GalleryItemCreateManyInput>(data.galleryItems) });
    }, {
      timeout: 30000 // 恢复操作可能较重，增加超时时间
    });
  }

  /**
   * 获取备份文件路径
   */
  static getBackupPath(fileName: string) {
    return join(this.BACKUP_DIR, fileName);
  }

  /**
   * 自动清理旧备份，保留最新的 10 份（或从设置中读取）
   */
  static async cleanOldBackups() {
    try {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      const retention = settings?.backupRetention || 10;
      
      const backups = await this.listBackups();
      if (backups.length > retention) {
        const toDelete = backups.slice(retention);
        for (const file of toDelete) {
          await this.deleteBackup(file.name);
          console.log(`Auto-cleaned old backup: ${file.name}`);
        }
      }

      // 同步清理 WebDAV
      if (settings?.webdavEnabled) {
        await this.cleanWebDAVBackups(settings, retention);
      }
    } catch (error) {
      console.error("Backup cleanup failed:", error);
    }
  }

  /**
   * 检查是否需要执行定期备份
   */
  static async checkAndRunScheduledBackup() {
    try {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      if (!settings || !settings.backupEnabled) return;

      const lastBackup = settings.lastBackup;
      if (!lastBackup) {
        await this.createBackup();
        return;
      }

      const now = new Date();
      const intervalMs = this.getIntervalMs(settings.backupIntervalUnit, settings.backupIntervalValue);
      
      if (now.getTime() - lastBackup.getTime() >= intervalMs) {
        console.log("Starting scheduled auto backup...");
        await this.createBackup();
        return;
      }
    } catch (error) {
      console.error("Scheduled backup check failed:", error);
    }
  }

  private static getIntervalMs(unit: string, value: number): number {
    const dayMs = 24 * 60 * 60 * 1000;
    switch (unit) {
      case "hours": return value * 60 * 60 * 1000;
      case "days": return value * dayMs;
      case "weeks": return value * 7 * dayMs;
      default: return dayMs;
    }
  }

  /**
   * 同步到 WebDAV
   */
  private static async syncToWebDAV(fileName: string, content: Buffer): Promise<{ success: boolean; fullPath?: string; error?: string } | null> {
    try {
      const settings = await prisma.systemSetting.findUnique({ where: { id: "system" } });
      if (!settings || !settings.webdavEnabled || !settings.webdavUrl) return null;

      const client = createClient(settings.webdavUrl, {
        username: settings.webdavUser || "",
        password: settings.webdavPassword || ""
      });

      // 获取路径，处理斜杠
      let targetPath = settings.webdavPath || "/";
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
      if (targetPath.endsWith("/")) targetPath = targetPath.slice(0, -1);

      // 递归确保目录存在
      if (targetPath !== "" && targetPath !== "/") {
        const parts = targetPath.split("/").filter(Boolean);
        let currentPath = "";
        for (const part of parts) {
          currentPath += "/" + part;
          if (!(await client.exists(currentPath))) {
            await client.createDirectory(currentPath);
            console.log(`Created WebDAV directory: ${currentPath}`);
          }
        }
      }

      const fullFilePath = `${targetPath}/${fileName}`.replace(/\/+/g, "/");
      await client.putFileContents(fullFilePath, content, { overwrite: true });
      console.log(`WebDAV sync success: ${fullFilePath}`);
      return { success: true, fullPath: fullFilePath };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("WebDAV sync failed:", message);
      return { success: false, error: message };
    }
  }

  /**
   * 清理 WebDAV 上的旧备份
   */
  private static async cleanWebDAVBackups(settings: { webdavUrl: string | null, webdavUser: string | null, webdavPassword: string | null, webdavPath: string | null }, retention: number) {
    if (!settings.webdavUrl) return;
    try {
      const client = createClient(settings.webdavUrl, {
        username: settings.webdavUser || "",
        password: settings.webdavPassword || ""
      });

      let targetPath = settings.webdavPath || "/";
      if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;

      if (!(await client.exists(targetPath))) return;

      const items = await client.getDirectoryContents(targetPath) as { type: string, basename: string, lastmod: string }[];
      const backups = items
        .filter(item => item.type === "file" && item.basename.endsWith(".pnk"))
        .map(item => ({
          name: item.basename,
          createdAt: new Date(item.lastmod)
        }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      if (backups.length > retention) {
        const toDelete = backups.slice(retention);
        for (const file of toDelete) {
          const deletePath = `${targetPath}/${file.name}`.replace(/\/+/g, "/");
          await client.deleteFile(deletePath);
          console.log(`WebDAV auto-cleaned: ${deletePath}`);
        }
      }
    } catch (error) {
      console.error("WebDAV cleanup failed:", error);
    }
  }

  /**
   * 测试 WebDAV 连接
   */
  static async testWebDAVConnection(url: string, user: string, pass: string) {
    try {
      const client = createClient(url, { username: user, password: pass });
      await client.getDirectoryContents("/");
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
