"use client";

import { useState, useEffect, useCallback } from "react";
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
import { User as UserType, AddressItem, AutoPickApiKey } from "@/lib/types";
import { buildAddressDisplay, normalizeAddressItemParts } from "@/lib/addressBook";

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
  const [autoPickKeys, setAutoPickKeys] = useState<AutoPickApiKey[]>([]);
  const [autoPickKeyLabel, setAutoPickKeyLabel] = useState("");
  const [newAutoPickKey, setNewAutoPickKey] = useState("");
  const [isLoadingAutoPickKeys, setIsLoadingAutoPickKeys] = useState(false);
  const [isCreatingAutoPickKey, setIsCreatingAutoPickKey] = useState(false);
  const [deletingAutoPickKeyId, setDeletingAutoPickKeyId] = useState("");

  useEffect(() => {
    if (typedUser?.name) {
      setName(typedUser.name);
    }

    const addresses = typedUser?.shippingAddresses;
    if (Array.isArray(addresses)) {
      setAddressList(addresses.map((item) => ({
        ...item,
        ...normalizeAddressItemParts(item),
        address: item.address || buildAddressDisplay(item),
      })));
    } else if (typeof typedUser?.shippingAddress === "string" && typedUser.shippingAddress) {
      const parsed = normalizeAddressItemParts({ address: typedUser.shippingAddress });
      setAddressList([
        {
          id: "legacy",
          label: "默认地址",
          address: typedUser.shippingAddress,
          ...parsed,
          isDefault: true,
          externalId: "",
        },
      ]);
    }
  }, [typedUser?.name, typedUser?.shippingAddress, typedUser?.shippingAddresses]);

  const fetchAutoPickKeys = useCallback(async () => {
    setIsLoadingAutoPickKeys(true);
    try {
      const res = await fetch("/api/user/auto-pick-keys");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAutoPickKeys(Array.isArray(data.items) ? data.items : []);
      } else {
        showToast(data.error || "加载推单凭证失败", "error");
      }
    } catch (error) {
      console.error("Load auto-pick keys failed:", error);
      showToast("加载推单凭证失败", "error");
    } finally {
      setIsLoadingAutoPickKeys(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAutoPickKeys();
  }, [fetchAutoPickKeys]);

  const handleSave = async () => {
    const missingLabel = addressList.find((item) => !String(item.label || "").trim());
    if (missingLabel) {
      showToast(`有门店缺少门店简称`, "error");
      return;
    }

    const missingExternalId = addressList.find((item) => !String(item.externalId || "").trim());
    if (missingExternalId) {
      showToast(`门店“${missingExternalId.label || missingExternalId.address || "未命名地址"}”缺少门店ID`, "error");
      return;
    }

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
  const defaultAddress = addressList.find((item) => item.isDefault) || null;
  const activeAutoPickKeyCount = autoPickKeys.length;
  const latestAutoPickKey = autoPickKeys[0] || null;
  const topStats = [
    {
      label: "账户身份",
      value: user?.role === "SUPER_ADMIN" ? "超级管理员" : "普通成员",
      hint: "当前账号的系统角色",
    },
    {
      label: "地址档案",
      value: `${addressList.length} 条`,
      hint: defaultAddress?.label || "尚未设置默认地址",
    },
    {
      label: "推单凭证",
      value: `${activeAutoPickKeyCount} 个`,
      hint: latestAutoPickKey?.lastUsedAt
        ? `最近使用 ${new Date(latestAutoPickKey.lastUsedAt).toLocaleString("zh-CN")}`
        : "暂未使用记录",
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

  const handleCreateAutoPickKey = async () => {
    const label = autoPickKeyLabel.trim();
    if (!label) {
      showToast("请先填写凭证名称", "error");
      return;
    }

    setIsCreatingAutoPickKey(true);
    try {
      const res = await fetch("/api/user/auto-pick-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "创建凭证失败", "error");
        return;
      }

      setAutoPickKeyLabel("");
      setNewAutoPickKey(String(data.apiKey || ""));
      setAutoPickKeys((prev) => data.item ? [data.item, ...prev] : prev);
      showToast("推单凭证已生成，请立即复制", "success");
    } catch (error) {
      console.error("Create auto-pick key failed:", error);
      showToast("创建凭证失败", "error");
    } finally {
      setIsCreatingAutoPickKey(false);
    }
  };

  const handleDeleteAutoPickKey = async (id: string) => {
    setDeletingAutoPickKeyId(id);
    try {
      const res = await fetch(`/api/user/auto-pick-keys/${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "删除凭证失败", "error");
        return;
      }

      setAutoPickKeys((prev) => prev.filter((item) => item.id !== id));
      showToast("推单凭证已删除", "success");
    } catch (error) {
      console.error("Delete auto-pick key failed:", error);
      showToast("删除凭证失败", "error");
    } finally {
      setDeletingAutoPickKeyId("");
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
        <section className="mb-6 overflow-hidden rounded-[28px] border border-border/70 bg-white/86 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/82 dark:shadow-black/20 sm:mb-8">
          <div className="relative px-4 py-5 sm:px-8 sm:py-7">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute right-0 top-6 h-36 w-36 rounded-full bg-sky-500/10 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-28 w-28 rounded-full bg-amber-500/10 blur-3xl" />
            </div>

            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-start gap-3 sm:gap-4">
                  <Link
                    href="/"
                    className="group mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary dark:bg-white/5 sm:mt-0 sm:h-11 sm:w-11"
                  >
                    <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" />
                  </Link>
                  <div className="min-w-0 space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary sm:text-[11px]">
                      <Sparkles size={12} />
                      Account Studio
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl">个人中心</h1>
                    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                      把个人资料、常用地址、推单凭证和登录安全放进同一个账户工作台里，减少来回切换。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck size={13} />
                    自助管理已开启
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-1.5 text-[11px] font-black text-foreground dark:bg-white/5">
                    <BadgeCheck size={13} />
                    {user?.email}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {topStats.map((item) => (
                  <div key={item.label} className="rounded-[22px] border border-border/60 bg-white/80 px-4 py-4 shadow-sm backdrop-blur-sm dark:bg-white/5">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">{item.label}</div>
                    <div className="mt-2 text-lg font-black text-foreground sm:text-xl">{item.value}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="sticky top-18 z-20 mx-3 mb-5 rounded-[24px] border border-border/60 bg-white/78 p-2 shadow-lg shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/82 sm:mx-0 lg:hidden">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <a
            href="#profile-overview"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88"
          >
            概览
          </a>
          <a
            href="#profile-core"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88"
          >
            基本资料
          </a>
          <a
            href="#address-library"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88"
          >
            地址库
          </a>
          <a
            href="#auto-pick-keys"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88"
          >
            推单凭证
          </a>
          <a
            href="#security-center"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-white/88 px-4 text-xs font-black text-foreground shadow-sm backdrop-blur-sm transition-colors hover:border-primary/30 hover:text-primary dark:bg-[#101726]/88"
          >
            安全设置
          </a>
        </div>
        </div>

        <div className="space-y-6">
          <motion.section
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
                <div className="relative grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
                  <div className="flex items-center gap-4 text-left sm:gap-5">
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

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-white/70 p-4 dark:bg-white/5">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">头像管理</div>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">头像来自 Cravatar，点击左侧头像可快速跳转并更新展示。</p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/70 p-4 dark:bg-white/5">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">默认地址</div>
                      <div className="mt-2 text-sm font-bold text-foreground">{defaultAddress?.label || "未设置"}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {defaultAddress?.address || "建议至少维护一个默认收货地址，方便后续采购和物流。"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/70 p-4 dark:bg-white/5">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">快捷跳转</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black">
                        <a href="#profile-core" className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-center text-foreground transition hover:border-primary/30 hover:text-primary dark:bg-white/5">资料</a>
                        <a href="#address-library" className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-center text-foreground transition hover:border-primary/30 hover:text-primary dark:bg-white/5">地址</a>
                        <a href="#auto-pick-keys" className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-center text-foreground transition hover:border-primary/30 hover:text-primary dark:bg-white/5">推单</a>
                        <a href="#security-center" className="rounded-xl border border-border/60 bg-white/70 px-3 py-2 text-center text-foreground transition hover:border-primary/30 hover:text-primary dark:bg-white/5">安全</a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </motion.section>

          <motion.section
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
                  <p className="mt-1 text-sm text-muted-foreground">保存时会按详细地址自动解析门店经纬度，后续订单距离和自配送预估会优先使用这组坐标。</p>
                </div>
                <button
                  onClick={() => setAddressList([...addressList, { id: Math.random().toString(36).substr(2, 9), label: "", address: "", detailAddress: "", contactName: "", contactPhone: "", isDefault: addressList.length === 0, externalId: "" }])}
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
                                placeholder="门店简称（必填）"
                                required
                                value={item.label}
                                onChange={(e) => {
                                  const newList = [...addressList];
                                  newList[index] = { ...newList[index], label: e.target.value };
                                  setAddressList(newList);
                                }}
                                className={`h-11 min-w-0 flex-1 rounded-2xl border bg-white px-4 text-sm font-bold outline-none transition-all focus:ring-4 focus:ring-primary/10 dark:bg-white/5 ${
                                  String(item.label || "").trim()
                                    ? "border-border/60 focus:border-primary/40"
                                    : "border-destructive/35 focus:border-destructive/45"
                                }`}
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

                            <input
                              type="text"
                              placeholder="门店ID（必填）"
                              required
                              value={item.externalId || ""}
                              onChange={(e) => {
                                const newList = [...addressList];
                                newList[index] = { ...newList[index], externalId: e.target.value.trim() };
                                setAddressList(newList);
                              }}
                              className={`h-11 w-full rounded-2xl border bg-white px-4 text-sm font-mono outline-none transition-all focus:ring-4 focus:ring-primary/10 dark:bg-white/5 ${
                                String(item.externalId || "").trim()
                                  ? "border-border/60 focus:border-primary/40"
                                  : "border-destructive/35 focus:border-destructive/45"
                              }`}
                            />

                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                              <input
                                type="text"
                                placeholder="联系人"
                                value={item.contactName || ""}
                                onChange={(e) => {
                                  const newList = [...addressList];
                                  newList[index] = { ...newList[index], contactName: e.target.value };
                                  setAddressList(newList);
                                }}
                                className="h-11 w-full rounded-2xl border border-border/60 bg-white px-4 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
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
                                className="h-11 w-full rounded-2xl border border-border/60 bg-white px-4 text-sm outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
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

                        <div className="mt-3 rounded-2xl border border-border/60 bg-white/70 px-4 py-3 text-xs text-muted-foreground dark:bg-white/5">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">展示地址</div>
                          <div className="mt-2 text-foreground">
                            {buildAddressDisplay(item) || "请补全联系人、电话和详细地址"}
                          </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-border/60 bg-white/70 px-4 py-3 text-xs text-muted-foreground dark:bg-white/5">
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">门店坐标</div>
                          <div className="mt-2 font-mono text-foreground">
                            {item.longitude != null && item.latitude != null ? `${item.longitude}, ${item.latitude}` : "保存后自动生成"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section
              id="auto-pick-keys"
              className="scroll-mt-28 overflow-hidden rounded-[24px] border border-border/70 bg-white/84 shadow-xl shadow-black/5 backdrop-blur-xl dark:bg-[#0b111e]/80 dark:shadow-black/20 sm:rounded-[28px]"
            >
              <div className="border-b border-border/60 bg-linear-to-r from-primary/6 via-transparent to-sky-500/6 px-4 py-4 sm:px-8 sm:py-5">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground/60">Auto-Pick Console</div>
                <div className="mt-2 flex flex-col gap-4">
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-foreground">推单凭证</h3>
                    <p className="mt-1 text-sm text-muted-foreground">把插件接入、凭证生成和最近使用状态放到同一个面板里，方便你自己维护。</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-black md:max-w-sm">
                    <div className="rounded-2xl border border-border/60 bg-white/75 px-3 py-2 text-foreground dark:bg-white/5">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">总凭证</div>
                      <div className="mt-1 text-sm">{activeAutoPickKeyCount}</div>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-white/75 px-3 py-2 text-foreground dark:bg-white/5">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">最近状态</div>
                      <div className="mt-1 text-sm">{latestAutoPickKey?.lastUsedAt ? "有使用记录" : "等待启用"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:p-8">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_320px]">
                  <div className="rounded-[22px] border border-border/60 bg-linear-to-br from-muted/15 to-white/70 p-4 dark:from-white/5 dark:to-white/2">
                    <label className="flex items-center gap-2 px-1 text-xs font-black uppercase tracking-widest text-muted-foreground/70">
                      <KeyRound size={14} className="text-primary" /> 凭证名称
                    </label>
                    <div className="mt-3 flex flex-col gap-3 md:flex-row">
                      <input
                        type="text"
                        value={autoPickKeyLabel}
                        onChange={(e) => setAutoPickKeyLabel(e.target.value)}
                        placeholder="例如：麦芽田主账号 / 值班机"
                        className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-white px-5 text-sm outline-none transition-all placeholder:text-muted-foreground/35 focus:border-primary/45 focus:ring-4 focus:ring-primary/10 dark:bg-white/5"
                      />
                      <button
                        onClick={handleCreateAutoPickKey}
                        disabled={isCreatingAutoPickKey}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-foreground px-5 text-sm font-black text-background transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
                      >
                        {isCreatingAutoPickKey ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        生成新凭证
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-sky-500/20 bg-sky-500/8 p-4">
                    <div className="text-xs font-black text-sky-600 dark:text-sky-400">接入说明</div>
                    <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
                      <p>1. 插件上报地址填你的主站 `/api/v1/api-key/listened-orders`。</p>
                      <p>2. 插件的 `MYSHOP_API_KEY` 直接填这里生成的凭证。</p>
                      <p>3. 谁的账户生成 key，订单就归属谁，不按门店分配。</p>
                    </div>
                  </div>
                </div>

                {newAutoPickKey && (
                  <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/8 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">新凭证，仅展示一次</div>
                        <div className="mt-2 break-all rounded-2xl bg-black/5 px-3 py-3 font-mono text-xs text-foreground dark:bg-white/8">
                          {newAutoPickKey}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(newAutoPickKey);
                          showToast("凭证已复制", "success");
                        }}
                        className="shrink-0 rounded-xl border border-emerald-500/20 bg-white/80 px-3 py-2 text-xs font-black text-emerald-600 transition hover:bg-white dark:bg-white/10"
                      >
                        复制
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {isLoadingAutoPickKeys ? (
                    <div className="flex min-h-[220px] items-center justify-center rounded-[26px] border border-border/60 bg-muted/10">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : autoPickKeys.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-dashed border-border/50 bg-muted/10 text-center">
                      <KeyRound size={26} className="text-muted-foreground/50" />
                      <div>
                        <p className="text-sm font-black text-foreground">还没有推单凭证</p>
                        <p className="mt-1 text-xs text-muted-foreground">先生成一个 key，再把它填到插件的 `MYSHOP_API_KEY` 里。</p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {autoPickKeys.map((item) => (
                        <div key={item.id} className="rounded-[22px] border border-border/60 bg-linear-to-br from-muted/10 to-white/70 p-4 shadow-sm dark:from-white/5 dark:to-white/2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-black text-foreground">{item.label}</div>
                              <div className="mt-2 inline-flex rounded-full border border-border/60 bg-white/70 px-3 py-1 font-mono text-[11px] text-muted-foreground dark:bg-white/5">
                                {item.keyPrefix}...
                              </div>
                              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                                <p>创建时间：{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : "-"}</p>
                                <p>最近使用：{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("zh-CN") : "暂无"}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteAutoPickKey(item.id)}
                              disabled={deletingAutoPickKeyId === item.id}
                              className="inline-flex h-10 items-center justify-center rounded-2xl border border-destructive/15 bg-destructive/5 px-3 text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                              title="删除凭证"
                            >
                              {deletingAutoPickKeyId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
          </motion.section>
        </div>
      </div>
    </div>
  );
}
