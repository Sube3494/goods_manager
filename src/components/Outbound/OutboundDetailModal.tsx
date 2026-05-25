import { useState } from "react";
import { X, Copy, Check, Store, Clock, FileText, MapPin, Tag, ShoppingBag, AlertCircle, ArrowLeftRight } from "lucide-react";
import { OutboundOrder, OutboundOrderItem } from "@/lib/types";
import { parseOutboundNote, copyToClipboard, getPlatformMeta, cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import Image from "next/image";

interface OutboundDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OutboundOrder | null;
}

export function OutboundDetailModal({ isOpen, onClose, order }: OutboundDetailModalProps) {
  const { showToast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const parsed = parseOutboundNote(order.note);
  const platformMeta = getPlatformMeta(parsed.platform);
  const isReturned = order.status === "Returned";
  
  // 提取对冲理由
  const noteParts = order.note?.match(/^(.*)\s*\(已退回:\s*(.*)\)$/);
  const returnReason = noteParts ? noteParts[2] : (isReturned ? "常规退回" : null);

  const handleCopy = async (text: string, field: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedField(field);
      showToast("已成功复制到剪贴板", "success");
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      showToast("复制失败，请手动选择复制", "error");
    }
  };  const totalQuantity = order.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 lg:pl-(--sidebar-width) transition-[padding] duration-200">
      {/* Background overlay with high end glass blur */}
      <div 
        className="absolute inset-0 bg-slate-900/40 dark:bg-[#020617]/75 backdrop-blur-md dark:backdrop-blur-2xl transition-all duration-300"
        onClick={onClose}
      />

      {/* Modal Content - Styled with refined glass panel */}
      <div className="relative w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] flex flex-col bg-white/95 dark:bg-[#0a0f1d]/95 backdrop-blur-3xl border border-black/[0.08] dark:border-white/5 rounded-[24px] sm:rounded-[28px] shadow-2xl dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-black/[0.05] dark:border-white/5 bg-transparent">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-black bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">出库单详情</h2>
            {isReturned && (
              <span className="flex items-center gap-1 text-[10px] font-black tracking-wide text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.1)] animate-pulse">
                <AlertCircle size={10} />
                已对冲
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all duration-300 hover:rotate-90 active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 custom-scrollbar">
          
          {/* Main Info Dashboard - Unified One-Box Panel */}
          <div className="space-y-4 p-5 rounded-2xl bg-slate-50/60 dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/10 shadow-[inner_0_1px_1px_rgba(255,255,255,0.05)] animate-in fade-in slide-in-from-top-2 duration-300">
            <h3 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em] mb-1 flex items-center gap-1.5">
              <FileText size={12} className="text-blue-500 dark:text-blue-400" />
              订单基本信息
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {/* 流水号与平台渠道集成卡片 (完美复刻订单列表的平台+流水号集成Badge形式) */}
              <div className="col-span-2 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3.5 rounded-xl transition-all duration-300 shadow-sm dark:shadow-none flex items-center justify-between group">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    <FileText size={12} className="text-blue-500 dark:text-blue-400 group-hover:scale-110 transition-transform" />
                    <span>流水号与平台</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {platformMeta ? (
                      <span className={cn("inline-flex h-7 items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black border shadow-xs whitespace-nowrap", platformMeta.className)}>
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center shrink-0">
                          <Image
                            src={platformMeta.iconSrc}
                            alt={platformMeta.name}
                            width={14}
                            height={14}
                            className="h-3.5 w-3.5 object-cover"
                            unoptimized
                          />
                        </span>
                        <span>
                          {parsed.serialNum 
                            ? `${platformMeta.name} #${parsed.serialNum}` 
                            : `${platformMeta.name} #${order.id.slice(-6).toUpperCase()}`}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex h-7 items-center rounded-full border border-black/8 bg-black/3 dark:border-white/10 dark:bg-white/4 px-2.5 text-[10px] font-mono font-black text-foreground/80 whitespace-nowrap">
                        {parsed.serialNum ? `#${parsed.serialNum}` : `#${order.id.slice(-6).toUpperCase()}`}
                      </span>
                    )}
                  </div>
                </div>

              </div>

              {/* 出库类型 (col-span-1 平行) */}
              {(() => {
                const typeConfig = {
                  Sale: { label: '销售出库', color: 'from-blue-500/10 to-cyan-500/5 text-blue-600 dark:text-cyan-400 border-blue-200 dark:border-cyan-500/30' },
                  Sample: { label: '领用出库', color: 'from-purple-500/10 to-pink-500/5 text-purple-600 dark:text-pink-400 border-purple-200 dark:border-pink-500/30' },
                  Return: { label: '退货出库', color: 'from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
                  Loss: { label: '损耗出库', color: 'from-rose-500/10 to-red-500/5 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30' }
                };
                const activeType = typeConfig[order.type as keyof typeof typeConfig] || { label: '其他出库', color: 'from-slate-500/10 to-slate-500/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/30' };
                return (
                  <div className="col-span-1 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3 rounded-xl transition-all duration-300 group shadow-sm dark:shadow-none">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                      <Tag size={12} className="text-pink-500 dark:text-pink-400 group-hover:scale-110 transition-transform" />
                      <span>出库类型</span>
                    </div>
                    <div className="mt-1">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border bg-gradient-to-br shadow-xs", activeType.color)}>
                        {activeType.label}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 出库门店 (col-span-1 平行) */}
              <div className="col-span-1 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3 rounded-xl transition-all duration-300 group shadow-sm dark:shadow-none">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                  <Store size={12} className="text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span>出库门店</span>
                </div>
                <div className="font-bold text-xs text-slate-900 dark:text-white truncate mt-0.5" title={parsed.shopName || order.shopName || "未知门店"}>
                  {parsed.shopName || order.shopName || "未知门店"}
                </div>
              </div>

              {/* 出库时间 (col-span-2) */}
              <div className="col-span-2 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3 rounded-xl transition-all duration-300 group shadow-sm dark:shadow-none">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                  <Clock size={12} className="text-emerald-500 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span>出库时间</span>
                </div>
                <div className="font-mono text-xs text-slate-700 dark:text-slate-300 font-semibold mt-0.5">
                  {format(new Date(order.date), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                </div>
              </div>

              {/* 平台订单号 (col-span-2 独立一行全宽平铺，右置复制) */}
              <div className="col-span-2 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3 rounded-xl transition-all duration-300 group flex items-center justify-between gap-4 shadow-sm dark:shadow-none">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                    <FileText size={12} className="text-cyan-500 dark:text-cyan-400 group-hover:scale-110 transition-transform" />
                    <span>平台订单号</span>
                  </div>
                  <div className="font-mono text-xs text-slate-900 dark:text-white truncate font-bold mt-0.5 select-all" title={parsed.platformId || "-"}>
                    {parsed.platformId || "-"}
                  </div>
                </div>
                {parsed.platformId && (
                  <button
                    onClick={() => handleCopy(parsed.platformId!, "platformId")}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all shrink-0 self-end mb-0.5"
                    title="复制平台订单号"
                  >
                    {copiedField === "platformId" ? <Check size={12} className="text-emerald-500 dark:text-emerald-400 animate-bounce" /> : <Copy size={12} />}
                  </button>
                )}
              </div>

              {/* 配送地址 (去除累赘嵌套黑框，右置一键复制，与上面的平台订单号完美对称) */}
              <div className="col-span-2 bg-white dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/5 hover:border-black/[0.1] dark:hover:border-white/10 p-3 rounded-xl transition-all duration-300 group flex items-center justify-between gap-4 shadow-sm dark:shadow-none">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                    <MapPin size={12} className="text-rose-500 dark:text-rose-400 group-hover:scale-110 transition-transform" />
                    <span>配送地址</span>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white leading-relaxed break-all mt-0.5">
                    {parsed.address || "-"}
                  </div>
                </div>
                {parsed.address && (
                  <button
                    onClick={() => handleCopy(parsed.address!, "address")}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all shrink-0 self-end mb-0.5"
                    title="复制配送地址"
                  >
                    {copiedField === "address" ? <Check size={12} className="text-emerald-500 dark:text-emerald-400 animate-bounce" /> : <Copy size={12} />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* User Custom Note & Return Status */}
          {(parsed.userNote || isReturned) && (
            <div className="space-y-4">
              {parsed.userNote && (
                <div className="p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-md shadow-[0_0_15px_rgba(59,130,246,0.03)] flex gap-3">
                  <div className="p-2 h-fit rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 shrink-0">
                    <FileText size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">用户备注</h4>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                      {parsed.userNote}
                    </p>
                  </div>
                </div>
              )}
              {isReturned && (
                <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md shadow-[0_0_15px_rgba(244,63,94,0.03)] flex gap-3">
                  <div className="p-2 h-fit rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 shrink-0">
                    <ArrowLeftRight size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-black text-rose-500 dark:text-rose-400 uppercase tracking-widest mb-0.5">退回对冲详情</h4>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                      该笔交易已进行财务对冲并恢复库存。
                      {returnReason && (
                        <span className="block mt-1.5 font-black text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded w-fit text-[10px] break-all">
                          退回原因: {returnReason}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product Items Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-2 tracking-widest uppercase">
              <ShoppingBag size={14} className="text-blue-500 dark:text-blue-400" />
              出库商品明细
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 border border-black/[0.05] dark:border-white/5">
                {order.items.length} 种 · 共 {totalQuantity} 件
              </span>
            </h3>
            
            {/* Products Card List */}
            <div className="space-y-2.5">
              {order.items.map((item: OutboundOrderItem) => {
                const name = item.shopProduct?.name || item.product?.name || '未知商品';
                const img = item.shopProduct?.image || item.product?.image;
                const sku = item.shopProduct?.sku || item.product?.sku || '-';
                
                return (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/10 hover:border-black/[0.1] dark:hover:border-white/20 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-300 hover:-translate-y-0.5 group shadow-xs dark:shadow-none"
                  >
                    {/* Left: Product Info */}
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-900 flex items-center justify-center border border-black/[0.08] dark:border-white/15 shadow-sm group-hover:scale-105 transition-transform duration-300">
                        {img ? (
                          <Image src={img} className="object-cover" alt="" fill sizes="48px" />
                        ) : (
                          <ShoppingBag size={18} className="text-slate-400 dark:text-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        {/* 商品名称折行限制 line-clamp-2，以完美消化长商品名并减少空白区域 */}
                        <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug line-clamp-2 max-w-[280px] sm:max-w-[420px]" title={name}>
                          {name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.shopProduct?.shopName && (
                            <span className="inline-flex px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              {item.shopProduct.shopName}
                            </span>
                          )}
                          <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-white/5 px-2 py-0.5 rounded border border-black/[0.04] dark:border-white/5">
                            SKU: {sku}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quantity Badge */}
                    <div className="shrink-0 flex items-center pl-2">
                      <div className="font-mono text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-1.2 rounded-full shadow-sm dark:shadow-[0_0_15px_rgba(16,185,129,0.05)]">
                        x{item.quantity}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-black/[0.05] dark:border-white/5 bg-transparent flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-gradient-to-b dark:from-slate-100 dark:to-slate-200 dark:hover:from-white dark:hover:to-slate-100 dark:text-slate-900 font-black text-xs rounded-full transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] shadow-lg dark:shadow-[0_4px_20px_rgba(255,255,255,0.08)] cursor-pointer"
          >
            关闭详情
          </button>
        </div>

      </div>
    </div>
  );
}
