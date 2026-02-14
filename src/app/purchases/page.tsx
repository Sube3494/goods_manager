"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, ShoppingBag, Calendar, Edit2, Trash2, CheckCircle2, Truck, Eye, Copy, ExternalLink, Hash, Camera, FileText } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOrder, PurchaseStatus, TrackingInfo } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ImageGallery } from "@/components/ui/ImageGallery";
import TrackingNumberModal from "@/components/Purchases/TrackingNumberModal";



import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { formatLocalDateTime } from "@/lib/dateUtils";
import { pinyinMatch } from "@/lib/pinyin";

const COURIER_CODES: Record<string, string> = {
  "顺丰速运": "shunfeng",
  "圆通速递": "yuantong",
  "中通快递": "zhongtong",
  "申通快递": "shentong",
  "韵达快递": "yunda",
  "极兔速递": "jtexpress",
  "EMS": "ems",
  "邮政快递": "youzhengguonei",
  "京东快递": "jd",
  "德邦快递": "debangwuliu",
  "安能物流": "annengwuliu",
  "跨越速运": "kuayue"
};

const getTrackingUrl = (num: string, courierName?: string) => {
  const code = courierName ? COURIER_CODES[courierName] : "";
  if (!num || !code) return null;
  return `https://www.kuaidi100.com/chaxun?com=${code}&nu=${num.trim()}`;
};

export default function PurchasesPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    message: string;
    title?: string;
  }>({
    isOpen: false,
    onConfirm: () => {},
    message: "",
  });
  const [trackingModal, setTrackingModal] = useState<{
    isOpen: boolean;
    purchaseId: string | null;
    initialValue: TrackingInfo[];
    paymentVouchers?: string[];
    paymentVoucher?: string;
    lockPackages: boolean;
  }>({
    isOpen: false,
    purchaseId: null,
    initialValue: [],
    paymentVouchers: [],
    paymentVoucher: undefined,
    lockPackages: false,
  });

  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
    scale: number;
    direction: number;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0,
    scale: 1,
    direction: 0
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/purchases?type=Purchase"),
        fetch("/api/suppliers")
      ]);
      if (pRes.ok && sRes.ok) {
        setPurchases(await pRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch purchases data:", error);
      showToast("加载数据失败", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // 1. Initial Data Fetch & Mounted Status
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
        fetchData();
        
        // Sync filter from URL on mount
        const statusParam = searchParams.get('status');
        if (statusParam) {
            setStatusFilter(statusParam === 'Ordered' ? 'Confirmed' : statusParam);
        }
    });
    return () => cancelAnimationFrame(handle);
  }, [searchParams, fetchData]); 

  // 2. Auto-open detail if orderId in URL (Depends on purchases being loaded)
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    if (orderIdParam && purchases.length > 0) {
      const order = purchases.find(p => p.id === orderIdParam);
      if (order) {
        const handle = requestAnimationFrame(() => {
            setEditingPurchase(order);
            setIsModalOpen(true);
            // Clean up URL parameter
            const params = new URLSearchParams(searchParams);
            params.delete('orderId');
            router.replace(`${pathname}?${params.toString()}`);
        });
        return () => cancelAnimationFrame(handle);
      }
    }
  }, [searchParams, purchases, router, pathname]);


  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    const params = new URLSearchParams(searchParams);
    if (status === 'All') {
        params.delete('status');
    } else {
        params.set('status', status);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  const getStatusColor = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Shipped": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "Confirmed":
      case "Ordered": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  const getStatusLabel = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "已入库";
      case "Shipped": return "运输中";
      case "Confirmed":
      case "Ordered": return "已下单";
      default: return "草稿";
    }
  };

  const handleCreate = () => {
    setEditingPurchase(null);
    setDetailReadOnly(false);
    setIsModalOpen(true);
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setDetailReadOnly(false);
    setIsModalOpen(true);
  };

  const handleView = (po: PurchaseOrder) => {
    setEditingPurchase(po);
    setDetailReadOnly(true);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "删除采购单",
      message: `确定要删除单号为 ${id} 的采购单吗？此操作将移除所有关联的采购项目，且不可恢复。`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/purchases/${id}`, { method: "DELETE" });
          if (res.ok) {
            fetchData();
            showToast("采购单已删除", "success");
          } else {
            showToast("删除失败", "error");
          }
        } catch (error) {
          console.error("Delete purchase failed:", error);
          showToast("网络错误", "error");
        }
      }
    });
  };

  const handleConfirmReceipt = async (id: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Received" }),
      });
      if (res.ok) {
        fetchData();
        showToast("采购入库成功", "success");
      } else {
        showToast("入库失败", "error");
      }
    } catch (error) {
      console.error("Confirm receipt failed:", error);
      showToast("网络错误", "error");
    }
  };

  const handleUpdateTracking = async (id: string, trackingData: TrackingInfo[], paymentVouchers?: string[]) => {
    try {
      // 记录当前状态，如果是 Confirmed/Ordered，则流转到 Shipped
      const currentOrder = purchases.find(p => p.id === id);
      const newStatus = (currentOrder?.status === "Confirmed" || (currentOrder?.status as string) === "Ordered") 
        ? "Shipped" 
        : currentOrder?.status;

      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            trackingData, 
            paymentVouchers,
            status: newStatus 
        }),
      });
      if (res.ok) {
        fetchData();
        showToast("进货资料已更新", "success");
      } else {
        showToast("更新失败", "error");
      }
    } catch (error) {
      console.error("Update fulfillment info failed:", error);
      showToast("网络错误", "error");
    }
  };



  const handleSave = async (data: Partial<PurchaseOrder>) => {
    try {
      const isEdit = !!editingPurchase;
      const url = isEdit ? `/api/purchases/${editingPurchase.id}` : "/api/purchases";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        fetchData();
        showToast(isEdit ? "采购单已保存" : "采购单已创建", "success");
        setIsModalOpen(false);
      } else {
        showToast("保存失败", "error");
      }
    } catch (error) {
      console.error("Purchase save failed:", error);
      showToast("网络错误", "error");
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const query = searchQuery.trim();
    if (!query) {
      let matchesStatus = statusFilter === 'All';
      if (!matchesStatus) {
        if (statusFilter === 'Confirmed') {
          matchesStatus = p.status === 'Confirmed' || (p.status as string) === 'Ordered';
        } else {
          matchesStatus = p.status === statusFilter;
        }
      }
      return matchesStatus;
    }

    const matchesId = pinyinMatch(p.id, query);
    const matchesSupplier = p.items.some(item => 
      item.supplier?.name && pinyinMatch(item.supplier.name, query)
    );
    const matchesProduct = p.items.some(item =>
      item.product?.name && pinyinMatch(item.product.name, query)
    );
    
    let matchesStatus = statusFilter === 'All';
    if (!matchesStatus) {
      if (statusFilter === 'Confirmed') {
        matchesStatus = p.status === 'Confirmed' || (p.status as string) === 'Ordered';
      } else {
        matchesStatus = p.status === statusFilter;
      }
    }
    
    return (matchesId || matchesSupplier || matchesProduct) && matchesStatus;
  });

  if (!mounted) return null;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header section with unified style */}
      <div className="flex flex-row items-center justify-between gap-4 mb-6 md:mb-8 transition-all">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">采购管理</h1>
          <p className="hidden md:block text-muted-foreground mt-2 text-sm sm:text-lg">管理与供应商的采购订单，跟踪入库进度。</p>
        </div>
        
        <button 
          onClick={handleCreate}
          className="h-9 md:h-10 flex items-center gap-2 rounded-full bg-primary px-4 md:px-6 text-xs md:text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all shrink-0"
        >
          <Plus size={16} className="md:w-[18px] md:h-[18px]" />
          新建采购单
        </button>
      </div>

      {/* Search Box */}
      <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10 w-full sm:w-64 shrink-0">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索采购记录..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm h-full"
        />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['All', 'Confirmed', 'Shipped', 'Received', 'Draft'].map(status => (
              <button
                key={status}
                onClick={() => handleStatusFilterChange(status)}
                className={`
                    px-4 h-9 rounded-full text-sm font-bold transition-all whitespace-nowrap
                    ${statusFilter === status 
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25' 
                        : 'bg-white dark:bg-white/5 border border-border text-muted-foreground hover:bg-muted'
                    }
                `}
              >
                {status === 'All' ? '全部' : 
                 status === 'Confirmed' ? '已下单' :
                 status === 'Shipped' ? '运输中' :
                 status === 'Received' ? '已入库' : '草稿'}
              </button>
          ))}
      </div>

      {/* Table/List View */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-gray-900/70 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
               <p className="text-muted-foreground text-sm font-medium">全力加载中...</p>
            </div>
          ) : filteredPurchases.length > 0 ? (
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">采购单编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">交易金额</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">下单时间</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">物流信息</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <AnimatePresence mode="popLayout">
                {filteredPurchases.map((po) => (
                   <motion.tr 
                    key={po.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="hover:bg-muted/20 transition-colors group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="font-bold text-foreground font-mono text-xs">{po.id}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center text-foreground font-bold">
                        <span className="mr-0.5 opacity-60">￥</span>
                        {po.totalAmount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                        {getStatusLabel(po.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                          <Calendar size={14} />
                          <span className="font-mono">
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        <div className="flex flex-col gap-1.5 min-w-[140px] max-w-[200px] mx-auto">
                          {(po.trackingData && po.trackingData.length > 0) ? (
                            po.trackingData.map((td, idx) => (
                              <div 
                                key={idx} 
                                className="flex items-center gap-2 text-[10px] text-orange-500 font-mono bg-orange-500/5 px-2 py-0.5 rounded-md border border-orange-500/10 group/item relative overflow-hidden"
                              >
                                <Truck size={10} className="shrink-0" />
                                <span className="opacity-70 shrink-0 whitespace-nowrap">{td.courier}:</span>
                                <span className="font-bold truncate min-w-0">{td.number}</span>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(td.number);
                                    showToast("单号已复制到剪贴板", "success");
                                  }}
                                  className="p-0.5 hover:bg-orange-500/20 rounded"
                                  title="复制单号"
                                >
                                  <Copy size={10} />
                                </button>
                                {(() => {
                                  const url = getTrackingUrl(td.number, td.courier);
                                  if (!url) return null;
                                  return (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(url, '_blank');
                                      }}
                                      className="p-0.5 hover:bg-orange-500/20 rounded"
                                      title="追踪查询"
                                    >
                                      <ExternalLink size={10} />
                                    </button>
                                  );
                                })()}
                              </div>
                            ))
                          ) : (
                            po.status !== "Draft" && <span className="text-[10px] text-muted-foreground opacity-30 italic">暂由仓库处理中</span>
                          )}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-1 transition-opacity">
                        {po.status !== "Draft" && (
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleView(po); }}
                              className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                              title="查看详情"
                          >
                            <Eye size={16} />
                          </button>
                        )}

                        {/* Management Actions: Show Truck for Confirmed, Ordered, or Shipped */}
                               {(po.status === "Confirmed" || (po.status as string) === "Ordered" || po.status === "Shipped") && (
                                <div className="flex items-center gap-1">
                                   {/* If not all info is provided, show "Complete Info" button */}
                                    {(() => {
                                      const tracking = po.trackingData || [];
                                      const hasTracking = tracking.length > 0;
                                      const hasAllWaybills = hasTracking && tracking.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0));
                                      const hasPayment = po.paymentVoucher || (po.paymentVouchers && po.paymentVouchers.length > 0);
                                      
                                      if (!(hasTracking && hasAllWaybills && hasPayment)) {
                                          let label = "补全资料";
                                          let colorClass = "text-orange-500 bg-orange-500/10";
                                          let Icon = Truck;
                                          let animate = "";
                                          
                                          if (!hasPayment) {
                                              label = "上传凭证";
                                              colorClass = "text-amber-500 bg-amber-500/10";
                                              Icon = FileText;
                                          } else if (!hasTracking) {
                                              label = "录入单号";
                                              colorClass = "text-blue-500 bg-blue-500/10";
                                              Icon = Hash;
                                          } else if (!hasAllWaybills) {
                                              label = "上传面单";
                                              colorClass = "text-orange-500 bg-orange-500/10";
                                              Icon = Camera;
                                              animate = "animate-pulse";
                                          }

                                          return (
                                              <button 
                                                  onClick={(e) => { e.stopPropagation(); setTrackingModal({
                                                      isOpen: true,
                                                      purchaseId: po.id,
                                                      initialValue: po.trackingData || [],
                                                      paymentVoucher: po.paymentVoucher,
                                                      paymentVouchers: po.paymentVouchers || [],
                                                      lockPackages: false
                                                  }); }}
                                                  className={`p-2 rounded-lg ${colorClass} ${animate} flex items-center gap-2 transition-all hover:scale-105`}
                                                  title={`点击以${label}`}
                                              >
                                                  <Icon size={16} />
                                                  <span className="text-[10px] font-bold">{label}</span>
                                              </button>
                                          );
                                      }
                                      return null;
                                   })()}
 
                                   {/* Show Confirm button if it's Shipped (or legacy Ordered) AND all waybills are present */}
                                    {(po.status === "Shipped" || (po.status as string) === "Ordered") && 
                                     (po.trackingData || []).length > 0 && 
                                     (po.trackingData || []).every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && (
                                       <button 
                                           onClick={(e) => { e.stopPropagation(); handleConfirmReceipt(po.id); }}
                                           className="p-2 rounded-lg text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all flex items-center gap-2 animate-in zoom-in-95 duration-300"
                                           title="确认入库"
                                       >
                                           <CheckCircle2 size={16} />
                                           <span className="text-[10px] font-bold ml-1">确认入库</span>
                                       </button>
                                   )}
                               </div>
                             )}

                        {/* Actions: Only allow edit/delete for Drafts */}
                        {po.status === "Draft" ? (
                          <>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(po); }}
                                className="p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                title="编辑"
                            >
                               <Edit2 size={16} />
                            </button>
                             <button 
                                 onClick={(e) => { e.stopPropagation(); handleDelete(po.id); }}
                                 className="p-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                                 title="删除"
                             >
                               <Trash2 size={16} />
                             </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          ) : (
            <div className="py-20 flex flex-col items-center justify-center text-center">
               <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mb-6 text-muted-foreground/50 border border-dashed border-border group-hover:scale-110 transition-transform duration-500">
                 <ShoppingBag size={40} strokeWidth={1.5} />
               </div>
               <h3 className="text-xl font-bold text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-sm mt-2 max-w-[280px] leading-relaxed">
                 {searchQuery || statusFilter !== 'All' ? '当前筛选条件下没有找到记录，尝试调整筛选或搜索关键词。' : '还没有采购记录，点击右上角“新建采购单”开始。'}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-20">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
             <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-muted-foreground text-sm font-medium">加载中...</p>
             </div>
          ) : filteredPurchases.length > 0 ? (
            filteredPurchases.map((po) => (
              <motion.div
                key={po.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="rounded-2xl border border-border bg-white dark:bg-white/5 p-4 shadow-sm"
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-4">
                   <div className="flex flex-col">
                      <span className="font-bold text-base leading-tight font-mono">
                        {po.id}
                      </span>
                   </div>
                   <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(po.status)}`}>
                      {getStatusLabel(po.status)}
                   </span>
                </div>
                
                {/* Card Body */}
                <div className="space-y-3 text-sm mb-4 bg-muted/30 p-3 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">交易金额</span>
                      <span className="font-bold flex items-center text-foreground">
                          <span className="mr-0.5 opacity-70">￥</span>
                          {po.totalAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">下单时间</span>
                      <div className="flex items-center gap-1.5 text-foreground/80 text-xs text-right font-mono">
                          <Calendar size={13} />
                          <span>
                              {formatLocalDateTime(po.date)}
                          </span>
                      </div>
                    </div>
                    {po.trackingData && po.trackingData.length > 0 && (
                      <div className="pt-2 border-t border-border/10 space-y-1.5">
                          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">物流包裹 ({po.trackingData.length})</span>
                          <div className="grid grid-cols-1 gap-1.5">
                            {po.trackingData.map((td, idx) => (
                              <div 
                                  key={idx} 
                                  className="flex justify-between items-center bg-orange-500/5 px-3 py-2 rounded-lg border border-orange-500/10 group/mob-item"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(td.number);
                                      showToast("单号已复制", "success");
                                  }}
                              >
                                  <div className="flex items-center gap-2 text-orange-500 font-mono text-[10px] min-w-0 flex-1">
                                      <Truck size={12} className="shrink-0" />
                                      <span className="shrink-0 whitespace-nowrap">{td.courier}:</span>
                                      <span className="truncate font-bold">{td.number}</span>
                                  </div>
                                      <div className="flex items-center gap-2 opacity-40 group-hover/mob-item:opacity-100 transition-opacity">
                                          {(() => {
                                              const url = getTrackingUrl(td.number, td.courier);
                                              if (!url) return null;
                                              return (
                                                  <button
                                                      onClick={(e) => {
                                                          e.stopPropagation();
                                                          window.open(url, '_blank');
                                                      }}
                                                      className="p-1"
                                                  >
                                                      <ExternalLink size={12} className="text-orange-500" />
                                                  </button>
                                              );
                                          })()}
                                          <button
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  navigator.clipboard.writeText(td.number);
                                                  showToast("单号已复制到剪贴板", "success");
                                              }}
                                              className="p-1"
                                          >
                                              <Copy size={12} className="text-orange-500" />
                                          </button>
                                      </div>
                              </div>
                            ))}
                          </div>
                      </div>
                    )}
                </div>
  
                 {/* Actions */}
                <div className="flex items-center gap-2">
                   {po.status !== "Draft" && (
                     <button 
                        onClick={() => handleView(po)}
                        className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-secondary text-foreground font-medium hover:bg-secondary/80 active:scale-95 transition-all text-xs"
                    >
                        <Eye size={14} />
                        详情
                    </button>
                   )}
  
                    {/* Management Actions: Show Truck for Ordered/Received */}
                    {/* Management Actions: Show Truck for Confirmed/Shipped/Ordered */}
                     {(po.status === "Confirmed" || po.status === "Shipped" || (po.status as string) === "Ordered") && (
                      <div className="flex-2 flex gap-2 w-full">
                                {(() => {
                                    const tracking = po.trackingData || [];
                                    const hasTracking = tracking.length > 0;
                                    const hasAllWaybills = hasTracking && tracking.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0));
                                    const hasPayment = po.paymentVoucher || (po.paymentVouchers && po.paymentVouchers.length > 0);
                                    
                                   if (hasTracking && hasAllWaybills && hasPayment) return null;
  
                                   let label = "补全进货资料";
                                   let colorClass = "bg-orange-500";
                                   let Icon = Truck;
                                   let animate = "";
  
                                   if (!hasPayment) {
                                       label = "上传凭证";
                                       colorClass = "bg-amber-500";
                                       Icon = FileText;
                                   } else if (!hasTracking) {
                                       label = "录入单号";
                                       colorClass = "bg-blue-500";
                                       Icon = Hash;
                                   } else if (!hasAllWaybills) {
                                       label = "上传面单";
                                       colorClass = "bg-orange-500";
                                       Icon = Camera;
                                       animate = "animate-pulse";
                                   }
                                   
                                   return (
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); setTrackingModal({
                                              isOpen: true,
                                              purchaseId: po.id,
                                              initialValue: po.trackingData || [],
                                              paymentVoucher: po.paymentVoucher,
                                              paymentVouchers: po.paymentVouchers || [],
                                              lockPackages: false
                                          }); }}
                                          className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg ${colorClass} text-white shadow-lg ${colorClass}/20 ${animate} font-medium active:scale-95 transition-all text-xs`}
                                      >
                                          <Icon size={14} />
                                          {label}
                                      </button>
                                   );
                               })()}
  
                                  {((po.trackingData || []).length > 0) && (po.trackingData || []).every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && (
                                      <button 
                                          onClick={(e) => { e.stopPropagation(); handleConfirmReceipt(po.id); }}
                                          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-emerald-500 text-white font-medium hover:bg-emerald-600 active:scale-95 transition-all text-xs shadow-lg shadow-emerald-500/20"
                                      >
                                          <CheckCircle2 size={14} />
                                          确认入库
                                      </button>
                                  )}
                      </div>
                    )}
  
                    
                    {/* Actions: Only allow edit/delete for Drafts */}
                    {po.status === "Draft" ? (
                      <div className="flex gap-2">
                         <button 
                          onClick={() => handleEdit(po)}
                          className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 active:scale-95 transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(po.id)}
                          className="h-9 w-9 flex items-center justify-center rounded-lg bg-red-500/10 text-destructive hover:bg-red-500/20 active:scale-95 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : null}
                </div>
              </motion.div>
            ))
          ) : (
             <div className="py-12 flex flex-col items-center justify-center text-center">
               <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4 text-muted-foreground/50 border border-dashed border-border transition-transform duration-500">
                 <ShoppingBag size={32} />
               </div>
               <h3 className="text-lg font-bold text-foreground">暂无采购记录</h3>
               <p className="text-muted-foreground text-xs mt-1 max-w-[240px]">
                 {searchQuery || statusFilter !== 'All' ? '未找到匹配结果，尝试更改筛选条件或搜索关键词。' : '您目前还没有任何采购订单，立即创建一个吧。'}
               </p>
              </div>
           )}
        </AnimatePresence>
      </div>



       <PurchaseOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        initialData={editingPurchase}
        readOnly={detailReadOnly || (editingPurchase ? editingPurchase.status !== "Draft" : false)}
      />

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        message={confirmConfig.message}
        title={confirmConfig.title}
        confirmLabel="确认删除"
        variant="danger"
      />

      <TrackingNumberModal 
        isOpen={trackingModal.isOpen}
        onClose={() => setTrackingModal(prev => ({ ...prev, isOpen: false }))}
        initialValue={trackingModal.initialValue}
        paymentVouchers={trackingModal.paymentVouchers}
        paymentVoucher={trackingModal.paymentVoucher}
        readOnly={purchases.find(p => p.id === trackingModal.purchaseId)?.status === "Received"}
        lockPackages={trackingModal.lockPackages}
        onConfirm={(val, vouchers) => {
            if (trackingModal.purchaseId) {
                handleUpdateTracking(trackingModal.purchaseId, val, vouchers);
            }
        }}
        onViewImages={(images: string[], index?: number) => {
          setGalleryState({ isOpen: true, images, currentIndex: index || 0, scale: 1, direction: 0 });
        }}
      />

      {/* Waybill Gallery Preview */}
      <ImageGallery 
        isOpen={galleryState.isOpen}
        images={galleryState.images}
        initialIndex={galleryState.currentIndex}
        onClose={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
