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
  };

  const totalQuantity = order.items.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 lg:pl-(--sidebar-width) transition-[padding] duration-200">
      {/* Background overlay with high end glass blur */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-xl transition-all duration-300"
        onClick={onClose}
      />

      {/* Modal Content - Styled with refined glass panel */}
      <div className="relative w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] flex flex-col glass-panel rounded-[24px] sm:rounded-[26px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-black/5 dark:border-white/5 bg-transparent">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-bold text-foreground">出库单详情</h2>
            {isReturned && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">
                <AlertCircle size={10} />
                已对冲
              </span>
            )}
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-all active:scale-95"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-5 sm:space-y-6 custom-scrollbar">
          
          {/* Main Info Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            
            {/* Left Block: Basic Details */}
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl glass-card">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
                <FileText size={12} className="text-primary/70" />
                基础信息
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">流水单号</span>
                  <span className="font-mono font-black text-foreground">
                    {parsed.serialNum ? `#${parsed.serialNum}` : `#${order.id.slice(-6).toUpperCase()}`}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">出库类型</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    order.type === 'Sale' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                    order.type === 'Sample' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20' :
                    'bg-orange-500/10 text-orange-600 border-orange-500/20'
                  }`}>
                    {order.type === 'Sale' ? '销售' : order.type === 'Sample' ? '领用' : order.type === 'Return' ? '退货' : '损耗'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">出库门店</span>
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <Store size={13} className="text-blue-500/80" />
                    {parsed.shopName || order.shopName || "未知门店"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">出库时间</span>
                  <span className="flex items-center gap-1 font-mono text-foreground font-medium">
                    <Clock size={13} className="text-muted-foreground/50" />
                    {format(new Date(order.date), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Block: Platform & Shipping Info */}
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl glass-card">
              <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] mb-2 flex items-center gap-1.5">
                <Tag size={12} className="text-primary/70" />
                渠道与配送
              </h3>
              
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">平台渠道</span>
                  {platformMeta ? (
                    <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black shadow-xs", platformMeta.className)}>
                      <span className="inline-flex h-5 w-5 items-center justify-center shrink-0">
                        <Image
                          src={platformMeta.iconSrc}
                          alt={platformMeta.name}
                          width={20}
                          height={20}
                          className="h-5 w-5 object-cover"
                          unoptimized
                        />
                      </span>
                      <span>{platformMeta.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">手动登记</span>
                  )}
                </div>

                <div className="flex justify-between items-center gap-4">
                  <span className="text-muted-foreground shrink-0">平台单号</span>
                  {parsed.platformId ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-xs text-foreground truncate select-all">{parsed.platformId}</span>
                      <button
                        onClick={() => handleCopy(parsed.platformId!, "platformId")}
                        className="p-1 rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground shrink-0 transition-colors"
                        title="复制平台单号"
                      >
                        {copiedField === "platformId" ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                      </button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40">-</span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">配送地址</span>
                    {parsed.address && (
                      <button
                        onClick={() => handleCopy(parsed.address!, "address")}
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline transition-all font-semibold"
                      >
                        {copiedField === "address" ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                        <span>复制</span>
                      </button>
                    )}
                  </div>
                  {parsed.address ? (
                    <div className="flex items-start gap-1.5 mt-1 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 text-xs text-foreground leading-relaxed break-all border border-black/5 dark:border-white/5">
                      <MapPin size={12} className="text-primary shrink-0 mt-0.5" />
                      <span>{parsed.address}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/40 text-right">-</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* User Custom Note & Return Status */}
          {(parsed.userNote || isReturned) && (
            <div className="space-y-4">
              {parsed.userNote && (
                <div className="p-4 sm:p-5 rounded-2xl border border-primary/10 bg-primary/5 dark:bg-primary/10">
                  <h4 className="text-[10px] font-bold text-primary uppercase tracking-[0.12em] mb-1">用户备注</h4>
                  <p className="text-xs font-semibold text-foreground leading-relaxed">
                    {parsed.userNote}
                  </p>
                </div>
              )}
              {isReturned && (
                <div className="p-4 sm:p-5 rounded-2xl border border-destructive/15 bg-destructive/5 dark:bg-destructive/10 flex items-start gap-2.5">
                  <ArrowLeftRight className="text-destructive shrink-0 mt-0.5" size={15} />
                  <div>
                    <h4 className="text-[10px] font-bold text-destructive uppercase tracking-[0.12em] mb-0.5">退回对冲详情</h4>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      该笔交易已进行财务对冲并恢复库存。
                      {returnReason && <span className="block mt-1.5 font-bold text-destructive">退回原因: {returnReason}</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product Items Table */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2 tracking-[0.06em]">
              <ShoppingBag size={14} className="text-primary" />
              出库商品明细 ({order.items.length} 种, 共 {totalQuantity} 件)
            </h3>
            
            <div className="glass-card rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse table-auto text-xs">
                <thead>
                  <tr className="border-b border-black/5 dark:border-white/5 bg-black/2 dark:bg-white/2 text-muted-foreground text-[10px] font-bold uppercase tracking-[0.1em]">
                    <th className="px-3 sm:px-5 py-3 w-full">商品</th>
                    <th className="px-3 sm:px-5 py-3 text-center whitespace-nowrap">规格/SKU</th>
                    <th className="px-3 sm:px-5 py-3 text-center whitespace-nowrap">出库数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {order.items.map((item: OutboundOrderItem) => {
                    const name = item.shopProduct?.name || item.product?.name || '未知商品';
                    const img = item.shopProduct?.image || item.product?.image;
                    const sku = item.shopProduct?.sku || item.product?.sku || '-';
                    
                    return (
                      <tr key={item.id} className="hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
                        <td className="px-3 sm:px-5 py-3">
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl overflow-hidden bg-white dark:bg-black/20 flex items-center justify-center border border-black/5 dark:border-white/5">
                              {img ? (
                                <Image src={img} className="object-cover" alt="" fill sizes="40px" />
                              ) : (
                                <ShoppingBag size={16} className="text-muted-foreground/30" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate max-w-[120px] sm:max-w-[240px]" title={name}>
                                {name}
                              </p>
                              {item.shopProduct?.shopName && (
                                <span className="inline-block mt-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                  {item.shopProduct.shopName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-5 py-3 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {sku}
                        </td>
                        <td className="px-3 sm:px-5 py-3 text-center font-black text-primary sm:text-sm whitespace-nowrap">
                          x{item.quantity}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-black/5 dark:border-white/5 bg-transparent flex justify-end">
          <button 
            onClick={onClose}
            className="px-5 sm:px-6 py-2 bg-black text-white dark:bg-white dark:text-black hover:opacity-90 rounded-full text-xs font-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/10"
          >
            关闭详情
          </button>
        </div>

      </div>
    </div>
  );
}
