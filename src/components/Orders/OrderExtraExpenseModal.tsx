"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Trash2, Pencil, Check, ReceiptText, Sparkles, TrendingDown, TrendingUp, ArrowDownRight, ArrowUpRight, Coins } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export interface OrderExtraExpenseItem {
  id: string;
  name: string;
  amount: number; // 单位：分 (cents)
  type?: "expense" | "income";
  createdAt?: string;
}

interface OrderExtraExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNo?: string;
  initialExpenses?: OrderExtraExpenseItem[];
  onSaved?: () => void;
}

const EXPENSE_TAGS = [
  "骑手加价",
  "商品破损赔付",
  "二次配送费",
  "包装耗材",
  "跑腿打赏",
  "其他杂费",
];

const INCOME_TAGS = [
  "客户补差",
  "平台赔偿",
  "加急补费",
  "运费补贴",
  "红包打赏",
  "线下补款",
];

export function OrderExtraExpenseModal({
  isOpen,
  onClose,
  orderId,
  orderNo,
  initialExpenses = [],
  onSaved,
}: OrderExtraExpenseModalProps) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [expenses, setExpenses] = useState<OrderExtraExpenseItem[]>([]);
  const [itemType, setItemType] = useState<"expense" | "income">("expense");
  const [nameInput, setNameInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setExpenses(
        Array.isArray(initialExpenses)
          ? initialExpenses.map((item) => ({
              ...item,
              type: item.type === "income" ? "income" : "expense",
            }))
          : []
      );
      setItemType("expense");
      setNameInput("");
      setAmountInput("");
      setEditingId(null);
    }
  }, [isOpen, initialExpenses]);

  if (!isOpen || !mounted) return null;

  const totalExpenseCents = expenses
    .filter((item) => item.type !== "income")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const totalIncomeCents = expenses
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const netDifferenceCents = totalIncomeCents - totalExpenseCents;

  const handleSelectTag = (tag: string, type: "expense" | "income") => {
    setItemType(type);
    setNameInput(tag);
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleAddOrUpdateItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const isIncome = itemType === "income";
    const defaultName = isIncome ? "额外收入" : "意外花费";
    const trimmedName = nameInput.trim() || defaultName;
    const parsedYuan = parseFloat(amountInput);

    if (isNaN(parsedYuan) || parsedYuan <= 0) {
      showToast(`请输入有效的${isIncome ? "收入" : "支出"}金额（大于0元）`, "error");
      return;
    }

    const amountInCents = Math.round(parsedYuan * 100);

    if (editingId) {
      setExpenses((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, name: trimmedName, amount: amountInCents, type: itemType }
            : item
        )
      );
      setEditingId(null);
    } else {
      const newItem: OrderExtraExpenseItem = {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        amount: amountInCents,
        type: itemType,
        createdAt: new Date().toISOString(),
      };
      setExpenses((prev) => [...prev, newItem]);
    }

    setNameInput("");
    setAmountInput("");
  };

  const handleStartEdit = (item: OrderExtraExpenseItem) => {
    setEditingId(item.id);
    setItemType(item.type === "income" ? "income" : "expense");
    setNameInput(item.name);
    setAmountInput((item.amount / 100).toFixed(2));
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setItemType("expense");
    setNameInput("");
    setAmountInput("");
  };

  const handleDeleteItem = (id: string) => {
    setExpenses((prev) => prev.filter((item) => item.id !== id));
    if (editingId === id) {
      handleCancelEdit();
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/extra-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraExpenses: expenses }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存额外收支失败");
      }

      showToast("额外收支记录已保存，纯利润已重新核算", "success");
      onSaved?.();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/80 bg-white shadow-2xl dark:border-white/10 dark:bg-[#151921] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.65)] flex flex-col max-h-[92vh] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 dark:border-white/6 bg-gradient-to-r from-transparent via-amber-500/[0.03] to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/15 border border-amber-500/25 text-amber-500 shadow-xs">
              <ReceiptText size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-bold tracking-tight text-slate-900 dark:text-white truncate">
                  管理额外收支与意外花费
                </h3>
                {orderNo ? (
                  <span className="shrink-0 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/6 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-white/8">
                    #{orderNo.slice(-6)}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-white/50 mt-0.5 truncate">
                记录的不固定支出或补差收入将直接计入本单纯利润核算
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/8 dark:hover:text-white cursor-pointer transition-all active:scale-95"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Preset Tags */}
          <div className="rounded-2xl border border-slate-200/70 dark:border-white/6 bg-slate-50/70 dark:bg-white/[0.02] p-3 space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-white/70 flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" />
                <span>常见场景快捷填充</span>
              </span>
              <span className="text-[10px] text-slate-400 dark:text-white/40">点击标签一键填入</span>
            </div>

            {/* 支出快捷标签 */}
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                <TrendingDown size={10} />
                <span>支出</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXPENSE_TAGS.map((tag) => {
                  const isSelected = nameInput === tag && itemType === "expense";
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleSelectTag(tag, "expense")}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold shadow-xs ring-1 ring-rose-500/30"
                          : "border-slate-200/80 bg-white/80 text-slate-700 hover:border-rose-400/50 hover:bg-rose-500/8 hover:text-rose-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-rose-400/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 收入快捷标签 */}
            <div className="flex items-start gap-2">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                <TrendingUp size={10} />
                <span>收入</span>
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {INCOME_TAGS.map((tag) => {
                  const isSelected = nameInput === tag && itemType === "income";
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleSelectTag(tag, "income")}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer active:scale-95 ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs ring-1 ring-emerald-500/30"
                          : "border-slate-200/80 bg-white/80 text-slate-700 hover:border-emerald-400/50 hover:bg-emerald-500/8 hover:text-emerald-600 dark:border-white/8 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleAddOrUpdateItem}
            className={`rounded-2xl border p-3.5 space-y-3 transition-all duration-200 shadow-xs ${
              itemType === "income"
                ? "border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.04] to-emerald-500/[0.01] dark:border-emerald-500/20 dark:from-emerald-500/[0.06] dark:to-transparent"
                : "border-rose-500/30 bg-gradient-to-b from-rose-500/[0.04] to-rose-500/[0.01] dark:border-rose-500/20 dark:from-rose-500/[0.06] dark:to-transparent"
            }`}
          >
            <div className="flex items-center justify-between">
              {/* 支出 / 收入 切换器 */}
              <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 dark:border-white/10 dark:bg-black/35 shadow-inner">
                <button
                  type="button"
                  onClick={() => setItemType("expense")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                    itemType === "expense"
                      ? "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/25"
                      : "text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
                  }`}
                >
                  <TrendingDown size={12} />
                  <span>意外支出 (-)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemType("income")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                    itemType === "income"
                      ? "bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/25"
                      : "text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white"
                  }`}
                >
                  <TrendingUp size={12} />
                  <span>额外收入 (+)</span>
                </button>
              </div>

              {editingId ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-amber-500 flex items-center gap-1">
                    <Pencil size={11} />
                    <span>编辑中</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer underline"
                  >
                    取消修改
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-7">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={itemType === "income" ? "收入原因（如：客户补差、平台赔偿）" : "支出原因（如：骑手加价、破损赔付）"}
                  className={`h-9.5 w-full rounded-xl border bg-white px-3 text-xs outline-none transition-all dark:bg-black/25 dark:text-white ${
                    itemType === "income"
                      ? "border-slate-200/90 dark:border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      : "border-slate-200/90 dark:border-white/10 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                  }`}
                />
              </div>
              <div className="sm:col-span-5 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${
                    itemType === "income" ? "text-emerald-500" : "text-rose-500"
                  }`}>
                    {itemType === "income" ? "+¥" : "-¥"}
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className={`h-9.5 w-full rounded-xl border bg-white pl-8 pr-2.5 text-xs font-bold font-mono outline-none transition-all dark:bg-black/25 dark:text-white ${
                      itemType === "income"
                        ? "border-slate-200/90 dark:border-white/10 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "border-slate-200/90 dark:border-white/10 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-rose-600 dark:text-rose-400"
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  className={`h-9.5 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs active:scale-95 ${
                    editingId
                      ? "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20"
                      : itemType === "income"
                      ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20"
                      : "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20"
                  }`}
                >
                  {editingId ? (
                    <>
                      <Check size={13} />
                      <span>保存修改</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>{itemType === "income" ? "加入收入" : "加入支出"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Expenses & Incomes List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-white">已记录收支明细</span>
                <span className="rounded-full bg-slate-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-white/60">
                  {expenses.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] tabular-nums font-mono">
                {totalExpenseCents > 0 && (
                  <span className="rounded-md bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-rose-600 dark:text-rose-400 font-medium">
                    支: -¥{(totalExpenseCents / 100).toFixed(2)}
                  </span>
                )}
                {totalIncomeCents > 0 && (
                  <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
                    收: +¥{(totalIncomeCents / 100).toFixed(2)}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-md font-bold ${
                  netDifferenceCents > 0
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25"
                    : netDifferenceCents < 0
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25"
                    : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40"
                }`}>
                  净额: {netDifferenceCents >= 0 ? "+" : "-"}¥{(Math.abs(netDifferenceCents) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200/90 dark:border-white/10 p-7 text-center flex flex-col items-center justify-center gap-2 bg-slate-50/40 dark:bg-white/[0.01]">
                <div className="h-10 w-10 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-white/30">
                  <Coins size={20} />
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-white/60">
                  暂无额外收支记录
                </div>
                <p className="text-[11px] text-slate-400 dark:text-white/35">
                  如本单产生骑手加价、破损杂费或补差收入，可在上方快速添加
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {expenses.map((item, index) => {
                  const isIncome = item.type === "income";
                  const isEditing = editingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`group flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs transition-all ${
                        isEditing
                          ? "border-amber-500/60 bg-amber-500/10 shadow-xs"
                          : "border-slate-200/70 bg-white/70 hover:bg-slate-50/90 dark:border-white/6 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-white/60">
                          {index + 1}
                        </span>
                        <span className={`inline-flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                          isIncome
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                        }`}>
                          {isIncome ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                          <span>{isIncome ? "收入" : "支出"}</span>
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono font-bold text-xs tabular-nums ${
                          isIncome
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}>
                          {isIncome ? "+" : "-"}¥{(item.amount / 100).toFixed(2)}
                        </span>
                        <div className="flex items-center opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(item)}
                            title="编辑"
                            className="rounded-lg p-1 text-slate-400 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            title="删除"
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5 dark:border-white/6 dark:bg-white/[0.02]">
          <div className="text-[11px] text-slate-500 dark:text-white/50 flex items-center gap-1.5">
            {expenses.length > 0 ? (
              <span>
                净利润将{" "}
                <b className={netDifferenceCents > 0 ? "text-emerald-500 font-bold font-mono" : netDifferenceCents < 0 ? "text-rose-500 font-bold font-mono" : "text-slate-900 dark:text-white font-mono"}>
                  {netDifferenceCents > 0 ? `+¥${(netDifferenceCents / 100).toFixed(2)}` : netDifferenceCents < 0 ? `-¥${(Math.abs(netDifferenceCents) / 100).toFixed(2)}` : "¥0.00"}
                </b>
              </span>
            ) : (
              <span>暂无收支改动</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-9 rounded-xl border border-slate-200/80 px-4 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/6 dark:hover:text-white cursor-pointer transition-all active:scale-95"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 text-xs font-bold text-white shadow-md shadow-amber-500/20 transition-all hover:brightness-105 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 size={13} className="animate-spin" /> : null}
              <span>保存并重新计算利润</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
