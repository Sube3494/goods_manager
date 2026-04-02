"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, History, Loader2, Percent, Receipt, RefreshCw, Save, Store, TrendingUp, Wallet } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DatePicker } from "@/components/ui/DatePicker";
import { useToast } from "@/components/ui/Toast";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { User } from "@/lib/types";

interface PlatformData {
  id: string;
  shopName: string;
  platformName: string;
  serviceFeeRate: number;
  received: number;
  brushing: number;
  receivedToCard: number;
}

interface ShopGroup {
  shopName: string;
  serviceFeeRate: number;
  entries: Array<PlatformData & { net: number; fee: number; alreadyReceivedNet: number }>;
  totalReceived: number;
  totalToCard: number;
  totalNet: number;
  totalServiceFee: number;
  totalAlreadyReceived: number;
  finalBalance: number;
  filledCount: number;
  isConfirmed: boolean;
}

const DEFAULT_PLATFORMS = ["美团闪购", "京东秒送", "淘宝闪购"];
const money = (value: number) => `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SettlementPage() {
  const { user, isLoading: userLoading } = useUser();
  const shops = useMemo(() => (user as unknown as User)?.shippingAddresses || [], [user]);
  const { showToast } = useToast();
  const router = useRouter();
  const canManage = hasPermission(user as SessionUser | null, "settlement:manage");

  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [activeShop, setActiveShop] = useState("");
  const [confirmedShops, setConfirmedShops] = useState<string[]>([]);
  const [entries, setEntries] = useState<PlatformData[]>([]);
  const [note, setNote] = useState("");
  const [businessDate, setBusinessDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (selectedShops.length === 0) {
      setEntries([]);
      setActiveShop("");
      setConfirmedShops([]);
      return;
    }

    setEntries((prev) => {
      const next: PlatformData[] = [];
      selectedShops.forEach((shopLabel) => {
        const rate = shops.find((item) => item.label === shopLabel)?.serviceFeeRate ?? 0.06;
        DEFAULT_PLATFORMS.forEach((platformName) => {
          const id = `${shopLabel}-${platformName}`;
          const existing = prev.find((entry) => entry.id === id);
          next.push(
            existing
              ? { ...existing, serviceFeeRate: rate }
              : { id, shopName: shopLabel, platformName, serviceFeeRate: rate, received: 0, brushing: 0, receivedToCard: 0 }
          );
        });
      });
      return next;
    });
  }, [selectedShops, shops]);

  useEffect(() => {
    if (selectedShops.length > 0 && (!activeShop || !selectedShops.includes(activeShop))) {
      setActiveShop(selectedShops[0]);
    }
  }, [activeShop, selectedShops]);

  const groups = useMemo<ShopGroup[]>(() => {
    return selectedShops.map((shopName) => {
      const shopEntries = entries.filter((entry) => entry.shopName === shopName).map((entry) => {
        const net = entry.received - entry.brushing;
        const fee = net * entry.serviceFeeRate;
        const alreadyReceivedNet = entry.received > 0 ? (entry.receivedToCard / entry.received) * net : 0;
        return { ...entry, net, fee, alreadyReceivedNet };
      });
      const totalReceived = shopEntries.reduce((sum, entry) => sum + entry.received, 0);
      const totalToCard = shopEntries.reduce((sum, entry) => sum + entry.receivedToCard, 0);
      const totalNet = shopEntries.reduce((sum, entry) => sum + entry.net, 0);
      const totalServiceFee = shopEntries.reduce((sum, entry) => sum + entry.fee, 0);
      const totalAlreadyReceived = shopEntries.reduce((sum, entry) => sum + entry.alreadyReceivedNet, 0);
      return {
        shopName,
        serviceFeeRate: shopEntries[0]?.serviceFeeRate ?? 0,
        entries: shopEntries,
        totalReceived,
        totalToCard,
        totalNet,
        totalServiceFee,
        totalAlreadyReceived,
        finalBalance: totalNet - totalServiceFee - totalAlreadyReceived,
        filledCount: shopEntries.filter((entry) => entry.received > 0 || entry.brushing > 0 || entry.receivedToCard > 0).length,
        isConfirmed: confirmedShops.includes(shopName),
      };
    });
  }, [confirmedShops, entries, selectedShops]);

  const activeGroup = groups.find((group) => group.shopName === activeShop) ?? null;
  const confirmedGroups = groups.filter((group) => group.isConfirmed);
  const summary = {
    shopCount: confirmedGroups.length,
    totalReceived: confirmedGroups.reduce((sum, group) => sum + group.totalReceived, 0),
    totalNet: confirmedGroups.reduce((sum, group) => sum + group.totalNet, 0),
    totalServiceFee: confirmedGroups.reduce((sum, group) => sum + group.totalServiceFee, 0),
    totalAlreadyReceived: confirmedGroups.reduce((sum, group) => sum + group.totalAlreadyReceived, 0),
    totalToCard: confirmedGroups.reduce((sum, group) => sum + group.totalToCard, 0),
    finalBalance: confirmedGroups.reduce((sum, group) => sum + group.finalBalance, 0),
  };

  const handleInputChange = (id: string, field: "received" | "brushing" | "receivedToCard", value: string) => {
    const changed = entries.find((entry) => entry.id === id);
    if (changed && confirmedShops.includes(changed.shopName)) {
      setConfirmedShops((prev) => prev.filter((shopName) => shopName !== changed.shopName));
    }
    const numeric = Number.parseFloat(value) || 0;
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, [field]: numeric } : entry)));
  };

  const toggleShop = (shopLabel: string) => {
    setSelectedShops((prev) => {
      const exists = prev.includes(shopLabel);
      const next = exists ? prev.filter((item) => item !== shopLabel) : [...prev, shopLabel];
      if (exists) {
        setConfirmedShops((confirmed) => confirmed.filter((item) => item !== shopLabel));
      } else {
        setActiveShop(shopLabel);
      }
      return next;
    });
  };

  const handleShopCardClick = (shopLabel: string) => {
    if (selectedShops.includes(shopLabel)) {
      setActiveShop(shopLabel);
      return;
    }
    toggleShop(shopLabel);
  };

  const confirmActiveShop = () => {
    if (!activeGroup || activeGroup.totalNet === 0) {
      showToast("当前店铺暂无可结算数据", "error");
      return;
    }
    setConfirmedShops((prev) => (prev.includes(activeGroup.shopName) ? prev : [...prev, activeGroup.shopName]));
    showToast(`${activeGroup.shopName} 已确认结算`, "success");
  };

  const resetData = () => {
    setEntries((prev) => prev.map((entry) => ({ ...entry, received: 0, brushing: 0, receivedToCard: 0 })));
    setConfirmedShops([]);
    setNote("");
    setBusinessDate(format(new Date(), "yyyy-MM-dd"));
    showToast("本页录入数据已清空", "success");
  };

  const saveSettlement = async () => {
    if (selectedShops.length === 0 || confirmedGroups.length === 0) {
      showToast("请先完成至少一家店铺的结算", "error");
      return;
    }
    if (confirmedGroups.length !== selectedShops.length) {
      showToast("还有店铺未确认结算，暂不能保存总单", "error");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: businessDate ? new Date(`${businessDate}T00:00:00`) : new Date(),
          totalNet: summary.totalNet,
          serviceFeeRate: 0,
          serviceFee: summary.totalServiceFee,
          totalAlreadyReceived: summary.totalAlreadyReceived,
          finalBalance: summary.finalBalance,
          note,
          shopName: confirmedGroups.map((group) => group.shopName).join(", "),
          items: confirmedGroups.flatMap((group) =>
            group.entries.map((entry) => ({
              platformName: entry.platformName,
              shopName: entry.shopName,
              serviceFeeRate: entry.serviceFeeRate,
              received: entry.received,
              brushing: entry.brushing,
              receivedToCard: entry.receivedToCard,
              net: entry.net,
            }))
          ),
        }),
      });
      if (!response.ok) throw new Error("保存失败");
      showToast("结算单已存入历史记录", "success");
      router.refresh();
      setSelectedShops([]);
      setConfirmedShops([]);
      setEntries([]);
      setActiveShop("");
      setNote("");
      setBusinessDate(format(new Date(), "yyyy-MM-dd"));
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
    <div className="w-full space-y-6 pb-20 2xl:px-4">
      <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-white/85 p-5 shadow-sm dark:bg-white/5">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-56 bg-gradient-to-l from-primary/8 via-primary/4 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
              <Receipt size={14} className="text-primary" />
              逐店结算
            </div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">计算对账</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              左侧选店和切换，中间处理当前店，右侧看已确认总单。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/settlement/history" className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background/90 px-5 text-sm font-bold transition-all hover:bg-muted">
              <History size={16} />
              历史记录
            </Link>
            <button onClick={resetData} className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-background/90 px-5 text-sm font-bold transition-all hover:bg-muted">
              <RefreshCw size={16} />
              清空本页
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[240px_minmax(860px,1fr)_320px]">
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-[24px] border border-border/60 bg-white p-4 shadow-sm dark:bg-white/5">
            <div className="mb-4 flex items-center gap-2">
              <Store size={18} className="text-primary" />
              <h2 className="text-sm font-black uppercase tracking-[0.2em]">店铺结算列表</h2>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-1">
              {shops.map((shop) => {
                const selected = selectedShops.includes(shop.label);
                const focused = activeShop === shop.label;
                const confirmed = confirmedShops.includes(shop.label);
                return (
                  <button
                    key={shop.id}
                    type="button"
                    onClick={() => handleShopCardClick(shop.label)}
                    className={`relative w-full rounded-[20px] border p-3 text-left transition-all ${
                      focused
                        ? "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : selected
                          ? "border-primary/40 bg-primary/6 shadow-sm ring-1 ring-primary/15"
                          : "border-border/60 bg-background hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`text-sm font-black ${focused ? "text-primary-foreground" : "text-foreground"}`}>{shop.label}</div>
                        <div className={`mt-1 text-xs font-bold ${focused ? "text-primary-foreground/80" : "text-muted-foreground"}`}>费率 {(shop.serviceFeeRate ?? 0.06) * 100}%</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selected ? (
                          <CheckCircle2 size={16} className={focused ? "text-primary-foreground" : confirmed ? "text-primary" : "text-muted-foreground"} />
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                            未加入
                          </span>
                        )}
                        {selected && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                            confirmed
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {confirmed ? "已确认" : "待结算"}
                          </span>
                        )}
                      </div>
                    </div>
                    {selected && (
                      <div className="mt-3 flex items-center justify-between">
                        <div className={`text-xs ${focused ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {focused ? "当前处理店铺" : "点击切到这家店"}
                        </div>
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleShop(shop.label);
                          }}
                          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                            focused
                              ? "bg-white/15 text-primary-foreground/85 hover:text-primary-foreground"
                              : "bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          移除
                        </span>
                      </div>
                    )}
                    {!selected && <div className="mt-3 text-xs text-muted-foreground">点击加入本次结算</div>}
                  </button>
                );
              })}
              {shops.length === 0 && <p className="text-sm text-muted-foreground">暂无店铺配置，请先去个人资料补充店铺和费率。</p>}
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-6">
          {activeGroup ? (
            <>
              <section className="rounded-[26px] border border-border/60 bg-white shadow-sm dark:bg-white/5">
                <div className="border-b border-border/60 bg-muted/10 px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">当前店铺工作区</div>
                      <h2 className="mt-1 text-2xl font-black tracking-tight">{activeGroup.shopName}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">只处理这一家店，确认后再进入总单。</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[340px]">
                      <div className="rounded-[18px] border border-border/60 bg-background/80 px-3 py-2.5">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店到账</div>
                        <div className="mt-1.5 text-lg font-black">{money(activeGroup.totalReceived)}</div>
                      </div>
                      <div className="rounded-[18px] border border-border/60 bg-background/80 px-3 py-2.5">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店真业绩</div>
                        <div className="mt-1.5 text-lg font-black text-primary">{money(activeGroup.totalNet)}</div>
                      </div>
                      <div className="rounded-[18px] border border-border/60 bg-background/80 px-3 py-2.5">
                        <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店应补</div>
                        <div className="mt-1.5 text-lg font-black text-primary">{money(activeGroup.finalBalance)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  {activeGroup.entries.map((entry) => (
                    <div key={entry.id} className="rounded-[22px] border border-border/60 bg-background/90 p-4 shadow-sm transition-all hover:border-primary/20">
                      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">平台</div>
                          <div className="mt-1 text-xl font-black tracking-tight">{entry.platformName}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                            <Percent size={12} />
                            费率 {(entry.serviceFeeRate * 100).toFixed(1)}%
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/8 px-3 py-1 text-xs font-bold text-primary">
                            <TrendingUp size={12} />
                            真实业绩 {money(entry.net)}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-3">
                        <label className="space-y-2">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">账单到手 (A)</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                            <input type="number" inputMode="decimal" value={entry.received || ""} onChange={(event) => handleInputChange(entry.id, "received", event.target.value)} className="h-[52px] w-full rounded-2xl border border-border bg-white pl-9 pr-4 text-right font-mono text-base font-bold outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:bg-white/5" placeholder="0.00" />
                          </div>
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">刷单到手 (B)</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                            <input type="number" inputMode="decimal" value={entry.brushing || ""} onChange={(event) => handleInputChange(entry.id, "brushing", event.target.value)} className="h-[52px] w-full rounded-2xl border border-border bg-white pl-9 pr-4 text-right font-mono text-base font-bold outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:bg-white/5" placeholder="0.00" />
                          </div>
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">已打款到卡</span>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-orange-500">¥</span>
                            <input type="number" inputMode="decimal" value={entry.receivedToCard || ""} onChange={(event) => handleInputChange(entry.id, "receivedToCard", event.target.value)} className="h-[52px] w-full rounded-2xl border border-orange-500/20 bg-orange-500/5 pl-9 pr-4 text-right font-mono text-base font-bold text-rose-500 outline-none transition-all focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/10" placeholder="0.00" />
                          </div>
                        </label>
                      </div>

                      <div className="mt-3 grid gap-3 rounded-[18px] bg-muted/20 p-3 sm:grid-cols-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">真实业绩</div>
                          <div className="mt-1 font-mono text-lg font-black text-primary">{money(entry.net)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">预计服务费</div>
                          <div className="mt-1 font-mono text-lg font-black text-orange-500">{money(entry.fee)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">已到账占比折算</div>
                          <div className="mt-1 font-mono text-lg font-black text-rose-500">{money(entry.alreadyReceivedNet)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-border/60 bg-white p-5 shadow-sm dark:bg-white/5">
                <div className="grid gap-3 md:grid-cols-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店真实业绩</div>
                    <div className="mt-1.5 font-mono text-xl font-black text-primary">{money(activeGroup.totalNet)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店服务费</div>
                    <div className="mt-1.5 font-mono text-xl font-black text-orange-500">{money(activeGroup.totalServiceFee)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店已到账部分</div>
                    <div className="mt-1.5 font-mono text-xl font-black text-rose-500">{money(activeGroup.totalAlreadyReceived)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店最终应补</div>
                    <div className="mt-1.5 font-mono text-xl font-black text-primary">{money(activeGroup.finalBalance)}</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-dashed border-border/70 bg-muted/10 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">本店结算动作</div>
                    <div className={`mt-1.5 text-lg font-black ${activeGroup.isConfirmed ? "text-primary" : "text-foreground"}`}>
                      {activeGroup.isConfirmed ? "已确认，已进入右侧总单" : "确认本店后，右侧总单才会计入这家店"}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">如果继续修改这家店的金额，会自动回到待确认状态。</p>
                  </div>
                  <button type="button" onClick={confirmActiveShop} disabled={activeGroup.totalNet === 0} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
                    <CheckCircle2 size={16} />
                    确认 {activeGroup.shopName} 结算
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[30px] border-2 border-dashed border-border bg-muted/5 px-6 text-center">
              <div className="flex h-18 w-18 items-center justify-center rounded-full bg-primary/8">
                <Store size={34} className="text-primary" />
              </div>
              <p className="mt-5 text-xl font-black tracking-tight">先在左侧选择要结算的店铺</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">选中后，中间这里只处理当前店铺的结算，不再把多家店的录入区堆在一起。</p>
            </div>
          )}
        </main>

        <aside className="space-y-6 2xl:sticky 2xl:top-6 2xl:self-start">
          <section className="overflow-hidden rounded-[24px] border border-border/60 bg-white shadow-sm dark:bg-white/5">
            <div className="border-b border-border/60 bg-muted/10 px-5 py-4">
              <div className="relative">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
                  <Wallet size={14} className="text-primary" />
                  汇总总单
                </div>
                <p className="mt-2 text-sm text-muted-foreground">这里只统计已经确认结算的店铺。</p>
                <div className="mt-3 text-3xl font-black tracking-tight text-primary">{money(summary.finalBalance)}</div>
              </div>
            </div>

            <div className="space-y-5 p-5">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">业务日期</label>
                <div className="h-[52px]">
                  <DatePicker value={businessDate} onChange={setBusinessDate} placeholder="选择业务日期" showClear={false} triggerClassName="h-[52px] rounded-2xl bg-background" />
                </div>
              </div>

                <div className="grid gap-2.5">
                <div className="flex items-center justify-between rounded-2xl bg-muted/20 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                    <CalendarDays size={15} />
                    已确认店铺
                  </span>
                  <span className="font-mono text-sm font-black">{summary.shopCount}/{selectedShops.length} 家</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted/20 px-4 py-3">
                  <span className="text-sm font-bold text-muted-foreground">汇总到账</span>
                  <span className="font-mono text-sm font-black">{money(summary.totalReceived)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted/20 px-4 py-3">
                  <span className="text-sm font-bold text-muted-foreground">汇总真实业绩</span>
                  <span className="font-mono text-sm font-black">{money(summary.totalNet)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted/20 px-4 py-3">
                  <span className="text-sm font-bold text-muted-foreground">汇总服务费</span>
                  <span className="font-mono text-sm font-black text-orange-500">-{money(summary.totalServiceFee)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-muted/20 px-4 py-3">
                  <span className="text-sm font-bold text-muted-foreground">汇总已到账部分</span>
                  <span className="font-mono text-sm font-black text-rose-500">-{money(summary.totalAlreadyReceived)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="settlement-note" className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">总单备注</label>
                <textarea id="settlement-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="补充这次整单结算的说明..." className="h-32 w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-all focus:border-primary/40 focus:ring-2 focus:ring-primary/10" />
              </div>

              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-4 text-sm text-muted-foreground">
                顺序是：左侧选店，处理中间当前店，确认本店后，再进入右侧总单。
              </div>

              <button onClick={saveSettlement} disabled={isSaving || summary.shopCount === 0 || summary.shopCount !== selectedShops.length} className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-sm font-black text-primary-foreground shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40">
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                保存结算单
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border border-border/60 bg-white p-4 shadow-sm dark:bg-white/5">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">已确认店铺</div>
            <div className="mt-3 space-y-2.5">
              {confirmedGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">确认后的店铺会出现在这里，准备进入保存总单。</p>
              ) : (
                confirmedGroups.map((group) => (
                  <div key={group.shopName} className="rounded-2xl border border-border/60 bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black">{group.shopName}</div>
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-primary">已确认</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">本店应补 {money(group.finalBalance)}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
