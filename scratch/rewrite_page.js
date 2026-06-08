const fs = require('fs');
const path = require('path');

const pagePath = 'e:/GitHouse/goods/src/app/orders/page.tsx';
const content = fs.readFileSync(pagePath, 'utf8');

// 找到 "export default function OrdersPage()"
const targetIndex = content.indexOf('export default function OrdersPage()');
if (targetIndex === -1) {
  console.error('Could not find OrdersPage definition');
  process.exit(1);
}

// 截取前半部分（保留到 export default function OrdersPage() 之前）
const header = content.substring(0, targetIndex);

// 我们精简的 OrdersPage 函数体
const body = `export default function OrdersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const showGlobalErrorDOM = (msg: string) => {
      if (typeof document === "undefined" || !document.body) return;
      
      const oldEl = document.getElementById("native-global-error-popup");
      if (oldEl) oldEl.remove();

      const el = document.createElement("div");
      el.id = "native-global-error-popup";
      el.style.cssText = "position: fixed; top: 12px; left: 12px; right: 12px; z-index: 2147483647; background: #fff5f5; border: 2px solid #f87171; border-radius: 16px; padding: 16px; color: #991b1b; font-family: monospace; font-size: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); pointer-events: auto;";
      el.innerHTML = \`
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
          🚨 系统致命运行错误 (原生捕获)
        </h4>
        <p style="margin: 0 0 12px 0; word-break: break-all; line-height: 1.5; background: #fee2e2; padding: 8px; border-radius: 8px;">\${msg}</p>
        <button onclick="document.getElementById('native-global-error-popup').remove()" style="background: #991b1b; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer;">关闭提示</button>
      \`;
      document.body.appendChild(el);
    };

    const handleError = (event: ErrorEvent) => {
      const errMsg = \`JavaScript 错误: \${event.message} 在 \${event.filename}:\${event.lineno}\`;
      setPageError(errMsg);
      showGlobalErrorDOM(errMsg);
    };
    
    const handleRejection = (event: PromiseRejectionEvent) => {
      const errMsg = \`未捕获的 Promise 错误: \${event.reason}\`;
      setPageError(errMsg);
      showGlobalErrorDOM(errMsg);
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const modalRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedIntegrationRef = useRef(false);

  const [activeTab, setActiveTab] = useState<OrdersTab>("today");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [integrationConfig, setIntegrationConfig] = useState<AutoPickIntegrationConfig>({
    pluginBaseUrl: "",
    inboundApiKey: "",
    maiyatianCookie: "",
    maiyatianShopMappings: [],
    selfDeliveryTiming: createDefaultSelfDeliveryTiming(),
    defaultBrushCommission: 0,
  });
  const [maiyatianShops, setMaiyatianShops] = useState<AutoPickMaiyatianShop[]>([]);
  const [localShops, setLocalShops] = useState<LocalShopOption[]>([]);
  const [isIntegrationOpen, setIsIntegrationOpen] = useState(false);
  const [isBrushSyncPickerOpen, setIsBrushSyncPickerOpen] = useState(false);
  const [isTestingPlugin, setIsTestingPlugin] = useState(false);
  const [isTestingCookie, setIsTestingCookie] = useState(false);
  const [isFetchingMaiyatianShops, setIsFetchingMaiyatianShops] = useState(false);
  
  const [isCreateOfflineOpen, setIsCreateOfflineOpen] = useState(false);
  const [backfillTarget, setBackfillTarget] = useState<AutoPickOrder | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseOrder | null>(null);
  
  const [isMatchPickerOpen, setIsMatchPickerOpen] = useState(false);
  const [isSavingMatch, setIsSavingMatch] = useState(false);
  const [matchEditorTarget, setMatchEditorTarget] = useState<{
    orderId: string;
    itemId: string;
    itemName: string;
    shopName: string;
    shopId: string;
    currentMatchedProductId: string;
  } | null>(null);

  const [brushSyncPool, setBrushSyncPool] = useState<AutoPickOrder[]>([]);
  const [selectedBrushOrderIds, setSelectedBrushOrderIds] = useState<string[]>([]);
  const [isBulkBrushSyncing, setIsBulkBrushSyncing] = useState(false);

  const [savedIntegrationDigest, setSavedIntegrationDigest] = useState(() => serializeIntegrationConfig({
    pluginBaseUrl: "",
    inboundApiKey: "",
    maiyatianCookie: "",
    maiyatianShopMappings: [],
    selfDeliveryTiming: createDefaultSelfDeliveryTiming(),
    defaultBrushCommission: 0,
  }));
  const [savedMappingsDigest, setSavedMappingsDigest] = useState(() => serializeMaiyatianMappings({
    maiyatianShopMappings: [],
  }));

  const triggerParentRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!isIntegrationOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!modalRef.current?.contains(target)) {
        setIsIntegrationOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIntegrationOpen]);

  useEffect(() => {
    if (!isIntegrationOpen && !isBrushSyncPickerOpen) {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isBrushSyncPickerOpen, isIntegrationOpen]);

  const fetchIntegrationConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/orders/integration", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "加载对接配置失败");
      }

      const nextConfig = readIntegrationConfigResponse(data);
      setIntegrationConfig(nextConfig);
      setSavedIntegrationDigest(serializeIntegrationConfig({
        pluginBaseUrl: nextConfig.pluginBaseUrl,
        inboundApiKey: nextConfig.inboundApiKey,
        maiyatianCookie: nextConfig.maiyatianCookie,
        maiyatianShopMappings: nextConfig.maiyatianShopMappings,
        selfDeliveryTiming: nextConfig.selfDeliveryTiming,
        defaultBrushCommission: nextConfig.defaultBrushCommission,
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: nextConfig.maiyatianShopMappings,
      }));
      hasLoadedIntegrationRef.current = true;
    } catch (error) {
      console.error("Failed to fetch order integration config:", error);
      showToast(error instanceof Error ? error.message : "加载对接配置失败", "error");
    }
  }, [showToast]);

  const fetchLocalShops = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const response = await fetch("/api/orders/integration/local-shops", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取系统地址失败");
      }

      const nextLocalShops = Array.isArray(data?.shops)
        ? data.shops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        : [];

      setLocalShops(nextLocalShops);

      if (!options?.silent && nextLocalShops.length === 0) {
        showToast("还没有读取到系统发货地址，请先去个人资料里维护地址", "error");
      }
    } catch (error) {
      console.error("Failed to fetch local shops:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "读取系统地址失败", "error");
      }
    }
  }, [showToast]);

  useEffect(() => {
    void fetchLocalShops({ silent: true });
    void fetchIntegrationConfig();
  }, [fetchLocalShops, fetchIntegrationConfig]);

  const fetchMaiyatianShops = useCallback(async () => {
    const cookie = integrationConfig.maiyatianCookie.trim();
    if (!cookie) {
      showToast("请先填写麦芽田 Cookie", "error");
      return;
    }

    setIsFetchingMaiyatianShops(true);
    try {
      const response = await fetch("/api/orders/integration/maiyatian-shops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maiyatianCookie: cookie }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "读取麦芽田门店失败");
      }

      setMaiyatianShops(Array.isArray(data.shops) ? data.shops : []);
      if (Array.isArray(data.localShops)) {
        setLocalShops(
          data.localShops
            .map((item: Record<string, unknown>) => ({
              id: String(item?.id || ""),
              name: String(item?.name || "").trim(),
              address: String(item?.address || "").trim(),
              isDefault: Boolean(item?.isDefault),
            }))
            .filter((item: LocalShopOption) => item.id && item.name)
        );
      }
      showToast(\`已读取 \${Array.isArray(data.shops) ? data.shops.length : 0} 家麦芽田门店\`, "success");
    } catch (error) {
      console.error("Failed to fetch Maiyatian shops:", error);
      showToast(error instanceof Error ? error.message : "读取麦芽田门店失败", "error");
    } finally {
      setIsFetchingMaiyatianShops(false);
    }
  }, [integrationConfig.maiyatianCookie, showToast]);

  useEffect(() => {
    if (!integrationConfig.maiyatianCookie.trim()) {
      setMaiyatianShops([]);
    }
  }, [integrationConfig.maiyatianCookie]);

  const saveIntegrationConfig = useCallback(async (
    nextConfig?: AutoPickIntegrationConfig,
    options?: { silent?: boolean }
  ) => {
    try {
      const payload = nextConfig && typeof nextConfig === "object" && !("nativeEvent" in (nextConfig as object))
        ? nextConfig
        : integrationConfig;
      const shouldRefreshOrders = serializeMaiyatianMappings(payload) !== savedMappingsDigest;
      const response = await fetch("/api/orders/integration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "保存对接配置失败");
      }
      const savedConfig = readIntegrationConfigResponse(data);
      setIntegrationConfig(savedConfig);
      setSavedIntegrationDigest(serializeIntegrationConfig({
        pluginBaseUrl: savedConfig.pluginBaseUrl,
        inboundApiKey: savedConfig.inboundApiKey,
        maiyatianCookie: savedConfig.maiyatianCookie,
        maiyatianShopMappings: savedConfig.maiyatianShopMappings,
        selfDeliveryTiming: savedConfig.selfDeliveryTiming,
        defaultBrushCommission: savedConfig.defaultBrushCommission
      }));
      setSavedMappingsDigest(serializeMaiyatianMappings({
        maiyatianShopMappings: savedConfig.maiyatianShopMappings,
      }));
      if (!options?.silent) {
        showToast("自动推单对接配置已保存", "success");
      }
      if (shouldRefreshOrders) {
        triggerParentRefresh();
      }
    } catch (error) {
      console.error("Failed to save order integration config:", error);
      if (!options?.silent) {
        showToast(error instanceof Error ? error.message : "保存对接配置失败", "error");
      }
    }
  }, [integrationConfig, savedMappingsDigest, showToast, triggerParentRefresh]);

  const testIntegrationConfig = async (target: "plugin" | "cookie") => {
    if (target === "plugin") {
      setIsTestingPlugin(true);
    } else {
      setIsTestingCookie(true);
    }
    try {
      const response = await fetch("/api/orders/integration/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...integrationConfig, target }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || \`\${target === "plugin" ? "脚本" : "Cookie"} 测试失败\`);
      }

      showToast(data.ok ? \`\${target === "plugin" ? "脚本" : "Cookie"} 测试通过\` : \`\${target === "plugin" ? "脚本" : "Cookie"} 测试未通过\`, data.ok ? "success" : "error");
    } catch (error) {
      console.error("Failed to test order integration config:", error);
      showToast(error instanceof Error ? error.message : \`\${target === "plugin" ? "脚本" : "Cookie"} 测试失败\`, "error");
    } finally {
      if (target === "plugin") {
        setIsTestingPlugin(false);
      } else {
        setIsTestingCookie(false);
      }
    }
  };

  useEffect(() => {
    if (!hasLoadedIntegrationRef.current) return;
    if (!isIntegrationOpen) return;

    const currentDigest = serializeIntegrationConfig(integrationConfig);
    if (currentDigest === savedIntegrationDigest) return;

    const timer = window.setTimeout(() => {
      void saveIntegrationConfig(integrationConfig, { silent: true });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [integrationConfig, isIntegrationOpen, saveIntegrationConfig, savedIntegrationDigest]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (localShops.length > 0) return;
    void fetchLocalShops();
  }, [fetchLocalShops, isIntegrationOpen, localShops.length]);

  useEffect(() => {
    if (!isIntegrationOpen) return;
    if (!integrationConfig.maiyatianCookie.trim()) return;
    if (maiyatianShops.length > 0) return;
    void fetchMaiyatianShops();
  }, [fetchMaiyatianShops, integrationConfig.maiyatianCookie, isIntegrationOpen, maiyatianShops.length]);

  // 商品匹配逻辑
  const openMatchEditor = useCallback((order: AutoPickOrder, item: AutoPickOrderItem) => {
    const resolvedShopName = order.matchedShopName || "";
    const resolvedShopId = localShops.find((s) => s.name === resolvedShopName)?.id || "";
    setMatchEditorTarget({
      orderId: order.id,
      itemId: String(item.id || "").trim(),
      itemName: item.productName || "未命名商品",
      shopName: resolvedShopName,
      shopId: resolvedShopId,
      currentMatchedProductId: item.matchedProduct?.id || "",
    });
    setIsMatchPickerOpen(true);
  }, [localShops]);

  const closeMatchEditor = useCallback(() => {
    if (isSavingMatch) return;
    setIsMatchPickerOpen(false);
    setMatchEditorTarget(null);
  }, [isSavingMatch]);

  const saveManualMatch = useCallback(async (productId: string) => {
    if (!matchEditorTarget?.orderId || !matchEditorTarget.itemId) return;

    setIsSavingMatch(true);
    try {
      const response = await fetch(\`/api/orders/\${matchEditorTarget.orderId}/items/\${matchEditorTarget.itemId}/match\`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "更新商品匹配失败");
      }

      showToast("商品匹配已更新", "success");
      setIsMatchPickerOpen(false);
      setMatchEditorTarget(null);
      triggerParentRefresh();
    } catch (error) {
      console.error("Failed to save manual product match:", error);
      showToast(error instanceof Error ? error.message : "更新商品匹配失败", "error");
    } finally {
      setIsSavingMatch(false);
    }
  }, [matchEditorTarget, showToast, triggerParentRefresh]);

  // 刷单同步确认
  const syncBrushOrders = async (targetIds?: string[], commission?: number) => {
    const scopedIds = Array.isArray(targetIds) ? targetIds.filter(Boolean) : [];
    if (scopedIds.length === 0) {
      showToast("请先选择要同步刷单的订单", "error");
      return;
    }

    const sourceOrders = brushSyncPool.filter((item) => scopedIds.includes(item.id));
    const targetOrders = sourceOrders
      .map((item) => ({
        id: item.id,
        matchedShopName: item.matchedShopName || null,
      }))
      .filter((item) => item.id);
    if (targetOrders.length === 0) {
      showToast("当前筛选范围没有可同步刷单的已完成配送单", "error");
      return;
    }

    setIsBulkBrushSyncing(true);
    try {
      const response = await fetch("/api/orders/sync-brush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: targetOrders, commission: commission ?? 0 }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "批量同步刷单失败");
      }

      const syncedCount = Number(data?.synced || 0);
      const updatedCount = Number(data?.updated || 0);
      const skippedCount = Number(data?.skipped || 0);
      const skippedOrders = Array.isArray(data?.skippedOrders) ? data.skippedOrders : [];
      const skippedReasonCounts = new Map<string, number>();
      for (const item of skippedOrders) {
        const reason = item && typeof item === "object"
          ? getBrushSyncSkippedReasonText((item as { reason?: unknown }).reason)
          : "";
        if (!reason) continue;
        skippedReasonCounts.set(reason, (skippedReasonCounts.get(reason) || 0) + 1);
      }
      const skippedReasonSummary = Array.from(skippedReasonCounts.entries())
        .slice(0, 2)
        .map(([reason, count]) => \`\${reason} \${count} 单\`)
        .join("，");

      showToast(
        skippedCount > 0
          ? \`已同步 \${syncedCount} 单，已更新 \${updatedCount} 单，不符合条件 \${skippedCount} 单\${skippedReasonSummary ? \`（\${skippedReasonSummary}）\` : ""}\`
          : \`已同步 \${syncedCount} 单，已更新 \${updatedCount} 单\`,
        "success"
      );
      setSelectedBrushOrderIds([]);
      setIsBrushSyncPickerOpen(false);
      triggerParentRefresh();
    } catch (error) {
      console.error("Failed to sync brush orders:", error);
      showToast(error instanceof Error ? error.message : "批量同步刷单失败", "error");
    } finally {
      setIsBulkBrushSyncing(false);
    }
  };

  const handleOpenBrushSync = (pool: AutoPickOrder[]) => {
    setBrushSyncPool(pool);
    setSelectedBrushOrderIds([]);
    setIsBrushSyncPickerOpen(true);
  };

  const toggleBrushSyncSelection = useCallback((orderId: string) => {
    setSelectedBrushOrderIds((current) => (
      current.includes(orderId)
        ? current.filter((id) => id !== orderId)
        : [...current, orderId]
    ));
  }, []);

  const savePurchaseDraft = useCallback(async (data: PurchaseOrder) => {
    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        status: "Received",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "创建采购单失败");
    }
    showToast("采购单已创建并入库", "success");
    setPurchaseDraft(null);
    triggerParentRefresh();
  }, [showToast, triggerParentRefresh]);

  const todayDate = formatLocalDate(new Date());

  return (
    <div className="relative px-2 sm:px-1">
      {pageError && (
        <div className="fixed top-4 left-4 right-4 z-999999 rounded-2xl border border-rose-500 bg-rose-50 p-4 text-xs text-rose-700 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:bg-rose-950/90 dark:text-rose-200 flex items-start gap-3">
          <span className="text-base shrink-0">🚨</span>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold">页面运行出错</h4>
            <p className="mt-1 font-mono break-all leading-relaxed">{pageError}</p>
            <button onClick={() => setPageError(null)} className="mt-2 text-[10px] font-bold text-rose-900 underline hover:no-underline dark:text-rose-100">关闭提示</button>
          </div>
        </div>
      )}

      {/* Tab 物理切换，彻底隔离组件状态 */}
      <div className="space-y-6">
        <div className="inline-flex rounded-xl border border-black/8 bg-black/3 p-1 dark:border-white/10 dark:bg-white/4">
          <button
            type="button"
            onClick={() => setActiveTab("today")}
            className={cn(
              "rounded-lg px-5 py-2.5 text-sm font-black transition-all sm:min-w-35",
              activeTab === "today"
                ? "bg-foreground text-background dark:bg-white dark:text-black"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            今日推单
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "rounded-lg px-5 py-2.5 text-sm font-black transition-all sm:min-w-35",
              activeTab === "all"
                ? "bg-foreground text-background dark:bg-white dark:text-black"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            全部订单
          </button>
        </div>

        {activeTab === "today" ? (
          <TodayOrdersView
            refreshTrigger={refreshTrigger}
            onTriggerParentRefresh={triggerParentRefresh}
            onOpenCreateOffline={() => setIsCreateOfflineOpen(true)}
            onOpenIntegration={() => setIsIntegrationOpen(true)}
            onOpenBrushSync={handleOpenBrushSync}
            onOpenCostBackfill={setBackfillTarget}
            onOpenMatchEditor={openMatchEditor}
            localShops={localShops}
          />
        ) : (
          <AllOrdersView
            refreshTrigger={refreshTrigger}
            onTriggerParentRefresh={triggerParentRefresh}
            onOpenCreateOffline={() => setIsCreateOfflineOpen(true)}
            onOpenIntegration={() => setIsIntegrationOpen(true)}
            onOpenBrushSync={handleOpenBrushSync}
            onOpenCostBackfill={setBackfillTarget}
            onOpenMatchEditor={openMatchEditor}
            localShops={localShops}
          />
        )}
      </div>

      {isIntegrationOpen
        ? createPortal(
              <IntegrationModal
                integrationConfig={integrationConfig}
                maiyatianShops={maiyatianShops}
                localShops={localShops}
                isFetchingMaiyatianShops={isFetchingMaiyatianShops}
                isTestingPlugin={isTestingPlugin}
                isTestingCookie={isTestingCookie}
                modalRef={modalRef}
                onClose={() => setIsIntegrationOpen(false)}
                onChange={setIntegrationConfig}
                onFetchMaiyatianShops={fetchMaiyatianShops}
                onTestPlugin={() => void testIntegrationConfig("plugin")}
                onTestCookie={() => void testIntegrationConfig("cookie")}
              />,
            document.body
          )
        : null}

      {isCreateOfflineOpen ? (
        <CreateOfflineOrderModal
          shopOptions={localShops}
          onClose={() => setIsCreateOfflineOpen(false)}
          onSuccess={() => triggerParentRefresh()}
        />
      ) : null}

      {purchaseDraft ? (
        <PurchaseOrderModal
          isOpen={Boolean(purchaseDraft)}
          initialData={purchaseDraft}
          onClose={() => setPurchaseDraft(null)}
          onSubmit={(data) => {
            void savePurchaseDraft(data).catch((error) => {
              console.error("Failed to create purchase draft:", error);
              showToast(error instanceof Error ? error.message : "创建采购单失败", "error");
            });
          }}
        />
      ) : null}

      {isBrushSyncPickerOpen
        ? createPortal(
            <BrushSyncPickerModal
              orders={brushSyncPool}
              selectedIds={selectedBrushOrderIds}
              isSubmitting={isBulkBrushSyncing}
              modalRef={modalRef}
              onClose={() => setIsBrushSyncPickerOpen(false)}
              onToggle={toggleBrushSyncSelection}
              onSetSelected={setSelectedBrushOrderIds}
              integrationConfig={integrationConfig}
              scope={activeTab}
              todayDate={todayDate}
              onConfirm={(commission) => void syncBrushOrders(selectedBrushOrderIds, commission)}
            />,
            document.body
          )
        : null}

      <ProductSelectionModal
        isOpen={isMatchPickerOpen}
        onClose={closeMatchEditor}
        onSelect={(products) => {
          const selectedProduct = products[0];
          const resolvedProductId = String(
            selectedProduct?.sourceProductId
            || selectedProduct?.productId
            || selectedProduct?.id
            || ""
          ).trim();
          if (!resolvedProductId) return;
          void saveManualMatch(resolvedProductId);
        }}
        selectedIds={matchEditorTarget?.currentMatchedProductId ? [matchEditorTarget.currentMatchedProductId] : []}
        singleSelect
        loadAllOnOpen
        showPlatformSelector={false}
        showCategoryFilter
        showPrice={false}
        title="修改商品匹配"
        fetchPath="/api/shop-products"
        query={{
          all: "true",
          ...(matchEditorTarget?.shopId ? { shopId: matchEditorTarget.shopId } : {}),
          ...(matchEditorTarget?.shopName ? { shopName: matchEditorTarget.shopName } : {}),
        }}
        emptyStateText={matchEditorTarget?.shopName ? \`当前店铺“\${matchEditorTarget.shopName}”下没有找到候选商品\` : "未找到相关商品"}
      />

      {backfillTarget && (
        <CostBackfillModal
          order={backfillTarget}
          onClose={() => setBackfillTarget(null)}
          onSuccess={() => {
            setBackfillTarget(null);
            showToast("成本回填成功！净利润已重新计算", "success");
            triggerParentRefresh();
          }}
        />
      )}
    </div>
  );
}
`;

const result = header + body;
fs.writeFileSync(pagePath, result, 'utf8');
console.log('Successfully rewrote page.tsx!');
