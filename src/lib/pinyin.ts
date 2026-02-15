import { match } from 'pinyin-pro';

/**
 * Checks if a search query matches a target string using Pinyin.
 * Supports full pinyin, initials, and Chinese characters.
 * @param target The string to search in (e.g., "自刷订单")
 * @param query The search term (e.g., "zsh")
 * @returns boolean
 */
export function pinyinMatch(target: string, query: string): boolean {
  if (!query) return true;
  if (!target) return false;
  
  // Standard case-insensitive includes
  const normalizedTarget = target.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  
  if (normalizedTarget.includes(normalizedQuery)) return true;
  
  // Pinyin match
  // 'match' returns the indices if matched, or null/empty array if not.
  const result = match(target, query, { precision: 'start' });
  
  return !!(result && result.length > 0);
}
