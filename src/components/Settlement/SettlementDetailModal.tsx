"use client";

import { FileText, TrendingUp, X, Receipt, Wallet, Calendar } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Settlement } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

interface SettlementDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  settlement: Settlement | null;
}

const formatCurrency = (value: number) =>
  `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SettlementDetailModal({ isOpen, onClose, settlement }: SettlementDetailModalProps) {
  const { showToast } = useToast();

  if (!isOpen || !settlement) return null;

  const stats = {
    totalReceived: settlement.items.reduce((sum, item) => sum + item.received, 0),
    totalBrushing: settlement.items.reduce((sum, item) => sum + item.brushing, 0),
    totalToCard: settlement.items.reduce((sum, item) => sum + item.receivedToCard, 0),
  };


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl h-full sm:h-auto sm:max-h-[90vh] overflow-hidden sm:rounded-[32px] border-t sm:border border-border bg-white dark:bg-gray-950/90 dark:border-white/10 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border dark:border-white/10 p-5 sm:p-8 shrink-0 bg-white/50 dark:bg-white/5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="rounded-2xl bg-primary/10 p-2 sm:p-2.5 text-primary">
              <FileText size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="text-lg sm:text-2xl font-bold tracking-tight">结算单详情</h3>
              <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                <span className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-widest font-black">
                  RECORD ID: {settlement.id.slice(-8).toUpperCase()}
                </span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                <span className="text-[9px] sm:text-[10px] text-primary/70 font-bold uppercase tracking-widest">
                  Verified
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 sm:p-2.5 hover:bg-muted dark:hover:bg-white/10 rounded-full transition-all text-muted-foreground hover:text-foreground active:scale-90">
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 sm:space-y-8 scrollbar-none">
          {/* Top Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-border dark:border-white/10 bg-white/50 dark:bg-white/5 p-3 sm:p-4 backdrop-blur-md shadow-sm transition-all hover:bg-white/80 dark:hover:bg-white/10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">账单到手</span>
                <Receipt size={12} className="text-muted-foreground/40 sm:w-4 sm:h-4" />
              </div>
              <div className="text-sm sm:text-xl font-black text-foreground">{formatCurrency(stats.totalReceived)}</div>
            </div>
            <div className="rounded-2xl border border-border dark:border-white/10 bg-white/50 dark:bg-white/5 p-3 sm:p-4 backdrop-blur-md shadow-sm transition-all hover:bg-white/80 dark:hover:bg-white/10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">扣除刷单</span>
                <X size={12} className="text-orange-500/40 sm:w-4 sm:h-4" />
              </div>
              <div className="text-sm sm:text-xl font-black text-orange-500">{formatCurrency(stats.totalBrushing)}</div>
            </div>
            <div className="rounded-2xl border border-border dark:border-white/10 bg-white/50 dark:bg-white/5 p-3 sm:p-4 backdrop-blur-md shadow-sm transition-all hover:bg-white/80 dark:hover:bg-white/10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-muted-foreground">已打款到卡</span>
                <Wallet size={12} className="text-blue-500/40 sm:w-4 sm:h-4" />
              </div>
              <div className="text-sm sm:text-xl font-black text-blue-500 dark:text-blue-400">{formatCurrency(stats.totalToCard)}</div>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4 backdrop-blur-md shadow-sm ring-1 ring-primary/10 transition-all hover:bg-primary/10">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-primary/70">真实业绩</span>
                <TrendingUp size={12} className="text-primary/40 sm:w-4 sm:h-4" />
              </div>
              <div className="text-sm sm:text-xl font-black text-primary">{formatCurrency(settlement.totalNet)}</div>
            </div>
          </div>

          {/* Details Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1 rounded-full bg-primary" />
                <h4 className="font-black tracking-tight text-sm sm:text-base">平台明细</h4>
              </div>
            </div>
            
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-hidden rounded-[24px] border border-border dark:border-white/10 dark:bg-white/5 overflow-x-auto shadow-inner">
              <table className="w-full text-left min-w-[600px]">
                <thead>
                  <tr className="bg-muted/30 text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:bg-white/5 border-b border-border dark:border-white/10">
                    <th className="px-6 py-4">店铺 / 平台</th>
                    <th className="px-6 py-4 text-right">账单到手</th>
                    <th className="px-6 py-4 text-right">扣除刷单</th>
                    <th className="px-6 py-4 text-right text-blue-500">已打到卡</th>
                    <th className="px-6 py-4 text-right text-primary">真实业绩</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-white/5 font-mono text-sm">
                  {settlement.items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 dark:hover:bg-white/10 transition-colors group">
                      <td className="px-6 py-4 font-sans font-bold text-foreground">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground/60 group-hover:text-primary/70 transition-colors uppercase font-black">{item.shopName || "未指定"}</span>
                          <span className="text-sm">{item.platformName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums font-medium">{formatCurrency(item.received)}</td>
                      <td className="px-6 py-4 text-right text-orange-500 tabular-nums font-medium">{formatCurrency(item.brushing)}</td>
                      <td className="px-6 py-4 text-right text-blue-500 dark:text-blue-400 tabular-nums font-medium">{formatCurrency(item.receivedToCard)}</td>
                      <td className="px-6 py-4 text-right font-black text-primary tabular-nums">{formatCurrency(item.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="sm:hidden space-y-3">
              {settlement.items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border dark:border-white/10 bg-white/50 dark:bg-white/5 p-4 shadow-sm relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3 border-b border-border/50 dark:border-white/5 pb-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground/60 uppercase font-black">{item.shopName || "未指定"}</span>
                      <span className="text-sm font-bold text-foreground">{item.platformName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] text-primary/70 uppercase font-black block leading-none mb-0.5">真实业绩</span>
                      <span className="text-sm font-black text-primary">{formatCurrency(item.net)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[8px] text-muted-foreground uppercase font-bold block mb-1">账单到手</span>
                      <span className="text-[11px] font-bold text-foreground/80">{formatCurrency(item.received)}</span>
                    </div>
                    <div className="text-center">
                      <span className="text-[8px] text-muted-foreground uppercase font-bold block mb-1">扣除刷单</span>
                      <span className="text-[11px] font-bold text-orange-500">{formatCurrency(item.brushing)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] text-muted-foreground uppercase font-bold block mb-1">已打到卡</span>
                      <span className="text-[11px] font-bold text-blue-500">{formatCurrency(item.receivedToCard)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Calculation and Meta Grid */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_300px]">
            <div className="rounded-2xl border border-border dark:border-white/10 bg-muted/20 p-4 sm:p-6 dark:bg-white/5 relative group overflow-hidden">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">金额推导过程</h4>
              <div className="space-y-3 sm:space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">合计真实总业绩</span>
                  <span className="font-black text-foreground">{formatCurrency(settlement.totalNet)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground font-medium">平台服务抽成</span>
                    <span className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded font-bold">
                      {(settlement.serviceFeeRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <span className="font-bold text-orange-500">-{formatCurrency(settlement.serviceFee)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">已打款到卡 (本人账户)</span>
                  <span className="font-bold text-blue-500">-{formatCurrency(settlement.totalAlreadyReceived)}</span>
                </div>
                <div className="pt-4 border-t border-border dark:border-white/10 flex justify-between items-end">
                  <div className="flex flex-col">
                      <span className="text-[9px] font-black text-primary/70 uppercase tracking-tighter">FINAL SETTLEMENT</span>
                      <span className="text-base sm:text-lg font-black text-foreground leading-tight">最终结算补差</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl sm:text-4xl font-black text-primary tracking-tighter drop-shadow-sm transition-all group-hover:scale-105 origin-right">
                      {formatCurrency(settlement.finalBalance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-primary/5 p-6 flex flex-col justify-center text-center dark:bg-white/5 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 transition-transform group-hover:scale-110 duration-500">
                <TrendingUp size={100} />
              </div>
              <div className="relative z-10 space-y-4">
                <div>
                  <Calendar size={20} className="mx-auto text-primary mb-2" />
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">结算月份</div>
                  <div className="text-xl font-black text-foreground">{format(new Date(settlement.date), "yyyy年MM月", { locale: zhCN })}</div>
                </div>
                <div className="pt-4 border-t border-primary/10">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">记录生成时间</div>
                  <div className="text-xs font-mono text-muted-foreground/80">{format(new Date(settlement.createdAt), "yyyy-MM-dd HH:mm")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {settlement.note && (
            <div className="rounded-2xl border border-border dark:border-white/10 bg-white/30 p-5 dark:bg-white/2 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">备注说明</h4>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 italic">{settlement.note}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border dark:border-white/10 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-end gap-3 bg-gray-50/30 dark:bg-white/2 shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-12 py-3.5 rounded-full bg-primary text-primary-foreground font-black shadow-xl shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all text-sm tracking-wide"
          >
            确认并关闭详情
          </button>
        </div>
      </div>
    </div>
  );
}
