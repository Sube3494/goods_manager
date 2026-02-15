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
