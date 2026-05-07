export const LIGHTER_ZONE_TAG = "打火机专区";

export const LIGHTER_ISSUE_TAGS = [
  "打不着火",
  "火焰偏小",
  "火焰偏斜",
  "漏气疑虑",
  "外观瑕疵",
  "刻字偏差",
  "运输磕碰",
  "使用说明",
] as const;

export function normalizeGalleryTags(tags: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = String(tag || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function isLighterIssueTag(tag: string | null | undefined) {
  const value = String(tag || "").trim();
  return LIGHTER_ISSUE_TAGS.includes(value as (typeof LIGHTER_ISSUE_TAGS)[number]);
}

export function hasGalleryTag(tags: Array<string | null | undefined> | null | undefined, target: string) {
  const normalizedTarget = String(target || "").trim();
  if (!normalizedTarget) return false;

  return (tags || []).some((tag) => String(tag || "").trim() === normalizedTarget);
}

export function isLighterLikeProduct(input: { name?: string | null; categoryName?: string | null; tags?: string[] | null }) {
  const name = String(input.name || "").trim();
  const categoryName = String(input.categoryName || "").trim();
  const keywords = ["打火机", "火机"];

  if (hasGalleryTag(input.tags, LIGHTER_ZONE_TAG)) return true;
  return keywords.some((keyword) => name.includes(keyword) || categoryName.includes(keyword));
}
