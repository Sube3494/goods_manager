"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Calendar, Store, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { BrushOrderPlan, BrushOrderPlanItem, AddressItem } from "@/lib/types";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { formatLocalDate } from "@/lib/dateUtils";
import { useToast } from "@/components/ui/Toast";

interface ClonePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: BrushOrderPlan | null;
  availableShops: AddressItem[];
  onSuccess: () => void;
}

export function ClonePlanModal({
  isOpen,
  onClose,
  plan,
  availableShops,
  onSuccess,
}: ClonePlanModalProps) {
  const { showToast } = useToast();
  const [targetDate, setTargetDate] = useState("");
  const [targetShop, setTargetShop] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 初始化目标日期与店铺
  useEffect(() => {
    if (isOpen && plan) {
      setTargetShop(plan.shopName || "");

      // 默认目标日期为明天
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setTargetDate(formatLocalDate(tomorrow));
    }
  }, [isOpen, plan]);

  // 计算源计划统计
  const planStats = useMemo(() => {
    if (!plan || !plan.items) return { taskCount: 0, orderCount: 0, totalQty: 0 };
    const taskCount = plan.items.length;
    const totalQty = plan.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const groups = new Set(plan.items.map((item, idx) => item.orderGroup || idx + 1));
    return { taskCount, orderCount: groups.size, totalQty };
  }, [plan]);

  // 快捷日期计算
  const quickDates = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);

    return [
      { label: "今天", date: formatLocalDate(today) },
      { label: "明天", date: formatLocalDate(tomorrow) },
      { label: "后天", date: formatLocalDate(dayAfter) },
    ];
  }, []);

  if (typeof window === "undefined") return null;

  const handleConfirmClone = async () => {
    if (!plan) return;
    if (!targetDate) {
      showToast("请选择目标日期", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      // 构造新计划数据
      const targetDateIso = new Date(`${targetDate}T00:00:00.000+08:00`).toISOString();

      const payload = {
        title: plan.title || null,
        shopName: targetShop || plan.shopName || null,
        date: targetDateIso,
        note: plan.note || null,
        status: "Draft",
        items: (plan.items || []).map((item: BrushOrderPlanItem, index: number) => ({
          productId: item.productId || null,
          productName: item.productName || item.product?.name || null,
          quantity: item.quantity || 1,
          searchKeyword: item.searchKeyword || null,
          platform: item.platform || null,
          note: item.note || null,
          done: false, // 复制后的新计划重置为未完成
          orderGroup: item.orderGroup || index + 1,
          sortOrder: item.sortOrder ?? index,
        })),
      };

      const res = await fetch("/api/brush-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`已成功复制到 ${targetDate}`, "success");
        onSuccess();
        onClose();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.error || "复制计划失败", "error");
      }
    } catch (err) {
      console.error("Clone plan error:", err);
      showToast("复制失败，请重试", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && plan && (
        <div className="fixed inset-0 z-100000 flex items-center justify-center p-4 sm:p-6">
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* 模态框主体 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
            className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-border/80 bg-background/95 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between pb-4 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Copy size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-foreground">复制刷单计划</h3>
                  <p className="text-xs text-muted-foreground font-medium">复用该店铺的商品安排及单号结构</p>
                </div>
              </div>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* 来源信息摘要卡片 */}
            <div className="my-5 rounded-2xl border border-border/60 bg-muted/40 p-4 dark:bg-white/5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="uppercase tracking-wider">来源计划</span>
                <span className="rounded-md bg-foreground/5 px-2 py-0.5 text-foreground/80 font-mono">
                  原日期: {formatLocalDate(plan.date)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-base font-black text-foreground">
                  {plan.shopName || "通用店铺"}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{planStats.totalQty} 份</span>
                  <span>•</span>
                  <span>{planStats.orderCount} 单</span>
                  <span>•</span>
                  <span>{planStats.taskCount} 个任务</span>
                </div>
              </div>
            </div>

            {/* 复制配置项 */}
            <div className="space-y-4">
              {/* 目标日期 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calendar size={13} className="text-primary" />
                    目标排单日期
                  </label>
                  {/* 快捷按钮 */}
                  <div className="flex items-center gap-1">
                    {quickDates.map((item) => (
                      <button
                        key={item.date}
                        type="button"
                        onClick={() => setTargetDate(item.date)}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${
                          targetDate === item.date
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <DatePicker
                  value={targetDate}
                  onChange={setTargetDate}
                  placeholder="选择目标排单日期"
                  className="w-full"
                  triggerClassName="rounded-2xl h-11 text-sm font-medium"
                />
              </div>

              {/* 目标店铺 */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Store size={13} className="text-primary" />
                  目标店铺
                </label>
                {availableShops.length > 0 ? (
                  <CustomSelect
                    options={availableShops.map((addr) => ({
                      value: addr.label,
                      label: addr.label,
                    }))}
                    value={targetShop}
                    onChange={(val) => setTargetShop(val)}
                    placeholder="选择目标店铺"
                    className="w-full"
                    triggerClassName="rounded-2xl h-11 text-sm font-medium"
                  />
                ) : (
                  <div className="h-11 px-4 rounded-2xl border border-border/70 bg-muted/40 flex items-center text-sm font-medium text-foreground">
                    {targetShop || "通用店铺"}
                  </div>
                )}
              </div>
            </div>

            {/* 底部按钮栏 */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border/50">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-11 px-5 rounded-full border border-border text-xs sm:text-sm font-bold text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmClone}
                disabled={isSubmitting || !targetDate}
                className="h-11 px-6 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-black shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>正在复制...</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span>确认克隆计划</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
