"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { 
  X, 
  Receipt, 
  Calendar, 
  Check, 
  Copy, 
  Store, 
  Layers, 
  Share2, 
  Percent, 
  Sparkles, 
  ArrowDownLeft, 
  ArrowUpRight,
  ShieldCheck,
  Calculator
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Settlement } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { getPlatformMeta, cn } from "@/lib/utils";

interface SettlementDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  settlement: Settlement | null;
}

const formatCurrency = (value: number) =>
  `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SettlementDetailModal({ isOpen, onClose, settlement }: SettlementDetailModalProps) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 监听 ESC 键与锁定背景滚动
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !settlement || !mounted) return null;

  const stats = {
    totalReceived: settlement.items.reduce((sum, item) => sum + item.received, 0),
    totalBrushing: settlement.items.reduce((sum, item) => sum + item.brushing, 0),
    totalToCard: settlement.items.reduce((sum, item) => sum + item.receivedToCard, 0),
    totalNet: settlement.items.reduce((sum, item) => sum + Math.max(0, item.received - item.brushing), 0),
  };

  // 实时校准抽成和补差（防止历史数据四舍五入偏差）
  const correctedServiceFee = Number((stats.totalNet * settlement.serviceFeeRate).toFixed(2));
  const correctedFinalBalance = Number((stats.totalReceived - stats.totalToCard - correctedServiceFee).toFixed(2));

  const shopNames = Array.from(new Set(settlement.items.map((i) => i.shopName).filter(Boolean)));
  const primaryShopName = settlement.shopName || (shopNames.length > 0 ? shopNames.join(" / ") : "全部店铺");
  const monthStr = format(new Date(settlement.date), "yyyy年MM月", { locale: zhCN });
  const displayId = `#${settlement.id.slice(-8).toUpperCase()}`;

  const handleCopyId = () => {
    void navigator.clipboard.writeText(settlement.id);
    setCopiedId(true);
    showToast("单据完整 ID 已复制到剪贴板", "success");
    setTimeout(() => setCopiedId(false), 2000);
  };

  // 一键复制对账单文字摘要（方便微信/钉钉沟通）
  const handleCopySummary = () => {
    const summaryText = [
      `📋【结算对账单 · ${monthStr}】`,
      `🏬 店铺：${primaryShopName}`,
      `💰 账单总入账：${formatCurrency(stats.totalReceived)}`,
      `📉 扣除刷单：${formatCurrency(stats.totalBrushing)}`,
      `💳 商家实际已收：${formatCurrency(stats.totalToCard)}`,
      `📈 真实净业绩：${formatCurrency(stats.totalNet)}`,
      `💼 公司抽成(${(settlement.serviceFeeRate * 100).toFixed(1)}%)：-${formatCurrency(correctedServiceFee)}`,
      `-----------------------`,
      `🎯 最终应补差价：${formatCurrency(correctedFinalBalance)} (${correctedFinalBalance >= 0 ? "需向商家打款补差" : "商家需退补差额"})`,
      `🔖 单据编号：${displayId}`,
    ].join("\n");

    void navigator.clipboard.writeText(summaryText);
    setCopiedSummary(true);
    showToast("对账摘要已复制", "success");
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 select-none overflow-hidden">
      {/* 纯净高级深色毛玻璃遮罩 */}
      <div 
        className="fixed inset-0 bg-black/35 backdrop-blur-2xl transition-opacity animate-in fade-in duration-200 dark:bg-black/45" 
        style={{ backdropFilter: "blur(28px) saturate(115%)", WebkitBackdropFilter: "blur(28px) saturate(115%)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* 弹窗核心面板：恢复 Bento 宽屏大气格局，背景色系统一 */}
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-3xl border border-border/70 dark:border-white/10 bg-white/95 dark:bg-[#0c1220]/95 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col z-10 select-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部高质感 Header */}
        <div className="flex items-center justify-between border-b border-border/60 dark:border-white/10 px-4 py-3 sm:px-7 sm:py-5 shrink-0 bg-slate-50/70 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1 mr-2">
            {/* 桌面端保留精美凭证图标，移动端隐藏释放水平空间避免挤压换行 */}
            <div className="hidden sm:flex h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-muted/60 dark:bg-white/5 border border-border/60 dark:border-white/10 text-foreground items-center justify-center shadow-2xs shrink-0">
              <Receipt size={22} className="stroke-[2.2] text-foreground/80" />
            </div>

            <div className="min-w-0 flex-1">
              {/* 第一行：主标题 + 月份胶囊 + 存档状态 */}
              <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
                <h3 className="text-sm sm:text-lg font-black tracking-tight text-foreground truncate shrink-0">
                  结算对账凭证
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 dark:bg-white/5 border border-border/40 dark:border-white/10 text-[10px] sm:text-[11px] font-bold text-foreground font-mono shrink-0">
                  <Calendar size={10} className="text-muted-foreground" />
                  <span>{monthStr}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 dark:bg-white/5 border border-border/40 dark:border-white/10 text-[10px] sm:text-[11px] font-medium text-muted-foreground shrink-0">
                  <ShieldCheck size={10} />
                  <span>已存档</span>
                </span>
              </div>

              {/* 第二行：店铺名 + 单号快捷复制 + 归档时间 */}
              <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-1.5 text-xs text-muted-foreground min-w-0 flex-wrap sm:flex-nowrap">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 dark:bg-white/5 border border-border/40 dark:border-white/10 font-medium text-[10px] sm:text-[11px] shrink-0">
                  <Store size={10} className="text-muted-foreground/70" />
                  <span className="max-w-[110px] sm:max-w-[280px] truncate text-foreground font-semibold">
                    {primaryShopName}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyId}
                  className="inline-flex items-center gap-1 cursor-pointer rounded-full border border-border/50 bg-white/80 dark:bg-white/5 px-2 py-0.5 text-[9px] sm:text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/40 transition shadow-2xs shrink-0"
                  title="点击复制完整单据 ID"
                >
                  {copiedId ? (
                    <>
                      <Check size={9} className="text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy size={9} />
                      <span>{displayId}</span>
                    </>
                  )}
                </button>

                <span className="text-[10px] sm:text-[11px] text-muted-foreground font-mono shrink-0">
                  <span className="hidden sm:inline">· </span>归档于 {format(new Date(settlement.createdAt), "MM-dd HH:mm")}
                </span>
              </div>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 sm:p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer active:scale-95 shrink-0"
            title="关闭 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* 滚动内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-6 custom-scrollbar">
          
          {/* Bento 核心资产看板：统一色调体系，消除刺眼白光 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 左侧重点看板：最终应补差价（深邃统一沉浸质感） */}
            <div className="md:col-span-2 relative overflow-hidden rounded-3xl border border-border/60 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-5 sm:p-6 shadow-2xs flex flex-col justify-between min-h-[148px]">
              <div className="flex items-center justify-between flex-wrap gap-2">
                {/* 合并的一体化胶囊 */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/50 dark:bg-white/5 border border-border/60 dark:border-white/10 text-xs shadow-2xs">
                  <div className="inline-flex items-center gap-1.5 font-bold text-foreground text-[11px] uppercase tracking-wider">
                    <Sparkles size={12} className="text-muted-foreground" />
                    <span>最终应补差价</span>
                  </div>
                  <span className="h-3 w-px bg-border/80 dark:bg-white/10" />
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    {correctedFinalBalance >= 0 ? (
                      <>
                        <ArrowDownLeft size={12} className="text-emerald-600 dark:text-emerald-400" />
                        <span>公司向商家补差</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={12} className="text-amber-600 dark:text-amber-400" />
                        <span>商家需退补公司</span>
                      </>
                    )}
                  </span>
                </div>
                <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                  抽成率 <span className="font-mono text-foreground font-black">{(settlement.serviceFeeRate * 100).toFixed(1)}%</span>
                </span>
              </div>

              <div className="my-2.5">
                <span className="text-3xl sm:text-4xl lg:text-5xl font-mono font-black tracking-tight text-foreground">
                  {formatCurrency(correctedFinalBalance)}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-border/40 dark:border-white/5 text-xs text-muted-foreground">
                <span>真实净业绩基数：<span className="font-mono font-bold text-foreground">{formatCurrency(stats.totalNet)}</span></span>
                <span>抽成扣除：<span className="font-mono font-bold text-foreground">-{formatCurrency(correctedServiceFee)}</span></span>
              </div>
            </div>

            {/* 右侧核算三要素：完全统一卡片背景与质感，消除生硬彩块 */}
            <div className="rounded-3xl border border-border/60 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 sm:p-5 flex flex-col justify-between gap-3 shadow-2xs">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                对账核算三要素
              </div>

              <div className="space-y-2 text-xs font-mono">
                {/* 1. 总入账 */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5">
                  <span className="text-muted-foreground font-sans font-medium">账单总入账</span>
                  <span className="font-bold text-foreground">{formatCurrency(stats.totalReceived)}</span>
                </div>

                {/* 2. 扣除刷单 */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5">
                  <span className="text-muted-foreground font-sans font-medium">扣除刷单</span>
                  <span className="font-bold text-foreground">
                    {stats.totalBrushing > 0 ? `-${formatCurrency(stats.totalBrushing)}` : "¥0.00"}
                  </span>
                </div>

                {/* 3. 商家已收 */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5">
                  <span className="text-muted-foreground font-sans font-medium">商家实际已收</span>
                  <span className="font-bold text-foreground">
                    {stats.totalToCard > 0 ? `-${formatCurrency(stats.totalToCard)}` : "¥0.00"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 分平台核算明细清单 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-1 rounded-full bg-foreground/60" />
                <h4 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                  <Layers size={14} className="text-muted-foreground" />
                  分渠道核算明细
                </h4>
                <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60 dark:bg-white/5 font-mono">
                  {settlement.items.length} 个渠道
                </span>
              </div>
            </div>
            
            {/* 桌面端明细表格：真实净业绩统一为低调优雅微胶囊 */}
            <div className="hidden sm:block overflow-hidden rounded-2xl border border-border/60 dark:border-white/10 bg-slate-50/40 dark:bg-white/[0.01] shadow-2xs">
              <table className="w-full text-left min-w-[560px]">
                <thead>
                  <tr className="bg-slate-100/60 dark:bg-white/5 text-[11px] font-bold text-muted-foreground border-b border-border/40 dark:border-white/5">
                    <th className="px-5 py-3.5">结算渠道 / 平台</th>
                    <th className="px-5 py-3.5 text-right">账单入账</th>
                    <th className="px-5 py-3.5 text-right">扣除刷单</th>
                    <th className="px-5 py-3.5 text-right">商家已收</th>
                    <th className="px-5 py-3.5 text-right">真实净业绩</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 dark:divide-white/5 font-mono text-xs sm:text-sm">
                  {settlement.items.map((item) => {
                    const platformMeta = getPlatformMeta(item.platformName);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="px-5 py-3.5 font-sans font-bold text-foreground">
                          <div className="flex items-center gap-2.5">
                            {platformMeta ? (
                              <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs shrink-0", platformMeta.className)}>
                                <Image
                                  src={platformMeta.iconSrc}
                                  alt={platformMeta.name}
                                  width={14}
                                  height={14}
                                  className="h-3.5 w-3.5 object-cover rounded-xs shrink-0"
                                  unoptimized
                                />
                                <span>{platformMeta.name}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-border/60 bg-muted/40 dark:border-white/10 dark:bg-white/5 text-xs font-bold text-foreground shrink-0">
                                {item.platformName}
                              </span>
                            )}
                            {item.shopName && item.shopName !== primaryShopName && (
                              <span className="text-[10px] text-muted-foreground font-normal">
                                ({item.shopName})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-medium text-foreground">{formatCurrency(item.received)}</td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground font-medium">
                          {item.brushing > 0 ? `-${formatCurrency(item.brushing)}` : "¥0.00"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-muted-foreground font-medium">
                          {item.receivedToCard > 0 ? `-${formatCurrency(item.receivedToCard)}` : "¥0.00"}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold">
                          <span className="inline-block px-2.5 py-0.5 rounded-lg bg-muted/60 dark:bg-white/5 border border-border/40 dark:border-white/10 text-foreground font-bold">
                            {formatCurrency(item.net)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端卡片列表 */}
            <div className="sm:hidden space-y-2.5">
              {settlement.items.map((item) => {
                const platformMeta = getPlatformMeta(item.platformName);

                return (
                  <div key={item.id} className="rounded-2xl border border-border/60 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-3.5 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between border-b border-border/30 dark:border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        {platformMeta ? (
                          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border", platformMeta.className)}>
                            <Image
                              src={platformMeta.iconSrc}
                              alt={platformMeta.name}
                              width={12}
                              height={12}
                              className="h-3 w-3 object-cover rounded-xs"
                              unoptimized
                            />
                            <span>{platformMeta.name}</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-foreground">{item.platformName}</span>
                        )}
                        {item.shopName && item.shopName !== primaryShopName && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.shopName}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono font-bold text-foreground bg-muted/60 dark:bg-white/5 px-2.5 py-0.5 rounded-lg border border-border/40 dark:border-white/10">
                        {formatCurrency(item.net)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div className="bg-white/80 dark:bg-white/5 p-2 rounded-xl border border-border/40 dark:border-white/5">
                        <span className="text-[9px] text-muted-foreground block font-sans mb-0.5">账单入账</span>
                        <span className="text-xs font-bold text-foreground">{formatCurrency(item.received)}</span>
                      </div>
                      <div className="bg-white/80 dark:bg-white/5 p-2 rounded-xl border border-border/40 dark:border-white/5">
                        <span className="text-[9px] text-muted-foreground block font-sans mb-0.5">扣除刷单</span>
                        <span className="text-xs font-bold text-foreground">
                          {item.brushing > 0 ? `-${formatCurrency(item.brushing)}` : "¥0.00"}
                        </span>
                      </div>
                      <div className="bg-white/80 dark:bg-white/5 p-2 rounded-xl border border-border/40 dark:border-white/5">
                        <span className="text-[9px] text-muted-foreground block font-sans mb-0.5">商家已收</span>
                        <span className="text-xs font-bold text-foreground">
                          {item.receivedToCard > 0 ? `-${formatCurrency(item.receivedToCard)}` : "¥0.00"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 计算金额推导面板：通栏舒展展示，移除冗余占位大卡片 */}
          <div className="rounded-3xl border border-border/60 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calculator size={13} className="text-muted-foreground" />
                <span>应补差价推导核算流</span>
              </h4>
              <div className="text-[10px] text-muted-foreground font-mono bg-muted/60 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-border/40 dark:border-white/10 flex items-center gap-1">
                <span className="font-sans font-medium text-foreground/80">公式：</span>
                <span>最终应补差价 = 账单总入账 - 公司抽成 - 商家已收</span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm font-mono">
              {/* 1. 账单总入账 */}
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5 flex justify-between items-center">
                <div>
                  <span className="text-foreground font-sans font-medium flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                    账单总入账额 (到手总和)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-sans block pl-3.5 mt-0.5">
                    各渠道平台实际入账流水之和
                  </span>
                </div>
                <span className="font-bold text-foreground text-sm sm:text-base">{formatCurrency(stats.totalReceived)}</span>
              </div>

              {/* 2. 公司抽成（附带计算基数推导） */}
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2 font-sans">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    <span className="text-foreground font-medium">公司抽成</span>
                    <span className="text-[10px] bg-muted/60 dark:bg-white/5 text-muted-foreground px-1.5 py-0.5 rounded-md font-bold border border-border/40 dark:border-white/10 font-mono">
                      {(settlement.serviceFeeRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-sans block pl-3.5 mt-0.5">
                    基数：真实净业绩 {formatCurrency(stats.totalNet)} × {(settlement.serviceFeeRate * 100).toFixed(1)}%
                  </span>
                </div>
                <span className="font-bold text-foreground text-sm sm:text-base">-{formatCurrency(correctedServiceFee)}</span>
              </div>

              {/* 3. 商家实际已收 */}
              <div className="p-2.5 rounded-xl bg-white/70 dark:bg-white/5 border border-border/40 dark:border-white/5 flex justify-between items-center">
                <div>
                  <span className="text-foreground font-sans font-medium flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                    商家实际已收金额
                  </span>
                  <span className="text-[10px] text-muted-foreground font-sans block pl-3.5 mt-0.5">
                    渠道已提前结算划转给商家的款项
                  </span>
                </div>
                <span className="font-bold text-foreground text-sm sm:text-base">
                  {settlement.totalAlreadyReceived > 0 ? `-${formatCurrency(settlement.totalAlreadyReceived)}` : "¥0.00"}
                </span>
              </div>

              {/* 4. 最终应补差价（带具体代入数值展示） */}
              <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] border border-border/60 dark:border-white/10 mt-2 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-sans font-bold text-foreground flex items-center gap-1.5 text-xs sm:text-sm">
                    <Sparkles size={13} className="text-muted-foreground" />
                    <span>最终应补差价</span>
                  </span>
                  <span className="font-black text-lg sm:text-xl text-foreground">
                    {formatCurrency(correctedFinalBalance)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border/40 dark:border-white/5 flex items-center justify-between text-[11px] text-muted-foreground font-mono flex-wrap gap-1">
                  <span className="font-sans text-[10px]">核算代入算式：</span>
                  <span className="text-foreground/90 font-bold">
                    {formatCurrency(stats.totalReceived)} - {formatCurrency(correctedServiceFee)} - {formatCurrency(settlement.totalAlreadyReceived || 0)} = {formatCurrency(correctedFinalBalance)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 备注信息 */}
          {settlement.note && (
            <div className="rounded-3xl border border-border/60 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 sm:p-5 shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-foreground/60" />
                <h4 className="text-xs font-bold text-foreground">核算备注说明</h4>
              </div>
              <p className="whitespace-pre-wrap text-xs sm:text-sm text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/60 dark:border-white/10 bg-white/40 dark:bg-white/[0.02] p-3 rounded-r-xl">
                {settlement.note}
              </p>
            </div>
          )}
        </div>

        {/* 底部 Footer */}
        <div className="border-t border-border/60 dark:border-white/10 px-5 py-4 sm:px-7 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 dark:bg-white/[0.02] shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>支持快捷键</span>
            <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 font-mono text-[10px]">Esc</kbd>
            <span>直接关闭</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCopySummary}
              className="flex-1 sm:flex-initial h-10 px-5 rounded-full border border-border/60 bg-white dark:bg-white/5 text-foreground font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-white/10 transition active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center gap-2"
              title="一键复制对账单文本摘要，可直接发送微信/钉钉"
            >
              {copiedSummary ? <Check size={14} className="text-emerald-500" /> : <Share2 size={14} className="text-muted-foreground" />}
              <span>{copiedSummary ? "摘要已复制" : "复制对账摘要"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial h-10 px-7 rounded-full bg-zinc-900 text-white dark:bg-white/10 dark:hover:bg-white/15 dark:border dark:border-white/15 dark:text-zinc-100 font-bold text-xs sm:text-sm hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <span>确认并关闭</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

