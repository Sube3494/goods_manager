"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Package, MoreHorizontal, History } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { OutboundModal } from "@/components/Outbound/OutboundModal";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Image from "next/image";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { OutboundOrder, OutboundOrderItem } from "@/lib/types";

export default function OutboundPage() {
  const [orders, setOrders] = useState<OutboundOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const { showToast } = useToast();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/outbound");
      if (res.ok) {
        setOrders(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch outbound orders:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOutbound = async (data: Partial<OutboundOrder>) => {
    try {
      const res = await fetch("/api/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        showToast("出库登记成功", "success");
        setIsModalOpen(false);
        fetchOrders();
      } else {
        const errorData = await res.json();
        showToast(errorData.error || "提交失败", "error");
      }
    } catch {
      showToast("网络连接存疑，请重试", "error");
    }
  };

  const filteredOrders = orders.filter(order => {
    // Search query filter
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.note?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items.some((item: OutboundOrderItem) => item.product?.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Type filter
    const matchesType = typeFilter === "all" || order.type === typeFilter;
    
    // Date filter
    let matchesDate = true;
    if (dateFilter !== "all") {
      const orderDate = new Date(order.date);
      const now = new Date();
      if (dateFilter === "today") {
        matchesDate = orderDate.toDateString() === now.toDateString();
      } else if (dateFilter === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        matchesDate = orderDate >= weekAgo;
      } else if (dateFilter === "month") {
        const monthAgo = new Date();
        monthAgo.setDate(now.getDate() - 30);
        matchesDate = orderDate >= monthAgo;
      }
    }
    
    return matchesSearch && matchesType && matchesDate;
  });

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-7xl animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-10">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight text-foreground">出库管理</h1>
          <p className="hidden md:block text-muted-foreground font-medium px-1 mt-2">处理销售、样本或损耗，精准抵扣账面余值。</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="group relative h-10 md:h-11 flex items-center justify-center gap-2 px-5 md:px-8 bg-primary text-primary-foreground rounded-full font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 overflow-hidden shrink-0"
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <Plus size={18} className="relative md:size-[20px]" />
          <span className="relative text-sm md:text-base">新增出库</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6 md:mb-8">
        <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full lg:w-96 shrink-0">
          <Search size={18} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="搜索单号、备注或商品名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
          />
        </div>
        
        <div className="flex gap-2 sm:gap-3 h-10 w-full">
            <div className="flex-1 lg:w-40 h-full">
                <CustomSelect
                    value={dateFilter}
                    onChange={setDateFilter}
                    options={[
                        { value: "all", label: "所有时间" },
                        { value: "today", label: "今日出库" },
                        { value: "week", label: "最近7天" },
                        { value: "month", label: "最近30天" }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-sm font-medium"
                />
            </div>
            <div className="flex-1 lg:w-40 h-full">
                <CustomSelect
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                        { value: "all", label: "所有类型" },
                        { value: "Sale", label: "销售出库" },
                        { value: "Sample", label: "样板/领用" },
                        { value: "Loss", label: "库存损耗" },
                        { value: "Return", label: "退货出库" }
                    ]}
                    className="h-full"
                    triggerClassName="h-full rounded-full bg-white dark:bg-white/5 border-border dark:border-white/10 text-sm font-medium"
                />
            </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {isLoading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-32 rounded-3xl bg-muted/20 animate-pulse border border-white/5" />
          ))
        ) : filteredOrders.length > 0 ? (
          filteredOrders.map((order) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={order.id}
              className="group bg-white dark:bg-gray-900 border border-white/5 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/20 transition-all"
            >
              <div className="p-6 flex flex-col lg:flex-row lg:items-center gap-6">
                {/* Order Main Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      order.type === 'Sale' ? 'bg-blue-500/10 text-blue-500' :
                      order.type === 'Sample' ? 'bg-purple-500/10 text-purple-500' :
                      'bg-orange-500/10 text-orange-500'
                    }`}>
                      {order.type}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">#{order.id.slice(-8).toUpperCase()}</span>
                    <div className="h-4 w-px bg-white/5" />
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <History size={12} />
                      {format(new Date(order.date), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                    </span>
                  </div>
                  {order.note && <p className="text-sm font-bold text-foreground mb-4">{order.note}</p>}
                </div>

                {/* Items Preview */}
                <div className="flex -space-x-4">
                  {order.items.map((item: OutboundOrderItem) => (
                    <div 
                        key={item.id} 
                        className="relative h-12 w-12 rounded-xl border-2 border-white dark:border-gray-900 bg-muted overflow-hidden shadow-lg"
                        title={`${item.product?.name || "未知商品"} x ${item.quantity}`}
                    >
                      {item.product?.image ? (
                        <Image src={item.product.image} alt={item.product.name || ""} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            <Package size={20} />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[8px] text-center font-black">
                        {item.quantity}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action/Total */}
                <div className="lg:w-48 text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">本次出库</p>
                    <p className="text-xl font-black text-foreground">
                        {order.items.reduce((acc: number, item: OutboundOrderItem) => acc + item.quantity, 0)} <span className="text-xs font-normal text-muted-foreground">件商品</span>
                    </p>
                </div>

                <div className="lg:pl-6 border-l border-white/5">
                    <button className="p-3 rounded-2xl hover:bg-white dark:hover:bg-white/5 text-muted-foreground transition-colors">
                        <MoreHorizontal size={20} />
                    </button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="py-32 flex flex-col items-center justify-center text-center bg-muted/10 rounded-3xl border-2 border-dashed border-white/5">
            <div className="p-6 rounded-full bg-muted/20 text-muted-foreground/20 mb-6">
                <History size={64} />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">暂无出库记录</h3>
            <p className="text-muted-foreground max-w-sm">
                还没有进行过出库登记。点击右上角“新增出库申请”开始记录第一笔操作。
            </p>
          </div>
        )}
      </div>

      <OutboundModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateOutbound}
      />
    </div>
  );
}
