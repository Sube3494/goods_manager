import { useState } from "react";
import { 
  X, Copy, Check, Store, Clock, FileText, MapPin, Tag, 
  ShoppingBag, AlertCircle, User, Phone, CreditCard, Hash, 
  ExternalLink, Calendar
} from "lucide-react";
import { OutboundOrder, OutboundOrderItem } from "@/lib/types";
import { parseOutboundNote, copyToClipboard, getPlatformMeta, cn } from "@/lib/utils";
import { getOutboundReturnedQuantityMap, parseOutboundReturnMeta } from "@/lib/outboundReturnMeta";
import { useToast } from "@/components/ui/Toast";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import Image from "next/image";

interface OutboundDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OutboundOrder | null;
}

// 智能解析用户备注中的结构化标签（例如 [收件人:xxx] [电话:xxx] [货款:xxx]）
function parseStructuredNote(noteText: string | null) {
  if (!noteText) return { structuredTags: [], freeText: "" };
  
  const tagRegex = /\[(收件人|电话|联系电话|货款|支付状态|付款|姓名|买家|客户):([^\]]+)\]/g;
  const structuredTags: Array<{ label: string; value: string; type: string }> = [];
  let remaining = noteText;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(noteText)) !== null) {
    const rawLabel = match[1];
    const rawValue = match[2].trim();
    let type = "default";
    if (rawLabel.includes("收件") || rawLabel.includes("姓名") || rawLabel.includes("买家") || rawLabel.includes("客户")) {
      type = "user";
    } else if (rawLabel.includes("电话")) {
      type = "phone";
    } else if (rawLabel.includes("货款") || rawLabel.includes("支付") || rawLabel.includes("付款")) {
      type = "payment";
    }
    structuredTags.push({ label: rawLabel, value: rawValue, type });
  }

  remaining = remaining.replace(tagRegex, "").trim();
  // 清理多余的前导/后置分隔符
  remaining = remaining.replace(/^\|\s*/, '').replace(/\|\s*$/, '').trim();

  return { structuredTags, freeText: remaining };
}

export function OutboundDetailModal({ isOpen, onClose, order }: OutboundDetailModalProps) {
  const { showToast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const parsed = parseOutboundNote(order.note);
  const platformMeta = getPlatformMeta(parsed.platform);
  const isReturned = order.status === "Returned";
  const isPartialReturned = order.status === "PartialReturned";
  const returnMeta = parseOutboundReturnMeta(order.note);
  const returnedQuantityMap = getOutboundReturnedQuantityMap(returnMeta.returns);
  const returnedItemDetailsMap = returnMeta.returns.reduce((acc, entry) => {
    for (const item of entry.items || []) {
      const key = String(item.outboundOrderItemId || "").trim();
      if (!key) continue;
      const list = acc.get(key) || [];
      list.push({
        createdAt: String(entry.createdAt || ""),
        reason: String(entry.reason || "").trim() || "退货",
        quantity: Math.max(0, Number(item.quantity || 0)),
      });
      acc.set(key, list);
    }
    return acc;
  }, new Map<string, Array<{ createdAt: string; reason: string; quantity: number }>>());

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
  const totalSkuCount = order.items.length;

  const typeConfig: Record<string, { label: string; color: string; dot: string }> = {
    Sale: { 
      label: '销售出库', 
      color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
      dot: 'bg-sky-500'
    },
    Sample: { 
      label: '领用出库', 
      color: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
      dot: 'bg-purple-500'
    },
    Return: { 
      label: '退货出库', 
      color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
      dot: 'bg-amber-500'
    },
    Loss: { 
      label: '损耗出库', 
      color: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
      dot: 'bg-rose-500'
    }
  };
  const activeType = typeConfig[order.type as keyof typeof typeConfig] || { 
    label: '其他出库', 
    color: 'bg-muted/40 text-muted-foreground border-border/60',
    dot: 'bg-muted-foreground'
  };

  const displayOrderNo = parsed.serialNum 
    ? `#${parsed.serialNum}` 
    : `#${order.id.slice(-6).toUpperCase()}`;

  const resolvedShop = parsed.shopName || order.shopName || "未分配门店";
  const { structuredTags, freeText } = parseStructuredNote(parsed.userNote);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 lg:pl-(--sidebar-width) transition-[padding] duration-200">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-all duration-300"
        onClick={onClose}
      />

      {/* 弹窗主体容器 */}
      <div className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-gray-900/80 backdrop-blur-2xl border border-border/60 dark:border-white/10 rounded-[28px] sm:rounded-[32px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* 头部导航与摘要 */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-border/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-tight text-foreground whitespace-nowrap">
              出库单详情
            </h2>

            {/* 平台与流水号胶囊 */}
            {platformMeta ? (
              <span className={cn("inline-flex h-6.5 items-center gap-1.5 px-2.5 rounded-full text-[11px] font-black border shadow-2xs whitespace-nowrap", platformMeta.className)}>
                <Image
                  src={platformMeta.iconSrc}
                  alt={platformMeta.name}
                  width={13}
                  height={13}
                  className="h-3.5 w-3.5 object-cover rounded-xs shrink-0"
                  unoptimized
                />
                <span>{platformMeta.name} {displayOrderNo}</span>
              </span>
            ) : (
              <span className="inline-flex h-6.5 items-center px-2.5 rounded-full border border-border/60 bg-muted/40 dark:border-white/10 dark:bg-white/5 text-[11px] font-mono font-black text-foreground whitespace-nowrap">
                {displayOrderNo}
              </span>
            )}

            {/* 出库类型徽章 */}
            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shadow-2xs", activeType.color)}>
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", activeType.dot)} />
              {activeType.label}
            </span>

            {/* 对冲/退回状态 */}
            {(isReturned || isPartialReturned) && (
              <span className="flex items-center gap-1 text-[10px] font-black text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 shadow-2xs">
                <AlertCircle size={11} />
                {isReturned ? "已对冲退货" : "部分退回"}
              </span>
            )}
          </div>

          <button 
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 shrink-0 ml-2 cursor-pointer active:scale-90"
            title="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* 弹窗内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 custom-scrollbar">
          
          {/* 订单基础属性面板 (轻量化仪表盘结构，杜绝框套框) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/60 dark:bg-white/[0.03] border border-border/60 dark:border-white/10 shadow-2xs space-y-3.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
              
              {/* 出库门店 */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <Store size={12} className="text-sky-500 shrink-0" />
                  <span>出库门店</span>
                </div>
                <div className="font-bold text-foreground text-xs sm:text-sm truncate" title={resolvedShop}>
                  {resolvedShop}
                </div>
              </div>

              {/* 出库时间 */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <Clock size={12} className="text-emerald-500 shrink-0" />
                  <span>出库时间</span>
                </div>
                <div className="font-mono text-foreground font-semibold text-xs">
                  {format(new Date(order.date), 'yyyy-MM-dd HH:mm:ss', { locale: zhCN })}
                </div>
              </div>

              {/* 平台订单号 */}
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground">
                  <Hash size={12} className="text-purple-500 shrink-0" />
                  <span>平台订单号</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-xs text-foreground font-bold truncate select-all">
                    {parsed.platformId || "-"}
                  </span>
                  {parsed.platformId && (
                    <button
                      onClick={() => handleCopy(parsed.platformId!, "platformId")}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                      title="复制平台订单号"
                    >
                      {copiedField === "platformId" ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* 配送地址单独横条 */}
            {parsed.address && (
              <div className="pt-3 border-t border-border/50 dark:border-white/5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <MapPin size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-muted-foreground block mb-0.5">配送地址</span>
                    <p className="text-xs font-bold text-foreground leading-relaxed select-all break-all">
                      {parsed.address}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleCopy(parsed.address!, "address")}
                  className="p-1.5 rounded-full border border-border/60 bg-white/70 dark:bg-white/5 dark:border-white/10 text-muted-foreground hover:text-foreground hover:border-sky-500/40 transition-all shrink-0 cursor-pointer shadow-2xs active:scale-95"
                  title="复制配送地址"
                >
                  {copiedField === "address" ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                </button>
              </div>
            )}
          </div>

          {/* 结构化用户备注 / 履约信息便签 */}
          {(structuredTags.length > 0 || freeText) && (
            <div className="p-4 rounded-2xl border border-sky-500/20 bg-sky-500/[0.04] dark:bg-sky-500/[0.06] backdrop-blur-md shadow-2xs space-y-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                <FileText size={12} className="text-sky-500" />
                <span>订单备注与履约信息</span>
              </div>

              {/* 结构化微卡片/胶囊 */}
              {structuredTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {structuredTags.map((tag, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-2xs",
                        tag.type === "payment"
                          ? tag.value.includes("未") 
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                          : tag.type === "phone"
                            ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20"
                            : "bg-white/80 dark:bg-white/5 text-foreground border-border/60 dark:border-white/10"
                      )}
                    >
                      {tag.type === "user" && <User size={12} className="opacity-70" />}
                      {tag.type === "phone" && <Phone size={12} className="opacity-70" />}
                      {tag.type === "payment" && <CreditCard size={12} className="opacity-70" />}
                      <span className="text-muted-foreground text-[11px] font-medium">{tag.label}:</span>
                      <span className="font-mono">{tag.value}</span>
                      {tag.type === "phone" && (
                        <button
                          onClick={() => handleCopy(tag.value, `phone-${idx}`)}
                          className="p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                          title="复制电话"
                        >
                          {copiedField === `phone-${idx}` ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 自由文本说明 */}
              {freeText && (
                <p className="text-xs font-bold text-foreground leading-relaxed break-words bg-white/40 dark:bg-white/[0.03] p-2.5 rounded-xl border border-sky-500/10">
                  {freeText}
                </p>
              )}
            </div>
          )}

          {/* 出库商品清单 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-foreground flex items-center gap-2 tracking-wider uppercase">
                <ShoppingBag size={14} className="text-sky-500" />
                出库商品明细
              </h3>
              <span className="text-[10px] font-bold text-muted-foreground px-3 py-1 rounded-full bg-white/70 dark:bg-white/5 border border-border/60 dark:border-white/10 shadow-2xs">
                {totalSkuCount} 种 · 共 {totalQuantity} 件
              </span>
            </div>
            
            {/* 商品清单列表 */}
            <div className="space-y-2">
              {order.items.map((item: OutboundOrderItem) => {
                const itemId = String(item.id || "");
                const name = item.shopProduct?.name || item.product?.name || '未知商品';
                const img = item.shopProduct?.image || item.product?.image;
                const sku = item.shopProductId ? (item.shopProduct?.sku || '-') : (item.product?.sku || '-');
                const returnedQuantity = itemId ? Math.max(0, returnedQuantityMap.get(itemId) || 0) : 0;
                const returnedDetails = itemId ? (returnedItemDetailsMap.get(itemId) || []) : [];
                const remainingQuantity = Math.max(0, item.quantity - returnedQuantity);
                const isItemReturned = returnedQuantity > 0;
                
                return (
                  <div 
                    key={item.id} 
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 group shadow-2xs",
                      isItemReturned
                        ? "bg-rose-50/50 border-rose-200 dark:bg-rose-500/[0.05] dark:border-rose-500/20"
                        : "bg-white/60 dark:bg-white/[0.02] border-border/60 dark:border-white/10 hover:border-sky-500/30 hover:bg-white/90 dark:hover:bg-white/[0.05]"
                    )}
                  >
                    {/* 左侧：商品图 + 描述 */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-xl overflow-hidden bg-muted/50 border border-border/60 dark:border-white/10 shadow-2xs group-hover:scale-105 transition-transform">
                        {img ? (
                          <Image src={img} className="object-cover" alt="" fill sizes="48px" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <ShoppingBag size={18} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <p className="font-bold text-xs sm:text-sm text-foreground leading-snug truncate" title={name}>
                          {name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.shopProduct?.shopName && (
                            <span className="inline-flex items-center border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 rounded-full text-[9px] font-bold text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300">
                              {item.shopProduct.shopName}
                            </span>
                          )}
                          <span className="font-mono text-[9px] text-muted-foreground bg-muted/40 dark:bg-white/5 px-2 py-0.5 rounded-full border border-border/50 dark:border-white/5">
                            SKU: {sku}
                          </span>
                          {isItemReturned ? (
                            <>
                              {returnedDetails.map((detail, detailIndex) => (
                                <span
                                  key={`${itemId}-return-${detailIndex}`}
                                  className="inline-flex items-center rounded-full text-[9px] font-bold bg-rose-500/10 px-2 py-0.5 text-rose-600 dark:text-rose-300 border border-rose-500/20"
                                  title={`${format(new Date(detail.createdAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })} · ${detail.reason} · x${detail.quantity}`}
                                >
                                  {detail.reason}{detail.quantity > 1 ? ` x${detail.quantity}` : ""}
                                </span>
                              ))}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* 右侧：出库数量高亮徽章 */}
                    <div className="shrink-0 flex items-center gap-2 pl-2">
                      {isItemReturned && (
                        <div className="hidden sm:flex flex-col items-end text-[10px] font-semibold leading-3.5">
                          <span className="text-rose-600 dark:text-rose-400 font-mono">退 x{returnedQuantity}</span>
                          <span className="text-muted-foreground font-mono">原 x{item.quantity}</span>
                        </div>
                      )}
                      <div className={cn(
                        "font-mono text-xs sm:text-sm font-black px-3 py-1 rounded-full shadow-2xs border",
                        isItemReturned
                          ? "text-rose-600 bg-rose-500/10 border-rose-500/20 dark:text-rose-400"
                          : "text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400"
                      )}>
                        {isItemReturned ? `剩 x${remainingQuantity}` : `x${item.quantity}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* 底部操作栏 */}
        <div className="px-5 sm:px-7 py-3.5 sm:py-4 border-t border-border/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(order.id, "orderId")}
              className="h-9 px-3.5 rounded-full border border-border/60 bg-white/80 dark:bg-white/5 dark:border-white/10 text-muted-foreground hover:text-foreground hover:border-sky-500/30 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
            >
              {copiedField === "orderId" ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>复制单据ID</span>
            </button>
          </div>

          <button 
            onClick={onClose}
            className="h-9 sm:h-10 px-6 sm:px-7 rounded-full text-xs sm:text-sm font-bold transition-all bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 cursor-pointer"
          >
            关闭详情
          </button>
        </div>

      </div>
    </div>
  );
}
