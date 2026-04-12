"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pinyinMatch = pinyinMatch;
exports.sortPurchaseItems = sortPurchaseItems;
/*
 * @Date: 2026-02-15 17:38:46
 * @Author: Sube
 * @FilePath: pinyin.ts
 * @LastEditTime: 2026-02-24 06:42:48
 * @Description:
 */
const pinyin_pro_1 = require("pinyin-pro");
/**
 * Checks if a search query matches a target string using Pinyin.
 * Supports full pinyin, initials, and Chinese characters.
 * @param target The string to search in (e.g., "自刷订单")
 * @param query The search term (e.g., "zsh")
 * @returns boolean
 */
function pinyinMatch(target, query) {
    if (!query)
        return true;
    if (!target)
        return false;
    // Standard case-insensitive includes
    const normalizedTarget = target.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    if (normalizedTarget.includes(normalizedQuery))
        return true;
    // Pinyin match
    // 'match' returns the indices if matched, or null/empty array if not.
    const result = (0, pinyin_pro_1.match)(target, query, { precision: 'start' });
    return !!(result && result.length > 0);
}
/**
 * Sorts an array of purchase items based on UI requirements:
 * 1. Items without a SKU are prioritized (sorted first).
 * 2. Among items without a SKU, sorted by the pinyin of the first character of the product name.
 * 3. Items with a SKU fall behind, sorted by the SKU string (ascending).
 */
function sortPurchaseItems(items, getSku, getName) {
    return [...items].sort((a, b) => {
        const skuA = (getSku(a) || '').trim();
        const skuB = (getSku(b) || '').trim();
        // 1. No SKU prioritized over has SKU
        if (!skuA && skuB)
            return -1;
        if (skuA && !skuB)
            return 1;
        // 2. Both NO SKU -> Sort by Pinyin of the first character of the name
        if (!skuA && !skuB) {
            const nameA = getName(a) || '';
            const nameB = getName(b) || '';
            const charA = nameA.trim().charAt(0);
            const charB = nameB.trim().charAt(0);
            const pyA = charA ? (0, pinyin_pro_1.pinyin)(charA, { toneType: 'none', type: 'string' }) : '';
            const pyB = charB ? (0, pinyin_pro_1.pinyin)(charB, { toneType: 'none', type: 'string' }) : '';
            return pyA.localeCompare(pyB);
        }
        // 3. Both HAVE SKU -> Sort by SKU alphanumeric (Natural Sort)
        return skuA.localeCompare(skuB, undefined, { numeric: true, sensitivity: 'base' });
    });
}
