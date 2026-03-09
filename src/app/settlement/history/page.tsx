"use client";

import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Trash2, 
  Calendar, 
  ChevronRight, 
  FileText,
  Loader2,
  Receipt,
  TrendingUp,
  Download
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import * as XLSX from 'xlsx';
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface SettlementItem {
  id: string;
  platformName: string;
  received: number;
  brushing: number;
  receivedToCard: number;
  net: number;
}

interface Settlement {
  id: string;
  date: string;
  totalNet: number;
  serviceFeeRate: number;
  serviceFee: number;
  totalAlreadyReceived: number;
  finalBalance: number;
  note: string | null;
  items: SettlementItem[];
  createdAt: string;
}

export default function SettlementHistoryPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { showToast } = useToast();

  useEffect(() => {
    fetchSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/settlements");
      if (!res.ok) throw new Error("获取历史记录失败");
      const result = await res.json();
      setSettlements(result.data);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/settlements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      
      setSettlements(prev => prev.filter(s => s.id !== id));
      if (selectedSettlement?.id === id) setSelectedSettlement(null);
      showToast("记录已删除", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const exportToExcel = (settlement: Settlement) => {
    try {
      showToast("正在生成报表...", "info");
      
      // 1. 准备核心数据
      const wb = XLSX.utils.book_new();
      
      // 平台明细表
      const itemData = settlement.items.map(item => ({
        "平台名称": item.platformName,
        "账单到手": item.received,
        "扣除刷单": item.brushing,
        "已打款到卡": item.receivedToCard,
        "真实业绩": item.net
      }));
      // 添加总计行
      itemData.push({
        "平台名称": "总计",
        "账单到手": settlement.items.reduce((s, i) => s + i.received, 0),
        "扣除刷单": settlement.items.reduce((s, i) => s + i.brushing, 0),
        "已打款到卡": settlement.items.reduce((s, i) => s + i.receivedToCard, 0),
        "真实业绩": settlement.totalNet
      });
      
      const wsItems = XLSX.utils.json_to_sheet(itemData);
      XLSX.utils.book_append_sheet(wb, wsItems, "平台明细");
      
      // 结算摘要表
      const summaryData = [
        { "项目": "业务日期", "数值": format(new Date(settlement.date), 'yyyy-MM-dd') },
        { "项目": "合计：账单到手 (A)", "数值": settlement.items.reduce((s, i) => s + i.received, 0) },
        { "项目": "合计：刷单到手 (B)", "数值": settlement.items.reduce((s, i) => s + i.brushing, 0) },
        { "项目": "合计：已打本人卡 (A3)", "数值": settlement.items.reduce((s, i) => s + i.receivedToCard, 0) },
        { "项目": "---", "数值": "---" },
        { "项目": "合计真实总业绩", "数值": settlement.totalNet },
        { "项目": `平台服务费 (${(settlement.serviceFeeRate * 100).toFixed(1)}%)`, "数值": settlement.serviceFee },
        { "项目": "已到账业绩部分 (扣除)", "数值": settlement.totalAlreadyReceived },
        { "项目": "最终实补 / 应得", "数值": settlement.finalBalance },
        { "项目": "备注说明", "数值": settlement.note || "无" }
      ];
      
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "对账摘要");
      
      // 2. 导出文件
      const fileName = `结算对账单_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      showToast("报表导出成功", "success");
    } catch (err) {
      console.error(err);
      showToast("导出失败，请重试", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="text-muted-foreground animate-pulse">正在加载历史记录...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/settlement"
          className="p-2 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted transition-all"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">结算历史</h1>
          <p className="text-sm text-muted-foreground mt-1">查看并管理往期保存的结算单据</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* List Column */}
        <div className={`${selectedSettlement ? 'lg:col-span-12 xl:col-span-4' : 'lg:col-span-12'} space-y-4`}>
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-white/5 rounded-3xl border border-dashed border-border/50 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Receipt className="text-muted-foreground/50" />
              </div>
              <h3 className="font-bold text-foreground">暂无历史记录</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-6">您保存的结算单将出现在这里</p>
              <Link href="/settlement" className="text-sm font-bold text-primary hover:underline">去计算并保存第一单</Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
              {settlements.map((s) => (
                <div 
                  key={s.id}
                  onClick={() => setSelectedSettlement(s)}
                  className={`group relative p-4 rounded-2xl border transition-all cursor-pointer ${
                    selectedSettlement?.id === s.id 
                    ? 'bg-primary/5 border-primary shadow-lg shadow-primary/5 ring-1 ring-primary/20' 
                    : 'bg-white dark:bg-white/5 border-border hover:border-primary/50'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Section: Date & Note */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-muted-foreground shrink-0" />
                          <span className="text-sm font-bold text-foreground">
                            {format(new Date(s.date), 'yyyy年MM月dd日', { locale: zhCN })}
                          </span>
                        </div>
                        {s.note && (
                          <div className="pl-5">
                            <p className="text-xs text-muted-foreground font-medium leading-relaxed wrap-break-word">
                              {s.note}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 pt-0.5">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Section: Amount & Action */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      <div className="flex gap-8">
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-black text-muted-foreground tracking-widest opacity-50 mb-0.5">总真业绩 (A-B)</span>
                          <span className="text-sm font-bold text-muted-foreground font-mono leading-none">
                            ¥{s.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] uppercase font-black text-muted-foreground tracking-widest opacity-50 mb-0.5">最终结算金额</span>
                          <span className="text-lg font-black text-foreground font-mono leading-none">
                            ¥{s.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                      
                      <button 
                        onClick={(e) => handleDeleteClick(s.id, e)}
                        disabled={deletingId === s.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      >
                        {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Column */}
        {selectedSettlement && (
          <div className="lg:col-span-12 xl:col-span-8 space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-xl">
              <div className="p-4 sm:p-6 border-b border-border/50 bg-primary/5 flex justify-between items-center">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <FileText size={18} className="sm:size-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-sm sm:text-lg truncate">结算单详情</h2>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest truncate">
                      ID: {selectedSettlement.id.slice(-8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 text-right">
                  <div className="hidden xs:block">
                    <p className="text-[10px] font-bold text-primary">保存时间</p>
                    <p className="text-xs sm:text-sm font-mono opacity-80">{format(new Date(selectedSettlement.createdAt), 'yyyy-MM-dd HH:mm')}</p>
                  </div>
                  <div className="hidden xs:block w-px h-6 sm:h-8 bg-border/50 mx-1 sm:mx-2" />
                  <button 
                    onClick={() => exportToExcel(selectedSettlement)}
                    className="flex flex-col items-center justify-center p-1.5 sm:p-2 rounded-xl hover:bg-white dark:hover:bg-white/10 transition-colors text-primary"
                    title="导出为 Excel"
                  >
                    <Download size={18} className="sm:size-5" />
                    <span className="text-[9px] sm:text-[10px] font-bold mt-1">导出</span>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Items Detail Section (Responsive) */}
                <div className="rounded-2xl border border-border overflow-hidden">
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted/30">
                          <th className="px-5 py-3 text-[10px] font-black uppercase text-muted-foreground whitespace-nowrap">平台</th>
                          <th className="px-5 py-3 text-[10px] font-black uppercase text-muted-foreground text-right border-x border-border/50 whitespace-nowrap">账单到手</th>
                          <th className="px-5 py-3 text-[10px] font-black uppercase text-muted-foreground text-right border-x border-border/50 whitespace-nowrap">扣除刷单</th>
                          <th className="px-5 py-3 text-[10px] font-black uppercase text-muted-foreground text-right border-x border-border/50 whitespace-nowrap">已打本人卡</th>
                          <th className="px-5 py-3 text-[10px] font-black uppercase text-primary text-right whitespace-nowrap">真实业绩</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedSettlement.items.map((item) => (
                          <tr key={item.id} className="hover:bg-muted/5 font-mono text-sm leading-8 transition-colors">
                            <td className="px-5 py-2 font-black text-foreground whitespace-nowrap">{item.platformName}</td>
                            <td className="px-5 py-2 text-right border-x border-border/30">¥{item.received.toLocaleString()}</td>
                            <td className="px-5 py-2 text-right border-x border-border/30 text-orange-500">¥{item.brushing.toLocaleString()}</td>
                            <td className="px-5 py-2 text-right border-x border-border/30 text-rose-500">¥{item.receivedToCard.toLocaleString()}</td>
                            <td className="px-5 py-2 text-right font-black text-primary">¥{item.net.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="bg-primary/5 font-mono font-black">
                          <td className="px-5 py-4 text-primary">总计汇总</td>
                          <td className="px-5 py-4 text-right">¥{selectedSettlement.items.reduce((s, i) => s + i.received, 0).toLocaleString()}</td>
                          <td className="px-5 py-4 text-right text-orange-500">¥{selectedSettlement.items.reduce((s, i) => s + i.brushing, 0).toLocaleString()}</td>
                          <td className="px-5 py-4 text-right text-rose-500">¥{selectedSettlement.items.reduce((s, i) => s + i.receivedToCard, 0).toLocaleString()}</td>
                          <td className="px-5 py-4 text-right text-primary text-xl tracking-tight">¥{selectedSettlement.totalNet.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card List View */}
                  <div className="md:hidden divide-y divide-border/50">
                    {selectedSettlement.items.map((item) => (
                      <div key={item.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-black text-foreground">{item.platformName}</span>
                          <span className="font-mono font-black text-primary px-2 py-0.5 rounded-lg bg-primary/10">¥{item.net.toLocaleString()}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] font-bold">
                          <div className="flex flex-col">
                            <span className="text-muted-foreground/60 uppercase mb-0.5">账单到手</span>
                            <span className="font-mono text-sm">¥{item.received.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-muted-foreground/60 uppercase mb-0.5">扣除刷单</span>
                            <span className="font-mono text-sm text-orange-500">¥{item.brushing.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-muted-foreground/60 uppercase mb-0.5">已打卡</span>
                            <span className="font-mono text-sm text-rose-500">¥{item.receivedToCard.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Mobile Total Row */}
                    <div className="p-4 bg-primary/5 flex justify-between items-end border-t border-primary/10">
                      <span className="text-xs font-black text-primary uppercase">真业绩总计 (A-B)</span>
                      <span className="font-mono font-black text-2xl text-primary tracking-tight leading-none">
                        ¥{selectedSettlement.totalNet.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calculation Summary */}
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="p-5 rounded-2xl bg-muted/10 border border-border/50 space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">补款/回款推导</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-muted-foreground">总真业绩明细</span>
                        <span className="font-mono text-foreground">¥{selectedSettlement.totalNet.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-muted-foreground">服务费 ({(selectedSettlement.serviceFeeRate * 100).toFixed(1)}%)</span>
                        <span className="font-mono text-orange-500">-¥{selectedSettlement.serviceFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold">
                        <span className="text-muted-foreground">已到账业绩部分</span>
                        <span className="font-mono text-rose-500">-¥{selectedSettlement.totalAlreadyReceived.toLocaleString()}</span>
                      </div>
                      <div className="pt-3 border-t border-border flex justify-between items-center">
                        <span className="font-black text-lg">最终实补</span>
                        <span className="font-mono font-black text-2xl text-primary">¥{selectedSettlement.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center items-center p-6 rounded-2xl bg-primary/5 border border-primary/20 bg-linear-to-br from-primary/5 to-purple-500/5 text-center">
                    <TrendingUp className="text-primary mb-3" size={32} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">本单综合盈余</p>
                    <h4 className="text-3xl font-black text-primary font-mono leading-none">
                      ¥{selectedSettlement.finalBalance.toLocaleString()}
                    </h4>
                    <p className="mt-4 text-[10px] text-muted-foreground/60 leading-relaxed max-w-[200px]">
                      此报表基于历史录入数据快照，删除记录不会影响当前计算。
                    </p>
                  </div>
                </div>

                {/* Notes Section */}
                {selectedSettlement.note && (
                  <div className="p-5 rounded-2xl bg-muted/20 border border-border/30">
                    <h3 className="text-xs font-bold text-primary mb-2 flex items-center gap-2">
                      <FileText size={14} />
                      附加备注说明
                    </h3>
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {selectedSettlement.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="确认删除"
        message="确定要永久删除这条结算记录吗？此操作不可撤销。"
        confirmLabel="确定删除"
        cancelLabel="取消"
        variant="danger"
      />
    </div>
  );
}

