import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { getStorageStrategy } from "@/lib/storage";

export interface ParsedMeituanItem {
  meituanSkuId: string;
  meituanSpuId?: string;
  name: string;
  spec?: string;
  barcode?: string;
  price?: number;
  imageUrl?: string;
  initialSku?: string;
  category?: string;
  rawData?: Record<string, any>;
}

export class MeituanMappingService {
  /**
   * 解析用户上传的美团 Excel / CSV 文件（支持提取文本URL及Excel内嵌图片）
   */
  static async parseMeituanExcel(buffer: ArrayBuffer): Promise<{ fileName?: string; items: ParsedMeituanItem[] }> {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    if (!worksheet) {
      throw new Error("Excel 工作表为空");
    }

    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" }) as any[][];
    if (!rawData || rawData.length < 1) {
      throw new Error("表格数据为空");
    }

    // 尝试使用 ExcelJS 提取工作表中内嵌的媒体图片 (Drawing Images)
    const embeddedImagesByRow = new Map<number, string>();
    try {
      const ejWorkbook = new ExcelJS.Workbook();
      await ejWorkbook.xlsx.load(buffer);
      const ejSheet = ejWorkbook.worksheets[0];
      if (ejSheet) {
        const images = ejSheet.getImages();
        for (const img of images) {
          const imgId = img.imageId;
          const media = ejWorkbook.model.media?.find(
            (m: any) => m.index === imgId || m.name === imgId
          );
          if (media && media.buffer) {
            const ext = media.extension || "png";
            const base64 = `data:image/${ext};base64,${Buffer.from(
              media.buffer
            ).toString("base64")}`;
            const rowIdx = Math.floor(img.range.tl.row);
            embeddedImagesByRow.set(rowIdx, base64);
          }
        }
      }
    } catch {
      // 忽略部分不支持流式解析的文件格式
    }

    // 自动探测表头所在的行（可能在第0行或第1行）
    let headerRowIndex = -1;
    let colMap: Record<string, number> = {};

    for (let r = 0; r < Math.min(5, rawData.length); r++) {
      const row = rawData[r] || [];
      const rowStrings = row.map((cell) => String(cell || "").trim().toLowerCase());
      
      const hasId = rowStrings.some((s) => s.includes("商品id") || s.includes("skuid") || s.includes("spuid") || s === "id");
      const hasName = rowStrings.some((s) => s.includes("商品名称") || s.includes("商品名") || s.includes("菜品名称") || s.includes("name"));

      if (hasId || hasName) {
        headerRowIndex = r;
        row.forEach((cell, idx) => {
          const title = String(cell || "").trim();
          if (title) {
            colMap[title] = idx;
          }
        });
        break;
      }
    }

    // 如果没探测到，默认使用第 0 行
    if (headerRowIndex === -1) {
      headerRowIndex = 0;
      (rawData[0] || []).forEach((cell, idx) => {
        const title = String(cell || "").trim();
        if (title) colMap[title] = idx;
      });
    }

    // 寻找关键列索引
    const findCol = (candidates: string[]): number => {
      for (const [colName, idx] of Object.entries(colMap)) {
        const cleanName = colName.replace(/[*＊\s]/g, "").toLowerCase();
        for (const cand of candidates) {
          if (cleanName.includes(cand.toLowerCase()) || cand.toLowerCase().includes(cleanName)) {
            return idx;
          }
        }
      }
      return -1;
    };

    const idCol = findCol(["商品ID", "美团商品ID", "SPUID", "SKUID", "ID", "商品编码"]);
    const nameCol = findCol(["商品名称", "品名", "菜品名称", "商品名", "名称"]);
    const skuCol = findCol(["SKU/店内码", "店内码", "商家编码", "货号", "SKU", "自编编码"]);
    const specCol = findCol(["规格", "规格名称", "商品规格", "SKU名称"]);
    const barcodeCol = findCol(["条形码", "商品条码", "69码", "条码", "国条"]);
    const priceCol = findCol(["进货单价", "售价", "销售价", "价格", "原价", "现价", "标价"]);
    const imgCol = findCol(["商品图片", "图片链接", "图片", "主图"]);
    const categoryCol = findCol(["分类", "商品分类", "类目"]);

    const parsedItems: ParsedMeituanItem[] = [];
    const usedIds = new Set<string>();

    for (let r = headerRowIndex + 1; r < rawData.length; r++) {
      const row = rawData[r] || [];
      if (!row || row.length === 0) continue;

      const name = nameCol !== -1 ? String(row[nameCol] || "").trim() : "";
      let rawId = idCol !== -1 ? String(row[idCol] || "").trim() : "";

      // 如果既没有名称也没有ID，跳过该空行
      if (!name && !rawId) continue;

      // 如果没有ID，基于品名生成临时防重ID
      if (!rawId) {
        rawId = `mt_auto_${r}_${Math.random().toString(36).substring(2, 7)}`;
      }

      // 如果有重复的 ID，追加后缀确保行唯一
      let uniqueId = rawId;
      let dupIndex = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${rawId}__${dupIndex}`;
        dupIndex++;
      }
      usedIds.add(uniqueId);

      const spec = specCol !== -1 ? String(row[specCol] || "").trim() : undefined;
      const initialSku = skuCol !== -1 ? String(row[skuCol] || "").trim() : undefined;
      const barcode = barcodeCol !== -1 ? String(row[barcodeCol] || "").trim() : undefined;
      const category = categoryCol !== -1 ? String(row[categoryCol] || "").trim() : undefined;
      
      let price: number | undefined;
      if (priceCol !== -1 && row[priceCol] !== undefined && row[priceCol] !== null) {
        const num = parseFloat(String(row[priceCol]));
        if (!isNaN(num)) price = num;
      }

      // 提取图片（优先内嵌图片，其次URL匹配）
      let imageUrl: string | undefined = embeddedImagesByRow.get(r);
      if (!imageUrl && imgCol !== -1 && row[imgCol]) {
        const rawImg = String(row[imgCol]).trim();
        const urlMatch = rawImg.match(/https?:\/\/[^\s"']+/);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        } else if (rawImg.startsWith("http") || rawImg.startsWith("data:image")) {
          imageUrl = rawImg;
        }
      }

      parsedItems.push({
        meituanSkuId: uniqueId,
        meituanSpuId: rawId.includes("__") ? rawId.split("__")[0] : rawId,
        name: name || `美团商品_${uniqueId}`,
        spec: spec || undefined,
        barcode: barcode || undefined,
        price,
        imageUrl,
        initialSku: initialSku || undefined,
        category: category || undefined,
        rawData: {
          rowNumber: r + 1,
          original: row,
        },
      });
    }

    return { items: parsedItems };
  }

  /**
   * 清洗品名用于模糊比对
   */
  static cleanName(name: string): string {
    if (!name) return "";
    return name
      .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）/g, "")
      .replace(/热销|爆款|特价|秒杀|限时|买一赠一|买一送一|推荐|新品/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  /**
   * 创建导入批次并自动进行智能初筛
   */
  static async createImportBatch(userId: string, fileName: string, items: ParsedMeituanItem[], platform = "meituan") {
    if (!items || items.length === 0) {
      throw new Error("导入列表中无有效商品数据");
    }

    // 1. 获取用户现有所有商品库商品
    const userProducts = await prisma.product.findMany({
      where: {
        OR: [
          { userId: userId },
          { isPublic: true },
        ],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        specs: true,
        image: true,
        costPrice: true,
      },
    });

    // 建立快速索引
    const skuMap = new Map<string, typeof userProducts[0]>();
    const nameMap = new Map<string, typeof userProducts[0]>();
    const cleanNameMap = new Map<string, typeof userProducts[0]>();

    for (const p of userProducts) {
      if (p.sku) {
        skuMap.set(p.sku.trim().toLowerCase(), p);
      }
      if (p.name) {
        const pName = p.name.trim().toLowerCase();
        nameMap.set(pName, p);
        const cleanPName = this.cleanName(p.name);
        if (cleanPName) {
          cleanNameMap.set(cleanPName, p);
        }
      }
    }

    // 2. 获取用户之前已持久化绑定的 ProductMeituanSku
    const existingMappings = platform === "meituan"
      ? await prisma.productMeituanSku.findMany({
          where: { userId },
          select: {
            meituanSkuId: true,
            productId: true,
          },
        })
      : [];
    const boundSkuMap = new Map<string, string>();
    for (const m of existingMappings) {
      boundSkuMap.set(m.meituanSkuId, m.productId);
    }

    // 3. 执行智能初筛
    const preparedItems = items.map((item) => {
      let status: "UNMATCHED" | "SUGGESTED" | "BOUND" = "UNMATCHED";
      let bindProductId: string | null = null;
      let suggestedProductId: string | null = null;
      let suggestedReason: string | null = null;

      // 规则 A: 如果历史已经绑定过此美团ID，直接标记为已绑定
      const historyBoundProductId = boundSkuMap.get(item.meituanSkuId);
      if (historyBoundProductId) {
        status = "BOUND";
        bindProductId = historyBoundProductId;
        suggestedProductId = historyBoundProductId;
        suggestedReason = "历史已绑定过此美团ID";
      } else {
        // 规则 B: 如果美团表格自带的 SKU 能够精准匹配系统商品 SKU
        if (item.initialSku && skuMap.has(item.initialSku.trim().toLowerCase())) {
          const matched = skuMap.get(item.initialSku.trim().toLowerCase())!;
          status = "SUGGESTED";
          suggestedProductId = matched.id;
          suggestedReason = `表格内自带店内码(${item.initialSku})与系统SKU精确匹配`;
        }
        // 规则 C: 完整品名完全一致
        else if (item.name && nameMap.has(item.name.trim().toLowerCase())) {
          const matched = nameMap.get(item.name.trim().toLowerCase())!;
          status = "SUGGESTED";
          suggestedProductId = matched.id;
          suggestedReason = "商品品名与系统商品完全一致";
        }
        // 规则 D: 清洗营销词后品名一致
        else if (item.name) {
          const clean = this.cleanName(item.name);
          if (clean && cleanNameMap.has(clean)) {
            const matched = cleanNameMap.get(clean)!;
            status = "SUGGESTED";
            suggestedProductId = matched.id;
            suggestedReason = `清洗营销词后品名匹配: ${matched.name}`;
          }
        }
      }

      return {
        userId,
        platform,
        meituanSkuId: item.meituanSkuId,
        meituanSpuId: item.meituanSpuId || null,
        name: item.name,
        spec: item.spec || null,
        barcode: item.barcode || null,
        price: item.price !== undefined ? item.price : null,
        imageUrl: item.imageUrl || null,
        rawData: item.rawData || {},
        suggestedProductId,
        suggestedReason,
        bindProductId,
        status,
      };
    });

    const totalCount = preparedItems.length;
    const matchedCount = preparedItems.filter((i) => i.status === "BOUND").length;

    // 4. 保存批次与明细
    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.meituanImportBatch.create({
        data: {
          userId,
          platform,
          fileName,
          totalCount,
          matchedCount,
          status: matchedCount === totalCount && totalCount > 0 ? "COMPLETED" : matchedCount > 0 ? "PARTIAL" : "PENDING",
        },
      });

      await tx.meituanImportItem.createMany({
        data: preparedItems.map((i) => ({
          ...i,
          batchId: createdBatch.id,
        })),
      });

      return createdBatch;
    });

    return batch;
  }

  /**
   * 绑定单个或多个商品（支持多对一：多个 meituanSkuId 绑定到同一个 productId）
   */
  static async bindItems(
    userId: string,
    bindings: Array<{
      itemId?: string;
      meituanSkuId: string;
      productId: string;
      meituanName?: string;
      meituanSpec?: string;
    }>
  ) {
    if (!bindings || bindings.length === 0) return { success: true, count: 0 };

    const affectedBatchIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const b of bindings) {
        // 1. 在 ProductMeituanSku 中建立/更新映射
        await tx.productMeituanSku.upsert({
          where: {
            userId_meituanSkuId: {
              userId,
              meituanSkuId: b.meituanSkuId,
            },
          },
          create: {
            userId,
            productId: b.productId,
            meituanSkuId: b.meituanSkuId,
            meituanName: b.meituanName || null,
            meituanSpec: b.meituanSpec || null,
          },
          update: {
            productId: b.productId,
            meituanName: b.meituanName || undefined,
            meituanSpec: b.meituanSpec || undefined,
          },
        });

        // 2. 更新 MeituanImportItem 的状态为 BOUND
        if (b.itemId) {
          const item = await tx.meituanImportItem.update({
            where: { id: b.itemId },
            data: {
              bindProductId: b.productId,
              status: "BOUND",
            },
            select: { batchId: true },
          });
          affectedBatchIds.add(item.batchId);
        } else {
          // 如果没传 itemId，更新所有该美团ID的导入明细
          const updatedItems = await tx.meituanImportItem.findMany({
            where: { userId, meituanSkuId: b.meituanSkuId },
            select: { id: true, batchId: true },
          });
          for (const it of updatedItems) {
            affectedBatchIds.add(it.batchId);
          }
          await tx.meituanImportItem.updateMany({
            where: { userId, meituanSkuId: b.meituanSkuId },
            data: {
              bindProductId: b.productId,
              status: "BOUND",
            },
          });
        }
      }

      // 3. 重新统计受影响批次的绑定数与状态
      for (const batchId of affectedBatchIds) {
        const total = await tx.meituanImportItem.count({ where: { batchId } });
        const bound = await tx.meituanImportItem.count({ where: { batchId, status: "BOUND" } });

        await tx.meituanImportBatch.update({
          where: { id: batchId },
          data: {
            totalCount: total,
            matchedCount: bound,
            status: bound === total && total > 0 ? "COMPLETED" : bound > 0 ? "PARTIAL" : "PENDING",
          },
        });
      }
    });

    return { success: true, count: bindings.length };
  }

  /**
   * 解绑商品
   */
  static async unbindItems(userId: string, items: Array<{ itemId?: string; meituanSkuId: string }>) {
    if (!items || items.length === 0) return { success: true, count: 0 };

    const affectedBatchIds = new Set<string>();

    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        // 1. 删除持久化映射
        await tx.productMeituanSku.deleteMany({
          where: {
            userId,
            meituanSkuId: it.meituanSkuId,
          },
        });

        // 2. 更新明细状态回退为 SUGGESTED 或 UNMATCHED
        if (it.itemId) {
          const item = await tx.meituanImportItem.findUnique({
            where: { id: it.itemId },
            select: { batchId: true, suggestedProductId: true },
          });
          if (item) {
            affectedBatchIds.add(item.batchId);
            await tx.meituanImportItem.update({
              where: { id: it.itemId },
              data: {
                bindProductId: null,
                status: item.suggestedProductId ? "SUGGESTED" : "UNMATCHED",
              },
            });
          }
        } else {
          const updatedItems = await tx.meituanImportItem.findMany({
            where: { userId, meituanSkuId: it.meituanSkuId },
            select: { id: true, batchId: true, suggestedProductId: true },
          });
          for (const row of updatedItems) {
            affectedBatchIds.add(row.batchId);
            await tx.meituanImportItem.update({
              where: { id: row.id },
              data: {
                bindProductId: null,
                status: row.suggestedProductId ? "SUGGESTED" : "UNMATCHED",
              },
            });
          }
        }
      }

      // 3. 更新受影响批次统计
      for (const batchId of affectedBatchIds) {
        const total = await tx.meituanImportItem.count({ where: { batchId } });
        const bound = await tx.meituanImportItem.count({ where: { batchId, status: "BOUND" } });

        await tx.meituanImportBatch.update({
          where: { id: batchId },
          data: {
            totalCount: total,
            matchedCount: bound,
            status: bound === total && total > 0 ? "COMPLETED" : bound > 0 ? "PARTIAL" : "PENDING",
          },
        });
      }
    });

    return { success: true, count: items.length };
  }

  /**
   * 忽略 / 取消忽略待配对明细
   */
  static async setItemIgnored(userId: string, itemId: string, ignored: boolean) {
    const item = await prisma.meituanImportItem.findFirst({
      where: { id: itemId, userId },
      select: { id: true, batchId: true, suggestedProductId: true, bindProductId: true },
    });

    if (!item) throw new Error("明细记录不存在");

    let nextStatus = "UNMATCHED";
    if (ignored) {
      nextStatus = "IGNORED";
    } else if (item.bindProductId) {
      nextStatus = "BOUND";
    } else if (item.suggestedProductId) {
      nextStatus = "SUGGESTED";
    }

    await prisma.meituanImportItem.update({
      where: { id: itemId },
      data: { status: nextStatus },
    });

    return { success: true, status: nextStatus };
  }

  /**
   * 导出回写 Excel（适配 meituan-sku-sync.user.js 油猴脚本格式）
   */
  static async exportBatchExcel(userId: string, batchId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const batch = await prisma.meituanImportBatch.findFirst({
      where: { id: batchId, userId },
      include: {
        items: {
          include: {
            bindProduct: {
              select: {
                id: true,
                name: true,
                sku: true,
                costPrice: true,
                specs: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!batch) {
      throw new Error("批次不存在");
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");

    sheet.columns = [
      { header: "商品ID", key: "商品ID", width: 22 },
      { header: "*商品名称", key: "*商品名称", width: 45 },
      { header: "SKU/店内码", key: "SKU/店内码", width: 22 },
      { header: "分类", key: "分类", width: 16 },
      { header: "进货单价", key: "进货单价", width: 14 },
      { header: "供应商", key: "供应商", width: 16 },
      { header: "商品图片", key: "商品图片", width: 45 },
      { header: "图库图片", key: "图库图片", width: 16 },
      { header: "公开状态", key: "公开状态", width: 14 },
      { header: "商品参数", key: "商品参数", width: 16 },
      { header: "备注", key: "备注", width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    for (let i = 0; i < batch.items.length; i++) {
      const item = batch.items[i];
      const boundSku = item.bindProduct?.sku || "";
      const rowNum = i + 2;

      sheet.addRow({
        商品ID: item.meituanSkuId || "",
        "*商品名称": item.name || "",
        "SKU/店内码": boundSku,
        分类: "",
        进货单价: item.price !== null ? item.price : "",
        供应商: "",
        商品图片: item.imageUrl || "",
        图库图片: "",
        公开状态: "公开",
        商品参数: "",
        备注: item.bindProduct?.name ? `系统品名: ${item.bindProduct.name}` : "",
      });

      const row = sheet.getRow(rowNum);
      row.height = 30;
      row.alignment = { vertical: "middle" };
    }

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const baseName = batch.fileName.replace(/\.[^/.]+$/, "");
    const exportFileName = `${baseName}_已配对SKU回写_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return {
      buffer: Buffer.from(buffer),
      fileName: exportFileName,
    };
  }

  /**
   * 【正向主体查询】获取系统店铺商品列表及各自的美团配对与推荐状态
   */
  static async getShopProductsWithMeituanMapping(params: {
    userId?: string;
    shopId?: string;
    batchId?: string;
    platform?: string;
    status?: "ALL" | "UNBOUND" | "BOUND" | "HAS_SUGGESTION";
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      userId,
      shopId,
      batchId,
      platform = "meituan",
      status = "ALL",
      search = "",
      page = 1,
      pageSize = 25,
    } = params;

    const storage = await getStorageStrategy();

    // 1. 查询系统商品池（根据 shopId 关联 ShopProduct 或全局 Product）
    const productWhere: any = {};
    if (userId) {
      productWhere.userId = userId;
    }

    if (shopId && shopId !== "ALL") {
      productWhere.shopProducts = {
        some: { shopId },
      };
    }

    if (search.trim()) {
      const q = search.trim();
      productWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { pinyin: { contains: q, mode: "insensitive" } },
        { pinyinFirst: { contains: q, mode: "insensitive" } },
      ];
    }

    // 获取所有符合基础搜索条件的商品
    const rawProducts = await prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        name: true,
        sku: true,
        image: true,
        costPrice: true,
        stock: true,
        specs: true,
        category: {
          select: { id: true, name: true },
        },
        shopProducts: {
          select: {
            id: true,
            shopId: true,
            sku: true,
            jdSkuId: true,
            meituanSkuId: true,
            taobaoSkuId: true,
            productName: true,
            productImage: true,
          },
        },
        meituanSkuMappings: {
          select: {
            id: true,
            meituanSkuId: true,
            meituanSpuId: true,
            meituanName: true,
            meituanSpec: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ sku: "asc" }, { createdAt: "desc" }],
    });

    // 2. 获取美团候选池未绑定的项（用于智能推荐匹配）
    const meituanItemWhere: any = {
      status: { not: "IGNORED" },
      platform,
    };
    if (userId) meituanItemWhere.userId = userId;
    if (batchId && batchId !== "ALL") meituanItemWhere.batchId = batchId;

    const availableMeituanItems = await prisma.meituanImportItem.findMany({
      where: meituanItemWhere,
      select: {
        id: true,
        batchId: true,
        meituanSkuId: true,
        name: true,
        spec: true,
        barcode: true,
        price: true,
        imageUrl: true,
        status: true,
        bindProductId: true,
      },
    });

    // 建立美团池的快速索引（条形码索引、品名精准与模糊索引）
    const meituanByBarcode = new Map<string, typeof availableMeituanItems[0]>();
    const meituanByName = new Map<string, typeof availableMeituanItems[0]>();

    for (const mItem of availableMeituanItems) {
      if (mItem.barcode && mItem.barcode.trim()) {
        meituanByBarcode.set(mItem.barcode.trim(), mItem);
      }
      const normName = mItem.name.replace(/\s+/g, "").toLowerCase();
      if (!meituanByName.has(normName)) {
        meituanByName.set(normName, mItem);
      }
    }

    // 3. 为每个系统商品计算美团绑定状态与智能推荐
    type EnrichedProduct = Omit<typeof rawProducts[0], "image"> & {
      image: string | null;
      boundCount: number;
      isBound: boolean;
      suggestedMeituanItem?: {
        id: string;
        meituanSkuId: string;
        name: string;
        spec: string | null;
        barcode: string | null;
        price: number | null;
        imageUrl: string | null;
        reason: string;
      } | null;
    };

    const enrichedProducts: EnrichedProduct[] = rawProducts.map((prod) => {
      const boundCount = prod.meituanSkuMappings.length;
      const isBound = boundCount > 0;

      // 提取主图：优先使用店铺商品独立图，其次使用商品全局主图，并通过 storage.resolveUrl 转换为完整URL
      const matchedShopProduct = shopId && shopId !== "ALL"
        ? prod.shopProducts.find((sp) => sp.shopId === shopId)
        : prod.shopProducts[0];
      const rawImage = matchedShopProduct?.productImage || prod.image || null;
      const resolvedImage = rawImage ? storage.resolveUrl(rawImage) : null;

      let suggestedMeituanItem: EnrichedProduct["suggestedMeituanItem"] = null;

      // 如果尚未绑定美团 ID，尝试从美团数据池匹配推荐
      if (!isBound) {
        // ① 提取商品 specs 中可能包含的条形码
        const prodSpecs = (prod.specs as Record<string, any>) || {};
        const prodBarcode = String(
          prodSpecs.barcode || prodSpecs.条形码 || prodSpecs.条码 || ""
        ).trim();

        if (prodBarcode && meituanByBarcode.has(prodBarcode)) {
          const match = meituanByBarcode.get(prodBarcode)!;
          suggestedMeituanItem = {
            id: match.id,
            meituanSkuId: match.meituanSkuId,
            name: match.name,
            spec: match.spec,
            barcode: match.barcode,
            price: match.price,
            imageUrl: match.imageUrl ? storage.resolveUrl(match.imageUrl) : null,
            reason: "条形码完全相同",
          };
        }

        // ② 按商品名称精准匹配
        if (!suggestedMeituanItem) {
          const normProdName = prod.name.replace(/\s+/g, "").toLowerCase();
          if (meituanByName.has(normProdName)) {
            const match = meituanByName.get(normProdName)!;
            suggestedMeituanItem = {
              id: match.id,
              meituanSkuId: match.meituanSkuId,
              name: match.name,
              spec: match.spec,
              barcode: match.barcode,
              price: match.price,
              imageUrl: match.imageUrl ? storage.resolveUrl(match.imageUrl) : null,
              reason: "品名完全一致",
            };
          }
        }

        // ③ 按名称包含关系模糊推荐
        if (!suggestedMeituanItem) {
          const normProdName = prod.name.replace(/\s+/g, "").toLowerCase();
          if (normProdName.length >= 2) {
            const candidate = availableMeituanItems.find((m) => {
              const mName = m.name.replace(/\s+/g, "").toLowerCase();
              return (
                mName.includes(normProdName) || normProdName.includes(mName)
              );
            });
            if (candidate) {
              suggestedMeituanItem = {
                id: candidate.id,
                meituanSkuId: candidate.meituanSkuId,
                name: candidate.name,
                spec: candidate.spec,
                barcode: candidate.barcode,
                price: candidate.price,
                imageUrl: candidate.imageUrl,
                reason: "品名字段高相似",
              };
            }
          }
        }
      }

      return {
        ...prod,
        image: resolvedImage,
        shopProductId: matchedShopProduct?.id || null,
        shopSku: matchedShopProduct?.sku || null,
        shopProductName: matchedShopProduct?.productName || null,
        jdSkuId: matchedShopProduct?.jdSkuId || null,
        meituanSkuId: matchedShopProduct?.meituanSkuId || null,
        taobaoSkuId: matchedShopProduct?.taobaoSkuId || null,
        boundCount,
        isBound,
        suggestedMeituanItem,
      };
    });

    // 4. 统计状态数量
    const statusCounts = {
      TOTAL: enrichedProducts.length,
      UNBOUND: enrichedProducts.filter((p) => !p.isBound).length,
      BOUND: enrichedProducts.filter((p) => p.isBound).length,
      HAS_SUGGESTION: enrichedProducts.filter(
        (p) => !p.isBound && p.suggestedMeituanItem
      ).length,
    };

    // 5. 过滤状态
    let filtered = enrichedProducts;
    if (status === "UNBOUND") {
      filtered = filtered.filter((p) => !p.isBound);
    } else if (status === "BOUND") {
      filtered = filtered.filter((p) => p.isBound);
    } else if (status === "HAS_SUGGESTION") {
      filtered = filtered.filter((p) => !p.isBound && p.suggestedMeituanItem);
    }

    // 6. 分页切片
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const skip = (page - 1) * pageSize;
    const pagedItems = filtered.slice(skip, skip + pageSize);

    return {
      items: pagedItems,
      total,
      page,
      pageSize,
      totalPages,
      statusCounts,
    };
  }

  /**
   * 【正向智能搜索美团候选池】
   * 支持多词分词、去除营销词、字面相似度加权以及未绑定优先排序
   */
  static async searchMeituanCandidates(params: {
    userId?: string;
    query?: string;
    batchId?: string;
    platform?: string;
    filterStatus?: "ALL" | "UNBOUND" | "BOUND";
  }) {
    const { userId, query = "", batchId, platform = "meituan", filterStatus = "ALL" } = params;
    const trimmed = query.trim();

    // 基础过滤条件
    const baseWhere: any = {
      status: { not: "IGNORED" },
      platform,
    };
    if (userId) baseWhere.userId = userId;
    if (batchId && batchId !== "ALL") baseWhere.batchId = batchId;
    if (filterStatus === "UNBOUND") {
      baseWhere.status = "UNMATCHED";
    } else if (filterStatus === "BOUND") {
      baseWhere.status = "BOUND";
    }

    // 如果没有任何搜索词，返回最新数据（未绑定优先）
    if (!trimmed) {
      const items = await prisma.meituanImportItem.findMany({
        where: baseWhere,
        select: {
          id: true,
          batchId: true,
          meituanSkuId: true,
          meituanSpuId: true,
          name: true,
          spec: true,
          barcode: true,
          price: true,
          imageUrl: true,
          status: true,
          bindProductId: true,
          bindProduct: {
            select: { id: true, name: true, sku: true },
          },
        },
        take: 60,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      });
      return items;
    }

    // 智能拆词与清洗
    const cleanSearchStr = this.cleanName(trimmed);
    // 拆分出有效 tokens（按空格、标点、斜杠、括号等）
    const tokens = trimmed
      .split(/[\s/\\+-_,，.。!！?？|()（）[\]【】]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    const searchConditions: any[] = [
      // 1. 包含原始输入整体
      { name: { contains: trimmed, mode: "insensitive" } },
      { meituanSkuId: { contains: trimmed, mode: "insensitive" } },
      { barcode: { contains: trimmed, mode: "insensitive" } },
    ];

    // 2. 包含清洗后的紧凑短语
    if (cleanSearchStr && cleanSearchStr !== trimmed.toLowerCase()) {
      searchConditions.push({ name: { contains: cleanSearchStr, mode: "insensitive" } });
    }

    // 3. 包含各个分词 tokens（只要命中任一 token 即拉取出来进行精细算分）
    for (const token of tokens) {
      if (token.length >= 2) {
        searchConditions.push({ name: { contains: token, mode: "insensitive" } });
      }
    }

    const where = {
      ...baseWhere,
      OR: searchConditions,
    };

    // 从数据库中拉取候选集（最多 150 条用于内存重排）
    const candidates = await prisma.meituanImportItem.findMany({
      where,
      select: {
        id: true,
        batchId: true,
        meituanSkuId: true,
        meituanSpuId: true,
        name: true,
        spec: true,
        barcode: true,
        price: true,
        imageUrl: true,
        status: true,
        bindProductId: true,
        bindProduct: {
          select: { id: true, name: true, sku: true },
        },
      },
      take: 150,
    });

    // 内存中进行智能相似度打分与重排
    const targetClean = cleanSearchStr || trimmed.toLowerCase();
    const scoredItems = candidates.map((item) => {
      let score = 0;
      const itemName = (item.name || "").toLowerCase();
      const itemClean = this.cleanName(item.name || "");
      const itemSkuId = (item.meituanSkuId || "").toLowerCase();
      const itemBarcode = (item.barcode || "").toLowerCase();

      // 1. 美团 ID / 条码精确命中
      if (itemSkuId === trimmed.toLowerCase() || itemBarcode === trimmed.toLowerCase()) {
        score += 200;
      }

      // 2. 品名完全一致 / 清洗营销词后完全一致
      if (itemName === trimmed.toLowerCase()) {
        score += 150;
      } else if (itemClean && itemClean === targetClean) {
        score += 130;
      }

      // 3. 包含完整搜索词
      if (itemName.includes(trimmed.toLowerCase())) {
        score += 100;
      } else if (itemClean && itemClean.includes(targetClean)) {
        score += 90;
      }

      // 4. 目标词包含美团品名（美团名字较短的情况）
      if (targetClean.includes(itemClean) && itemClean.length >= 2) {
        score += 80;
      }

      // 5. 分词 Token 命中加权
      let tokenHits = 0;
      for (const token of tokens) {
        if (itemName.includes(token) || (item.spec && item.spec.toLowerCase().includes(token))) {
          tokenHits++;
          score += 25 * token.length; // 越长的词命中权重越高
        }
      }

      // 如果所有 token 全命中，给予超额加成
      if (tokens.length > 1 && tokenHits === tokens.length) {
        score += 60;
      }

      // 6. 字符重叠度打分（Jaccard 字符集比对）
      const itemChars = new Set(itemClean.split(""));
      const targetChars = new Set(targetClean.split(""));
      let intersectCount = 0;
      for (const ch of targetChars) {
        if (itemChars.has(ch)) intersectCount++;
      }
      if (targetChars.size > 0) {
        const jaccard = intersectCount / (itemChars.size + targetChars.size - intersectCount);
        score += Math.round(jaccard * 40);
      }

      // 7. 未绑定优先加权
      if (item.status === "UNMATCHED") {
        score += 15;
      }

      return { item, score };
    });

    // 按得分从高到低排序，得分相同按未绑定优先
    scoredItems.sort((a, b) => b.score - a.score);

    return scoredItems.slice(0, 60).map((si) => si.item);
  }

  /**
   * 【正向单件绑定】将指定美团商品绑定到系统商品（允许系统商品关联多个美团ID）
   */
  static async bindMeituanToProduct(params: {
    userId?: string;
    productId: string;
    meituanSkuId: string;
    meituanSpuId?: string;
    meituanName?: string;
    meituanSpec?: string;
  }) {
    const { userId, productId, meituanSkuId, meituanSpuId, meituanName, meituanSpec } = params;

    // 1. 一个美团 ID 只能绑定到一个系统商品（不允许一对多）：先删除该美团 ID 之前可能存在的映射
    await prisma.productMeituanSku.deleteMany({
      where: {
        meituanSkuId,
        ...(userId ? { userId } : {}),
      },
    });

    // 2. 写入新的映射记录
    const mapping = await prisma.productMeituanSku.create({
      data: {
        productId,
        userId: userId || null,
        meituanSkuId,
        meituanSpuId: meituanSpuId || null,
        meituanName: meituanName || null,
        meituanSpec: meituanSpec || null,
      },
    });

    // 3. 将美团导入池中所有对应的 meituanSkuId 标记为已绑定该 productId
    await prisma.meituanImportItem.updateMany({
      where: {
        meituanSkuId,
        ...(userId ? { userId } : {}),
      },
      data: {
        bindProductId: productId,
        status: "BOUND",
      },
    });

    // 4. 更新相关导入批次的配对计数
    const affectedBatches = await prisma.meituanImportItem.findMany({
      where: { meituanSkuId, ...(userId ? { userId } : {}) },
      select: { batchId: true },
      distinct: ["batchId"],
    });

    for (const b of affectedBatches) {
      const totalCount = await prisma.meituanImportItem.count({ where: { batchId: b.batchId } });
      const matchedCount = await prisma.meituanImportItem.count({
        where: { batchId: b.batchId, status: "BOUND" },
      });
      await prisma.meituanImportBatch.update({
        where: { id: b.batchId },
        data: {
          matchedCount,
          status: matchedCount >= totalCount ? "COMPLETED" : matchedCount > 0 ? "PARTIAL" : "PENDING",
        },
      });
    }

    return mapping;
  }

  /**
   * 【正向单件解绑】解除系统商品与美团ID的绑定关系
   */
  static async unbindMeituanFromProduct(params: {
    userId?: string;
    productId: string;
    meituanSkuId: string;
  }) {
    const { userId, productId, meituanSkuId } = params;

    // 1. 删除映射
    await prisma.productMeituanSku.deleteMany({
      where: {
        productId,
        meituanSkuId,
        ...(userId ? { userId } : {}),
      },
    });

    // 2. 将美团明细重置为未绑定
    await prisma.meituanImportItem.updateMany({
      where: {
        meituanSkuId,
        bindProductId: productId,
        ...(userId ? { userId } : {}),
      },
      data: {
        bindProductId: null,
        status: "UNMATCHED",
      },
    });

    // 3. 更新批次计数
    const affectedBatches = await prisma.meituanImportItem.findMany({
      where: { meituanSkuId, ...(userId ? { userId } : {}) },
      select: { batchId: true },
      distinct: ["batchId"],
    });

    for (const b of affectedBatches) {
      const totalCount = await prisma.meituanImportItem.count({ where: { batchId: b.batchId } });
      const matchedCount = await prisma.meituanImportItem.count({
        where: { batchId: b.batchId, status: "BOUND" },
      });
      await prisma.meituanImportBatch.update({
        where: { id: b.batchId },
        data: {
          matchedCount,
          status: matchedCount >= totalCount ? "COMPLETED" : matchedCount > 0 ? "PARTIAL" : "PENDING",
        },
      });
    }

    return { success: true };
  }
}
