"use client";

import { useState, useMemo } from "react";
import { Wallet, Info, RefreshCw, Receipt, History, Save, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PlatformData {
  id: string;
  name: string;
  received: number; // 账面到手 (A)
  brushing: number; // 刷单到手
  receivedToCard: number; // 已结账
}

export default function SettlementPage() {
  const [platforms, setPlatforms] = useState<PlatformData[]>([
    { id: "mt", name: "美团闪购", received: 0, brushing: 0, receivedToCard: 0 },
    { id: "jd", name: "京东秒送", received: 0, brushing: 0, receivedToCard: 0 },
    { id: "tb", name: "淘宝闪购", received: 0, brushing: 0, receivedToCard: 0 },
  ]);

  const { showToast } = useToast();
  const router = useRouter();

  const [serviceFeeRate, setServiceFeeRate] = useState(0.06);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // 计算逻辑
  const stats = useMemo(() => {
    const platformResults = platforms.map(p => ({
      ...p,
      net: p.received - p.brushing
    }));

    const totalNet = platformResults.reduce((sum, p) => sum + p.net, 0);
    const serviceFee = totalNet * serviceFeeRate;
    
    // 计算已到账款项对应的“业绩”部分，避免重复扣除刷单成本
    const totalAlreadyReceivedNet = platforms.reduce((sum, p) => {
      if (p.received <= 0) return sum;
      // 按比例计算到账金额中包含的“真实业绩”
      const netPortion = (p.receivedToCard / p.received) * (p.received - p.brushing);
      return sum + netPortion;
    }, 0);

    // 最终结算：(总真业绩 - 内部扣点) - 已到账业绩部分
    const finalBalance = totalNet - serviceFee - totalAlreadyReceivedNet;

    return {
      platformResults,
      totalNet,
      serviceFee,
      totalAlreadyReceived: totalAlreadyReceivedNet,
      finalBalance
    };
  }, [platforms, serviceFeeRate]);

  const handleInputChange = (id: string, field: 'received' | 'brushing' | 'receivedToCard', value: string) => {
    const numValue = parseFloat(value) || 0;
    setPlatforms(prev => prev.map(p => p.id === id ? { ...p, [field]: numValue } : p));
  };

  const resetData = () => {
    setPlatforms(prev => prev.map(p => ({ ...p, received: 0, brushing: 0, receivedToCard: 0 })));
    showToast("结算数据已重置清空", "success");
  };

  const saveSettlement = async () => {
    if (stats.totalNet === 0) {
      showToast("无可保存的结算数据", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(),
          totalNet: stats.totalNet,
          serviceFeeRate,
          serviceFee: stats.serviceFee,
          totalAlreadyReceived: stats.totalAlreadyReceived,
          finalBalance: stats.finalBalance,
          note: note,
          items: stats.platformResults.map(p => ({
            name: p.name,
            received: p.received,
            brushing: p.brushing,
            receivedToCard: p.receivedToCard,
            net: p.net
          }))
        })
      });

      if (!response.ok) throw new Error("保存失败");
      
      showToast("结算单已存入历史记录", "success");
      router.refresh();
    } catch (error) {
      console.error(error);
      showToast("保存失败，请重试", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 relative">
        <div className="flex-1 min-w-0 pr-24 md:pr-0">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">
            结算计算器
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">
            分平台剔除刷单，严谨核算每月真实净业绩。
          </p>
        </div>
        
        <div className="flex items-center gap-3 absolute top-0 right-0 md:relative">
          <Link 
            href="/settlement/history"
            className="flex items-center justify-center gap-2 h-10 w-10 md:w-auto md:px-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted transition-all active:scale-95 text-sm font-medium"
            title="历史记录"
          >
            <History size={16} className="md:w-3.5 md:h-3.5" />
            <span className="hidden md:inline">历史记录</span>
          </Link>
          <button 
            onClick={resetData}
            className="flex items-center justify-center gap-2 h-10 w-10 md:w-auto md:px-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted transition-all active:scale-95 text-sm font-medium"
            title="重置数据"
          >
            <RefreshCw size={16} className="md:w-3.5 md:h-3.5" />
            <span className="hidden md:inline">重置数据</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        {/* Data Entry Section */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border/50 bg-muted/5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Receipt className="text-primary" size={20} />
                账目明细录入
              </h2>
            </div>
            
            {/* Desktop View: Professional Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-muted/10">
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">平台名称</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-right min-w-[180px]">账单到手 (A)</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-right min-w-[180px]">刷单到手</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-right min-w-[180px]">已结账</th>
                    <th className="px-6 py-4 text-xs font-bold text-primary uppercase tracking-wider whitespace-nowrap text-right">真实业绩 (A-B)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {platforms.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/5 transition-colors">
                      <td className="px-6 py-4 font-bold text-foreground whitespace-nowrap">{p.name}</td>
                      <td className="px-6 py-4 text-right min-w-[180px]">
                        <div className="relative inline-block w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                          <input 
                            type="number"
                            value={p.received || ""}
                            onChange={(e) => handleInputChange(p.id, 'received', e.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm text-right font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right min-w-[180px]">
                        <div className="relative inline-block w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                          <input 
                            type="number"
                            value={p.brushing || ""}
                            onChange={(e) => handleInputChange(p.id, 'brushing', e.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm text-right font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right min-w-[180px]">
                        <div className="relative inline-block w-full">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                          <input 
                            type="number"
                            value={p.receivedToCard || ""}
                            onChange={(e) => handleInputChange(p.id, 'receivedToCard', e.target.value)}
                            placeholder="0.00"
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-orange-500/5 border border-orange-500/20 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-mono text-sm outline-none placeholder:text-muted-foreground/30 text-rose-500 font-bold text-right"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono font-bold text-primary text-lg">
                          ¥{(p.received - p.brushing).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/10 dark:bg-white/5 border-t border-border">
                    <td className="px-6 py-6 font-bold text-muted-foreground whitespace-nowrap">合计汇总</td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider mb-1">总账单 (A)</span>
                        <span className="font-mono font-bold text-foreground text-lg">
                          ¥{platforms.reduce((sum, p) => sum + p.received, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider mb-1">总刷单 (B)</span>
                        <span className="font-mono font-bold text-orange-500 text-lg">
                          ¥{platforms.reduce((sum, p) => sum + p.brushing, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6 text-right">
                      {stats.totalAlreadyReceived > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider mb-1">已到账业绩部分</span>
                          <span className="font-mono font-bold text-rose-500/80 text-sm">
                            ¥{stats.totalAlreadyReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-6 text-right bg-primary/3">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-primary tracking-widest mb-1.5">总真业绩合计</span>
                        <span className="font-mono font-black text-primary text-2xl tracking-tight">
                          ¥{stats.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile View: Card-based Entry */}
            <div className="md:hidden divide-y divide-border/50">
              {platforms.map((p) => (
                <div key={p.id} className="p-4 space-y-4 hover:bg-muted/5 transition-colors">
                  <div className="flex justify-between items-center px-1">
                    <span className="font-bold text-lg text-foreground">{p.name}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">真实业绩</span>
                      <span className="font-mono font-bold text-primary">
                        ¥{(p.received - p.brushing).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground px-1">账单实到 (A)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                        <input 
                          type="number"
                          value={p.received || ""}
                          onChange={(e) => handleInputChange(p.id, 'received', e.target.value)}
                          className="w-full h-11 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm font-bold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground px-1">刷单到手</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                        <input 
                          type="number"
                          value={p.brushing || ""}
                          onChange={(e) => handleInputChange(p.id, 'brushing', e.target.value)}
                          className="w-full h-11 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm font-bold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-bold text-orange-600 dark:text-orange-500 px-1">已结账</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                      <input 
                        type="number"
                        value={p.receivedToCard || ""}
                        onChange={(e) => handleInputChange(p.id, 'receivedToCard', e.target.value)}
                        placeholder="输入已到账额度"
                        className="w-full h-11 pl-7 pr-3 rounded-xl bg-orange-500/5 border border-orange-500/20 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all font-mono text-sm outline-none placeholder:text-muted-foreground/30 text-rose-500 font-bold"
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Mobile Summary Row */}
               <div className="p-6 bg-muted/20 dark:bg-white/5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">总账单 (A)</span>
                    <p className="font-mono font-bold text-foreground">¥{platforms.reduce((sum, p) => sum + p.received, 0).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">总刷单 (B)</span>
                    <p className="font-mono font-bold text-orange-500">¥{platforms.reduce((sum, p) => sum + p.brushing, 0).toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-border flex justify-between items-end">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-primary tracking-widest mb-1">合计净业绩汇总</span>
                    <span className="font-mono font-black text-primary text-3xl leading-none tracking-tight">
                      ¥{stats.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {stats.totalAlreadyReceived > 0 && (
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-bold text-rose-500 mb-1">已到账部分: -¥{stats.totalAlreadyReceived.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Result Summary Section */}
        <div className="space-y-6">
          <div className="relative mb-20">
            <div className="rounded-3xl p-8 bg-white dark:bg-white/5 text-foreground border border-border shadow-xl relative overflow-hidden flex flex-col min-h-[500px]">
              {/* 背景装饰 */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none" />

              <div className="relative z-10 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-6">
                   <Wallet size={20} className="text-primary" />
                   <span className="text-sm font-black uppercase tracking-widest text-muted-foreground dark:text-white/60">最终本期补款/应得</span>
                </div>
                
                {/* 核心大数字前置 */}
                <div className="mb-10">
                  <h3 className="text-5xl sm:text-6xl font-black tracking-tighter dark:text-white font-number text-primary drop-shadow-sm">
                     ¥{stats.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                </div>

                {/* 扣费明细流水 */}
                <div className="space-y-4 bg-muted/20 dark:bg-black/20 p-5 rounded-2xl border border-border/50 backdrop-blur-sm">
                   <div className="flex justify-between items-center">
                     <span className="text-sm font-bold text-muted-foreground">合计真实总业绩</span>
                     <span className="font-mono font-black text-lg text-foreground">¥{stats.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                   </div>
                   
                   {/* Render individual platform nets here */}
                   {stats.platformResults.some(p => p.net > 0) && (
                     <div className="space-y-2 mt-4 pt-4 border-t border-border/50">
                       {stats.platformResults.filter(p => p.net > 0).map(p => (
                         <div key={p.id} className="flex justify-between items-center text-xs">
                           <span className="text-muted-foreground">{p.name} 真实业绩</span>
                           <span className="font-mono text-foreground font-medium">¥{p.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                         </div>
                       ))}
                     </div>
                   )}
                   
                   <div className="h-px bg-border/50 w-full mt-4" />

                   <div className="space-y-3">
                       <div className="flex justify-between items-center group">
                         <div className="flex items-center gap-1.5 shrink-0">
                           <span className="text-xs sm:text-sm font-bold text-muted-foreground whitespace-nowrap">扣除平台服务费</span>
                           <CustomSelect 
                              value={serviceFeeRate.toString()}
                              onChange={(val) => setServiceFeeRate(parseFloat(val))}
                              options={[
                                { value: "0.05", label: "5.0%" },
                                { value: "0.06", label: "6.0%" },
                                { value: "0.07", label: "7.0%" },
                                { value: "0.08", label: "8.0%" },
                              ]}
                              className="w-20 h-7 opacity-70 hover:opacity-100 transition-opacity"
                              triggerClassName="h-full text-xs font-bold py-0"
                            />
                         </div>
                         <span className="font-mono font-bold text-orange-500 text-sm whitespace-nowrap pl-2">
                           -¥{stats.serviceFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </span>
                       </div>

                     {stats.totalAlreadyReceived > 0 && (
                       <div className="flex justify-between items-center">
                         <span className="text-sm font-bold text-muted-foreground">扣除已打款部分</span>
                         <span className="font-mono font-bold text-rose-500 text-sm">
                           -¥{stats.totalAlreadyReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </span>
                       </div>
                     )}
                   </div>
                </div>

                <div className="mt-auto pt-8">
                    <div className="mb-4">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="添加备注（选填）"
                        className="w-full h-20 p-4 text-sm rounded-2xl bg-muted/30 border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none resize-none placeholder:text-muted-foreground/50"
                      />
                    </div>
                    
                    <button                      onClick={saveSettlement}
                      disabled={isSaving || stats.totalNet === 0}
                      className="w-full mt-6 h-14 rounded-2xl bg-primary text-primary-foreground font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:translate-y-0 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isSaving ? (
                        <Loader2 size={24} className="animate-spin" />
                      ) : (
                        <Save size={24} />
                      )}
                      保存此结算单
                    </button>

                    <p className="text-[10px] text-muted-foreground dark:text-white/30 mt-4 font-medium leading-relaxed">
                      * 基于分平台剔除刷单逻辑自动核算，并可保存至历史记录中随时查阅。
                    </p>
                </div>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="mt-6 p-6 rounded-3xl border border-primary/20 bg-primary/5 dark:bg-primary/10">
              <h4 className="text-sm font-bold text-primary flex items-center gap-2 mb-2">
                <Info size={16} />
                对账小贴士
              </h4>
              <ul className="text-xs text-muted-foreground space-y-2 font-medium">
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>严谨模式：分平台计算能看清每个平台的真实收益贡献。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>实时预览：输入框变动即刻触发全局重新计算。</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>扣点变更：支持手动调整扣点费率（默认为 6%）。</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
