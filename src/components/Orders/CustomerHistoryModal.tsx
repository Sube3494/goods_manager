"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History,
  Phone,
  Search,
  ShoppingBag,
  Clock,
  MapPin,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/dateUtils";

interface OrderItem {
  id: string;
  productName: string;
  productNo?: string | null;
  spec?: string;
  quantity: number;
  price: string | null;
  imageUrl: string | null;
}

interface HistoryOrder {
  id: string;
  orderNo: string;
  platform: string;
  orderTime: string;
  status: string | null;
  statusDisplay: string;
  actualPaid: number;
  actualPaidYuan: string;
  expectedIncome: number | null;
  userAddress: string;
  customerRemark?: string | null;
  customerName?: string | null;
  maskedPhone?: string | null;
  isCurrentOrder: boolean;
  items: OrderItem[];
}

interface CustomerHistoryData {
  phoneTail: string;
  representativeMaskedPhone: string;
  totalCount: number;
  totalActualPaidYuan: string;
  orders: HistoryOrder[];
}

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneTail: string;
  currentOrderNo?: string;
  shopId?: string;
  maskedPhone?: string | null;
}

export function CustomerHistoryModal({
  isOpen,
  onClose,
  phoneTail: initialPhoneTail,
  currentOrderNo,
  shopId,
  maskedPhone: initialMaskedPhone,
}: CustomerHistoryModalProps) {
  const [phoneTail, setPhoneTail] = useState(initialPhoneTail);
  const [inputTail, setInputTail] = useState(initialPhoneTail);
  const [data, setData] = useState<CustomerHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPhoneTail(initialPhoneTail);
      setInputTail(initialPhoneTail);
    }
  }, [isOpen, initialPhoneTail]);

  const fetchHistory = useCallback(async (tail: string) => {
    if (!tail || tail.length < 4) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        phoneTail: tail,
        ...(currentOrderNo ? { currentOrderNo } : {}),
        ...(shopId ? { shopId } : {}),
      });
      const res = await fetch(`/api/orders/customer-history?${query.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "获取历史订单失败");
      }
      setData(json);
    } catch (e: any) {
      setError(e.message || "请求失败");
    } finally {
      setLoading(false);
    }
  }, [currentOrderNo, shopId]);

  useEffect(() => {
    if (isOpen && phoneTail) {
      fetchHistory(phoneTail);
    }
  }, [isOpen, phoneTail, fetchHistory]);

  // 快捷键 ESC 关闭与背景锁定
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputTail.trim();
    if (/^\d{4}$/.test(clean)) {
      setPhoneTail(clean);
    } else {
      setError("请输入4位纯数字手机尾号");
    }
  };

  if (typeof window === "undefined" || !isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-110000 flex items-center justify-center p-3 sm:p-5">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-all"
        />

        {/* 弹窗主体容器 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative z-110001 flex flex-col w-full max-w-2xl max-h-[88vh] rounded-[28px] border border-border/70 dark:border-white/10 bg-background/98 dark:bg-[#141822]/95 backdrop-blur-2xl shadow-2xl overflow-hidden text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <History size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">
                    老客历史订单档案
                  </h3>
                  <span className="inline-flex h-[15px] items-center justify-center rounded-full border border-slate-400/20 bg-slate-500/8 px-1 text-[9.5px] font-medium leading-none text-slate-500 dark:text-slate-300">
                    老客
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Phone size={11} className="shrink-0" />
                    <span>真实尾号: <strong className="font-mono text-foreground">{phoneTail}</strong></span>
                  </span>
                  {(data?.representativeMaskedPhone || initialMaskedPhone) && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{data?.representativeMaskedPhone || initialMaskedPhone}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* 尾号快捷搜索框 */}
              <form onSubmit={handleSearch} className="hidden sm:flex items-center gap-1.5">
                <input
                  type="text"
                  maxLength={4}
                  value={inputTail}
                  onChange={(e) => setInputTail(e.target.value.replace(/\D/g, ""))}
                  placeholder="尾号4位"
                  className="h-8 w-24 rounded-xl border border-border/70 bg-background/80 px-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  title="按尾号搜索"
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-border/70 bg-background/80 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Search size={13} />
                </button>
              </form>

              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-2 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-all active:scale-90"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 统计概览条 */}
          {data && !loading && (
            <div className="grid grid-cols-2 gap-2 border-b border-border/40 bg-muted/20 px-5 py-2.5 text-xs sm:grid-cols-3 shrink-0">
              <div>
                <span className="text-muted-foreground">本店历史单数：</span>
                <span className="font-bold text-foreground">{data.totalCount} 笔</span>
              </div>
              <div>
                <span className="text-muted-foreground">累计消费：</span>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">¥{data.totalActualPaidYuan}</span>
              </div>
              <div className="hidden sm:block text-right">
                <span className="text-muted-foreground">匹配依据：</span>
                <span className="text-foreground/80">平台脱敏真实手机尾号</span>
              </div>
            </div>
          )}

          {/* 列表主体 Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-xs">正在检索本店真实尾号历史订单...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-rose-500">
                <AlertCircle size={32} className="mb-2" />
                <span className="text-sm font-medium">{error}</span>
                <button
                  onClick={() => fetchHistory(phoneTail)}
                  className="mt-3 rounded-xl bg-rose-500/10 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-500/15 dark:text-rose-400 transition-colors"
                >
                  重新尝试
                </button>
              </div>
            ) : !data || data.orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ShoppingBag size={36} className="mb-2 text-muted-foreground/40" />
                <span className="text-sm font-medium text-foreground">本店暂无该真实尾号的历史订单</span>
                <span className="mt-1 text-xs text-muted-foreground">该顾客可能首次在本店下单或使用不同号码下单</span>
              </div>
            ) : (
              data.orders.map((order) => {
                const isCancelled = order.statusDisplay === "已取消" || order.status?.includes("取消");
                const isDelivering = order.statusDisplay === "配送中";
                const isCompleted = order.statusDisplay === "已完成";

                return (
                  <div
                    key={order.id}
                    className={cn(
                      "relative rounded-2xl border p-3.5 sm:p-4 transition-all text-left shadow-xs",
                      order.isCurrentOrder
                        ? "border-primary/40 bg-primary/[0.03] dark:border-primary/30 dark:bg-primary/[0.02]"
                        : "border-border/60 bg-card/60 hover:border-border/90 hover:bg-muted/15"
                    )}
                  >
                    {/* 顶部：平台、订单号、时间、状态 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-foreground">
                          {order.platform}
                        </span>
                        <span className="font-mono text-xs font-medium text-foreground/85">
                          #{order.orderNo}
                        </span>
                        {order.isCurrentOrder && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            当前正在查看
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock size={11} />
                          {formatLocalDateTime(order.orderTime)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border",
                            isCancelled
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : isDelivering
                              ? "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : isCompleted
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "border-border/50 bg-muted text-muted-foreground"
                          )}
                        >
                          {isCancelled ? <XCircle size={11} /> : isCompleted ? <CheckCircle2 size={11} /> : isDelivering ? <Truck size={11} /> : null}
                          {order.statusDisplay}
                        </span>
                      </div>
                    </div>

                    {/* 商品清单 */}
                    <div className="py-2.5 space-y-2">
                      {order.items.map((item, itemIdx) => (
                        <div key={item.id || itemIdx} className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {item.imageUrl ? (
                              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-muted/30">
                                <Image
                                  src={item.imageUrl}
                                  alt={item.productName}
                                  fill
                                  sizes="36px"
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30 text-muted-foreground">
                                <ShoppingBag size={15} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground" title={item.productName}>
                                {item.productName}
                              </p>
                              {item.spec && (
                                <p className="truncate text-[10.5px] text-muted-foreground">
                                  规格: {item.spec}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono text-muted-foreground">
                              x{item.quantity}
                            </span>
                            {item.price && (
                              <span className="font-mono font-medium text-foreground">
                                ¥{item.price}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 底部：实付金额与收货地址 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground max-w-[70%] truncate">
                        <MapPin size={12} className="shrink-0" />
                        <span className="truncate" title={order.userAddress}>
                          {order.userAddress || "无需配送/地址未提供"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-[11px]">实付:</span>
                        <span className="font-bold font-mono text-sm text-foreground">
                          ¥{order.actualPaidYuan}
                        </span>
                      </div>
                    </div>

                    {/* 顾客备注 */}
                    {order.customerRemark && (
                      <div className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-amber-500/15 bg-amber-500/8 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                        <FileText size={11} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-1">备注: {order.customerRemark}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 底部 Footer */}
          <div className="flex items-center justify-between border-t border-border/50 bg-muted/10 px-5 py-3 text-xs text-muted-foreground shrink-0">
            <span>* 仅限本店全部历史订单，基于脱敏真实手机号末4位精确聚合</span>
            <button
              type="button"
              onClick={onClose}
              className="h-8.5 inline-flex items-center justify-center rounded-xl border border-border/70 bg-background px-4 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              关闭
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
