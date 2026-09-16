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
  Sparkles,
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
  maskedPhone?: string | null;
}

export function CustomerHistoryModal({
  isOpen,
  onClose,
  phoneTail: initialPhoneTail,
  currentOrderNo,
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
  }, [currentOrderNo]);

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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-all"
        />

        {/* 弹窗主体 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative flex flex-col w-full max-w-2xl max-h-[88vh] rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-white/10 dark:bg-[#151921] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-white/5 dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20">
                <History size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    老客历史订单档案
                  </h3>
                  <span className="inline-flex items-center rounded-full border border-slate-400/20 bg-slate-500/8 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-500 dark:text-slate-300">
                    老客
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Phone size={11} className="shrink-0" />
                    <span>真实尾号: <strong className="font-mono text-slate-700 dark:text-slate-200">{phoneTail}</strong></span>
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
              {/* 尾号快捷搜索 */}
              <form onSubmit={handleSearch} className="hidden sm:flex items-center gap-1.5">
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    value={inputTail}
                    onChange={(e) => setInputTail(e.target.value.replace(/\D/g, ""))}
                    placeholder="尾号4位"
                    className="h-8 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-mono text-slate-800 placeholder-slate-400 focus:border-primary focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  title="按尾号搜索"
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <Search size={13} />
                </button>
              </form>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 统计概览条 */}
          {data && !loading && (
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-slate-50/40 px-5 py-2.5 dark:border-white/5 dark:bg-white/[0.01] sm:grid-cols-3">
              <div className="text-xs">
                <span className="text-slate-400 dark:text-slate-500">历史单数：</span>
                <span className="font-bold text-slate-800 dark:text-white">{data.totalCount} 笔</span>
              </div>
              <div className="text-xs">
                <span className="text-slate-400 dark:text-slate-500">累计消费：</span>
                <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">¥{data.totalActualPaidYuan}</span>
              </div>
              <div className="hidden sm:block text-xs text-right">
                <span className="text-slate-400 dark:text-slate-500">匹配依据：</span>
                <span className="text-slate-600 dark:text-slate-300">平台脱敏真实手机尾号</span>
              </div>
            </div>
          )}

          {/* 列表主体 Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-xs">正在基于真实尾号检索历史订单...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-rose-500">
                <AlertCircle size={32} className="mb-2" />
                <span className="text-sm font-medium">{error}</span>
                <button
                  onClick={() => fetchHistory(phoneTail)}
                  className="mt-3 rounded-lg bg-rose-50 px-3 py-1 text-xs text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400"
                >
                  重新尝试
                </button>
              </div>
            ) : !data || data.orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <ShoppingBag size={36} className="mb-2 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">暂未查找到该真实尾号的历史订单</span>
                <span className="mt-1 text-xs text-slate-400">该顾客可能仅有一笔当前订单或使用不同号码下单</span>
              </div>
            ) : (
              data.orders.map((order, index) => {
                const isCancelled = order.statusDisplay === "已取消" || order.status?.includes("取消");
                const isDelivering = order.statusDisplay === "配送中";
                const isCompleted = order.statusDisplay === "已完成";

                return (
                  <div
                    key={order.id}
                    className={cn(
                      "relative rounded-xl border p-3.5 transition-all text-left",
                      order.isCurrentOrder
                        ? "border-primary/40 bg-primary/[0.03] shadow-sm dark:border-primary/30 dark:bg-primary/[0.02]"
                        : "border-slate-200/70 bg-white hover:border-slate-300 dark:border-white/8 dark:bg-[#181d26] dark:hover:border-white/15"
                    )}
                  >
                    {/* 顶部：平台、订单号、时间、状态 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                          {order.platform}
                        </span>
                        <span className="font-mono text-xs font-medium text-slate-600 dark:text-slate-300">
                          #{order.orderNo}
                        </span>
                        {order.isCurrentOrder && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                            当前正在查看
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Clock size={11} />
                          {formatLocalDateTime(order.orderTime)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            isCancelled
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : isDelivering
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : isCompleted
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
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
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.imageUrl ? (
                              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5">
                                <Image
                                  src={item.imageUrl}
                                  alt={item.productName}
                                  fill
                                  sizes="32px"
                                  className="object-cover"
                                  unoptimized
                                />
                              </div>
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-slate-400 dark:border-white/5 dark:bg-white/5">
                                <ShoppingBag size={14} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-800 dark:text-slate-200" title={item.productName}>
                                {item.productName}
                              </p>
                              {item.spec && (
                                <p className="truncate text-[10.5px] text-slate-400">
                                  规格: {item.spec}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="font-mono text-slate-500 dark:text-slate-400">
                              x{item.quantity}
                            </span>
                            {item.price && (
                              <span className="font-mono font-medium text-slate-700 dark:text-slate-200">
                                ¥{item.price}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 底部：实付金额与收货地址 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs dark:border-white/5">
                      <div className="flex items-center gap-1.5 text-slate-500 max-w-[70%] truncate">
                        <MapPin size={12} className="shrink-0 text-slate-400" />
                        <span className="truncate" title={order.userAddress}>
                          {order.userAddress || "无需配送/地址未提供"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-slate-400 text-[11px]">实付:</span>
                        <span className="font-bold font-mono text-sm text-slate-900 dark:text-white">
                          ¥{order.actualPaidYuan}
                        </span>
                      </div>
                    </div>

                    {/* 顾客备注 */}
                    {order.customerRemark && (
                      <div className="mt-1.5 flex items-start gap-1 rounded bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
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
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-400 dark:border-white/5 dark:bg-white/[0.01]">
            <span>* 仅基于脱敏真实手机号末4位（如 155****1737 的 1737）精确聚合</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-200/80 px-4 py-1.5 font-medium text-slate-700 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
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
