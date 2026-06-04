/*
 * @Date: 2026-02-07 16:41:21
 * @Author: Sube
 * @FilePath: utils.ts
 * @LastEditTime: 2026-02-15 09:50:20
 * @Description: 
 */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { Category } from "./types";

/**
 * 安全地从 string | Category | undefined 中提取分类名称
 */
export function getCategoryName(category: string | Category | undefined): string {
  if (!category) return "Uncategorized";
  if (typeof category === "string") return category;
  return category.name;
}

/**
 * 从请求中提取真实的 Origin。
 * 优先检查 x-forwarded-host 和 x-forwarded-proto 头，以适配 Nginx 等反向代理。
 */
export function getRequestOrigin(request: Request): string {
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") || headers.get("host");
  const proto = headers.get("x-forwarded-proto") || "http";
  
  if (host) {
    return `${proto}://${host}`;
  }
  
  // 兜底方案
  const url = new URL(request.url);
  return url.origin;
}

/**
 * 健壮的剪贴板复制工具，兼容非 HTTPS 环境、iOS Safari 及不同浏览器
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. 优先尝试 Modern API (如果环境支持且安全)
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("Modern API writeText failed:", err);
  }

  // 2. 尝试使用 ClipboardItem (绕过部分移动端异步限制)
  try {
    if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
      const data = [new ClipboardItem({ "text/plain": Promise.resolve(text) })];
      await navigator.clipboard.write(data);
      return true;
    }
  } catch (err) {
    console.warn("Modern API write(ClipboardItem) failed:", err);
  }

  // 3. 兜底尝试 execCommand (适用于非 HTTPS 或较旧浏览器，如 iOS Safari 在异步后的同步块)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    textArea.style.fontSize = "16px"; // 避免 iOS 自动缩放
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, 99999); // 适配部分设备
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error("Fallback Clipboard failed:", err);
    return false;
  }
}

export interface ParsedNote {
  platform: string | null;
  platformId: string | null;
  address: string | null;
  userNote: string | null;
  shopName: string | null;
  serialNum: string | null;
  rawNote: string;
}

export function parseOutboundNote(note: string | undefined | null): ParsedNote {
  const result: ParsedNote = {
    platform: null,
    platformId: null,
    address: null,
    userNote: null,
    shopName: null,
    serialNum: null,
    rawNote: note || "",
  };
  
  if (!note) return result;
  
  // 提取对冲退回前的原始备注
  const noteParts = note.match(/^(.*)\s*\(已退回:\s*(.*)\)$/);
  let workingNote = noteParts ? noteParts[1] : note;
  
  // 1. 提取店铺
  const shopMatch = workingNote.match(/\[店铺:(.*?)\]/);
  if (shopMatch) {
    result.shopName = shopMatch[1];
    workingNote = workingNote.replace(/\[店铺:.*?\]\s*/, '');
  }
  
  // 2. 提取流水号
  const serialMatch = workingNote.match(/\[流水号:(.*?)\]/);
  if (serialMatch) {
    if (serialMatch[1] !== '无') {
      result.serialNum = serialMatch[1];
    }
    workingNote = workingNote.replace(/\[流水号:.*?\]\s*/, '');
  }
  
  // 3. 提取平台标识
  const platformMatch = workingNote.match(/\[([^\[\]]+)\]/);
  if (platformMatch) {
    result.platform = platformMatch[1];
    workingNote = workingNote.replace(/\[([^\[\]]+)\]\s*/, '');
  }
  
  // 4. 提取平台单号
  const platformIdMatch = workingNote.match(/平台单号:\s*([^\s|]+)/);
  if (platformIdMatch) {
    result.platformId = platformIdMatch[1];
    // 移除平台单号部分
    workingNote = workingNote.replace(/平台单号:\s*[^\s|]+\s*\|?\s*/, '');
  }
  
  // 5. 提取地址
  const addressMatch = workingNote.match(/地址:\s*([^|]+)/);
  if (addressMatch) {
    result.address = addressMatch[1].trim();
    // 移除地址部分
    workingNote = workingNote.replace(/地址:\s*[^|]+\s*\|?\s*/, '');
  }
  
  // 6. 提取真实备注
  let cleanNote = workingNote.replace(/^\|\s*/, '').replace(/\|\s*$/, '');
  cleanNote = cleanNote.replace(/^备注:\s*/, '').trim();
  result.userNote = cleanNote || null;
  
  return result;
}

export interface PlatformBadgeMeta {
  name: string;
  iconSrc: string;
  className: string;
}

export function getPlatformMeta(platform: string | undefined | null): PlatformBadgeMeta | null {
  if (!platform) return null;
  const name = platform.trim();

  if (name.includes("线下") || name.includes("线下交易")) {
    return {
      name: "线下交易",
      iconSrc: "/platform/线下交易.svg",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:bg-emerald-500/20 dark:border-emerald-500/30",
    };
  }

  if (name.includes("帮我取货")) {
    return {
      name: "帮我取货",
      iconSrc: "/platform/其他.svg",
      className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 dark:bg-violet-500/20 dark:border-violet-500/30",
    };
  }
  
  if (name.includes("美团")) {
    return {
      name: "美团",
      iconSrc: "/platform/美团.svg",
      className: "bg-[#FFD000]/10 text-amber-700 dark:text-[#FFD000] border-amber-500/20 dark:bg-[#FFD000]/20 dark:border-[#FFD000]/30",
    };
  }
  if (name.includes("京东")) {
    return {
      name: "京东",
      iconSrc: "/platform/京东.svg",
      className: "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 dark:bg-red-500/20 dark:border-red-500/30",
    };
  }
  if (name.includes("淘宝")) {
    return {
      name: "淘宝",
      iconSrc: "/platform/淘宝.svg",
      className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 dark:bg-orange-500/20 dark:border-orange-500/30",
    };
  }
  return {
    name: name,
    iconSrc: "/platform/其他.svg",
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 dark:bg-violet-500/20 dark:border-violet-500/30",
  };
}

export interface FactoryShipmentNotePayload {
  recipientName: string;
  recipientPhone?: string | null;
  paymentStatus: string;
  compensationStatus?: string | null;
  recipientAddress: string;
  trackingEntries?: FactoryShipmentTrackingEntry[];
  remark?: string | null;

  // 独立补偿物流
  compensationLogisticsName?: string | null;
  compensationTrackingNumber?: string | null;
  compensationItems?: FactoryShipmentCompensationItem[];
}

export interface FactoryShipmentTrackingEntry {
  itemKey: string;
  itemName?: string;
  trackingNumber: string;
  logisticsName?: string;
  shippingFee?: number;
}

export interface FactoryShipmentCompensationItem {
  itemKey: string;
  itemName?: string;
  quantity: number;
}

export interface ParsedFactoryShipmentNote {
  isFactoryShipment: boolean;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  paymentStatus: string;
  compensationStatus: string;
  trackingEntries: FactoryShipmentTrackingEntry[];
  remark: string;
  rawNote: string;

  // 独立补偿物流
  compensationLogisticsName: string;
  compensationTrackingNumber: string;
  compensationItems: FactoryShipmentCompensationItem[];
}

export function buildFactoryShipmentNote(payload: FactoryShipmentNotePayload): string {
  const trackingSegment = (payload.trackingEntries || [])
    .filter((entry) => entry.itemKey?.trim() && (entry.trackingNumber?.trim() || entry.logisticsName?.trim() || entry.shippingFee))
    .map((entry) => {
      const logisticsPart = entry.logisticsName?.trim() ? `${entry.logisticsName.trim()}:` : "";
      const trackingPart = entry.trackingNumber?.trim() || "";
      const feePart = entry.shippingFee && entry.shippingFee > 0 ? `:${entry.shippingFee}` : "";
      return `${entry.itemKey.trim()}=${logisticsPart}${trackingPart}${feePart}`;
    })
    .join(" ; ");

  const compensationTrackingSegment = payload.compensationTrackingNumber?.trim()
    ? `${payload.compensationLogisticsName?.trim() ? payload.compensationLogisticsName.trim() + ":" : ""}${payload.compensationTrackingNumber.trim()}`
    : "";

  const compensationItemsSegment = (payload.compensationItems || [])
    .filter((item) => item.itemKey?.trim() && item.quantity > 0)
    .map((item) => `${item.itemKey.trim()}=${item.quantity}`)
    .join(" ; ");

  const parts = [
    "[销售]",
    `[收件人:${payload.recipientName.trim()}]`,
    payload.recipientPhone?.trim() ? `[电话:${payload.recipientPhone.trim()}]` : "",
    `[货款:${payload.paymentStatus.trim()}]`,
    payload.compensationStatus?.trim() ? `[补偿:${payload.compensationStatus.trim()}]` : "",
    compensationTrackingSegment ? `[补偿单号:${compensationTrackingSegment}]` : "",
    compensationItemsSegment ? `[补偿货品:${compensationItemsSegment}]` : "",
    `地址: ${payload.recipientAddress.trim()}`,
    trackingSegment ? `| 单号: ${trackingSegment}` : "",
    payload.remark?.trim() ? `| 备注: ${payload.remark.trim()}` : "",
  ].filter(Boolean);

  return parts.join(" ").trim();
}

export function parseFactoryShipmentNote(note: string | undefined | null): ParsedFactoryShipmentNote {
  const rawNote = note || "";
  const result: ParsedFactoryShipmentNote = {
    isFactoryShipment: rawNote.includes("[厂家发货]") || rawNote.includes("[销售]"),
    recipientName: "",
    recipientPhone: "",
    recipientAddress: "",
    paymentStatus: "未支付",
    compensationStatus: "",
    trackingEntries: [],
    remark: "",
    rawNote,
    compensationLogisticsName: "",
    compensationTrackingNumber: "",
    compensationItems: [],
  };

  if (!rawNote) {
    return result;
  }

  const recipientMatch = rawNote.match(/\[收件人:(.*?)\]/);
  const phoneMatch = rawNote.match(/\[电话:(.*?)\]/);
  const paymentMatch = rawNote.match(/\[货款:(.*?)\]/);
  const compensationMatch = rawNote.match(/\[补偿:(.*?)\]/);
  const compensationLogisticsMatch = rawNote.match(/\[补偿单号:(.*?)\]/);
  const compensationItemsMatch = rawNote.match(/\[补偿货品:(.*?)\]/);
  const addressMatch = rawNote.match(/地址:\s*([^|]+)/);
  const trackingMatch = rawNote.match(/单号:\s*(.*?)(?:\s*\|\s*备注:|$)/);
  const remarkMatch = rawNote.match(/备注:\s*(.*)$/);

  result.recipientName = recipientMatch?.[1]?.trim() || "";
  result.recipientPhone = phoneMatch?.[1]?.trim() || "";
  result.paymentStatus = paymentMatch?.[1]?.trim() || result.paymentStatus;
  const compensationStatus = compensationMatch?.[1]?.trim() || result.compensationStatus;
  result.compensationStatus = compensationStatus === "无需补偿" ? "" : compensationStatus;

  if (compensationLogisticsMatch?.[1]) {
    const fullVal = compensationLogisticsMatch[1].trim();
    const colonIndex = fullVal.indexOf(":");
    if (colonIndex > -1) {
      result.compensationLogisticsName = fullVal.substring(0, colonIndex).trim();
      result.compensationTrackingNumber = fullVal.substring(colonIndex + 1).trim();
    } else {
      result.compensationLogisticsName = "";
      result.compensationTrackingNumber = fullVal;
    }
  }

  if (compensationItemsMatch?.[1]) {
    result.compensationItems = compensationItemsMatch[1]
      .split(/\s*;\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const [itemKey, qtyStr] = segment.split("=");
        return {
          itemKey: itemKey?.trim() || "",
          quantity: parseInt(qtyStr, 10) || 1,
        };
      })
      .filter((item) => item.itemKey && item.quantity > 0);
  }

  result.recipientAddress = addressMatch?.[1]?.trim() || "";
  result.trackingEntries = trackingMatch?.[1]
    ? trackingMatch[1]
        .split(/\s*;\s*/)
        .map((segment) => segment.trim())
        .filter(Boolean)
        .map((segment) => {
          const [itemKey, ...rest] = segment.split("=");
          const fullVal = rest.join("=").trim();
          let logisticsName = "";
          let trackingNumber = "";
          let shippingFee = 0;

          const colonParts = fullVal.split(":");
          if (colonParts.length >= 3) {
            logisticsName = colonParts[0].trim();
            trackingNumber = colonParts[1].trim();
            shippingFee = Number(colonParts[2].trim()) || 0;
          } else if (colonParts.length === 2) {
            const leftPart = colonParts[0].trim();
            const rightPart = colonParts[1].trim();

            // 兼容旧数据里“仅填写运费”被序列化为 `:20` 的情况，避免把运费误解析成快递单号。
            if (!leftPart && rightPart) {
              logisticsName = "";
              trackingNumber = "";
              shippingFee = Number(rightPart) || 0;
            } else {
              logisticsName = leftPart;
              trackingNumber = rightPart;
            }
          } else {
            logisticsName = "";
            trackingNumber = fullVal.trim();
          }

          return {
            itemKey: itemKey?.trim() || "",
            logisticsName,
            trackingNumber,
            shippingFee,
          };
        })
        .filter((entry) => entry.itemKey && (entry.trackingNumber || entry.logisticsName || entry.shippingFee))
    : [];
  result.remark = remarkMatch?.[1]?.trim() || "";

  return result;
}

export function generateOutboundId(type?: string): string {
  const prefix = type === "FactoryShipment" ? "FH" : "CK";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${date}-${random}`;
}
