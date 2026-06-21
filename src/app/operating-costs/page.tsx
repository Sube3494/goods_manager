"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Calculator, Loader2, Pencil, ReceiptText, Users, WalletCards, X } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useToast } from "@/components/ui/Toast";
import { DatePicker } from "@/components/ui/DatePicker";
import { useUser } from "@/hooks/useUser";
import { hasPermission, SessionUser } from "@/lib/permissions";
import { getDailyFixedOperatingCost, getDailyUtilityCost, normalizeMonthKey } from "@/lib/operatingCosts";
import type { AddressItem, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type OperatingCostProfile = {
  shopName?: string;
  monthlyRent: number;
  monthlyLabor: number;
  allocationBaseDays: number;
};

type OperatingCostMonthlyBill = {
  shopName?: string;
  monthKey: string;
  waterAmount: number;
  electricAmount: number;
  sharedElectricAmount: number;
  propertyFeeAmount: number;
};

type OperatingCostsResponse = {
  profile: OperatingCostProfile;
  selectedMonthBill: OperatingCostMonthlyBill;
  recentBills: OperatingCostMonthlyBill[];
  summary: {
    dailyFixedCost: number;
    dailyUtilityCost: number;
  };
};

type BillDraft = {
  monthKey: string;
  waterInput: string;
  electricInput: string;
  sharedElectricInput: string;
  propertyFeeInput: string;
};

function toCurrency(value: number) {
  return `¥${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getBillDraft(bill: OperatingCostMonthlyBill): BillDraft {
  return {
    monthKey: bill.monthKey,
    waterInput: bill.waterAmount > 0 ? String(bill.waterAmount) : "",
    electricInput: bill.electricAmount > 0 ? String(bill.electricAmount) : "",
    sharedElectricInput: bill.sharedElectricAmount > 0 ? String(bill.sharedElectricAmount) : "",
    propertyFeeInput: bill.propertyFeeAmount > 0 ? String(bill.propertyFeeAmount) : "",
  };
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1.5 block">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">{label}</div>
      <div className="relative flex items-center">
        <span className="absolute left-3.5 text-sm font-semibold text-muted-foreground/60 select-none">¥</span>
        <input
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (!/^\d*(\.\d{0,2})?$/.test(next)) return;
            onChange(next);
          }}
          inputMode="decimal"
          placeholder={placeholder || "0.00"}
          className="h-11 w-full rounded-xl border border-black/8 bg-white pl-8 pr-4 text-sm font-bold text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/5 dark:border-white/10 dark:bg-white/5 dark:focus:border-primary/40"
        />
      </div>
    </label>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-black/8 bg-white/76 px-3.5 py-3 shadow-xs dark:border-white/10 dark:bg-white/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:px-4 sm:py-3.5 flex flex-col justify-between h-full">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground truncate">{label}</span>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-black/6 bg-black/[0.02] text-foreground dark:border-white/8 dark:bg-white/4 sm:h-9 sm:w-9">
          {icon}
        </div>
      </div>
      <div className="mt-3.5 flex-1 flex flex-col justify-end">
        <div className="text-[20px] font-black leading-none tracking-tight text-foreground sm:text-[28px] break-all truncate" title={value}>
          {value}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs" title={hint}>
          {hint}
        </p>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[160px] rounded-[18px] border border-black/8 bg-white/92 px-3.5 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/92">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 space-y-2">
        {payload.map((item) => (
          <div key={String(item.name || "")} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color || "#0ea5e9" }} />
              <span>{item.name}</span>
            </div>
            <span className="text-sm font-black tabular-nums text-slate-900 dark:text-white">
              {toCurrency(Number(item.value || 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OperatingCostsPage() {
  const { showToast } = useToast();
  const { user, isLoading: userLoading } = useUser();
  const canManage = hasPermission(user as SessionUser | null, "operating-costs:manage");
  const shops = useMemo(() => (((user as User | null)?.shippingAddresses as AddressItem[] | undefined) || []).filter((item) => item.label?.trim()), [user]);
  const [monthKey, setMonthKey] = useState(() => normalizeMonthKey(new Date()));
  const [activeShop, setActiveShop] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [, setProfile] = useState<OperatingCostProfile>({
    monthlyRent: 0,
    monthlyLabor: 0,
    allocationBaseDays: 30,
  });
  const [rentInput, setRentInput] = useState("");
  const [laborInput, setLaborInput] = useState("");
  const [waterInput, setWaterInput] = useState("");
  const [electricInput, setElectricInput] = useState("");
  const [sharedElectricInput, setSharedElectricInput] = useState("");
  const [propertyFeeInput, setPropertyFeeInput] = useState("");
  const [recentBills, setRecentBills] = useState<OperatingCostMonthlyBill[]>([]);
  const [activeFormTab, setActiveFormTab] = useState<"bill" | "profile">("bill");
  const [editingBill, setEditingBill] = useState<OperatingCostMonthlyBill | null>(null);
  const [billDraft, setBillDraft] = useState<BillDraft | null>(null);
  const [isEditModalSaving, setIsEditModalSaving] = useState(false);

  useEffect(() => {
    if (!shops.length) {
      setActiveShop("");
      return;
    }
    setActiveShop((current) => {
      if (current && shops.some((shop) => shop.label === current)) {
        return current;
      }
      return shops[0]?.label || "";
    });
  }, [shops]);

  const fetchData = useCallback(async (targetMonth: string) => {
    if (!activeShop) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/operating-costs?month=${encodeURIComponent(targetMonth)}&shopName=${encodeURIComponent(activeShop)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch operating costs");
      }
      const data = (await response.json()) as OperatingCostsResponse;
      setProfile(data.profile);
      setRentInput(data.profile.monthlyRent > 0 ? String(data.profile.monthlyRent) : "");
      setLaborInput(data.profile.monthlyLabor > 0 ? String(data.profile.monthlyLabor) : "");
      setWaterInput(data.selectedMonthBill.waterAmount > 0 ? String(data.selectedMonthBill.waterAmount) : "");
      setElectricInput(data.selectedMonthBill.electricAmount > 0 ? String(data.selectedMonthBill.electricAmount) : "");
      setSharedElectricInput(data.selectedMonthBill.sharedElectricAmount > 0 ? String(data.selectedMonthBill.sharedElectricAmount) : "");
      setPropertyFeeInput(data.selectedMonthBill.propertyFeeAmount > 0 ? String(data.selectedMonthBill.propertyFeeAmount) : "");
      setRecentBills(Array.isArray(data.recentBills) ? data.recentBills : []);
    } catch (error) {
      console.error("Failed to load operating costs:", error);
      showToast("经营成本加载失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [activeShop, showToast]);

  useEffect(() => {
    if (!activeShop) return;
    void fetchData(monthKey);
  }, [activeShop, fetchData, monthKey]);

  const monthlyRent = Number(rentInput || 0);
  const monthlyLabor = Number(laborInput || 0);
  const waterAmount = Number(waterInput || 0);
  const electricAmount = Number(electricInput || 0);
  const sharedElectricAmount = Number(sharedElectricInput || 0);
  const propertyFeeAmount = Number(propertyFeeInput || 0);

  const dailyFixedCost = useMemo(
    () => getDailyFixedOperatingCost({ monthlyRent, monthlyLabor, allocationBaseDays: 30 }),
    [monthlyLabor, monthlyRent]
  );
  const dailyUtilityCost = useMemo(
    () => getDailyUtilityCost({ monthKey, waterAmount, electricAmount, sharedElectricAmount, propertyFeeAmount }),
    [electricAmount, monthKey, propertyFeeAmount, sharedElectricAmount, waterAmount]
  );
  const chartData = useMemo(() => (
    [...recentBills]
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((bill) => ({
        monthKey: bill.monthKey,
        total: bill.waterAmount + bill.electricAmount + bill.sharedElectricAmount + bill.propertyFeeAmount,
        waterAmount: bill.waterAmount,
        electricAmount: bill.electricAmount,
        sharedElectricAmount: bill.sharedElectricAmount,
        propertyFeeAmount: bill.propertyFeeAmount,
      }))
  ), [recentBills]);

  const historicalMonthlyUtilityAverage = useMemo(() => {
    if (!recentBills || recentBills.length === 0) return 0;
    const total = recentBills.reduce((sum, bill) => {
      return sum + bill.waterAmount + bill.electricAmount + bill.sharedElectricAmount + bill.propertyFeeAmount;
    }, 0);
    return total / recentBills.length;
  }, [recentBills]);

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const response = await fetch("/api/operating-costs/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: activeShop,
          monthlyRent,
          monthlyLabor,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save profile");
      }
      const nextProfile = await response.json();
      setProfile(nextProfile);
      showToast(`${activeShop} 固定成本已保存`, "success");
    } catch (error) {
      console.error("Failed to save operating cost profile:", error);
      showToast("固定成本保存失败", "error");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveBill = async () => {
    setIsSavingBill(true);
    try {
      const response = await fetch("/api/operating-costs/monthly-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: activeShop,
          monthKey,
          waterAmount,
          electricAmount,
          sharedElectricAmount,
          propertyFeeAmount,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save bill");
      }
      showToast(`${activeShop} ${monthKey} 月账单已保存`, "success");
      await fetchData(monthKey);
    } catch (error) {
      console.error("Failed to save operating cost bill:", error);
      showToast("月账单保存失败", "error");
    } finally {
      setIsSavingBill(false);
    }
  };

  const handleOpenEditModal = (bill: OperatingCostMonthlyBill) => {
    setEditingBill(bill);
    setBillDraft(getBillDraft(bill));
  };

  const handleCloseEditModal = () => {
    if (isEditModalSaving) return;
    setEditingBill(null);
    setBillDraft(null);
  };

  const handleSaveEditedBill = async () => {
    if (!editingBill || !billDraft) return;
    setIsEditModalSaving(true);
    try {
      const response = await fetch("/api/operating-costs/monthly-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName: activeShop,
          monthKey: billDraft.monthKey,
          waterAmount: Number(billDraft.waterInput || 0),
          electricAmount: Number(billDraft.electricInput || 0),
          sharedElectricAmount: Number(billDraft.sharedElectricInput || 0),
          propertyFeeAmount: Number(billDraft.propertyFeeInput || 0),
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save edited bill");
      }
      showToast(`${activeShop} ${billDraft.monthKey} 月账单已更新`, "success");
      await fetchData(monthKey);
      handleCloseEditModal();
    } catch (error) {
      console.error("Failed to save edited operating cost bill:", error);
      showToast("月账单更新失败", "error");
    } finally {
      setIsEditModalSaving(false);
    }
  };

  const editingBillTotal = billDraft
    ? Number(billDraft.waterInput || 0)
      + Number(billDraft.electricInput || 0)
      + Number(billDraft.sharedElectricInput || 0)
      + Number(billDraft.propertyFeeInput || 0)
    : 0;
  const editingBillDailyCost = billDraft
    ? getDailyUtilityCost({
      monthKey: billDraft.monthKey,
      waterAmount: Number(billDraft.waterInput || 0),
      electricAmount: Number(billDraft.electricInput || 0),
      sharedElectricAmount: Number(billDraft.sharedElectricInput || 0),
      propertyFeeAmount: Number(billDraft.propertyFeeInput || 0),
    })
    : 0;

  if (userLoading) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground font-medium">读取系统配置中...</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-black text-foreground">当前账号没有经营成本管理权限</div>
          <div className="mt-2 text-sm text-muted-foreground">需要被授予财务结算下的“经营成本管理”权限。</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-2 pb-10 sm:space-y-8 sm:px-1">
      {/* 头部标题块 */}
      <section className="overflow-hidden rounded-[24px] border border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(244,244,245,0.78)_48%,rgba(239,246,255,0.78)_100%)] px-4 py-4 shadow-xs dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03)_48%,rgba(14,165,233,0.05)_100%)] sm:px-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-black leading-none tracking-tight text-foreground sm:text-3xl">经营成本</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">管理房租、人工、水费、电费、公摊、物业等非订单固定与浮动成本</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-black/8 bg-white/75 text-foreground dark:border-white/10 dark:bg-white/5">
            <WalletCards size={18} />
          </div>
        </div>
      </section>

      {/* 第一层：4个精美指标卡 (满宽) */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard label="月度固定成本" value={toCurrency(monthlyRent + monthlyLabor)} hint={`房租 ${toCurrency(monthlyRent)} + 人工 ${toCurrency(monthlyLabor)}`} icon={<Building2 size={18} />} />
        <MetricCard label="月度浮动账单" value={toCurrency(waterAmount + electricAmount + sharedElectricAmount + propertyFeeAmount)} hint={activeShop ? `${activeShop} ${monthKey} 水电物业总额` : `${monthKey} 水电物业总额`} icon={<ReceiptText size={18} />} />
        <MetricCard label="历史浮动月均" value={toCurrency(historicalMonthlyUtilityAverage)} hint={recentBills.length > 0 ? `最近 ${recentBills.length} 个月账单均值` : "暂无历史账单数据"} icon={<WalletCards size={18} />} />
        <MetricCard label="每日运营成本" value={toCurrency(dailyFixedCost + dailyUtilityCost)} hint={`固定日成本 ${toCurrency(dailyFixedCost)} + 日均摊 ${toCurrency(dailyUtilityCost)}`} icon={<Calculator size={18} />} />
      </div>

      {/* 第二层：录入配置单独一行 */}
      <section className="rounded-[24px] border border-black/8 bg-white/78 p-4 shadow-xs dark:border-white/10 dark:bg-white/5 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground">成本录入与设置</h2>
            <p className="mt-1 text-sm text-muted-foreground">切换店铺与模式后，直接填写当前表单。</p>
          </div>
          {isLoading ? <Loader2 size={16} className="animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="w-full">
          <div className="rounded-[24px] border border-black/6 bg-white/70 p-5 md:p-6 shadow-xs backdrop-blur-xl dark:border-white/8 dark:bg-white/5 space-y-6">
            {/* 一行里面的切换行 */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-black/5 dark:border-white/5 mb-5 shrink-0">
              {/* 左侧：店铺切换 */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mr-2 shrink-0">选择店铺:</span>
                {shops.map((shop) => {
                  const isActive = shop.label === activeShop;
                  return (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => setActiveShop(shop.label)}
                      className={cn(
                        "h-9 px-4 rounded-xl text-xs font-black transition-all shrink-0 border flex items-center gap-2",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary/10 shadow-sm"
                          : "bg-white/40 text-muted-foreground border-black/8 hover:text-foreground dark:bg-white/5 dark:border-white/8"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-200", isActive ? "bg-current" : "bg-muted-foreground/45")} />
                      {shop.label}
                    </button>
                  );
                })}
              </div>

              {/* 右侧：模式切换 */}
              <div className="flex p-1 bg-black/[0.03] dark:bg-white/5 rounded-xl self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveFormTab("bill")}
                  className={cn(
                    "h-8 px-4 rounded-lg text-xs font-black transition-all",
                    activeFormTab === "bill"
                      ? "bg-white text-foreground shadow-sm dark:bg-white/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  月账单录入
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab("profile")}
                  className={cn(
                    "h-8 px-4 rounded-lg text-xs font-black transition-all",
                    activeFormTab === "profile"
                      ? "bg-white text-foreground shadow-sm dark:bg-white/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  固定成本设置
                </button>
              </div>
            </div>

            {/* 表单内容 */}
            {activeFormTab === "bill" ? (
              <div className="space-y-5">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-black text-foreground">月账单录入</h3>
                    <p className="mt-1 text-sm text-muted-foreground">选择月份并填写当月的水电物业费用</p>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-4">
                    {/* 账单月份 */}
                    <div className="lg:col-span-1 space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">账单月份</div>
                      <DatePicker
                        value={monthKey}
                        onChange={setMonthKey}
                        mode="month"
                        placeholder="选择月份"
                        showClear={false}
                        className="h-11 w-full"
                        triggerClassName="rounded-xl border border-black/8 bg-white px-4 text-sm text-foreground transition focus:border-primary/40 focus:ring-4 focus:ring-primary/5 dark:border-white/10 dark:bg-white/5"
                      />
                    </div>

                    {/* 费用明细 */}
                    <div className="lg:col-span-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <NumberField label="水费" value={waterInput} onChange={setWaterInput} placeholder="0.00" />
                      <NumberField label="电费" value={electricInput} onChange={setElectricInput} placeholder="0.00" />
                      <NumberField label="公摊" value={sharedElectricInput} onChange={setSharedElectricInput} placeholder="0.00" />
                      <NumberField label="物业费" value={propertyFeeInput} onChange={setPropertyFeeInput} placeholder="0.00" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-black/[0.015] dark:bg-white/[0.01] border border-black/5 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">当月合计</div>
                      <div className="text-3xl font-black tabular-nums leading-none text-foreground tracking-tight">
                        {toCurrency(waterAmount + electricAmount + sharedElectricAmount + propertyFeeAmount)}
                      </div>
                    </div>
                    <div className="h-10 w-px bg-black/8 dark:bg-white/8 hidden sm:block" />
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">日摊成本</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black tabular-nums leading-none text-foreground">{toCurrency(dailyUtilityCost)}</span>
                        <span className="text-xs text-muted-foreground font-semibold">/ 天</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">按 {monthKey} 自然日均摊</div>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveBill}
                    disabled={isSavingBill}
                    className="group relative flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-black text-primary-foreground shadow-sm transition hover:scale-[1.01] hover:opacity-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 shrink-0"
                  >
                    {isSavingBill ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <span>保存月账单</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-lg font-black text-foreground">固定成本设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">维护房租和人工，系统自动折算每日固定成本。</p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <NumberField label="每月房租" value={rentInput} onChange={setRentInput} placeholder="0.00" />
                    <NumberField label="每月人工" value={laborInput} onChange={setLaborInput} placeholder="0.00" />
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-black/[0.015] dark:bg-white/[0.01] border border-black/5 dark:border-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">固定日成本</div>
                      <div className="text-3xl font-black tabular-nums leading-none text-foreground tracking-tight">
                        {toCurrency(dailyFixedCost)}
                      </div>
                    </div>
                    <div className="h-10 w-px bg-black/8 dark:bg-white/8 hidden sm:block" />
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">计算折算</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-semibold text-muted-foreground">
                          ({toCurrency(monthlyRent)} + {toCurrency(monthlyLabor)}) / 30 天
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">配置店铺：{activeShop || "未选择店铺"}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="group relative flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-black text-primary-foreground shadow-sm transition hover:scale-[1.01] hover:opacity-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 shrink-0"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <span>保存固定成本</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div></section>

      {/* 第三层：趋势图表单独一行 */}
      <section className="rounded-[24px] border border-black/8 bg-white/78 p-4 shadow-xs dark:border-white/10 dark:bg-white/5 sm:p-5">
        <div>
          <h2 className="text-base font-black tracking-tight text-foreground">月账单走势</h2>
          <p className="mt-1 text-sm text-muted-foreground">分析最近几个月的非订单成本变化趋势</p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[20px] border border-black/6 bg-white/55 p-3.5 dark:border-white/8 dark:bg-white/3">
            <div className="mb-3">
              <h3 className="text-sm font-black text-foreground">总账单合计</h3>
              <p className="mt-1 text-xs text-muted-foreground">看每个月整体费用波动</p>
            </div>
            <div className="h-[220px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="operatingCostFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                    <XAxis dataKey="monthKey" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="total" name="月账单合计" stroke="#0ea5e9" fill="url(#operatingCostFill)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-black/10 px-6 text-sm text-muted-foreground dark:border-white/10">
                  录入月份账单后，这里会显示趋势
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-black/6 bg-white/55 p-3.5 dark:border-white/8 dark:bg-white/3">
            <div className="mb-3">
              <h3 className="text-sm font-black text-foreground">费用明细对比</h3>
              <p className="mt-1 text-xs text-muted-foreground">对比水费、电费、公摊和物业费变化</p>
            </div>
            <div className="h-[220px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                    <XAxis dataKey="monthKey" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="waterAmount" name="水费" stroke="#38bdf8" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="electricAmount" name="电费" stroke="#f59e0b" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="sharedElectricAmount" name="电费公摊" stroke="#10b981" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="propertyFeeAmount" name="物业费" stroke="#8b5cf6" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[16px] border border-dashed border-black/10 px-6 text-sm text-muted-foreground dark:border-white/10">
                  录入月份账单后，这里会显示趋势
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 第四层：历史账单明细数据表格 (满宽) */}
      <section className="rounded-[24px] border border-black/8 bg-white/78 p-4 shadow-xs dark:border-white/10 dark:bg-white/5 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-black tracking-tight text-foreground">历史明细表格</h2>
            <p className="mt-1 text-sm text-muted-foreground">各月份历史成本账单细节对比，点击编辑可在弹窗中直接修改</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[20px] border border-black/6 dark:border-white/8 bg-white/50 dark:bg-white/2">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/6 dark:border-white/8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground bg-black/1 dark:bg-white/1">
                <th className="px-5 py-3.5 text-center">账单月份</th>
                <th className="px-5 py-3.5 text-center">水费</th>
                <th className="px-5 py-3.5 text-center">电费</th>
                <th className="px-5 py-3.5 text-center">电费公摊</th>
                <th className="px-5 py-3.5 text-center">物业费</th>
                <th className="px-5 py-3.5 text-center">当月账单合计</th>
                <th className="px-5 py-3.5 text-center">当月日摊成本</th>
                <th className="px-5 py-3.5 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/6 dark:divide-white/6">
              {recentBills.length > 0 ? (
                [...recentBills]
                  .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
                  .map((bill) => {
                    const billTotal = bill.waterAmount + bill.electricAmount + bill.sharedElectricAmount + bill.propertyFeeAmount;
                    const isSelected = bill.monthKey === monthKey;
                    const dailyCost = getDailyUtilityCost(bill);
                    return (
                      <tr
                        key={bill.monthKey}
                        className={cn(
                          "transition-colors hover:bg-black/1 dark:hover:bg-white/1",
                          isSelected && "bg-primary/4 dark:bg-primary/6 font-semibold text-primary"
                        )}
                      >
                        <td className="px-5 py-3.5 text-center font-bold text-foreground">{bill.monthKey}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.waterAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.electricAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.sharedElectricAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.propertyFeeAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums font-bold text-foreground">{toCurrency(billTotal)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-muted-foreground">{toCurrency(dailyCost)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(bill)}
                            aria-label={`编辑 ${bill.monthKey} 月账单`}
                            title={`编辑 ${bill.monthKey} 月账单`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/8 bg-white/85 text-foreground transition-all hover:bg-zinc-100 dark:border-white/10 dark:bg-white/6 dark:text-white dark:hover:bg-white/12 cursor-pointer"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    还没有录入过月份账单数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingBill && billDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 transition-[padding] duration-200 lg:left-[calc(var(--sidebar-width,0px)/2)]">
          <button
            type="button"
            aria-label="关闭编辑账单弹窗"
            onClick={handleCloseEditModal}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-[0_24px_80px_rgba(15,23,42,0.28)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(18,21,28,0.98),rgba(11,15,23,0.96))]">
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-4 dark:border-white/8 sm:px-6 sm:py-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">历史账单编辑</div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-foreground sm:text-2xl">{billDraft.monthKey} 月账单</h2>
                <p className="mt-1 text-sm text-muted-foreground">{activeShop} 的历史月账单将直接在这里更新，不影响上方录入表单。</p>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isEditModalSaving}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-black/8 bg-white/80 text-muted-foreground transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/12"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField
                  label="当月水费"
                  value={billDraft.waterInput}
                  onChange={(value) => setBillDraft((current) => current ? { ...current, waterInput: value } : current)}
                  placeholder="0.00"
                />
                <NumberField
                  label="当月电费"
                  value={billDraft.electricInput}
                  onChange={(value) => setBillDraft((current) => current ? { ...current, electricInput: value } : current)}
                  placeholder="0.00"
                />
                <NumberField
                  label="电费公摊"
                  value={billDraft.sharedElectricInput}
                  onChange={(value) => setBillDraft((current) => current ? { ...current, sharedElectricInput: value } : current)}
                  placeholder="0.00"
                />
                <NumberField
                  label="物业费"
                  value={billDraft.propertyFeeInput}
                  onChange={(value) => setBillDraft((current) => current ? { ...current, propertyFeeInput: value } : current)}
                  placeholder="0.00"
                />
              </div>

              <div className="rounded-[22px] border border-black/8 bg-black/[0.03] px-4 py-4 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">当月账单合计</div>
                    <div className="mt-1.5 text-2xl font-black tabular-nums text-foreground">{toCurrency(editingBillTotal)}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    按 {billDraft.monthKey} 自然日均摊为 <span className="font-bold tabular-nums text-foreground">{toCurrency(editingBillDailyCost)}</span> / 天
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  disabled={isEditModalSaving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-black/8 bg-white px-4 text-sm font-medium text-foreground transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/6 dark:hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedBill}
                  disabled={isEditModalSaving}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isEditModalSaving ? "保存中..." : "保存修改"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
