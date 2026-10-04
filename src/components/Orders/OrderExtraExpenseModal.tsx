"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Plus, Trash2, Pencil, Check, ReceiptText, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export interface OrderExtraExpenseItem {
  id: string;
  name: string;
  amount: number; // 单位：分 (cents)
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

const PRESET_TAGS = [
  "骑手加价",
  "商品破损赔付",
  "客户补差",
  "二次配送费",
  "包装耗材",
  "跑腿打赏",
  "其他杂费",
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
      setExpenses(Array.isArray(initialExpenses) ? [...initialExpenses] : []);
      setNameInput("");
      setAmountInput("");
      setEditingId(null);
    }
  }, [isOpen, initialExpenses]);

  if (!isOpen || !mounted) return null;

  const totalExpenseCents = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const handleSelectTag = (tag: string) => {
    setNameInput(tag);
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleAddOrUpdateItem = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = nameInput.trim() || "意外花费";
    const parsedYuan = parseFloat(amountInput);

    if (isNaN(parsedYuan) || parsedYuan <= 0) {
      showToast("请输入有效的支出金额（大于0元）", "error");
      return;
    }

    const amountInCents = Math.round(parsedYuan * 100);

    if (editingId) {
      setExpenses((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, name: trimmedName, amount: amountInCents }
            : item
        )
      );
      setEditingId(null);
    } else {
      const newItem: OrderExtraExpenseItem = {
        id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        amount: amountInCents,
        createdAt: new Date().toISOString(),
      };
      setExpenses((prev) => [...prev, newItem]);
    }

    setNameInput("");
    setAmountInput("");
  };

  const handleStartEdit = (item: OrderExtraExpenseItem) => {
    setEditingId(item.id);
    setNameInput(item.name);
    setAmountInput((item.amount / 100).toFixed(2));
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
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
        throw new Error(data.error || "保存额外支出失败");
      }

      showToast("意外花费记录已保存，纯利润已重新计算", "success");
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
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/8 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171b22] flex flex-col max-h-[90vh]"
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
                <h3 className="text-sm font-bold text-foreground">管理意外花费与额外支出</h3>
                {orderNo ? (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    #{orderNo.slice(-6)}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                添加的不固定支出将直接计入本单成本并在纯利润中扣除
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
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              <Sparkles size={12} className="text-amber-500" />
              <span>常用快捷标签（点击自动填充）：</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleSelectTag(tag)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    nameInput === tag
                      ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                      : "border-slate-200/80 bg-slate-50 text-slate-700 hover:border-amber-400/60 hover:bg-amber-50/50 hover:text-amber-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
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
            className="rounded-xl border border-black/6 bg-slate-50/70 p-3.5 dark:border-white/8 dark:bg-white/3 space-y-3"
          >
            <div className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{editingId ? "修改支出项" : "添加新支出项"}</span>
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
                  placeholder="支出名称（如：骑手加价）"
                  className="h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-xs outline-none focus:border-amber-500 dark:border-white/10 dark:bg-[#111827] dark:text-white"
                />
              </div>
              <div className="sm:col-span-5 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    ¥
                  </span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="h-9 w-full rounded-lg border border-black/10 bg-white pl-6 pr-2 text-xs font-semibold outline-none focus:border-amber-500 dark:border-white/10 dark:bg-[#111827] dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  className={`h-9 px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                    editingId
                      ? "bg-amber-600 text-white hover:bg-amber-700"
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
                      <span>加入</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Expenses List */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-foreground mb-2">
              <span>已记录的意外支出列表 ({expenses.length})</span>
              <span className="text-rose-600 dark:text-rose-400 font-bold">
                支出总计: -¥{(totalExpenseCents / 100).toFixed(2)}
              </span>
            </div>

            {expenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-muted-foreground dark:border-white/10">
                暂无意外支出。如本单产生额外费用，请在上方添加。
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {expenses.map((item, index) => (
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
                      <span className="font-medium text-slate-900 dark:text-white truncate">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        -¥{(item.amount / 100).toFixed(2)}
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
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-black/5 bg-slate-50/50 px-5 py-3.5 dark:border-white/5 dark:bg-white/2">
          <div className="text-xs text-muted-foreground">
            {expenses.length > 0 ? (
              <span>
                共 <b className="text-foreground">{expenses.length}</b> 项支出
              </span>
            ) : (
              <span>暂无支出</span>
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
