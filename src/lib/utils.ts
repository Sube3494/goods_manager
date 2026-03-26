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
 * 健壮的剪贴板复制工具，兼容非 HTTPS 环境及不同浏览器
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. 优先尝试 Modern API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Modern Clipboard API failed:", err);
    }
  }

  // 2. 兜底尝试 execCommand (适用于非 HTTPS 或较旧浏览器)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // 隐藏文本框
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    // 选中并执行复制
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    return successful;
  } catch (err) {
    console.error("Fallback Clipboard failed:", err);
    return false;
  }
}
