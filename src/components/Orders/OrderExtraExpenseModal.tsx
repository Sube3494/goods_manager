"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Trash2, Pencil, Check, ReceiptText, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/8 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171b22] flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ReceiptText size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">管理额外收支与意外花费</h3>
                {orderNo ? (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    #{orderNo.slice(-6)}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                添加的不固定支出或额外收入将直接计入本单，并在纯利润中核算
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5 cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Preset Tags */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <Sparkles size={12} className="text-amber-500" />
              <span>常用快捷标签（点击自动切换类型并填充）：</span>
            </label>

            {/* 支出快捷标签 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-rose-500/80 mr-0.5">支出:</span>
              {EXPENSE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectTag(tag, "expense")}
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                    nameInput === tag && itemType === "expense"
                      ? "border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300 font-semibold"
                      : "border-slate-200/80 bg-slate-50 text-slate-700 hover:border-rose-400/60 hover:bg-rose-50/50 hover:text-rose-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* 收入快捷标签 */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-emerald-500/80 mr-0.5">收入:</span>
              {INCOME_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectTag(tag, "income")}
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                    nameInput === tag && itemType === "income"
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                      : "border-slate-200/80 bg-slate-50 text-slate-700 hover:border-emerald-400/60 hover:bg-emerald-50/50 hover:text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={handleAddOrUpdateItem}
            className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
              itemType === "income"
                ? "border-emerald-500/20 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]"
                : "border-black/6 bg-slate-50/70 dark:border-white/8 dark:bg-white/3"
            }`}
          >
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{editingId ? "修改收支项" : "添加新项目"}</span>
                {/* 支出 / 收入 切换器 */}
                <div className="inline-flex rounded-lg border border-black/8 bg-black/4 p-0.5 dark:border-white/10 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setItemType("expense")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                      itemType === "expense"
                        ? "bg-white text-rose-600 shadow-xs dark:bg-zinc-800 dark:text-rose-400 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TrendingDown size={11} />
                    <span>支出 (-)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemType("income")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all cursor-pointer ${
                      itemType === "income"
                        ? "bg-white text-emerald-600 shadow-xs dark:bg-zinc-800 dark:text-emerald-400 font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TrendingUp size={11} />
                    <span>收入 (+)</span>
                  </button>
                </div>
              </div>

              {editingId ? (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  取消修改
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-7">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={itemType === "income" ? "收入名称（如：客户补差、平台赔偿）" : "支出名称（如：骑手加价、破损赔付）"}
                  className={`h-9 w-full rounded-lg border bg-white px-3 text-xs outline-none transition-colors dark:bg-[#111827] dark:text-white ${
                    itemType === "income"
                      ? "border-emerald-500/30 focus:border-emerald-500"
                      : "border-black/10 focus:border-amber-500 dark:border-white/10"
                  }`}
                />
              </div>
              <div className="sm:col-span-5 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold ${
                    itemType === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                  }`}>
                    {itemType === "income" ? "+¥" : "¥"}
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className={`h-9 w-full rounded-lg border bg-white pl-7 pr-2 text-xs font-semibold outline-none transition-colors dark:bg-[#111827] dark:text-white ${
                      itemType === "income"
                        ? "border-emerald-500/30 focus:border-emerald-500 text-emerald-600 dark:text-emerald-400"
                        : "border-black/10 focus:border-amber-500 dark:border-white/10"
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  className={`h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                    editingId
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : itemType === "income"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  }`}
                >
                  {editingId ? (
                    <>
                      <Check size={13} />
                      <span>更新</span>
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
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-foreground mb-2">
              <span>已记录的收支列表 ({expenses.length})</span>
              <div className="flex items-center gap-2 text-[11px] tabular-nums">
                {totalExpenseCents > 0 && (
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                    支: -¥{(totalExpenseCents / 100).toFixed(2)}
                  </span>
                )}
                {totalIncomeCents > 0 && (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    收: +¥{(totalIncomeCents / 100).toFixed(2)}
                  </span>
                )}
                <span className={`font-bold ${
                  netDifferenceCents > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : netDifferenceCents < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground"
                }`}>
                  净额: {netDifferenceCents >= 0 ? "+" : "-"}¥{(Math.abs(netDifferenceCents) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {expenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground dark:border-white/10">
                暂无额外收支。如本单产生额外费用或补差收入，请在上方添加。
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {expenses.map((item, index) => {
                  const isIncome = item.type === "income";
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs transition-colors ${
                        editingId === item.id
                          ? "border-amber-500/50 bg-amber-500/10 dark:bg-amber-500/10"
                          : "border-black/5 bg-slate-50/50 hover:bg-slate-50 dark:border-white/5 dark:bg-white/4 dark:hover:bg-white/6"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-500 shadow-xs dark:bg-white/10 dark:text-white/60">
                          {index + 1}
                        </span>
                        <span className={`inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isIncome
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        }`}>
                          {isIncome ? "收入" : "支出"}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white truncate">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-bold tabular-nums ${
                          isIncome
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}>
                          {isIncome ? "+" : "-"}¥{(item.amount / 100).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          title="编辑"
                          className="rounded-md p-1 text-slate-400 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          title="删除"
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/5 bg-slate-50/50 px-5 py-3.5 dark:border-white/5 dark:bg-white/2">
          <div className="text-xs text-muted-foreground">
            {expenses.length > 0 ? (
              <span>
                共 <b className="text-foreground">{expenses.length}</b> 项（
                {expenses.filter(i => i.type !== "income").length} 支出 / {expenses.filter(i => i.type === "income").length} 收入）
              </span>
            ) : (
              <span>暂无收支记录</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="h-9 rounded-xl border border-black/8 px-4 text-xs font-medium text-muted-foreground hover:bg-black/4 dark:border-white/10 dark:hover:bg-white/4 cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="h-9 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground shadow-xs transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
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
