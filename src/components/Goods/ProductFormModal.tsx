"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Tag, Truck, FileText, Camera, ExternalLink, Eye, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { Product, GalleryItem, Supplier, Category, PurchaseOrder, PurchaseOrderItem } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { CategoryModal } from "@/components/Categories/CategoryModal";
import { SupplierModal } from "@/components/Suppliers/SupplierModal";


function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Product, "id"> & { id?: string }) => void;
  initialData?: Product | null;
}

import { createPortal } from "react-dom";

export function ProductFormModal({ isOpen, onClose, onSubmit, initialData }: ProductFormModalProps) {
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    categoryId: initialData?.categoryId || "",
    costPrice: initialData?.costPrice?.toString() || "",
    stock: initialData?.stock?.toString() || "",
    image: initialData?.image || "",
    supplierId: initialData?.supplierId || "",
    sku: initialData?.sku || "",
    isPublic: initialData?.isPublic ?? true
  });
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mounted, setMounted] = useState(false);
  const { showToast } = useToast();
  const [galleryImages, setGalleryImages] = useState<GalleryItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    onConfirm: () => void;
    message: string;
    variant?: "danger" | "warning";
  }>({
    isOpen: false,
    onConfirm: () => {},
    message: "",
  });
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<GalleryItem | null>(null);
  const [previewDirection, setPreviewDirection] = useState(0);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [inboundHistory, setInboundHistory] = useState<PurchaseOrder[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  
  // 批量管理状态 (Batch manage state)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterBatchMode = () => {
    setIsBatchMode(true);
    setSelectedIds(new Set());
    showToast("已进入批量选择模式", "info");
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === galleryImages.length + (formData.image && !galleryImages.find(i => i.url === formData.image) ? 1 : 0)) {
        setSelectedIds(new Set());
    } else {
        const allIds = galleryImages.map(img => img.id);
        if (formData.image && !galleryImages.find(i => i.url === formData.image)) {
            allIds.push('cover-virtual');
        }
        setSelectedIds(new Set(allIds));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!initialData?.id) return;
      setIsLoadingBatches(true);
      try {
        const historyRes = await fetch(`/api/purchases?type=Inbound&productId=${initialData.id}`);

        if (historyRes.ok) {
          setInboundHistory(await historyRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch product data:", error);
      } finally {
        setIsLoadingBatches(false);
      }
    };

    if (isOpen && initialData) {
      fetchData();
    } else {
      setInboundHistory([]);
    }
  }, [isOpen, initialData]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sRes, cRes] = await Promise.all([
          fetch("/api/suppliers"),
          fetch("/api/categories")
        ]);
        if (sRes.ok && cRes.ok) {
          setSuppliers(await sRes.json());
          setCategories(await cRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch form data:", error);
      }
    };

    if (isOpen) {
      fetchData();
      
      // 强制同步 initialData 到本地 formData 状态
      if (initialData) {
        setFormData({
            name: initialData.name || "",
            categoryId: initialData.categoryId || "",
            costPrice: initialData.costPrice?.toString() || "",
            stock: initialData.stock?.toString() || "",
            image: initialData.image || "",
            supplierId: initialData.supplierId || "",
            sku: initialData.sku || "",
            isPublic: initialData.isPublic ?? true
        });
      } else {
        // 新增模式，重置为空
        setFormData({
            name: "",
            categoryId: "",
            costPrice: "",
            stock: "",
            image: "",
            supplierId: "",
            sku: "",
            isPublic: true
        });
      }

      if (initialData?.id) {
        fetch(`/api/gallery?productId=${initialData.id}`)
          .then(res => res.json())
          .then(data => setGalleryImages(data));
      } else {
        setGalleryImages([]);
      }
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isMain: boolean = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    showToast(`正在上传 ${files.length} 个文件...`, "info");
    
    try {
      // 循环处理每一个选中的文件 (Loop through each selected file)
      for (const file of Array.from(files)) {
        // 前端大小校验 (Frontend size validation - 50MB)
        if (file.size > 50 * 1024 * 1024) {
          showToast(`文件 "${file.name}" 超过 50MB 限制, 无法上传`, "error");
          continue;
        }

        // 使用 arrayBuffer 确保完整传输,特别是对于视频文件
        const fileBuffer = await file.arrayBuffer();
        
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Type": file.type
          },
          body: fileBuffer, // 发送 ArrayBuffer 而不是 File 对象
        });

        if (!res.ok) {
          let errorMessage = "上传失败";
          try {
             const errorData = await res.json();
             errorMessage = errorData.error || `上传失败 (${res.status})`;
          } catch {
             errorMessage = `上传失败 (${res.status}: ${res.statusText})`;
          }
          
          if (res.status === 413 || errorMessage.includes("exceeded") || errorMessage.includes("too large")) {
            errorMessage = "文件过大, 请上传较小的文件 (建议<50MB)。";
          }

          showToast(errorMessage, "error");
          continue; // Skip valid logic and continue to next file (or just stop)
        }

        const { url, type, skipped } = await res.json();
        
        // 检查该 URL 是否已经在相册中或已是封面 (Check if URL is already in gallery or cover)
        const currentUrls = new Set([...galleryImages.map(img => img.url), formData.image]);
        if (currentUrls.has(url)) {
          showToast(`该媒体 "${file.name}" 已在相册中`, "info");
          continue;
        }

        // 如果文件是物理跳过的 (hash 相同)，但在当前商品中没有记录，则继续添加记录
        if (skipped) {
          showToast(`文件 "${file.name}" 已存在, 已复用现有文件`, "success");
        }
        
        // Base logic continues...
        const isVideoType = type === 'video';
          
        if (isMain) {
          setFormData(prev => ({ ...prev, image: url }));
        } else {
          // 如果是新增商品且还没有主图,自动将第一张上传的图设为主图
          if (!formData.image) {
            setFormData(prev => ({ ...prev, image: url }));
          }

          // 如果已有商品 ID,则直接保存到相册表
          if (initialData?.id) {
            const gRes = await fetch("/api/gallery", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url,
                productId: initialData.id,
                type: isVideoType ? 'video' : 'image'
              })
            });
            if (gRes.ok) {
              const newItem = await gRes.json();
              setGalleryImages(prev => [...prev, newItem]);
            } else {
               showToast("保存图片记录失败", "error");
            }
          } else {
            // 临时保存,提交时再处理
            const tempImg: GalleryItem = {
              id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              url,
              productId: "", // 临时 ID 为空
              uploadDate: new Date().toISOString(),
              tags: [],
              type: isVideoType ? 'video' : 'image'
            };
            setGalleryImages(prev => [...prev, tempImg]);
          }
        }
      }
    } catch (error) {
      console.error("Upload failed:", error);
      showToast("上传过程中发生错误", "error");
    } finally {
      setIsUploading(false);
      // 重置 input 以允许再次选择相同文件
      e.target.value = "";
    }
  };

  const setAsMainImage = (url: string) => {
    setFormData(prev => ({ ...prev, image: url }));
    showToast("已设为商品封面", "success");
  };

  const toggleSelectImage = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    const idsToDelete = Array.from(selectedIds).filter(id => id !== 'cover-virtual');
    const deleteVirtualCover = selectedIds.has('cover-virtual');
    const count = selectedIds.size;

    setConfirmConfig({
      isOpen: true,
      message: `确定要移除选中的 ${count} 个项目吗？此操作不可撤销。`,
      variant: "danger",
      onConfirm: async () => {
        try {
          if (idsToDelete.length > 0) {
            const res = await fetch("/api/gallery/batch", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: idsToDelete })
            });

            if (res.ok) {
              setGalleryImages(prev => prev.filter(img => !selectedIds.has(img.id)));
              showToast(`成功删除 ${idsToDelete.length} 个项目`, "success");
            } else {
              showToast("批量删除失败", "error");
            }
          }

          if (deleteVirtualCover) {
            setFormData(prev => ({ ...prev, image: "" }));
            showToast("已移除封面引用", "success");
          }
          
          // 检查正常删除项中是否包含当前封面关联的 ID (Check if regular deletes include current cover)
          const deletedUrls = new Set(galleryImages.filter(img => selectedIds.has(img.id)).map(img => img.url));
          if (deletedUrls.has(formData.image)) {
            setFormData(prev => ({ ...prev, image: "" }));
          }

          setSelectedIds(new Set());
          setIsBatchMode(false);
        } catch (error) {
          console.error("Batch delete failed:", error);
          showToast("删除过程中发生错误", "error");
        }
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeletePhoto = async (img: GalleryItem) => {
    const isCover = formData.image === img.url;
    const isVirtual = img.id === 'cover-virtual';

    setConfirmConfig({
      isOpen: true,
      message: isCover 
        ? "确定要移除这张封面图吗？移除后商品将没有主图展示。" 
        : "确定要从相册中移除这个实拍媒体吗？此操作不可撤销。",
      variant: "danger",
      onConfirm: async () => {
        // 如果是封面，先清除封面引用，防止删除后逻辑使其重新生成虚拟项
        if (isCover) {
          setFormData(prev => ({ ...prev, image: "" }));
        }

        // 如果只是虚拟封面项，直接从 UI 移除即可（上面已处理 formData）
        if (isVirtual) {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          return;
        }

        if (img.id.startsWith("temp-")) {
          setGalleryImages(prev => prev.filter(i => i.id !== img.id));
          showToast("已移除", "success");
        } else {
          try {
            const res = await fetch(`/api/gallery/${img.id}`, { method: "DELETE" });
            if (res.ok) {
              setGalleryImages(prev => prev.filter(i => i.id !== img.id));
              showToast("已删除", "success");
            }
          } catch (error) {
            console.error("Delete photo failed:", error);
            showToast("删除失败", "error");
          }
        }
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleCreateCategory = async (data: Partial<Category>) => {
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const newCat = await res.json();
        setCategories(prev => [...prev, newCat]);
        setFormData(prev => ({ ...prev, categoryId: newCat.id }));
        showToast("分类创建成功", "success");
      }
    } catch {
      showToast("分类创建失败", "error");
    }
  };

  const handleCreateSupplier = async (data: Omit<Supplier, "id"> & { id?: string }) => {
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        const newSup = await res.json();
        setSuppliers(prev => [...prev, newSup]);
        setFormData(prev => ({ ...prev, supplierId: newSup.id }));
        showToast("供应商创建成功", "success");
      }
    } catch {
      showToast("供应商创建失败", "error");
    }
  };

  // 提取所有图片的 URL 以便查重 (Extract all image URLs to check for duplicates)
  const galleryUrls = new Set(galleryImages.map(img => img.url));
  
  // 构建最终显示的列表 (Build the final display list)
  const displayList = [...galleryImages];
  
  // 排序：封面图置顶，其他按时间升序 (Sort: Cover image on top, others in ascending time order)
  displayList.sort((a, b) => {
    const isACover = formData.image === a.url;
    const isBCover = formData.image === b.url;
    if (isACover && !isBCover) return -1;
    if (!isACover && isBCover) return 1;
    const dateA = new Date((a as GalleryItem).createdAt || a.uploadDate).getTime();
    const dateB = new Date((b as GalleryItem).createdAt || b.uploadDate).getTime();
    return dateA - dateB;
  });

  // 如果封面图不在相册里且存在 URL，将其作为一个虚拟项添加进去并置顶
  // (If cover image is not in gallery but exists, add it as a virtual item and put it on top)
  if (formData.image && !galleryUrls.has(formData.image)) {
    displayList.unshift({
      id: 'cover-virtual',
      url: formData.image,
      productId: initialData?.id || '',
      uploadDate: new Date().toISOString(),
      tags: []
    } as GalleryItem);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation for mandatory fields
    if (!formData.sku.trim()) {
        showToast("请输入商品编号 (SKU)", "error");
        return;
    }
    if (!formData.name.trim()) {
        showToast("请输入商品名称", "error");
        return;
    }
    if (!formData.categoryId) {
        showToast("请选择商品分类", "error");
        return;
    }



    onSubmit({
        ...formData,
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        id: initialData?.id
    });
    onClose();
  };

  // --- Lightbox 增强功能 (Lightbox Enhancements) ---
  const resetTransform = () => setTransform({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    resetTransform();
  }, [selectedPreviewImage?.id]);

  const navigatePreview = (dir: number) => {
    if (!selectedPreviewImage) return;
    const currentIndex = displayList.findIndex(img => img.id === selectedPreviewImage.id);
    if (currentIndex === -1) return;
    
    const nextIndex = (currentIndex + dir + displayList.length) % displayList.length;
    setPreviewDirection(dir);
    setSelectedPreviewImage(displayList[nextIndex]);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (selectedPreviewImage?.type === 'video') return;
    e.preventDefault();
    const delta = -e.deltaY;
    const scaleStep = 0.3;
    const newScale = Math.min(Math.max(transform.scale + (delta > 0 ? scaleStep : -scaleStep), 1), 5);

    if (newScale === transform.scale) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left - centerX;
    const mouseY = e.clientY - rect.top - centerY;
    const scaleRatio = newScale / transform.scale;
    
    let newX = mouseX - (mouseX - transform.x) * scaleRatio;
    let newY = mouseY - (mouseY - transform.y) * scaleRatio;

    if (newScale === 1) { newX = 0; newY = 0; }

    setTransform({ scale: newScale, x: newX, y: newY });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (transform.scale <= 1 || selectedPreviewImage?.type === 'video') return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
    }));
  };

  const handlePointerUp = () => setIsDragging(false);
  // --- END Lightbox 增强功能 ---

  if (!mounted) return null;

  return createPortal(
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-9999 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-9999 w-[calc(100%-2rem)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">{initialData ? "编辑商品" : "新增商品"}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {/* SKU */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText size={16} /> 商品编号 (SKU) <span className="text-red-500">*</span>
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.sku}
                            onChange={(e) => setFormData({...formData, sku: e.target.value})}
                            className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all font-mono dark:hover:bg-white/10"
                            placeholder="例如：SKU-001"
                        />
                    </div>

                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Package size={16} /> 商品名称 <span className="text-red-500">*</span>
                        </label>
                        <input 
                            required
                            type="text" 
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                            placeholder="例如：高级皮质手袋"
                        />
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Tag size={16} /> 分类 <span className="text-red-500">*</span>
                        </label>
                        <CustomSelect 
                            value={formData.categoryId}
                            onChange={(value) => setFormData({...formData, categoryId: value})}
                            options={categories.map(c => ({ value: c.id, label: c.name }))}
                            placeholder="选择分类"
                            triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                            onAddNew={() => setIsCategoryModalOpen(true)}
                            addNewLabel="新增分类"
                        />
                    </div>

                    {/* Supplier */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Truck size={16} /> 供应商

                        </label>
                        <CustomSelect 
                            value={formData.supplierId || ""}
                            onChange={(value) => setFormData({...formData, supplierId: value})}
                            options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                            placeholder="选择供应商"
                            triggerClassName="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all dark:hover:bg-white/10"
                            onAddNew={() => setIsSupplierModalOpen(true)}
                            addNewLabel="新增供应商"
                        />
                    </div>

                    {/* Visibility & Prices */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <FileText size={16} /> 进货单价 (￥)
                            </label>
                            <input 

                                type="number" 
                                step="0.01"
                                min="0"
                                value={formData.costPrice}
                                onChange={(e) => setFormData({...formData, costPrice: e.target.value})}
                                className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-medium dark:hover:bg-white/10 no-spinner"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Eye size={16} /> 对外展示
                            </label>
                            <div
                                onClick={() => setFormData({...formData, isPublic: !formData.isPublic})}
                                className="w-full rounded-full px-5 py-2.5 flex items-center justify-between border border-border bg-white dark:bg-white/5 transition-all duration-300 font-medium text-foreground cursor-pointer dark:hover:bg-white/10 group h-[46px]"
                            >
                                <span className="group-hover:text-primary transition-colors text-sm">
                                    {formData.isPublic ? "公开" : "私有"}
                                </span>
                                <Switch 
                                    checked={formData.isPublic} 
                                    onChange={(val) => setFormData({...formData, isPublic: val})} 
                                />
                            </div>
                        </div>
                    </div>

                    {/* Initial Stock */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Package size={16} /> 商品库存
                        </label>
                        <div className="relative">
                             {initialData ? (
                                <div className="w-full rounded-full bg-muted/30 border border-border/50 px-4 py-2.5 flex items-center justify-between">
                                    <span className="font-medium text-lg font-mono">{formData.stock}</span>
                                    <span className="text-xs text-muted-foreground">当前库存 (不可直接修改)</span>
                                </div>
                            ) : (
                                <input 
                                    type="number" 
                                    min="0"
                                    value={formData.stock}
                                    onChange={(e) => setFormData({...formData, stock: e.target.value})}
                                    className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-medium dark:hover:bg-white/10 no-spinner"
                                    placeholder="0"
                                />
                            )}
                            {/* Inbound History */}
                            {initialData && (
                                <div className="mt-4 p-4 rounded-2xl bg-muted/20 border border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">关联入库记录</h4>
                                        <div className="h-4 w-px bg-white/10" />
                                        <span className="text-[10px] text-primary font-medium">全部历史</span>
                                    </div>
                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                        {isLoadingBatches ? (
                                            <div className="py-4 text-center text-[10px] text-muted-foreground">加载记录中...</div>
                                        ) : inboundHistory.length > 0 ? (
                                            inboundHistory.map((order) => {
                                                // Find the specific item to get quantity/price for this product
                                                const item = order.items.find((i: PurchaseOrderItem) => i.productId === initialData.id);
                                                if (!item) return null;

                                                return (
                                                    <div key={order.id} className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-white/5 border border-white/5 hover:border-primary/20 transition-colors">
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-mono text-muted-foreground">{new Date(order.date).toLocaleDateString()}</span>
                                                                 <span className={cn(
                                                                    "text-[9px] px-1.5 py-0.5 rounded-md font-medium uppercase",
                                                                    order.status === "Received" ? "bg-green-500/10 text-green-500" : 
                                                                    order.status === "Ordered" ? "bg-blue-500/10 text-blue-500" :
                                                                    "bg-gray-500/10 text-gray-500"
                                                                )}>
                                                                    {order.status === "Received" ? "已入库" : order.status === "Ordered" ? "待入库" : "草稿"}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs font-medium text-foreground">单号: {order.id.slice(-6)}</span>
                                                        </div>
                                                        <div className="text-right flex flex-col items-end gap-0.5">
                                                            <div className="text-xs font-semibold text-foreground">
                                                                x{item.quantity} 
                                                                {item.remainingQuantity !== undefined && item.remainingQuantity !== null && order.status === 'Received' && (
                                                                    <span className="text-[10px] font-normal text-muted-foreground ml-1">
                                                                         (余: <span className={cn("font-medium", item.remainingQuantity > 0 ? "text-primary" : "text-muted-foreground")}>{item.remainingQuantity}</span>)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">成本: ￥{item.costPrice}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="py-2 text-center text-[10px] text-muted-foreground italic">暂无历史记录</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Real Photos Management */}
                    <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Camera size={18} className="text-primary" /> 实拍相册管理
                            </label>
                            {initialData?.id && (
                                <div className="flex items-center gap-4">
                                    {isBatchMode ? (
                                        <div className="flex items-center gap-3">
                                            <button 
                                                type="button"
                                                onClick={toggleSelectAll}
                                                className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 uppercase tracking-tighter"
                                            >
                                                {selectedIds.size === galleryImages.length + (formData.image && !galleryImages.find(i => i.url === formData.image) ? 1 : 0) ? "全不选" : "全选"}
                                            </button>
                                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-tight border-l border-white/10 pl-3">已选 {selectedIds.size} 项</span>
                                            <button 
                                                type="button"
                                                onClick={handleBatchDelete}
                                                disabled={selectedIds.size === 0}
                                                className="text-[11px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-30 flex items-center gap-1 uppercase tracking-tighter"
                                            >
                                                删除选中
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    setIsBatchMode(false);
                                                    setSelectedIds(new Set());
                                                }}
                                                className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 uppercase tracking-tighter"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <button 
                                                type="button"
                                                onClick={enterBatchMode}
                                                className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 uppercase tracking-tighter"
                                            >
                                                批量管理
                                            </button>
                                            <Link 
                                                href={`/gallery?productId=${initialData.id}`}
                                                className="text-[11px] font-semibold text-primary hover:text-primary/80 flex items-center gap-1 uppercase tracking-tighter border-l border-white/10 pl-4"
                                            >
                                                管理全部实拍 <ExternalLink size={10} />
                                            </Link>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <motion.div layout className="grid grid-cols-4 gap-3">
                            <AnimatePresence mode="popLayout">
                                {/* Display current photos (Including the main cover image if not in gallery) */}
                                {displayList.map(img => {
                                    const isMain = formData.image === img.url;
                                    const isVideo = img.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(img.url);
                                    const isSelected = selectedIds.has(img.id);
                                    const isVirtual = img.id === 'cover-virtual';
                                    
                                    return (
                                        <motion.div 
                                          key={img.id} 
                                          layout
                                          initial={{ opacity: 0, scale: 0.8 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                                          onClick={() => {
                                            if (isBatchMode) {
                                                toggleSelectImage(img.id);
                                            } else {
                                                setSelectedPreviewImage(img);
                                            }
                                          }}
                                          className={cn(
                                            "relative aspect-square rounded-2xl overflow-hidden border transition-shadow group/img bg-muted shadow-sm hover:shadow-md cursor-pointer",
                                            isMain ? "border-primary ring-2 ring-primary/20" : "border-border",
                                            isSelected && "ring-4 ring-primary ring-offset-2 dark:ring-offset-gray-900 border-primary scale-[0.98]",
                                            isBatchMode && isVirtual && "brightness-75"
                                          )}
                                        >
                                            {/* Selection Overlay for Batch Mode */}
                                            {isBatchMode && (
                                                <div className={cn(
                                                    "absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                                                    isSelected ? "bg-primary border-primary text-white shadow-lg" : "bg-white/20 border-white/40 backdrop-blur-md"
                                                )}>
                                                    {isSelected && <CheckCircle size={14} strokeWidth={3} />}
                                                </div>
                                            )}

                                            {isVideo ? (
                                                <div className="w-full h-full relative group/video">
                                                    <video 
                                                        src={img.url} 
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                                                        muted
                                                        playsInline
                                                        onMouseOver={(e) => (e.target as HTMLVideoElement).play()}
                                                        onMouseOut={(e) => {
                                                            const video = e.target as HTMLVideoElement;
                                                            video.pause();
                                                            video.currentTime = 0;
                                                        }}
                                                    />
                                                    {!isBatchMode && (
                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/video:opacity-0 transition-opacity">
                                                            <div className="bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/20">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                                                                    <path d="M8 5v14l11-7z" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <Image 
                                                  src={img.url} 
                                                  alt="preview" 
                                                  fill 
                                                  sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 150px"
                                                  className="object-cover transition-transform duration-500 group-hover/img:scale-105" 
                                                />
                                            )}
                                            
                                            {/* Simplified Overlay on Hover - only show if not in batch mode */}
                                            {!isBatchMode && (
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2">
                                                    {!isMain && !isVideo && (
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setAsMainImage(img.url);
                                                            }}
                                                            className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-medium rounded-lg shadow-xl translate-y-2 group-hover/img:translate-y-0 transition-all duration-300"
                                                        >
                                                            设为主图
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeletePhoto(img);
                                                        }}
                                                        className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-destructive text-white rounded-full shadow-xl transform translate-y-[-8px] group-hover/img:translate-y-0 transition-all duration-500 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-110 active:scale-95"
                                                        title="移除实拍内容"
                                                    >
                                                        <X size={12} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            )}
     
                                            {isMain && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-primary text-primary-foreground text-[9px] font-medium rounded-md shadow-lg">
                                                    封面
                                                </div>
                                            )}
                                            {isVideo && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-medium rounded-md shadow-lg uppercase tracking-tighter">
                                                    Video
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                                
                                {/* Add Photo Action - participating in AnimatePresence */}
                                {!isBatchMode && (
                                    <motion.div 
                                        key="add-button"
                                        layout
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="h-full"
                                    >
                                        <label className="aspect-square rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 hover:shadow-inner transition-all flex flex-col items-center justify-center gap-2 group relative overflow-hidden active:scale-95 cursor-pointer h-full">
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                accept="image/*,video/*"
                                                multiple
                                                onChange={(e) => handleFileUpload(e)}
                                                disabled={isUploading}
                                            />
                                            <div className="p-3 rounded-full bg-muted group-hover:bg-primary/10 transition-colors">
                                                <Plus size={24} className={cn("text-muted-foreground group-hover:text-primary transition-all duration-300 group-hover:rotate-90", isUploading && "animate-spin")} />
                                            </div>
                                            <span className="hidden sm:block text-[11px] font-medium text-muted-foreground group-hover:text-primary tracking-tighter uppercase text-center px-2">
                                                {isUploading ? "正在上传..." : "添加实拍"}
                                            </span>
                                        </label>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>

                    </div>


                </div>

                <div className="flex justify-end gap-4 border-t border-white/10 p-8 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="flex items-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
                    >
                        <CheckCircle size={18} />
                        保存商品
                    </button>
                </div>
            </form>

            <ConfirmModal 
               isOpen={confirmConfig.isOpen}
               onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
               onConfirm={confirmConfig.onConfirm}
               message={confirmConfig.message}
               variant={confirmConfig.variant}
               confirmLabel="确认删除"
               title="移除实拍项"
            />

            <CategoryModal 
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                onSubmit={handleCreateCategory}
            />

            <SupplierModal 
                isOpen={isSupplierModalOpen}
                onClose={() => setIsSupplierModalOpen(false)}
                onSubmit={handleCreateSupplier}
            />
          </motion.div>
        </>
      )}
      </AnimatePresence>

      {/* 图片预览 (Image Preview Lightbox) */}
      <AnimatePresence>
        {selectedPreviewImage && (
          <div 
            className="fixed inset-0 z-99999 flex items-center justify-center p-4 overflow-hidden touch-none"
            onWheel={handleWheel}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => setSelectedPreviewImage(null)}
            />
            
            <div className="relative w-full max-w-5xl h-[85vh] flex items-center justify-center pointer-events-none">
              {/* Close Button */}
              <button 
                onClick={() => setSelectedPreviewImage(null)}
                className="fixed top-8 right-8 p-3 text-white hover:text-primary transition-all bg-white/10 hover:bg-white/20 rounded-full border border-white/10 pointer-events-auto group z-50"
              >
                <X size={28} className="group-hover:rotate-90 transition-transform duration-300" />
              </button>

              {/* Navigation Arrows */}
              {displayList.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigatePreview(-1); }}
                    className="fixed left-8 top-1/2 -translate-y-1/2 p-4 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all pointer-events-auto z-50"
                  >
                    <ChevronLeft size={48} strokeWidth={1} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigatePreview(1); }}
                    className="fixed right-8 top-1/2 -translate-y-1/2 p-4 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-all pointer-events-auto z-50"
                  >
                    <ChevronRight size={48} strokeWidth={1} />
                  </button>
                </>
              )}

              <AnimatePresence initial={false} custom={previewDirection} mode="popLayout">
                <motion.div
                  key={selectedPreviewImage.id}
                  custom={previewDirection}
                  variants={{
                    enter: (dir: number) => ({
                      x: dir === 0 ? 0 : (dir > 0 ? 500 : -500),
                      opacity: 0,
                      scale: dir === 0 ? 0.8 : 1
                    }),
                    center: { x: 0, opacity: 1, scale: 1 },
                    exit: (dir: number) => ({
                      x: dir === 0 ? 0 : (dir < 0 ? 500 : -500),
                      opacity: 0,
                      scale: dir === 0 ? 0.8 : 1
                    })
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ 
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div 
                    className={cn(
                        "relative max-w-full max-h-full drop-shadow-2xl pointer-events-auto",
                        transform.scale > 1 && selectedPreviewImage.type !== 'video' ? "cursor-grab active:cursor-grabbing" : ""
                    )}
                    style={{
                        transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                  >
                    {selectedPreviewImage.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(selectedPreviewImage.url) ? (
                        <video 
                            src={selectedPreviewImage.url} 
                            className="max-w-[90vw] max-h-[75vh] object-contain rounded-2xl shadow-2xl"
                            controls
                            autoPlay
                        />
                    ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                            src={selectedPreviewImage.url} 
                            alt="Preview" 
                            className="max-w-[90vw] max-h-[75vh] object-contain rounded-2xl shadow-2xl"
                            draggable={false}
                        />
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation Indicators */}
              <div className="fixed bottom-12 flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-white/10 p-3 rounded-2xl pointer-events-auto z-50">
                <div className="flex gap-2">
                    {displayList.map(img => (
                        <button
                            key={img.id}
                            onClick={() => {
                                const currentIndex = displayList.findIndex(i => i.id === selectedPreviewImage.id);
                                const targetIndex = displayList.findIndex(i => i.id === img.id);
                                setPreviewDirection(targetIndex > currentIndex ? 1 : -1);
                                setSelectedPreviewImage(img);
                            }}
                            className={cn(
                                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                selectedPreviewImage.id === img.id ? "bg-primary w-8" : "bg-white/20 hover:bg-white/40"
                            )}
                        />
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
