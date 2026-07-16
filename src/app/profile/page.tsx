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
  KeyRound,
  Send,
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
import { hasPermission, SessionUser } from "@/lib/permissions";
import { CustomSelect } from "@/components/ui/CustomSelect";

export default function ProfilePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const typedUser = user as unknown as UserType;
  const { showToast } = useToast();
  const canUseBrushSimulation = hasPermission(user as SessionUser | null, "brush:simulate");
  const [name, setName] = useState("");
  const [addressList, setAddressList] = useState<AddressItem[]>([]);
  const [libraries, setLibraries] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/product-libraries")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const libs = Array.isArray(data) ? data : (data.libraries || []);
        setLibraries(libs);
      })
      .catch((err) => console.error("Failed to load libraries:", err));
  }, []);

  useEffect(() => {
    if (libraries.length > 0 && addressList.length > 0) {
      let changed = false;
      const newList = addressList.map((item) => {
        if (!item.libraryId) {
          changed = true;
          return { ...item, libraryId: libraries[0].id };
        }
        return item;
      });
      if (changed) {
        setAddressList(newList);
      }
    }
  }, [libraries]);

  const [brushCommissionBoostEnabled, setBrushCommissionBoostEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "invalid" | "error">("idle");
  const [expandedAddressId, setExpandedAddressId] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastSavedSnapshotRef = useRef("");

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
        address: item.detailAddress || item.address || "",
        detailAddress: item.detailAddress || item.address || "",
        contactName: "",
        contactPhone: "",
      }));
    } else if (typeof typedUser?.shippingAddress === "string" && typedUser.shippingAddress) {
      nextAddressList = [
        {
          id: "legacy",
          label: "常用地址",
          address: typedUser.shippingAddress,
          detailAddress: typedUser.shippingAddress,
          contactName: "",
          contactPhone: "",
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
    const snapshot = buildProfileSnapshot(nextName, nextAddressList, nextBrushCommissionBoostEnabled, canUseBrushSimulation);
    if (snapshot === lastSavedSnapshotRef.current) {
      setSaveState("saved");
      return true;
    }

    const lastSaved = JSON.parse(lastSavedSnapshotRef.current || "{}") as {
      name?: string;
      shippingAddresses?: AddressItem[];
      brushCommissionBoostEnabled?: boolean;
    };
    const hasNameChanged = nextName !== (lastSaved.name || "");
    const hasAddressesChanged = JSON.stringify(nextAddressList) !== JSON.stringify(lastSaved.shippingAddresses || []);
    const hasBrushSimulationChanged = nextBrushCommissionBoostEnabled !== Boolean(lastSaved.brushCommissionBoostEnabled);

    if (hasAddressesChanged) {
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
    }

    setSaveState("saving");
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (hasNameChanged) {
        payload.name = nextName;
      }
      if (hasAddressesChanged) {
        payload.shippingAddresses = nextAddressList;
      }
      if (canUseBrushSimulation && hasBrushSimulationChanged) {
        payload.brushCommissionBoostEnabled = nextBrushCommissionBoostEnabled;
      }

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    setSaveState(snapshot === lastSavedSnapshotRef.current ? "saved" : "idle");
  }, [name, addressList, brushCommissionBoostEnabled, canUseBrushSimulation]);

  useEffect(() => {
    if (codeCooldown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCodeCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [codeCooldown]);

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
  const identityLabel = user?.role === "SUPER_ADMIN" ? "超级管理员" : (user?.roleProfile?.name || "普通成员");

  const handleSendVerificationCode = async () => {
    if (!user?.email || isSendingCode || codeCooldown > 0) {
      return;
    }

    if (!newPassword || !confirmPassword) {
      showToast("请先输入并确认新密码", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("两次输入的新密码不一致", "error");
      return;
    }

    setIsSendingCode(true);
    try {
      const res = await fetch("/api/auth/forgot-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok) {
        setCodeCooldown(60);
        showToast("验证码已发送到当前登录邮箱", "success");
      } else {
        showToast(data?.error || "验证码发送失败", "error");
      }
    } catch (error) {
      console.error("Send verification code failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email || !verificationCode || !newPassword || !confirmPassword) {
      showToast("请完整填写验证码和新密码", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("两次输入的新密码不一致", "error");
      return;
    }

    setIsChangingPassword(true);
    try {
      const verifyRes = await fetch("/api/auth/forgot-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          code: verificationCode,
        }),
      });

      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok || !verifyData?.resetToken) {
        showToast(verifyData?.error || "验证码校验失败", "error");
        return;
      }

      const resetRes = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: verifyData.resetToken,
          password: newPassword,
          confirmPassword,
        }),
      });

      const resetData = await resetRes.json().catch(() => null);
      if (resetRes.ok) {
        showToast("密码修改成功", "success");
        setVerificationCode("");
        setNewPassword("");
        setConfirmPassword("");
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setCodeCooldown(0);
      } else {
        showToast(resetData?.error || "修改密码失败", "error");
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
          <div className="px-3.5 py-3.5 sm:px-6 sm:py-4 lg:px-8">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <div className="flex items-start gap-3 sm:gap-4">
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
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-[28px]">个人中心</h1>
                    <span className="inline-flex items-center rounded-full border border-border/60 bg-white/80 px-2.5 py-1 text-[10px] font-black text-foreground dark:bg-white/10 sm:px-3 sm:text-[11px]">
                        {identityLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">集中管理你的基本资料、账号安全和常用收货地址。</p>
                </div>
              </div>

              <div className="space-y-2.5 xl:max-w-[460px] xl:justify-self-end">
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <a href="#profile-core" className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">基本资料</a>
                  <a href="#security-center" className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">账号安全</a>
                  <a href="#address-library" className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-2xl border border-border/70 bg-white/82 px-3 text-xs font-black text-muted-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5">地址库</a>
                  <a
                    href="https://cravatar.cn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-border/70 bg-white/82 px-3 text-sm font-black text-foreground transition-all hover:border-primary/30 hover:text-primary dark:bg-white/5 sm:px-4"
                  >
                    <ExternalLink size={15} />
                    头像设置
                  </a>
                </div>

              </div>
            </div>
          </div>
        </motion.section>

        <motion.section id="profile-core" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[24px]">
          <div className="border-b border-border/60 px-3.5 py-3.5 sm:px-6 sm:py-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Profile</div>
            <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">基本资料</h3>
          </div>
          <div className="grid gap-4 p-3.5 sm:gap-5 sm:p-6">
            <div className="rounded-[22px] border border-border/60 bg-white/78 p-4 shadow-sm dark:bg-white/[0.05] sm:p-5">
              <div className="mb-4">
                <div className="text-sm font-black text-foreground">账号资料</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/70">这里保留基础身份信息，避免和上面的导航区重复展示。</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
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
              </div>
            </div>

            {canUseBrushSimulation ? (
              <div className="rounded-[22px] border border-border/60 bg-white/78 px-4 py-3.5 shadow-sm dark:bg-white/[0.05] sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-foreground">刷单模拟显示</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/70">只影响刷单页看到的模拟金额，不会改动订单原始金额。</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`text-xs font-bold ${brushCommissionBoostEnabled ? "text-emerald-500" : "text-muted-foreground"}`}>
                      {brushCommissionBoostEnabled ? "已开启" : "已关闭"}
                    </span>
                    <Switch checked={brushCommissionBoostEnabled} onChange={setBrushCommissionBoostEnabled} />
                  </div>
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
            <div className="space-y-4 p-3.5 sm:space-y-5 sm:p-6">
              <div className="space-y-4">
                <div className="rounded-[20px] border border-border/60 bg-white/78 p-4 shadow-sm dark:bg-white/[0.05] sm:rounded-[24px] sm:p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-xs font-black text-primary">1</div>
                    <div>
                      <div className="text-sm font-black text-foreground">设置新密码</div>
                      <div className="text-[11px] text-muted-foreground">先确认你要更新成的新密码。</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="grid gap-3 lg:grid-cols-2">
                    {[
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
                            className="h-12 w-full rounded-2xl border border-border bg-white px-4 pr-12 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                          />
                          <button
                            type="button"
                            onClick={() => field.setShow((prev: boolean) => !prev)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground"
                          >
                            {field.show ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    </div>
                    <div className="rounded-2xl border border-border/50 bg-white/60 px-3.5 py-3 dark:bg-white/[0.04]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">密码强度</span>
                        <span className={passwordStrength.tone}>{passwordStrength.label}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1.5">
                        {[1, 2, 3, 4].map((level) => (
                          <div key={level} className={`h-1.5 rounded-full transition-all ${passwordStrength.score >= level ? passwordStrength.bar : "bg-white/10"}`} />
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">建议使用字母、数字和符号组合，避免与其他平台重复。</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-border/60 bg-white/78 p-4 shadow-sm dark:bg-white/[0.05] sm:rounded-[24px] sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-primary/15 bg-primary/8 text-xs font-black text-primary">2</div>
                      <div>
                        <div className="text-sm font-black text-foreground">邮箱确认</div>
                        <div className="text-[11px] text-muted-foreground">验证码会发送到当前登录邮箱，确认是你本人在操作。</div>
                      </div>
                    </div>
                    <button
                      onClick={handleChangePassword}
                      disabled={isChangingPassword || !verificationCode || !newPassword || !confirmPassword}
                      className="inline-flex h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/6 px-5 text-sm font-black text-primary transition-all hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                      确认并更新密码
                    </button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                      <Mail size={14} className="text-primary" />
                      邮箱验证码
                    </label>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_max-content]">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="请输入 6 位验证码"
                        className="h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                      />
                      <button
                        type="button"
                        onClick={handleSendVerificationCode}
                        disabled={isSendingCode || codeCooldown > 0 || !user?.email || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                        className="inline-flex h-12 min-w-[168px] items-center justify-center whitespace-nowrap rounded-2xl border border-border/70 bg-white/85 px-5 text-[13px] font-black text-foreground transition-all hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white/10 sm:text-sm"
                      >
                        {isSendingCode ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
                        <span className="ml-1.5">{codeCooldown > 0 ? `${codeCooldown}s` : "发送验证码"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
        </motion.section>

        <motion.section id="address-library" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="overflow-hidden rounded-[22px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[24px]">
          <div className="flex flex-col gap-3 border-b border-border/60 px-3.5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Addresses</div>
              <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">收货地址库</h3>
              <p className="mt-1 text-sm text-muted-foreground">维护你常用的门店简称、联系人和详细地址，采购时可以直接复用。</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => void saveProfile(name, addressList, brushCommissionBoostEnabled, false)}
                  disabled={isSaving || saveState === "saving" || saveState === "saved"}
                  className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-primary/20 bg-primary/8 px-4 text-sm font-black text-primary transition-all hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
                  保存资料
                </button>
                <button
                  onClick={() => {
                    const newAddress = { id: Math.random().toString(36).slice(2, 11), label: "", address: "", detailAddress: "", contactName: "", contactPhone: "", isDefault: false, libraryId: libraries[0]?.id || "" };
                    setAddressList([newAddress, ...addressList]);
                    setExpandedAddressId(newAddress.id);
                  }}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-4 text-sm font-black text-primary transition-all hover:bg-primary/12"
                >
                  <Plus size={16} />
                  添加地址
                </button>
              </div>
          </div>

          <div className="p-3.5 sm:p-6">
            {addressList.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-dashed border-border/50 bg-muted/10 text-center">
                <Home size={30} className="text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-black text-foreground">地址库还是空的</p>
                  <p className="mt-1 text-xs text-muted-foreground">先添加一个常用收货地址，后续采购和物流会更顺手。</p>
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
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-black text-foreground">
                                {String(item.label || "").trim() || "未命名门店"}
                              </span>
                              {(() => {
                                const matchedLib = libraries.find((lib) => lib.id === item.libraryId);
                                if (!matchedLib) return null;
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
                                    <span className="h-1 w-1 rounded-full bg-purple-500" />
                                    {matchedLib.name}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {item.detailAddress || "请补全详细地址"}
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
                      </div>
                    </div>

                    {expandedAddressId === item.id ? (
                    <div className="mt-3.5 grid gap-3 border-t border-border/50 pt-3.5 sm:mt-4 sm:pt-4">
                      <div className="grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
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
                        <div>
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
                              className="h-11 w-full rounded-2xl border border-border bg-white px-4 pr-10 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">%</span>
                          </div>
                        </div>
                      </div>

                      <textarea
                        placeholder="详细地址..."
                        value={item.detailAddress || ""}
                        onChange={(e) => {
                          const newList = [...addressList];
                          newList[index] = { ...newList[index], detailAddress: e.target.value, address: e.target.value, contactName: "", contactPhone: "" };
                          setAddressList(newList);
                        }}
                        rows={3}
                        className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-7 outline-none transition-all focus:ring-2 focus:ring-primary/20 dark:bg-white/5 dark:border-white/10"
                      />

                      {libraries.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">绑定商品库</div>
                          <CustomSelect
                            options={libraries.map((lib) => ({ value: lib.id, label: lib.name }))}
                            value={item.libraryId || libraries[0]?.id || ""}
                            onChange={(val) => {
                              const newList = [...addressList];
                              newList[index] = { ...newList[index], libraryId: val };
                              setAddressList(newList);
                            }}
                            triggerClassName="h-11 w-full rounded-2xl border border-border bg-white dark:bg-white/5 dark:border-white/10 text-sm font-bold text-foreground px-4"
                            searchable={true}
                            searchPlaceholder="选择或搜索商品库..."
                          />
                        </div>
                      )}

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
