"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Search, ShoppingBag, Calendar, Edit2, Trash2, CheckCircle2, Truck, ChevronLeft, ChevronRight, X as CloseIcon } from "lucide-react";
import { useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import { PurchaseOrderModal } from "@/components/Purchases/PurchaseOrderModal";
import { PurchaseOrder, PurchaseStatus, Supplier, TrackingInfo } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import TrackingNumberModal from "@/components/Purchases/TrackingNumberModal";

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<PurchaseOrder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
  }>({
    isOpen: false,
    purchaseId: null,
    initialValue: [],
  });
  const [uploadingParcelInfo, setUploadingParcelInfo] = useState<{ poId: string; index: number } | null>(null);
  const [galleryState, setGalleryState] = useState<{
    isOpen: boolean;
    images: string[];
    currentIndex: number;
  }>({
    isOpen: false,
    images: [],
    currentIndex: 0
  });
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const fetchData = async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/purchases"),
        fetch("/api/suppliers")
      ]);
      if (pRes.ok && sRes.ok) {
        setPurchases(await pRes.json());
        setSuppliers(await sRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch purchases data:", error);
    }
  };

  useEffect(() => {
    fetchData();
    setMounted(true);
  }, []);

  const getSupplierName = (id: string) => {
    return suppliers.find(s => s.id === id)?.name || "未知供应商";
  };

  const getStatusColor = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "Ordered": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      default: return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    }
  };

  const getStatusLabel = (status: PurchaseStatus) => {
    switch (status) {
      case "Received": return "已入库";
      case "Ordered": return "已下单";
      default: return "草稿";
    }
  };

  const handleCreate = () => {
    setEditingPurchase(null);
    setIsModalOpen(true);
  };

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPurchase(po);
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

  const handleWaybillUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingParcelInfo) return;

    const { poId, index } = uploadingParcelInfo;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const { url } = await res.json();
        
        // Find the purchase and update its trackingData array
        const po = purchases.find(p => p.id === poId);
        if (!po) return;

        const newTrackingData = [...(po.trackingData || [])];
        if (newTrackingData[index]) {
          const currentData = newTrackingData[index];
          let images = currentData.waybillImages || [];
          
          // Migrate old single image if modern array doesn't exist yet but old field does
          if (images.length === 0 && currentData.waybillImage) {
            images = [currentData.waybillImage];
          }
          
          // Append new image
          images = [...images, url];
          
          newTrackingData[index] = { 
            ...currentData, 
            waybillImage: images[0], // Keep for backward compatibility/quick preview
            waybillImages: images 
          };
        }

        const updateRes = await fetch(`/api/purchases/${poId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackingData: newTrackingData }),
        });

        if (updateRes.ok) {
          fetchData();
          showToast("面单已上传", "success");
          
          // Keep modal in sync if it's open
          if (trackingModal.isOpen && trackingModal.purchaseId === poId) {
            setTrackingModal(prev => ({
              ...prev,
              initialValue: newTrackingData
            }));
          }
        } else {
          showToast("更新采购单失败", "error");
        }
      } else {
        showToast("上传失败", "error");
      }
    } catch (error) {
      console.error("Waybill upload failed:", error);
      showToast("网络错误", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadingParcelInfo(null);
    }
  };

  const handleRemoveWaybillImage = async (poId: string, rowIndex: number, imgIdx: number) => {
    try {
      const po = purchases.find(p => p.id === poId);
      if (!po) return;

      const newTrackingData = [...(po.trackingData || [])];
      if (newTrackingData[rowIndex]) {
        const currentData = newTrackingData[rowIndex];
        let images = currentData.waybillImages || [];
        if (images.length === 0 && currentData.waybillImage) {
          images = [currentData.waybillImage];
        }
        
        const newImages = images.filter((_, i) => i !== imgIdx);
        newTrackingData[rowIndex] = {
          ...currentData,
          waybillImage: newImages[0] || "",
          waybillImages: newImages
        };
      }

      const res = await fetch(`/api/purchases/${poId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingData: newTrackingData }),
      });

      if (res.ok) {
        fetchData();
        showToast("面单已移除", "success");
        
        if (trackingModal.isOpen && trackingModal.purchaseId === poId) {
          setTrackingModal(prev => ({
            ...prev,
            initialValue: newTrackingData
          }));
        }
      }
    } catch (error) {
      console.error("Remove waybill image failed:", error);
    }
  };

  const handleUpdateTracking = async (id: string, trackingData: TrackingInfo[]) => {
    try {
      const res = await fetch(`/api/purchases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingData }),
      });
      if (res.ok) {
        fetchData();
        showToast("单号已更新", "success");
      } else {
        showToast("更新失败", "error");
      }
    } catch (error) {
      console.error("Update tracking failed:", error);
      showToast("网络错误", "error");
    }
  };

  const triggerUpload = (poId: string, index: number) => {
    setUploadingParcelInfo({ poId, index });
    if (fileInputRef.current) fileInputRef.current.click();
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
    const matchesId = p.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSupplier = p.items.some(item => 
      item.supplier?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return matchesId || matchesSupplier;
  });

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">采购管理</h1>
          <p className="text-muted-foreground mt-2">管理与供应商的采购订单，跟踪入库进度。</p>
        </div>
        
        <button 
          onClick={handleCreate}
          className="h-10 flex items-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:-translate-y-0.5 transition-all"
        >
          <Plus size={18} />
          新建采购单
        </button>
      </div>

      {/* Search Box */}
      <div className="h-10 px-5 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 flex items-center gap-3 focus-within:ring-2 focus-within:ring-primary/20 transition-all dark:hover:bg-white/10">
        <Search size={18} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="搜索采购记录..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground text-sm"
        />
      </div>

      {/* Table/List View */}
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-border bg-white dark:bg-gray-900/70 backdrop-blur-md overflow-hidden shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-220px)]">
          <table className="w-full text-left border-collapse min-w-[800px] table-auto">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">采购单编号</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">交易金额</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">状态</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center whitespace-nowrap">日期</th>
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
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-2">
                            <Calendar size={14} />
                            {new Date(po.date).toISOString().slice(0, 10)}
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                          {(po.trackingData && po.trackingData.length > 0) ? (
                            po.trackingData.map((td, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-[10px] text-orange-500 font-mono bg-orange-500/5 px-2 py-0.5 rounded-md border border-orange-500/10">
                                <Truck size={10} className="shrink-0" />
                                <span className="opacity-70">{td.courier}:</span>
                                <span>{td.number}</span>
                              </div>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground opacity-30 italic">暂无物流信息</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex justify-center items-center gap-1 transition-opacity">
                        {/* Management Actions: Show Truck for both Ordered and Received */}
                        {(po.status === "Ordered" || po.status === "Received") && (
                          <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setTrackingModal({
                                    isOpen: true,
                                    purchaseId: po.id,
                                    initialValue: po.trackingData || []
                                })}
                                className="p-2 rounded-lg text-orange-500 hover:bg-orange-500/10 transition-colors" 
                                title="物流与面单"
                            >
                                <Truck size={16} />
                            </button>
                            
                            {/* Flow actions: Inbound only for Ordered */}
                            {po.status === "Ordered" && po.trackingData && po.trackingData.length > 0 && po.trackingData.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && (
                              <button 
                                  onClick={() => handleConfirmReceipt(po.id)}
                                  className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors" 
                                  title="确认入库"
                              >
                                  <CheckCircle2 size={16} />
                              </button>
                            )}
                          </div>
                        )}
                        {/* Actions: Only allow edit/delete for Drafts */}
                        {po.status === "Draft" ? (
                          <>
                            <button 
                                onClick={() => handleEdit(po)}
                                className="p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 transition-colors"
                                title="编辑"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                                onClick={() => handleDelete(po.id)}
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
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden pb-20">
        <AnimatePresence mode="popLayout">
          {filteredPurchases.map((po) => (
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
                    <span className="text-muted-foreground">供应商</span>
                    <span className="font-medium text-xs text-right truncate max-w-[150px]">
                      {(() => {
                        const supplierNames = Array.from(new Set(po.items.map(item => item.supplier?.name).filter(Boolean)));
                        if (supplierNames.length === 0) return "未知供应商";
                        if (supplierNames.length === 1) return supplierNames[0];
                        return `${supplierNames[0]} 等 ${supplierNames.length} 家`;
                      })()}
                    </span>
                  </div>
                 <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">交易金额</span>
                    <span className="font-bold flex items-center text-foreground">
                        <span className="mr-0.5 opacity-70">￥</span>
                        {po.totalAmount.toLocaleString()}
                    </span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">创建日期</span>
                    <div className="flex items-center gap-1.5 text-foreground/80 text-xs text-right">
                        <Calendar size={13} />
                        <span>{new Date(po.date).toISOString().slice(0, 10)}</span>
                    </div>
                 </div>
                 {po.trackingData && po.trackingData.length > 0 && (
                    <div className="pt-2 border-t border-border/10 space-y-1.5">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">物流包裹 ({po.trackingData.length})</span>
                        <div className="grid grid-cols-1 gap-1.5">
                          {po.trackingData.map((td, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-orange-500/5 px-3 py-2 rounded-lg border border-orange-500/10">
                                <div className="flex items-center gap-2 text-orange-500 font-mono text-[10px]">
                                    <Truck size={12} />
                                    <span>{td.courier}: {td.number}</span>
                                </div>
                            </div>
                          ))}
                        </div>
                    </div>
                 )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                  {/* Management Actions: Show Truck for Ordered/Received */}
                  {(po.status === "Ordered" || po.status === "Received") && (
                    <div className="flex-1 flex gap-2">
                        <button 
                            onClick={() => setTrackingModal({
                                isOpen: true,
                                purchaseId: po.id,
                                initialValue: po.trackingData || []
                            })}
                            className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-orange-500/10 text-orange-500 font-medium hover:bg-orange-500/20 active:scale-95 transition-all text-xs"
                        >
                            <Truck size={14} />
                            {po.status === "Received" ? "查看物流" : "管理物流"}
                        </button>
                        {po.status === "Ordered" && po.trackingData && po.trackingData.length > 0 && po.trackingData.every(td => td.waybillImage || (td.waybillImages && td.waybillImages.length > 0)) && (
                          <button 
                              onClick={() => handleConfirmReceipt(po.id)}
                              className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 font-medium hover:bg-emerald-500/20 active:scale-95 transition-all text-xs"
                          >
                              <CheckCircle2 size={14} />
                              入库
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
                  ) : (
                    // On mobile card, if it's already ordered/received, the edit/delete are hidden
                    null
                  )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredPurchases.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                <ShoppingBag size={32} />
              </div>
              <h3 className="text-lg font-medium">暂无采购记录</h3>
              <p className="text-muted-foreground text-sm mt-1">尝试搜索其他关键词</p>
            </div>
        )}
      </div>

      <input 
        type="file" 
        hidden 
        ref={fileInputRef} 
        accept="image/*"
        onChange={handleWaybillUpload}
      />

      <PurchaseOrderModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleSave}
        initialData={editingPurchase}
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
        onConfirm={(val) => {
            if (trackingModal.purchaseId) {
                handleUpdateTracking(trackingModal.purchaseId, val);
            }
        }}
        onUpload={(index) => {
          if (trackingModal.purchaseId) {
            triggerUpload(trackingModal.purchaseId, index);
          }
        }}
        onRemoveImage={(rowIndex, imgIdx) => {
          if (trackingModal.purchaseId) {
            handleRemoveWaybillImage(trackingModal.purchaseId, rowIndex, imgIdx);
          }
        }}
        onViewImages={(images) => {
          setGalleryState({ isOpen: true, images, currentIndex: 0 });
        }}
      />

      {/* Waybill Gallery Preview */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {galleryState.isOpen && (
            <div className="fixed inset-0 z-10001 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative z-10 w-full max-w-4xl max-h-[90vh] flex flex-col items-center p-4"
              >
                {/* Top Bar */}
                <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between text-white z-20">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold opacity-70 uppercase tracking-widest">面单预览</span>
                    <span className="text-xl font-black">{galleryState.currentIndex + 1} / {galleryState.images.length}</span>
                  </div>
                  <button 
                    onClick={() => setGalleryState(prev => ({ ...prev, isOpen: false }))}
                    className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all active:scale-90"
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>

                {/* Navigation */}
                {galleryState.images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setGalleryState(prev => ({
                          ...prev,
                          currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length
                        }));
                      }}
                      className="absolute left-6 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 z-20"
                    >
                      <ChevronLeft size={32} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setGalleryState(prev => ({
                          ...prev,
                          currentIndex: (prev.currentIndex + 1) % prev.images.length
                        }));
                      }}
                      className="absolute right-6 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90 z-20"
                    >
                      <ChevronRight size={32} />
                    </button>
                  </>
                )}

                {/* Image Content */}
                <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/40 border border-white/10">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={galleryState.currentIndex}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      src={galleryState.images[galleryState.currentIndex]}
                      alt="waybill"
                      className="max-w-full max-h-[80vh] object-contain shadow-2xl"
                    />
                  </AnimatePresence>
                </div>

                {/* Thumbnails */}
                {galleryState.images.length > 1 && (
                  <div className="flex gap-2 mt-6 p-2 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 overflow-x-auto max-w-full scrollbar-none">
                    {galleryState.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setGalleryState(prev => ({ ...prev, currentIndex: idx }))}
                        className={`h-16 w-16 rounded-lg overflow-hidden border-2 transition-all ${
                          idx === galleryState.currentIndex ? "border-primary scale-110 shadow-lg" : "border-transparent opacity-40 hover:opacity-100"
                        }`}
                      >
                        <img src={img} alt="thumb" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
