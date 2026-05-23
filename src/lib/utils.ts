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
  const shopMatch = workingNote.match(/^\[店铺:(.*?)\]\s*/);
  if (shopMatch) {
    result.shopName = shopMatch[1];
    workingNote = workingNote.replace(/^\[店铺:.*?\]\s*/, '');
  }
  
  // 2. 提取流水号
  const serialMatch = workingNote.match(/^\[流水号:(.*?)\]\s*/);
  if (serialMatch) {
    if (serialMatch[1] !== '无') {
      result.serialNum = serialMatch[1];
    }
    workingNote = workingNote.replace(/^\[流水号:.*?\]\s*/, '');
  }
  
  // 3. 提取平台标识
  const platformMatch = workingNote.match(/^\[([^\[\]]+)\]/);
  if (platformMatch) {
    result.platform = platformMatch[1];
    workingNote = workingNote.replace(/^\[([^\[\]]+)\]\s*/, '');
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


