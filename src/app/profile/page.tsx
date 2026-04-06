"use client";

import { useState, useEffect } from "react";
import {
  User,
  Mail,
  Save,
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
  Sparkles,
  BadgeCheck,
  Home,
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { useToast } from "@/components/ui/Toast";
import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import md5 from "blueimp-md5";
import { User as UserType, AddressItem } from "@/lib/types";

export default function ProfilePage() {
  const { user, isLoading: isUserLoading } = useUser();
  const typedUser = user as unknown as UserType;
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [addressList, setAddressList] = useState<AddressItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (typedUser?.name) {
      setName(typedUser.name);
    }

    const addresses = typedUser?.shippingAddresses;
    if (Array.isArray(addresses)) {
      setAddressList(addresses);
    } else if (typeof typedUser?.shippingAddress === "string" && typedUser.shippingAddress) {
      setAddressList([
        {
          id: "legacy",
          label: "默认地址",
          address: typedUser.shippingAddress,
          isDefault: true,
        },
      ]);
    }
  }, [typedUser?.name, typedUser?.shippingAddress, typedUser?.shippingAddresses]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          shippingAddresses: addressList,
        }),
      });

      if (res.ok) {
        showToast("个人信息已更新", "success");
        window.location.reload();
      } else {
        showToast("更新失败", "error");
      }
    } catch (error) {
      console.error("Save profile failed:", error);
      showToast("网络错误", "error");
    } finally {
      setIsSaving(false);
    }
  };

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
    <div className="relative min-h-[calc(100dvh-4rem)] px-1 py-5 sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 top-0 hidden h-72 w-72 rounded-full bg-primary/6 blur-3xl lg:block" />
        <div className="absolute right-0 top-24 hidden h-80 w-80 rounded-full bg-sky-500/7 blur-3xl dark:bg-white/5 lg:block" />
        <div className="absolute bottom-0 left-1/3 hidden h-64 w-64 rounded-full bg-amber-500/7 blur-3xl xl:block" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 px-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:px-0">
          <div className="flex items-start gap-3 sm:items-center sm:gap-4">
            <Link
              href="/"
              className="group mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary dark:bg-white/5 sm:mt-0 sm:h-11 sm:w-11"
            >
              <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
            </Link>
            <div className="min-w-0 space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary sm:text-[11px]">
                <Sparkles size={12} />
                Account Studio
              </div>
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-4xl">个人信息</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">统一管理资料、常用地址和登录安全设置。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[280px] sm:gap-3">
            <div className="rounded-2xl border border-border/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm dark:bg-white/5 sm:px-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">身份</div>
              <div className="mt-1 text-sm font-bold text-foreground">{user?.role === "SUPER_ADMIN" ? "超级管理员" : "普通成员"}</div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm dark:bg-white/5 sm:px-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">地址数</div>
              <div className="mt-1 text-sm font-bold text-foreground">{addressList.length} 条</div>
            </div>
          </div>
        </div>

        <div className="sticky top-18 z-20 mx-3 mb-5 rounded-[24px] border border-border/60 bg-white/78 p-2 shadow-lg shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/82 sm:mx-0 lg:hidden">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <a
            href="#profile-overview"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88 sm:flex-1"
          >
            概览
          </a>
          <a
            href="#profile-core"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88 sm:flex-1"
          >
            基本资料
          </a>
          <a
            href="#address-library"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88 sm:flex-1"
          >
            地址库
          </a>
          <a
            href="#security-center"
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88 sm:flex-1"
          >
            安全设置
          </a>
        </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <motion.aside
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <section
              id="profile-overview"
              className="scroll-mt-28 overflow-hidden rounded-[24px] border border-border/70 bg-white/86 p-3 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[28px] sm:p-5"
            >
              <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-linear-to-br from-white via-white to-muted/35 p-4 text-foreground dark:from-white/10 dark:via-white/7 dark:to-transparent dark:text-white sm:p-6">
                <div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-primary/8 to-transparent dark:from-white/6" />
                <div className="absolute -right-8 top-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl dark:bg-white/8" />
                <div className="relative flex items-center gap-4 text-left sm:flex-col sm:items-center sm:text-center">
                  <a
                    href="https://cravatar.cn/"
                    target="_blank"
                    rel="noopener noreferrer"
                    title="前往 Cravatar 设置头像"
                    className="group/avatar relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white shadow-xl shadow-black/10 transition-transform hover:scale-[1.03] sm:mb-5 sm:h-28 sm:w-28 dark:border-white/60 dark:bg-white/10 dark:shadow-black/20"
                  >
                    {user?.email ? (
                      <Image
                        src={`https://cravatar.cn/avatar/${md5(user.email)}?d=mp&s=200`}
                        alt="当前用户头像"
                        fill
                        className="object-cover transition-transform duration-500 group-hover/avatar:scale-110"
                      />
                    ) : (
                      <User size={56} className="text-white" />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                      <ExternalLink size={20} className="text-white" />
                    </div>
                  </a>
                  <div className="min-w-0 flex-1 sm:flex-none">
                    <h2 className="max-w-full truncate text-xl font-black tracking-tight sm:text-2xl">{user?.name || "未命名用户"}</h2>
                    <p className="mt-1 max-w-full truncate text-sm text-muted-foreground dark:text-white/72">{user?.email}</p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/75 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-foreground shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-white/90 sm:mt-4">
                      <BadgeCheck size={13} />
                      {user?.role === "SUPER_ADMIN" ? "超级管理员" : "普通成员"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3 sm:mt-5">
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 dark:bg-white/5">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">头像管理</div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">头像来自 Cravatar，点击上方头像可快速跳转并更新展示。</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 dark:bg-white/5">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">默认地址</div>
                    <div className="mt-1 text-sm font-bold text-foreground">{addressList.find((item) => item.isDefault)?.label || "未设置"}</div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-muted/10 p-4 dark:bg-white/5">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">安全状态</div>
                    <div className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">已启用密码</div>
                  </div>
                </div>
              </div>
            </section>
          </motion.aside>

          <motion.main
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 }}
            className="space-y-6"
          >
            <section
              id="profile-core"
              className="scroll-mt-28 overflow-hidden rounded-[24px] border border-border/70 bg-white/84 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[28px]"
            >
              <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Profile Core</div>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">基本资料</h3>
                </div>
                <div className="w-fit rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[10px] font-black text-primary sm:text-[11px]">实时保存前预览</div>
              </div>

              <div className="grid gap-4 p-4 sm:p-8 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-5">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <User size={14} className="text-primary" /> 显示名称
                    </label>
                    <input
                      type="text"
                      placeholder="请输入您的真实姓名或昵称"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-13 w-full rounded-2xl border border-border bg-white px-5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/35 hover:border-foreground/15 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                    />
                    <p className="px-1 text-[11px] text-muted-foreground/60">这个名字会在系统内的个人信息、操作记录和协作场景中展示。</p>
                  </div>
                </div>

                <div className="space-y-4 rounded-[22px] border border-border/60 bg-muted/15 p-4 dark:bg-white/5 sm:space-y-5 sm:rounded-[26px] sm:p-5">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <Mail size={14} className="text-primary" /> 登录邮箱
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="h-13 w-full cursor-not-allowed rounded-2xl border border-border/60 bg-muted/30 px-5 text-sm text-muted-foreground/70"
                      />
                    </div>
                    <p className="px-1 text-[11px] text-muted-foreground/60">邮箱是账号唯一标识，不支持在这里手动修改。</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border/60 px-4 py-4 sm:px-8 sm:py-5">
                <button
                  onClick={handleSave}
                  disabled={isSaving || (name === typedUser?.name && JSON.stringify(addressList) === JSON.stringify(typedUser?.shippingAddresses || []))}
                  className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl bg-foreground px-6 text-sm font-black text-background shadow-xl shadow-foreground/10 transition-all hover:-translate-y-0.5 hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 dark:bg-white dark:text-black dark:shadow-white/5 sm:w-auto"
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>保存基本资料</span>
                </button>
              </div>
            </section>

            <section
              id="address-library"
              className="scroll-mt-28 overflow-hidden rounded-[24px] border border-border/70 bg-white/84 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[28px]"
            >
              <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-5">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Address Library</div>
                  <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">收货地址库</h3>
                </div>
                <button
                  onClick={() => setAddressList([...addressList, { id: Math.random().toString(36).substr(2, 9), label: "", address: "", isDefault: addressList.length === 0 }])}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/6 px-4 text-sm font-black text-primary transition-all hover:bg-primary/12 active:scale-[0.98] sm:w-auto"
                >
                  <Plus size={16} />
                  添加地址
                </button>
              </div>

              <div className="p-4 sm:p-8">
                {addressList.length === 0 ? (
                  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-dashed border-border/50 bg-muted/10 text-center">
                    <Home size={28} className="text-muted-foreground/50" />
                    <div>
                      <p className="text-sm font-black text-foreground">地址库还是空的</p>
                      <p className="mt-1 text-xs text-muted-foreground">先添加一个默认收货地址，后续采购和物流会更顺手。</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addressList.map((item, index) => (
                      <div key={item.id} className="rounded-[22px] border border-border/60 bg-muted/10 p-3 shadow-sm transition-all hover:border-primary/25 hover:bg-white/70 sm:rounded-[24px] sm:p-5 dark:hover:bg-white/6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <input
                                type="text"
                                placeholder="地址标签，例如：总仓 / 南区门店"
                                value={item.label}
                                onChange={(e) => {
                                  const newList = [...addressList];
                                  newList[index] = { ...newList[index], label: e.target.value };
                                  setAddressList(newList);
                                }}
                                className="h-11 min-w-0 flex-1 rounded-2xl border border-border/60 bg-white px-4 text-sm font-bold outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                              />
                              <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                                <button
                                  onClick={() => {
                                    const newList = addressList.map((a, i) => ({ ...a, isDefault: i === index }));
                                    setAddressList(newList);
                                  }}
                                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-xs font-black transition-all ${
                                    item.isDefault
                                      ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                      : "border-border/60 bg-white/60 text-muted-foreground hover:border-amber-500/25 hover:text-amber-600 dark:bg-white/5"
                                  }`}
                                  title={item.isDefault ? "默认地址" : "设为默认"}
                                >
                                  <Star size={14} fill={item.isDefault ? "currentColor" : "none"} />
                                  {item.isDefault ? "默认地址" : "设为默认"}
                                </button>
                                <button
                                  onClick={() => setAddressList(addressList.filter((_, i) => i !== index))}
                                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-destructive/15 bg-destructive/5 px-3 text-destructive transition-all hover:bg-destructive/10"
                                  title="删除"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            <textarea
                              placeholder="详细地址..."
                              value={item.address}
                              onChange={(e) => {
                                const newList = [...addressList];
                                newList[index] = { ...newList[index], address: e.target.value };
                                setAddressList(newList);
                              }}
                              rows={3}
                              className="w-full rounded-2xl border border-border/60 bg-white px-4 py-3 text-sm leading-7 outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                            />
                          </div>

                          <div className="w-full rounded-2xl border border-border/60 bg-white/80 p-4 dark:bg-white/5 lg:w-44">
                            <label className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">抽出率</label>
                            <div className="relative mt-2">
                              <input
                                type="number"
                                placeholder="6"
                                step="0.1"
                                value={item.serviceFeeRate !== undefined ? (item.serviceFeeRate * 100).toString() : ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  const newList = [...addressList];
                                  newList[index] = {
                                    ...newList[index],
                                    serviceFeeRate: isNaN(val) ? undefined : val / 100,
                                  };
                                  setAddressList(newList);
                                }}
                                className="h-11 w-full rounded-xl border border-border/60 bg-white px-3 pr-8 text-sm font-mono outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">%</span>
                            </div>
                            <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground/60">用于结算和地址维度统计，留空则按系统默认处理。</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section
              id="security-center"
              className="scroll-mt-28 overflow-hidden rounded-[24px] border border-border/70 bg-white/84 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[28px]"
            >
              <div className="border-b border-border/60 px-4 py-4 sm:px-8 sm:py-5">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Security Center</div>
                <h3 className="mt-1 text-lg font-black tracking-tight text-foreground">账号安全</h3>
                <p className="mt-1 text-sm text-muted-foreground">在这里更新登录密码，建议定期更换并使用更高强度的组合。</p>
              </div>

              <div className="grid gap-4 p-4 sm:p-8 lg:grid-cols-2">
                <div className="space-y-5">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <KeyRound size={14} className="text-primary" /> 当前密码
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="请输入当前密码"
                        className="h-12 w-full rounded-2xl border border-border bg-white px-5 pr-12 text-sm outline-none transition-all placeholder:text-muted-foreground/35 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <KeyRound size={14} className="text-primary" /> 新密码
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="请输入新密码"
                        className="h-12 w-full rounded-2xl border border-border bg-white px-5 pr-12 text-sm outline-none transition-all placeholder:text-muted-foreground/35 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <ShieldCheck size={14} className="text-primary" /> 确认新密码
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="请再次输入新密码"
                        className="h-12 w-full rounded-2xl border border-border bg-white px-5 pr-12 text-sm outline-none transition-all placeholder:text-muted-foreground/35 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col rounded-[26px] border border-border/60 bg-muted/15 p-4 dark:bg-white/5 sm:p-5">
                  <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">安全建议</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground/75">密码强度</span>
                      <span className={passwordStrength.tone}>{passwordStrength.label}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 rounded-full transition-all ${
                            passwordStrength.score >= level ? passwordStrength.bar : "bg-white/10"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-2xl border border-border/60 bg-white/70 p-4 dark:bg-white/5">
                      建议使用字母、数字和符号组合，避免与其他平台重复使用相同密码。
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/70 p-4 dark:bg-white/5">
                      如果忘记密码，也可以在登录页通过邮箱验证码快速重置。
                    </div>
                  </div>

                  <button
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-primary/6 text-sm font-black text-primary transition-all hover:-translate-y-0.5 hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0"
                  >
                    {isChangingPassword ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    <span>更新登录密码</span>
                  </button>
                </div>
              </div>
            </section>
          </motion.main>
        </div>
      </div>
    </div>
  );
}
