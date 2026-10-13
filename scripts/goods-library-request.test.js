const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual page request callback with delayed responses. No server,
// database or live account is needed to reproduce the refresh/cutover race.
const source = fs.readFileSync("src/app/goods/page.tsx", "utf8");
const startMarker = "const fetchGoods = useCallback(";
const start = source.indexOf(startMarker) + startMarker.length;
const end = source.indexOf("}, [debouncedSearch", start) + 1;
assert(start > startMarker.length && end > start);
const callback = ts.transpileModule(`const handler = ${source.slice(start, end)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

async function main() {
  const pending = [];
  const state = { items: [], total: 0, loading: false, nextLoading: false, page: 1, hasMore: true };
  const setter = key => value => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  const context = {
    URLSearchParams, AbortController, console,
    librariesLoaded: false, activeLibraryId: "", debouncedSearch: "",
    selectedCategory: "all", selectedStatus: "all", selectedSupplier: "all", sortBy: "sku-desc",
    currentPageRef: { current: 1 }, isFetchingRef: { current: false },
    requestVersionRef: { current: 0 }, goodsRequestControllerRef: { current: null },
    setItems: setter("items"), setTotalResults: setter("total"), setPage: setter("page"),
    setHasMore: setter("hasMore"), setIsLoading: setter("loading"), setIsNextPageLoading: setter("nextLoading"),
    fetch(url, options) {
      return new Promise(resolve => pending.push({ url, signal: options.signal,
        respond(data) { resolve({ ok: true, json: async () => data }); } }));
    },
  };
  vm.createContext(context);
  vm.runInContext(callback + "globalThis.fetchGoodsForTest = handler;", context);
  const fetchGoods = context.fetchGoodsForTest;
  await fetchGoods();
  assert.equal(pending.length, 0, "refresh must wait for library initialization");
  context.librariesLoaded = true;
  await fetchGoods();
  assert.equal(pending.length, 0, "an empty library selection must never request all goods");

  context.activeLibraryId = "A";
  const first = fetchGoods();
  assert.equal(new URL(pending[0].url, "http://test").searchParams.get("libraryId"), "A");
  context.activeLibraryId = "B";
  const second = fetchGoods();
  assert.equal(pending.length, 2, "the new library must not be skipped by the busy guard");
  assert.equal(pending[0].signal.aborted, true);
  pending[0].respond({ items: [{ id: "A-product" }], total: 1889, hasMore: true });
  await first;
  assert.equal(state.total, 0, "a stale response cannot overwrite the total");
  assert.equal(context.isFetchingRef.current, true, "the old finally cannot unlock the new request");
  assert.equal(state.loading, true);
  pending[1].respond({ items: [{ id: "B-product" }], total: 1448, hasMore: true });
  await second;
  assert.equal(state.total, 1448);
  assert.equal(state.items[0].id, "B-product");
  assert.equal(context.isFetchingRef.current, false);

  const next = fetchGoods(false);
  await fetchGoods(false);
  assert.equal(pending.length, 3, "duplicate pagination must still be blocked");
  context.activeLibraryId = "A";
  const switchBack = fetchGoods();
  pending[3].respond({ items: [{ id: "A-current" }], total: 441, hasMore: false });
  await switchBack;
  pending[2].respond({ items: [{ id: "B-stale-page" }], total: 1448, hasMore: true });
  await next;
  assert.equal(state.total, 441);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].id, "A-current");
  assert.equal(state.hasMore, false);
  assert.equal(context.currentPageRef.current, 1);
  console.log("PASS: library initialization, request replacement, stale results/finally, and pagination isolation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
