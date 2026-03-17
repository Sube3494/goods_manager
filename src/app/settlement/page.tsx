"use client";

import { useState, useMemo, useEffect } from "react";
import { Wallet, RefreshCw, Receipt, History, Save, Loader2, Store } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { User } from "@/lib/types";

interface PlatformData {
  id: string;
  shopName: string;
  platformName: string;
  serviceFeeRate: number;
  received: number; // 账面到手 (A)
  brushing: number; // 刷单到手
  receivedToCard: number; // 已结账
}

const DEFAULT_PLATFORMS = ["美团闪购", "京东秒送", "淘宝闪购"];

export default function SettlementPage() {
  const { user, isLoading: userLoading } = useUser();
  const shops = useMemo(() => (user as unknown as User)?.shippingAddresses || [], [user]);
  const { showToast } = useToast();
  const router = useRouter();
  const canManage = hasPermission(user as SessionUser | null, "settlement:manage");

  // 多选店铺状态 (存储选中的店铺标签)
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  
  // 核心数据状态：基于 (店铺 + 平台) 动态生成的行
  const [entries, setEntries] = useState<PlatformData[]>([]);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // 当选中的店铺变化时，同步 entries
  useEffect(() => {
    if (selectedShops.length === 0) {
      setEntries([]);
      return;
    }

    setEntries(prev => {
      const newEntries: PlatformData[] = [];
      
      selectedShops.forEach(shopLabel => {
        const shopInfo = shops.find(s => s.label === shopLabel);
        const rate = shopInfo?.serviceFeeRate ?? 0.06;
        
        DEFAULT_PLATFORMS.forEach(pName => {
          const entryId = `${shopLabel}-${pName}`;
          // 尝试保留已有数据
          const existing = prev.find(e => e.id === entryId);
          if (existing) {
            newEntries.push({ ...existing, serviceFeeRate: rate });
          } else {
            newEntries.push({
              id: entryId,
              shopName: shopLabel,
              platformName: pName,
              serviceFeeRate: rate,
              received: 0,
              brushing: 0,
              receivedToCard: 0
            });
          }
        });
      });
      
      return newEntries;
    });
  }, [selectedShops, shops]);

  // 计算逻辑
  const stats = useMemo(() => {
    const list = entries.map(e => ({
      ...e,
      net: e.received - e.brushing,
      fee: (e.received - e.brushing) * e.serviceFeeRate
    }));

    const totalNet = list.reduce((sum, e) => sum + e.net, 0);
    const totalServiceFee = list.reduce((sum, e) => sum + e.fee, 0);
    
    // 计算已到账业绩部分
    const totalAlreadyReceivedNet = list.reduce((sum, e) => {
      if (e.received <= 0) return sum;
      return sum + (e.receivedToCard / e.received) * e.net;
    }, 0);

    const finalBalance = totalNet - totalServiceFee - totalAlreadyReceivedNet;

    return {
      list,
      totalNet,
      totalServiceFee,
      totalAlreadyReceived: totalAlreadyReceivedNet,
      finalBalance
    };
  }, [entries]);

  const handleInputChange = (id: string, field: 'received' | 'brushing' | 'receivedToCard', value: string) => {
    const numValue = parseFloat(value) || 0;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: numValue } : e));
  };

  const resetData = () => {
    setEntries(prev => prev.map(e => ({ ...e, received: 0, brushing: 0, receivedToCard: 0 })));
    setNote("");
    showToast("结算数据已重置", "success");
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
          serviceFeeRate: 0, // 混合费率时，主表记录 0，明细记录实际费率
          serviceFee: stats.totalServiceFee,
          totalAlreadyReceived: stats.totalAlreadyReceived,
          finalBalance: stats.finalBalance,
          note: note,
          shopName: selectedShops.join(", "),
          items: stats.list.map(e => ({
            platformName: e.platformName,
            shopName: e.shopName,
            serviceFeeRate: e.serviceFeeRate,
            received: e.received,
            brushing: e.brushing,
            receivedToCard: e.receivedToCard,
            net: e.net
          }))
        })
      });

      if (!response.ok) throw new Error("保存失败");
      
      showToast("结算单已存入历史记录", "success");
      router.refresh();
      setSelectedShops([]);
    } catch (error) {
      console.error(error);
      showToast("保存失败，请重试", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (userLoading) return null;
  if (!canManage) return null;

  return (
    <div className="space-y-8 pb-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8 relative">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground truncate">
            结算对账
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-lg">
            支持同时核算多个店铺，自动按各店费率汇总。
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href="/settlement/history"
            className="flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted transition-all active:scale-95 text-sm font-medium"
          >
            <History size={16} />
            <span>历史记录</span>
          </Link>
          <button 
            onClick={resetData}
            className="flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 hover:bg-muted transition-all active:scale-95 text-sm font-medium"
          >
            <RefreshCw size={16} />
            <span>重置</span>
          </button>
        </div>
      </div>

      {/* Shop Selection - Multi Select Simulation */}
      <div className="bg-muted/10 p-6 rounded-3xl border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          <Store size={18} className="text-primary" />
          <h3 className="font-bold text-sm uppercase tracking-wider">选择参与结算的店铺</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {shops.map(shop => (
            <button
              key={shop.id}
              onClick={() => {
                setSelectedShops(prev => 
                  prev.includes(shop.label) 
                    ? prev.filter(s => s !== shop.label) 
                    : [...prev, shop.label]
                );
              }}
              className={`px-6 py-2.5 rounded-2xl text-sm font-bold transition-all border ${
                selectedShops.includes(shop.label)
                  ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20'
                  : 'bg-white dark:bg-white/5 border-border hover:border-primary/50 text-muted-foreground'
              }`}
            >
              {shop.label} ({(shop.serviceFeeRate ?? 0.06) * 100}%)
            </button>
          ))}
          {shops.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无店铺配置，请前往个人资料页添加。</p>
          )}
        </div>
      </div>

      {selectedShops.length > 0 ? (
        <div className="flex flex-col gap-8">
          {/* Data Entry Table */}
          <div className="rounded-3xl border border-border bg-white dark:bg-white/5 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border/50 bg-muted/5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Receipt className="text-primary" size={20} />
                账目明细
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/10">
                    <th className="px-6 py-4 text-[11px] font-black text-muted-foreground uppercase tracking-widest">店铺/平台</th>
                    <th className="px-6 py-4 text-[11px] font-black text-muted-foreground uppercase tracking-widest text-center">账单到手 (A)</th>
                    <th className="px-6 py-4 text-[11px] font-black text-muted-foreground uppercase tracking-widest text-center">刷单到手</th>
                    <th className="px-6 py-4 text-[11px] font-black text-muted-foreground uppercase tracking-widest text-center">已结账 (到卡)</th>
                    <th className="px-6 py-4 text-[11px] font-black text-primary uppercase tracking-widest text-center">费率</th>
                    <th className="px-6 py-4 text-[11px] font-black text-primary uppercase tracking-widest text-center">真实业绩</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/5 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-primary font-black uppercase mb-0.5">{e.shopName}</span>
                          <span className="font-bold text-foreground">{e.platformName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="relative inline-block w-40 text-left">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                          <input 
                            type="number"
                            value={e.received || ""}
                            onChange={(eVal) => handleInputChange(e.id, 'received', eVal.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm text-right font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="relative inline-block w-40 text-left">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">¥</span>
                          <input 
                            type="number"
                            value={e.brushing || ""}
                            onChange={(eVal) => handleInputChange(e.id, 'brushing', eVal.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-muted/20 border border-transparent focus:border-primary/50 focus:bg-white dark:focus:bg-white/5 transition-all outline-none font-mono text-sm text-right font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="relative inline-block w-40 text-left">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">¥</span>
                          <input 
                            type="number"
                            value={e.receivedToCard || ""}
                            onChange={(eVal) => handleInputChange(e.id, 'receivedToCard', eVal.target.value)}
                            className="w-full h-10 pl-7 pr-3 rounded-xl bg-orange-500/5 border border-orange-500/20 focus:border-orange-500 transition-all font-mono text-sm text-right text-rose-500 font-bold"
                            placeholder="0.00"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-black text-muted-foreground bg-muted/30 px-2 py-1 rounded-lg">
                          {(e.serviceFeeRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-mono font-bold text-primary">
                        ¥{(e.received - e.brushing).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-primary/5 border-t-2 border-primary/20">
                    <td className="px-6 py-6 font-black text-primary uppercase text-xs tracking-widest">总计汇总</td>
                    <td className="px-6 py-6 text-center font-mono font-bold text-foreground">
                      ¥{entries.reduce((sum, e) => sum + e.received, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-6 text-center font-mono font-bold text-orange-500">
                      ¥{entries.reduce((sum, e) => sum + e.brushing, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td colSpan={2} />
                    <td className="px-6 py-6 text-center font-mono font-black text-primary text-xl">
                      ¥{stats.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Final Summary Card */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-3xl p-8 bg-white dark:bg-white/5 border border-border shadow-xl flex flex-col relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-8">
                    <Wallet size={20} className="text-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">多店合并净得预测</span>
                  </div>
                  
                  <div className="mb-12">
                    <h3 className="text-6xl font-black tracking-tighter text-primary">
                      ¥{stats.finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-border/50">
                      <span className="text-sm font-bold text-muted-foreground">合计真实业绩 (A-B)</span>
                      <span className="font-mono font-bold text-lg">¥{stats.totalNet.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-border/50">
                      <span className="text-sm font-bold text-muted-foreground">累计各店服务费扣点</span>
                      <span className="font-mono font-bold text-orange-500">-¥{stats.totalServiceFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {stats.totalAlreadyReceived > 0 && (
                      <div className="flex justify-between items-center py-3">
                        <span className="text-sm font-bold text-muted-foreground">累计已到账金额</span>
                        <span className="font-mono font-bold text-rose-500">-¥{stats.totalAlreadyReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1 space-y-6">
              <div className="rounded-3xl p-8 bg-white dark:bg-white/5 border border-border h-full flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-sm mb-4">结算备注</h4>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="输入本次多店结算的备注..."
                    className="w-full h-32 p-4 text-sm rounded-2xl bg-muted/30 border-transparent focus:border-primary/50 transition-all outline-none resize-none"
                  />
                </div>
                
                <div className="pt-8">
                  <button 
                    onClick={saveSettlement}
                    disabled={isSaving || stats.totalNet === 0}
                    className="w-full h-16 rounded-2xl bg-primary text-primary-foreground font-black text-lg flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                  >
                    {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
                    保存结算单
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[40vh] rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-4 text-muted-foreground bg-muted/5">
          <Store size={48} className="opacity-20 text-primary" />
          <p className="font-bold">请在上方选择一个或多个店铺开始核算</p>
        </div>
      )}
    </div>
  );
}
