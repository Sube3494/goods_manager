import assert from "node:assert/strict";
import { loadProfitLeaderboardCache, readProfitLeaderboardCache, type LeaderboardResult } from "../src/lib/profitLeaderboardCache";

async function main() {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    let calls = 0;
    const data: LeaderboardResult = { rows: [], failed: false };
    const loader = async () => { calls++; return data; };
    const first = loadProfitLeaderboardCache("viewer-a:month:credentials-v1", loader);
    const duplicate = loadProfitLeaderboardCache("viewer-a:month:credentials-v1", loader);
    assert.equal(first, duplicate, "Simultaneous mounts reuse the same request");
    const firstSnapshot = await first;
    assert.equal(firstSnapshot.updatedAt, now, "Timestamp records when data loaded successfully");
    now += 1000;
    const cachedSnapshot = await loadProfitLeaderboardCache("viewer-a:month:credentials-v1", loader);
    assert.equal(cachedSnapshot.updatedAt, firstSnapshot.updatedAt, "Cache reads preserve the original timestamp");
    assert.equal(calls, 1, "Returning within the TTL reuses data");
    assert.equal(readProfitLeaderboardCache("viewer-b:month:credentials-v1"), undefined);
    assert.equal(readProfitLeaderboardCache("viewer-a:month:credentials-v2"), undefined);
    assert.equal(readProfitLeaderboardCache("viewer-a:today:credentials-v1"), undefined);
    now += 5 * 60 * 1000 + 1;
    assert.equal(readProfitLeaderboardCache("viewer-a:month:credentials-v1"), firstSnapshot, "Keep the previous snapshot during background refresh");
    const revalidated = await loadProfitLeaderboardCache("viewer-a:month:credentials-v1", loader);
    assert.equal(revalidated.updatedAt, now, "Revalidation updates the timestamp");
    assert.equal(calls, 2, "Expired data is revalidated");
    now += 1000;
    const refreshed = await loadProfitLeaderboardCache("viewer-a:month:credentials-v1", loader, true);
    assert.equal(refreshed.updatedAt, now, "Manual refresh records a new timestamp");
    assert.equal(calls, 3, "Manual refresh bypasses fresh data");
    await loadProfitLeaderboardCache("failed", async () => ({ rows: [], failed: true }));
    assert.equal(readProfitLeaderboardCache("failed"), undefined, "Incomplete rankings are not cached");
    await loadProfitLeaderboardCache("viewer-a:month:credentials-v1", async () => ({ rows: [], failed: true }), true);
    assert.equal(readProfitLeaderboardCache("viewer-a:month:credentials-v1")?.updatedAt, refreshed.updatedAt, "Failures preserve the cached timestamp");
    await assert.rejects(loadProfitLeaderboardCache("rejected", async () => { throw new Error("offline"); }));
    assert.deepEqual((await loadProfitLeaderboardCache("rejected", loader)).rows, data.rows, "Failed requests can retry");
    console.log("PASS: request deduplication, TTL, stale snapshots, forced refresh, viewer/period/credential isolation and failure retry");
  } finally {
    Date.now = originalNow;
  }
}
void main();
