"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Package, Tag, Truck, FileText, Camera, ExternalLink, Eye, Plus } from "lucide-react";
import Image from "next/image";
import { CustomSelect } from "@/components/ui/CustomSelect";
import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { Product, GalleryItem, Supplier, Category } from "@/lib/types";
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
    price: initialData?.price?.toString() || "",
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
            price: initialData.price?.toString() || "",
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
            price: "",
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
    
    try {
      // 循环处理每一个选中的文件 (Loop through each selected file)
      for (const file of Array.from(files)) {
        const uploadData = new FormData();
        uploadData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: uploadData,
        });

        if (res.ok) {
          const { url, type } = await res.json();
          const isVideo = type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(url);
          
          if (isMain) {
            setFormData(prev => ({ ...prev, image: url }));
          } else {
            // 如果是新增商品且还没有主图，自动将第一张上传的图设为主图
            if (!formData.image) {
              setFormData(prev => ({ ...prev, image: url }));
            }

            // 如果已有商品 ID，则直接保存到相册表
            if (initialData?.id) {
              const gRes = await fetch("/api/gallery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  url,
                  productId: initialData.id,
                  type: isVideo ? 'video' : 'image'
                })
              });
              if (gRes.ok) {
                const newItem = await gRes.json();
                setGalleryImages(prev => [...prev, newItem]);
              }
            } else {
              // 临时保存，提交时再处理
              const tempImg: GalleryItem = {
                id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                url,
                productId: "", // 临时 ID 为空
                uploadDate: new Date().toISOString(),
                tags: [],
                type: isVideo ? 'video' : 'image'
              };
              setGalleryImages(prev => [...prev, tempImg]);
            }
          }
        }
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
      // 重置 input 以允许再次选择相同文件
      e.target.value = "";
    }
  };

  const setAsMainImage = (url: string) => {
    setFormData(prev => ({ ...prev, image: url }));
  };

  const handleDeletePhoto = async (img: GalleryItem) => {
    setConfirmConfig({
      isOpen: true,
      message: "确定要从相册中移除这张照片吗？此操作不可撤销。",
      variant: "danger",
      onConfirm: async () => {
        if (img.id.startsWith("temp-")) {
          setGalleryImages(prev => prev.filter(i => i.id !== img.id));
        } else {
          try {
            const res = await fetch(`/api/gallery/${img.id}`, { method: "DELETE" });
            if (res.ok) {
              setGalleryImages(prev => prev.filter(i => i.id !== img.id));
            }
          } catch (error) {
            console.error("Delete photo failed:", error);
          }
        }

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
        price: Number(formData.price),
        stock: Number(formData.stock),
        id: initialData?.id
    });
    onClose();
  };

  if (!mounted) return null;

  return createPortal(
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
                                <FileText size={16} /> 销售价格 (￥)
                            </label>
                            <input 

                                type="number" 
                                step="0.01"
                                min="0"
                                value={formData.price}
                                onChange={(e) => setFormData({...formData, price: e.target.value})}
                                className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-bold dark:hover:bg-white/10 no-spinner"
                                placeholder="0.00"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Eye size={16} /> 对外展示
                            </label>
                            <div
                                onClick={() => setFormData({...formData, isPublic: !formData.isPublic})}
                                className="w-full rounded-full px-5 py-2.5 flex items-center justify-between border border-border bg-white dark:bg-white/5 transition-all duration-300 font-bold text-foreground cursor-pointer dark:hover:bg-white/10 group h-[46px]"
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
                            <Package size={16} /> 期初库存 (Initial Stock)
                        </label>
                        <div className="relative">
                            <input 
                                type="number" 
                                min="0"
                                value={formData.stock}
                                onChange={(e) => setFormData({...formData, stock: e.target.value})}
                                className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-bold dark:hover:bg-white/10 no-spinner"
                                placeholder="0"
                            />
                            {!initialData && (
                                <p className="mt-2 px-4 text-[11px] text-muted-foreground/60 leading-relaxed italic">
                                    * 仅首次手动建档时填写。常规库存增加请在“入库登记”中操作，以生成交易凭证。
                                </p>
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
                                <Link 
                                    href={`/gallery?productId=${initialData.id}`}
                                    className="text-[11px] font-black text-primary hover:underline flex items-center gap-1 uppercase tracking-tighter"
                                >
                                    管理全部照片 <ExternalLink size={10} />
                                </Link>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-4 gap-3">
                            {/* Display current photos (Including the main cover image if not in gallery) */}
                            {(() => {
                                // 提取所有图片的 URL 以便查重
                                const galleryUrls = new Set(galleryImages.map(img => img.url));
                                
                                // 构建最终显示的列表
                                const displayList = [...galleryImages];
                                
                                // 排序：封面图置顶，其他按时间升序
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
                                if (formData.image && !galleryUrls.has(formData.image)) {
                                    displayList.unshift({
                                        id: 'cover-virtual',
                                        url: formData.image,
                                        productId: initialData?.id || '',
                                        uploadDate: new Date().toISOString(),
                                        tags: []
                                    } as GalleryItem);
                                }

                                return displayList.map(img => {
                                    const isMain = formData.image === img.url;
                                    return (
                                        <div key={img.id} className={cn(
                                            "relative aspect-square rounded-2xl overflow-hidden border transition-all group/img bg-muted shadow-sm hover:shadow-md",
                                            isMain ? "border-primary ring-2 ring-primary/20" : "border-border"
                                        )}>
                                            {img.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(img.url) ? (
                                                <video 
                                                    src={img.url} 
                                                    className="w-full h-full object-cover"
                                                    controls
                                                />
                                            ) : (
                                                <Image 
                                                  src={img.url} 
                                                  alt="preview" 
                                                  fill 
                                                  sizes="(max-width: 640px) 25vw, (max-width: 1024px) 20vw, 150px"
                                                  className="object-cover transition-transform duration-500 group-hover/img:scale-105" 
                                                />
                                            )}
                                            
                                            {/* Simplified Overlay on Hover */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2">
                                                {!isMain && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => setAsMainImage(img.url)}
                                                        className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-lg shadow-xl translate-y-2 group-hover/img:translate-y-0 transition-all duration-300"
                                                    >
                                                        设为主图
                                                    </button>
                                                )}
                                                <button 
                                                    type="button"
                                                    onClick={() => handleDeletePhoto(img)}
                                                    className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-destructive text-white rounded-full shadow-xl transform translate-y-[-8px] group-hover/img:translate-y-0 transition-all duration-500 backdrop-blur-xl border border-white/20 flex items-center justify-center hover:scale-110 active:scale-95"
                                                    title="移除照片"
                                                >
                                                    <X size={12} strokeWidth={3} />
                                                </button>
                                            </div>
    
                                            {isMain && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-primary text-primary-foreground text-[9px] font-bold rounded-md shadow-lg">
                                                    封面
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                            
                            {/* Add Photo Action */}
                            <label className="aspect-square rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 hover:shadow-inner transition-all flex flex-col items-center justify-center gap-2 group relative overflow-hidden active:scale-95 cursor-pointer">
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
                                <span className="hidden sm:block text-[11px] font-black text-muted-foreground group-hover:text-primary tracking-tighter uppercase">
                                    {isUploading ? "正在上传..." : "添加实拍"}
                                </span>
                            </label>
                        </div>

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
                        className="flex items-center gap-2 rounded-full bg-primary px-8 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-primary/40 active:scale-[0.98]"
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
               title="移除照片"
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
    </AnimatePresence>,
    document.body
  );
}
