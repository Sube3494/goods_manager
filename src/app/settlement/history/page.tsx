"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Download,
  FileText,
  Loader2,
  Receipt,
  Store,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import * as XLSX from "xlsx";

import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { AddressItem } from "@/lib/types";

interface SettlementItem {
  id: string;
  platformName: string;
  shopName: string | null;
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
  shopName: string | null;
  items: SettlementItem[];
  createdAt: string;
}

const formatCurrency = (value: number) =>
  `¥${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SettlementHistoryPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [filterShop, setFilterShop] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { user, isLoading: userLoading } = useUser();
  const { showToast } = useToast();
  const canManage = hasPermission(user as SessionUser | null, "settlement:manage");

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
      const list = result.data as Settlement[];
      setSettlements(list);
      setSelectedSettlement((prev) => prev ?? list[0] ?? null);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredSettlements = useMemo(() => {
    return settlements.filter((settlement) => !filterShop || settlement.shopName === filterShop);
  }, [settlements, filterShop]);

  useEffect(() => {
    if (filteredSettlements.length === 0) {
      setSelectedSettlement(null);
      return;
    }

    if (!selectedSettlement || !filteredSettlements.some((item) => item.id === selectedSettlement.id)) {
      setSelectedSettlement(filteredSettlements[0]);
    }
  }, [filteredSettlements, selectedSettlement]);

  const historyStats = useMemo(() => {
    return {
      count: filteredSettlements.length,
      totalNet: filteredSettlements.reduce((sum, item) => sum + item.totalNet, 0),
      totalFinalBalance: filteredSettlements.reduce((sum, item) => sum + item.finalBalance, 0),
      totalItems: filteredSettlements.reduce((sum, item) => sum + item.items.length, 0),
    };
  }, [filteredSettlements]);

  const selectedStats = useMemo(() => {
    if (!selectedSettlement) return null;
    return {
      totalReceived: selectedSettlement.items.reduce((sum, item) => sum + item.received, 0),
      totalBrushing: selectedSettlement.items.reduce((sum, item) => sum + item.brushing, 0),
      totalToCard: selectedSettlement.items.reduce((sum, item) => sum + item.receivedToCard, 0),
    };
  }, [selectedSettlement]);

  const handleDeleteClick = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
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

      setSettlements((prev) => prev.filter((item) => item.id !== id));
      if (selectedSettlement?.id === id) setSelectedSettlement(null);
      showToast("记录已删除", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
      setIsDeleteModalOpen(false);
    }
  };

  const exportToExcel = (settlement: Settlement) => {
    try {
      showToast("正在生成报表...", "info");

      const wb = XLSX.utils.book_new();
      const itemData = settlement.items.map((item) => ({
        店铺: item.shopName || "未指定",
        平台名称: item.platformName,
        账单到手: item.received,
        扣除刷单: item.brushing,
        已打款到卡: item.receivedToCard,
        真实业绩: item.net,
      }));

      itemData.push({
        店铺: "合计汇总",
        平台名称: "---",
        账单到手: settlement.items.reduce((sum, item) => sum + item.received, 0),
        扣除刷单: settlement.items.reduce((sum, item) => sum + item.brushing, 0),
        已打款到卡: settlement.items.reduce((sum, item) => sum + item.receivedToCard, 0),
        真实业绩: settlement.totalNet,
      });

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemData), "平台明细");

      const summaryData = [
        { 项目: "业务日期", 数值: format(new Date(settlement.date), "yyyy-MM-dd") },
        { 项目: "合计：账单到手 (A)", 数值: settlement.items.reduce((sum, item) => sum + item.received, 0) },
        { 项目: "合计：刷单到手 (B)", 数值: settlement.items.reduce((sum, item) => sum + item.brushing, 0) },
        { 项目: "合计：已打本人卡 (A3)", 数值: settlement.items.reduce((sum, item) => sum + item.receivedToCard, 0) },
        { 项目: "---", 数值: "---" },
        { 项目: "合计真实总业绩", 数值: settlement.totalNet },
        { 项目: `平台服务费 (${(settlement.serviceFeeRate * 100).toFixed(1)}%)`, 数值: settlement.serviceFee },
        { 项目: "已打款到卡 (扣除)", 数值: settlement.totalAlreadyReceived },
        { 项目: "最终实补 / 应得", 数值: settlement.finalBalance },
        { 项目: "备注说明", 数值: settlement.note || "无" },
      ];

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "对账摘要");
      XLSX.writeFile(wb, `结算对账单_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`);

      showToast("报表导出成功", "success");
    } catch (err) {
      console.error(err);
      showToast("导出失败，请重试", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-primary" size={40} />
        <p className="animate-pulse text-muted-foreground">正在加载历史记录...</p>
      </div>
    );
  }

  if (userLoading) return null;
  if (!canManage) return null;

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-[32px] border border-border/60 bg-white/85 p-6 shadow-sm dark:bg-white/5 sm:p-8">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-80 bg-gradient-to-l from-primary/8 via-primary/4 to-transparent" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-muted-foreground">
              <Receipt size={14} className="text-primary" />
              结算档案
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/settlement"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/90 transition-all hover:bg-muted"
              >
                <ArrowLeft size={18} />
              </Link>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-5xl">结算历史</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                  浏览已保存的结算单，按店铺筛选，并随时查看明细、导出报表或删除旧记录。
                </p>
              </div>
            </div>
          </div>

          {user?.shippingAddresses && (user.shippingAddresses as AddressItem[]).length > 0 && (
            <div className="min-w-[190px]">
              <CustomSelect
                options={[
                  { value: "", label: "全部店铺" },
                  ...(user.shippingAddresses as AddressItem[]).map((shop) => ({
                    value: shop.label,
                    label: shop.label,
                  })),
                ]}
                value={filterShop}
                onChange={setFilterShop}
                placeholder="筛选店铺"
                triggerClassName="h-11 rounded-full px-4 text-sm font-bold"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-border/60 bg-white p-5 shadow-sm dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">结算单数</span>
            <Receipt size={16} className="text-primary" />
          </div>
          <p className="mt-4 text-3xl font-black tracking-tight">{historyStats.count}</p>
          <p className="mt-2 text-sm text-muted-foreground">筛选后可见记录数</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-white p-5 shadow-sm dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">累计真实业绩</span>
            <TrendingUp size={16} className="text-primary" />
          </div>
          <p className="mt-4 text-3xl font-black tracking-tight text-primary">{formatCurrency(historyStats.totalNet)}</p>
          <p className="mt-2 text-sm text-muted-foreground">已保存平台项 {historyStats.totalItems} 条</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-white p-5 shadow-sm dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">累计最终结算</span>
            <Wallet size={16} className="text-primary" />
          </div>
          <p className="mt-4 text-3xl font-black tracking-tight">{formatCurrency(historyStats.totalFinalBalance)}</p>
          <p className="mt-2 text-sm text-muted-foreground">基于当前筛选结果汇总</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-white p-5 shadow-sm dark:bg-white/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">当前筛选</span>
            <Store size={16} className="text-primary" />
          </div>
          <p className="mt-4 text-2xl font-black tracking-tight">{filterShop || "全部店铺"}</p>
          <p className="mt-2 text-sm text-muted-foreground">列表和统计同步更新</p>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4 xl:sticky xl:top-6">
          {filteredSettlements.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-white p-12 text-center dark:bg-white/5">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Receipt className="text-muted-foreground/50" />
              </div>
              <h3 className="font-black text-foreground">暂无历史记录</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {filterShop ? "当前筛选条件下没有记录。" : "保存后的结算单会在这里集中管理。"}
              </p>
              <Link href="/settlement" className="mt-6 text-sm font-bold text-primary hover:underline">
                去计算并保存第一单
              </Link>
            </div>
          ) : (
            filteredSettlements.map((settlement) => {
              const active = selectedSettlement?.id === settlement.id;
              return (
                <div
                  key={settlement.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedSettlement(settlement)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSettlement(settlement);
                    }
                  }}
                  className={`w-full rounded-[28px] border p-5 text-left transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                      : "border-border/60 bg-white shadow-sm hover:border-primary/30 hover:bg-muted/5 dark:bg-white/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                          <Calendar size={12} />
                          {format(new Date(settlement.date), "yyyy年MM月dd日", { locale: zhCN })}
                        </span>
                        {settlement.shopName && (
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                            {settlement.shopName}
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-lg font-black tracking-tight">{formatCurrency(settlement.finalBalance)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        真实业绩 {formatCurrency(settlement.totalNet)}，共 {settlement.items.length} 条平台明细
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(event) => handleDeleteClick(settlement.id, event)}
                      disabled={deletingId === settlement.id}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-50"
                    >
                      {deletingId === settlement.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>

                  {settlement.note && (
                    <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">{settlement.note}</p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-4">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">保存时间</div>
                      <div className="mt-1 text-sm font-mono">{format(new Date(settlement.createdAt), "MM-dd HH:mm")}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">记录 ID</div>
                      <div className="mt-1 text-sm font-mono">{settlement.id.slice(-8).toUpperCase()}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedSettlement ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[30px] border border-border/60 bg-white shadow-xl dark:bg-white/5">
              <div className="relative border-b border-border/60 bg-primary px-6 py-6 text-primary-foreground">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_42%)]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-primary-foreground/70">结算单详情</div>
                    <h2 className="mt-3 text-3xl font-black tracking-tight">
                      {formatCurrency(selectedSettlement.finalBalance)}
                    </h2>
                    <p className="mt-2 text-sm text-primary-foreground/75">
                      业务日期 {format(new Date(selectedSettlement.date), "yyyy年MM月dd日", { locale: zhCN })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right">
                      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-foreground/70">
                        记录编号
                      </div>
                      <div className="mt-1 font-mono text-sm font-black">
                        {selectedSettlement.id.slice(-8).toUpperCase()}
                      </div>
                    </div>
                    <button
                      onClick={() => exportToExcel(selectedSettlement)}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-primary transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                      <Download size={16} />
                      导出 Excel
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-b border-border/60 bg-muted/10 p-6 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-background/90 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">账单到手</div>
                  <div className="mt-2 text-xl font-black">{formatCurrency(selectedStats?.totalReceived ?? 0)}</div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/90 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">扣除刷单</div>
                  <div className="mt-2 text-xl font-black text-orange-500">
                    {formatCurrency(selectedStats?.totalBrushing ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/90 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">已打款到卡</div>
                  <div className="mt-2 text-xl font-black text-rose-500">
                    {formatCurrency(selectedStats?.totalToCard ?? 0)}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/90 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">真实业绩</div>
                  <div className="mt-2 text-xl font-black text-primary">
                    {formatCurrency(selectedSettlement.totalNet)}
                  </div>
                </div>
              </div>

              <div className="space-y-8 p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-primary" />
                    <h3 className="text-lg font-black tracking-tight">平台明细</h3>
                  </div>

                  <div className="overflow-hidden rounded-[26px] border border-border/60">
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-muted/20">
                            <th className="px-5 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                              所属店铺 / 平台
                            </th>
                            <th className="px-5 py-4 text-right text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                              账单到手
                            </th>
                            <th className="px-5 py-4 text-right text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                              刷单
                            </th>
                            <th className="px-5 py-4 text-right text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                              到卡
                            </th>
                            <th className="px-5 py-4 text-right text-[11px] font-black uppercase tracking-[0.18em] text-primary">
                              真实业绩
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {selectedSettlement.items.map((item) => (
                            <tr key={item.id} className="bg-white font-mono text-sm transition-colors hover:bg-muted/5 dark:bg-transparent">
                              <td className="px-5 py-4 font-sans">
                                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/70">
                                  {item.shopName || "未指定店铺"}
                                </div>
                                <div className="mt-1 text-sm font-black text-foreground">{item.platformName}</div>
                              </td>
                              <td className="px-5 py-4 text-right">{formatCurrency(item.received)}</td>
                              <td className="px-5 py-4 text-right text-orange-500">{formatCurrency(item.brushing)}</td>
                              <td className="px-5 py-4 text-right text-rose-500">{formatCurrency(item.receivedToCard)}</td>
                              <td className="px-5 py-4 text-right font-black text-primary">{formatCurrency(item.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="divide-y divide-border/60 md:hidden">
                      {selectedSettlement.items.map((item) => (
                        <div key={item.id} className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-primary/70">
                                {item.shopName || "未指定店铺"}
                              </div>
                              <div className="mt-1 text-sm font-black">{item.platformName}</div>
                            </div>
                            <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-mono font-black text-primary">
                              {formatCurrency(item.net)}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-sm font-mono">
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                到手
                              </div>
                              <div className="mt-1">{formatCurrency(item.received)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                刷单
                              </div>
                              <div className="mt-1 text-orange-500">{formatCurrency(item.brushing)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                                到卡
                              </div>
                              <div className="mt-1 text-rose-500">{formatCurrency(item.receivedToCard)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="rounded-[26px] border border-border/60 bg-muted/10 p-5">
                    <h3 className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">补款推导</h3>
                    <div className="mt-5 space-y-4">
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span className="text-muted-foreground">合计真实业绩</span>
                        <span className="font-mono">{formatCurrency(selectedSettlement.totalNet)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span className="text-muted-foreground">
                          服务费 ({(selectedSettlement.serviceFeeRate * 100).toFixed(1)}%)
                        </span>
                        <span className="font-mono text-orange-500">-{formatCurrency(selectedSettlement.serviceFee)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm font-bold">
                        <span className="text-muted-foreground">已打款到卡</span>
                        <span className="font-mono text-rose-500">
                          -{formatCurrency(selectedSettlement.totalAlreadyReceived)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border/60 pt-4">
                        <span className="text-lg font-black">最终实补 / 应得</span>
                        <span className="font-mono text-2xl font-black text-primary">
                          {formatCurrency(selectedSettlement.finalBalance)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center rounded-[26px] border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center">
                    <TrendingUp className="mx-auto text-primary" size={30} />
                    <p className="mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                      当前选中记录
                    </p>
                    <div className="mt-3 text-3xl font-black tracking-tight text-primary">
                      {formatCurrency(selectedSettlement.finalBalance)}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      保存时间 {format(new Date(selectedSettlement.createdAt), "yyyy-MM-dd HH:mm")}
                    </p>
                  </div>
                </div>

                {selectedSettlement.note && (
                  <div className="rounded-[26px] border border-border/60 bg-muted/20 p-5">
                    <h3 className="flex items-center gap-2 text-sm font-black text-primary">
                      <FileText size={15} />
                      备注说明
                    </h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                      {selectedSettlement.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[30px] border border-dashed border-border/60 bg-white/60 px-6 text-center dark:bg-white/5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/8">
              <Receipt size={28} className="text-primary" />
            </div>
            <p className="mt-5 text-xl font-black tracking-tight">先从左侧选择一条历史记录</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              右侧会展示该结算单的金额拆解、平台明细和备注信息。
            </p>
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
