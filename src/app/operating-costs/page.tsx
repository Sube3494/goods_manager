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
import { isAddressDisabled } from "@/lib/addressBook";
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
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground/80">{label}</div>
      <div className="relative flex items-center">
        <span className="absolute left-4 text-sm font-semibold text-muted-foreground/60 select-none">¥</span>
        <input
          value={value}
          onChange={(event) => {
            const next = event.target.value;
            if (!/^\d*(\.\d{0,2})?$/.test(next)) return;
            onChange(next);
          }}
          inputMode="decimal"
          placeholder={placeholder || "0.00"}
          className="h-11 w-full rounded-full border border-border/60 bg-white/70 pl-8 pr-4 text-sm font-bold text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 focus:bg-white dark:border-white/10 dark:bg-white/[0.05] dark:focus:border-primary/40 dark:focus:bg-white/[0.08]"
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
    <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-4 sm:p-5 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent backdrop-blur-md flex flex-col justify-between h-full group">
      {/* 顶部微光光晕 */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity group-hover:opacity-100 dark:bg-primary/15" />
      
      <div className="flex items-center justify-between gap-2 relative z-10">
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground truncate">{label}</span>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-border/50 bg-muted/40 text-primary shadow-2xs transition-all group-hover:scale-105 group-hover:bg-primary/10 dark:border-white/10 dark:bg-white/5 sm:h-10 sm:w-10">
          {icon}
        </div>
      </div>
      <div className="mt-4 flex-1 flex flex-col justify-end relative z-10">
        <div className="text-[22px] font-black leading-none tracking-tight text-foreground sm:text-[28px] break-all truncate" title={value}>
          {value}
        </div>
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-muted-foreground sm:text-xs line-clamp-1" title={hint}>
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
    <div className="min-w-[170px] rounded-[20px] border border-border/60 bg-white/95 px-4 py-3.5 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-gray-900/90">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2.5 space-y-2">
        {payload.map((item) => (
          <div key={String(item.name || "")} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
              <span className="h-2 w-2 rounded-full ring-2 ring-white/20" style={{ backgroundColor: item.color || "#0ea5e9" }} />
              <span>{item.name}</span>
            </div>
            <span className="text-sm font-black tabular-nums text-foreground">
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
  const shops = useMemo(() => (((user as User | null)?.shippingAddresses as AddressItem[] | undefined) || []).filter((item) => item.label?.trim() && !isAddressDisabled(item)), [user]);
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
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-5 sm:p-6 shadow-xs backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-primary/10 text-primary shadow-2xs dark:border-white/10 dark:bg-primary/15">
                <WalletCards size={20} />
              </div>
              <div>
                <h1 className="text-2xl font-black leading-none tracking-tight text-foreground sm:text-3xl">经营成本</h1>
                <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">管理房租、人工、水费、电费、公摊、物业等非订单固定与浮动成本</p>
              </div>
            </div>
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
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-5 shadow-xs backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tight text-foreground">成本录入与设置</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">切换店铺与录入模式，实时折算每日运营成本。</p>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-muted/30 text-xs font-bold text-muted-foreground dark:border-white/10">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span>加载中...</span>
            </div>
          ) : null}
        </div>

        <div className="w-full">
          <div className="rounded-[24px] border border-border/60 bg-white/70 p-5 md:p-6 shadow-xs backdrop-blur-xl dark:border-white/8 dark:bg-white/[0.03] space-y-6">
            {/* 一行里面的切换行 */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-4 border-b border-border/60 dark:border-white/10">
              {/* 左侧：店铺切换胶囊组 */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground mr-1 shrink-0">选择店铺:</span>
                <div className="inline-flex items-center gap-1.5 p-1 rounded-full border border-border/60 bg-muted/30 dark:border-white/10 dark:bg-white/[0.03] shadow-inner">
                  {shops.map((shop) => {
                    const isActive = shop.label === activeShop;
                    return (
                      <button
                        key={shop.id}
                        type="button"
                        onClick={() => setActiveShop(shop.label)}
                        className={cn(
                          "h-8 px-4 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/5"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", isActive ? "bg-white" : "bg-muted-foreground/45")} />
                        {shop.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 右侧：模式切换胶囊 */}
              <div className="inline-flex p-1 bg-muted/40 dark:bg-white/5 border border-border/50 dark:border-white/10 rounded-full self-start lg:self-auto shrink-0 shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveFormTab("bill")}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-black transition-all",
                    activeFormTab === "bill"
                      ? "bg-white text-foreground shadow-sm dark:bg-white/15 dark:text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  月账单录入
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab("profile")}
                  className={cn(
                    "h-8 px-4 rounded-full text-xs font-black transition-all",
                    activeFormTab === "profile"
                      ? "bg-white text-foreground shadow-sm dark:bg-white/15 dark:text-white"
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
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">选择月份并填写当月的水电物业费用</p>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-4">
                    {/* 账单月份 */}
                    <div className="lg:col-span-1 space-y-1.5">
                      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground/80">账单月份</div>
                      <DatePicker
                        value={monthKey}
                        onChange={setMonthKey}
                        mode="month"
                        placeholder="选择月份"
                        showClear={false}
                        className="h-11 w-full"
                        triggerClassName="rounded-full border border-border/60 bg-white/70 px-4 text-sm font-bold text-foreground transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10 dark:border-white/10 dark:bg-white/[0.05] dark:focus:border-primary/40"
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

                <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-border/60 bg-muted/30 p-5 dark:border-white/10 dark:bg-white/[0.03] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">当月合计</div>
                      <div className="text-3xl font-black tabular-nums leading-none text-foreground tracking-tight">
                        {toCurrency(waterAmount + electricAmount + sharedElectricAmount + propertyFeeAmount)}
                      </div>
                    </div>
                    <div className="h-10 w-px bg-border/60 dark:bg-white/10 hidden sm:block" />
                    <div className="space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">日摊成本</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black tabular-nums leading-none text-primary">{toCurrency(dailyUtilityCost)}</span>
                        <span className="text-xs text-muted-foreground font-bold">/ 天</span>
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground">按 {monthKey} 自然日均摊</div>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveBill}
                    disabled={isSavingBill}
                    className="group relative flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 shrink-0"
                  >
                    {isSavingBill ? (
                      <Loader2 className="animate-spin" size={18} />
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
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">维护房租和人工，系统自动折算每日固定成本。</p>
                  </div>

                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <NumberField label="每月房租" value={rentInput} onChange={setRentInput} placeholder="0.00" />
                    <NumberField label="每月人工" value={laborInput} onChange={setLaborInput} placeholder="0.00" />
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-border/60 bg-muted/30 p-5 dark:border-white/10 dark:bg-white/[0.03] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                    <div className="space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">固定日成本</div>
                      <div className="text-3xl font-black tabular-nums leading-none text-foreground tracking-tight">
                        {toCurrency(dailyFixedCost)}
                      </div>
                    </div>
                    <div className="h-10 w-px bg-border/60 dark:bg-white/10 hidden sm:block" />
                    <div className="space-y-1">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/80">计算折算</div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-muted-foreground">
                          ({toCurrency(monthlyRent)} + {toCurrency(monthlyLabor)}) / 30 天
                        </span>
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground">配置店铺：{activeShop || "未选择店铺"}</div>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="group relative flex h-11 sm:h-12 items-center justify-center gap-2 rounded-full bg-primary px-7 text-sm font-black text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50 shrink-0"
                  >
                    {isSavingProfile ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <span>保存固定成本</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 第三层：趋势图表单独一行 */}
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-5 shadow-xs backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:p-6">
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">月账单走势</h2>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">分析最近几个月的非订单成本变化趋势与费用构成对比</p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[22px] border border-border/50 bg-muted/20 p-4.5 dark:border-white/8 dark:bg-white/[0.02]">
            <div className="mb-3">
              <h3 className="text-sm font-black text-foreground">总账单合计</h3>
              <p className="mt-1 text-xs text-muted-foreground">看每个月整体费用波动趋势</p>
            </div>
            <div className="h-[220px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="operatingCostFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.26} />
                        <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="monthKey" tickLine={false} axisLine={false} fontSize={12} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} stroke="currentColor" className="text-muted-foreground" />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="total" name="月账单合计" stroke="#0ea5e9" fill="url(#operatingCostFill)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-border/60 px-6 text-sm font-medium text-muted-foreground dark:border-white/10">
                  录入月份账单后，这里会显示趋势
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-border/50 bg-muted/20 p-4.5 dark:border-white/8 dark:bg-white/[0.02]">
            <div className="mb-3">
              <h3 className="text-sm font-black text-foreground">费用明细对比</h3>
              <p className="mt-1 text-xs text-muted-foreground">对比水费、电费、公摊和物业费变化</p>
            </div>
            <div className="h-[220px] [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_*:focus]:outline-none">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="monthKey" tickLine={false} axisLine={false} fontSize={12} stroke="currentColor" className="text-muted-foreground" />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} stroke="currentColor" className="text-muted-foreground" />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="waterAmount" name="水费" stroke="#38bdf8" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="electricAmount" name="电费" stroke="#f59e0b" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="sharedElectricAmount" name="电费公摊" stroke="#10b981" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                    <Area type="monotone" dataKey="propertyFeeAmount" name="物业费" stroke="#8b5cf6" fill="none" strokeWidth={2.5} dot={{ r: 3.5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-[18px] border border-dashed border-border/60 px-6 text-sm font-medium text-muted-foreground dark:border-white/10">
                  录入月份账单后，这里会显示趋势
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 第四层：历史账单明细数据表格 (满宽) */}
      <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-linear-to-br from-white/95 via-white/85 to-background p-5 shadow-xs backdrop-blur-md dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.03] dark:to-transparent sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-black tracking-tight text-foreground">历史明细表格</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">各月份历史成本账单细节对比，点击编辑可在弹窗中直接修改</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[20px] border border-border/60 dark:border-white/10 bg-white/50 dark:bg-white/[0.02]">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 dark:border-white/10 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground bg-muted/40 dark:bg-white/5">
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
            <tbody className="divide-y divide-border/40 dark:divide-white/5">
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
                          "transition-colors hover:bg-primary/[0.03] dark:hover:bg-white/[0.03]",
                          isSelected && "bg-primary/5 dark:bg-primary/10 font-semibold"
                        )}
                      >
                        <td className="px-5 py-3.5 text-center font-bold text-foreground">
                          <span className={cn("px-2.5 py-1 rounded-full text-xs", isSelected ? "bg-primary/15 text-primary dark:text-primary font-black" : "text-foreground")}>
                            {bill.monthKey}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.waterAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.electricAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.sharedElectricAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-foreground">{toCurrency(bill.propertyFeeAmount)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums font-black text-foreground">{toCurrency(billTotal)}</td>
                        <td className="px-5 py-3.5 text-center tabular-nums text-muted-foreground">{toCurrency(dailyCost)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(bill)}
                              aria-label={`编辑 ${bill.monthKey} 月账单`}
                              title={`编辑 ${bill.monthKey} 月账单`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-white dark:border-white/10 dark:bg-white/5 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all shadow-2xs cursor-pointer active:scale-90"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    还没有录入过月份账单数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingBill && billDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 transition-[padding] duration-200">
          <div
            aria-label="关闭编辑账单弹窗"
            onClick={handleCloseEditModal}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[32px] border border-border/60 bg-white dark:bg-gray-900/75 dark:border-white/10 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5 dark:border-white/10 bg-white/50 dark:bg-white/[0.03]">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">历史账单编辑</div>
                <h2 className="mt-1 text-xl font-black tracking-tight text-foreground sm:text-2xl">{billDraft.monthKey} 月账单</h2>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{activeShop} 的历史月账单将直接在这里更新，不影响上方录入表单。</p>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                disabled={isEditModalSaving}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-white/80 text-muted-foreground transition-all hover:bg-muted dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
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

              <div className="rounded-[22px] border border-border/60 bg-muted/30 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">当月账单合计</div>
                    <div className="mt-1.5 text-2xl font-black tabular-nums text-foreground">{toCurrency(editingBillTotal)}</div>
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    按 {billDraft.monthKey} 自然日均摊为 <span className="font-bold tabular-nums text-foreground">{toCurrency(editingBillDailyCost)}</span> / 天
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end border-t border-border/60 dark:border-white/10 pt-5">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  disabled={isEditModalSaving}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border/60 bg-white px-6 text-sm font-bold text-foreground transition-all hover:bg-muted dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedBill}
                  disabled={isEditModalSaving}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-7 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
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
