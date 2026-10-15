import type { LeaderboardExpenses } from "./profitLeaderboardDeductions";

export interface LeaderboardMember {
  id: string;
  name: string;
  email: string;
  credentialVersion?: string;
}

export interface LeaderboardResult {
  rows: Array<LeaderboardMember & { profit: number; rank: number; pureProfit?: number; deductions?: LeaderboardExpenses }>;
  failed: boolean;
  updatedAt?: number;
}

const TTL_MS = 5 * 60 * 1000;
const entries = new Map<string, {
  data?: LeaderboardResult;
  expiresAt: number;
  pending?: Promise<LeaderboardResult>;
}>();

// Memory only, keyed by viewer permissions, member credentials, date and period.
export function readProfitLeaderboardCache(key: string): LeaderboardResult | undefined {
  return entries.get(key)?.data;
}

export function loadProfitLeaderboardCache(
  key: string,
  loader: () => Promise<LeaderboardResult>,
  force = false,
): Promise<LeaderboardResult> {
  const existing = entries.get(key);
  if (existing?.pending) return existing.pending;
  if (!force && existing?.data && existing.expiresAt > Date.now()) return Promise.resolve(existing.data);
  const entry = existing || { expiresAt: 0 };
  const pending = Promise.resolve().then(loader).then(data => {
    if (!data.failed) {
      const updatedAt = Date.now();
      const snapshot = { ...data, updatedAt };
      entry.data = snapshot;
      entry.expiresAt = updatedAt + TTL_MS;
      return snapshot;
    }
    return data;
  }).finally(() => {
    entry.pending = undefined;
    if (!entry.data) entries.delete(key);
    // Bound stored snapshots without evicting active requests.
    for (const [candidate, value] of entries) {
      if (entries.size <= 12) break;
      if (!value.pending) entries.delete(candidate);
    }
  });
  entry.pending = pending;
  entries.delete(key);
  entries.set(key, entry);
  return pending;
}
