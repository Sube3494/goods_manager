"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { X, Check, CheckCircle, Package, Tag, Truck, FileText, Camera, Plus, ChevronLeft, ChevronRight, Eye, Crown, Activity, RotateCw, Trash2 } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Switch } from "@/components/ui/Switch";
import Image from "next/image";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { Product, GalleryItem, Supplier, Category, PurchaseOrder, PurchaseOrderItem } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { CategoryModal } from "@/components/Categories/CategoryModal";
import { SupplierModal } from "@/components/Suppliers/SupplierModal";

import { useUser } from "@/hooks/useUser";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const toolbarButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-primary transition-all duration-300 hover:bg-primary hover:text-primary-foreground active:scale-95 shadow-sm disabled:cursor-not-allowed disabled:opacity-50";

const toolbarButtonMutedClass =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-white/5 px-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground transition-all duration-300 hover:border-primary/20 hover:bg-primary/10 hover:text-primary active:scale-95";

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Product, "id"> & { id?: string }, galleryItems?: GalleryItem[]) => void;
  initialData?: Product | null;
}

import { createPortal } from "react-dom";
import { uploadGalleryMedia } from "@/lib/galleryUpload";

export function ProductFormModal({ isOpen, onClose, onSubmit, initialData }: ProductFormModalProps) {
  const { user } = useUser();
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    categoryId: initialData?.categoryId || "",
    costPrice: initialData?.costPrice?.toString() || "",
    stock: initialData?.stock?.toString() || "",
    image: initialData?.image || "",
    supplierId: initialData?.supplierId || "",
    sku: initialData?.sku || "",
    isPublic: initialData?.isPublic ?? true,
    isDiscontinued: initialData?.isDiscontinued ?? false,
    specs: (initialData?.specs as Record<string, string>) || {},
    remark: initialData?.remark || ""
  });
  
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mounted, setMounted] = useState(false);
  const { showToast } = useToast();
  const [galleryImages, setGalleryImages] = useState<GalleryItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean | string>(false);
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
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDraggingTask = useRef(false);
  const dragSrcId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string|null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  
  // 批量管理状态 (Batch manage state)
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // 移动端排序模式 (Mobile reorder mode)
  const [isReorderMode, setIsReorderMode] = useState(false);

  // Robust scroll lock logic: standard overflow hidden
  useEffect(() => {
    if (isOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isOpen]);

  const enterBatchMode = () => {
    setIsBatchMode(true);
    setSelectedIds(new Set());
    showToast("已进入批量选择模式", "info");
  };

  const toggleSelectAll = () => {
    const images = galleryImages || [];
    // 过滤掉封面图 (Filter out cover images)
    const selectableImages = images.filter(img => img.url !== formData.image && img.id !== 'cover-virtual');
    
    if (selectedIds.size === selectableImages.length && selectableImages.length > 0) {
        setSelectedIds(new Set());
    } else {
        const selectableIds = selectableImages.map(img => img.id);
        setSelectedIds(new Set(selectableIds));
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!initialData?.id) return;
      setIsLoadingBatches(true);
      try {
        const historyRes = await fetch(`/api/purchases?type=Inbound&productId=${initialData.id}`);

        if (historyRes.ok) {
          const data = await historyRes.json();
          setInboundHistory(Array.isArray(data) ? data : (data.items || []));
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
        
        if (sRes.ok) {
          setSuppliers(await sRes.json());
        }
        
        if (cRes.ok) {
          setCategories(await cRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch form data:", error);
      }
    };

    const fetchGallery = async (productId: string, coverImage: string) => {
      try {
        const res = await fetch(`/api/gallery/product/${productId}`);
        if (res.ok) {
          const data = await res.json();
          let items: GalleryItem[] = data.items || [];
          
          // 如果有封面图，确保它在第一位 (Ensure cover is at index 0)
          if (coverImage) {
            const mainIndex = items.findIndex(img => img.url === coverImage);
            if (mainIndex !== -1) {
              const [mainItem] = items.splice(mainIndex, 1);
              items = [mainItem, ...items];
            } else {
              items.unshift({
                id: 'cover-virtual',
                url: coverImage,
                productId: productId,
                uploadDate: new Date().toISOString(),
                tags: []
              } as GalleryItem);
            }
          }
          setGalleryImages(items);
        }
      } catch (error) {
        console.error("Failed to fetch gallery images:", error);
      }
    };

    if (isOpen) {
      fetchData();
      
      // Clear gallery images first to prevent stale data from showing
      setGalleryImages([]);
      
      if (initialData) {
        setFormData({
          sku: initialData.sku || "",
          name: initialData.name,
          costPrice: String(initialData.costPrice || ""),
          stock: String(initialData.stock || ""),
          categoryId: initialData.categoryId || "",
          supplierId: initialData.supplierId || "",
          image: initialData.image || "",
          isDiscontinued: initialData.isDiscontinued ?? false,
          isPublic: initialData.isPublic ?? true,
          specs: initialData.specs as Record<string, string> || {},
          remark: initialData.remark || ""
        });
        fetchGallery(initialData.id, initialData.image || "");
      } else {
        setFormData({
          sku: "",
          name: "",
          costPrice: "",
          stock: "",
          categoryId: "",
          supplierId: "",
          image: "",
          isDiscontinued: false,
          isPublic: true,
          specs: {},
          remark: ""
        });
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

    setIsUploading(`准备上传 0/${files.length}...`);
    
    try {
      // -- 并发控制逻辑 (Concurrency Control) --
      const CONCURRENCY_LIMIT = 3;
      const filesArray = Array.from(files);
      let completedCount = 0;
      let activePromises: Promise<void>[] = [];

      for (const file of filesArray) {
        const uploadTask = async () => {
          try {
            // 前端大小校验 (Frontend size validation - 50MB)
            if (file.size > 50 * 1024 * 1024) {
              showToast(`"${file.name.length > 16 ? file.name.slice(0, 16) + '…' : file.name}" 超过 50MB 限制`, "error");
              return;
            }

            // 使用基于切片与断点续传的流通道优化处理
            const data = await uploadGalleryMedia(file, "gallery", (pct) => {
               setIsUploading(`文件 ${completedCount + 1}/${filesArray.length} : ${pct}%`);
            });
            const { url, path, type, skipped, thumbnailUrl, thumbnailPath } = data;
            
            // 使用函数式状态更新，避免闭包中的陈旧依赖导致重复或遗漏
            let isDuplicate = false;
            setGalleryImages(prev => {
              const currentUrls = new Set([...prev.map(img => img.url), formData.image]);
              if (currentUrls.has(url)) {
                isDuplicate = true;
                return prev;
              }
              return prev;
            });

            if (isDuplicate) {
              showToast(`"${file.name.length > 16 ? file.name.slice(0, 16) + '…' : file.name}" 已在相册中`, "info");
              return;
            }

            if (skipped) {
              showToast(`"${file.name.length > 16 ? file.name.slice(0, 16) + '…' : file.name}" 已存在，已复用`, "success");
            }
            
            const isVideoType = type === 'video';
              
            if (isMain) {
              setFormData(prev => ({ ...prev, image: url }));
              // Synchronize with gallery list as well
              setGalleryImages(prev => {
                const existingIndex = prev.findIndex(item => item.id === 'cover-virtual' || item.url === url);
                const newItem: GalleryItem = {
                  id: 'cover-virtual',
                  url,
                  thumbnailUrl: thumbnailUrl || url,
                  productId: initialData?.id || "",
                  uploadDate: new Date().toISOString(),
                  tags: [],
                  type: isVideoType ? 'video' : 'image'
                };
                
                if (existingIndex !== -1) {
                  const next = [...prev];
                  next[existingIndex] = newItem;
                  return next;
                }
                return [newItem, ...prev];
              });
            } else {
              setFormData(prev => {
                if (!prev.image) {
                   return { ...prev, image: url };
                }
                return prev;
              });

              if (initialData?.id) {
                const gRes = await fetch("/api/gallery", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url,
                    path,
                    thumbnailUrl,
                    thumbnailPath,
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
                const tempImg: GalleryItem = {
                  id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  url,
                  thumbnailUrl: thumbnailUrl || url,
                  productId: "", 
                  uploadDate: new Date().toISOString(),
                  tags: [],
                  type: isVideoType ? 'video' : 'image'
                };
                setGalleryImages(prev => [...prev, tempImg]);
              }
            }
          } catch (error) {
            console.error("Upload process error for file", file.name, error);
            showToast(error instanceof Error ? error.message : "上传处理失败", "error");
          } finally {
            completedCount++;
            setIsUploading(`已完成 ${completedCount}/${filesArray.length}`);
          }
        };

        const p = uploadTask();
        activePromises.push(p);

        p.then(() => {
          activePromises = activePromises.filter(curr => curr !== p);
        });

        if (activePromises.length >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }
      }

      await Promise.all(activePromises);
      // -- 并发控制结束 --

    } catch (error) {
      console.error("Upload failed:", error);
      showToast("上传过程中发生错误", "error");
    } finally {
      setIsUploading(false);
      // 重置 input 以允许再次选择相同文件
      if (e.target) e.target.value = "";
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
    if (isUploading) return;
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Simulate the change event for handleFileUpload
    const mockEvent = {
        target: { files, value: "" }
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    
    await handleFileUpload(mockEvent);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isUploading) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const setAsMainImage = (url: string) => {
    setFormData(prev => ({ ...prev, image: url }));
    
    // 同时更新 galleryImages 顺序，将选中的移动到第一位 (Move chosen covered to index 0)
    setGalleryImages(prev => {
        const newList = [...prev];
        const index = newList.findIndex(img => img.url === url);
        if (index !== -1) {
            const [item] = newList.splice(index, 1);
            return [item, ...newList];
        }
        return newList;
    });
    
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
            showToast("⚠️ 已移除封面引用，请记得【点击保存商品】以使更改生效", "warning");
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
          setGalleryImages(prev => prev.filter(i => i.id !== img.id));
          showToast("⚠️ 封面引用已剥离，请记得【点击保存商品】生效", "warning");
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

  const handleReorder = (currentList: GalleryItem[]) => {
    // DB 仅保存真实存在的画册项 (DB only saves real gallery items)
    const realItems = currentList.filter(img => img.id !== 'cover-virtual' && !img.id.startsWith('temp-'));
    
    // 异步排队更新 (Debounced API Call)
    if (reorderTimeoutRef.current) clearTimeout(reorderTimeoutRef.current);
    
    reorderTimeoutRef.current = setTimeout(async () => {
      try {
        const items = realItems.map((img, index) => ({
          id: img.id,
          sortOrder: index
        }));

        const res = await fetch("/api/gallery/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items })
        });
        
        if (!res.ok) {
          showToast("排序保存失败", "error");
        }
      } catch (error) {
        console.error("Failed to save gallery order", error);
      }
    }, 1000);
  };

  // 移动端：将指定图片左移或右移一格（跳过封面位置 index=0）
  const handleMoveImage = (imgId: string, direction: -1 | 1) => {
    setGalleryImages(prev => {
      const idx = prev.findIndex(i => i.id === imgId);
      const targetIdx = idx + direction;
      // 不能移出范围，也不能移到 index=0（封面位）
      if (idx === -1 || targetIdx < 1 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      handleReorder(next);
      return next;
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

  // 使用 galleryImages 作为唯一数据源 (Use galleryImages as single source of truth)
  const displayList = galleryImages || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation for mandatory fields
    if (!formData.name.trim()) {
        showToast("请输入商品名称", "error");
        return;
    }
    if (!formData.categoryId) {
        showToast("请选择商品分类", "error");
        return;
    }



    // Clean up empty specs before stringifying/submitting
    const cleanedSpecs: Record<string, string> = {};
    if (formData.specs) {
        Object.entries(formData.specs as Record<string, string>).forEach(([k, v]) => {
            if (k.trim() !== '') {
                cleanedSpecs[k.trim()] = String(v).trim();
            }
        });
    }

    onSubmit({
        ...formData,
        costPrice: Number(formData.costPrice),
        stock: Number(formData.stock),
        specs: Object.keys(cleanedSpecs).length > 0 ? cleanedSpecs : undefined,
        id: initialData?.id
    }, galleryImages);
    onClose();
  };

  const handleRotateImage = async (img: GalleryItem) => {
    try {
      showToast("正在处理图片旋转...", "info");
      
      // 1. 加载并旋转
      const imageNode = new window.Image();
      imageNode.crossOrigin = "anonymous";
      imageNode.src = img.url;
      await new Promise((resolve, reject) => {
        imageNode.onload = resolve;
        imageNode.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context error");
      
      canvas.width = imageNode.height;
      canvas.height = imageNode.width;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(imageNode, -imageNode.width / 2, -imageNode.height / 2);

      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9);
      });

      // 2. 上传
      const rotatedFile = new File([blob], `rotated_${Date.now()}.jpg`, { type: "image/jpeg" });
      const uploadRes = await uploadGalleryMedia(rotatedFile, "gallery");

      // 3. 更新数据库 (如果是已保存的项)
      if (!img.id.startsWith("temp-") && img.id !== 'cover-virtual') {
        const res = await fetch(`/api/gallery/${img.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: uploadRes.url,
            path: uploadRes.path,
            thumbnailUrl: uploadRes.thumbnailUrl,
            thumbnailPath: uploadRes.thumbnailPath,
          }),
        });
        if (!res.ok) throw new Error("Failed to update database");
      }

      // 4. 更新本地状态 (Update local state)
      setGalleryImages(prev => prev.map(item => 
        item.id === img.id ? { ...item, url: uploadRes.url, thumbnailUrl: uploadRes.thumbnailUrl || uploadRes.url } : item
      ));

      // 如果当前是封面，同步更新表单封面数据
      if (formData.image === img.url) {
        setFormData(prev => ({ ...prev, image: uploadRes.url }));
      }

      showToast("旋转已应用并保存", "success");
    } catch (error) {
      console.error("Rotation failed:", error);
      showToast("图片旋转失败", "error");
    }
  };

  // --- Lightbox 增强功能 (Lightbox Enhancements) ---
  const resetTransform = () => setTransform({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    resetTransform();
  }, [selectedPreviewImage?.id]);

  useEffect(() => {
    if (selectedPreviewImage?.type === 'video' || (selectedPreviewImage?.url && /\.(mp4|webm|ogg|mov)$/i.test(selectedPreviewImage.url))) {
      const video = videoPreviewRef.current;
      if (video) {
        video.currentTime = 0;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Interrupted play is fine to ignore
          });
        }
      }
    }
  }, [selectedPreviewImage?.id, selectedPreviewImage?.url, selectedPreviewImage?.type]);

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

  const priceChartData = useMemo(() => {
    if (!initialData || inboundHistory.length === 0) return [];
    const data = inboundHistory
      .map(order => {
        const item = order.items.find((i: PurchaseOrderItem) => i.productId === initialData.id);
        if (!item) return null;
        return {
          dateText: new Date(order.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          timestamp: new Date(order.date).getTime(),
          price: item.costPrice
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
    return data;
  }, [inboundHistory, initialData]);

  if (!mounted) return null;

  // Helper for specs
  const handleAddSpec = () => {
    setFormData(prev => ({
      ...prev,
      specs: { ...(prev.specs || {}), "": "" }
    }));
  };

  const handleUpdateSpecKey = (oldKey: string, newKey: string, index: number) => {
    setFormData(prev => {
      const specs = { ...((prev.specs as Record<string, string>) || {}) };
      const entries = Object.entries(specs);
      if (oldKey === newKey) return prev;
      
      // Reconstruct to maintain order
      const newSpecs: Record<string, string> = {};
      entries.forEach(([k, v], i) => {
        if (i === index) {
          newSpecs[newKey] = v;
        } else {
          newSpecs[k] = v;
        }
      });
      return { ...prev, specs: newSpecs };
    });
  };

  const handleUpdateSpecValue = (key: string, newValue: string) => {
    setFormData(prev => ({
      ...prev,
      specs: { ...((prev.specs as Record<string, string>) || {}), [key]: newValue }
    }));
  };

  const handleRemoveSpec = (keyToRemove: string, index: number) => {
    setFormData(prev => {
      const specs = { ...((prev.specs as Record<string, string>) || {}) };
      const entries = Object.entries(specs);
      const newSpecs: Record<string, string> = {};
      entries.forEach(([k, v], i) => {
        if (i !== index) newSpecs[k] = v;
      });
      return { ...prev, specs: newSpecs };
    });
  };

  return createPortal(
    <>
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-70000 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-70001 w-[calc(100%-32px)] sm:w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white dark:bg-gray-900/70 backdrop-blur-xl border border-border/50 shadow-2xl overflow-hidden flex flex-col max-h-safe-modal"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-8 shrink-0">
              <h2 className="text-2xl font-bold text-foreground">{initialData ? "编辑商品" : "新增商品"}</h2>
              <button onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 custom-scrollbar">
                    {/* SKU */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText size={16} /> 商品编号 (SKU)
                        </label>
                        <input 
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    </div>

                    {user?.role === "SUPER_ADMIN" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Production Condition Box */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Activity size={16} /> 生产状态
                                </label>
                                <div className={cn(
                                    "w-full rounded-full border px-4 py-2 flex items-center justify-between transition-all duration-300",
                                    formData.isDiscontinued 
                                        ? "bg-red-500/5 border-red-500/20" 
                                        : "bg-emerald-500/5 border-emerald-500/20"
                                )}>
                                    <span className={cn(
                                        "text-xs tracking-wider",
                                        formData.isDiscontinued ? "text-red-500" : "text-emerald-500"
                                    )}>
                                        {formData.isDiscontinued ? "已停止生产" : "正常供应"}
                                    </span>
                                    <Switch 
                                        checked={!formData.isDiscontinued} 
                                        onChange={(val) => setFormData(prev => ({ ...prev, isDiscontinued: !val }))} 
                                    />
                                </div>
                            </div>

                            {/* Visibility Box */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                    <Eye size={16} /> 展示权限
                                </label>
                                <div className={cn(
                                    "w-full rounded-full border px-4 py-2 flex items-center justify-between transition-all duration-300",
                                    formData.isPublic 
                                        ? "bg-emerald-500/5 border-emerald-500/20" 
                                        : "bg-amber-500/5 border-amber-500/10"
                                )}>
                                    <span className={cn(
                                        "text-xs tracking-wider",
                                        formData.isPublic ? "text-emerald-500" : "text-amber-600"
                                    )}>
                                        {formData.isPublic ? "公开可见" : "仅自己可见"}
                                    </span>
                                    <Switch 
                                        checked={formData.isPublic} 
                                        onChange={(val) => setFormData(prev => ({ ...prev, isPublic: val }))} 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Remark / 备注 */}
                    <div className="space-y-2 pb-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <FileText size={16} /> 备忘录 / 备注
                        </label>
                        <textarea 
                            value={formData.remark}
                            onChange={(e) => setFormData({...formData, remark: e.target.value})}
                            className="w-full rounded-2xl bg-white dark:bg-white/5 border border-border dark:border-white/10 focus:border-primary/20 px-4 py-3 text-sm text-foreground outline-none ring-1 ring-transparent focus:ring-primary/20 transition-all resize-none dark:hover:bg-white/10"
                            placeholder="例如：某些特殊货品的非单进说明（仅作为备忘）..."
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Cost Price */}
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

                        {/* Initial Stock */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Package size={16} /> 商品库存
                            </label>
                            <div className="relative">
                                {initialData ? (
                                    <div className="w-full rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2.5 text-foreground/60 font-medium cursor-not-allowed">
                                        {formData.stock || 0}
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
                            </div>
                        </div>

                    </div>

                            {/* Inbound History */}
                            {initialData && (
                                <div className="mt-4 p-4 rounded-2xl bg-muted/20 border border-white/5 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">关联入库记录</h4>
                                        <div className="h-4 w-px bg-white/10" />
                                        <span className="text-[10px] text-primary font-medium">全部历史</span>
                                    </div>
                                    
                                    {/* 进价走势图 */}
                                    {priceChartData.length > 1 && (
                                        <div className="h-32 w-full mt-2 mb-4 border-b border-white/5 pb-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={priceChartData}>
                                                    <XAxis dataKey="dateText" tick={{ fontSize: 9, fill: '#888888' }} axisLine={false} tickLine={false} tickMargin={8} />
                                                    <YAxis domain={['auto', 'auto']} hide />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', fontSize: '12px', color: '#fff' }}
                                                        itemStyle={{ color: '#f97316' }}
                                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                        formatter={(value: any) => [`￥${value}`, '成本进价']}
                                                        labelStyle={{ color: '#aaa', marginBottom: '4px' }}
                                                    />
                                                    <Line type="monotone" dataKey="price" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: '#f97316', strokeWidth: 0 }} activeDot={{ r: 5, stroke: 'rgba(249,115,22,0.3)', strokeWidth: 4 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
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
                                                            <span className="text-xs font-medium text-foreground">单号: {order.id}</span>
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
                                            <div className="py-2 text-center text-[10px] text-muted-foreground">暂无历史记录</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        
                    {/* Specifications */}
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Tag size={16} /> 商品参数
                            </label>
                            <button
                                type="button"
                                onClick={handleAddSpec}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary-foreground bg-primary/10 hover:bg-primary px-3 py-1.5 rounded-full border border-primary/20 transition-all duration-300 active:scale-95 shadow-sm"
                            >
                                <Plus size={12} strokeWidth={3} /> 添加参数
                            </button>
                        </div>
                        
                        <div className="space-y-2">
                            {Object.entries((formData.specs as Record<string, string>) || {}).map(([key, value], index) => (
                                <div key={index} className="flex items-center gap-2 group">
                                    <input
                                        type="text"
                                        value={key}
                                        onChange={(e) => handleUpdateSpecKey(key, e.target.value, index)}
                                        placeholder="参数名"
                                        className="w-1/3 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2 text-xs text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all font-bold tracking-tight"
                                    />
                                    <span className="text-muted-foreground/30 font-medium">/</span>
                                    <input
                                        type="text"
                                        value={value}
                                        onChange={(e) => handleUpdateSpecValue(key, e.target.value)}
                                        placeholder="参数值"
                                        className="flex-1 rounded-full bg-white dark:bg-white/5 border border-border dark:border-white/10 px-4 py-2 text-xs text-foreground outline-none ring-1 ring-transparent focus:ring-2 focus:ring-primary/20 transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSpec(key, index)}
                                        className="p-2 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-90 shrink-0"
                                        title="删除此参数"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                            {Object.keys((formData.specs as Record<string, string>) || {}).length === 0 && (
                                <div className="text-center py-4 bg-muted/20 rounded-xl border border-dashed border-border/50">
                                    <span className="text-xs text-muted-foreground">暂无自定义参数</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Real Photos Management */}
                    <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <label className="text-sm font-bold text-foreground flex items-center gap-2 whitespace-nowrap">
                                    <Camera size={18} className="text-primary shrink-0" /> <span className="hidden xs:inline">实拍</span>相册管理
                                </label>
                            </div>
                            
                            <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                                {initialData?.id && (
                                    <>
                                        {isBatchMode ? (
                                            <div className="flex items-center gap-3 whitespace-nowrap">
                                                <button 
                                                    type="button"
                                                    onClick={toggleSelectAll}
                                                    className={toolbarButtonClass}
                                                >
                                                    {selectedIds.size === galleryImages.length + (formData.image && !galleryImages.find(i => i.url === formData.image) ? 1 : 0) ? "全不选" : "全选"}
                                                </button>
                                                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-tight">已选 {selectedIds.size}</span>
                                                <button 
                                                    type="button"
                                                    onClick={handleBatchDelete}
                                                    disabled={selectedIds.size === 0}
                                                    className="inline-flex h-9 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 px-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-red-500 transition-all duration-300 hover:bg-red-500 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                                                >
                                                    删除
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        setIsBatchMode(false);
                                                        setSelectedIds(new Set());
                                                    }}
                                                    className={toolbarButtonMutedClass}
                                                >
                                                    取消
                                                </button>
                                            </div>
                                        ) : isReorderMode ? (
                                            <div className="flex items-center gap-3 whitespace-nowrap">
                                                <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground uppercase tracking-tight">拖动箭头调整顺序</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsReorderMode(false)}
                                                    className={toolbarButtonClass}
                                                >
                                                    完成
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap">
                                                <button 
                                                    type="button"
                                                    onClick={enterBatchMode}
                                                    className={toolbarButtonMutedClass}
                                                >
                                                    批量管理
                                                </button>
                                                {galleryImages.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsReorderMode(true)}
                                                        className={cn("sm:hidden", toolbarButtonMutedClass)}
                                                    >
                                                        排序
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                        
                        <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
                                {displayList.map((img, index) => {
                                    const isMain = formData.image === img.url;
                                    const isVideo = img.type === 'video' || /\.(mp4|webm|ogg|mov)$/i.test(img.url);
                                    const isSelected = selectedIds.has(img.id);
                                    const isVirtual = img.id === 'cover-virtual';
                                    const isCover = index === 0;
                                    const isDragTarget = dragOverImageId === img.id && !isCover;

                                    return (
                                        <div
                                          key={img.id}
                                          draggable={!isBatchMode && !isCover}
                                          onDragStart={(e) => {
                                            if (isCover) { e.preventDefault(); return; }
                                            dragSrcId.current = img.id;
                                            isDraggingTask.current = true;
                                            e.dataTransfer.effectAllowed = 'move';
                                            // 生成带圆角的拖拽预览 (Create rounded drag ghost)
                                            const el = e.currentTarget as HTMLElement;
                                            const clone = el.cloneNode(true) as HTMLElement;
                                            clone.style.position = 'fixed';
                                            clone.style.top = '-9999px';
                                            clone.style.left = '-9999px';
                                            clone.style.width = `${el.offsetWidth}px`;
                                            clone.style.height = `${el.offsetHeight}px`;
                                            clone.style.borderRadius = '16px';
                                            clone.style.overflow = 'hidden';
                                            clone.style.opacity = '0.95';
                                            clone.style.pointerEvents = 'none';
                                            document.body.appendChild(clone);
                                            e.dataTransfer.setDragImage(clone, el.offsetWidth / 2, el.offsetHeight / 2);
                                            requestAnimationFrame(() => document.body.removeChild(clone));
                                          }}
                                          onDragOver={(e) => {
                                            e.preventDefault();
                                            if (!dragSrcId.current || dragSrcId.current === img.id || isCover) return;
                                            dragOverId.current = img.id;
                                            setDragOverImageId(img.id);
                                            // 实时交换 (Live swap preview)
                                            setGalleryImages(prev => {
                                              const srcIdx = prev.findIndex(i => i.id === dragSrcId.current);
                                              const dstIdx = prev.findIndex(i => i.id === img.id);
                                              if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx || dstIdx === 0) return prev;
                                              const next = [...prev];
                                              const [moved] = next.splice(srcIdx, 1);
                                              next.splice(dstIdx, 0, moved);
                                              return next;
                                            });
                                          }}
                                          onDragEnd={() => {
                                            setDragOverImageId(null);
                                            dragSrcId.current = null;
                                            dragOverId.current = null;
                                            handleReorder(galleryImages);
                                            setTimeout(() => { isDraggingTask.current = false; }, 100);
                                          }}
                                          onClick={() => {
                                            if (isDraggingTask.current) return;
                                            if (isBatchMode) {
                                                toggleSelectImage(img.id);
                                            } else {
                                                setSelectedPreviewImage(img);
                                            }
                                          }}
                                          className={cn(
                                            "relative aspect-square rounded-2xl overflow-hidden border transition-all group/img bg-muted shadow-sm hover:shadow-md",
                                            isCover
                                              ? "cursor-pointer border-primary ring-2 ring-primary/20"
                                              : "cursor-grab active:cursor-grabbing border-border",
                                            isMain && !isCover && "border-primary ring-2 ring-primary/20",
                                            isSelected && "ring-2 ring-primary ring-offset-1 dark:ring-offset-gray-900 border-primary scale-[0.98]",
                                            isBatchMode && isVirtual && "brightness-75",
                                            isDragTarget && "ring-2 ring-primary/60 scale-[0.97] opacity-70"
                                          )}
                                        >
                                            {/* Batch selection overlay (Exclude cover) */}
                                            {isBatchMode && !isMain && (
                                                <div className={cn(
                                                    "absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 shadow-lg",
                                                    isSelected 
                                                        ? "bg-foreground border-foreground text-background scale-110" 
                                                        : "bg-white/50 dark:bg-zinc-800/50 border-white/50 dark:border-white/20 backdrop-blur"
                                                )}>
                                                    {isSelected && <Check size={14} strokeWidth={4} />}
                                                </div>
                                            )}

                                            {/* Media */}
                                            {isVideo ? (
                                                <div className="w-full h-full relative group/video">
                                                    <video
                                                        src={img.url}
                                                        className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105"
                                                        muted playsInline
                                                        onMouseOver={(e) => {
                                                            const v = e.target as HTMLVideoElement;
                                                            const playPromise = v.play();
                                                            if (playPromise !== undefined) {
                                                                playPromise.catch(() => {});
                                                            }
                                                        }}
                                                        onMouseOut={(e) => { 
                                                            const v = e.target as HTMLVideoElement; 
                                                            v.pause(); 
                                                            v.currentTime = 0; 
                                                        }}
                                                    />
                                                    {!isBatchMode && (
                                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover/video:opacity-0 transition-opacity">
                                                            <div className="bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/20">
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <Image
                                                  src={img.thumbnailUrl || img.url}
                                                  alt={img.product?.name || "图库图片"}
                                                  fill unoptimized
                                                  sizes="(max-width: 768px) 25vw, (max-width: 1200px) 20vw, 15vw"
                                                  className="object-cover transition-transform duration-500 group-hover/img:scale-105"
                                                  draggable={false}
                                                />
                                            )}

                                            {/* Hover/Touch overlay：桌面 hover 显示，移动端排序模式时隐藏 */}
                                            {!isBatchMode && !isReorderMode && (
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-300 pointer-events-none">
                                                    <div className="absolute top-1 right-1 flex flex-col gap-1 pointer-events-auto">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleDeletePhoto(img); }}
                                                            className="p-1 bg-zinc-900/70 hover:bg-zinc-800 active:bg-zinc-700 text-white rounded-full shadow-xl backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-colors"
                                                            title="移除实拍内容"
                                                        ><Trash2 size={12} strokeWidth={2.5} /></button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleRotateImage(img); }}
                                                            className="p-1 bg-zinc-900/70 hover:bg-zinc-800 active:bg-zinc-700 text-white rounded-full shadow-xl backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-colors"
                                                            title="顺时针旋转 90°"
                                                        ><RotateCw size={12} strokeWidth={2.5} /></button>
                                                        {!isMain && !isVideo && !isCover && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setAsMainImage(img.url); }}
                                                                className="p-1 bg-zinc-900/70 hover:bg-zinc-800 active:bg-zinc-700 text-white rounded-full shadow-xl backdrop-blur-md border border-white/10 flex items-center justify-center active:scale-95 transition-colors"
                                                                title="设为主图"
                                                            ><Crown size={12} strokeWidth={2.5} /></button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 移动端排序模式：左右箭头 */}
                                            {isReorderMode && !isCover && (
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-between px-1 pointer-events-auto">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleMoveImage(img.id, -1); }}
                                                        disabled={index <= 1}
                                                        className="p-1 bg-white/20 hover:bg-white/40 active:bg-white/50 disabled:opacity-20 text-white rounded-full backdrop-blur-md border border-white/20 transition-colors"
                                                    ><ChevronLeft size={16} strokeWidth={2.5} /></button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleMoveImage(img.id, 1); }}
                                                        disabled={index >= galleryImages.length - 1}
                                                        className="p-1 bg-white/20 hover:bg-white/40 active:bg-white/50 disabled:opacity-20 text-white rounded-full backdrop-blur-md border border-white/20 transition-colors"
                                                    ><ChevronRight size={16} strokeWidth={2.5} /></button>
                                                </div>
                                            )}

                                            {/* Labels */}
                                            {isMain && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-primary text-primary-foreground text-[9px] font-medium rounded-md shadow-lg">封面</div>
                                            )}
                                            {isVideo && (
                                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-[9px] font-medium rounded-md shadow-lg tracking-tighter">视频</div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Add Photo Button */}
                                {!isBatchMode && (
                                    <div className="h-full">
                                        <label
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                            className={cn(
                                                "aspect-square h-full w-full rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 group relative overflow-hidden active:scale-95 cursor-pointer px-3",
                                                isDraggingOver
                                                    ? "border-primary bg-primary/10 shadow-lg scale-[1.02]"
                                                    : "border-border hover:border-primary/40 hover:bg-primary/5 hover:shadow-inner"
                                            )}
                                        >
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*,video/*"
                                                multiple
                                                onChange={(e) => handleFileUpload(e)}
                                                disabled={!!isUploading}
                                            />
                                            <div className={cn(
                                                "p-2.5 md:p-3 rounded-full transition-colors",
                                                isDraggingOver ? "bg-primary/20" : "bg-muted group-hover:bg-primary/10"
                                            )}>
                                            <Plus size={24} className={cn(
                                                    "transition-all duration-300",
                                                    isDraggingOver ? "text-primary scale-110" : "text-muted-foreground group-hover:text-primary group-hover:rotate-90",
                                                    isUploading && "animate-spin"
                                                )} />
                                            </div>
                                            <span className={cn(
                                                "text-[10px] leading-relaxed font-medium tracking-tight text-center px-2 transition-colors",
                                                isDraggingOver ? "text-primary font-bold" : "text-muted-foreground group-hover:text-primary"
                                            )}>
                                                {isUploading ? `${isUploading}` : (isDraggingOver ? "松开即可上传" : "添加或拖入实拍")}
                                            </span>
                                            {isDraggingOver && (
                                                <div className="absolute inset-0 pointer-events-none border-2 border-primary rounded-2xl animate-pulse" />
                                            )}
                                        </label>
                                    </div>
                                )}
                        </div>
                    </div>

                <div className="flex flex-row justify-end items-center gap-3 sm:gap-4 border-t border-white/10 p-4 sm:p-8 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 sm:flex-none rounded-full px-6 py-2.5 text-sm font-medium text-muted-foreground border border-border hover:text-foreground hover:bg-secondary/50 transition-all active:scale-[0.97]"
                    >
                        取消
                    </button>
                    <button
                        type="submit"
                        className="flex-1 sm:flex-none group flex items-center justify-center gap-2 rounded-full bg-primary px-8 sm:px-10 py-3 text-sm font-bold text-primary-foreground shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.5)] transition-all duration-300 hover:bg-primary/90 hover:shadow-[0_12px_24px_-4px_rgba(var(--primary-rgb),0.6)] hover:-translate-y-0.5 active:scale-[0.97]"
                    >
                        <CheckCircle size={18} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" />
                        <span>保存数据</span>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-100000 flex items-center justify-center p-4 overflow-hidden touch-none"
            onWheel={handleWheel}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div
              className="fixed inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => setSelectedPreviewImage(null)}
            />
            
            <div className="relative w-full max-w-5xl h-[85dvh] flex items-center justify-center pointer-events-none">
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

              <AnimatePresence initial={false} custom={previewDirection}>
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
                                className="max-w-full max-h-[85dvh] object-contain rounded-2xl shadow-2xl"
                                controls
                                ref={videoPreviewRef}
                            />

                    ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img 
                            src={selectedPreviewImage.url} 
                            alt="预览" 
                            className="max-w-full max-h-[85dvh] object-contain rounded-2xl shadow-2xl"
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
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
