"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Loader2, MapPin, FileText, Store, ShoppingBag } from "lucide-react";
import { ProductSelectionModal } from "@/components/Purchases/ProductSelectionModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useMemo } from "react";
import { formatLocalDate } from "@/lib/dateUtils";

interface SelectedItem {
  id: string; // 主商品 ID (Product cuid)
  shopProductId: string | null; // 店铺商品 ID (ShopProduct cuid)
  productName: string;
  productNo: string | null;
  thumb: string | null;
  quantity: number;
  sourceType: "product" | "shopProduct";
}

interface CreateOfflineOrderModalProps {
  shopOptions: Array<{ id: string; name: string; address?: string | null }>;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateOfflineOrderModal({ shopOptions, onClose, onSuccess }: CreateOfflineOrderModalProps) {
  const { showToast } = useToast();
  const [shopId, setShopId] = useState("");
  const [orderDate, setOrderDate] = useState(() => formatLocalDate(new Date()));
  const [orderNo, setOrderNo] = useState("");
  const [actualPaid, setActualPaid] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [userAddress, setUserAddress] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);

  const formattedShopOptions = useMemo(() => {
    return shopOptions.map((shop) => ({
      value: shop.id,
      label: shop.name,
    }));
  }, [shopOptions]);

  useEffect(() => {
    if (shopOptions && shopOptions.length > 0) {
      setShopId(shopOptions[0].id);
    }
  }, [shopOptions]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (isProductPickerOpen) return;
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose, isProductPickerOpen]);

  const handleSelectProducts = (selectedProducts: any[]) => {
    if (!selectedProducts || selectedProducts.length === 0) return;

    setItems((prevItems) => {
      const nextItems = [...prevItems];
      selectedProducts.forEach((prod) => {
        const resolvedProductId = String(prod.productId || prod.sourceProductId || prod.id || "").trim();
        const resolvedShopProductId = prod.sourceType === "shopProduct" ? prod.id : (prod.shopProductId || null);
        
        if (!resolvedProductId) return;

        const existingIndex = nextItems.findIndex((item) => item.id === resolvedProductId);
        if (existingIndex > -1) {
          nextItems[existingIndex].quantity += 1;
        } else {
          nextItems.push({
            id: resolvedProductId,
            shopProductId: resolvedShopProductId,
            productName: prod.productName || prod.name || "未命名商品",
            productNo: prod.sku || prod.productNo || null,
            thumb: prod.productImage || prod.image || prod.thumb || null,
            quantity: 1,
            sourceType: prod.sourceType === "shopProduct" ? "shopProduct" : "product",
          });
        }
      });
      return nextItems;
    });

    setIsProductPickerOpen(false);
    showToast(`成功添加 ${selectedProducts.length} 个商品`, "success");
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    setItems((prevItems) =>
      prevItems
        .map((item) => {
          if (item.id === productId) {
            const nextQty = item.quantity + delta;
            return { ...item, quantity: Math.max(1, nextQty) };
          }
          return item;
        })
    );
  };

  const handleQuantityInputChange = (productId: string, val: string) => {
    const parsed = parseInt(val, 10);
    const validQty = isNaN(parsed) || parsed <= 0 ? 1 : parsed;
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === productId) {
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.id !== productId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shopId) {
      showToast("请选择归属店铺", "error");
      return;
    }
    if (!actualPaid || isNaN(Number(actualPaid)) || Number(actualPaid) < 0) {
      showToast("请输入有效的顾客实付金额", "error");
      return;
    }
    if (isNaN(Number(deliveryFee)) || Number(deliveryFee) < 0) {
      showToast("配送费不能为负数", "error");
      return;
    }
    if (items.length === 0) {
      showToast("请至少添加一个商品明细", "error");
      return;
    }

    setIsSubmitting(true);

    try {
      const now = new Date();
      const timeString = now.toTimeString().split(" ")[0]; // 获取当前本地时分秒 "HH:mm:ss"
      const localDateTimeStr = `${orderDate}T${timeString}`;
      const resolvedOrderTime = new Date(localDateTimeStr).toISOString();

      const response = await fetch("/api/orders/import-offline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          orderTime: resolvedOrderTime,
          orderNo: orderNo.trim() || undefined,
          actualPaid: Number(actualPaid),
          deliveryFee: Number(deliveryFee),
          userAddress: userAddress.trim() || undefined,
          note: note.trim() || undefined,
          autoOutbound: true,
          items: items.map((item) => ({
            productId: item.id,
            shopProductId: item.shopProductId,
            productName: item.productName,
            productNo: item.productNo,
            thumb: item.thumb,
            quantity: item.quantity,
            sourceType: item.sourceType,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "录入线下订单失败");
      }

      if (data.outbound) {
        if (data.outbound.success) {
          showToast(`线下订单 ${data.orderNo} 录入成功，已一键出库扣减库存！`, "success");
        } else {
          const reasonMsg = data.outbound.reason === "no-items" 
            ? "商品匹配未成功" 
            : (data.outbound.error || "库存批次同步异常");
          showToast(`订单 ${data.orderNo} 录入成功，但自动出库扣库失败（原因：${reasonMsg}），请手动处理出库。`, "warning");
        }
      } else {
        showToast(`线下订单 ${data.orderNo} 录入成功！`, "success");
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to submit offline order:", error);
      showToast(error instanceof Error ? error.message : "内部服务器错误，录入订单失败", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedShopName = shopOptions.find((o) => o.id === shopId)?.name || "";

  // 统一样式的输入框容器 class
  const inputContainerClass = "flex h-11 w-full items-center gap-3 rounded-xl border border-black/8 bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3 focus-within:border-primary/50 dark:focus-within:border-primary/50 transition-all";
  const inputElClass = "w-full bg-transparent text-sm text-foreground outline-none border-0 focus:ring-0 p-0 placeholder-muted-foreground/50";
  const labelTextClass = "text-xs font-black text-muted-foreground/90 dark:text-white/70 flex items-center gap-1.5 select-none";

  return createPortal(
    <div className="fixed inset-0 z-100000 flex items-center justify-center p-4">
      {/* 遮罩背景：完全一致的背景色与磨砂度 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/42 backdrop-blur-sm"
      />

      {/* Modal 容器卡片：高贵深蓝底色 `#0b111e`/98 彻底融于系统背景 */}
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className="relative z-10 flex h-full max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-black/8 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-[#0b111e]/98 sm:rounded-4xl"
      >
        {/* 顶部标题栏：高质极简感 */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/8 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
              <ShoppingBag size={19} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-foreground">手动录入线下订单</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">快速记录线下交易，自动完成商品核销与扣库</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/8 bg-white/80 text-muted-foreground transition-all hover:text-foreground dark:border-white/10 dark:bg-white/4"
          >
            <X size={16} />
          </button>
        </div>

        {/* 滚动表单区域 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto no-scrollbar px-6 py-5">
          <div className="space-y-6">
            
            {/* 区域1：基本交易信息 */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/75 flex items-center gap-1.5 select-none">
                <Store size={12} />
                基本交易信息
              </h3>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {/* 归属店铺 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>归属店铺</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={shopId}
                    onChange={(val) => {
                      setShopId(val);
                      if (items.length > 0) {
                        setItems([]);
                        showToast("已切换归属店铺，为了保证出库库存精确，已清空商品列表", "warning");
                      }
                    }}
                    options={formattedShopOptions}
                    placeholder="请选择归属店铺"
                    className="w-full h-11"
                    triggerClassName="h-full w-full rounded-xl border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/3 hover:bg-black/[0.01] dark:hover:bg-white/5 transition-all focus-within:ring-2 focus-within:ring-primary/10"
                  />
                </div>

                {/* 下单时间 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>下单时间</span>
                  </label>
                  <DatePicker
                    value={orderDate}
                    onChange={setOrderDate}
                    placeholder="选择下单日期"
                    className="h-11 w-full"
                    showClear={false}
                    triggerClassName="h-full w-full rounded-xl border border-black/8 bg-white px-3 text-sm shadow-none dark:border-white/10 dark:bg-white/3 hover:bg-black/[0.01] dark:hover:bg-white/5 transition-all focus-within:ring-2 focus-within:ring-primary/10"
                  />
                </div>

                {/* 线下订单号 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>订单号</span>
                  </label>
                  <div className={inputContainerClass}>
                    <FileText size={14} className="text-muted-foreground/60 shrink-0" />
                    <input
                      type="text"
                      value={orderNo}
                      onChange={(e) => setOrderNo(e.target.value)}
                      placeholder="留空自动生成 OFFLINE- 唯一单号"
                      className={inputElClass}
                    />
                  </div>
                </div>

                {/* 收货地址 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>收货地址</span>
                  </label>
                  <div className={inputContainerClass}>
                    <MapPin size={14} className="text-muted-foreground/60 shrink-0" />
                    <input
                      type="text"
                      value={userAddress}
                      onChange={(e) => setUserAddress(e.target.value)}
                      placeholder="线下顾客自提 / 送货上门地址"
                      className={inputElClass}
                    />
                  </div>
                </div>
              </div>

              {/* 两栏并排金额 */}
              <div className="grid gap-4 grid-cols-2">
                {/* 顾客实付 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>顾客实付 (元)</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <div className={inputContainerClass}>
                    <span className="text-muted-foreground/60 font-black text-sm select-none shrink-0 w-3.5 text-center">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={actualPaid}
                      onChange={(e) => setActualPaid(e.target.value)}
                      placeholder="商品总金额 (不含配送费)"
                      className={inputElClass}
                    />
                  </div>
                </div>

                {/* 配送费 */}
                <div className="space-y-1.5">
                  <label className={labelTextClass}>
                    <span>配送费 (元)</span>
                  </label>
                  <div className={inputContainerClass}>
                    <span className="text-muted-foreground/60 font-black text-sm select-none shrink-0 w-3.5 text-center">¥</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      placeholder="0.00"
                      className={inputElClass}
                    />
                  </div>
                </div>
              </div>

              {/* 订单备注 */}
              <div className="space-y-1.5">
                <label className={labelTextClass}>
                  <span>订单备注</span>
                </label>
                <div className="flex w-full items-start gap-3 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-primary/10 dark:border-white/10 dark:bg-white/3 focus-within:border-primary/50 dark:focus-within:border-primary/50 transition-all">
                  <FileText size={14} className="text-muted-foreground/60 mt-0.5 shrink-0" />
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="选填，线下买单明细/联系方式等备注信息"
                    className="w-full bg-transparent text-sm text-foreground outline-none border-0 focus:ring-0 p-0 placeholder-muted-foreground/50 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* 区域2：商品明细 */}
            <div className="space-y-4 border-t border-black/8 pt-5 dark:border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/75 flex items-center gap-1.5 select-none">
                  <ShoppingBag size={12} />
                  已购商品明细
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (!shopId) {
                      showToast("请先选择归属店铺，以便筛选店内商品", "error");
                      return;
                    }
                    setIsProductPickerOpen(true);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground shadow-sm shadow-primary/15 transition-all hover:opacity-90 active:scale-95 duration-100"
                >
                  <Plus size={13} />
                  选择商品
                </button>
              </div>

              {/* 商品明细列表 */}
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-black/8 py-10 text-center dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.01]">
                  <div className="rounded-xl bg-black/3 p-3 text-muted-foreground/40 dark:bg-white/4">
                    <ShoppingBag size={26} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-muted-foreground">暂无选择的商品</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">请点击右上方“选择商品”添加线下交易商品明细</p>
                </div>
              ) : (
                <div className="rounded-[20px] border border-black/8 bg-black/[0.01] p-1.5 dark:border-white/10 dark:bg-white/[0.01]">
                  <div className="max-h-[220px] overflow-y-auto space-y-1.5 p-1 no-scrollbar">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white p-2 shadow-xs dark:border-white/5 dark:bg-white/4"
                      >
                        {/* 商品缩略图与描述 */}
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          {item.thumb ? (
                            <img
                              src={item.thumb}
                              alt={item.productName}
                              className="h-10 w-10 shrink-0 rounded-lg object-cover border border-black/5 dark:border-white/5"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/5 text-muted-foreground/60 dark:bg-white/5">
                              <ShoppingBag size={15} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black text-foreground">{item.productName}</p>
                            <p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground/60">
                              {item.productNo ? `SKU: ${item.productNo}` : "无条码/SKU"}
                            </p>
                          </div>
                        </div>

                        {/* 商品数量器 */}
                        <div className="flex shrink-0 items-center gap-1 bg-black/3 dark:bg-white/5 p-0.5 rounded-lg border border-black/5 dark:border-white/5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md font-bold text-foreground transition-all hover:bg-black/5 active:scale-90 dark:hover:bg-white/5"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                            className="w-9 border-0 bg-transparent text-center text-xs font-black focus:outline-none focus:ring-0 p-0 select-all"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md font-bold text-foreground transition-all hover:bg-black/5 active:scale-90 dark:hover:bg-white/5"
                          >
                            +
                          </button>
                        </div>

                        {/* 移除 */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-red-500/80 hover:bg-red-500/10 active:scale-90 transition-all duration-100"
                          title="移除商品"
                        >
                          <Trash2 size={13.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </form>

        {/* 底部按钮栏：带高质骨架感的确认按钮 */}
        <div className="flex shrink-0 flex-col gap-3.5 border-t border-black/8 px-6 py-5 dark:border-white/10">
          <div className="flex items-center justify-between text-xs select-none">
            <span className="text-muted-foreground/60">
              提示：系统将自动一键核销并扣减该店铺商品的物理库存
            </span>
            {items.length > 0 && (
              <span className="font-mono text-muted-foreground">
                共 <span className="font-black text-foreground">{items.reduce((sum, item) => sum + item.quantity, 0)}</span> 件商品
              </span>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl border border-black/8 bg-white/80 text-sm font-black text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:bg-white hover:border-black/12 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-white/92 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-white/18 dark:hover:bg-white/[0.09]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || items.length === 0 || !actualPaid}
              className={cn(
                "flex-[2] inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition-all active:scale-95 duration-100",
                items.length === 0 || !actualPaid
                  ? "bg-foreground/5 text-muted-foreground/40 cursor-not-allowed dark:bg-white/5 dark:text-white/20"
                  : "bg-foreground text-background shadow-md shadow-black/5 hover:opacity-90 dark:bg-white dark:text-black dark:shadow-white/5"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  正在核销并扣减库存...
                </>
              ) : (
                "确认录入"
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* 内置商品选择弹出层 */}
      {isProductPickerOpen && (
        <ProductSelectionModal
          isOpen={isProductPickerOpen}
          onClose={() => setIsProductPickerOpen(false)}
          onSelect={handleSelectProducts}
          selectedIds={items.map((item) => item.id)}
          singleSelect={false}
          loadAllOnOpen
          showPlatformSelector={false}
          showCategoryFilter
          showPrice={false}
          title={`添加“${selectedShopName}”的交易商品`}
          fetchPath="/api/shop-products"
          query={{
            all: "true",
            shopId: shopId,
          }}
          emptyStateText={`当前店铺“${selectedShopName}”下没有候选商品，请先去店铺商品模块进行门店铺货。`}
        />
      )}
    </div>,
    document.body
  );
}
