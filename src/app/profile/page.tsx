"use client";

import { useState, useEffect, useRef } from "react";
import {
  User,
  Mail,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Plus,
  Trash2,
  Star,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Home,
  ChevronDown,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/ui/Toast";
import { Switch } from "@/components/ui/Switch";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import md5 from "blueimp-md5";
import { User as UserType, AddressItem } from "@/lib/types";
import { buildAddressDisplay, normalizeAddressItemParts } from "@/lib/addressBook";
import { hasPermission, SessionUser } from "@/lib/permissions";

export default function ProfilePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const typedUser = user as unknown as UserType;
  const { showToast } = useToast();
  const canUseBrushSimulation = hasPermission(user as SessionUser | null, "brush:simulate");
  const [name, setName] = useState("");
  const [addressList, setAddressList] = useState<AddressItem[]>([]);
  const [brushCommissionBoostEnabled, setBrushCommissionBoostEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "invalid" | "error">("idle");
  const [expandedAddressId, setExpandedAddressId] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildProfileSnapshot = (
    nextName: string,
    nextAddressList: AddressItem[],
    nextBrushCommissionBoostEnabled: boolean,
    nextCanUseBrushSimulation: boolean
  ) =>
    JSON.stringify({
      name: nextName,
      shippingAddresses: nextAddressList,
      ...(nextCanUseBrushSimulation ? { brushCommissionBoostEnabled: nextBrushCommissionBoostEnabled } : {}),
    });

  useEffect(() => {
    if (!typedUser) {
      return;
    }

    const nextName = typedUser.name || "";
    setName(nextName);

    let nextAddressList: AddressItem[] = [];
    const addresses = typedUser?.shippingAddresses;
    if (Array.isArray(addresses)) {
      nextAddressList = addresses.map((item) => ({
        ...item,
        ...normalizeAddressItemParts(item),
        address: item.address || buildAddressDisplay(item),
      }));
    } else if (typeof typedUser?.shippingAddress === "string" && typedUser.shippingAddress) {
      const parsed = normalizeAddressItemParts({ address: typedUser.shippingAddress });
      nextAddressList = [
        {
          id: "legacy",
          label: "默认地址",
          address: typedUser.shippingAddress,
          ...parsed,
          isDefault: true,
        },
      ];
    }
    setAddressList(nextAddressList);
    const nextBrushCommissionBoostEnabled = canUseBrushSimulation && Boolean(typedUser.brushCommissionBoostEnabled);
    setBrushCommissionBoostEnabled(nextBrushCommissionBoostEnabled);
    setExpandedAddressId((current) => current && nextAddressList.some((item) => item.id === current) ? current : null);
    lastSavedSnapshotRef.current = buildProfileSnapshot(nextName, nextAddressList, nextBrushCommissionBoostEnabled, canUseBrushSimulation);
    initializedRef.current = true;
    setSaveState("idle");
  }, [typedUser?.name, typedUser?.shippingAddress, typedUser?.shippingAddresses, typedUser?.brushCommissionBoostEnabled]);

  const saveProfile = async (nextName: string, nextAddressList: AddressItem[], nextBrushCommissionBoostEnabled: boolean, silent = true) => {
    const missingLabel = nextAddressList.find((item) => !String(item.label || "").trim());
    if (missingLabel) {
      setSaveState("invalid");
      if (!silent) {
        showToast("有门店缺少门店简称", "error");
      }
      return false;
    }

    const missingAddress = nextAddressList.find((item) => !String(item.detailAddress || "").trim());
    if (missingAddress) {
      setSaveState("invalid");
      if (!silent) {
        showToast("有门店缺少详细地址", "error");
      }
      return false;
    }

    const snapshot = buildProfileSnapshot(nextName, nextAddressList, nextBrushCommissionBoostEnabled, canUseBrushSimulation);
    if (snapshot === lastSavedSnapshotRef.current) {
      setSaveState("saved");
      return true;
    }

    setSaveState("saving");
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          shippingAddresses: nextAddressList,
          ...(canUseBrushSimulation ? { brushCommissionBoostEnabled: nextBrushCommissionBoostEnabled } : {}),
        }),
      });

      if (res.ok) {
        lastSavedSnapshotRef.current = snapshot;
        setSaveState("saved");
        return true;
      } else {
        const data = await res.json().catch(() => null);
        setSaveState("error");
        showToast(data?.error || "更新失败", "error");
      }
    } catch (error) {
      console.error("Save profile failed:", error);
      setSaveState("error");
      showToast("网络错误", "error");
    } finally {
      setIsSaving(false);
    }
    return false;
  };

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    const snapshot = buildProfileSnapshot(name, addressList, brushCommissionBoostEnabled, canUseBrushSimulation);
    if (snapshot === lastSavedSnapshotRef.current) {
      setSaveState("saved");
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveProfile(name, addressList, brushCommissionBoostEnabled, true);
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [name, addressList, brushCommissionBoostEnabled]);

  const getPasswordStrength = (value: string) => {
    if (!value) {
      return { label: "未设置", tone: "text-muted-foreground", bar: "bg-muted", score: 0 };
    }

    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Za-z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score += 1;

    if (score <= 1) {
      return { label: "较弱", tone: "text-red-500", bar: "bg-red-500", score };
    }
    if (score <= 3) {
      return { label: "中等", tone: "text-amber-500", bar: "bg-amber-500", score };
    }

    return { label: "较强", tone: "text-emerald-500", bar: "bg-emerald-500", score };
  };

  const passwordStrength = getPasswordStrength(newPassword);
  const defaultAddress = addressList.find((item) => item.isDefault) || null;
  const identityLabel = user?.role === "SUPER_ADMIN" ? "超级管理员" : (user?.roleProfile?.name || "普通成员");
  const saveStateLabel = {
    idle: "待编辑",
    saving: "正在保存",
    saved: "已实时保存",
    invalid: "待补全后保存",
    error: "保存失败",
  }[saveState];
  const topStats = [
    {
      label: "账户身份",
      value: identityLabel,
      hint: "当前账号的系统角色",
    },
    {
      label: "地址档案",
      value: `${addressList.length} 条`,
      hint: defaultAddress?.label || "尚未设置默认地址",
    },
    {
      label: "安全状态",
      value: user?.hasPassword ? "已启用密码" : "待完善",
      hint: user?.hasPassword ? "可以直接修改登录密码" : "建议尽快设置登录密码",
    },
  ];

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("请完整填写密码信息", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("两次输入的新密码不一致", "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast("密码修改成功", "success");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
      } else {
        showToast(data.error || "修改密码失败", "error");
      }
    } catch (error) {
      console.error("Change password failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] px-2.5 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 hidden h-72 w-72 rounded-full bg-primary/6 blur-3xl lg:block" />
        <div className="absolute right-0 top-20 hidden h-80 w-80 rounded-full bg-sky-500/7 blur-3xl dark:bg-white/5 lg:block" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-4 sm:space-y-5">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/88 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/84 dark:shadow-black/20 sm:rounded-[26px]">
          <div className="border-b border-border/60 px-3.5 py-3.5 sm:px-6 sm:py-4 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                <Link href="/" className="group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/82 text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:text-primary dark:bg-white/5 sm:h-11 sm:w-11">
                  <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
                </Link>
                <a
                  href="https://cravatar.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="前往 Cravatar 设置头像"
                  className="group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow-md shadow-black/10 dark:border-white/60 dark:bg-white/10 sm:h-14 sm:w-14"
                >
                  {user?.email ? (
                    <Image
                      src={`https://cravatar.cn/avatar/${md5(user.email)}?d=mp&s=200`}
                      alt="当前用户头像"
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <User size={28} className="text-white" />
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-[28px]">个人中心</h1>
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-white/80 px-2.5 py-1 text-[10px] font-black text-foreground dark:bg-white/10 sm:px-3 sm:text-[11px]">
                      {identityLabel}
                    </span>
                  </div>
                  <p className="mt-1 break-all text-xs leading-relaxed text-muted-foreground sm:text-sm">{user?.name || "未命名用户"} · {user?.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <a href="#profile-core" className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">基本资料</a>
                <a href="#security-center" className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">账号安全</a>
                <a href="#address-library" className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">地址库</a>
                <a
                  href="https://cravatar.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-white/82 px-3 text-sm font-black text-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5 sm:px-4"
                >
                  <ExternalLink size={15} />
                  头像设置
                </a>
                <div className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border/70 bg-white/82 px-4 text-sm font-black text-foreground dark:bg-white/5 sm:col-span-1 sm:justify-start">
                  {isSaving ? <Loader2 size={15} className="animate-spin text-primary" /> : <div className={`h-2.5 w-2.5 rounded-full ${saveState === "saved" ? "bg-emerald-500" : saveState === "saving" ? "bg-primary" : saveState === "error" ? "bg-destructive" : saveState === "invalid" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />}
                  {saveStateLabel}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 px-3.5 py-3.5 sm:gap-3 sm:px-6 sm:py-4 md:grid-cols-3 lg:px-8 xl:grid-cols-3">
            {topStats.map((item) => (
              <div key={item.label} className="rounded-[18px] border border-border/60 bg-white/78 px-3.5 py-3 shadow-sm dark:bg-white/[0.05] sm:rounded-[20px] sm:px-4 sm:py-3.5">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">{item.label}</div>
                <div className="mt-1 text-base font-black text-foreground sm:mt-1.5 sm:text-xl">{item.value}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.hint}</div>
              </div>
            ))}
          </div>
        </motion.section>

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
          <motion.section id="profile-core" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[24px]">
            <div className="border-b border-border/60 px-3.5 py-3.5 sm:px-6 sm:py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Profile</div>
              <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">基本资料</h3>
            </div>
            <div className="space-y-4 p-3.5 sm:p-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                  <User size={14} className="text-primary" />
                  显示名称
                </label>
                <input
                  type="text"
                  placeholder="请输入您的真实姓名或昵称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                />
                <p className="text-[11px] text-muted-foreground/65">这个名字会在系统内的个人信息、操作记录和协作场景中展示。</p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                  <Mail size={14} className="text-primary" />
                  登录邮箱
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  disabled
                  className="h-12 w-full cursor-not-allowed rounded-2xl border border-border/60 bg-muted/25 px-4 text-sm text-muted-foreground dark:bg-white/5"
                />
                <p className="text-[11px] text-muted-foreground/65">邮箱是账号唯一标识，不支持在这里手动修改。</p>
              </div>

              {canUseBrushSimulation ? (
              <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-white/78 px-4 py-4 shadow-sm dark:bg-white/[0.05]">
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">刷单模拟显示</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">只影响你自己在刷单页看到的实付和到手模拟值，不会改动订单里的原始金额。</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`text-xs font-bold ${brushCommissionBoostEnabled ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {brushCommissionBoostEnabled ? "已开启" : "已关闭"}
                  </span>
                  <Switch checked={brushCommissionBoostEnabled} onChange={setBrushCommissionBoostEnabled} />
                </div>
              </div>
              ) : null}
            </div>
          </motion.section>

          <motion.section id="security-center" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[24px]">
            <div className="border-b border-border/60 px-3.5 py-3.5 sm:px-6 sm:py-4">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Security</div>
              <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">账号安全</h3>
            </div>
            <div className="grid gap-4 p-3.5 sm:gap-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-3">
                {[
                  {
                    label: "当前密码",
                    value: currentPassword,
                    setValue: setCurrentPassword,
                    show: showCurrentPassword,
                    setShow: setShowCurrentPassword,
                    placeholder: "请输入当前密码",
                    icon: KeyRound,
                  },
                  {
                    label: "新密码",
                    value: newPassword,
                    setValue: setNewPassword,
                    show: showNewPassword,
                    setShow: setShowNewPassword,
                    placeholder: "请输入新密码",
                    icon: KeyRound,
                  },
                  {
                    label: "确认新密码",
                    value: confirmPassword,
                    setValue: setConfirmPassword,
                    show: showConfirmPassword,
                    setShow: setShowConfirmPassword,
                    placeholder: "请再次输入新密码",
                    icon: ShieldCheck,
                  },
                ].map((field) => (
                  <div key={field.label} className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                      <field.icon size={14} className="text-primary" />
                      {field.label}
                    </label>
                    <div className="relative">
                      <input
                        type={field.show ? "text" : "password"}
                        value={field.value}
                        onChange={(e) => field.setValue(e.target.value)}
                        placeholder={field.placeholder}
                        className="h-11 w-full rounded-2xl border border-border bg-white px-4 pr-12 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => field.setShow((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                      >
                        {field.show ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[20px] border border-border/60 bg-white/78 p-3.5 shadow-sm dark:bg-white/[0.05] sm:rounded-[24px] sm:p-4">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">安全概览</div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">密码强度</span>
                  <span className={passwordStrength.tone}>{passwordStrength.label}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((level) => (
                    <div key={level} className={`h-1.5 rounded-full transition-all ${passwordStrength.score >= level ? passwordStrength.bar : "bg-white/10"}`} />
                  ))}
                </div>
                <div className="mt-4 space-y-3 text-[12px] leading-relaxed text-muted-foreground">
                  <div className="rounded-2xl border border-border/60 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">建议使用字母、数字和符号组合，避免与其他平台重复。</div>
                  <div className="rounded-2xl border border-border/60 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">如果忘记密码，也可以在登录页通过邮箱验证码快速重置。</div>
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 text-sm font-black text-primary transition-all hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  更新登录密码
                </button>
              </div>
            </div>
          </motion.section>
        </div>

        <motion.section id="address-library" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[24px]">
          <div className="flex flex-col gap-3 border-b border-border/60 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Addresses</div>
              <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">收货地址库</h3>
              <p className="mt-1 text-sm text-muted-foreground">保存后会按详细地址自动解析门店经纬度，后续采购和距离预估优先使用这组数据。</p>
            </div>
            <button
              onClick={() => {
                const newAddress = { id: Math.random().toString(36).slice(2, 11), label: "", address: "", detailAddress: "", contactName: "", contactPhone: "", isDefault: addressList.length === 0 };
                setAddressList([newAddress, ...addressList]);
                setExpandedAddressId(newAddress.id);
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-4 text-sm font-black text-primary transition-all hover:bg-primary/12 sm:w-auto"
            >
              <Plus size={16} />
              添加地址
            </button>
          </div>

          <div className="p-3.5 sm:p-6">
            {addressList.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-dashed border-border/50 bg-muted/10 text-center">
                <Home size={30} className="text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-black text-foreground">地址库还是空的</p>
                  <p className="mt-1 text-xs text-muted-foreground">先添加一个默认收货地址，后续采购和物流会更顺手。</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3.5 sm:gap-4">
                {addressList.map((item, index) => (
                  <div key={item.id} className="rounded-[20px] border border-border/60 bg-white/78 p-3.5 shadow-sm dark:bg-white/[0.05] sm:rounded-[22px] sm:p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-white/80 text-sm font-black text-foreground dark:bg-white/[0.05]">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setExpandedAddressId(expandedAddressId === item.id ? null : item.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-sm font-black text-foreground">
                              {String(item.label || "").trim() || "未命名门店"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.contactName || "未填联系人"}{item.contactPhone ? ` · ${item.contactPhone}` : ""}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {buildAddressDisplay(item) || item.detailAddress || "请补全详细地址"}
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedAddressId(expandedAddressId === item.id ? null : item.id)}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border/60 bg-white text-muted-foreground transition-all hover:text-foreground dark:bg-white/5"
                            >
                              <ChevronDown size={16} className={`transition-transform ${expandedAddressId === item.id ? "rotate-180" : ""}`} />
                            </button>
                            <button
                              onClick={() => {
                                setAddressList(addressList.filter((_, i) => i !== index));
                                if (expandedAddressId === item.id) {
                                  setExpandedAddressId(null);
                                }
                              }}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-destructive/15 bg-destructive/5 text-destructive transition-all hover:bg-destructive/10"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.isDefault ? (
                            <div className="inline-flex h-9 items-center gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 text-xs font-black text-amber-600 dark:text-amber-400">
                              <Star size={13} fill="currentColor" />
                              默认地址
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddressList(addressList.map((a, i) => ({ ...a, isDefault: i === index })))}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-white px-3 text-xs font-black text-muted-foreground transition-all hover:border-amber-500/25 hover:text-amber-600 dark:bg-white/5"
                            >
                              <Star size={13} />
                              设为默认
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {expandedAddressId === item.id ? (
                    <div className="mt-3.5 grid gap-3 border-t border-border/50 pt-3.5 sm:mt-4 sm:pt-4">
                      <input
                        type="text"
                        placeholder="门店简称（必填）"
                        value={item.label}
                        onChange={(e) => {
                          const newList = [...addressList];
                          newList[index] = { ...newList[index], label: e.target.value };
                          setAddressList(newList);
                        }}
                        className={`h-11 min-w-0 w-full rounded-2xl border bg-white px-4 text-sm font-bold outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 ${
                          String(item.label || "").trim() ? "border-border dark:border-white/10" : "border-destructive/35"
                        }`}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="text"
                          placeholder="联系人"
                          value={item.contactName || ""}
                          onChange={(e) => {
                            const newList = [...addressList];
                            newList[index] = { ...newList[index], contactName: e.target.value };
                            setAddressList(newList);
                          }}
                          className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                        />
                        <input
                          type="text"
                          placeholder="联系电话"
                          value={item.contactPhone || ""}
                          onChange={(e) => {
                            const newList = [...addressList];
                            newList[index] = { ...newList[index], contactPhone: e.target.value };
                            setAddressList(newList);
                          }}
                          className="h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                        />
                      </div>

                      <textarea
                        placeholder="详细地址..."
                        value={item.detailAddress || ""}
                        onChange={(e) => {
                          const newList = [...addressList];
                          newList[index] = { ...newList[index], detailAddress: e.target.value };
                          setAddressList(newList);
                        }}
                        rows={3}
                        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-7 outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                      />

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
                        <div className="rounded-2xl border border-border/60 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">展示地址</div>
                          <div className="mt-2 break-words text-sm text-foreground">{buildAddressDisplay(item) || "请补全联系人、电话和详细地址"}</div>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">抽出率</div>
                          <div className="relative mt-2">
                            <input
                              type="number"
                              placeholder="6"
                              step="0.1"
                              value={item.serviceFeeRate !== undefined ? (item.serviceFeeRate * 100).toString() : ""}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                const newList = [...addressList];
                                newList[index] = { ...newList[index], serviceFeeRate: isNaN(val) ? undefined : val / 100 };
                                setAddressList(newList);
                              }}
                              className="h-11 w-full rounded-xl border border-border bg-white px-3 pr-8 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/60 bg-white/80 px-4 py-3 dark:bg-white/[0.05]">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">门店坐标</div>
                        <div className="mt-2 font-mono text-sm text-foreground">{item.longitude != null && item.latitude != null ? `${item.longitude}, ${item.latitude}` : "保存后自动生成"}</div>
                      </div>
                    </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
